/**
 * Code Actions Capability
 *
 * Provides accept/reject actions for individual CriticMarkup changes
 * and bulk operations to accept or reject all changes at once.
 *
 * Delegates to core computeAccept/computeReject for edit computation,
 * converting offset-based TextEdits to LSP Range-based TextEdits.
 */

import { CodeAction, CodeActionKind, Diagnostic, TextEdit } from 'vscode-languageserver';
import {
  ChangeNode, ChangeType,
  computeAccept, computeReject, computeFootnoteStatusEdits, computeApprovalLineEdit,
  TextEdit as CoreTextEdit,
  nowTimestamp,
} from '@changetracks/core';
import { offsetRangeToLspRange } from '../converters';

/**
 * Shape of `diagnostic.data` attached by our diagnostics provider.
 */
interface DiagnosticData {
  changeId: string;
}

/**
 * Type guard: returns true when `data` carries a `changeId` string.
 */
function isDiagnosticData(data: unknown): data is DiagnosticData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'changeId' in data &&
    typeof (data as DiagnosticData).changeId === 'string'
  );
}

/**
 * Convert core offset-based TextEdits to LSP position-based TextEdits.
 */
function coreEditsToLsp(coreEdits: CoreTextEdit[], text: string): TextEdit[] {
  return coreEdits.map(edit => ({
    range: offsetRangeToLspRange(text, edit.offset, edit.offset + edit.length),
    newText: edit.newText,
  }));
}

/**
 * Create code actions for a diagnostic.
 */
export function createCodeActions(
  diagnostic: Diagnostic,
  changes: ChangeNode[],
  text: string,
  uri: string,
  reviewerIdentity?: string
): CodeAction[] {
  const actions: CodeAction[] = [];

  if (isDiagnosticData(diagnostic.data)) {
    const change = changes.find(c => c.id === diagnostic.data.changeId);
    if (change) {
      actions.push(...createPerChangeActions(change, text, uri, reviewerIdentity));
    }
  }

  actions.push(...createBulkActions(changes, text, uri, reviewerIdentity));

  return actions;
}

// ============================================================================
// Per-Change Actions
// ============================================================================

function createPerChangeActions(change: ChangeNode, text: string, uri: string, reviewerIdentity?: string): CodeAction[] {
  switch (change.type) {
    case ChangeType.Insertion:
      return [
        createAction('Accept insertion', change, text, uri, 'accept', reviewerIdentity),
        createAction('Reject insertion', change, text, uri, 'reject', reviewerIdentity),
      ];
    case ChangeType.Deletion:
      return [
        createAction('Accept deletion', change, text, uri, 'accept', reviewerIdentity),
        createAction('Reject deletion', change, text, uri, 'reject', reviewerIdentity),
      ];
    case ChangeType.Substitution:
      return [
        createAction('Accept substitution', change, text, uri, 'accept', reviewerIdentity),
        createAction('Reject substitution', change, text, uri, 'reject', reviewerIdentity),
      ];
    case ChangeType.Highlight:
      return [createAction('Remove highlight', change, text, uri, 'accept', reviewerIdentity)];
    case ChangeType.Comment:
      return [createAction('Remove comment', change, text, uri, 'accept', reviewerIdentity)];
    default:
      return [];
  }
}

/**
 * Create a single accept or reject code action for a change.
 * Uses core computeAccept/computeReject + computeFootnoteStatusEdits.
 * When reviewerIdentity is provided, also appends an approved:/rejected: attribution line.
 */
function createAction(
  title: string,
  change: ChangeNode,
  text: string,
  uri: string,
  mode: 'accept' | 'reject',
  reviewerIdentity?: string
): CodeAction {
  const coreEdit = mode === 'accept' ? computeAccept(change) : computeReject(change);
  const allCoreEdits: CoreTextEdit[] = [coreEdit];

  if (change.id) {
    const footnoteStatus = mode === 'accept' ? 'accepted' : 'rejected';
    allCoreEdits.push(...computeFootnoteStatusEdits(text, [change.id], footnoteStatus));

    if (reviewerIdentity) {
      const date = nowTimestamp().date;
      const approvalEdit = computeApprovalLineEdit(text, change.id, footnoteStatus, { author: reviewerIdentity, date });
      if (approvalEdit) allCoreEdits.push(approvalEdit);
    }
  }

  return {
    title,
    kind: CodeActionKind.QuickFix,
    edit: {
      changes: { [uri]: coreEditsToLsp(allCoreEdits, text) },
    },
  };
}

// ============================================================================
// Bulk Actions
// ============================================================================

function createBulkActions(changes: ChangeNode[], text: string, uri: string, reviewerIdentity?: string): CodeAction[] {
  return [
    createBulkAction('Accept all changes', changes, text, uri, 'accept', reviewerIdentity),
    createBulkAction('Reject all changes', changes, text, uri, 'reject', reviewerIdentity),
  ];
}

function createBulkAction(
  title: string,
  changes: ChangeNode[],
  text: string,
  uri: string,
  mode: 'accept' | 'reject',
  reviewerIdentity?: string
): CodeAction {
  const computeFn = mode === 'accept' ? computeAccept : computeReject;
  const sortedChanges = [...changes].sort((a, b) => b.range.start - a.range.start);

  const coreEdits: CoreTextEdit[] = sortedChanges.map(computeFn);

  // Add footnote status edits and approval attribution
  const ids = changes.map(c => c.id).filter(id => id !== '');
  if (ids.length > 0) {
    const footnoteStatus = mode === 'accept' ? 'accepted' : 'rejected';
    coreEdits.push(...computeFootnoteStatusEdits(text, ids, footnoteStatus));

    if (reviewerIdentity) {
      const date = nowTimestamp().date;
      for (const id of ids) {
        const approvalEdit = computeApprovalLineEdit(text, id, footnoteStatus, { author: reviewerIdentity, date });
        if (approvalEdit) coreEdits.push(approvalEdit);
      }
    }
  }

  return {
    title,
    kind: CodeActionKind.Source,
    edit: {
      changes: { [uri]: coreEditsToLsp(coreEdits, text) },
    },
  };
}
