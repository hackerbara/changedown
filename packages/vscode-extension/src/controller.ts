import * as vscode from 'vscode';
import type { PendingOverlay } from '@changedown/core';
import { Workspace, VirtualDocument, ChangeNode, scanMaxCnId, findFootnoteBlock, tryFindUniqueMatch, splitBodyAndFootnotes, parseContextualEditOp, isGhostNode, computeLineHash, FOOTNOTE_L3_EDIT_OP, DEFAULT_CONFIG } from '@changedown/core';
import { EditorDecorator } from './decorator';
import { ViewMode, VIEW_MODE_LABELS, resolveViewName } from './view-mode';
import { getCachedDecorationData, invalidateDecorationCache, transformCachedDecorations, getStatusBarCoherence } from './lsp-client';
import type { BatchEditSender } from './lsp-client';
import { CoherenceManager } from './managers/coherence-manager';
import { DecorationScheduler } from './managers/decoration-scheduler';
import { DocumentStateManager } from './managers/document-state-manager';
import { EditTrackingManager } from './managers/edit-tracking-manager';
import { LspBridge } from './managers/lsp-bridge';
import { NavigationManager } from './managers/navigation-manager';
import { ReviewLifecycleManager } from './managers/review-lifecycle-manager';
import { ViewModeManager } from './managers/view-mode-manager';
import { isSupported, setContextKey } from './managers/shared';

import { getOutputChannel } from './output-channel';
import type { ExtDocumentState } from './document-state';

export class ExtensionController {
    private docStateManager: DocumentStateManager;
    private editTracking: EditTrackingManager;
    private localParseHotPath: boolean = false;
    private lastActiveEditorUri: string | undefined;
    private coherenceManager: CoherenceManager;
    private statusBarCleaner: ((uri: string) => void) | null = null;
    private viewModeManager!: ViewModeManager;
    private viewModeStatusBar: vscode.StatusBarItem;
    /** Transition accessor: returns workspace from DocumentStateManager. */
    public get workspace(): Workspace { return this.docStateManager.workspace; }
    private decorator: EditorDecorator;

    /** Fires when the set of changes may have changed. Payload: URIs of affected documents. */
    public get onDidChangeChanges() { return this.docStateManager.onDidChangeChanges; }

    /** Fires when the cursor enters or leaves a change. Payload: change id, or null when cursor is outside all changes. */
    public get onDidChangeCursorChange() { return this.navigationManager.onDidChangeCursorChange; }

    /** Debounce timer: coalesces rapid decoration update requests into one parse + decorate run. */
    private decorationScheduler!: DecorationScheduler;

    /** NavigationManager: owns change navigation, cursor context, cursor snapping. */
    private navigationManager!: NavigationManager;

    /** LspBridge: owns all LSP communication — senders, lifecycle requests, decoration/promotion handlers. */
    private lspBridge: LspBridge;

    /** ReviewLifecycleManager: owns all review/lifecycle command handlers. */
    private reviewLifecycle!: ReviewLifecycleManager;

    /** Delegate: ensure per-document state bag exists. */
    private ensureDocState(uri: string, version: number, text: string): ExtDocumentState {
        return this.docStateManager.ensureDocState(uri, version, text);
    }

    /** Delegate: get VirtualDocument for a URI (merges LSP cache + pending nodes). */
    private getVirtualDocumentFor(uri: string, text: string, languageId?: string, parseFallback?: boolean): VirtualDocument {
        return this.docStateManager.getVirtualDocumentFor(uri, text, languageId, parseFallback);
    }


