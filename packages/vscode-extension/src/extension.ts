import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ExtensionController } from './controller';
import { createLanguageClient, setDecorationDataHandler, setViewModeChangedHandler, setDocumentStateHandler } from './lsp-client';
import { LanguageClient } from 'vscode-languageclient/node';
import { annotateFromGit } from './annotate-command';
import { MoveCodeLensProvider } from './move-code-lens';
import { AcceptRejectCodeLensProvider } from './accept-reject-code-lens';
import { ReviewPanelProvider } from './review-panel';
import { SettingsPanelProvider } from './settings-panel';
import { ProjectStatusModel } from './project-status';
import { registerHoverProvider } from './hover-provider';
import { ResolvedContentProvider, RESOLVED_SCHEME, toResolvedUri } from './resolved-content-provider';
import { ChangetracksSCM } from './changetracks-scm';
import { CurrentDocumentService } from './current-document-service';
import { ChangeComments } from './change-comments';
import { ChangeTimelineProvider } from './change-timeline';
import type { PendingOverlay } from '@changetracks/core';
import type { ViewMode } from './view-mode';
import { SIDECAR_BLOCK_MARKER } from '@changetracks/core';
import { changetracksPlugin } from './preview/plugin';
import { setOutputChannel } from './output-channel';
import { registerChangeCommands, registerScmCommands, registerCommentCommands, registerTestCommands, registerSetupCommands } from './commands';
import { DocxEditorProvider } from './docx/docx-editor-provider';

let controller: ExtensionController;
let scmInstance: ChangetracksSCM | null = null;
let changeComments: ChangeComments | { getChangeIdForThread: () => undefined };
let client: LanguageClient;
// P1-19: Removed duplicate statusBarItem — StatusBarManager in lsp-client.ts handles it
let statusModel: ProjectStatusModel;

// Output channel for error logging
export let outputChannel: vscode.OutputChannel;

// Per-instance temp file path for test bridge. Uses CHANGETRACKS_TEST_INSTANCE_ID
// env var (set by Playwright harness) to prevent cross-instance contamination.
function testDocPath(): string {
    const id = process.env.CHANGETRACKS_TEST_INSTANCE_ID;
    const suffix = id ? `-${id}` : '';
    return path.join(os.tmpdir(), `changetracks-test-doc${suffix}.json`);
}

export function activate(context: vscode.ExtensionContext) {
    // Create output channel for error logging
    outputChannel = vscode.window.createOutputChannel('ChangeTracks');
    setOutputChannel(outputChannel);
    context.subscriptions.push(outputChannel);

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

    // Section 11: Create controller first so decorationDataHandler is wired before LSP sync.
    // If handler is set after client.start(), we can miss decorationData sent during sync.
    controller = new ExtensionController(context);

    // Wire LSP decoration data to controller refresh (fixes LSP push never triggering refresh)
    setDecorationDataHandler((uri, changes) => {
        controller.handleDecorationDataUpdate(uri, changes);
        // Test bridge: signal that decorationData has arrived for this URI.
        // Enables Playwright tests to poll for LSP readiness without command palette overhead.
        try {
            const signalPath = path.join(os.tmpdir(), 'changetracks-test-decoration-ready.json');
            fs.writeFileSync(signalPath, JSON.stringify({ uri, changeCount: changes.length, timestamp: Date.now() }));
        } catch { /* non-critical */ }
    });

    // Wire LSP view mode confirmation — log for diagnostics (controller owns the source of truth)
    setViewModeChangedHandler((uri, viewMode) => {
        outputChannel.appendLine(`[LSP] viewModeChanged: ${viewMode} for ${uri}`);
    });

    // Wire LSP documentState to controller
    setDocumentStateHandler((uri, params) => {
        controller.setDocumentState(uri, params);
    });

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
        controller.setGetChangesClient(client);
        outputChannel.appendLine('[activate] LSP client connected');
    }).catch(err => {
        outputChannel.appendLine(`[activate] LSP start failed: ${err?.message ?? err}`);
        // Degraded mode: commands work, decorations arrive when LSP connects
    });

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
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(RESOLVED_SCHEME, resolvedProvider),
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

    // SCM provider (gutter diff integration + resource list when not legacy)
    // Wrapped in try/catch: SCM constructor runs async workspace scans and file
    // watchers that can fail in restricted environments. A SCM crash must NOT
    // prevent decorations, panels, or commands from working.
    let scm: ChangetracksSCM | null = null;
    try {
        scm = new ChangetracksSCM(context, () => controller);
        scmInstance = scm;
        context.subscriptions.push(scm);
    } catch (err: any) {
        outputChannel.appendLine(`[activate] SCM provider failed to initialize: ${err.message}\n${err.stack}`);
    }
    registerScmCommands(context, controller, () => scmInstance);

    // Comment API (gutter icons + threaded discussions)
    // Wrapped in try/catch: ChangeComments constructor creates a CommentController
    // and subscribes to multiple events. A failure here must NOT prevent the rest.
    try {
        changeComments = new ChangeComments(controller, () => vscode.window.activeTextEditor?.document);
        context.subscriptions.push(changeComments);
        controller.setChangeComments(changeComments);
    } catch (err: any) {
        outputChannel.appendLine(`[activate] ChangeComments failed to initialize: ${err.message}\n${err.stack}`);
        changeComments = { getChangeIdForThread: () => undefined };
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
    registerChangeCommands(context, controller, statusModel);
    registerCommentCommands(context, controller, changeComments);
    registerTestCommands(context, controller, () => client);
    registerSetupCommands(context);

    context.subscriptions.push(
        // CodeLens provider for move operations (shows "Go to destination" / "Go to source")
        vscode.languages.registerCodeLensProvider(
            { language: 'markdown' },
            new MoveCodeLensProvider(controller.getChangesForDocument.bind(controller))
        ),
        // CodeLens provider for Accept/Reject on every change
        vscode.languages.registerCodeLensProvider(
            { language: 'markdown' },
            new AcceptRejectCodeLensProvider(controller.getChangesForDocument.bind(controller))
        ),

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
                const { buffer, stats } = await exportDocx(markdown);

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
    const initialEditor = vscode.window.activeTextEditor;
    if (initialEditor?.document.languageId === 'markdown') {
        fs.writeFileSync(testDocPath(), JSON.stringify({
            text: initialEditor.document.getText(),
            uri: initialEditor.document.uri.toString(),
            timestamp: Date.now(),
        }));
    }

    // Markdown preview: register CriticMarkup rendering plugin
    return {
        extendMarkdownIt(md: any) {
            return md.use(changetracksPlugin);
        }
    };
}

export async function deactivate() {
    setDecorationDataHandler(null);
    setViewModeChangedHandler(null);
    setDocumentStateHandler(null);
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