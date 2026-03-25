import * as vscode from 'vscode';
import { findFootnoteBlock } from '@changetracks/core';
import type { ChangeNode } from '@changetracks/core';
import { positionToOffset, coreRangeToVscode } from '../converters';
import { isChangeVisibleInMode } from '../view-mode';
import { findContainingHiddenRange } from '../hidden-range-search';
import { DocumentStateManager } from './document-state-manager';
import { LspBridge } from './lsp-bridge';
import { ViewModeManager } from './view-mode-manager';
import { findSupportedEditor, isSupported, setContextKey } from './shared';

/**
 * NavigationManager owns change navigation (next/prev/linked), cursor context
 * tracking, cursor snapping past hidden ranges, and the changeAtCursor context key.
 *
 * Extracted from controller.ts to isolate navigation concerns.
 */
export class NavigationManager implements vscode.Disposable {
    private lastCursorLine: number = -1;
    private lastCursorChangeId: string | undefined = undefined;
    private isSnappingCursor = false;

    private readonly _onDidChangeCursorChange = new vscode.EventEmitter<string | null>();
    /** Fires when the cursor enters or leaves a change. Payload: change id, or null when cursor is outside all changes. */
    public readonly onDidChangeCursorChange = this._onDidChangeCursorChange.event;

    private readonly docStateManager: DocumentStateManager;
    private readonly viewModeManager: ViewModeManager;
    private readonly lspBridge: LspBridge;
    private readonly getHiddenOffsets: () => ReadonlyArray<{ start: number; end: number }>;

    constructor(
        docStateManager: DocumentStateManager,
        viewModeManager: ViewModeManager,
        lspBridge: LspBridge,
        getHiddenOffsets: () => ReadonlyArray<{ start: number; end: number }>,
    ) {
        this.docStateManager = docStateManager;
        this.viewModeManager = viewModeManager;
        this.lspBridge = lspBridge;
        this.getHiddenOffsets = getHiddenOffsets;
    }

    // ── Cursor context ────────────────────────────────────────────────────

    /**
     * Update changetracks:changeAtCursor context key when cursor moves or document changes.
     * Used for Keep/Undo keybinding (cmd+y / cmd+n) so they only apply when cursor is inside a change.
     */
    public updateChangeAtCursorContext(editor: vscode.TextEditor): void {
        if (!isSupported(editor.document) || editor.document.languageId !== 'markdown') {
            setContextKey('changetracks:changeAtCursor', false);
            return;
        }
        const text = editor.document.getText();
        const uri = editor.document.uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, editor.document.languageId, true);
        const cursorOffset = positionToOffset(text, editor.selection.active);
        const change = this.docStateManager.workspace.changeAtOffset(virtualDoc, cursorOffset);
        setContextKey('changetracks:changeAtCursor', change !== null);

