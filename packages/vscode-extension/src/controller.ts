import * as vscode from 'vscode';
import type { PendingOverlay } from '@changetracks/core';
import { Workspace, VirtualDocument, ChangeNode, ChangeType, ChangeStatus, scanMaxCtId, generateFootnoteDefinition, computeApprovalLineEdit, computeFootnoteArchiveLineEdit, compactToLevel1, compactToLevel0, SIDECAR_BLOCK_MARKER, nowTimestamp, appendFootnote } from '@changetracks/core';
import { EditorDecorator } from './decorator';
import { ViewMode, VIEW_MODES, nextViewMode, resolveViewName } from './view-mode';
import { offsetToPosition, positionToOffset, coreEditToVscode, coreRangeToVscode } from './converters';
import { formatReply } from './footnote-writer';
import { getCachedDecorationData, invalidateDecorationCache, setCachedDecorationData, transformCachedDecorations } from './lsp-client';
import { PendingEditManager } from './PendingEditManager';
import { getOutputChannel } from './output-channel';
import { resolveAuthorIdentity } from './author-identity';

export class ExtensionController {
    private _trackingMode: boolean = false;
    private _viewMode: ViewMode;
    private _showCriticMarkup: boolean;
    private isApplyingTrackedEdit: boolean = false;
    private pendingEditManager: PendingEditManager;
    private documentShadow: Map<string, string> = new Map(); // Track previous document state for deletions
    private nextScIdMap: Map<string, number> = new Map(); // Per-document ct-ID counter for Level 1 tracking
    private documentStates = new Map<string, { tracking: { enabled: boolean; source: string }; viewMode: string }>();
    private pendingCut: { text: string; timestamp: number; moveId: number } | null = null;
    private localParseHotPath: boolean = false;
    private lastActiveEditorUri: string | undefined;
    private changeComments: { isCommentReplyActive: boolean; disposeThreadsForUri?(uri: vscode.Uri): void } | null = null;
    /**
     * Selection-confirmation gate: edits are stored as "unconfirmed" until
     * onDidChangeTextEditorSelection confirms the edit came from editor typing.
     * Comment widgets, SCM input, and other non-editor surfaces don't fire
     * selection events, so their leaked keystrokes are silently discarded.
     */
    private unconfirmedTrackedEdit: {
        event: vscode.TextDocumentChangeEvent;
        editor: vscode.TextEditor;
        shadowSnapshot: string;
    } | null = null;
    private unconfirmedEditTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly EDIT_CONFIRMATION_TIMEOUT_MS = 50;
    public readonly workspace: Workspace;
    private decorator: EditorDecorator;
    private _onDidChangeChanges = new vscode.EventEmitter<vscode.Uri[]>();
    /** Fires when the set of changes may have changed. Payload: URIs of affected documents. */
    public readonly onDidChangeChanges = this._onDidChangeChanges.event;

    /** Pending URIs to include in next notify (debounce coalescing). */
    private pendingNotifyUris = new Set<string>();

    /** Debounce: avoid running parse + decorate on every keystroke/cursor move (CPU leak). */
    private static readonly DECORATION_DEBOUNCE_MS = 50;
    private decorationUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    private decorationUpdateUri: string | null = null;

    /** Debounce notifications to listeners so SCM/Explorer/Comments don't run on every decoration run. */
    private static readonly NOTIFY_CHANGES_DEBOUNCE_MS = 120;
    private notifyChangesTimeout: ReturnType<typeof setTimeout> | null = null;

    /** Overlay send to LSP: debounced ~50ms. Set by extension after controller creation. */
    private overlaySender: ((uri: string, overlay: PendingOverlay | null) => void) | null = null;

    /** View mode send to LSP: notifies server of view mode changes. Set by extension after LSP ready. */
    private viewModeSender: ((uri: string, viewMode: ViewMode) => void) | null = null;

    /** LSP client for getChanges bootstrap (Section 11). Set by extension after controller creation. */
    private getChangesClient: { sendRequest: (method: string, params: { textDocument: { uri: string } }) => Promise<{ changes: ChangeNode[] }> } | null = null;

    /** Per-URI in-flight getChanges to avoid duplicate requests. */
    private getChangesInFlight = new Set<string>();
    private overlaySendTimeout: ReturnType<typeof setTimeout> | null = null;
    private static readonly OVERLAY_SEND_DEBOUNCE_MS = 50;
    private lastOverlayUri: string | null = null;

    /**
     * Check if a document is supported for ChangeTracks operations.
     * Markdown files are always supported. Code files are supported if they have sidecar annotations.
     */
    private isSupported(doc: vscode.TextDocument): boolean {
        // Markdown always supported
        if (doc.languageId === 'markdown') return true;
        // Code files supported if they have sidecar annotations
        if (doc.getText().includes(SIDECAR_BLOCK_MARKER)) return true;
        return false;
    }

    /**
     * Get VirtualDocument for a URI. LSP is the only parser: use cache, else overlay-only, else empty.
     * Phase 2: No local parse — decorationData only, overlay-only fallback when LSP down.
     * @param parseFallback When true, parse locally if cache and overlay are empty (for in-memory edits, e.g. compactChangeFully).
     */
    private getVirtualDocumentFor(uri: string, text: string, languageId?: string, parseFallback?: boolean): VirtualDocument {
        const cachedChanges = getCachedDecorationData(uri);
        if (cachedChanges) return new VirtualDocument(cachedChanges);
        const overlay = this.pendingEditManager.getPendingOverlay(uri);
        if (overlay) return VirtualDocument.fromOverlayOnly(overlay);
        if (parseFallback) return this.workspace.parse(text, languageId ?? 'markdown');
        return new VirtualDocument([]);
    }

    /**
     * Find the best supported text editor, with fallback.
     * Handles the common case where the user clicks a sidebar panel button —
     * activeTextEditor still points to the last text editor in most VS Code
     * versions, but we also check visibleTextEditors as a safety net.
     */
    private findSupportedEditor(): vscode.TextEditor | undefined {
        const active = vscode.window.activeTextEditor;
        if (active && this.isSupported(active.document)) return active;
        return vscode.window.visibleTextEditors.find(e => this.isSupported(e.document));
    }

    /**
     * Apply edit-boundary settings from config to PendingEditManager.
     * flushOnCursorMove and flushOnSave are always true (core behavior / data integrity).
     * pasteMinChars is hardcoded to 50.
     */
    private applyEditBoundaryConfig(config: vscode.WorkspaceConfiguration): void {
        const pauseMs = config.get<number>('editBoundary.pauseThresholdMs', 30000);
        const breakOnNewline = config.get<boolean>('editBoundary.breakOnNewline', true);

        this.pendingEditManager.setPauseThresholdMs(pauseMs);
        this.pendingEditManager.setPasteMinChars(50);
        this.pendingEditManager.setBreakOnNewline(breakOnNewline);
    }

