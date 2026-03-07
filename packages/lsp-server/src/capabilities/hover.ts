/**
 * Hover Capability
 *
 * Provides hover information for CriticMarkup comments.
 * Shows comment text for:
 * - Standalone comments: {>>comment text<<}
 * - Highlights with attached comments: {==text==}{>>comment<<}
 */

import { Hover, Position, MarkupKind } from 'vscode-languageserver';
import { ChangeNode, ChangeType } from '@changetracks/core';
import { positionToOffset } from '../converters';

/**
 * Create hover information for a position in the document.
 *
 * Returns hover when position is inside a change that has comment/reason metadata:
 * - Comment: standalone {>>...<<} → "Comment: ..."
 * - Highlight with attached comment → "Comment: ..."
 * - Insertion/Deletion/Substitution with footnote reason → "Reason: ..."
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

  // Find the change that contains this position
  const change = changes.find(
    (c) => offset >= c.range.start && offset < c.range.end
  );

  if (!change) {
    return null;
  }

  const commentText = change.metadata?.comment;
  if (!commentText || commentText.trim() === '') {
    return null;
  }

  // Comment and Highlight: label as "Comment" (inline or attached comment)
  if (change.type === ChangeType.Comment || change.type === ChangeType.Highlight) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Comment:** ${commentText}`
      }
    };
  }

  // Insertion, Deletion, Substitution: label as "Reason" (footnote reason, same as tree view)
  if (
    change.type === ChangeType.Insertion ||
    change.type === ChangeType.Deletion ||
    change.type === ChangeType.Substitution
  ) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Reason:** ${commentText}`
      }
    };
  }

  return null;
}
