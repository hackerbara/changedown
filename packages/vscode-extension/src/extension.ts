import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ExtensionController } from './controller';
import { createLanguageClient, setDecorationDataHandler, setViewModeChangedHandler, setDocumentStateHandler, setPromotionStartHandler, setPromotionCompleteHandler, setCoherenceHandler, clearStatusBarDocument } from './lsp-client';
import { LanguageClient } from 'vscode-languageclient/node';
import { annotateFromGit } from './annotate-command';
import { MoveCodeLensProvider } from './move-code-lens';
import { ReviewPanelProvider } from './review-panel';
import { SettingsPanelProvider } from './settings-panel';
import { ProjectStatusModel } from './project-status';
import { registerHoverProvider } from './hover-provider';
import { ResolvedContentProvider, RESOLVED_SCHEME, toResolvedUri, GitOriginalContentProvider, GIT_ORIGINAL_SCHEME } from './resolved-content-provider';
import { ChangetracksSCM } from './changetracks-scm';
import { CurrentDocumentService } from './current-document-service';
import { ChangeComments } from './change-comments';
import { ChangeTimelineProvider } from './change-timeline';
import type { PendingOverlay } from '@changetracks/core';
import type { ViewMode } from './view-mode';
import { SIDECAR_BLOCK_MARKER } from '@changetracks/core';
import { changetracksPlugin } from './preview/plugin';
import { setOutputChannel } from './output-channel';
import { registerChangeCommands, registerScmCommands, registerCommentCommands, registerTestCommands, registerSetupCommands, type ChangeCommandsContext } from './commands';
import { DocxEditorProvider } from './docx/docx-editor-provider';
import { ChangeTracksFoldingProvider } from './folding-provider';
import { ProjectedView } from './projected-view';
import { GitGutterManager, GUTTER_STRATEGY } from './git-gutter-manager';
import type { GutterStrategy } from './git-gutter-manager';

let controller: ExtensionController;
let scmInstance: ChangetracksSCM | null = null;
let changeComments: ChangeComments | { getChangeIdForThread: () => undefined };
let client: LanguageClient;
// P1-19: Removed duplicate statusBarItem — StatusBarManager in lsp-client.ts handles it
let statusModel: ProjectStatusModel;
let gutterManager: GitGutterManager | null = null;

// Output channel for error logging
export let outputChannel: vscode.OutputChannel;

// Per-instance temp file path for test bridge. Uses CHANGETRACKS_TEST_INSTANCE_ID
// env var (set by Playwright harness) to prevent cross-instance contamination.
function testDocPath(): string {
    const id = process.env.CHANGETRACKS_TEST_INSTANCE_ID;
    const suffix = id ? `-${id}` : '';
    return path.join(os.tmpdir(), `changetracks-test-doc${suffix}.json`);
}

