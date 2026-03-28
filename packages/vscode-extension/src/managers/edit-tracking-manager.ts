import * as vscode from 'vscode';
import type { ChangeNode, PendingOverlay } from '@changedown/core';
import { scanMaxCnId, generateFootnoteDefinition, convertL3ToL2 } from '@changedown/core';
import { PendingEditManager } from '../PendingEditManager';
import { positionToOffset } from '../converters';
import { getOutputChannel } from '../output-channel';
import { DocumentStateManager } from './document-state-manager';
import { LspBridge } from './lsp-bridge';
import { setContextKey, logError, isSupported } from './shared';
import type { ExtDocumentState } from '../document-state';

// ── Standalone utility ─────────────────────────────────────────────────

/**
 * Check if text contains CriticMarkup syntax to avoid double-wrapping.
 * Exported as a standalone function for testability.
 */
export function isCriticMarkupSyntax(text: string): boolean {
    return text.includes('{++') || text.includes('{--') || text.includes('{~~') ||
        text.includes('{==') || text.includes('{>>') ||
        text.includes('[^cn-');
}

// ── Types ──────────────────────────────────────────────────────────────

export interface EditTrackingCallbacks {
    /** Resolve author identity for a resource. */
    getAuthor(resource?: vscode.Uri): string;
    /** Schedule debounced overlay send to LSP. */
    scheduleOverlaySend(): void;
    /** Send overlay=null for a URI immediately. */
    sendOverlayNull(uri: string): void;
}

// ── EditTrackingManager ────────────────────────────────────────────────

/**
 * EditTrackingManager owns the selection-confirmation gate, edit interception
 * pipeline, PendingEditManager lifecycle, tracking toggle, move operations,
 * and IME composition guard.
 *
 * Events:
 * - onDidChangeTrackingMode — fires when tracking mode changes (on/off)
 */
export class EditTrackingManager implements vscode.Disposable {
    // ── Tracking state ─────────────────────────────────────────────────
    private _trackingMode: boolean = false;
    private _isApplyingTrackedEdit: boolean = false;
    private changeComments: { isAnyThreadExpandedAtCursor(): boolean; disposeThreadsForUri?(uri: vscode.Uri): void } | null = null;

    // ── Selection-confirmation gate ────────────────────────────────────
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
    static readonly EDIT_CONFIRMATION_TIMEOUT_MS = 50;

    // ── Move operations ────────────────────────────────────────────────
    private pendingCut: { text: string; timestamp: number; moveId: number } | null = null;

    // ── PendingEditManager ─────────────────────────────────────────────
    public readonly pendingEditManager: PendingEditManager;

    // ── Events ─────────────────────────────────────────────────────────
    private readonly _onDidChangeTrackingMode = new vscode.EventEmitter<boolean>();
    /** Fires when tracking mode changes (on/off). */
    public readonly onDidChangeTrackingMode = this._onDidChangeTrackingMode.event;

    // ── Dependencies ───────────────────────────────────────────────────
    private readonly docStateManager: DocumentStateManager;
    private readonly lspBridge: LspBridge;
    private readonly callbacks: EditTrackingCallbacks;

