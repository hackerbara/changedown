import * as vscode from 'vscode';
import type {
    PendingOverlay,
    EditEvent,
    EditBoundaryState,
    EditBoundaryEffect,
    FullCrystallizeEffect,
    ChangeNode,
} from '@changedown/core';

/** Legacy crystallize effect shape (VS Code PEM uses minimal context, never gets FullCrystallizeEffect) */
type LegacyCrystallizeEffect = Exclude<Extract<EditBoundaryEffect, { type: 'crystallize' }>, FullCrystallizeEffect>;
import {
    processEvent,
    DEFAULT_EDIT_BOUNDARY_CONFIG,
    initHashline,
    computeLineHash,
    buildContextualL3EditOp,
    footnoteRefGlobal,
    ChangeType as CoreChangeType,
    changeTypeToAbbrev,
    ChangeStatus,
} from '@changedown/core';
import { offsetToPosition } from './converters';
import { getOutputChannel } from './output-channel';

/**
 * Thin VS Code adapter over the core edit-boundary state machine.
 *
 * Responsibilities of this adapter (NOT in core):
 *  - CriticMarkup wrapping ({++text++}, {--text--}, {~~old~>new~~})
 *  - Timer I/O (setTimeout / clearTimeout)
 *  - Move operation context (dotted IDs for cut/paste linking)
 *  - Footnote emission via onChangeTracked callback
 *  - Async edit serialization lock
 *  - Adjacent-change merging via workspace.parse()
 *
 * Core processEvent() handles all state transitions and returns Effect[]
 * that this adapter interprets.
 */
export class PendingEditManager {
    private state: EditBoundaryState;
    private safetyNetInterval: NodeJS.Timeout | null = null;
    private isMerging: boolean = false;
    private asyncOperationLock: Promise<void> = Promise.resolve();
    private moveContext: { parentId: number; childSuffix: string } | null = null;
    private pendingUri: string | null = null;

    constructor(
        private readonly applyEdit: (range: vscode.Range, newText: string, setFlag: (val: boolean) => void) => Promise<void>,
        private readonly getDocument: (uri?: string) => vscode.TextDocument | null,
        private readonly workspace: {
            parse: (text: string, languageId?: string) => { getChanges: () => Array<{ id: string; type: string; level: number; range: { start: number; end: number }; contentRange: { start: number; end: number }; modifiedText?: string; originalText?: string }> };
            isFootnoteNative: (text: string) => boolean;
        },
        private readonly allocateScId?: () => string,
        private readonly onChangeTracked?: (scId: string, changeType: string, l3EditOpLine?: string) => Promise<void>,
    ) {
        this.state = {
            pending: null,
            isComposing: false,
            config: { ...DEFAULT_EDIT_BOUNDARY_CONFIG },
        };
    }

    // ── Logging ──────────────────────────────────────────────────────────

    private log(message: string): void {
        try {
            const ch = getOutputChannel();
            if (ch) { ch.appendLine(`[tracking] ${message}`); }
        } catch (_) { /* swallow */ }
    }

    private logError(message: string, error: unknown): void {
        try {
            const ch = getOutputChannel();
            if (ch) {
                const timestamp = new Date().toISOString();
                ch.appendLine(`[${timestamp}] PendingEditManager ERROR: ${message}`);
                if (error instanceof Error) {
                    ch.appendLine(`  Message: ${error.message}`);
                    if (error.stack) { ch.appendLine(`  Stack: ${error.stack}`); }
                } else if (error) {
                    ch.appendLine(`  Details: ${JSON.stringify(error)}`);
                }
            }
        } catch (e) {
            console.error('PendingEditManager Error:', message, error);
        }
    }

    // ── Config Setters (preserve public API) ─────────────────────────────

    public setPauseThresholdMs(ms: number): void {
        this.state = {
            ...this.state,
            config: { ...this.state.config, pauseThresholdMs: ms <= 0 ? 0 : ms },
        };
    }

    public setPasteMinChars(n: number): void {
        this.state = {
            ...this.state,
            config: { ...this.state.config, pasteMinChars: Math.max(1, n) },
        };
    }