export async function activate(context: vscode.ExtensionContext) {
    // Create output channel for error logging
    outputChannel = vscode.window.createOutputChannel('ChangeTracks');
    setOutputChannel(outputChannel);
    context.subscriptions.push(outputChannel);

    const isDevMode = context.extensionMode === vscode.ExtensionMode.Development;

    // Log activation context for debugging initialization issues
    outputChannel.appendLine(`[activate] ChangeTracks activating (v${context.extension.packageJSON.version})`);
    outputChannel.appendLine(`[activate] activeTextEditor: ${vscode.window.activeTextEditor?.document.uri.fsPath ?? 'none'}`);
    outputChannel.appendLine(`[activate] visibleTextEditors: ${vscode.window.visibleTextEditors.length}`);
    outputChannel.appendLine(`[activate] workspaceFolders: ${vscode.workspace.workspaceFolders?.length ?? 0}`);
    outputChannel.appendLine(`[activate] textDocuments: ${vscode.workspace.textDocuments.length}`);

    // --- First-install / upgrade detection (deferred, never blocks activation) ---
    setTimeout(() => {
        try {
            const VERSION_KEY = 'changetracks.version';
            const currentVersion: string = context.extension.packageJSON.version;
            const previousVersion = context.globalState.get<string>(VERSION_KEY);
            const walkthroughMode = vscode.workspace.getConfiguration('changetracks').get<string>('showWalkthroughOnStartup') || 'firstInstall';
            const walkthroughId = `${context.extension.id}#changetracks.getStarted`;

            if (walkthroughMode === 'always') {
                vscode.commands.executeCommand('workbench.action.openWalkthrough', walkthroughId, false);
            } else if (walkthroughMode !== 'never') {
                if (previousVersion === undefined) {
                    vscode.commands.executeCommand('workbench.action.openWalkthrough', walkthroughId, false);
                } else if (currentVersion !== previousVersion) {
                    void vscode.window.showInformationMessage(
                        `ChangeTracks updated to v${currentVersion}.`,
                        'Open Walkthrough'
                    ).then(action => {
                        if (action === 'Open Walkthrough') {
                            vscode.commands.executeCommand('workbench.action.openWalkthrough', walkthroughId, false);
                        }
                    });
                }
            }

            context.globalState.update(VERSION_KEY, currentVersion);
        } catch (e) {
            outputChannel.appendLine(`Walkthrough check failed: ${e}`);
        }
    }, 2000);

    // Initialize xxhash-wasm before creating the controller — the FootnoteNativeParser
    // calls computeLineHash synchronously during parsing. Without this, opening an L3
    // document at startup crashes with "xxhash-wasm not initialized".
    const { initHashline } = await import('@changetracks/core');
    await initHashline();

    // Create controller first so decorationDataHandler is wired before LSP sync.
    // If handler is set after client.start(), we can miss decorationData sent during sync.
    controller = new ExtensionController(context);

    // Recover any orphaned swap files from a previous crash while in projected view
    ProjectedView.recoverCrashBackups();

    // Register folding provider for hidden deletion regions in Simple mode
    const foldingProvider = new ChangeTracksFoldingProvider();
    context.subscriptions.push(
        vscode.languages.registerFoldingRangeProvider(
            { language: 'markdown' },
            foldingProvider
        )
    );
    controller.setFoldingProvider(foldingProvider);

    // Wire LSP decoration data to controller refresh (fixes LSP push never triggering refresh)
    setDecorationDataHandler((uri, changes) => {
        controller.handleDecorationDataUpdate(uri, changes);
        if (isDevMode) {
            // Test bridge: signal that decorationData has arrived for this URI.
            // Enables Playwright tests to poll for LSP readiness without command palette overhead.
            try {
                const signalPath = path.join(os.tmpdir(), 'changetracks-test-decoration-ready.json');
                fs.writeFileSync(signalPath, JSON.stringify({ uri, changeCount: changes.length, timestamp: Date.now() }));
            } catch { /* non-critical */ }
        }
    });

    // Wire LSP view mode confirmation — log for diagnostics (controller owns the source of truth)
    // Skip comment:// URIs to avoid O(N) log spam from comment thread input documents
    setViewModeChangedHandler((uri, viewMode) => {
        if (!uri.startsWith('comment://')) {
            outputChannel.appendLine(`[LSP] viewModeChanged: ${viewMode} for ${uri}`);
        }
    });

    // Wire LSP documentState to controller
    setDocumentStateHandler((uri, params) => {
        controller.setDocumentState(uri, params);
    });

    // Wire LSP promotion lifecycle to controller
    setPromotionStartHandler((uri) => {
        controller.handlePromotionStarting(uri);
    });
    setPromotionCompleteHandler((uri) => {
        controller.handlePromotionComplete(uri);
    });

    // Wire LSP coherence status to controller
    setCoherenceHandler((uri, rate, unresolvedCount, threshold) => {
        controller.updateCoherence(uri, rate, unresolvedCount, threshold);
    });

    // Wire document-close cleanup so StatusBarManager doesn't leak per-document state
    controller.setStatusBarCleaner(clearStatusBarDocument);

    // Start LSP client — fire-and-forget, do not block extension host
    client = createLanguageClient(context);
    client.start().then(() => {
        if (!controller) return; // Extension already deactivated
        // LSP ready — wire overlay sender and getChanges client
        controller.setOverlaySender((uri: string, overlay: PendingOverlay | null) => {
            if (client?.isRunning?.()) {
                client.sendNotification('changetracks/pendingOverlay', { uri, overlay });
            }
        });
        // Wire view mode sender: controller sends changetracks/setViewMode to LSP on mode change
        controller.setViewModeSender((uri: string, viewMode: ViewMode) => {
            if (client?.isRunning?.()) {
                client.sendNotification('changetracks/setViewMode', {
                    textDocument: { uri },
                    viewMode,
                });
            }
        });
        controller.setLspClient(client);
        controller.setCursorPositionSender((uri: string, line: number, changeId?: string) => {
            if (client?.isRunning?.()) {
                client.sendNotification('changetracks/cursorPosition', {
                    textDocument: { uri },
                    line,
                    changeId,
                });
            }
        });
        const initialMode = vscode.workspace.getConfiguration('changetracks').get<string>('codeLensMode', 'cursor');
        client.sendNotification('changetracks/setCodeLensMode', { mode: initialMode });
        // Wire batch edit sender for save/projected-view coordination
        controller.setBatchEditSender((action, uri) => {
            if (client?.isRunning?.()) {
                const method = action === 'start'
                    ? 'changetracks/batchEditStart'
                    : 'changetracks/batchEditEnd';
                client.sendNotification(method, { uri });
            }
        });
        outputChannel.appendLine('[activate] LSP client connected');
    }).catch(err => {
        outputChannel.appendLine(`[activate] LSP start failed: ${err?.message ?? err}`);
        // Degraded mode: commands work, decorations arrive when LSP connects
    });

    // Wire codeLensMode config watcher: send changetracks/setCodeLensMode to LSP on change
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('changetracks.codeLensMode')) {
                const mode = vscode.workspace.getConfiguration('changetracks').get<string>('codeLensMode', 'cursor');
                if (client?.isRunning?.()) {
                    client.sendNotification('changetracks/setCodeLensMode', { mode });
                }
            }
        })
    );

    // Hover provider: show comment/reason when hovering over changes
    registerHoverProvider(context, controller);

    // Project Status Model (shared state for both panels)
    statusModel = new ProjectStatusModel();
    context.subscriptions.push(statusModel);

    // Config file watching
    const configPattern = new vscode.RelativePattern(
        vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('.'),
        '.changetracks/config.toml'
    );
    const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);

    const loadConfigFromDisk = async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return;
        const configPath = vscode.Uri.joinPath(folders[0].uri, '.changetracks', 'config.toml');
        try {
            const content = await vscode.workspace.fs.readFile(configPath);
            statusModel.updateFromToml(new TextDecoder().decode(content));
        } catch {
            // No config file — use defaults
        }
    };

    context.subscriptions.push(
        configWatcher,
        configWatcher.onDidChange(loadConfigFromDisk),
        configWatcher.onDidCreate(loadConfigFromDisk),
        configWatcher.onDidDelete(() => statusModel.updateFromToml(''))
    );

    // Initial config load
    loadConfigFromDisk();

    // Single source for current document (Phase 3: CurrentDocumentService)
    const currentDocumentService = new CurrentDocumentService();

    // Review Panel (WebviewView — replaces old TreeView changes panel)
    const reviewPanelProvider = new ReviewPanelProvider({
        getChanges: () => {
            const doc = currentDocumentService.getCurrentDocument();
            return doc ? controller.getChangesForDocument(doc) : [];
        },
        getDocumentText: () => currentDocumentService.getCurrentDocument()?.getText() ?? '',
        get trackingMode() { return controller.trackingMode; },
        get viewMode() { return controller.viewMode; },
        onDidChangeChanges: (listener) => controller.onDidChangeChanges(listener),
    });
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('changetracksReview', reviewPanelProvider),
        reviewPanelProvider
    );

    // Wire cursor-in-change updates to review panel
    context.subscriptions.push(
        controller.onDidChangeCursorChange((changeId: string | null) => {
            reviewPanelProvider.setActiveChangeId(changeId);
        })
    );

    // Settings Panel (WebviewView)
    const settingsPanelProvider = new SettingsPanelProvider(statusModel);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('changetracksSettings', settingsPanelProvider),
        settingsPanelProvider
    );

    // Wire settings panel save-to-disk
    context.subscriptions.push(
        settingsPanelProvider.onDidRequestSave(async (toml: string) => {
            const folders = vscode.workspace.workspaceFolders;
            if (!folders) {
                settingsPanelProvider.postMessageToWebview({ type: 'saveResult', success: false });
                return;
            }
            const dirUri = vscode.Uri.joinPath(folders[0].uri, '.changetracks');
            const fileUri = vscode.Uri.joinPath(dirUri, 'config.toml');
            try {
                try {
                    await vscode.workspace.fs.createDirectory(dirUri);
                } catch {
                    // Directory exists — ignore
                }
                await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(toml));
                settingsPanelProvider.postMessageToWebview({ type: 'saveResult', success: true });
                vscode.window.showInformationMessage('ChangeTracks settings saved.');
            } catch (err: any) {
                settingsPanelProvider.postMessageToWebview({ type: 'saveResult', success: false });
                vscode.window.showErrorMessage(`Failed to save settings: ${err.message}`);
            }
        })
    );

    // Resolved content provider (for diff and SCM)
    const resolvedProvider = new ResolvedContentProvider();
    const gitOriginalProvider = new GitOriginalContentProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(RESOLVED_SCHEME, resolvedProvider),
        vscode.workspace.registerTextDocumentContentProvider(GIT_ORIGINAL_SCHEME, gitOriginalProvider),
        resolvedProvider
    );

    // Notify resolved provider when changes update (per-URI: fixes non-active-tab diff stale)
    context.subscriptions.push(
        controller.onDidChangeChanges((uris) => {
            for (const uri of uris) {
                resolvedProvider.notifyChange(toResolvedUri(uri));
            }
        })
    );

    // Git gutter management: silence Git's QuickDiff for markdown files with changes
    const gutterStrategy = vscode.workspace.getConfiguration('changetracks').get<GutterStrategy>('gutterStrategy', GUTTER_STRATEGY.AUTO);
    const gm = new GitGutterManager(outputChannel);
    gm.setWarningShown(context.workspaceState.get<boolean>('changetracks.gutterWarningShown', false));

    // SCM provider (gutter diff integration + resource list when not legacy)
    // Create SCM AFTER gutter manager — SCM wires index→flag sync internally
    // Wrapped in try/catch: SCM constructor runs async workspace scans and file
    // watchers that can fail in restricted environments. A SCM crash must NOT
    // prevent decorations, panels, or commands from working.
    let scm: ChangetracksSCM | null = null;
    try {
        scm = new ChangetracksSCM(context, () => controller, gm, gutterStrategy);
        scmInstance = scm;
        context.subscriptions.push(scm);
    } catch (err: any) {
        outputChannel.appendLine(`[activate] SCM provider failed to initialize: ${err.message}\n${err.stack}`);
    }

    // Start gutter manager (git subscriptions) only if Strategy A is needed
    const proposedApiActive = scm?.isUsingProposedQuickDiff?.() ?? false;
    if (gutterStrategy !== GUTTER_STRATEGY.OFF && !(gutterStrategy === GUTTER_STRATEGY.AUTO && proposedApiActive)) {
        gm.start();
        gutterManager = gm;
        context.subscriptions.push(gm);

        // Suppress git's QuickDiff gutter if the user setting allows it.
        const suppressEnabled = vscode.workspace.getConfiguration('changetracks').get<boolean>('suppressGitGutter', true);
        if (suppressEnabled) {
            suppressGitQuickDiff(outputChannel, context);
        } else {
            // Still register the toggle command even when suppression is off
            registerGitGutterToggle(outputChannel, context);
        }
    } else {
        // Strategy A not needed — disable gm so SCM's syncGutterFlags calls are no-ops
        gm.setEnabled(false);
    }

    // Persist warning state across VS Code restarts
    context.subscriptions.push({
        dispose: () => {
            context.workspaceState.update('changetracks.gutterWarningShown', gm.wasWarningShown());
        }
    });

    // Config change listeners
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('changetracks.gutterStrategy')) {
                const strategy = vscode.workspace.getConfiguration('changetracks').get<GutterStrategy>('gutterStrategy', GUTTER_STRATEGY.AUTO);
                const shouldEnable = strategy !== GUTTER_STRATEGY.OFF && strategy !== GUTTER_STRATEGY.PROPOSED_API;
                gutterManager?.setEnabled(shouldEnable);
            }
        })
    );
    watchSuppressGitGutterSetting(outputChannel, context);

    registerScmCommands(context, controller, () => scmInstance);

    // Comment API (gutter icons + threaded discussions)
    // Wrapped in try/catch: ChangeComments constructor creates a CommentController
    // and subscribes to multiple events. A failure here must NOT prevent the rest.
    try {
        changeComments = new ChangeComments(controller, () => vscode.window.activeTextEditor?.document, () => controller.viewMode);
        context.subscriptions.push(changeComments);
        controller.setChangeComments(changeComments);
    } catch (err: any) {
        outputChannel.appendLine(`[activate] ChangeComments failed to initialize: ${err.message}\n${err.stack}`);
        changeComments = { getChangeIdForThread: () => undefined, expandThreadForChangeId: () => undefined };
    }

    // Timeline provider (change events in Explorer)
    // Timeline API is proposed — guard against missing API in stable VS Code
    const timelineProvider = new ChangeTimelineProvider(controller);
    try {
        if (typeof vscode.workspace.registerTimelineProvider === 'function') {
            context.subscriptions.push(
                vscode.workspace.registerTimelineProvider('file', timelineProvider),
                timelineProvider
            );
        }
    } catch {
        // Timeline API not available in this VS Code version — skip silently
    }

    // Command modules (Phase 4)
    registerChangeCommands(context, controller, statusModel, changeComments as ChangeCommandsContext);
    registerCommentCommands(context, controller, changeComments);
    if (isDevMode) {
        registerTestCommands(context, controller, () => client, changeComments as any);
    }
    registerSetupCommands(context);

    if (isDevMode) {
        context.subscriptions.push(
            // Test-only: keep cursor position in sync on every selection change.
            // Enables Playwright tests to read cursor line without command palette.
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.textEditor.document.languageId === 'markdown') {
                    const statePath = path.join(os.tmpdir(), 'changetracks-test-cursor.json');
                    fs.writeFileSync(statePath, JSON.stringify({
                        line: e.selections[0].active.line + 1, // 1-based
                        timestamp: Date.now(),
                    }));
                }
            }),

            // Test-only: keep per-instance temp file in sync with document text on
            // every change. Uses testDocPath() for cross-instance isolation.
            vscode.workspace.onDidChangeTextDocument((e) => {
                // Don't check activeTextEditor — it can be temporarily undefined
                // or wrong after command palette interactions in Playwright tests.
                if (e.document.languageId === 'markdown' &&
                    e.document.uri.scheme === 'file') {
                    fs.writeFileSync(testDocPath(), JSON.stringify({
                        text: e.document.getText(),
                        uri: e.document.uri.toString(),
                        timestamp: Date.now(),
                    }));
                }
            }),

            // Also write on active editor change (file open/switch)
            vscode.window.onDidChangeActiveTextEditor(async (editor) => {
                if (editor?.document.languageId === 'markdown') {
                    fs.writeFileSync(testDocPath(), JSON.stringify({
                        text: editor.document.getText(),
                        uri: editor.document.uri.toString(),
                        timestamp: Date.now(),
                    }));
                }
            }),
        );
    }

    context.subscriptions.push(
        // CodeLens provider for move operations (shows "Go to destination" / "Go to source")
        vscode.languages.registerCodeLensProvider(
            { language: 'markdown' },
            new MoveCodeLensProvider(controller.getChangesForDocument.bind(controller))
        ),

        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!editor) return;

            // Auto-annotate from git (existing logic)
            const config = vscode.workspace.getConfiguration('changetracks');
            if (!config.get<boolean>('annotateOnOpen', false)) return;

            // Only process real files
            if (editor.document.uri.scheme !== 'file') return;

            const text = editor.document.getText();
            // Skip if already annotated
            if (text.includes(SIDECAR_BLOCK_MARKER) || text.includes('{++') || text.includes('{--')) return;

            await annotateFromGit(editor);
        }),
        controller
    );

    // Migrate per-document state when files are renamed
    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles((event) => {
            for (const { oldUri, newUri } of event.files) {
                controller.handleFileRename(oldUri.toString(), newUri.toString());
                if (gutterManager && oldUri.path.endsWith('.md')) {
                    gutterManager.handleFileRenamed(oldUri.toString(), newUri.toString());
                }
            }
        })
    );

    // DOCX custom editor: "Open With..." → ChangeTracks DOCX Editor
    context.subscriptions.push(DocxEditorProvider.register(context));

    // Export to DOCX command (editor title button + side panel button)
    context.subscriptions.push(
        vscode.commands.registerCommand('changetracks.exportToDocx', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') {
                vscode.window.showWarningMessage('Open a markdown file to export to DOCX.');
                return;
            }

            const mdPath = editor.document.uri.fsPath;
            const defaultDocxPath = mdPath.replace(/-changetracks\.md$/i, '.docx').replace(/\.md$/i, '.docx');
            const defaultUri = vscode.Uri.file(defaultDocxPath);

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: { 'Word Document': ['docx'] },
                title: 'Export to DOCX',
            });
            if (!saveUri) return;

            try {
                const markdown = editor.document.getText();
                const { exportDocx } = await import('@changetracks/docx');

                // Derive media folder from the markdown file path.
                // Convention: foo-changetracks.md → foo_media/, or foo.md → foo_media/
                const mdDir = path.dirname(mdPath);
                const docxBasename = path.basename(mdPath)
                    .replace(/-changetracks\.md$/i, '')
                    .replace(/\.md$/i, '');
                const mediaDir = path.join(mdDir, `${docxBasename}_media`);
                const hasMedia = fs.existsSync(mediaDir);

                const { buffer, stats } = await exportDocx(markdown, {
                    mediaDir: hasMedia ? mediaDir : undefined,
                });

                await vscode.workspace.fs.writeFile(saveUri, new Uint8Array(buffer));
                vscode.window.showInformationMessage(
                    `Exported ${stats.insertions} ins, ${stats.deletions} del, ${stats.substitutions} sub to ${path.basename(saveUri.fsPath)}`
                );
            } catch (err: any) {
                vscode.window.showErrorMessage(`DOCX export failed: ${err.message}`);
            }
        })
    );

    // Test-only: write initial active editor content to per-instance temp file.
    // The onDidChangeActiveTextEditor listener misses the initial file load
    // because VS Code sets the active editor BEFORE the extension activates.
    if (isDevMode) {
        const initialEditor = vscode.window.activeTextEditor;
        if (initialEditor?.document.languageId === 'markdown') {
            fs.writeFileSync(testDocPath(), JSON.stringify({
                text: initialEditor.document.getText(),
                uri: initialEditor.document.uri.toString(),
                timestamp: Date.now(),
            }));
        }
    }

    // Markdown preview: register CriticMarkup rendering plugin
    return {
        extendMarkdownIt(md: any) {
            return md.use(changetracksPlugin);
        }
    };
}