    constructor(context: vscode.ExtensionContext) {
        this.coherenceManager = new CoherenceManager();

        // DocumentStateManager is created early — EditTrackingManager wiring comes after.
        // getPendingNodes callback uses a closure that's wired once EditTrackingManager is initialized.
        let getPendingNodes: (uri: string) => ChangeNode[] = () => [];
        this.docStateManager = new DocumentStateManager(
            (uri) => getPendingNodes(uri),
            (oldUri) => this.editTracking?.getChangeComments()?.disposeThreadsForUri?.(vscode.Uri.parse(oldUri))
        );

        // Read decoration style and author colors from configuration
        const config0 = vscode.workspace.getConfiguration('changedown');
        const rawStyle = config0.get<string>('decorationStyle', 'foreground');
        const decorationStyle = rawStyle === 'background' ? 'background' : 'foreground';
        const rawAuthorColors = config0.get<string>('authorColors', 'auto');
        const authorColors = (rawAuthorColors === 'always' || rawAuthorColors === 'never') ? rawAuthorColors : 'auto' as const;
        this.decorator = new EditorDecorator(decorationStyle, authorColors);

        // Read default view mode and showDelimiters from configuration.
        // ViewModeManager is created below after LspBridge (needs both).
        const rawViewMode = config0.get<string>('defaultViewMode', 'review');
        const initialViewMode = resolveViewName(rawViewMode) ?? 'review';
        const initialShowDelimiters = config0.get<boolean>('showDelimiters', false);

        // Listen for decoration style / author colors configuration changes
        vscode.workspace.onDidChangeConfiguration(event => {
            try {
                if (event.affectsConfiguration('changedown.decorationStyle') ||
                    event.affectsConfiguration('changedown.authorColors')) {
                    const cfg = vscode.workspace.getConfiguration('changedown');
                    const rawNewStyle = cfg.get<string>('decorationStyle', 'foreground');
                    const newStyle = rawNewStyle === 'background' ? 'background' : 'foreground';
                    const rawNewAuthorColors = cfg.get<string>('authorColors', 'auto');
                    const newAuthorColors = (rawNewAuthorColors === 'always' || rawNewAuthorColors === 'never') ? rawNewAuthorColors : 'auto' as const;
                    const oldDecorator = this.decorator;
                    try {
                        this.decorator = new EditorDecorator(newStyle, newAuthorColors);
                        oldDecorator.dispose();
                    } catch (err: any) {
                        this.decorator = oldDecorator; // restore old, don't dispose
                        getOutputChannel()?.appendLine(`[config] decorator recreation failed: ${err.message}`);
                    }

                    // Re-apply decorations to all visible editors
                    vscode.window.visibleTextEditors.forEach(editor => {
                        if (isSupported(editor.document)) {
                            this.updateDecorations(editor);
                        }
                    });
                }
                if (event.affectsConfiguration('changedown.editBoundary')) {
                    const cfg = vscode.workspace.getConfiguration('changedown');
                    this.editTracking.applyEditBoundaryConfig(cfg);
                }
                if (event.affectsConfiguration('changedown.showDelimiters')) {
                    this.viewModeManager.updateShowDelimiters(
                        vscode.workspace.getConfiguration('changedown').get<boolean>('showDelimiters', false)
                    );
                    vscode.window.visibleTextEditors.forEach(editor => {
                        if (isSupported(editor.document)) {
                            this.updateDecorations(editor);
                        }
                    });
                }
            } catch (err: any) {
                getOutputChannel()?.appendLine(`[onDidChangeConfiguration] ${err.message}\n${err.stack}`);
            }
        }, null, context.subscriptions);

        // LspBridge: owns all LSP communication — senders, lifecycle requests, handlers.
        // Created before EditTrackingManager since it's a dependency.
        this.lspBridge = new LspBridge(
            this.docStateManager,
            (uri) => this.editTracking.getPendingOverlay(uri)
        );

        // EditTrackingManager: owns tracking toggle, edit interception, PendingEditManager,
        // selection-confirmation gate, move operations, IME composition guard.
        this.editTracking = new EditTrackingManager(
            this.docStateManager,
            this.lspBridge,
            {
                getAuthor: (resource?) => this.reviewLifecycle.getAuthor(resource),
                scheduleOverlaySend: () => this.scheduleOverlaySend(),
                sendOverlayNull: (uri) => this.sendOverlayNull(uri),
            },
        );

        // Wire getPendingNodes now that EditTrackingManager is initialized
        getPendingNodes = (uri: string) => this.editTracking.getPendingNodes(uri);

        // Wire onDidChangeDocumentState → controller context keys (via editTracking)
        this.docStateManager.onDidChangeDocumentState(({ uri, state }) => {
            if (uri === vscode.window.activeTextEditor?.document.uri.toString()) {
                const ds = this.docStateManager.getState(uri);
                if (ds?.userTrackingOverride === undefined) {
                    this.editTracking.setTrackingModeRaw(state.tracking.enabled);
                    setContextKey('changedown:trackingEnabled', state.tracking.enabled);
                }
            }
        });

        // ViewModeManager: owns view mode state machine, projected view transitions,
        // delimiter visibility, and folding provider lifecycle.
        this.viewModeManager = new ViewModeManager(
            this.docStateManager,
            this.lspBridge,
            {
                updateDecorations: (editor) => this.updateDecorations(editor),
                scheduleNotifyChanges: (uris?) => this.scheduleNotifyChanges(uris),
                getChangesForDocument: (doc) => this.getChangesForDocument(doc),
                updateStatusBar: () => this.updateStatusBar(),
                setContextKey: (key, value) => setContextKey(key, value),
            },
            initialViewMode,
            initialShowDelimiters,
        );

        // NavigationManager: owns change navigation, cursor context tracking,
        // cursor snapping, and the changeAtCursor context key.
        this.navigationManager = new NavigationManager(
            this.docStateManager,
            this.viewModeManager,
            this.lspBridge,
            () => this.decorator.getHiddenOffsets(),
        );

        // ReviewLifecycleManager: owns all review/lifecycle command handlers.
        // Created last — depends on DocumentStateManager, EditTrackingManager, LspBridge.
        this.reviewLifecycle = new ReviewLifecycleManager(
            this.docStateManager,
            this.editTracking,
            this.lspBridge,
            {
                updateDecorations: (editor) => this.updateDecorations(editor),
            },
        );

        // DecorationScheduler: debounces decoration update requests.
        // performUpdate: runs the actual parse + decorate work.
        // afterUpdate: refreshes cursor context and status bar after scheduled (debounced) updates.
        this.decorationScheduler = new DecorationScheduler({
            performUpdate: (editor) => this.updateDecorations(editor),
            afterUpdate: (editor) => {
                this.navigationManager.updateChangeAtCursorContext(editor);
                this.updateStatusBar();
            },
        });

        // Wire LspBridge events → controller surface refresh
        this.lspBridge.onDidReceiveDecorationData(uri => {
            for (const editor of vscode.window.visibleTextEditors) {
                const editorUri = editor.document.uri.toString();
                if (editorUri === uri && isSupported(editor.document) && !editorUri.includes('commentinput-')) {
                    this.updateDecorations(editor);
                    if (editor === vscode.window.activeTextEditor) {
                        this.navigationManager.updateChangeAtCursorContext(editor);
                        this.updateStatusBar();
                    }
                }
            }
            this.scheduleNotifyChanges([vscode.Uri.parse(uri)]);
        });

        this.lspBridge.onDidCompletePromotion(uri => {
            for (const editor of vscode.window.visibleTextEditors) {
                if (editor.document.uri.toString() === uri && isSupported(editor.document)) {
                    this.updateDecorations(editor);
                    if (editor === vscode.window.activeTextEditor) {
                        this.navigationManager.updateChangeAtCursorContext(editor);
                        this.updateStatusBar();

                        // Scan tracking header from promoted text
                        const promotedText = editor.document.getText();
                        const headerMatch = promotedText.match(
                            /^<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/m
                        );
                        if (headerMatch) {
                            this.editTracking.setTrackingModeRaw(headerMatch[1] === 'tracked');
                            setContextKey('changedown:trackingEnabled', this.editTracking.trackingMode);
                        }

                        // Cache L3 state on document state for cursor-move fast path
                        const isL3 = this.workspace.isFootnoteNative(promotedText);
                        const docState = this.docStateManager.getState(uri);
                        if (docState) docState.isL3 = isL3;

                    }
                }
            }
            this.scheduleNotifyChanges([vscode.Uri.parse(uri)]);
        });

        // Read tracking mode and edit boundary sub-settings from configuration
        const config = vscode.workspace.getConfiguration('changedown');
        this.editTracking.setTrackingModeRaw(config.get<boolean>('trackingMode', false));
        this.editTracking.applyEditBoundaryConfig(config);
        this.localParseHotPath = vscode.workspace.getConfiguration('changedown').get('localParseHotPath', false);

        // Clear decoration scheduler when extension context is disposed
        context.subscriptions.push(this.decorationScheduler);

        // Initialize context keys for UI
        setContextKey('changedown:trackingEnabled', this.editTracking.trackingMode);
        setContextKey('changedown:viewMode', this.viewModeManager.viewMode);

        // Status bar item: persistent view mode indicator
        this.viewModeStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 100
        );
        this.viewModeStatusBar.command = 'changedown.toggleView';
        this.viewModeStatusBar.tooltip = 'ChangeDown: Click to cycle view mode';
        this.updateStatusBar();