    public setBreakOnNewline(enabled: boolean): void {
        this.state = {
            ...this.state,
            config: { ...this.state.config, breakOnNewline: enabled },
        };
    }

    public setMoveContext(ctx: { parentId: number; childSuffix: string } | null): void {
        this.moveContext = ctx;
    }

    public get pauseThresholdMs(): number {
        return this.state.config.pauseThresholdMs;
    }

    // ── Query Methods ────────────────────────────────────────────────────

    public getPendingOverlay(uri: string): PendingOverlay | null {
        const buf = this.state.pending;
        if (!buf) { return null; }
        const doc = this.getDocument(this.pendingUri ?? undefined);
        if (!doc || doc.uri.toString() !== uri) { return null; }
        return {
            range: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
            text: buf.currentText,
            type: 'insertion',
            scId: buf.scId,
        };
    }

    /**
     * Produce optimistic ChangeNode[] from pending edit state for instant decoration.
     * These nodes have id='' and level=0 — non-decoration consumers MUST filter them out.
     * Returns empty array when no pending edit exists.
     */
    public getPendingChangeNodes(uri?: string): ChangeNode[] {
        const buf = this.state.pending;
        if (!buf) return [];
        // Fast URI mismatch check — avoid expensive getDocument() call
        if (uri && this.pendingUri && this.pendingUri !== uri) return [];

        // Check the document is still open
        const doc = this.getDocument(this.pendingUri ?? undefined);
        if (!doc) return [];

        const hasNew = buf.currentText.length > 0;
        const hasOld = buf.originalText.length > 0;

        if (hasNew && !hasOld) {
            // Insertion: typed text at [anchor, anchor + currentText.length)
            return [{
                id: '',
                type: CoreChangeType.Insertion,
                status: ChangeStatus.Proposed,
                range: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
                contentRange: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
                modifiedText: buf.currentText,
                originalText: '',
                level: 0,
                anchored: false,
            }];
        }

        if (!hasNew && hasOld) {
            // Deletion: zero-width range at deletion point, originalText for ghost
            return [{
                id: '',
                type: CoreChangeType.Deletion,
                status: ChangeStatus.Proposed,
                range: { start: buf.anchorOffset, end: buf.anchorOffset },
                contentRange: { start: buf.anchorOffset, end: buf.anchorOffset },
                modifiedText: '',
                originalText: buf.originalText,
                level: 0,
                anchored: false,
            }];
        }

        if (hasNew && hasOld) {
            // Substitution: range covers new text, originalText for ghost
            return [{
                id: '',
                type: CoreChangeType.Substitution,
                status: ChangeStatus.Proposed,
                range: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
                contentRange: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
                modifiedText: buf.currentText,
                originalText: buf.originalText,
                level: 0,
                anchored: false,
            }];
        }

        // Empty buffer (no current text, no original text) — nothing to show
        return [];
    }

    public hasPendingEdit(): boolean {
        return this.state.pending !== null;
    }

    public setComposing(isComposing: boolean): void {
        this.state = { ...this.state, isComposing };
    }

    private startSafetyNet(): void {
        if (this.safetyNetInterval) return;
        const initialThreshold = this.state.config.pauseThresholdMs;
        if (initialThreshold <= 0) return;
        const checkMs = Math.min(5000, initialThreshold);
        this.safetyNetInterval = setInterval(() => {
            const threshold = this.state.config.pauseThresholdMs;
            if (this.state.pending && !this.state.isComposing && threshold > 0) {
                const elapsed = Date.now() - this.state.pending.lastEditTime;
                if (elapsed > threshold) {
                    this.flush().catch(err => this.logError('Safety-net flush failed', err));
                }
            }
        }, checkMs);
    }

    private stopSafetyNet(): void {
        if (this.safetyNetInterval) {
            clearInterval(this.safetyNetInterval);
            this.safetyNetInterval = null;
        }
    }

    // ── Public Edit Handlers ─────────────────────────────────────────────

