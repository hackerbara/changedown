/**
 * Hover Capability
 *
 * Provides hover information for CriticMarkup changes.
 * Shows:
 * - Consumed ops: "Consumed by X" / "Partially consumed by X"
 * - Standalone comments: {>>comment text<<} → "Comment: ..."
 * - Highlights with attached comments: {==text==}{>>comment<<} → "Comment: ..."
 * - Insertion/Deletion/Substitution with footnote reason → "Reason: ..."
 * - Consuming ops: "This change consumed X, Y" (with optional reason)
 */

import { Hover, Position, MarkupKind } from 'vscode-languageserver';
import { ChangeNode, ChangeType, isGhostNode, consumptionLabel } from '@changetracks/core';
import { positionToOffset } from '../converters';

/**
 * Create hover information for a position in the document.
 *
 * Returns hover when position is inside a change that is hoverable:
 * - Consumed op → "Consumed by X" (or "Partially consumed by X")
 * - Comment: standalone {>>...<<} → "Comment: ..."
 * - Highlight with attached comment → "Comment: ..."
 * - Insertion/Deletion/Substitution with footnote reason → "Reason: ..."
 * - Consuming op (absorbed earlier changes) → "This change consumed X, Y"
 *
 * @param position The cursor position
 * @param changes All changes in the document
 * @param text The full document text
 * @returns Hover information or null if position is not in a hoverable change
 */
export function createHover(
  position: Position,
  changes: ChangeNode[],
  text: string
): Hover | null {
  const offset = positionToOffset(text, position);

  // Filter out unresolved ghost nodes (anchored=false, level >= 2) — zero-width at {0,0}.
  const resolvedChanges = changes.filter(c => !isGhostNode(c));

  // Find the change that contains this position.
  // Zero-width ranges (start === end, e.g. L3 deletions) require exact-match
  // because the half-open interval [start, end) is empty for them.
  const change = resolvedChanges.find((c) =>
    c.range.start === c.range.end
      ? offset === c.range.start  // zero-width: exact match
      : offset >= c.range.start && offset < c.range.end
  );

  if (!change) {
    return null;
  }

  // Consumed ops: show consumption relationship
  if (change.consumedBy) {
    const label = consumptionLabel(change.consumptionType);
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${label} by ${change.consumedBy}**\n\nThis change's visible effect was absorbed by a later edit. The change is preserved in the document history.`
      }
    };
  }

  const commentText = change.metadata?.comment;

  // Comment and Highlight: label as "Comment" (inline or attached comment)
  if (change.type === ChangeType.Comment || change.type === ChangeType.Highlight) {
    if (!commentText || commentText.trim() === '') {
      return null;
    }
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Comment:** ${commentText}`
      }
    };
  }

  // Insertion, Deletion, Substitution: check if this op consumed others
  if (
    change.type === ChangeType.Insertion ||
    change.type === ChangeType.Deletion ||
    change.type === ChangeType.Substitution
  ) {
    const consumedPredecessors = changes.filter(c => c.consumedBy === change.id);
    const hasComment = commentText && commentText.trim() !== '';
    const hasConsumed = consumedPredecessors.length > 0;

    if (!hasComment && !hasConsumed) {
      return null;
    }

    const ids = consumedPredecessors.map(c => c.id).join(', ');
    const reasonPart = hasComment ? `**Reason:** ${commentText}` : '';
    const consumedPart = hasConsumed ? `*This change consumed ${ids}*` : '';
    const separator = reasonPart && consumedPart ? '\n\n' : '';

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `${reasonPart}${separator}${consumedPart}`
      }
    };
  }

  return null;
}