// ── Git QuickDiff suppression ───────────────────────────────────────────────

const SCM_DIFF_SETTING = 'scm.diffDecorations';
const ORIGINAL_SETTING_KEY = 'changetracks.originalDiffDecorations';

/**
 * Suppress git's QuickDiff gutter by setting scm.diffDecorations to "none".
 * Saves the user's original value so it can be restored via toggle command.
 * ChangeTracks' own decorations (via createTextEditorDecorationType) are unaffected.
 */
function suppressGitQuickDiff(output: vscode.OutputChannel, context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration();
    const current = config.get<string>(SCM_DIFF_SETTING, 'all');

    // Save original value if we haven't already
    if (context.workspaceState.get<string>(ORIGINAL_SETTING_KEY) === undefined) {
        context.workspaceState.update(ORIGINAL_SETTING_KEY, current);
    }

    if (current !== 'none') {
        config.update(SCM_DIFF_SETTING, 'none', vscode.ConfigurationTarget.Workspace);
        output.appendLine(`[gutter] suppressed git QuickDiff (scm.diffDecorations: "${current}" → "none")`);
    }

    registerGitGutterToggle(output, context);
}

/** Register the toggle command (used whether suppression is on or off). */
function registerGitGutterToggle(output: vscode.OutputChannel, context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('changetracks.toggleGitGutter', () => {
            const cfg = vscode.workspace.getConfiguration();
            const val = cfg.get<string>(SCM_DIFF_SETTING, 'all');
            if (val === 'none') {
                const original = context.workspaceState.get<string>(ORIGINAL_SETTING_KEY, 'all');
                cfg.update(SCM_DIFF_SETTING, original, vscode.ConfigurationTarget.Workspace);
                output.appendLine(`[gutter] restored git QuickDiff (scm.diffDecorations: "${original}")`);
                vscode.window.showInformationMessage(`Git gutter restored (scm.diffDecorations: "${original}").`);
            } else {
                context.workspaceState.update(ORIGINAL_SETTING_KEY, val);
                cfg.update(SCM_DIFF_SETTING, 'none', vscode.ConfigurationTarget.Workspace);
                output.appendLine('[gutter] suppressed git QuickDiff');
                vscode.window.showInformationMessage('Git gutter suppressed. ChangeTracks decorations still active.');
            }
        })
    );
}