    /**
     * Handle any edit event (insertion, deletion, or substitution).
     * All edit types now flow through the core state machine's processEvent().
     * Returns void for normal typing (sync), Promise for crystallize/merge (async).
     */
    public handleEdit(
        type: 'insertion' | 'deletion' | 'substitution',
        offset: number,
        text: string,
        deletedText?: string,
    ): Promise<void> | void {
        const now = Date.now();
        let event: EditEvent;
        if (type === 'insertion') {
            event = { type: 'insertion', offset, text };
        } else if (type === 'deletion') {
            event = { type: 'deletion', offset, deletedText: deletedText! };
        } else {
            event = { type: 'substitution', offset, oldText: deletedText!, newText: text };
        }
        const prevPending = this.state.pending;
        const { newState, effects } = processEvent(this.state, event, {
            now,
            allocateScId: () => this.consumeScId() ?? '',
        });
        this.state = newState;

        // Start safety-net when new pending buffer is created
        if (this.state.pending && !prevPending) {
            const doc = this.getDocument();
            this.pendingUri = doc ? doc.uri.toString() : null;
            this.startSafetyNet();
        }
        // Stop safety-net when buffer is consumed
        if (!this.state.pending && prevPending) {
            this.stopSafetyNet();
        }

        if (effects.some(e => e.type === 'crystallize' || e.type === 'mergeAdjacent')) {
            return this.executeEffectsAsync(effects);
        }
        this.executeEffectsSync(effects);
    }

    /**
     * Flush any pending edit. Never flushes during IME composition.
     */
    public async flush(): Promise<void> {
        if (this.state.isComposing) { return; }
        if (!this.state.pending) { return; }

        const event: EditEvent = { type: 'flush' };
        const { newState, effects } = processEvent(this.state, event, { now: Date.now() });
        this.state = newState;

        this.log('flush: captured pending edit');
        await this.executeEffectsAsync(effects);
        if (!this.state.pending) {
            this.stopSafetyNet();
        }
    }

    /**
     * Abandon any pending edit without crystallizing.
     * Used when tracking is toggled off mid-edit — the text is already
     * in the document as plain characters; we just discard the buffer.
     */
    public abandon(): void {
        this.stopSafetyNet();
        this.state = { ...this.state, pending: null };
        this.pendingUri = null;
        this.log('abandon: discarded pending edit (tracking toggled off)');
    }

    /**
     * Structural flush: returns true when cursor has moved outside the pending
     * edit's active range. This is a structural event — fires regardless of
     * pauseThresholdMs value (threshold controls only temporal events like the
     * safety-net timer). See spec: pauseThresholdMs Semantics.
     *
     * Exception: pure deletion buffers (currentText empty, originalText non-empty)
     * are exempt — the user is likely pressing Backspace multiple times and the
     * timer or next non-adjacent edit provides the flush backstop.
     */
    public shouldFlushOnCursorMove(cursorOffset: number): boolean {
        const buf = this.state.pending;
        if (!buf) { return false; }
        // Pure deletion buffers: don't flush on cursor movement.
        // User is likely pressing Backspace repeatedly to extend the deletion.
        if (buf.currentText.length === 0 && buf.originalText.length > 0) {
            return false;
        }
        return cursorOffset < buf.anchorOffset || cursorOffset > buf.anchorOffset + buf.currentText.length;
    }

    public clear(): void {
        this.abandon();
    }

    public dispose(): void {
        this.stopSafetyNet();
    }

    // ── Effect Execution ─────────────────────────────────────────────────

    /**
     * Execute effects synchronously (timers, overlay updates only).
     */
    private executeEffectsSync(effects: EditBoundaryEffect[]): void {
        for (const effect of effects) {
            switch (effect.type) {
                case 'updatePendingOverlay':
                    // Overlay tracked in state.pending — getPendingOverlay() reads from it.
                    break;
                case 'crystallize':
                case 'mergeAdjacent':
                    // Async effects leaked into sync path — schedule fire-and-forget.
                    this.executeEffectsAsync([effect]).catch((err: unknown) => {
                        this.logError('Error in deferred effect execution', err);
                    });
                    break;
            }
        }
    }

