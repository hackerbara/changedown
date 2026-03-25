/**
 * Code Lens Capability
 *
 * Provides inline action buttons for CriticMarkup changes.
 * Supports three modes: cursor (default), always, off.
 */

import { CodeLens, Command, Range } from 'vscode-languageserver';
import { ChangeNode, ChangeStatus, isGhostNode } from '@changetracks/core';
import type { ViewName } from '@changetracks/core';
import { offsetToPosition } from '../converters';

/** CodeLens display mode */
export type CodeLensMode = 'cursor' | 'always' | 'off';

/** Cursor state sent from extension via changetracks/cursorPosition notification */
export interface CursorState {
  line: number;       // zero-indexed line number
  changeId?: string;  // id of change cursor is inside, or undefined
}

/**
 * Create code lenses for CriticMarkup changes.
 *
 * @param changes Array of change nodes from parser
 * @param text Full document text (needed for offset-to-position conversion)
 * @param viewMode Current view mode — CodeLens is suppressed in settled/raw
 * @param codeLensMode Display mode: cursor, always, or off
 * @param cursorState Current cursor position (for cursor mode)
 * @param coherenceRate Optional coherence percentage (0–100); triggers document-level lens when < 100
 * @returns Array of CodeLens objects
 */
export function createCodeLenses(
  changes: ChangeNode[],
  text: string,
  viewMode?: ViewName,
  codeLensMode?: CodeLensMode,
  cursorState?: CursorState,
  coherenceRate?: number
): CodeLens[] {
  const lenses: CodeLens[] = [];

  // Document-level coherence lens — appears in all modes except raw and off
  if (coherenceRate !== undefined && coherenceRate < 100 && viewMode !== 'raw' && codeLensMode !== 'off') {
    const unresolvedCount = changes.filter(isGhostNode).length;
    if (unresolvedCount > 0) {
      lenses.push({
        range: Range.create(0, 0, 0, 0),
        command: Command.create(
          `⚠ ${unresolvedCount} unresolved anchor${unresolvedCount === 1 ? '' : 's'}`,
          'changetracks.inspectUnresolved'
        ),
      });
    }
  }

  // Off mode or clean preview modes — return early with document-level lenses only
  if (codeLensMode === 'off') return lenses;
  if (viewMode === 'settled' || viewMode === 'raw') return lenses;

  const mode = codeLensMode ?? 'cursor';

  const resolved = changes.filter(c => !isGhostNode(c));
  // Filter to actionable (proposed, unsettled) changes — ghost nodes already excluded above
  const actionable = resolved.filter(c => !c.settled && c.status === ChangeStatus.Proposed && !c.consumedBy);
  if (actionable.length === 0) return lenses;

  if (mode === 'always') {
    return lenses.concat(buildAlwaysModeLenses(actionable, text));
  }

  // Cursor mode
  return lenses.concat(buildCursorModeLenses(actionable, text, cursorState));
}

/**
 * Always mode: one row per actionable change with lifecycle indicators.
 * Multi-change lines get content snippet prefixes.
 */
function buildAlwaysModeLenses(actionable: ChangeNode[], text: string): CodeLens[] {
  const lenses: CodeLens[] = [];

  // Group changes by line to detect multi-change lines
  const changesByLine = new Map<number, ChangeNode[]>();
  for (const change of actionable) {
    const pos = offsetToPosition(text, change.range.start);
    const line = pos.line;
    const group = changesByLine.get(line) ?? [];
    group.push(change);
    changesByLine.set(line, group);
  }

  for (const change of actionable) {
    const position = offsetToPosition(text, change.range.start);
    const lensRange = Range.create(position, position);
    const indicator = buildLifecycleIndicator(change);
    const suffix = indicator ? ` · ${indicator}` : '';

    // Content snippet for multi-change lines
    const lineChanges = changesByLine.get(position.line) ?? [];
    let snippet = '';
    if (lineChanges.length > 1) {
      const content = getChangeContent(change);
      const truncated = content.length > 20 ? content.slice(0, 20) + '…' : content;
      snippet = ` "${truncated}"`;
    }

    lenses.push({
      range: lensRange,
      command: Command.create(
        `Accept${snippet}${suffix}`,
        'changetracks.acceptChange',
        change.id
      )
    });

    lenses.push({
      range: lensRange,
      command: Command.create(
        `Reject${snippet}${suffix}`,
        'changetracks.rejectChange',
        change.id
      )
    });
  }

  return lenses;
}