/** React to changetracks.suppressGitGutter setting changes at runtime. */
function watchSuppressGitGutterSetting(output: vscode.OutputChannel, context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration('changetracks.suppressGitGutter')) return;
            const enabled = vscode.workspace.getConfiguration('changetracks').get<boolean>('suppressGitGutter', true);
            const cfg = vscode.workspace.getConfiguration();
            if (enabled) {
                const current = cfg.get<string>(SCM_DIFF_SETTING, 'all');
                if (current !== 'none') {
                    context.workspaceState.update(ORIGINAL_SETTING_KEY, current);
                    cfg.update(SCM_DIFF_SETTING, 'none', vscode.ConfigurationTarget.Workspace);
                    output.appendLine('[gutter] suppressGitGutter enabled — suppressed git QuickDiff');
                }
            } else {
                const original = context.workspaceState.get<string>(ORIGINAL_SETTING_KEY, 'all');
                cfg.update(SCM_DIFF_SETTING, original, vscode.ConfigurationTarget.Workspace);
                output.appendLine(`[gutter] suppressGitGutter disabled — restored git QuickDiff ("${original}")`);
            }
        })
    );
}

export async function deactivate() {
    // Clear assume-unchanged flags before shutdown.
    // Disable first to prevent racing syncFlags from re-setting flags.
    if (gutterManager) {
        gutterManager.setEnabled(false);
        await gutterManager.clearAllFlags();
        gutterManager = null;
    }
    setDecorationDataHandler(null);
    setViewModeChangedHandler(null);
    setDocumentStateHandler(null);
    setPromotionStartHandler(null);
    setPromotionCompleteHandler(null);
    setCoherenceHandler(null);
    if (controller) {
        controller.dispose();
        controller = null!;
    }
    if (client) {
        await client.stop();
        client = null!;
    }
    scmInstance = null;
}