        // Listen to active editor changes
        vscode.window.onDidChangeActiveTextEditor(async editor => {
            if (editor) {
                const docUri = editor.document.uri.toString();
                if (docUri === this.lastActiveEditorUri) {
                    return; // Same editor re-fired (sidebar toggle) — skip
                }

                // If in projected view and user switched to a different file, exit projected view
                if (this.viewModeManager.isProjectedViewActive &&
                    editor.document.uri.toString() !== this.viewModeManager.projectedViewOriginalUri?.toString()) {
                    this.viewModeManager.exitProjectedView(editor);
                }

                this.lastActiveEditorUri = docUri;
                try {
                    this.navigationManager.updateChangeAtCursorContext(editor);
                    // Initialize state bag for new editor (shadow + defaults)
                    const editorState = this.ensureDocState(docUri, editor.document.version, editor.document.getText());
                    // L3 promotion is handled by the LSP server on didOpen/didChange.
                    // For already-L3 documents, initialize the scId counter.
                    if (editor.document.languageId === 'markdown' && !editorState.isConverting) {
                        const text = editor.document.getText();
                        if (this.workspace.isFootnoteNative(text)) {
                            if (editorState.nextScId === 1) {
                                const maxId = scanMaxCnId(text);
                                editorState.nextScId = maxId + 1;
                            }
                        }
                    }
                    this.updateDecorations(editor);
                    this.updateStatusBar();
                    // Read tracking state from file header for immediate panel sync
                    if (editor.document.languageId === 'markdown') {
                        const override = editorState.userTrackingOverride;
                        if (override !== undefined) {
                            // User explicitly toggled — honour their choice
                            this.editTracking.setTrackingModeRaw(override);
                            setContextKey('changedown:trackingEnabled', override);
                        } else {
                            const text = editor.document.getText();
                            const headerMatch = text.match(/^<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/m);
                            if (headerMatch) {
                                this.editTracking.setTrackingModeRaw(headerMatch[1] === 'tracked');
                                setContextKey('changedown:trackingEnabled', this.editTracking.trackingMode);
                            } else {
                                // No header, no override — default to off (H5 fix)
                                this.editTracking.setTrackingModeRaw(false);
                                setContextKey('changedown:trackingEnabled', false);
                            }
                        }
                    } else {
                        // Non-markdown file — tracking off (H5 fix)
                        this.editTracking.setTrackingModeRaw(false);
                        setContextKey('changedown:trackingEnabled', false);
                    }
                } catch (err: any) {
                    getOutputChannel()?.appendLine(`[onDidChangeActiveTextEditor] Error: ${err.message}\n${err.stack}`);
                }
            } else {
                // No active editor — hide the status bar
                this.viewModeStatusBar.hide();
            }
        }, null, context.subscriptions);

        // No initial decoration on startup. LSP sends decorationData on didOpen;
        // extension receives and decorates via handleDecorationDataUpdate.
        try {
            const activeEditor = vscode.window.activeTextEditor;
            getOutputChannel()?.appendLine(`[startup] activeTextEditor: ${activeEditor ? `${activeEditor.document.languageId} (${activeEditor.document.uri.fsPath})` : 'undefined'}`);
            getOutputChannel()?.appendLine(`[startup] visibleTextEditors: ${vscode.window.visibleTextEditors.map(e => e.document.languageId).join(', ') || 'none'}`);

            if (activeEditor && isSupported(activeEditor.document)) {
                const docUri = activeEditor.document.uri.toString();
                const startupState = this.ensureDocState(docUri, activeEditor.document.version, activeEditor.document.getText());
                // L3 promotion is now handled by the LSP server via workspace/applyEdit on didOpen.
                // For already-L3 documents at startup, do immediate decoration + tracking header scan.
                if (activeEditor.document.languageId === 'markdown') {
                    const text = activeEditor.document.getText();
                    if (this.workspace.isFootnoteNative(text)) {
                        // Already L3 — initialize scId counter and scan tracking header
                        const maxId = scanMaxCnId(text);
                        startupState.nextScId = maxId + 1;
                        const headerMatch = text.match(/^<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/m);
                        if (headerMatch) {
                            this.editTracking.setTrackingModeRaw(headerMatch[1] === 'tracked');
                            setContextKey('changedown:trackingEnabled', this.editTracking.trackingMode);
                        }
                    }
                    // For L2 documents: LSP will promote on didOpen and send promotionComplete,
                    // which triggers handlePromotionComplete with header scan and surface sync.
                }
                this.navigationManager.updateChangeAtCursorContext(activeEditor);
                this.updateStatusBar();
            } else {
                setContextKey('changedown:changeAtCursor', false);
                for (const editor of vscode.window.visibleTextEditors) {
                    if (isSupported(editor.document)) {
                        const docUri = editor.document.uri.toString();
                        this.ensureDocState(docUri, editor.document.version, editor.document.getText());
                    }
                }
            }
        } catch (err: any) {
            getOutputChannel()?.appendLine(`[startup] Error during startup: ${err.message}\n${err.stack}`);
        }

