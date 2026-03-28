import * as vscode from 'vscode';
import { ChangeNode, ChangeStatus, scanMaxCnId, generateFootnoteDefinition, appendFootnote } from '@changedown/core';
import { positionToOffset, coreEditToVscode } from '../converters';
import { formatReply } from '../footnote-writer';
import { resolveAuthorIdentity } from '../author-identity';
import { DocumentStateManager } from './document-state-manager';
import { EditTrackingManager } from './edit-tracking-manager';
import { LspBridge } from './lsp-bridge';
import { findSupportedEditor, isSupported } from './shared';

// ── Types ──────────────────────────────────────────────────────────────

export interface ReviewLifecycleCallbacks {
    /** Schedule decoration update for an editor. */
    updateDecorations(editor: vscode.TextEditor): void;
}

// ── Standalone utility ─────────────────────────────────────────────────

/**
 * Find a change by ID in a list, or by cursor offset in a virtual document.
 * Exported as a named function for testability.
 */
export function findChangeInList(
    changes: ChangeNode[],
    changeId?: string,
): ChangeNode | undefined {
    if (!changeId) return undefined;
    return changes.find(c => c.id === changeId);
}

// ── ReviewLifecycleManager ─────────────────────────────────────────────

/**
 * ReviewLifecycleManager owns all review/lifecycle command handlers:
 * accept, reject, amend, supersede, compact, bulk operations, add comment,
 * and the shared findChangeForCommand helper.
 *
 * These methods are mostly stateless — pure command handlers with UI
 * dialog logic that delegate to LSP for edit computation.
 */
export class ReviewLifecycleManager implements vscode.Disposable {
    private readonly docStateManager: DocumentStateManager;
    private readonly editTracking: EditTrackingManager;
    private readonly lspBridge: LspBridge;
    private readonly callbacks: ReviewLifecycleCallbacks;

    constructor(
        docStateManager: DocumentStateManager,
        editTracking: EditTrackingManager,
        lspBridge: LspBridge,
        callbacks: ReviewLifecycleCallbacks,
    ) {
        this.docStateManager = docStateManager;
        this.editTracking = editTracking;
        this.lspBridge = lspBridge;
        this.callbacks = callbacks;
    }

    // ── Shared helpers ────────────────────────────────────────────────

    /**
     * Find a change by ID or at the current cursor position.
     * Shared helper used by accept/reject/amend/supersede/compact commands.
     */
    public findChangeForCommand(changeId?: string): { change: ChangeNode; editor: vscode.TextEditor } | null {
        const editor = findSupportedEditor();
        if (!editor) return null;

        const text = editor.document.getText();
        const uri = editor.document.uri.toString();
        const languageId = editor.document.languageId;
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, languageId, true);

        let change: ChangeNode | null | undefined;
        if (changeId) {
            change = virtualDoc.getChanges().find((c: ChangeNode) => c.id === changeId) ?? null;
        } else {
            const cursorOffset = positionToOffset(text, editor.selection.active);
            change = this.docStateManager.workspace.changeAtOffset(virtualDoc, cursorOffset);
        }

        if (!change) {
            vscode.window.showInformationMessage('No change found at cursor position');
            return null;
        }