    /**
     * Execute effects asynchronously, serialized via lock.
     */
    private async executeEffectsAsync(effects: EditBoundaryEffect[]): Promise<void> {
        await this.asyncOperationLock;

        let resolveLock: () => void;
        this.asyncOperationLock = new Promise(resolve => { resolveLock = resolve; });

        try {
            for (const effect of effects) {
                switch (effect.type) {
                    case 'crystallize':
                        // VS Code PEM uses minimal context — only legacy crystallize effects arrive
                        if ('changeType' in effect) {
                            await this.executeCrystallize(effect);
                        }
                        break;
                    case 'mergeAdjacent':
                        await this.mergeAdjacentChanges(effect.offset);
                        break;
                    case 'updatePendingOverlay':
                        break;
                }
            }
        } finally {
            resolveLock!();
        }
    }

    // ── Effect Interpreters ──────────────────────────────────────────────

    /**
     * Interpret a crystallize effect for all change types.
     * Wraps text in the appropriate CriticMarkup syntax and applies to document.
     *
     * - insertion:     {++currentText++}
     * - deletion:      {--originalText--}
     * - substitution:  {~~originalText~>currentText~~}
     *
     * In L3 format (clean body + footnotes), no body edit is performed.
     * Instead, a footnote definition with LINE:HASH {edit-op} is appended.
     */
    private async executeCrystallize(effect: LegacyCrystallizeEffect): Promise<void> {
        const doc = this.getDocument(this.pendingUri ?? undefined);
        if (!doc) {
            this.log('crystallize: document no longer visible, abandoning');
            this.pendingUri = null;
            return;
        }
        const text = doc.getText();

        if (this.workspace.isFootnoteNative(text)) {
            return this.crystallizeL3(effect, doc, text);
        }

        const scId = effect.scId || undefined;
        const scIdSuffix = scId ? `[^${scId}]` : '';

        if (effect.changeType === 'insertion') {
            // Handle newline splitting for insertions
            if (this.state.config.breakOnNewline && effect.currentText.includes('\n')) {
                await this.applyNewlineSplitInsertion(effect.offset, effect.currentText);
                return;
            }

            const wrappedText = `{++${effect.currentText}++}${scIdSuffix}`;
            const startPos = offsetToPosition(text, effect.offset);
            const endPos = offsetToPosition(text, effect.offset + effect.length);
            const range = new vscode.Range(startPos, endPos);

            this.log(`crystallize: wrapping insertion '${effect.currentText}' -> '${wrappedText}'`);
            await this.applyEdit(range, wrappedText, () => {});
        } else if (effect.changeType === 'deletion') {
            // Deletion: the deleted text is already gone from the document.
            // effect.length is 0 (nothing to replace), we insert the deletion markup at offset.
            const wrappedText = `{--${effect.originalText}--}${scIdSuffix}`;
            const startPos = offsetToPosition(text, effect.offset);
            const endPos = offsetToPosition(text, effect.offset + effect.length);
            const range = new vscode.Range(startPos, endPos);

            this.log(`crystallize: wrapping deletion '${effect.originalText}' -> '${wrappedText}'`);
            await this.applyEdit(range, wrappedText, () => {});
        } else {
            // Substitution: the new text is in the document, we replace it with markup.
            // effect.length is currentText.length (the replacement text visible in doc).
            const wrappedText = `{~~${effect.originalText}~>${effect.currentText}~~}${scIdSuffix}`;
            const startPos = offsetToPosition(text, effect.offset);
            const endPos = offsetToPosition(text, effect.offset + effect.length);
            const range = new vscode.Range(startPos, endPos);

            this.log(`crystallize: wrapping substitution '${effect.originalText}' -> '${effect.currentText}' as '${wrappedText}'`);
            await this.applyEdit(range, wrappedText, () => {});
        }

        if (scId && this.onChangeTracked) {
            const ct = effect.changeType;
            const typeEnum = ct === 'insertion' ? CoreChangeType.Insertion
              : ct === 'deletion' ? CoreChangeType.Deletion
              : CoreChangeType.Substitution;
            await this.onChangeTracked(scId, changeTypeToAbbrev(typeEnum));
        }

        this.pendingUri = null;
    }