    constructor(
        docStateManager: DocumentStateManager,
        lspBridge: LspBridge,
        callbacks: EditTrackingCallbacks,
    ) {
        this.docStateManager = docStateManager;
        this.lspBridge = lspBridge;
        this.callbacks = callbacks;

        // ── Create PendingEditManager ──────────────────────────────────
        this.pendingEditManager = new PendingEditManager(
            // applyEdit callback
            async (range, newText, _setFlag) => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    this._isApplyingTrackedEdit = true;
                    try {
                        const success = await editor.edit(editBuilder => {
                            editBuilder.replace(range, newText);
                        }, { undoStopBefore: false, undoStopAfter: false });
                        if (!success) {
                            getOutputChannel()?.appendLine('[tracking] editor.edit() rejected — document version changed during edit');
                        }
                    } finally {
                        this._isApplyingTrackedEdit = false;
                    }
                }
            },
            // getDocument callback
            (uri?: string) => {
                if (uri) {
                    for (const editor of vscode.window.visibleTextEditors) {
                        if (editor.document.uri.toString() === uri) {
                            return editor.document;
                        }
                    }
                    // Document no longer visible — return null to abandon crystallize
                    return null;
                }
                return vscode.window.activeTextEditor?.document ?? null;
            },
            // workspace
            this.docStateManager.workspace,
            // allocateScId callback
            () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return 'cn-0'; }
                return this.docStateManager.allocateScId(editor.document.uri.toString());
            },
            // onChangeTracked callback — appends footnote definition
            async (scId: string, changeType: string, l3EditOpLine?: string) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                const author = this.callbacks.getAuthor(editor.document.uri);
                const date = new Date().toISOString().slice(0, 10);
                const footnoteHeader = generateFootnoteDefinition(scId, changeType, author, date);
                const footnote = l3EditOpLine
                    ? footnoteHeader + '\n' + l3EditOpLine
                    : footnoteHeader;

                this._isApplyingTrackedEdit = true;
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
                    this._isApplyingTrackedEdit = false;
                }
            }
        );
    }

    // ── Getters / setters ──────────────────────────────────────────────

    public get trackingMode(): boolean {
        return this._trackingMode;
    }

    /** Set tracking mode directly (for header scan, LSP state, startup). */
    public setTrackingMode(value: boolean): void {
        if (this._trackingMode !== value) {
            this._trackingMode = value;
            this._onDidChangeTrackingMode.fire(value);
        }
    }

    /** Set tracking mode AND update the context key in one call. */
    public setTrackingModeWithContextKey(value: boolean): void {
        this._trackingMode = value;
        setContextKey('changedown:trackingEnabled', value);
        this._onDidChangeTrackingMode.fire(value);
    }

    /** Direct setter for raw tracking mode (no event, for rollback/startup). */
    public setTrackingModeRaw(value: boolean): void {
        this._trackingMode = value;
    }

    public get isApplyingTrackedEdit(): boolean {
        return this._isApplyingTrackedEdit;
    }

    /** Set the isApplyingTrackedEdit guard directly (for controller methods that stay in controller). */
    public set isApplyingTrackedEdit(value: boolean) {
        this._isApplyingTrackedEdit = value;
    }

    /**
     * Set the ChangeComments reference for Layer 2 comment-reply guard.
     */
    public setChangeComments(comments: { isAnyThreadExpandedAtCursor(): boolean; disposeThreadsForUri?(uri: vscode.Uri): void }): void {
        this.changeComments = comments;
    }

    /** Expose changeComments for controller to check in close handler. */
    public getChangeComments(): { isAnyThreadExpandedAtCursor(): boolean; disposeThreadsForUri?(uri: vscode.Uri): void } | null {
        return this.changeComments;
    }

    // ── Edit guard ─────────────────────────────────────────────────────

    /**
     * Run an async function with the isApplyingTrackedEdit guard active.
     * Use this from extension.ts when Comment API handlers (createComment,
     * replyToThread) perform WorkspaceEdits that should NOT be re-wrapped
     * by the tracking handler.
     */
    public async runWithTrackedEditGuard<T>(fn: () => PromiseLike<T> | T): Promise<T> {
        this._isApplyingTrackedEdit = true;
        try {
            return await fn();
        } finally {
            this._isApplyingTrackedEdit = false;
        }
    }

    // ── Config ─────────────────────────────────────────────────────────

    /**
     * Apply edit-boundary settings from config to PendingEditManager.
     * flushOnCursorMove and flushOnSave are always true (core behavior / data integrity).
     * pasteMinChars is hardcoded to 50.
     */
    public applyEditBoundaryConfig(config: vscode.WorkspaceConfiguration): void {
        const pauseMs = config.get<number>('editBoundary.pauseThresholdMs', 30000);
        const breakOnNewline = config.get<boolean>('editBoundary.breakOnNewline', true);

        this.pendingEditManager.setPauseThresholdMs(pauseMs);
        this.pendingEditManager.setPasteMinChars(50);
        this.pendingEditManager.setBreakOnNewline(breakOnNewline);
    }

    // ── Tracking toggle ────────────────────────────────────────────────

    public async toggleTracking(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isSupported(editor.document)) return;

        const text = editor.document.getText();
        const currentlyTracked = this._trackingMode;
        const newValue = currentlyTracked ? 'untracked' : 'tracked';
        const header = `<!-- changedown.com/v1: ${newValue} -->`;

        const headerRegex = /^<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/m;
        const headerMatch = text.match(headerRegex);

        // Flip local state immediately for responsiveness
        this._trackingMode = !this._trackingMode;
        setContextKey('changedown:trackingEnabled', this._trackingMode);

        // Record user's explicit choice — trumps LSP documentState and header reads
        const docUri = editor.document.uri.toString();
        const toggleState = this.docStateManager.ensureDocState(docUri, editor.document.version, editor.document.getText());
        toggleState.userTrackingOverride = this._trackingMode;

        // When turning tracking OFF, abandon any pending edit to prevent
        // the pause timer from crystallizing text after tracking is disabled
        if (!this._trackingMode) {
            this.pendingEditManager.abandon();
        }

        if (this._trackingMode && editor) {
            const docText = editor.document.getText();
            toggleState.shadow = docText;
            const maxId = scanMaxCnId(docText);
            toggleState.nextScId = maxId + 1;
        }

        // CRITICAL: Guard against re-entrancy. Without this, the header write
        // fires onDidChangeTextDocument → handleTrackedEdits wraps the header
        // in {++...++} → infinite recursion. Same guard used by PendingEditManager.
        this._isApplyingTrackedEdit = true;
        let editSuccess = false;
        try {
            if (headerMatch) {
                // Update existing header in place
                const matchStart = text.indexOf(headerMatch[0]);
                const startPos = editor.document.positionAt(matchStart);
                const endPos = editor.document.positionAt(matchStart + headerMatch[0].length);
                editSuccess = await editor.edit(eb => eb.replace(new vscode.Range(startPos, endPos), header));
            } else {
                // Insert at line 0
                editSuccess = await editor.edit(eb => eb.insert(new vscode.Position(0, 0), header + '\n'));
            }
        } finally {
            this._isApplyingTrackedEdit = false;
        }

        if (!editSuccess) {
            // Rollback all state mutations
            this._trackingMode = currentlyTracked;
            toggleState.userTrackingOverride = undefined;
            setContextKey('changedown:trackingEnabled', currentlyTracked);
            getOutputChannel()?.appendLine('[tracking] header write failed — rolling back state');
            return;
        }

        vscode.window.showInformationMessage(`ChangeDown Tracking: ${this._trackingMode ? 'ON' : 'OFF'}`);
        this.docStateManager.scheduleNotifyChanges();
    }

    // ── isTrackingEnabled ──────────────────────────────────────────────

    /**
     * Check if tracking is enabled for a specific document.
     * Returns resolved state from LSP, falling back to local state.
     */
    public isTrackingEnabled(uri?: string): boolean {
        if (uri) {
            const ds = this.docStateManager.getState(uri);
            if (ds?.userTrackingOverride !== undefined) return ds.userTrackingOverride;
            if (ds) return ds.tracking.enabled;
        }
        return this._trackingMode;
    }

    // ── Document change handling (tracking portion) ────────────────────

    /**
     * Handle the tracking-related logic from onDidChangeTextDocument.
     * Returns true if the event was handled by the tracking pipeline
     * (caller should still update shadow/version/decorations).
     *
     * @param event  The text document change event
     * @param editor The active text editor
     * @param docState The document state bag
     * @param localParseHotPath Whether local parse hot path is enabled
     * @param scheduleDecorationUpdate Callback to schedule decoration update
     * @param scheduleNotifyChanges Callback to schedule notify changes
     */
    public async handleDocumentChange(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        docState: ExtDocumentState,
        localParseHotPath: boolean,
        scheduleDecorationUpdate: (editor: vscode.TextEditor) => void,
        scheduleNotifyChanges: (uris: vscode.Uri[]) => void,
    ): Promise<'handled-undo' | 'handled-comment-guard' | 'handled-deletion' | 'deferred-to-gate' | 'not-tracking'> {
        const currentText = editor.document.getText();

        // BUG 5 fix: Don't track undo/redo — VS Code manages the undo stack.
        if (event.reason === vscode.TextDocumentChangeReason.Undo ||
            event.reason === vscode.TextDocumentChangeReason.Redo) {
            // Abandon any pending tracked edit — undo/redo invalidates the buffer
            this.pendingEditManager.abandon();
            this.unconfirmedTrackedEdit = null;
            if (this.unconfirmedEditTimer) {
                clearTimeout(this.unconfirmedEditTimer);
                this.unconfirmedEditTimer = null;
            }
            docState.shadow = currentText;
            if (localParseHotPath) {
                scheduleDecorationUpdate(editor);
                scheduleNotifyChanges([editor.document.uri]);
            }
            return 'handled-undo';
        }

        // Selection-confirmation gate: defer handleTrackedEdits until
        // onDidChangeTextEditorSelection confirms this edit came from editor typing.
        if (this._trackingMode && !this._isApplyingTrackedEdit && editor.document.languageId === 'markdown') {
            // Layer 1: Comment widget guard — if a comment thread is expanded,
            // keystrokes belong to the comment input, not the editor.
            if (this.changeComments?.isAnyThreadExpandedAtCursor()) {
                docState.shadow = currentText;
                if (localParseHotPath) {
                    scheduleDecorationUpdate(editor);
                    scheduleNotifyChanges([editor.document.uri]);
                }
                return 'handled-comment-guard';
            }

            const change = event.contentChanges[0];
            const isDeletion = change && change.rangeLength > 0 && change.text.length === 0;

            if (isDeletion) {
                // BUG 1 fix: Deletions don't move the cursor, so the selection-confirmation
                // gate would discard them. Auto-confirm deletions immediately.
                try {
                    await this.handleTrackedEdits(event, editor);
                } finally {
                    docState.shadow = editor.document.getText();
                }
                return 'handled-deletion';
            } else {
                // Existing gate logic for insertions and substitutions
                const shadowSnapshot = docState.shadow ?? editor.document.getText();
                if (this.unconfirmedTrackedEdit) {
                    getOutputChannel()?.appendLine(
                        '[tracking] Flushing previous unconfirmed edit before accepting new one'
                    );
                    const prev = this.unconfirmedTrackedEdit;
                    this.unconfirmedTrackedEdit = null;
                    docState.shadow = prev.shadowSnapshot;
                    try {
                        await this.handleTrackedEdits(prev.event, prev.editor);
                    } finally {
                        docState.shadow = editor.document.getText();
                    }
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
                }, EditTrackingManager.EDIT_CONFIRMATION_TIMEOUT_MS);

                return 'deferred-to-gate';
            }
        }

        return 'not-tracking';
    }

    // ── Selection-confirmation gate (from onDidChangeTextEditorSelection) ──

    /**
     * Confirm a pending tracked edit when selection change fires.
     * Returns true if a pending edit was confirmed and processed.
     */
    public async confirmPendingEdit(event: vscode.TextEditorSelectionChangeEvent): Promise<boolean> {
        if (!this.unconfirmedTrackedEdit) return false;

        if (event.textEditor.document.uri.toString() !==
            this.unconfirmedTrackedEdit.editor.document.uri.toString()) {
            return false;
        }

        if (this.unconfirmedEditTimer) {
            clearTimeout(this.unconfirmedEditTimer);
            this.unconfirmedEditTimer = null;
        }
        const pending = this.unconfirmedTrackedEdit;
        this.unconfirmedTrackedEdit = null;

        // Temporarily restore the pre-edit shadow so handleTrackedEdits
        // can correctly compute deleted/substituted text
        const docUri = pending.editor.document.uri.toString();
        const selDocState = this.docStateManager.ensureDocState(docUri, pending.editor.document.version, pending.editor.document.getText());
        selDocState.shadow = pending.shadowSnapshot;

        try {
            await this.handleTrackedEdits(pending.event, pending.editor);
        } finally {
            // Restore shadow to current document state
            selDocState.shadow = pending.editor.document.getText();
        }

        return true;
    }

    // ── Undo/Redo handling ─────────────────────────────────────────────

    /**
     * Handle undo/redo by abandoning pending state.
     * Called from the controller's onDidChangeTextDocument handler when undo/redo is detected.
     */
    public handleUndoRedo(): void {
        this.pendingEditManager.abandon();
        this.unconfirmedTrackedEdit = null;
        if (this.unconfirmedEditTimer) {
            clearTimeout(this.unconfirmedEditTimer);
            this.unconfirmedEditTimer = null;
        }
    }

    // ── Pre-save flush ─────────────────────────────────────────────────

    /**
     * Flush pending edits before save.
     * Encapsulates the L3→L2 conversion and L2 flush logic from onWillSaveTextDocument.
     *
     * Returns a Thenable that resolves to TextEdit[] for L3 conversion,
     * or undefined for L2 flush. The caller uses event.waitUntil() on the result.
     */
    public flushBeforeSave(
        document: vscode.TextDocument,
        _reason: vscode.TextDocumentSaveReason,
    ): Thenable<vscode.TextEdit[]> | Thenable<void> | undefined {
        if (document.languageId !== 'markdown') return undefined;

        const text = document.getText();
        const saveDocUri = document.uri.toString();

        if (this.docStateManager.workspace.isFootnoteNative(text)) {
            this.lspBridge.batchEdit('start', saveDocUri);
            const saveState = this.docStateManager.ensureDocState(saveDocUri, document.version, text);
            saveState.isConverting = true;
            const conversionEdits = (async () => {
                try {
                    if (this._trackingMode) {
                        await this.pendingEditManager.flush();
                    }
                    const currentText = document.getText();
                    const l2Text = await convertL3ToL2(currentText);
                    return [
                        vscode.TextEdit.replace(
                            new vscode.Range(
                                document.positionAt(0),
                                document.positionAt(currentText.length)
                            ),
                            l2Text
                        )
                    ];
                } catch (err) {
                    // On error, clear suppression since no edits will be applied
                    saveState.isConverting = false;
                    this.lspBridge.batchEdit('end', saveDocUri);
                    throw err;
                }
                // Note: isConverting is NOT cleared here.
                // VS Code applies the TextEdit[] AFTER this promise resolves.
                // Cleared by onDidSaveTextDocument instead.
            })();
            return conversionEdits;
        }

        // Existing flush logic for L2 tracking mode
        if (this._trackingMode && document.languageId === 'markdown') {
            const flushWithTimeout = Promise.race([
                this.pendingEditManager.flush(),
                new Promise<void>((resolve) => {
                    setTimeout(() => {
                        logError('Flush timed out during save (5s limit)', new Error('Timeout'), false);
                        resolve(); // Allow save to proceed
                    }, 5000);
                })
            ]);
            return flushWithTimeout;
        }

        return undefined;
    }

    // ── Handle tracked edits ───────────────────────────────────────────

    /**
     * Handle tracked edits when tracking mode is enabled.
     * NOTE: Shadow updates are now handled by the caller to ensure they happen AFTER async operations.
     */
    private async handleTrackedEdits(event: vscode.TextDocumentChangeEvent, editor: vscode.TextEditor): Promise<void> {
        try {
            const docUri = editor.document.uri.toString();

            // Ensure state bag exists for this document
            const trackState = this.docStateManager.ensureDocState(docUri, editor.document.version, editor.document.getText());

            // Skip if we're applying our own tracked edit (prevents recursion)
            if (this._isApplyingTrackedEdit) {
                return;
            }

            // Layer 2: Live thread state check (defense in depth).
            if (this.changeComments?.isAnyThreadExpandedAtCursor()) {
                getOutputChannel()?.appendLine('[tracking] skip: comment thread expanded at cursor (Layer 2 guard)');
                return;
            }

            if (event.contentChanges.length !== 1) {
                getOutputChannel()?.appendLine(
                    `[tracking] multi-change: ${event.contentChanges.length} changes, processing individually`
                );
                await this.pendingEditManager.flush();
                const shadow = trackState.shadow ?? '';
                const sorted = [...event.contentChanges].sort((a, b) => b.rangeOffset - a.rangeOffset);
                const results: (Promise<void> | void)[] = [];
                for (const change of sorted) {
                    if (change.rangeLength === 0 && change.text.length > 0) {
                        results.push(this.pendingEditManager.handleEdit('insertion', change.rangeOffset, change.text));
                    } else if (change.text.length === 0 && change.rangeLength > 0) {
                        const deletedText = shadow.substring(change.rangeOffset, change.rangeOffset + change.rangeLength);
                        results.push(this.pendingEditManager.handleEdit('deletion', change.rangeOffset, '', deletedText));
                    } else if (change.text.length > 0 && change.rangeLength > 0) {
                        const oldText = shadow.substring(change.rangeOffset, change.rangeOffset + change.rangeLength);
                        results.push(this.pendingEditManager.handleEdit('substitution', change.rangeOffset, change.text, oldText));
                    }
                }
                const promises = results.filter((r): r is Promise<void> => r instanceof Promise);
                if (promises.length > 0) {
                    await Promise.all(promises);
                }
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
            if (isCriticMarkupSyntax(change.text)) {
                getOutputChannel()?.appendLine('[tracking] skip: CriticMarkup syntax');
                return;
            }

            if (isInsertion) {
                const text = editor.document.getText();
                const insertOffset = positionToOffset(text, change.range.start);
                const result = this.pendingEditManager.handleEdit('insertion', insertOffset, change.text);
                if (result instanceof Promise) {
                    await result;
                }
            } else if (isDeletion) {
                const shadowText = trackState.shadow;
                if (shadowText) {
                    const shadowOffset = positionToOffset(shadowText, change.range.start);
                    const deletedText = shadowText.substring(shadowOffset, shadowOffset + change.rangeLength);
                    if (isCriticMarkupSyntax(deletedText)) {
                        return;
                    }
                    const currentOffset = positionToOffset(editor.document.getText(), change.range.start);
                    const result = this.pendingEditManager.handleEdit('deletion', currentOffset, '', deletedText);
                    if (result instanceof Promise) {
                        await result;
                    }
                }
            } else if (isSubstitution) {
                const shadowText = trackState.shadow;
                if (shadowText) {
                    const shadowOffset = positionToOffset(shadowText, change.range.start);
                    const oldText = shadowText.substring(shadowOffset, shadowOffset + change.rangeLength);
                    if (isCriticMarkupSyntax(oldText)) {
                        return;
                    }
                    const currentOffset = positionToOffset(editor.document.getText(), change.range.start);
                    const result = this.pendingEditManager.handleEdit('substitution', currentOffset, change.text, oldText);
                    if (result instanceof Promise) {
                        await result;
                    }
                }
            }
        } catch (error) {
            logError('Error in handleTrackedEdits', error, false);
            try {
                await this.pendingEditManager.flush();
            } catch (flushError) {
                logError('Error during recovery flush', flushError, false);
            }
        }
    }

    // ── Move operations ────────────────────────────────────────────────

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

        // Allocate a parent move ID (e.g., cn-17)
        const cutState = this.docStateManager.ensureDocState(docUri, editor.document.version, editor.document.getText());
        const current = cutState.nextScId;
        cutState.nextScId = current + 1;

        this.pendingCut = {
            text: selectedText,
            timestamp: Date.now(),
            moveId: current,
        };

        // Set move context on PendingEditManager so the next deletion
        // wraps with a dotted child ID (e.g., [^cn-17.1])
        this.pendingEditManager.setMoveContext({
            parentId: current,
            childSuffix: '.1',
        });
    }

    /**
     * Prepare paste as move completion.
     * Called before the actual clipboard paste happens.
     * If there's a matching pending cut within 60s, sets up the
     * insertion to use the dotted child ID ([^cn-N.2]).
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
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;

                const author = this.callbacks.getAuthor(editor.document.uri);
                const date = new Date().toISOString().slice(0, 10);
                const footnote = generateFootnoteDefinition(`cn-${moveId}`, 'move', author, date);

                this._isApplyingTrackedEdit = true;
                try {
                    const doc = editor.document;
                    const endPos = doc.positionAt(doc.getText().length);
                    const success = await editor.edit(editBuilder => {
                        editBuilder.insert(endPos, footnote);
                    }, { undoStopBefore: false, undoStopAfter: false });
                    if (!success) {
                        getOutputChannel()?.appendLine('[clipboard] move footnote edit failed');
                    }
                } finally {
                    this._isApplyingTrackedEdit = false;
                }
            } catch (err: any) {
                getOutputChannel()?.appendLine(`[clipboard] move footnote failed: ${err.message}`);
            }
        }, 100);
    }

    // ── Cursor-move structural flush ───────────────────────────────────

    /**
     * Check if cursor moved outside pending edit range and flush if needed.
     * Called from selection change handler after confirmation gate.
     */
    public async flushOnCursorMoveIfNeeded(editor: vscode.TextEditor): Promise<boolean> {
        if (!this._trackingMode || editor.document.languageId !== 'markdown') return false;
        if (this.changeComments?.isAnyThreadExpandedAtCursor()) return false;

        const text = editor.document.getText();
        const cursorOffset = positionToOffset(text, editor.selection.active);
        if (this.pendingEditManager.shouldFlushOnCursorMove(cursorOffset)) {
            await this.pendingEditManager.flush();
            return true;
        }
        return false;
    }

    // ── IME composition guard ──────────────────────────────────────────

    /** Clear composition state (e.g. when switching editors). */
    public clearComposing(): void {
        this.pendingEditManager.setComposing(false);
    }

    // ── getPendingNodes ────────────────────────────────────────────────

    /** Get pending change nodes for a URI (delegates to PendingEditManager). */
    public getPendingNodes(uri: string): ChangeNode[] {
        return this.pendingEditManager.getPendingChangeNodes(uri);
    }

    /** Get pending overlay for a URI (delegates to PendingEditManager). */
    public getPendingOverlay(uri: string): PendingOverlay | null {
        return this.pendingEditManager.getPendingOverlay(uri);
    }

    // ── Test / lifecycle ───────────────────────────────────────────────

    /**
     * Reset all transient tracking state for test isolation.
     * Called by controller.resetForTest() at the start of each test scenario.
     */
    public resetForTest(): void {
        this._trackingMode = false;
        this._isApplyingTrackedEdit = false;
        if (this.unconfirmedEditTimer) {
            clearTimeout(this.unconfirmedEditTimer);
            this.unconfirmedEditTimer = null;
        }
        this.unconfirmedTrackedEdit = null;
        this.pendingEditManager.abandon();
        this.pendingCut = null;
    }

    // ── Dispose ────────────────────────────────────────────────────────

    public dispose(): void {
        if (this.unconfirmedEditTimer) {
            clearTimeout(this.unconfirmedEditTimer);
            this.unconfirmedEditTimer = null;
        }
        this.unconfirmedTrackedEdit = null;
        this.pendingEditManager.dispose();
        this.pendingCut = null;
        this._onDidChangeTrackingMode.dispose();
    }
}