/**
 * Cursor mode: single row on cursor's line only.
 * Inside a change → Accept/Reject for that change.
 * On line but outside changes → Accept All (N) / Reject All (N).
 */
function buildCursorModeLenses(
  actionable: ChangeNode[],
  text: string,
  cursorState?: CursorState
): CodeLens[] {
  if (!cursorState) return [];

  const cursorLine = cursorState.line;

  // Find actionable changes on the cursor's line
  const onLine = actionable.filter(c => {
    const pos = offsetToPosition(text, c.range.start);
    return pos.line === cursorLine;
  });

  if (onLine.length === 0) return [];

  // If cursor is inside a specific change, show that change's Accept/Reject
  if (cursorState.changeId) {
    const focused = onLine.find(c => c.id === cursorState.changeId);
    if (focused) {
      const position = offsetToPosition(text, focused.range.start);
      const lensRange = Range.create(position, position);
      const indicator = buildLifecycleIndicator(focused);
      const suffix = indicator ? ` · ${indicator}` : '';

      return [
        {
          range: lensRange,
          command: Command.create(
            `Accept${suffix}`,
            'changetracks.acceptChange',
            focused.id
          )
        },
        {
          range: lensRange,
          command: Command.create(
            `Reject${suffix}`,
            'changetracks.rejectChange',
            focused.id
          )
        }
      ];
    }
  }

  // Cursor on line but not inside a change → line-level batch
  const firstPos = offsetToPosition(text, onLine[0].range.start);
  const lensRange = Range.create(firstPos, firstPos);

  // Aggregate indicators across all changes on line
  const aggregated = buildAggregatedIndicator(onLine);
  const suffix = aggregated ? ` · ${aggregated}` : '';

  return [
    {
      range: lensRange,
      command: Command.create(
        `Accept All (${onLine.length})${suffix}`,
        'changetracks.acceptAllOnLine'
      )
    },
    {
      range: lensRange,
      command: Command.create(
        `Reject All (${onLine.length})${suffix}`,
        'changetracks.rejectAllOnLine'
      )
    }
  ];
}

/**
 * Build a lifecycle state indicator string for a change.
 * Shows discussion count, request-changes warning, amendment indicator.
 * Resolved threads suppress the discussion indicator.
 */
export function buildLifecycleIndicator(change: ChangeNode): string {
  const meta = change.metadata;
  if (!meta) return '';

  const parts: string[] = [];

  // Discussion count (suppressed when thread is resolved)
  const isResolved = meta.resolution?.type === 'resolved';
  if (!isResolved && meta.discussion && meta.discussion.length > 0) {
    parts.push(`💬 ${meta.discussion.length}`);
  }

  // Request-changes warning
  if (meta.requestChanges && meta.requestChanges.length > 0) {
    parts.push('⚠');
  }

  // Amendment/revision indicator
  const hasRevisions = meta.revisions && meta.revisions.length > 0;
  if (hasRevisions) {
    parts.push('✎');
  }

  return parts.join(' ');
}

/**
 * Build aggregated indicator across multiple changes on a line.
 * Sums discussion counts, shows ⚠ if any has request-changes.
 */
function buildAggregatedIndicator(changes: ChangeNode[]): string {
  const parts: string[] = [];
  let totalDiscussion = 0;
  let hasRequestChanges = false;
  let hasRevisions = false;

  for (const change of changes) {
    const meta = change.metadata;
    if (!meta) continue;
    const isResolved = meta.resolution?.type === 'resolved';
    if (!isResolved && meta.discussion) {
      totalDiscussion += meta.discussion.length;
    }
    if (meta.requestChanges && meta.requestChanges.length > 0) {
      hasRequestChanges = true;
    }
    if (meta.revisions && meta.revisions.length > 0) {
      hasRevisions = true;
    }
  }

  if (totalDiscussion > 0) parts.push(`💬 ${totalDiscussion}`);
  if (hasRequestChanges) parts.push('⚠');
  if (hasRevisions) parts.push('✎');

  return parts.join(' ');
}

/**
 * Extract display content from a change for snippet labels.
 */
function getChangeContent(change: ChangeNode): string {
  return change.modifiedText ?? change.originalText ?? '';
}