        // Listen to document changes for both decorations and tracking mode
        vscode.workspace.onDidChangeTextDocument(async event => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor || event.document !== editor.document) {
                    return;
                }

                // Don't intercept edits while in projected view — buffer content is projected text
                if (this.viewModeManager.isProjectedViewActive) return;

                // Suppress document change handling during format conversion
                // Still update shadow to prevent stale state after conversion
                const docUri = editor.document.uri.toString();
                const currentText = editor.document.getText();
                const docState = this.ensureDocState(docUri, editor.document.version, currentText);
                if (docState.isConverting) {
                    docState.shadow = currentText;
                    return;
                }

                // Delegate tracking-related logic to EditTrackingManager
                const result = await this.editTracking.handleDocumentChange(
                    event, editor, docState, this.localParseHotPath,
                    (e) => this.decorationScheduler.scheduleUpdate(e),
                    (uris) => this.scheduleNotifyChanges(uris),
                );

                // Early returns for undo and comment guard (already handled shadow)
                if (result === 'handled-undo' || result === 'handled-comment-guard') {
                    return;
                }

                // Always update shadow and version immediately (reflects current document state)
                docState.version = editor.document.version;
                docState.shadow = currentText;

                // Optimistic range transform: adjust cached decorations by edit delta.
                // Provides instant visual feedback while LSP round-trip is in flight.
                // LSP push (decorationData) overwrites with authoritative data.
                if (!this.localParseHotPath) {
                    const transformed = transformCachedDecorations(docUri, event.contentChanges, event.document.version);
                    if (transformed) {
                        this.decorationScheduler.scheduleUpdate(editor);
                    }
                }