    constructor(context: vscode.ExtensionContext) {
        this.workspace = new Workspace();

        // Read decoration style and author colors from configuration
        const config0 = vscode.workspace.getConfiguration('changetracks');
        const rawStyle = config0.get<string>('decorationStyle', 'foreground');
        const decorationStyle = rawStyle === 'background' ? 'background' : 'foreground';
        const rawAuthorColors = config0.get<string>('authorColors', 'auto');
        const authorColors = (rawAuthorColors === 'always' || rawAuthorColors === 'never') ? rawAuthorColors : 'auto' as const;
        this.decorator = new EditorDecorator(decorationStyle, authorColors);

        // Read default view mode from configuration (supports both legacy and canonical names)
        const rawViewMode = config0.get<string>('defaultViewMode', 'review');
        this._viewMode = resolveViewName(rawViewMode) ?? 'review';
        this._showCriticMarkup = config0.get<boolean>('showCriticMarkup', false);

        // Listen for decoration style / author colors configuration changes
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('changetracks.decorationStyle') ||
                event.affectsConfiguration('changetracks.authorColors')) {
                const cfg = vscode.workspace.getConfiguration('changetracks');
                const rawNewStyle = cfg.get<string>('decorationStyle', 'foreground');
                const newStyle = rawNewStyle === 'background' ? 'background' : 'foreground';
                const rawNewAuthorColors = cfg.get<string>('authorColors', 'auto');
                const newAuthorColors = (rawNewAuthorColors === 'always' || rawNewAuthorColors === 'never') ? rawNewAuthorColors : 'auto' as const;
                this.decorator.dispose();
                this.decorator = new EditorDecorator(newStyle, newAuthorColors);

                // Re-apply decorations to all visible editors
                vscode.window.visibleTextEditors.forEach(editor => {
                    if (this.isSupported(editor.document)) {
                        this.updateDecorations(editor);
                    }
                });
            }
            if (event.affectsConfiguration('changetracks.editBoundary')) {
                const cfg = vscode.workspace.getConfiguration('changetracks');
                this.applyEditBoundaryConfig(cfg);
            }
            if (event.affectsConfiguration('changetracks.showCriticMarkup')) {
                this._showCriticMarkup = vscode.workspace.getConfiguration('changetracks').get<boolean>('showCriticMarkup', false);
                vscode.window.visibleTextEditors.forEach(editor => {
                    if (this.isSupported(editor.document)) {
                        this.updateDecorations(editor);
                    }
                });
            }
        }, null, context.subscriptions);

        // Initialize PendingEditManager
        this.pendingEditManager = new PendingEditManager(
            async (range, newText, setFlag) => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    this.isApplyingTrackedEdit = true;
                    try {
                        const success = await editor.edit(editBuilder => {
                            editBuilder.replace(range, newText);
                        }, { undoStopBefore: false, undoStopAfter: false });
                        if (!success) {
                            getOutputChannel()?.appendLine('[tracking] editor.edit() rejected — document version changed during edit');
                        }
                    } finally {
                        this.isApplyingTrackedEdit = false;
                    }
                }
            },
            () => vscode.window.activeTextEditor!.document,
            this.workspace,
            // allocateScId callback -- returns next ct-ID for the active document
            () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return 'ct-0'; }
                return this.allocateScId(editor.document.uri.toString());
            },
            // onChangeTracked callback -- appends footnote definition at end of document
            async (scId: string, changeType: string) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                const author = this.getAuthor(editor.document.uri);
                const date = new Date().toISOString().slice(0, 10);
                const footnote = generateFootnoteDefinition(scId, changeType, author, date);

                this.isApplyingTrackedEdit = true;
                try {
                    const doc = editor.document;
                    const endPos = doc.positionAt(doc.getText().length);
                    const success = await editor.edit(editBuilder => {
                        editBuilder.insert(endPos, footnote);
                    }, { undoStopBefore: false, undoStopAfter: false });
                    if (!success) {
                        getOutputChannel()?.appendLine(`[tracking] footnote editor.edit() rejected for ${scId}`);
                    }
                } finally {
                    this.isApplyingTrackedEdit = false;
                }
            }
        );

        // Read tracking mode and edit boundary sub-settings from configuration
        const config = vscode.workspace.getConfiguration('changetracks');
        this._trackingMode = config.get<boolean>('trackingMode', false);
        this.applyEditBoundaryConfig(config);
        this.localParseHotPath = vscode.workspace.getConfiguration('changetracks').get('localParseHotPath', false);

        // Clear debounce timers when extension context is disposed
        context.subscriptions.push({
            dispose: () => {
                if (this.decorationUpdateTimeout) {
                    clearTimeout(this.decorationUpdateTimeout);
                    this.decorationUpdateTimeout = null;
                }
                this.decorationUpdateUri = null;
                if (this.overlaySendTimeout) {
                    clearTimeout(this.overlaySendTimeout);
                    this.overlaySendTimeout = null;
                }
                if (this.notifyChangesTimeout) {
                    clearTimeout(this.notifyChangesTimeout);
                    this.notifyChangesTimeout = null;
                }
            }
        });

        // Initialize context keys for UI
        this.setContextKey('changetracks:trackingEnabled', this._trackingMode);
        this.setContextKey('changetracks:viewMode', this._viewMode);

        // Listen to active editor changes
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                const docUri = editor.document.uri.toString();
                if (docUri === this.lastActiveEditorUri) {
                    return; // Same editor re-fired (sidebar toggle) — skip
                }
                this.lastActiveEditorUri = docUri;
                try {
                    this.updateChangeAtCursorContext(editor);
                    // Initialize shadow for new editor
                    if (!this.documentShadow.has(docUri)) {
                        this.documentShadow.set(docUri, editor.document.getText());
                    }
                    this.updateDecorations(editor);
                    // Read tracking state from file header for immediate panel sync
                    if (editor.document.languageId === 'markdown') {
                        const text = editor.document.getText();
                        const headerMatch = text.match(/^<!--\s*ctrcks\.com\/v1:\s*(tracked|untracked)\s*-->/m);
                        if (headerMatch) {
                            this._trackingMode = headerMatch[1] === 'tracked';
                            this.setContextKey('changetracks:trackingEnabled', this._trackingMode);
                        }
                    }
                } catch (err: any) {
                    getOutputChannel()?.appendLine(`[onDidChangeActiveTextEditor] Error: ${err.message}\n${err.stack}`);
                }
            }
        }, null, context.subscriptions);

        // Section 11: No initial decoration on startup. LSP sends decorationData on didOpen;
        // extension receives and decorates via handleDecorationDataUpdate. If cache empty,
        // updateDecorations (from onDidChangeActiveTextEditor) triggers getChanges bootstrap.
        try {
            const activeEditor = vscode.window.activeTextEditor;
            getOutputChannel()?.appendLine(`[startup] activeTextEditor: ${activeEditor ? `${activeEditor.document.languageId} (${activeEditor.document.uri.fsPath})` : 'undefined'}`);
            getOutputChannel()?.appendLine(`[startup] visibleTextEditors: ${vscode.window.visibleTextEditors.map(e => e.document.languageId).join(', ') || 'none'}`);

            if (activeEditor && this.isSupported(activeEditor.document)) {
                const docUri = activeEditor.document.uri.toString();
                this.documentShadow.set(docUri, activeEditor.document.getText());
                this.updateChangeAtCursorContext(activeEditor);
            } else {
                this.setContextKey('changetracks:changeAtCursor', false);
                for (const editor of vscode.window.visibleTextEditors) {
                    if (this.isSupported(editor.document)) {
                        const docUri = editor.document.uri.toString();
                        if (!this.documentShadow.has(docUri)) {
                            this.documentShadow.set(docUri, editor.document.getText());
                        }
                    }
                }
            }
        } catch (err: any) {
            getOutputChannel()?.appendLine(`[startup] Error during startup: ${err.message}\n${err.stack}`);
        }

        // Listen to document changes for both decorations and tracking mode
        vscode.workspace.onDidChangeTextDocument(async event => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || event.document !== editor.document) {
                return;
            }

            const docUri = editor.document.uri.toString();

            // BUG 5 fix: Don't track undo/redo — VS Code manages the undo stack.
            if (event.reason === vscode.TextDocumentChangeReason.Undo ||
                event.reason === vscode.TextDocumentChangeReason.Redo) {
                this.documentShadow.set(docUri, editor.document.getText());
                if (this.localParseHotPath) {
                    this.scheduleDecorationUpdate(editor);
                    this.scheduleNotifyChanges([editor.document.uri]);
                }
                return;
            }

            // Selection-confirmation gate: defer handleTrackedEdits until
            // onDidChangeTextEditorSelection confirms this edit came from editor typing.
            // Non-editor surfaces (comment widgets, SCM input) don't fire selection events,
            // so their leaked keystrokes are silently discarded after the timeout.
            if (this.trackingMode && !this.isApplyingTrackedEdit && editor.document.languageId === 'markdown') {
                // Layer 1: Comment widget guard — if a comment thread is expanded,
                // keystrokes belong to the comment input, not the editor.
                // Must be checked BEFORE the deletion auto-confirm branch.
                if (this.changeComments?.isCommentReplyActive) {
                    this.documentShadow.set(docUri, editor.document.getText());
                    if (this.localParseHotPath) {
                        this.scheduleDecorationUpdate(editor);
                        this.scheduleNotifyChanges([editor.document.uri]);
                    }
                    return;
                }

                const change = event.contentChanges[0];
                const isDeletion = change && change.rangeLength > 0 && change.text.length === 0;

                if (isDeletion) {
                    // BUG 1 fix: Deletions don't move the cursor, so the selection-confirmation
                    // gate would discard them (no selection event fires within 50ms for forward delete).
                    // Auto-confirm deletions immediately.
                    try {
                        await this.handleTrackedEdits(event, editor);
                    } finally {
                        this.documentShadow.set(docUri, editor.document.getText());
                    }
                } else {
                    // Existing gate logic for insertions and substitutions
                    const shadowSnapshot = this.documentShadow.get(docUri) ?? editor.document.getText();
                    if (this.unconfirmedTrackedEdit) {
                        getOutputChannel()?.appendLine(
                            '[tracking] Overwriting previous unconfirmed edit (rapid typing — only latest keystroke processed)'
                        );
                    }
                    this.unconfirmedTrackedEdit = { event, editor, shadowSnapshot };

                    // Safety timeout: discard if no selection event confirms within 50ms
                    if (this.unconfirmedEditTimer) clearTimeout(this.unconfirmedEditTimer);
                    this.unconfirmedEditTimer = setTimeout(() => {
                        if (this.unconfirmedTrackedEdit) {
                            getOutputChannel()?.appendLine(
                                '[tracking] Discarding unconfirmed edit (no selection event — likely comment widget or non-editor input)'
                            );
                            this.unconfirmedTrackedEdit = null;
                        }
                        this.unconfirmedEditTimer = null;
                    }, ExtensionController.EDIT_CONFIRMATION_TIMEOUT_MS);
                }
            }

            // Always update shadow immediately (reflects current document state)
            this.documentShadow.set(docUri, editor.document.getText());

            // Optimistic range transform: adjust cached decorations by edit delta.
            // Provides instant visual feedback while LSP round-trip is in flight.
            // LSP push (decorationData) overwrites with authoritative data.
            if (!this.localParseHotPath) {
                const transformed = transformCachedDecorations(docUri, event.contentChanges);
                if (transformed) {
                    this.scheduleDecorationUpdate(editor);
                }
            }

            // Section 11: No scheduleDecorationUpdate from document change. All content-driven
            // decoration comes from LSP push (decorationData) or getChanges bootstrap.
            // Section 11: No scheduleNotifyChanges from document change. Notify only from
            // handleDecorationDataUpdate and getChanges bootstrap.
            if (this.localParseHotPath) {
                this.scheduleDecorationUpdate(editor);
                this.scheduleNotifyChanges([editor.document.uri]);
            }
            // Send overlay to LSP when pending changes (debounced)
            if (editor.document.languageId === 'markdown' && this.trackingMode) {
                this.scheduleOverlaySend();
            }
        }, null, context.subscriptions);

        // IME composition guard: VS Code has no composition start/end API.
        // When such an API becomes available, call pendingEditManager.setComposing(true/false).
        // PendingEditManager already checks isComposing in flush() and pause timer.
        // Clear composition state when switching editors (we're not composing in the old editor).
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((prevEditor) => {
                this.pendingEditManager.setComposing(false);
                // Clear overlay for previous doc when switching; schedule send for new doc
                if (prevEditor?.document.uri) {
                    this.sendOverlayNull(prevEditor.document.uri.toString());
                }
                this.scheduleOverlaySend();
            })
        );

        // Listen to cursor position changes for cursor-aware delimiter unfolding and changeAtCursor context
        vscode.window.onDidChangeTextEditorSelection(async event => {
            const editor = event.textEditor;
            if (editor && this.isSupported(editor.document)) {
                // Selection-confirmation gate: confirm pending tracked edit.
                // This fires ~1-5ms after the text change for real editor typing.
                if (this.unconfirmedTrackedEdit &&
                    event.textEditor.document.uri.toString() ===
                    this.unconfirmedTrackedEdit.editor.document.uri.toString()) {
                    if (this.unconfirmedEditTimer) {
                        clearTimeout(this.unconfirmedEditTimer);
                        this.unconfirmedEditTimer = null;
                    }
                    const pending = this.unconfirmedTrackedEdit;
                    this.unconfirmedTrackedEdit = null;

                    // Temporarily restore the pre-edit shadow so handleTrackedEdits
                    // can correctly compute deleted/substituted text
                    const docUri = pending.editor.document.uri.toString();
                    this.documentShadow.set(docUri, pending.shadowSnapshot);

                    try {
                        await this.handleTrackedEdits(pending.event, pending.editor);
                    } finally {
                        // Restore shadow to current document state
                        this.documentShadow.set(docUri, pending.editor.document.getText());
                    }
                }
                this.updateChangeAtCursorContext(editor);
                // Flush pending edit on cursor movement when enabled (hard break)
                if (this.trackingMode && editor.document.languageId === 'markdown') {
                    const text = editor.document.getText();
                    const cursorOffset = positionToOffset(text, editor.selection.active);
                    if (this.pendingEditManager.shouldFlushOnCursorMove(cursorOffset)) {
                        await this.pendingEditManager.flush();
                    }
                }
                // Section 11: scheduleDecorationUpdate only when cache has data (cursor unfolding)
                const uri = editor.document.uri.toString();
                if (getCachedDecorationData(uri)) {
                    this.scheduleDecorationUpdate(editor);
                }
                // Send overlay to LSP (cursor move may have flushed)
                if (editor.document.languageId === 'markdown' && this.trackingMode) {
                    this.scheduleOverlaySend();
                }
            }
        }, null, context.subscriptions);

        // Listen to document save events to flush pending edits when enabled
        vscode.workspace.onWillSaveTextDocument(event => {
            const document = event.document;

            // Only flush if enabled, tracking mode is on, and document is markdown
            if (this.trackingMode && document.languageId === 'markdown') {
                // Wrap flush in timeout to prevent hanging save
                const flushWithTimeout = Promise.race([
                    this.pendingEditManager.flush(),
                    new Promise<void>((resolve) => {
                        setTimeout(() => {
                            this.logError('Flush timed out during save (5s limit)', new Error('Timeout'), false);
                            resolve(); // Allow save to proceed
                        }, 5000);
                    })
                ]);

                // Use waitUntil to ensure flush completes (or times out) before save
                event.waitUntil(flushWithTimeout);
            }
        }, null, context.subscriptions);

        // P1-15: Clean up per-document maps when a document closes to prevent memory leaks
        vscode.workspace.onDidCloseTextDocument(doc => {
            const uri = doc.uri.toString();
            this.sendOverlayNull(uri);
            this.documentShadow.delete(uri);
            this.nextScIdMap.delete(uri);
            this.documentStates.delete(uri);
            invalidateDecorationCache(uri);
            this.changeComments?.disposeThreadsForUri?.(doc.uri);
        }, null, context.subscriptions);
    }

    /**
     * Debounce notifications to listeners (SCM, Change Explorer, comments, timeline).
     * @param uris URIs of affected documents; if omitted, uses visible supported editors.
     */
    private scheduleNotifyChanges(uris?: vscode.Uri[]): void {
        if (uris?.length) {
            uris.forEach(u => this.pendingNotifyUris.add(u.toString()));
        } else {
            vscode.window.visibleTextEditors
                .filter(e => this.isSupported(e.document))
                .forEach(e => this.pendingNotifyUris.add(e.document.uri.toString()));
        }
        if (this.notifyChangesTimeout) {
            clearTimeout(this.notifyChangesTimeout);
            this.notifyChangesTimeout = null;
        }
        this.notifyChangesTimeout = setTimeout(() => {
            this.notifyChangesTimeout = null;
            const arr = Array.from(this.pendingNotifyUris).map(s => vscode.Uri.parse(s));
            this.pendingNotifyUris.clear();
            this._onDidChangeChanges.fire(arr);
        }, ExtensionController.NOTIFY_CHANGES_DEBOUNCE_MS);
    }

    /**
     * Schedule a single decoration update after a short delay. Multiple rapid
     * document/selection events coalesce into one parse + decorate run to avoid
     * renderer CPU spikes (keystrokes, cursor moves).
     */
    private scheduleDecorationUpdate(editor: vscode.TextEditor): void {
        const uri = editor.document.uri.toString();
        if (this.decorationUpdateTimeout) {
            clearTimeout(this.decorationUpdateTimeout);
            this.decorationUpdateTimeout = null;
        }
        this.decorationUpdateUri = uri;
        this.decorationUpdateTimeout = setTimeout(() => {
            this.decorationUpdateTimeout = null;
            this.decorationUpdateUri = null;
            const active = vscode.window.activeTextEditor;
            if (active && active.document.uri.toString() === uri && this.isSupported(active.document)) {
                this.updateDecorations(active);
                this.updateChangeAtCursorContext(active);
            }
        }, ExtensionController.DECORATION_DEBOUNCE_MS);
    }

    /**
     * Set the ChangeComments reference for Layer 2 comment-reply guard.
     */
    public setChangeComments(comments: { isCommentReplyActive: boolean; disposeThreadsForUri?(uri: vscode.Uri): void }): void {
        this.changeComments = comments;
    }

    /**
     * Run an async function with the isApplyingTrackedEdit guard active.
     * Use this from extension.ts when Comment API handlers (createComment,
     * replyToThread) perform WorkspaceEdits that should NOT be re-wrapped
     * by the tracking handler.
     */
    public async runWithTrackedEditGuard<T>(fn: () => PromiseLike<T> | T): Promise<T> {
        this.isApplyingTrackedEdit = true;
        try {
            return await fn();
        } finally {
            this.isApplyingTrackedEdit = false;
        }
    }

    /**
     * Set the overlay sender (extension wires after LSP client is ready).
     * Called with (uri, overlay) to send changetracks/pendingOverlay to LSP.
     */
    public setOverlaySender(send: (uri: string, overlay: PendingOverlay | null) => void): void {
        this.overlaySender = send;
    }

    /**
     * Set the view mode sender (extension wires after LSP client is ready).
     * Called with (uri, viewMode) to send changetracks/setViewMode to LSP server.
     */
    public setViewModeSender(send: (uri: string, viewMode: ViewMode) => void): void {
        this.viewModeSender = send;
    }

    /**
     * Set the LSP client for getChanges bootstrap (Section 11).
     * When cache is empty and decoration is needed, controller calls getChanges.
     */
    public setGetChangesClient(client: { sendRequest: (method: string, params: { textDocument: { uri: string } }) => Promise<{ changes: ChangeNode[] }> } | null): void {
        this.getChangesClient = client;
    }

    /**
     * Debounced overlay send. Sends overlay for active document to LSP.
     * Clears previous URI when switching docs.
     */
    private scheduleOverlaySend(): void {
        if (!this.overlaySender) return;
        if (this.overlaySendTimeout) clearTimeout(this.overlaySendTimeout);
        this.overlaySendTimeout = setTimeout(() => {
            this.overlaySendTimeout = null;
            const editor = vscode.window.activeTextEditor;
            const uri = editor?.document.uri.toString();
            const overlay = uri ? this.pendingEditManager.getPendingOverlay(uri) : null;
            if (this.lastOverlayUri && this.lastOverlayUri !== uri) {
                this.overlaySender!(this.lastOverlayUri, null);
                this.lastOverlayUri = null;
            }
            if (uri) {
                this.overlaySender!(uri, overlay);
                this.lastOverlayUri = overlay ? uri : null;
            }
        }, ExtensionController.OVERLAY_SEND_DEBOUNCE_MS);
    }

    /**
     * Send overlay=null for a URI immediately (doc close, editor switch).
     */
    private sendOverlayNull(uri: string): void {
        if (!this.overlaySender) return;
        this.overlaySender(uri, null);
        if (this.lastOverlayUri === uri) this.lastOverlayUri = null;
    }

    /**
     * Called when LSP sends decoration data. Refreshes decorations for all
     * visible editors showing the document and notifies consumers (SCM, panel, resolved).
     * Fixes the bug where LSP push never triggered refresh.
     */
    public handleDecorationDataUpdate(uri: string, _changes: ChangeNode[]): void {
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.toString() === uri && this.isSupported(editor.document)) {
                this.updateDecorations(editor);
                if (editor === vscode.window.activeTextEditor) {
                    this.updateChangeAtCursorContext(editor);
                }
            }
        }
        this.scheduleNotifyChanges([vscode.Uri.parse(uri)]);
    }

    public updateDecorations(editor: vscode.TextEditor) {
        if (!this.isSupported(editor.document)) {
            return;
        }

        try {
            const text = editor.document.getText();
            const languageId = editor.document.languageId;
            const uri = editor.document.uri.toString();

            // Section 11: when cache empty and LSP client available, bootstrap via getChanges
            const cached = getCachedDecorationData(uri);
            if (!cached && this.getChangesClient && !this.getChangesInFlight.has(uri)) {
                this.getChangesInFlight.add(uri);
                this.getChangesClient.sendRequest('changetracks/getChanges', { textDocument: { uri } })
                    .then(({ changes }) => {
                        setCachedDecorationData(uri, changes);
                        this.handleDecorationDataUpdate(uri, changes);
                    })
                    .catch((err: any) => {
                        getOutputChannel()?.appendLine(`[getChanges] Error for ${uri}: ${err?.message ?? err}`);
                    })
                    .finally(() => {
                        this.getChangesInFlight.delete(uri);
                    });
            }

            // If hot path enabled, always parse locally for instant decoration
            if (this.localParseHotPath) {
                const virtualDoc = this.workspace.parse(text, languageId);
                this.decorator.decorate(editor, virtualDoc, this._viewMode, text, this._showCriticMarkup);
                return;
            }

            const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId);

            this.decorator.decorate(editor, virtualDoc, this._viewMode, text, this._showCriticMarkup);
            // Do not notify here: notify only from handleDecorationDataUpdate and getChanges bootstrap.
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
        if (!this.isSupported(doc)) {
            return [];
        }
        const uri = doc.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, doc.getText(), doc.languageId);
        return virtualDoc.getChanges();
    }

    /**
     * Reveal a change by ID in the active editor (e.g. from Change Explorer tree click).
     */
    public revealChangeById(changeId: string): void {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }
        const changes = this.getChangesForDocument(editor.document);
        const change = changes.find(c => c.id === changeId);
        if (!change) {
            return;
        }
        const text = editor.document.getText();
        const range = coreRangeToVscode(text, change.range);
        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }

    public async toggleTracking() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this.isSupported(editor.document)) return;

        const text = editor.document.getText();
        const currentlyTracked = this._trackingMode;
        const newValue = currentlyTracked ? 'untracked' : 'tracked';
        const header = `<!-- ctrcks.com/v1: ${newValue} -->`;

        const headerRegex = /^<!--\s*ctrcks\.com\/v1:\s*(tracked|untracked)\s*-->/m;
        const headerMatch = text.match(headerRegex);

        // Flip local state immediately for responsiveness
        this._trackingMode = !this._trackingMode;
        this.setContextKey('changetracks:trackingEnabled', this._trackingMode);

        if (this._trackingMode && editor) {
            const docUri = editor.document.uri.toString();
            const docText = editor.document.getText();
            this.documentShadow.set(docUri, docText);
            const maxId = scanMaxCtId(docText);
            this.nextScIdMap.set(docUri, maxId + 1);
        }

        // CRITICAL: Guard against re-entrancy. Without this, the header write
        // fires onDidChangeTextDocument → handleTrackedEdits wraps the header
        // in {++...++} → infinite recursion. Same guard used by PendingEditManager.
        this.isApplyingTrackedEdit = true;
        try {
            if (headerMatch) {
                // Update existing header in place
                const matchStart = text.indexOf(headerMatch[0]);
                const startPos = editor.document.positionAt(matchStart);
                const endPos = editor.document.positionAt(matchStart + headerMatch[0].length);
                await editor.edit(eb => eb.replace(new vscode.Range(startPos, endPos), header));
            } else {
                // Insert at line 0
                await editor.edit(eb => eb.insert(new vscode.Position(0, 0), header + '\n'));
            }
        } finally {
            this.isApplyingTrackedEdit = false;
        }

        vscode.window.showInformationMessage(`ChangeTracks Tracking: ${this._trackingMode ? 'ON' : 'OFF'}`);
        this.scheduleNotifyChanges();
    }

    /**
     * Called when LSP sends changetracks/documentState.
     * Updates context keys and notifies consumers.
     */
    public setDocumentState(uri: string, state: { tracking: { enabled: boolean; source: string }; viewMode: string }): void {
        this.documentStates.set(uri, state);
        // Update local tracking state for active document
        if (uri === vscode.window.activeTextEditor?.document.uri.toString()) {
            this._trackingMode = state.tracking.enabled;
            this.setContextKey('changetracks:trackingEnabled', state.tracking.enabled);
        }
        this.scheduleNotifyChanges();
    }

    /**
     * Check if tracking is enabled for a specific document.
     * Returns resolved state from LSP, falling back to local state.
     */
    public isTrackingEnabled(uri?: string): boolean {
        if (uri) {
            const state = this.documentStates.get(uri);
            if (state) return state.tracking.enabled;
        }
        return this._trackingMode;
    }

    public setViewMode(mode: ViewMode) {
        this._viewMode = mode;
        this.setContextKey('changetracks:viewMode', mode);

        // Notify LSP server of view mode change (for semantic token filtering).
        // Send for all visible supported documents so the server updates its per-URI state.
        if (this.viewModeSender) {
            for (const editor of vscode.window.visibleTextEditors) {
                if (this.isSupported(editor.document)) {
                    this.viewModeSender(editor.document.uri.toString(), mode);
                }
            }
        }

        // Update decorations for all visible editors
        vscode.window.visibleTextEditors.forEach(editor => {
            if (this.isSupported(editor.document)) {
                this.updateDecorations(editor);
            }
        });

        // Phase 5: Fire change event so panel refreshes when view mode changes
        this.scheduleNotifyChanges();

        vscode.window.showInformationMessage(`ChangeTracks View: ${mode}`);
    }

    public cycleViewMode() {
        this.setViewMode(nextViewMode(this._viewMode));
    }

    /** @deprecated Use cycleViewMode() instead. Kept for backward compatibility with tests. */
    public toggleView() {
        this.cycleViewMode();
    }

    public get trackingMode(): boolean {
        return this._trackingMode;
    }


    public get viewMode(): ViewMode {
        return this._viewMode;
    }

    private setContextKey(key: string, value: boolean | string) {
        vscode.commands.executeCommand('setContext', key, value);
    }

    /**
     * Update changetracks:changeAtCursor context key when cursor moves or document changes.
     * Used for Keep/Undo keybinding (cmd+y / cmd+n) so they only apply when cursor is inside a change.
     */
    private updateChangeAtCursorContext(editor: vscode.TextEditor): void {
        if (!this.isSupported(editor.document) || editor.document.languageId !== 'markdown') {
            this.setContextKey('changetracks:changeAtCursor', false);
            return;
        }
        const text = editor.document.getText();
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, editor.document.languageId);
        const cursorOffset = positionToOffset(text, editor.selection.active);
        const change = this.workspace.changeAtOffset(virtualDoc, cursorOffset);
        this.setContextKey('changetracks:changeAtCursor', change !== null);
    }

    /**
     * Navigate to the next change from current cursor position
     */
    public async nextChange(): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);
        const changes = virtualDoc.getChanges();

        if (changes.length === 0) {
            vscode.window.showInformationMessage('No changes found in document');
            return;
        }

        const cursorOffset = positionToOffset(text, editor.selection.active);
        const change = this.workspace.nextChange(virtualDoc, cursorOffset);

        if (change) {
            // Detect wrap-around: next change is before/at cursor means we wrapped to start
            if (change.range.start <= cursorOffset) {
                vscode.window.showInformationMessage('Wrapped to first change');
            }
            const range = coreRangeToVscode(text, change.range);
            editor.selection = new vscode.Selection(range.start, range.start);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    }

    /**
     * Navigate to the previous change from current cursor position
     */
    public async previousChange(): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);
        const changes = virtualDoc.getChanges();

        if (changes.length === 0) {
            vscode.window.showInformationMessage('No changes found in document');
            return;
        }

        const cursorOffset = positionToOffset(text, editor.selection.active);
        const change = this.workspace.previousChange(virtualDoc, cursorOffset);

        if (change) {
            // Detect wrap-around: previous change is at/after cursor means we wrapped to end
            if (change.range.start >= cursorOffset) {
                vscode.window.showInformationMessage('Wrapped to last change');
            }
            const range = coreRangeToVscode(text, change.range);
            editor.selection = new vscode.Selection(range.start, range.start);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    }

    /**
     * Navigate to the linked change in a move group.
     * If cursor is on a move-from, jump to move-to, and vice versa.
     */
    public async goToLinkedChange(): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);

        const cursorOffset = positionToOffset(text, editor.selection.active);
        const change = this.workspace.changeAtOffset(virtualDoc, cursorOffset);

        if (!change || !change.groupId || !change.moveRole) {
            vscode.window.showInformationMessage('No linked change found at cursor');
            return;
        }

        // Find the other member with opposite moveRole
        const members = virtualDoc.getGroupMembers(change.groupId);
        const targetRole = change.moveRole === 'from' ? 'to' : 'from';
        const linked = members.find((m: ChangeNode) => m.moveRole === targetRole);

        if (!linked) {
            vscode.window.showInformationMessage('Linked change not found in document');
            return;
        }

        const range = coreRangeToVscode(text, linked.range);
        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }

    /**
     * Insert a comment at cursor or wrap selection in comment.
     * Respects changetracks.commentInsertFormat (inline | footnote) and
     * changetracks.commentInsertAuthor. Default: footnote with author.
     * @param predefinedText Optional text to use instead of prompting (for testing)
     */
    public async addComment(predefinedText?: string): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor || editor.document.languageId !== 'markdown') {
            return;
        }

        const config = vscode.workspace.getConfiguration('changetracks');
        const format = config.get<'inline' | 'footnote'>('commentInsertFormat', 'footnote');
        const includeAuthor = config.get<boolean>('commentInsertAuthor', true);

        const text = editor.document.getText();
        const selection = editor.selection;
        const selectedText = selection.isEmpty ? '' : editor.document.getText(selection);

        let commentText = predefinedText;

        if (commentText === undefined) {
            commentText = await vscode.window.showInputBox({
                placeHolder: 'Enter your comment...',
                prompt: selectedText ? `Add comment to "${selectedText}"` : 'Insert comment'
            });
        }

        if (commentText === undefined) {
            return; // Cancelled
        }

        const cursorOffset = positionToOffset(text, selection.active);

        if (format === 'footnote') {
            const author = includeAuthor ? (this.getAuthor() ?? 'unknown') : undefined;
            const date = new Date().toISOString().slice(0, 10);
            const maxId = scanMaxCtId(text);
            const newId = `ct-${maxId + 1}`;

            const inlineEdit = selection.isEmpty
                ? this.workspace.insertComment(commentText, cursorOffset)
                : this.workspace.insertComment(
                    commentText,
                    cursorOffset,
                    { start: positionToOffset(text, selection.start), end: positionToOffset(text, selection.end) },
                    selectedText
                );
            const inlinePart = inlineEdit.newText + `[^${newId}]`;
            const footnoteDef = generateFootnoteDefinition(newId, 'comment', author, date);
            const firstLine = author ? formatReply(author, commentText) : '\n    ' + commentText.replace(/\n/g, '\n    ');
            const footnoteBlock = footnoteDef + firstLine;

            const simulatedText = text.slice(0, inlineEdit.offset) + inlinePart + text.slice(inlineEdit.offset + inlineEdit.length);
            const finalText = appendFootnote(simulatedText, footnoteBlock);

            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(text.length)
            );
            const wsEdit = new vscode.WorkspaceEdit();
            wsEdit.replace(editor.document.uri, fullRange, finalText);
            this.isApplyingTrackedEdit = true;
            try {
                await vscode.workspace.applyEdit(wsEdit);
            } finally {
                this.isApplyingTrackedEdit = false;
            }
        } else {
            const body = includeAuthor ? (() => {
                const author = this.getAuthor();
                return author ? `@${author}: ${commentText}` : commentText;
            })() : commentText;
            let edit: { offset: number; length: number; newText: string };
            if (selection.isEmpty) {
                edit = this.workspace.insertComment(body, cursorOffset);
            } else {
                const selectionRange = {
                    start: positionToOffset(text, selection.start),
                    end: positionToOffset(text, selection.end)
                };
                edit = this.workspace.insertComment(body, cursorOffset, selectionRange, selectedText);
            }
            const vscodeEdit = coreEditToVscode(text, edit);
            this.isApplyingTrackedEdit = true;
            try {
                await editor.edit(editBuilder => {
                    editBuilder.replace(vscodeEdit.range, vscodeEdit.newText);
                });
            } finally {
                this.isApplyingTrackedEdit = false;
            }
        }

        this.updateDecorations(editor);
    }

    /**
     * Log error to output channel and optionally show notification
     */
    private logError(message: string, error: any, showNotification: boolean = false): void {
        try {
            const ch = getOutputChannel();
            if (ch) {
                const timestamp = new Date().toISOString();
                ch.appendLine(`[${timestamp}] ERROR: ${message}`);
                if (error) {
                    if (error instanceof Error) {
                        ch.appendLine(`  Message: ${error.message}`);
                        if (error.stack) {
                            ch.appendLine(`  Stack: ${error.stack}`);
                        }
                    } else {
                        ch.appendLine(`  Details: ${JSON.stringify(error)}`);
                    }
                }
            }
        } catch (e) {
            // Fallback to console if output channel unavailable
            console.error('ChangeTracks Error:', message, error);
        }

        if (showNotification) {
            vscode.window.showErrorMessage(`ChangeTracks: ${message}`);
        }
    }

    /**
     * Handle tracked edits when tracking mode is enabled
     * NOTE: Shadow updates are now handled by the caller to ensure they happen AFTER async operations
     */
    private async handleTrackedEdits(event: vscode.TextDocumentChangeEvent, editor: vscode.TextEditor): Promise<void> {
        try {
            const docUri = editor.document.uri.toString();

        // Ensure shadow exists for this document
        if (!this.documentShadow.has(docUri)) {
            // This shouldn't happen in normal flow, but initialize shadow if missing
            // Use the current text since we don't have the previous state
            this.documentShadow.set(docUri, editor.document.getText());
        }

        // Skip if we're applying our own tracked edit (prevents recursion)
        if (this.isApplyingTrackedEdit) {
            // Shadow will be updated by caller
            return;
        }

        // Layer 2: Comment controller activity flag (defense in depth).
        // If a comment thread is expanded, the peek widget is likely visible
        // and keystrokes should not be tracked.
        if (this.changeComments?.isCommentReplyActive) {
            getOutputChannel()?.appendLine('[tracking] skip: comment reply active (Layer 2 guard)');
            return;
        }

        if (event.contentChanges.length !== 1) {
            // Multi-change edit (paste or autocomplete) - treat as paste-like operation
            // Flush any pending edit first
            getOutputChannel()?.appendLine(`[tracking] multi-change guard: ${event.contentChanges.length} changes, flushing pending`);
            await this.pendingEditManager.flush();

            // Note: The actual multi-change has already been applied to the document
            // We could wrap it here, but for now just ensure pending edits are flushed
            // Shadow updated by caller
            return;
        }

        const change = event.contentChanges[0];

        const isInsertion = change.rangeLength === 0 && change.text.length > 0;
        const isDeletion = change.rangeLength > 0 && change.text.length === 0;
        const isSubstitution = change.rangeLength > 0 && change.text.length > 0;

        const changeKind = isInsertion ? 'insertion' : isDeletion ? 'deletion' : isSubstitution ? 'substitution' : 'unknown';
        const escapedText = change.text.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        getOutputChannel()?.appendLine(`[tracking] handleTrackedEdits: ${changeKind} '${escapedText}' rangeLen=${change.rangeLength} at ${change.range.start.line}:${change.range.start.character}`);

        // Don't track CriticMarkup syntax (prevents double-wrapping)
        if (this.isCriticMarkupSyntax(change.text)) {
            getOutputChannel()?.appendLine('[tracking] skip: CriticMarkup syntax');
            // Shadow will be updated by caller
            return;
        }


        // Skip standalone whitespace insertions ONLY when no pending edit is active.
        // When a pending edit exists, whitespace (spaces, tabs) must flow through to
        // PendingEditManager so it can extend the buffer — otherwise "hello world"
        // becomes two separate insertions because the space breaks adjacency tracking.
        if (/^[ \t]+$/.test(change.text) && isInsertion && !this.pendingEditManager.hasPendingEdit()) {
            getOutputChannel()?.appendLine('[tracking] skip: standalone whitespace (space/tab), no pending edit');
            // Shadow will be updated by caller
            return;
        }

        if (isInsertion) {
            const text = editor.document.getText();
            const insertOffset = positionToOffset(text, change.range.start);
            const result = this.pendingEditManager.handleEdit('insertion', insertOffset, change.text);
            if (result instanceof Promise) {
                await result;
            }
            // Shadow will be updated by caller after this method completes
        } else if (isDeletion) {
            const shadowText = this.documentShadow.get(docUri);
            if (shadowText) {
                const shadowOffset = positionToOffset(shadowText, change.range.start);
                const deletedText = shadowText.substring(shadowOffset, shadowOffset + change.rangeLength);
                if (this.isCriticMarkupSyntax(deletedText)) {
                    return;
                }
                const currentOffset = positionToOffset(editor.document.getText(), change.range.start);
                const result = this.pendingEditManager.handleEdit('deletion', currentOffset, '', deletedText);
                if (result instanceof Promise) {
                    await result;
                }
            }
            // Shadow will be updated by caller after async operation completes
        } else if (isSubstitution) {
            const shadowText = this.documentShadow.get(docUri);
            if (shadowText) {
                const shadowOffset = positionToOffset(shadowText, change.range.start);
                const oldText = shadowText.substring(shadowOffset, shadowOffset + change.rangeLength);
                if (this.isCriticMarkupSyntax(oldText)) {
                    return;
                }
                const currentOffset = positionToOffset(editor.document.getText(), change.range.start);
                const result = this.pendingEditManager.handleEdit('substitution', currentOffset, change.text, oldText);
                if (result instanceof Promise) {
                    await result;
                }
            }
            // Shadow will be updated by caller after async operation completes
        }

        // Note: All shadow updates now happen in the caller (onDidChangeTextDocument)
        // after this async method completes, ensuring they happen AFTER async operations
        } catch (error) {
            // Log error and recover gracefully
            this.logError('Error in handleTrackedEdits', error, false);

            // Clear pending state to prevent corruption
            try {
                await this.pendingEditManager.flush();
            } catch (flushError) {
                this.logError('Error during recovery flush', flushError, false);
            }

            // Shadow will be updated by caller
            // Don't show notification for routine tracking errors
            // Extension continues to function normally
        }
    }

    /**
     * Check if text contains CriticMarkup syntax to avoid double-wrapping
     */
    private isCriticMarkupSyntax(text: string): boolean {
        return text.includes('{++') || text.includes('{--') || text.includes('{~~') ||
            text.includes('{==') || text.includes('{>>') ||
            text.includes('[^ct-');
    }

    /**
     * Accept a change by ID (from CodeLens) or at the current cursor position.
     * If the change belongs to a move group, all group members are accepted together.
     */
    public async acceptChangeAtCursor(changeId?: string): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);

        let change: ChangeNode | null | undefined;
        if (changeId) {
            change = virtualDoc.getChanges().find((c: ChangeNode) => c.id === changeId) ?? null;
        } else {
            const cursorOffset = positionToOffset(text, editor.selection.active);
            change = this.workspace.changeAtOffset(virtualDoc, cursorOffset);
        }

        if (!change) {
            vscode.window.showInformationMessage('No change found at cursor position');
            return;
        }

        // Group-aware: if change belongs to a move group, accept all members
        const coreEdits = change.groupId
            ? this.workspace.acceptGroup(virtualDoc, change.groupId, text)
            : this.workspace.acceptChange(change, text, languageId);

        const changeIds = change.groupId
            ? virtualDoc.getGroupMembers(change.groupId).map((c: ChangeNode) => c.id).filter(Boolean)
            : change.id ? [change.id] : [];
        const changesForApproval = change.groupId
            ? virtualDoc.getGroupMembers(change.groupId)
            : [change];
        this.pushApprovalLineEdits(text, changeIds, 'accepted', coreEdits, changesForApproval);

        const sorted = [...coreEdits].sort((a, b) => b.offset - a.offset);
        await editor.edit(editBuilder => {
            for (const edit of sorted) {
                const vscodeEdit = coreEditToVscode(text, edit);
                editBuilder.replace(vscodeEdit.range, vscodeEdit.newText);
            }
        });
        invalidateDecorationCache(editor.document.uri.toString());
        vscode.window.showInformationMessage('Change accepted');
    }

    /**
     * Reject a change by ID (from CodeLens) or at the current cursor position.
     * If the change belongs to a move group, all group members are rejected together.
     */
    public async rejectChangeAtCursor(changeId?: string): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);

        let change: ChangeNode | null | undefined;
        if (changeId) {
            change = virtualDoc.getChanges().find((c: ChangeNode) => c.id === changeId) ?? null;
        } else {
            const cursorOffset = positionToOffset(text, editor.selection.active);
            change = this.workspace.changeAtOffset(virtualDoc, cursorOffset);
        }

        if (!change) {
            vscode.window.showInformationMessage('No change found at cursor position');
            return;
        }

        // Group-aware: if change belongs to a move group, reject all members
        const coreEdits = change.groupId
            ? this.workspace.rejectGroup(virtualDoc, change.groupId, text)
            : this.workspace.rejectChange(change, text, languageId);

        const changeIds = change.groupId
            ? virtualDoc.getGroupMembers(change.groupId).map((c: ChangeNode) => c.id).filter(Boolean)
            : change.id ? [change.id] : [];
        this.pushApprovalLineEdits(text, changeIds, 'rejected', coreEdits);

        const sorted = [...coreEdits].sort((a, b) => b.offset - a.offset);
        await editor.edit(editBuilder => {
            for (const edit of sorted) {
                const vscodeEdit = coreEditToVscode(text, edit);
                editBuilder.replace(vscodeEdit.range, vscodeEdit.newText);
            }
        });
        invalidateDecorationCache(editor.document.uri.toString());
        vscode.window.showInformationMessage('Change rejected');
    }

    /**
     * Accept all pending changes in the document
     */
    public async acceptAllChanges(): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);
        const changes = virtualDoc.getChanges();

        if (changes.length === 0) {
            vscode.window.showInformationMessage('No changes found in document');
            return;
        }

        if (!await this.confirmBulkAction('Accept', changes.length)) return;

        const coreEdits = this.workspace.acceptAll(virtualDoc, text, languageId);
        const changeIds = changes.map((c: ChangeNode) => c.id).filter((id: string | undefined): id is string => Boolean(id));
        this.pushApprovalLineEdits(text, changeIds, 'accepted', coreEdits, changes);

        const sorted = [...coreEdits].sort((a, b) => b.offset - a.offset);
        await editor.edit(editBuilder => {
            for (const coreEdit of sorted) {
                const vscodeEdit = coreEditToVscode(text, coreEdit);
                editBuilder.replace(vscodeEdit.range, vscodeEdit.newText);
            }
        });
        invalidateDecorationCache(editor.document.uri.toString());

        vscode.window.showInformationMessage(`Accepted ${changes.length} change${changes.length === 1 ? '' : 's'}`);
    }

    /**
     * Reject all pending changes in the document
     */
    public async rejectAllChanges(): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);
        const changes = virtualDoc.getChanges();

        if (changes.length === 0) {
            vscode.window.showInformationMessage('No changes found in document');
            return;
        }

        if (!await this.confirmBulkAction('Reject', changes.length)) return;

        const coreEdits = this.workspace.rejectAll(virtualDoc, text, languageId);
        const changeIds = changes.map((c: ChangeNode) => c.id).filter((id: string | undefined): id is string => Boolean(id));
        this.pushApprovalLineEdits(text, changeIds, 'rejected', coreEdits);

        const sorted = [...coreEdits].sort((a, b) => b.offset - a.offset);
        await editor.edit(editBuilder => {
            for (const coreEdit of sorted) {
                const vscodeEdit = coreEditToVscode(text, coreEdit);
                editBuilder.replace(vscodeEdit.range, vscodeEdit.newText);
            }
        });
        invalidateDecorationCache(editor.document.uri.toString());

        vscode.window.showInformationMessage(`Rejected ${changes.length} change${changes.length === 1 ? '' : 's'}`);
    }

    /**
     * Accept all pending changes in the document at the given URI.
     * Used from SCM context menu (file-scoped accept all).
     */
    public async acceptAllInDocument(uri: vscode.Uri): Promise<void> {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
            ?? await vscode.workspace.openTextDocument(uri);
        if (!this.isSupported(doc)) return;
        const text = doc.getText();
        const languageId = doc.languageId;
        const uriStr = uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uriStr, text, languageId);
        const changes = virtualDoc.getChanges();
        if (changes.length === 0) return;
        if (!await this.confirmBulkAction('Accept', changes.length)) return;
        const coreEdits = this.workspace.acceptAll(virtualDoc, text, languageId);
        const changeIds = changes.map((c: ChangeNode) => c.id).filter((id: string | undefined): id is string => Boolean(id));
        this.pushApprovalLineEdits(text, changeIds, 'accepted', coreEdits, changes);
        const wsEdit = new vscode.WorkspaceEdit();
        const sorted = [...coreEdits].sort((a, b) => b.offset - a.offset);
        for (const coreEdit of sorted) {
            const { range, newText } = coreEditToVscode(text, coreEdit);
            wsEdit.replace(uri, range, newText);
        }
        const applied = await vscode.workspace.applyEdit(wsEdit);
        if (applied) {
            invalidateDecorationCache(uri.toString());
            // Section 11: LSP receives didChange, sends decorationData → handleDecorationDataUpdate fires
        }
    }

    /**
     * Reject all pending changes in the document at the given URI.
     * Used from SCM context menu (file-scoped reject all).
     */
    public async rejectAllInDocument(uri: vscode.Uri): Promise<void> {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
            ?? await vscode.workspace.openTextDocument(uri);
        if (!this.isSupported(doc)) return;
        const text = doc.getText();
        const languageId = doc.languageId;
        const uriStr = uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uriStr, text, languageId);
        const changes = virtualDoc.getChanges();
        if (changes.length === 0) return;
        if (!await this.confirmBulkAction('Reject', changes.length)) return;
        const coreEdits = this.workspace.rejectAll(virtualDoc, text, languageId);
        const changeIds = changes.map((c: ChangeNode) => c.id).filter((id: string | undefined): id is string => Boolean(id));
        this.pushApprovalLineEdits(text, changeIds, 'rejected', coreEdits);
        const wsEdit = new vscode.WorkspaceEdit();
        const sorted = [...coreEdits].sort((a, b) => b.offset - a.offset);
        for (const coreEdit of sorted) {
            const { range, newText } = coreEditToVscode(text, coreEdit);
            wsEdit.replace(uri, range, newText);
        }
        const applied = await vscode.workspace.applyEdit(wsEdit);
        if (applied) {
            invalidateDecorationCache(uri.toString());
            // Section 11: LSP receives didChange, sends decorationData → handleDecorationDataUpdate fires
        }
    }

    /**
     * Compact a change from Level 2 to Level 1: removes the footnote ref and definition,
     * inserts an adjacent comment with the header fields. Only works on accepted/rejected changes.
     * If changeId is provided, finds the change by ID; otherwise uses cursor position.
     */
    public async compactChange(changeId?: string): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);

        let change: ChangeNode | null | undefined;
        if (changeId) {
            change = virtualDoc.getChanges().find((c: ChangeNode) => c.id === changeId) ?? null;
        } else {
            const cursorOffset = positionToOffset(text, editor.selection.active);
            change = this.workspace.changeAtOffset(virtualDoc, cursorOffset);
        }

        if (!change) {
            vscode.window.showInformationMessage('No change found at cursor position');
            return;
        }

        if (change.status !== ChangeStatus.Accepted && change.status !== ChangeStatus.Rejected) {
            vscode.window.showInformationMessage('Compact is only available for accepted or rejected changes');
            return;
        }

        if (!change.id) {
            vscode.window.showInformationMessage('Change has no ID — cannot compact');
            return;
        }

        const newText = compactToLevel1(text, change.id);
        if (newText === text) {
            vscode.window.showInformationMessage('Change is already at Level 1 or has no footnote to compact');
            return;
        }

        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(text.length)
        );
        await editor.edit(editBuilder => {
            editBuilder.replace(fullRange, newText);
        });
        invalidateDecorationCache(editor.document.uri.toString());
        vscode.window.showInformationMessage('Change compacted (L2 → L1)');
    }

    /**
     * Fully compact a change to Level 0: if Level 2, first compacts to L1, then removes
     * the adjacent comment. Only works on accepted/rejected changes.
     * If changeId is provided, finds the change by ID; otherwise uses cursor position.
     */
    public async compactChangeFully(changeId?: string): Promise<void> {
        const editor = this.findSupportedEditor();
        if (!editor) {
            return;
        }

        let text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        let virtualDoc = this.getVirtualDocumentFor(uri, text, languageId, true);

        let change: ChangeNode | null | undefined;
        if (changeId) {
            change = virtualDoc.getChanges().find((c: ChangeNode) => c.id === changeId) ?? null;
        } else {
            const cursorOffset = positionToOffset(text, editor.selection.active);
            change = this.workspace.changeAtOffset(virtualDoc, cursorOffset);
        }

        if (!change) {
            vscode.window.showInformationMessage('No change found at cursor position');
            return;
        }

        if (change.status !== ChangeStatus.Accepted && change.status !== ChangeStatus.Rejected) {
            vscode.window.showInformationMessage('Compact is only available for accepted or rejected changes');
            return;
        }

        // If Level 2 (has a footnote ref), first compact to L1
        if (change.id) {
            const afterL1 = compactToLevel1(text, change.id);
            if (afterL1 !== text) {
                // Text changed — we moved from L2 to L1. Parse the in-memory text directly.
                // Cannot use getVirtualDocumentFor here because the LSP cache still has
                // the old L2 data — the editor hasn't been updated yet.
                text = afterL1;
                virtualDoc = this.workspace.parse(text, languageId ?? 'markdown');
                change = changeId
                    ? virtualDoc.getChanges().find((c: ChangeNode) => c.id === changeId) ?? null
                    : (() => {
                        const cursorOffset = positionToOffset(text, editor.selection.active);
                        return this.workspace.changeAtOffset(virtualDoc, cursorOffset);
                    })();
            }
        }

        if (!change) {
            vscode.window.showInformationMessage('Could not locate change after L1 compaction');
            return;
        }

        // Now compact from L1 to L0
        const changes = virtualDoc.getChanges();
        const changeIndex = changes.findIndex((c: ChangeNode) =>
            change!.id ? c.id === change!.id : c.range.start === change!.range.start
        );

        if (changeIndex === -1) {
            vscode.window.showInformationMessage('Change not found in document');
            return;
        }

        const newText = compactToLevel0(text, changeIndex);
        if (newText === text) {
            vscode.window.showInformationMessage('Change is already at Level 0 or has no adjacent comment to remove');
            return;
        }

        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
        );
        await editor.edit(editBuilder => {
            editBuilder.replace(fullRange, newText);
        });
        invalidateDecorationCache(editor.document.uri.toString());
        vscode.window.showInformationMessage('Change fully compacted (L2/L1 → L0)');
    }

    /**
     * Allocate the next ct-ID for a document. IDs are sequential per-document
     * and formatted as 'ct-N' where N starts from 1 (or max+1 if document already has ct-IDs).
     */
    private allocateScId(docUri: string): string {
        if (!this.nextScIdMap.has(docUri)) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.uri.toString() === docUri) {
                const maxId = scanMaxCtId(editor.document.getText());
                this.nextScIdMap.set(docUri, maxId + 1);
            }
        }
        const current = this.nextScIdMap.get(docUri) ?? 1;
        this.nextScIdMap.set(docUri, current + 1);
        return `ct-${current}`;
    }

    /**
     * Read author name with fallback chain.
     * Resolution order: changetracks.author → git config user.name → system username → 'unknown'.
     * When resource is provided, uses resource-scoped config so workspace/folder author is used for that document.
     */
    private getAuthor(resource?: vscode.Uri): string {
        return resolveAuthorIdentity(resource);
    }

    /**
     * Reviewer identity for accept/reject attribution (ADR-031).
     * Resolution order: changetracks.reviewerIdentity → changetracks.author setting → undefined.
     * Note: does NOT use the git/system fallback chain — reviewer attribution is opt-in.
     */
    private getReviewerIdentity(): string | undefined {
        const config = vscode.workspace.getConfiguration('changetracks');
        const reviewer = config.get<string>('reviewerIdentity', '') || config.get<string>('author', '');
        return reviewer.trim() || undefined;
    }

    private getArchiveOnAccept(): boolean {
        return vscode.workspace.getConfiguration('changetracks').get<boolean>('archiveOnAccept', true) === true;
    }

    /**
     * Show a modal confirmation dialog before a bulk accept/reject operation.
     * Returns true if the user confirmed (or if the threshold is not exceeded).
     * Controlled by changetracks.confirmBulkThreshold (default 5, 0 = disabled).
     */
    private async confirmBulkAction(action: string, count: number): Promise<boolean> {
        const threshold = vscode.workspace.getConfiguration('changetracks').get<number>('confirmBulkThreshold', 5);
        if (threshold <= 0 || count <= threshold) return true;
        const label = `${action} All`;
        try {
            const choice = await vscode.window.showWarningMessage(
                `${action} all ${count} changes?`,
                { modal: true },
                label
            );
            return choice === label;
        } catch {
            // VS Code test host refuses modal dialogs — proceed without confirmation
            return true;
        }
    }

    /**
     * Reference text to store in the footnote when archiving on accept (geological record).
     */
    private getReferenceTextForArchive(change: ChangeNode): string {
        switch (change.type) {
            case ChangeType.Insertion:
                return change.modifiedText ?? '';
            case ChangeType.Deletion:
                return change.originalText ?? '';
            case ChangeType.Substitution:
                return `${change.originalText ?? ''} ~> ${change.modifiedText ?? ''}`;
            case ChangeType.Highlight:
            case ChangeType.Comment:
                return change.originalText ?? '';
        }
    }

    /**
     * Append approval/rejection line edits for the given change IDs when reviewer identity is set.
     * When status is 'accepted' and archiveOnAccept is set, appends archive: lines with reference text.
     * Mutates the edits array. Caller must apply all edits in reverse offset order.
     */
    private pushApprovalLineEdits(
        text: string,
        changeIds: string[],
        status: 'accepted' | 'rejected',
        edits: { offset: number; length: number; newText: string }[],
        changes?: ChangeNode[]
    ): void {
        const reviewer = this.getReviewerIdentity();
        if (reviewer) {
            const date = nowTimestamp().raw;
            for (const id of changeIds) {
                if (!id) continue;
                const edit = computeApprovalLineEdit(text, id, status, { author: reviewer, date });
                if (edit) edits.push(edit);
            }
        }
        if (status === 'accepted' && this.getArchiveOnAccept() && changes?.length) {
            const idSet = new Set(changeIds.filter(Boolean));
            for (const change of changes) {
                if (!change.id || !idSet.has(change.id) || change.level < 2) continue;
                const referenceText = this.getReferenceTextForArchive(change);
                const edit = computeFootnoteArchiveLineEdit(text, change.id, referenceText);
                if (edit) edits.push(edit);
            }
        }
    }

    /**
     * Prepare cut as a move operation.
     * Called before the actual clipboard cut happens.
     * Captures the selected text and allocates a parent move ID.
     */
    public prepareCutAsMove(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) return;

        const selectedText = editor.document.getText(editor.selection);
        const docUri = editor.document.uri.toString();

        // Allocate a parent move ID (e.g., ct-17)
        const current = this.nextScIdMap.get(docUri) ?? 1;
        this.nextScIdMap.set(docUri, current + 1);

        this.pendingCut = {
            text: selectedText,
            timestamp: Date.now(),
            moveId: current,
        };

        // Set move context on PendingEditManager so the next deletion
        // wraps with a dotted child ID (e.g., [^ct-17.1])
        this.pendingEditManager.setMoveContext({
            parentId: current,
            childSuffix: '.1',
        });
    }

    /**
     * Prepare paste as move completion.
     * Called before the actual clipboard paste happens.
     * If there's a matching pending cut within 60s, sets up the
     * insertion to use the dotted child ID ([^ct-N.2]).
     */
    public preparePasteAsMove(): void {
        if (!this.pendingCut) return;

        const now = Date.now();
        const elapsed = now - this.pendingCut.timestamp;

        // 60-second timeout for cut->paste move matching
        if (elapsed > 60000) {
            this.pendingCut = null;
            return;
        }

        // Set move context for insertion
        this.pendingEditManager.setMoveContext({
            parentId: this.pendingCut.moveId,
            childSuffix: '.2',
        });

        // Emit parent footnote after a short delay (let the paste complete first)
        const moveId = this.pendingCut.moveId;
        this.pendingCut = null;

        // Schedule parent footnote emission
        setTimeout(async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const author = this.getAuthor(editor.document.uri);
            const date = new Date().toISOString().slice(0, 10);
            const footnote = generateFootnoteDefinition(`ct-${moveId}`, 'move', author, date);

            this.isApplyingTrackedEdit = true;
            try {
                const doc = editor.document;
                const endPos = doc.positionAt(doc.getText().length);
                await editor.edit(editBuilder => {
                    editBuilder.insert(endPos, footnote);
                }, { undoStopBefore: false, undoStopAfter: false });
            } finally {
                this.isApplyingTrackedEdit = false;
            }
        }, 100);
    }

    public dispose() {
        if (this.decorationUpdateTimeout) {
            clearTimeout(this.decorationUpdateTimeout);
            this.decorationUpdateTimeout = null;
        }
        this.decorationUpdateUri = null;
        if (this.overlaySendTimeout) {
            clearTimeout(this.overlaySendTimeout);
            this.overlaySendTimeout = null;
        }
        if (this.notifyChangesTimeout) {
            clearTimeout(this.notifyChangesTimeout);
            this.notifyChangesTimeout = null;
        }
        if (this.unconfirmedEditTimer) {
            clearTimeout(this.unconfirmedEditTimer);
            this.unconfirmedEditTimer = null;
        }
        this.unconfirmedTrackedEdit = null;
        this._onDidChangeChanges.dispose();
        this.decorator.dispose();
        this.pendingEditManager.dispose();

        // Clean up Maps/Sets to prevent memory leaks on extension restart
        this.documentShadow.clear();
        this.nextScIdMap.clear();
        this.pendingNotifyUris.clear();
        this.getChangesInFlight.clear();
        this.pendingCut = null;
    }
}
