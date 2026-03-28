/**
 * Code Actions Capability
 *
 * Provides accept/reject actions for individual CriticMarkup changes
 * and bulk operations to accept or reject all changes at once.
 *
 * Produces LSP Command objects that route through the extension's
 * changedown.acceptChange / changedown.rejectChange commands,
 * which in turn call handleReviewChange and handle both L2 and L3
 * correctly via applyReview.
 */

import { CodeAction, CodeActionKind, Command, Diagnostic } from 'vscode-languageserver';
import { ChangeNode, ChangeType, isGhostNode, type DiagnosticData } from '@changedown/core';

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

  const resolved = changes.filter(c => !isGhostNode(c));

  if (isDiagnosticData(diagnostic.data)) {
    if (diagnostic.data.consumed) {
      const change = changes.find(c => c.id === diagnostic.data.changeId);
      const hasThread = (change?.replyCount ?? 0) > 0;
      actions.push(...createConsumedActions(diagnostic.data.changeId, diagnostic.data.consumedBy!, hasThread));
    } else if (diagnostic.data.unresolved) {
      actions.push(...createUnresolvedActions(diagnostic.data.changeId));
    } else {
      const change = resolved.find(c => c.id === diagnostic.data.changeId);
      if (change) {
        actions.push(...createPerChangeActions(change, text, uri, reviewerIdentity));
      }
    }
  }

  actions.push(...createBulkActions(resolved, text, uri, reviewerIdentity));

  return actions;
}

// ============================================================================
// Unresolved Anchor Actions
// ============================================================================

function createUnresolvedActions(changeId: string): CodeAction[] {
  const searchTitle = 'Search for anchor text';
  const jumpTitle = 'Jump to footnote';
  return [
    {
      title: searchTitle,
      kind: CodeActionKind.QuickFix,
      command: Command.create(searchTitle, 'changedown.searchAnchorText', changeId),
    },
    {
      title: jumpTitle,
      kind: CodeActionKind.QuickFix,
      command: Command.create(jumpTitle, 'changedown.jumpToFootnote', changeId),
    },
  ];
}

// ============================================================================
// Consumed Op Actions
// ============================================================================

function createConsumedActions(changeId: string, consumedBy: string, hasActiveThread = false): CodeAction[] {
  const actions: CodeAction[] = [
    {
      title: `Go to consuming change (${consumedBy})`,
      kind: CodeActionKind.QuickFix,
      command: Command.create(
        `Go to consuming change (${consumedBy})`,
        'changedown.jumpToFootnote',
        consumedBy
      ),
    },
  ];
  // Disable compact when discussion thread is active (spec edge case)
  if (!hasActiveThread) {
    actions.push({
      title: 'Compact consumed footnote',
      kind: CodeActionKind.RefactorRewrite,
      command: Command.create(
        'Compact consumed footnote',
        'changedown.compactChange',
        changeId
      ),
    });
  }
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
        createAction('Request changes', change, text, uri, 'request_changes', reviewerIdentity),
        createAction('Withdraw request', change, text, uri, 'withdraw', reviewerIdentity),
      ];
    case ChangeType.Deletion:
      return [
        createAction('Accept deletion', change, text, uri, 'accept', reviewerIdentity),
        createAction('Reject deletion', change, text, uri, 'reject', reviewerIdentity),
        createAction('Request changes', change, text, uri, 'request_changes', reviewerIdentity),
        createAction('Withdraw request', change, text, uri, 'withdraw', reviewerIdentity),
      ];
    case ChangeType.Substitution:
      return [
        createAction('Accept substitution', change, text, uri, 'accept', reviewerIdentity),
        createAction('Reject substitution', change, text, uri, 'reject', reviewerIdentity),
        createAction('Request changes', change, text, uri, 'request_changes', reviewerIdentity),
        createAction('Withdraw request', change, text, uri, 'withdraw', reviewerIdentity),
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
 * Create a single code action for a change.
 * Produces a Command object that routes through the extension's command handlers,
 * which support both L2 (inline CriticMarkup) and L3 (footnote-native).
 */
function createAction(
  title: string,
  change: ChangeNode,
  _text: string,
  _uri: string,
  mode: 'accept' | 'reject' | 'request_changes' | 'withdraw',
  _reviewerIdentity?: string
): CodeAction {
  const commandMap: Record<string, string> = {
    accept: 'changedown.acceptChange',
    reject: 'changedown.rejectChange',
    request_changes: 'changedown.requestChanges',
    withdraw: 'changedown.withdrawRequest',
  };
  return {
    title,
    kind: CodeActionKind.QuickFix,
    command: Command.create(title, commandMap[mode], change.id),
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
  _changes: ChangeNode[],
  _text: string,
  _uri: string,
  mode: 'accept' | 'reject',
  _reviewerIdentity?: string
): CodeAction {
  const commandName = mode === 'accept' ? 'changedown.acceptAll' : 'changedown.rejectAll';
  return {
    title,
    kind: CodeActionKind.Source,
    command: Command.create(title, commandName),
  };
}