        return { change, editor };
    }

    /**
     * Fetch project config from LSP to determine if reasons are required.
     */
    public async getProjectConfig(): Promise<{ reasonRequired: { human: boolean } }> {
        return this.lspBridge.getProjectConfig();
    }

    /**
     * Read author name with fallback chain.
     * Resolution order: changedown.author -> git config user.name -> system username -> 'unknown'.
     * When resource is provided, uses resource-scoped config so workspace/folder author is used for that document.
     */
    public getAuthor(resource?: vscode.Uri): string {
        return resolveAuthorIdentity(resource);
    }

    /**
     * Show a modal confirmation dialog before a bulk accept/reject operation.
     * Returns true if the user confirmed (or if the threshold is not exceeded).
     * Controlled by changedown.confirmBulkThreshold (default 5, 0 = disabled).
     */
    public async confirmBulkAction(action: string, count: number): Promise<boolean> {
        const threshold = vscode.workspace.getConfiguration('changedown').get<number>('confirmBulkThreshold', 5);
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

    // ── Single-change review commands ─────────────────────────────────

    /**
     * Accept a change by ID (from CodeLens) or at the current cursor position.
     * When called without `decision`, shows QuickPick for user to choose
     * (approve / approve with reason / request changes).
     * When `decision` is provided, bypasses all UI for programmatic callers.
     * Delegates to LSP for all edit computation.
     */
    public async acceptChangeAtCursor(changeId?: string, decision?: 'approve' | 'request_changes', reason?: string): Promise<void> {
        const found = this.findChangeForCommand(changeId);
        if (!found) return;
        const { change } = found;

        if (!decision) {
            const config = await this.getProjectConfig();
            decision = 'approve';

            if (config.reasonRequired.human) {
                // Reason is mandatory
                reason = await vscode.window.showInputBox({
                    prompt: 'Reason for accepting this change (required)',
                    placeHolder: 'Enter reason...',
                    validateInput: (v) => v.trim() ? null : 'Reason is required',
                });
                if (reason === undefined) return; // cancelled
            } else {
                // QuickPick with 3 options
                interface QuickPickAction extends vscode.QuickPickItem { value: string }
                const pick = await vscode.window.showQuickPick<QuickPickAction>([
                    { label: '$(check) Accept', description: 'Accept this change', value: 'approve' },
                    { label: '$(edit) Accept with reason...', description: 'Accept and provide a reason', value: 'approve_reason' },
                    { label: '$(comment-discussion) Request Changes...', description: 'Request modifications', value: 'request_changes' },
                ], { placeHolder: 'Review change' });
                if (!pick) return; // cancelled

                if (pick.value === 'approve_reason') {
                    reason = await vscode.window.showInputBox({
                        prompt: 'Reason for accepting',
                        placeHolder: 'Enter reason...',
                    });
                    if (reason === undefined) return;
                } else if (pick.value === 'request_changes') {
                    decision = 'request_changes';
                    reason = await vscode.window.showInputBox({
                        prompt: 'What changes are needed?',
                        placeHolder: 'Describe requested changes...',
                        validateInput: (v) => v.trim() ? null : 'Feedback is required',
                    });
                    if (reason === undefined) return;
                }
                // else: plain approve, no reason needed
            }
        }

        const { success } = await this.lspBridge.sendLifecycleRequest('changedown/reviewChange', {
            changeId: change.id ?? '',
            decision,
            reason,
        });
        if (success) {
            const msg = decision === 'request_changes' ? 'Changes requested' : 'Change accepted';
            vscode.window.showInformationMessage(msg);
        }
    }

    /**
     * Reject a change by ID (from CodeLens) or at the current cursor position.
     * When called without `decision`, shows QuickPick for optional reason.
     * When `decision` is provided, bypasses all UI for programmatic callers.
     * Delegates to LSP for all edit computation.
     */
    public async rejectChangeAtCursor(changeId?: string, decision?: 'reject', reason?: string): Promise<void> {
        const found = this.findChangeForCommand(changeId);
        if (!found) return;
        const { change } = found;

        if (!decision) {
            const config = await this.getProjectConfig();

            if (config.reasonRequired.human) {
                reason = await vscode.window.showInputBox({
                    prompt: 'Reason for rejecting this change (required)',
                    placeHolder: 'Enter reason...',
                    validateInput: (v) => v.trim() ? null : 'Reason is required',
                });
                if (reason === undefined) return;
            } else {
                interface QuickPickAction extends vscode.QuickPickItem { value: string }
                const pick = await vscode.window.showQuickPick<QuickPickAction>([
                    { label: '$(close) Reject', description: 'Reject this change', value: 'reject' },
                    { label: '$(edit) Reject with reason...', description: 'Reject and provide a reason', value: 'reject_reason' },
                ], { placeHolder: 'Reject change' });
                if (!pick) return;

                if (pick.value === 'reject_reason') {
                    reason = await vscode.window.showInputBox({
                        prompt: 'Reason for rejecting',
                        placeHolder: 'Enter reason...',
                    });
                    if (reason === undefined) return;
                }
            }
        }

        const { success } = await this.lspBridge.sendLifecycleRequest('changedown/reviewChange', {
            changeId: change.id ?? '',
            decision: 'reject',
            reason,
        });
        if (success) {
            vscode.window.showInformationMessage('Change rejected');
        }
    }

    /**
     * Request changes on a change by ID or at cursor position.
     * Always requires a reason explaining what changes are needed.
     */
    public async requestChangesAtCursor(changeId?: string): Promise<void> {
        const found = this.findChangeForCommand(changeId);
        if (!found) return;
        const { change } = found;

        const reason = await vscode.window.showInputBox({
            prompt: 'What changes are needed?',
            placeHolder: 'Describe requested changes...',
            validateInput: (v) => v.trim() ? null : 'Feedback is required',
        });
        if (reason === undefined) return;

        const { success } = await this.lspBridge.sendLifecycleRequest('changedown/reviewChange', {
            changeId: change.id ?? '',
            decision: 'request_changes',
            reason,
        });
        if (success) {
            vscode.window.showInformationMessage('Changes requested');
        }
    }

    /**
     * Withdraw a previous request-changes decision on a change by ID or at cursor position.
     */
    public async withdrawRequestAtCursor(changeId?: string): Promise<void> {
        const found = this.findChangeForCommand(changeId);
        if (!found) return;
        const { change } = found;

        const { success } = await this.lspBridge.sendLifecycleRequest('changedown/reviewChange', {
            changeId: change.id ?? '',
            decision: 'withdraw',
        });
        if (success) {
            vscode.window.showInformationMessage('Request withdrawn');
        }
    }

    /**
     * Amend a change by ID or at cursor position.
     * Shows InputBox pre-populated with current text, then asks for reason.
     */
    public async amendChangeAtCursor(changeId?: string): Promise<void> {
        const found = this.findChangeForCommand(changeId);
        if (!found) return;
        const { change } = found;

        const currentText = change.modifiedText ?? change.originalText ?? '';
        const newText = await vscode.window.showInputBox({
            prompt: `Amend ${change.id ?? 'change'}`,
            value: currentText,
            placeHolder: 'Enter amended text...',
        });
        if (newText === undefined) return;

        const reason = await vscode.window.showInputBox({
            prompt: 'Reason for amendment',
            placeHolder: 'Enter reason...',
        });
        if (reason === undefined) return;

        const { success } = await this.lspBridge.sendLifecycleRequest('changedown/amendChange', {
            changeId: change.id ?? '',
            newText,
            reason,
        });
        if (success) {
            vscode.window.showInformationMessage('Change amended');
        }
    }

    /**
     * Supersede a change by ID or at cursor position.
     * Shows InputBox for replacement text, then asks for reason.
     */
    public async supersedeChangeAtCursor(changeId?: string): Promise<void> {
        const found = this.findChangeForCommand(changeId);
        if (!found) return;
        const { change } = found;

        const newText = await vscode.window.showInputBox({
            prompt: `Propose alternative for ${change.id ?? 'change'}`,
            placeHolder: 'Enter replacement text...',
        });
        if (newText === undefined) return;

        const reason = await vscode.window.showInputBox({
            prompt: 'Reason for superseding',
            placeHolder: 'Enter reason...',
        });
        if (reason === undefined) return;

        const { success } = await this.lspBridge.sendLifecycleRequest('changedown/supersedeChange', {
            changeId: change.id ?? '',
            newText,
            reason,
        });
        if (success) {
            vscode.window.showInformationMessage('Change superseded');
        }
    }

    // ── Bulk review commands ──────────────────────────────────────────

    /**
     * Accept all pending changes in the document.
     */
    public async acceptAllChanges(): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor) return;

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, languageId, true);
        const changes = virtualDoc.getChanges();

        if (changes.length === 0) {
            vscode.window.showInformationMessage('No changes found in document');
            return;
        }

        if (!await this.confirmBulkAction('Accept', changes.length)) return;

        const { success, result } = await this.lspBridge.sendLifecycleRequest<{ edit?: unknown; reviewedCount?: number; error?: string }>('changedown/reviewAll', {
            decision: 'approve',
        });
        if (success && result?.reviewedCount) {
            vscode.window.showInformationMessage(`Accepted ${result.reviewedCount} change${result.reviewedCount === 1 ? '' : 's'}`);
        }
    }

    /**
     * Reject all pending changes in the document.
     */
    public async rejectAllChanges(): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor) return;

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, languageId, true);
        const changes = virtualDoc.getChanges();

        if (changes.length === 0) {
            vscode.window.showInformationMessage('No changes found in document');
            return;
        }

        if (!await this.confirmBulkAction('Reject', changes.length)) return;

        const { success, result } = await this.lspBridge.sendLifecycleRequest<{ edit?: unknown; reviewedCount?: number; error?: string }>('changedown/reviewAll', {
            decision: 'reject',
        });
        if (success && result?.reviewedCount) {
            vscode.window.showInformationMessage(`Rejected ${result.reviewedCount} change${result.reviewedCount === 1 ? '' : 's'}`);
        }
    }

    // ── Line-scoped review commands ───────────────────────────────────

    /**
     * Accept all proposed changes on the current cursor line.
     * Captures change IDs from the original cursor line BEFORE the LSP call
     * and passes them to reviewAll, which processes all of them atomically.
     */
    public async acceptAllOnLine(): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor) return;

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, languageId, true);
        const cursorLine = editor.selection.active.line;

        // Find proposed changes on current line
        const onLine = virtualDoc.getChanges().filter((c: ChangeNode) => {
            if (c.settled || c.status !== ChangeStatus.Proposed) return false;
            const changeLineNum = text.slice(0, c.range.start).split('\n').length - 1;
            return changeLineNum === cursorLine;
        });

        if (onLine.length === 0) {
            vscode.window.showInformationMessage('No proposed changes on this line');
            return;
        }

        const targetChangeIds = onLine.map((c: ChangeNode) => c.id).filter((id): id is string => Boolean(id));

        const { success, result } = await this.lspBridge.sendLifecycleRequest<{ edit?: unknown; reviewedCount?: number; error?: string }>('changedown/reviewAll', {
            decision: 'approve',
            changeIds: targetChangeIds,
        });
        if (success && result?.reviewedCount) {
            vscode.window.showInformationMessage(`Accepted ${result.reviewedCount} change${result.reviewedCount === 1 ? '' : 's'} on line`);
        }
    }

    /**
     * Reject all proposed changes on the current cursor line.
     * Captures change IDs from the original cursor line BEFORE the LSP call
     * and passes them to reviewAll, which processes all of them atomically.
     */
    public async rejectAllOnLine(): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor) return;

        const text = editor.document.getText();
        const languageId = editor.document.languageId;
        const uri = editor.document.uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uri, text, languageId, true);
        const cursorLine = editor.selection.active.line;

        // Find proposed changes on current line
        const onLine = virtualDoc.getChanges().filter((c: ChangeNode) => {
            if (c.settled || c.status !== ChangeStatus.Proposed) return false;
            const changeLineNum = text.slice(0, c.range.start).split('\n').length - 1;
            return changeLineNum === cursorLine;
        });

        if (onLine.length === 0) {
            vscode.window.showInformationMessage('No proposed changes on this line');
            return;
        }

        const targetChangeIds = onLine.map((c: ChangeNode) => c.id).filter((id): id is string => Boolean(id));

        const { success, result } = await this.lspBridge.sendLifecycleRequest<{ edit?: unknown; reviewedCount?: number; error?: string }>('changedown/reviewAll', {
            decision: 'reject',
            changeIds: targetChangeIds,
        });
        if (success && result?.reviewedCount) {
            vscode.window.showInformationMessage(`Rejected ${result.reviewedCount} change${result.reviewedCount === 1 ? '' : 's'} on line`);
        }
    }

    // ── Document-scoped review commands (SCM context menu) ────────────

    /**
     * Accept all pending changes in the document at the given URI.
     * Used from SCM context menu (file-scoped accept all).
     */
    public async acceptAllInDocument(uri: vscode.Uri): Promise<void> {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
            ?? await vscode.workspace.openTextDocument(uri);
        if (!isSupported(doc)) return;

        const text = doc.getText();
        const languageId = doc.languageId;
        const uriStr = uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uriStr, text, languageId, true);
        const changes = virtualDoc.getChanges();
        if (changes.length === 0) return;
        if (!await this.confirmBulkAction('Accept', changes.length)) return;

        // CRITICAL: Focus target document before the LSP call.
        // sendLifecycleRequest uses findSupportedEditor() which returns the ACTIVE editor.
        // If SCM context menu targets a non-active document, this silently operates on the wrong doc.
        await vscode.window.showTextDocument(doc, { preview: false });

        const { success, result } = await this.lspBridge.sendLifecycleRequest<{ edit?: unknown; reviewedCount?: number; error?: string }>('changedown/reviewAll', {
            decision: 'approve',
        });
        if (success && result?.reviewedCount) {
            vscode.window.showInformationMessage(`Accepted ${result.reviewedCount} change${result.reviewedCount === 1 ? '' : 's'} in file`);
        }
    }

    /**
     * Reject all pending changes in the document at the given URI.
     * Used from SCM context menu (file-scoped reject all).
     */
    public async rejectAllInDocument(uri: vscode.Uri): Promise<void> {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString())
            ?? await vscode.workspace.openTextDocument(uri);
        if (!isSupported(doc)) return;

        const text = doc.getText();
        const languageId = doc.languageId;
        const uriStr = uri.toString();
        const virtualDoc = this.docStateManager.getVirtualDocumentFor(uriStr, text, languageId, true);
        const changes = virtualDoc.getChanges();
        if (changes.length === 0) return;
        if (!await this.confirmBulkAction('Reject', changes.length)) return;

        // CRITICAL: Focus target document before the LSP call.
        // sendLifecycleRequest uses findSupportedEditor() which returns the ACTIVE editor.
        // If SCM context menu targets a non-active document, this silently operates on the wrong doc.
        await vscode.window.showTextDocument(doc, { preview: false });

        const { success, result } = await this.lspBridge.sendLifecycleRequest<{ edit?: unknown; reviewedCount?: number; error?: string }>('changedown/reviewAll', {
            decision: 'reject',
        });
        if (success && result?.reviewedCount) {
            vscode.window.showInformationMessage(`Rejected ${result.reviewedCount} change${result.reviewedCount === 1 ? '' : 's'} in file`);
        }
    }

    // ── Compact commands ──────────────────────────────────────────────

    /**
     * Compact a change from Level 2 to Level 1 via LSP.
     * If changeId is provided, finds the change by ID; otherwise uses cursor position.
     */
    public async compactChange(changeId?: string): Promise<void> {
        const found = this.findChangeForCommand(changeId);
        if (!found) return;
        const { change } = found;

        const { success } = await this.lspBridge.sendLifecycleRequest('changedown/compactChange', {
            changeId: change.id ?? '',
            fully: false,
        });
        if (success) {
            vscode.window.showInformationMessage('Change compacted (L2 -> L1)');
        }
    }

    /**
     * Fully compact a change to Level 0 via LSP.
     * If changeId is provided, finds the change by ID; otherwise uses cursor position.
     */
    public async compactChangeFully(changeId?: string): Promise<void> {
        const found = this.findChangeForCommand(changeId);
        if (!found) return;
        const { change } = found;

        const { success } = await this.lspBridge.sendLifecycleRequest('changedown/compactChange', {
            changeId: change.id ?? '',
            fully: true,
        });
        if (success) {
            vscode.window.showInformationMessage('Change fully compacted (L2/L1 -> L0)');
        }
    }

    /**
     * Compact all accepted/rejected resolved changes in the active document.
     * Shows a confirmation dialog before proceeding.
     */
    public async compactAllResolved(): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor) return;

        const uri = editor.document.uri.toString();
        const languageId = editor.document.languageId;

        // Initial parse to count candidates for the confirmation dialog
        const initialDoc = this.docStateManager.getVirtualDocumentFor(uri, editor.document.getText(), languageId, true);
        const initialCount = initialDoc.getChanges().filter(c => {
            const status = c.metadata?.status ?? c.inlineMetadata?.status ?? c.status;
            const isTerminal = status === 'accepted' || status === 'rejected';
            const isResolved = c.metadata?.resolution?.type === 'resolved';
            return isTerminal && isResolved && c.id;
        }).length;

        if (initialCount === 0) {
            vscode.window.showInformationMessage('No resolved changes to compact');
            return;
        }

        const confirm = await vscode.window.showInformationMessage(
            `Compact ${initialCount} resolved change(s)?`,
            { modal: true },
            'Compact'
        );
        if (confirm !== 'Compact') return;

        // Re-parse between each compaction to avoid stale IDs after document mutation
        let compactedCount = 0;
        let lastCandidateId: string | undefined;
        while (true) {
            const currentEditor = findSupportedEditor();
            if (!currentEditor) break;

            const freshDoc = this.docStateManager.getVirtualDocumentFor(
                currentEditor.document.uri.toString(),
                currentEditor.document.getText(),
                currentEditor.document.languageId,
                true
            );

            // Pick the last resolved candidate (highest offset) for offset safety
            const candidate = freshDoc.getChanges()
                .filter(c => {
                    const status = c.metadata?.status ?? c.inlineMetadata?.status ?? c.status;
                    const isTerminal = status === 'accepted' || status === 'rejected';
                    const isResolved = c.metadata?.resolution?.type === 'resolved';
                    return isTerminal && isResolved && c.id;
                })
                .sort((a, b) => b.range.start - a.range.start)[0];

            if (!candidate) break;
            // Guard against infinite loop if LSP succeeds but doesn't remove the change
            if (candidate.id === lastCandidateId) break;
            lastCandidateId = candidate.id;

            const { success } = await this.lspBridge.sendLifecycleRequest('changedown/compactChange', {
                changeId: candidate.id,
                fully: true,
            });
            if (!success) break;
            compactedCount++;
        }

        if (compactedCount > 0) {
            vscode.window.showInformationMessage(`Compacted ${compactedCount} resolved changes`);
        }
    }

    // ── Comment insertion ─────────────────────────────────────────────

    /**
     * Insert a comment at cursor or wrap selection in comment.
     * Respects changedown.commentInsertFormat (inline | footnote) and
     * changedown.commentInsertAuthor. Default: footnote with author.
     * @param predefinedText Optional text to use instead of prompting (for testing)
     */
    public async addComment(predefinedText?: string): Promise<void> {
        const editor = findSupportedEditor();
        if (!editor || editor.document.languageId !== 'markdown') {
            return;
        }

        const config = vscode.workspace.getConfiguration('changedown');
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
            const maxId = scanMaxCnId(text);
            const newId = `cn-${maxId + 1}`;

            const inlineEdit = selection.isEmpty
                ? this.docStateManager.workspace.insertComment(commentText, cursorOffset)
                : this.docStateManager.workspace.insertComment(
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
            this.editTracking.isApplyingTrackedEdit = true;
            let applySuccess = false;
            try {
                applySuccess = await vscode.workspace.applyEdit(wsEdit);
            } finally {
                this.editTracking.isApplyingTrackedEdit = false;
            }
            if (!applySuccess) {
                vscode.window.showWarningMessage('Comment insertion failed — please try again');
                return;
            }
        } else {
            const body = includeAuthor ? (() => {
                const author = this.getAuthor();
                return author ? `@${author}: ${commentText}` : commentText;
            })() : commentText;
            let edit: { offset: number; length: number; newText: string };
            if (selection.isEmpty) {
                edit = this.docStateManager.workspace.insertComment(body, cursorOffset);
            } else {
                const selectionRange = {
                    start: positionToOffset(text, selection.start),
                    end: positionToOffset(text, selection.end)
                };
                edit = this.docStateManager.workspace.insertComment(body, cursorOffset, selectionRange, selectedText);
            }
            const vscodeEdit = coreEditToVscode(text, edit);
            this.editTracking.isApplyingTrackedEdit = true;
            let editSuccess = false;
            try {
                editSuccess = await editor.edit(editBuilder => {
                    editBuilder.replace(vscodeEdit.range, vscodeEdit.newText);
                });
            } finally {
                this.editTracking.isApplyingTrackedEdit = false;
            }
            if (!editSuccess) {
                vscode.window.showWarningMessage('Comment insertion failed — please try again');
                return;
            }
        }

        this.callbacks.updateDecorations(editor);
    }

    // ── Dispose ───────────────────────────────────────────────────────

    public dispose(): void {
        // No owned disposables — stateless command handler.
    }
}