        // Send cursor position to LSP (only when line or changeId changes)
        const cursorLine = editor.selection.active.line;
        const changeId = change?.id;
        if (cursorLine !== this.lastCursorLine || changeId !== this.lastCursorChangeId) {
            this.lastCursorLine = cursorLine;
            this.lastCursorChangeId = changeId;
            this.lspBridge.sendCursorPosition(uri, cursorLine, changeId);
            this._onDidChangeCursorChange.fire(change?.id ?? null);
        }
    }

    // ── Change navigation ─────────────────────────────────────────────────

    /**
     * Navigate to the next change from current cursor position.
     */
    public async nextChange(): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor) return;

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, languageId, true);
        const changes = virtualDoc.getChanges()
            .filter(c => isChangeVisibleInMode(c, this.viewModeManager.viewMode, this.viewModeManager.showDelimiters));

        if (changes.length === 0) {
            vscode.window.showInformationMessage('No visible changes in this view');
            return;
        }

        const cursorOffset = editor.document.offsetAt(editor.selection.active);

        // Find first change after cursor, wrapping around
        let target = changes.find(c => c.range.start > cursorOffset);
        if (!target) {
            target = changes[0]; // wrap to first
            vscode.window.showInformationMessage('Wrapped to first change');
        }

        const pos = editor.document.positionAt(target.contentRange.start);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    /**
     * Navigate to the previous change from current cursor position.
     */
    public async previousChange(): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor) return;

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, languageId, true);
        const changes = virtualDoc.getChanges()
            .filter(c => isChangeVisibleInMode(c, this.viewModeManager.viewMode, this.viewModeManager.showDelimiters));

        if (changes.length === 0) {
            vscode.window.showInformationMessage('No visible changes in this view');
            return;
        }

        const cursorOffset = editor.document.offsetAt(editor.selection.active);

        // Find last change before cursor, wrapping around
        let target: ChangeNode | undefined;
        for (let i = changes.length - 1; i >= 0; i--) {
            if (changes[i].range.start < cursorOffset) {
                target = changes[i];
                break;
            }
        }
        if (!target) {
            target = changes[changes.length - 1]; // wrap to last
            vscode.window.showInformationMessage('Wrapped to last change');
        }

        const pos = editor.document.positionAt(target.contentRange.start);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    /**
     * Navigate to the linked change in a move group.
     * If cursor is on a move-from, jump to move-to, and vice versa.
     */
    public async goToLinkedChange(): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, languageId, true);

        const cursorOffset = positionToOffset(text, editor.selection.active);
        const change = this.docStateManager.workspace.changeAtOffset(virtualDoc, cursorOffset);

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
     * Reveal a change by ID in the active editor (e.g. from Change Explorer tree click).
     */
    public revealChangeById(changeId: string): void {
        const editor = findSupportedEditor();
        if (!editor) {
            return;
        }
        const changes = this.docStateManager.getChangesForDocument(editor.document);
        const change = changes.find(c => c.id === changeId);
        if (!change) {
            return;
        }
        const text = editor.document.getText();
        const range = coreRangeToVscode(text, change.range);
        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }

    /**
     * Jump to a footnote definition in the editor by change ID.
     */
    public jumpToFootnoteInEditor(editor: vscode.TextEditor, changeId: string): void {
        const text = editor.document.getText();
        const lines = text.split('\n');
        const block = findFootnoteBlock(lines, changeId);
        if (block) {
            const pos = new vscode.Position(block.headerLine, 0);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(pos, pos);
        } else {
            vscode.window.showInformationMessage(`Footnote [^${changeId}] not found.`);
        }
    }

    // ── Cursor snapping ───────────────────────────────────────────────────

    /**
     * Snap cursor out of hidden ranges using the decorator's own hidden offset data.
     * Handles all event types (mouse, keyboard, command), all hidden region shapes,
     * direction-aware snapping, multi-cursor, and adjacent hidden range chains.
     *
     * KNOWN LIMITATION: Copy/paste across hidden ranges.
     * When the user selects text spanning a hidden range (delimiter, footnote ref,
     * or entirely-hidden change) and copies, the clipboard will contain the hidden
     * CriticMarkup markup. VS Code has no clipboard interception API for extensions.
     */
    public snapCursorPastHiddenRanges(
        editor: vscode.TextEditor,
        event: vscode.TextEditorSelectionChangeEvent
    ): void {
        if (this.isSnappingCursor) return;

        const hiddenRanges = this.getHiddenOffsets();
        if (hiddenRanges.length === 0) return;

        const docUri = editor.document.uri.toString();
        const snapState = this.docStateManager.ensureDocState(docUri, editor.document.version, editor.document.getText());
        const prevOffset = snapState.lastCursorOffset;

        let anySnapped = false;
        const newSelections: vscode.Selection[] = [];

        for (const sel of event.selections) {
            if (!sel.isEmpty) {
                newSelections.push(sel);
                continue;
            }

            const cursorOffset = editor.document.offsetAt(sel.active);
            const forward = cursorOffset >= prevOffset;

            let target = cursorOffset;
            for (let i = 0; i < 10; i++) {
                const range = findContainingHiddenRange(hiddenRanges, target);
                if (!range) break;
                // Forward: snap to exclusive end (first visible char after range).
                // Backward: snap to one before range start (last visible char before range).
                // This avoids the infinite-loop trap where range.start is inside [start, end).
                // Edge case: if range starts at offset 0, there's nothing before it — snap forward.
                target = forward || range.start === 0 ? range.end : range.start - 1;
            }

            if (target !== cursorOffset) {
                anySnapped = true;
                const snapPos = editor.document.positionAt(target);
                newSelections.push(new vscode.Selection(snapPos, snapPos));
            } else {
                newSelections.push(sel);
            }
        }

        // Track direction from primary cursor, per document
        snapState.lastCursorOffset = anySnapped
            ? editor.document.offsetAt(newSelections[0].active)
            : editor.document.offsetAt(event.selections[0].active);

        if (anySnapped) {
            this.isSnappingCursor = true;
            editor.selections = newSelections;
            setTimeout(() => { this.isSnappingCursor = false; }, 0);
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    public dispose(): void {
        this._onDidChangeCursorChange.dispose();
    }
}