                // LSP-driven: No scheduleDecorationUpdate from document change. All content-driven
                // decoration comes from LSP push (decorationData) via LSP-driven promotion.
                // LSP-driven: No scheduleNotifyChanges from document change. Notify only from
                // handleDecorationDataUpdate (triggered by LSP-driven promotion).
                if (this.localParseHotPath) {
                    this.decorationScheduler.scheduleUpdate(editor);
                    this.scheduleNotifyChanges([editor.document.uri]);
                }
                // Send overlay to LSP when pending changes (debounced)
                if (editor.document.languageId === 'markdown' && this.editTracking.trackingMode) {
                    this.scheduleOverlaySend();
                }
            } catch (err: any) {
                getOutputChannel()?.appendLine(`[onDidChangeTextDocument] ${err.message}\n${err.stack}`);
            }
        }, null, context.subscriptions);

        // IME composition guard: VS Code has no composition start/end API.
        // When such an API becomes available, call pendingEditManager.setComposing(true/false).
        // PendingEditManager already checks isComposing in flush() and pause timer.
        // Clear composition state when switching editors (we're not composing in the old editor).
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((prevEditor) => {
                try {
                    this.editTracking.clearComposing();
                    // Clear overlay for previous doc when switching; schedule send for new doc
                    if (prevEditor?.document.uri) {
                        this.sendOverlayNull(prevEditor.document.uri.toString());
                    }
                    this.scheduleOverlaySend();
                } catch (err: any) {
                    getOutputChannel()?.appendLine(`[onDidChangeActiveTextEditor] ${err.message}\n${err.stack}`);
                }
            })
        );

        // Listen to cursor position changes for cursor-aware delimiter unfolding and changeAtCursor context
        vscode.window.onDidChangeTextEditorSelection(async event => {
            try {
                const editor = event.textEditor;
                if (editor && isSupported(editor.document)) {
                    // Selection-confirmation gate: confirm pending tracked edit.
                    // This fires ~1-5ms after the text change for real editor typing.
                    await this.editTracking.confirmPendingEdit(event);

                    // Structural flush: cursor moved outside pending edit range.
                    // Must be AFTER selection-confirmation gate to avoid racing with edit confirmation.
                    await this.editTracking.flushOnCursorMoveIfNeeded(editor);

                    this.navigationManager.updateChangeAtCursorContext(editor);
                    // LSP-driven: scheduleDecorationUpdate only when cache has data (cursor unfolding)
                    const uri = editor.document.uri.toString();
                    if (getCachedDecorationData(uri)) {
                        this.decorationScheduler.scheduleUpdate(editor);
                    }
                    // Send overlay to LSP (cursor move may have flushed)
                    if (editor.document.languageId === 'markdown' && this.editTracking.trackingMode) {
                        this.scheduleOverlaySend();
                    }

                    this.navigationManager.snapCursorPastHiddenRanges(editor, event);

                }
            } catch (err: any) {
                getOutputChannel()?.appendLine(`[onDidChangeTextEditorSelection] ${err.message}\n${err.stack}`);
            }
        }, null, context.subscriptions);

        // Listen to document save events to flush pending edits when enabled
        vscode.workspace.onWillSaveTextDocument(event => {
            try {
                const result = this.editTracking.flushBeforeSave(event.document, event.reason);
                if (result) {
                    event.waitUntil(result);
                }
            } catch (err: any) {
                getOutputChannel()?.appendLine(`[onWillSaveTextDocument] ${err.message}\n${err.stack}`);
            }
        }, null, context.subscriptions);

        // Clear conversion suppression after save completes.
        // onWillSaveTextDocument sets isConverting to suppress tracking during
        // L3→L2 conversion, but VS Code applies the TextEdit[] AFTER the waitUntil
        // promise resolves. This handler fires after the edits are applied and
        // written to disk, so it's safe to clear the guard here.
        vscode.workspace.onDidSaveTextDocument(doc => {
            const uri = doc.uri.toString();
            const savedState = this.docStateManager.getState(uri);
            if (savedState?.isConverting) {
                savedState.isConverting = false;
                this.lspBridge.batchEdit('end', uri);
                // Update shadow to reflect post-save L2 content
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document.uri.toString() === uri) {
                    savedState.shadow = editor.document.getText();
                }
            }
        }, null, context.subscriptions);

        // P1-15: Clean up per-document maps when a document closes to prevent memory leaks
        vscode.workspace.onDidCloseTextDocument(doc => {
            try {
                const uri = doc.uri.toString();
                this.sendOverlayNull(uri);
                this.docStateManager.removeState(uri);
                this.coherenceManager.removeState(uri);
                this.statusBarCleaner?.(uri);
                invalidateDecorationCache(uri);
                this.editTracking.getChangeComments()?.disposeThreadsForUri?.(doc.uri);
            } catch (err: any) {
                getOutputChannel()?.appendLine(`[onDidCloseTextDocument] ${err.message}\n${err.stack}`);
            }
        }, null, context.subscriptions);

        // Register coherence/anchor commands
        context.subscriptions.push(
            vscode.commands.registerCommand('changedown.inspectUnresolved', () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;
                const changes = this.getChangesForDocument(editor.document);
                const unresolved = changes.filter(c => isGhostNode(c));
                if (unresolved.length === 0) {
                    vscode.window.showInformationMessage('All anchors are resolved.');
                    return;
                }
                const searchAllItem = {
                    label: '$(search) Search all unresolved anchors',
                    description: `Attempt to find matches for all ${unresolved.length} unresolved changes`,
                    changeId: '',
                };
                const items = [searchAllItem, ...unresolved.map(c => ({
                    label: `${c.id}: ${c.type} — ${c.modifiedText || c.originalText || '(no text)'}`,
                    description: 'unresolved',
                    changeId: c.id,
                }))];
                vscode.window.showQuickPick(items, {
                    placeHolder: `${unresolved.length} unresolved anchor${unresolved.length === 1 ? '' : 's'}`,
                }).then(async selected => {
                    if (!selected) return;
                    if (selected === searchAllItem) {
                        await this.searchAllUnresolved(editor, unresolved);
                        return;
                    }
                    this.navigationManager.jumpToFootnoteInEditor(editor, selected.changeId);
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('changedown.searchAnchorText', async (changeId: string) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;
                const text = editor.document.getText();
                const lines = text.split('\n');
                const { bodyLines } = splitBodyAndFootnotes(lines);
                const bodyText = bodyLines.join('\n');

                const result = this.findAnchorLine(lines, bodyText, changeId);
                if (!result) {
                    vscode.window.showInformationMessage(`No unique match found for anchor text of ${changeId}. The text may have been deleted, substantially rewritten, or appears more than once.`);
                    return;
                }
                const lineContent = lines[result.line]?.trim() ?? '';
                const tier = result.wasNormalized ? ' (fuzzy match)' : ' (exact match)';
                const items = [{
                    label: `Line ${result.line + 1}: ${lineContent.length > 60 ? lineContent.slice(0, 60) + '\u2026' : lineContent}`,
                    description: tier,
                    line: result.line,
                }];
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `Found anchor text for ${changeId}`,
                });
                if (selected) {
                    await this.rewriteFootnoteAnchor(editor, changeId, selected.line, lines);
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('changedown.jumpToFootnote', (changeId: string) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;
                this.navigationManager.jumpToFootnoteInEditor(editor, changeId);
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('changedown.reanchorToSelection', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.selection.isEmpty) {
                    vscode.window.showInformationMessage('Select text in the document body first, then run this command.');
                    return;
                }
                const changes = this.getChangesForDocument(editor.document);
                const unresolved = changes.filter(c => isGhostNode(c));
                if (unresolved.length === 0) {
                    vscode.window.showInformationMessage('No unresolved anchors to re-anchor.');
                    return;
                }
                const items = unresolved.map(c => ({
                    label: `${c.id} (${c.type})`,
                    description: c.metadata?.author ?? '',
                    changeId: c.id,
                }));
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select which unresolved change to anchor at your selection',
                });
                if (!selected) return;

                const targetLine = editor.selection.start.line;
                const lines = editor.document.getText().split('\n');
                await this.rewriteFootnoteAnchor(editor, selected.changeId, targetLine, lines);
            })
        );
    }

    /** Find the body line where a change's anchor text matches, or null if not found. */
    private findAnchorLine(lines: string[], bodyText: string, changeId: string): { line: number; wasNormalized: boolean } | null {
        const block = findFootnoteBlock(lines, changeId);
        if (!block) return null;
        const editOpLineRaw = lines[block.headerLine + 1] ?? '';
        const opLineMatch = editOpLineRaw.match(FOOTNOTE_L3_EDIT_OP);
        if (!opLineMatch) return null;
        const parsed = parseContextualEditOp(opLineMatch[3]);
        if (!parsed) return null;
        const searchText = (parsed.contextBefore + parsed.contextAfter).trim();
        const match = tryFindUniqueMatch(bodyText, searchText);
        if (!match) return null;
        let line = 0;
        for (let i = 0; i < match.index; i++) {
            if (bodyText[i] === '\n') line++;
        }
        return { line, wasNormalized: match.wasNormalized };
    }

    private async rewriteFootnoteAnchor(
        editor: vscode.TextEditor,
        changeId: string,
        targetLine: number,
        lines: string[]
    ): Promise<boolean> {
        const block = findFootnoteBlock(lines, changeId);
        if (!block) return false;
        const lineContent = lines[targetLine];
        if (lineContent === undefined) return false;
        const hash = computeLineHash(targetLine, lineContent, lines);
        const editOpLineRaw = lines[block.headerLine + 1] ?? '';
        const opLineMatch = editOpLineRaw.match(FOOTNOTE_L3_EDIT_OP);
        if (!opLineMatch) return false;
        const opString = opLineMatch[3];
        const freshEditOpLine = `    ${targetLine + 1}:${hash} ${opString}`;
        const editOpLineIdx = block.headerLine + 1;
        if (editOpLineIdx >= lines.length) return false;
        const edit = new vscode.WorkspaceEdit();
        const editOpRange = new vscode.Range(editOpLineIdx, 0, editOpLineIdx, lines[editOpLineIdx].length);
        edit.replace(editor.document.uri, editOpRange, freshEditOpLine);
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            vscode.window.showInformationMessage(`Re-anchored ${changeId} to line ${targetLine + 1}.`);
        }
        return success;
    }

    private async searchAllUnresolved(editor: vscode.TextEditor, unresolved: ChangeNode[]): Promise<void> {
        const text = editor.document.getText();
        const lines = text.split('\n');
        const { bodyLines } = splitBodyAndFootnotes(lines);
        const bodyText = bodyLines.join('\n');
        const results: { changeId: string; found: boolean; line?: number }[] = [];
        for (const change of unresolved) {
            const result = this.findAnchorLine(lines, bodyText, change.id);
            if (result) {
                results.push({ changeId: change.id, found: true, line: result.line });
            } else {
                results.push({ changeId: change.id, found: false });
            }
        }
        const foundCount = results.filter(r => r.found).length;
        const items = results.map(r => ({
            label: r.found
                ? `$(check) ${r.changeId} — line ${(r.line ?? 0) + 1}`
                : `$(x) ${r.changeId} — no match`,
            description: r.found ? 'Re-anchor?' : 'Text may have been deleted',
            changeId: r.changeId,
            found: r.found,
            line: r.line,
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Found candidates for ${foundCount} of ${results.length} unresolved anchors`,
        });
        if (selected?.found && selected.line !== undefined) {
            await this.rewriteFootnoteAnchor(editor, selected.changeId, selected.line, lines);
        }
    }

    /** Delegate: schedule debounced notify-changes to listeners. */
    private scheduleNotifyChanges(uris?: vscode.Uri[]): void {
        this.docStateManager.scheduleNotifyChanges(uris);
    }

    /**
     * Set the ChangeComments reference for Layer 2 comment-reply guard.
     * Delegates to EditTrackingManager.
     */
    public setChangeComments(comments: { isAnyThreadExpandedAtCursor(): boolean; disposeThreadsForUri?(uri: vscode.Uri): void }): void {
        this.editTracking.setChangeComments(comments);
    }

    /**
     * Run an async function with the isApplyingTrackedEdit guard active.
     * Delegates to EditTrackingManager.
     */
    public async runWithTrackedEditGuard<T>(fn: () => PromiseLike<T> | T): Promise<T> {
        return this.editTracking.runWithTrackedEditGuard(fn);
    }

    /**
     * Set the overlay sender (extension wires after LSP client is ready).
     * Delegates to LspBridge.
     */
    public setOverlaySender(send: (uri: string, overlay: PendingOverlay | null) => void): void {
        this.lspBridge.setOverlaySender(send);
    }

    /**
     * Set the view mode sender (extension wires after LSP client is ready).
     * Delegates to LspBridge.
     */
    public setViewModeSender(send: (uri: string, viewMode: ViewMode) => void): void {
        this.lspBridge.setViewModeSender(send);
    }

    /**
     * Set the cursor position sender (extension wires after LSP client is ready).
     * Delegates to LspBridge.
     */
    public setCursorPositionSender(send: (uri: string, line: number, changeId?: string) => void): void {
        this.lspBridge.setCursorPositionSender(send);
    }

    /**
     * Set the LSP client for lifecycle requests and config queries.
     * Delegates to LspBridge.
     */
    public setLspClient(client: { sendRequest: (method: string, params: any) => Promise<any> } | null): void {
        this.lspBridge.setLspClient(client);
    }

    /**
     * Set the batch edit sender (extension wires after LSP client is ready).
     * Delegates to LspBridge.
     */
    public setBatchEditSender(sender: BatchEditSender | null): void {
        this.lspBridge.setBatchEditSender(sender);
    }

    /**
     * Set the status bar cleaner callback (extension wires after controller creation).
     * Called with (uri) when a document closes to clean StatusBarManager state.
     */
    public setStatusBarCleaner(cleaner: (uri: string) => void): void {
        this.statusBarCleaner = cleaner;
    }

    /**
     * Send a lifecycle LSP request and apply the returned edits to the active editor.
     * Delegates to LspBridge.
     */
    public async sendLifecycleRequest<T extends { edit?: unknown; edits?: unknown[]; error?: string; warning?: string }>(
        requestName: string,
        params: Record<string, unknown>
    ): Promise<{ success: boolean; result?: T }> {
        return this.lspBridge.sendLifecycleRequest<T>(requestName, params);
    }

    /** Debounced overlay send. Delegates to LspBridge. */
    private scheduleOverlaySend(): void {
        this.lspBridge.scheduleOverlaySend();
    }

    /** Send overlay=null for a URI immediately. Delegates to LspBridge. */
    private sendOverlayNull(uri: string): void {
        this.lspBridge.sendOverlayNull(uri);
    }

    /**
     * Called when LSP sends decoration data. Delegates to LspBridge
     * which fires onDidReceiveDecorationData for controller subscriber.
     */
    public handleDecorationDataUpdate(uri: string, _changes: ChangeNode[]): void {
        this.lspBridge.handleDecorationDataUpdate(uri, _changes);
    }

    /**
     * Called when LSP sends changedown/promotionStarting.
     * Delegates to LspBridge.
     */
    public handlePromotionStarting(uri: string): void {
        this.lspBridge.handlePromotionStarting(uri);
    }

    /**
     * Called when LSP sends changedown/promotionComplete.
     * Delegates to LspBridge which fires onDidCompletePromotion for controller subscriber.
     */
    public handlePromotionComplete(uri: string): void {
        this.lspBridge.handlePromotionComplete(uri);
    }

    public updateDecorations(editor: vscode.TextEditor) {
        if (!isSupported(editor.document)) {
            return;
        }
        // Skip comment input editors — they appear in visibleTextEditors with
        // a comment:// URI containing 'commentinput-' and pass isSupported()
        // because the URI includes '.md'. Decorating them is a no-op that
        // causes an O(N) storm (186 calls per view mode change).
        if (editor.document.uri.toString().includes('commentinput-')) {
            return;
        }
        if (this.viewModeManager.isProjectedViewActive) return;

        try {
            const text = editor.document.getText();
            const languageId = editor.document.languageId;
            const uri = editor.document.uri.toString();

            // If hot path enabled, always parse locally for instant decoration
            if (this.localParseHotPath) {
                const virtualDoc = this.workspace.parse(text, languageId);
                this.decorator.decorate(editor, virtualDoc, this.viewModeManager.viewMode, text, this.viewModeManager.showDelimiters);
                return;
            }

            const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);
            const changes = virtualDoc.getChanges();
            getOutputChannel()?.appendLine(`[updateDecorations] uri=${uri.split('/').pop()}, changes=${changes.length}, mode=${this.viewModeManager.viewMode}`);

            this.decorator.decorate(editor, virtualDoc, this.viewModeManager.viewMode, text, this.viewModeManager.showDelimiters);
            // Do not notify here: notify only from handleDecorationDataUpdate.
            // Notifying on every decoration run (including selection-driven runs) caused comment
            // threads to collapse when clicking into the reply input.
        } catch (err: any) {
            getOutputChannel()?.appendLine(`[updateDecorations] Error for ${editor.document.uri.fsPath}: ${err.message}\n${err.stack}`);
        }
    }

    /**
     * Returns the current list of changes for a document (from LSP cache or local parse).
     * Used by Change Explorer and other consumers that need ChangeNode[].
     */
    public getChangesForDocument(doc: vscode.TextDocument): ChangeNode[] {
        return this.docStateManager.getChangesForDocument(doc);
    }

    /**
     * Reveal a change by ID in the active editor (e.g. from Change Explorer tree click).
     */
    public revealChangeById(changeId: string): void {
        this.navigationManager.revealChangeById(changeId);
    }

    /** Toggle tracking mode. Delegates to EditTrackingManager. */
    public async toggleTracking(): Promise<void> {
        return this.editTracking.toggleTracking();
    }

    /**
     * Called when LSP sends changedown/documentState.
     * Delegates to DocumentStateManager; context keys updated via onDidChangeDocumentState subscriber.
     */
    public setDocumentState(uri: string, state: { tracking: { enabled: boolean; source: string }; viewMode: string }): void {
        this.docStateManager.setDocumentState(uri, state);
    }

    /**
     * Check if tracking is enabled for a specific document.
     * Delegates to EditTrackingManager.
     */
    public isTrackingEnabled(uri?: string): boolean {
        return this.editTracking.isTrackingEnabled(uri);
    }

    public async setViewMode(mode: ViewMode) {
        return this.viewModeManager.setViewMode(mode);
    }

    private updateStatusBar(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isSupported(editor.document)) {
            this.viewModeStatusBar.hide();
            return;
        }
        const changes = this.getChangesForDocument(editor.document);
        const count = changes.length;
        const label = VIEW_MODE_LABELS[this.viewModeManager.viewMode];
        const uri = editor.document.uri.toString();
        const cs = getStatusBarCoherence(uri) ?? { rate: 100, unresolvedCount: 0, threshold: DEFAULT_CONFIG.coherence.threshold };

        if (cs.unresolvedCount > 0) {
            const resolved = count - cs.unresolvedCount;
            if (cs.rate < cs.threshold) {
                this.viewModeStatusBar.text = `$(error) DEGRADED: ${cs.unresolvedCount} unresolved · ${label}`;
                this.viewModeStatusBar.tooltip = `ChangeDown: ${cs.unresolvedCount} anchor${cs.unresolvedCount === 1 ? '' : 's'} could not be resolved (coherence ${cs.rate}% < threshold ${cs.threshold}%). External or manual edits are the most common cause.`;
                this.viewModeStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else {
                this.viewModeStatusBar.text = `$(warning) ${cs.unresolvedCount} unresolved · ${resolved >= 0 ? resolved : 0} resolved · ${label}`;
                this.viewModeStatusBar.tooltip = `ChangeDown: ${cs.unresolvedCount} unresolved anchor${cs.unresolvedCount === 1 ? '' : 's'} (coherence ${cs.rate}%). Click to toggle view.`;
                this.viewModeStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            }
        } else {
            this.viewModeStatusBar.text = `$(diff) ${count} change${count === 1 ? '' : 's'} · ${label}`;
            this.viewModeStatusBar.tooltip = `ChangeDown: ${count} tracked change${count === 1 ? '' : 's'} in ${label} mode. Click to toggle view.`;
            this.viewModeStatusBar.backgroundColor = undefined;
        }
        this.viewModeStatusBar.show();
    }

    public updateCoherence(uri: string, rate: number, unresolvedCount: number, threshold: number): void {
        this.coherenceManager.updateCoherence(uri, rate, unresolvedCount, threshold);
        this.updateStatusBar();
        this.coherenceManager.checkCoherenceDegradation(uri);
    }

    public async cycleViewMode() {
        return this.viewModeManager.cycleViewMode();
    }

    /** @deprecated Use cycleViewMode() instead. Kept for backward compatibility with tests. */
    public async toggleView() {
        return this.viewModeManager.cycleViewMode();
    }

    public get trackingMode(): boolean {
        return this.editTracking.trackingMode;
    }


    public get viewMode(): ViewMode {
        return this.viewModeManager.viewMode;
    }

    /** Navigate to the next change from current cursor position. */
    public async nextChange(): Promise<void> {
        return this.navigationManager.nextChange();
    }

    /** Navigate to the previous change from current cursor position. */
    public async previousChange(): Promise<void> {
        return this.navigationManager.previousChange();
    }

    /** Navigate to the linked change in a move group. */
    public async goToLinkedChange(): Promise<void> {
        return this.navigationManager.goToLinkedChange();
    }

    /** Insert a comment at cursor or wrap selection in comment. Delegates to ReviewLifecycleManager. */
    public async addComment(predefinedText?: string): Promise<void> {
        return this.reviewLifecycle.addComment(predefinedText);
    }

    // logError moved to shared.ts

    // handleTrackedEdits and isCriticMarkupSyntax moved to EditTrackingManager

    // findChangeForCommand, getProjectConfig, getAuthor, confirmBulkAction moved to ReviewLifecycleManager

    /** Accept a change by ID or at cursor. Delegates to ReviewLifecycleManager. */
    public async acceptChangeAtCursor(changeId?: string, decision?: 'approve' | 'request_changes', reason?: string): Promise<void> {
        return this.reviewLifecycle.acceptChangeAtCursor(changeId, decision, reason);
    }

    /** Reject a change by ID or at cursor. Delegates to ReviewLifecycleManager. */
    public async rejectChangeAtCursor(changeId?: string, decision?: 'reject', reason?: string): Promise<void> {
        return this.reviewLifecycle.rejectChangeAtCursor(changeId, decision, reason);
    }

    /** Request changes on a change by ID or at cursor. Delegates to ReviewLifecycleManager. */
    public async requestChangesAtCursor(changeId?: string): Promise<void> {
        return this.reviewLifecycle.requestChangesAtCursor(changeId);
    }

    /** Withdraw a request-changes decision by ID or at cursor. Delegates to ReviewLifecycleManager. */
    public async withdrawRequestAtCursor(changeId?: string): Promise<void> {
        return this.reviewLifecycle.withdrawRequestAtCursor(changeId);
    }

    /** Amend a change by ID or at cursor. Delegates to ReviewLifecycleManager. */
    public async amendChangeAtCursor(changeId?: string): Promise<void> {
        return this.reviewLifecycle.amendChangeAtCursor(changeId);
    }

    /** Supersede a change by ID or at cursor. Delegates to ReviewLifecycleManager. */
    public async supersedeChangeAtCursor(changeId?: string): Promise<void> {
        return this.reviewLifecycle.supersedeChangeAtCursor(changeId);
    }

    /** Accept all pending changes in the document. Delegates to ReviewLifecycleManager. */
    public async acceptAllChanges(): Promise<void> {
        return this.reviewLifecycle.acceptAllChanges();
    }

    /** Reject all pending changes in the document. Delegates to ReviewLifecycleManager. */
    public async rejectAllChanges(): Promise<void> {
        return this.reviewLifecycle.rejectAllChanges();
    }

    /** Accept all proposed changes on the current cursor line. Delegates to ReviewLifecycleManager. */
    public async acceptAllOnLine(): Promise<void> {
        return this.reviewLifecycle.acceptAllOnLine();
    }

    /** Reject all proposed changes on the current cursor line. Delegates to ReviewLifecycleManager. */
    public async rejectAllOnLine(): Promise<void> {
        return this.reviewLifecycle.rejectAllOnLine();
    }

    /** Accept all changes in document at URI. Delegates to ReviewLifecycleManager. */
    public async acceptAllInDocument(uri: vscode.Uri): Promise<void> {
        return this.reviewLifecycle.acceptAllInDocument(uri);
    }

    /** Reject all changes in document at URI. Delegates to ReviewLifecycleManager. */
    public async rejectAllInDocument(uri: vscode.Uri): Promise<void> {
        return this.reviewLifecycle.rejectAllInDocument(uri);
    }

    /** Compact a change (L2 -> L1). Delegates to ReviewLifecycleManager. */
    public async compactChange(changeId?: string): Promise<void> {
        return this.reviewLifecycle.compactChange(changeId);
    }

    /** Fully compact a change (L2/L1 -> L0). Delegates to ReviewLifecycleManager. */
    public async compactChangeFully(changeId?: string): Promise<void> {
        return this.reviewLifecycle.compactChangeFully(changeId);
    }

    /** Compact all resolved changes. Delegates to ReviewLifecycleManager. */
    public async compactAllResolved(): Promise<void> {
        return this.reviewLifecycle.compactAllResolved();
    }

    /** Prepare cut as a move operation. Delegates to EditTrackingManager. */
    public prepareCutAsMove(): void {
        this.editTracking.prepareCutAsMove();
    }

    /** Prepare paste as move completion. Delegates to EditTrackingManager. */
    public preparePasteAsMove(): void {
        this.editTracking.preparePasteAsMove();
    }

    public handleFileRename(oldUri: string, newUri: string): void {
        this.docStateManager.handleFileRename(oldUri, newUri);
    }

    // ── Test surface ─────────────────────────────────────────────────────────

    /** Get/set the isApplyingTrackedEdit guard (suppresses document-change handler). */
    public get isApplyingTrackedEdit(): boolean { return this.editTracking.isApplyingTrackedEdit; }
    public set isApplyingTrackedEdit(v: boolean) { this.editTracking.isApplyingTrackedEdit = v; }

    /**
     * Reset all transient controller state for test isolation.
     * Called by _testResetDocument before replacing document content.
     */
    public resetForTest(): void {
        this.editTracking.resetForTest();
        this.docStateManager.resetForTest();
        this.viewModeManager.resetForTest();
        this.coherenceManager.resetForTest();
    }

    /**
     * Set per-document state after a test document reset.
     * Must be called after editor.edit() so the docState bag has been
     * re-created by ensureDocState() inside onDidChangeTextDocument.
     */
    public setStateForTest(uri: string, opts: { tracking: boolean; shadow: string; nextScId?: number }): void {
        this.editTracking.setTrackingModeRaw(opts.tracking);
        setContextKey('changedown:trackingEnabled', opts.tracking);
        const state = this.docStateManager.getState(uri);
        if (state) {
            state.shadow = opts.shadow;
            if (opts.nextScId !== undefined) state.nextScId = opts.nextScId;
            state.userTrackingOverride = undefined;
        }
    }

    public dispose() {
        this.decorationScheduler.dispose();
        this.editTracking.dispose();
        this.navigationManager.dispose();
        this.decorator.dispose();
        this.coherenceManager.dispose();
        this.lspBridge.dispose();
        this.docStateManager.dispose();
        this.viewModeStatusBar.dispose();
        this.viewModeManager.dispose();
        this.reviewLifecycle.dispose();
    }
}