    /**
     * L3 crystallization: the body text already reflects the user's edit.
     * No body edit is performed. Appends a footnote with LINE:HASH {edit-op}
     * as the continuation body so the change is fully described.
     *
     * - insertion:    footnote body: LINE:HASH {++currentText++}
     * - deletion:     footnote body: LINE:HASH {--originalText--}
     * - substitution: footnote body: LINE:HASH {~~originalText~>currentText~~}
     */
    private async crystallizeL3(
        effect: LegacyCrystallizeEffect,
        doc: vscode.TextDocument,
        text: string,
    ): Promise<void> {
        const scId = effect.scId || undefined;
        if (!scId) {
            this.log('crystallizeL3: no scId, abandoning');
            this.pendingUri = null;
            return;
        }

        // Ensure xxhash-wasm is initialized (idempotent — fast on subsequent calls)
        await initHashline();

        // Compute which line the anchor offset falls on (0-based index)
        const position = doc.positionAt(effect.offset);
        const lineIdx = position.line;          // 0-based
        const lineNumber = lineIdx + 1;         // 1-indexed for L3 format
        const lineText = doc.lineAt(lineIdx).text;
        // Strip footnote refs — parser searches clean body lines
        const cleanLine = lineText.replace(footnoteRefGlobal(), '');
        // Adjust column for stripped refs before the change position
        const rawCol = position.character;
        const refsBeforeChange = lineText.slice(0, rawCol).match(footnoteRefGlobal()) ?? [];
        const refCharsRemoved = refsBeforeChange.reduce((sum, r) => sum + r.length, 0);
        const cleanCol = rawCol - refCharsRemoved;

        // Compute anchorLen based on change type
        let anchorLen: number;
        const ct = effect.changeType;
        if (ct === 'insertion') {
          anchorLen = effect.currentText.length;
        } else if (ct === 'deletion') {
          anchorLen = 0;
        } else if (ct === 'substitution') {
          anchorLen = effect.currentText.length;
        } else if (ct === 'highlight') {
          anchorLen = effect.originalText.length;
        } else {
          anchorLen = 0; // comment
        }

        // Map string changeType to ChangeType enum
        const changeTypeEnum = ct === 'insertion' ? CoreChangeType.Insertion
          : ct === 'deletion' ? CoreChangeType.Deletion
          : ct === 'substitution' ? CoreChangeType.Substitution
          : ct === 'highlight' ? CoreChangeType.Highlight
          : CoreChangeType.Comment;

        // computeLineHash needs allLines only for blank-line context hashing
        const stripped = cleanLine.replace(/\r$/, '').replace(/\s+/g, '');
        const allLines = stripped.length === 0 ? text.split('\n') : undefined;
        const hash = computeLineHash(lineIdx, cleanLine, allLines);

        const editOpLine = buildContextualL3EditOp({
          changeType: changeTypeEnum,
          originalText: effect.originalText,
          currentText: effect.currentText,
          lineContent: cleanLine,
          lineNumber,
          hash,
          column: cleanCol,
          anchorLen,
        });

        this.log(`crystallizeL3: appending footnote for ${scId} at ${editOpLine.trim()}`);

        if (this.onChangeTracked) {
            await this.onChangeTracked(scId, changeTypeToAbbrev(changeTypeEnum), editOpLine);
        }

        this.pendingUri = null;
    }

    // ── Private Helpers ──────────────────────────────────────────────────

    private consumeScId(): string | undefined {
        if (this.moveContext) {
            const scId = `cn-${this.moveContext.parentId}${this.moveContext.childSuffix}`;
            this.moveContext = null;
            return scId;
        }
        return this.allocateScId?.();
    }

    /**
     * Apply a multi-line insertion with one {++...++} per line (newline splitting).
     */
    private async applyNewlineSplitInsertion(offset: number, text: string): Promise<void> {
        const doc = this.getDocument(this.pendingUri ?? undefined);
        if (!doc) {
            this.log('newlineSplitInsertion: document no longer visible, abandoning');
            this.pendingUri = null;
            return;
        }
        const currentText = doc.getText();
        const searchStart = Math.max(0, offset - 50);
        const pastedTextStart = currentText.indexOf(text, searchStart);
        if (pastedTextStart === -1) {
            this.logError('Could not find inserted text in document (newline split)', new Error('Text not found'));
            return;
        }

        const segments = text.split('\n');
        const parts: string[] = [];
        const scIds: (string | undefined)[] = [];
        for (let i = 0; i < segments.length; i++) {
            const lineContent = segments[i] + (i < segments.length - 1 ? '\n' : '');
            if (lineContent.length === 0) { continue; }
            const scId = this.consumeScId();
            scIds.push(scId);
            const suffix = scId ? `[^${scId}]` : '';
            parts.push(`{++${lineContent}++}${suffix}`);
        }
        const wrappedText = parts.join('');

        const startPos = offsetToPosition(currentText, pastedTextStart);
        const endPos = offsetToPosition(currentText, pastedTextStart + text.length);
        const range = new vscode.Range(startPos, endPos);

        await this.applyEdit(range, wrappedText, () => {});

        for (const scId of scIds) {
            if (scId && this.onChangeTracked) {
                await this.onChangeTracked(scId, 'insertion');
            }
        }
    }

    /**
     * After committing, check for adjacent same-type changes and merge them.
     */
    private async mergeAdjacentChanges(newChangeOffset: number): Promise<void> {
        if (this.isMerging) { return; }
        this.isMerging = true;
        try {
            await this._performMerge(newChangeOffset);
        } finally {
            this.isMerging = false;
        }
    }

    private async _performMerge(newChangeOffset: number): Promise<void> {
        const doc = this.getDocument(this.pendingUri ?? undefined);
        if (!doc) {
            this.log('mergeAdjacent: document no longer visible, skipping');
            return;
        }
        const text = doc.getText();
        const virtualDoc = this.workspace.parse(text, doc.languageId);
        const changes = virtualDoc.getChanges();

        if (changes.length < 2) { return; }

        let newChangeIndex = -1;
        for (let i = 0; i < changes.length; i++) {
            if (changes[i].range.start === newChangeOffset) {
                newChangeIndex = i;
                break;
            }
        }
        if (newChangeIndex === -1) { return; }

        const newChange = changes[newChangeIndex];

        // Check adjacent before
        if (newChangeIndex > 0) {
            const prev = changes[newChangeIndex - 1];
            if (prev.range.end === newChange.range.start &&
                prev.type === newChange.type) {
                if (prev.level >= 2 || newChange.level >= 2) { return; }

                if (newChange.type === 'Insertion' || newChange.type === 'Deletion') {
                    const prevContent = text.substring(prev.contentRange.start, prev.contentRange.end);
                    const newContent = text.substring(newChange.contentRange.start, newChange.contentRange.end);
                    const delimiter = newChange.type === 'Insertion' ? ['++', '++'] : ['--', '--'];
                    const mergedText = `{${delimiter[0]}${prevContent}${newContent}${delimiter[1]}}`;

                    const startPos = offsetToPosition(text, prev.range.start);
                    const endPos = offsetToPosition(text, newChange.range.end);
                    const range = new vscode.Range(startPos, endPos);
                    await this.applyEdit(range, mergedText, () => {});
                    return;
                }
            }
        }

        // Check adjacent after
        if (newChangeIndex < changes.length - 1) {
            const next = changes[newChangeIndex + 1];
            if (newChange.range.end === next.range.start &&
                newChange.type === next.type) {
                if (newChange.level >= 2 || next.level >= 2) { return; }

                if (newChange.type === 'Insertion' || newChange.type === 'Deletion') {
                    const newContent = text.substring(newChange.contentRange.start, newChange.contentRange.end);
                    const nextContent = text.substring(next.contentRange.start, next.contentRange.end);
                    const delimiter = newChange.type === 'Insertion' ? ['++', '++'] : ['--', '--'];
                    const mergedText = `{${delimiter[0]}${newContent}${nextContent}${delimiter[1]}}`;

                    const startPos = offsetToPosition(text, newChange.range.start);
                    const endPos = offsetToPosition(text, next.range.end);
                    const range = new vscode.Range(startPos, endPos);
                    await this.applyEdit(range, mergedText, () => {});
                    return;
                }
            }
        }
    }
}
