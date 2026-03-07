/**
 * Shared utilities for MCP server change tools.
 *
 * Extracted from get-change.ts and list-changes.ts to eliminate duplication.
 */

import { ChangeType } from '@changetracks/core';

/**
 * Map from core ChangeType enum values to short string labels used in
 * tool responses (get_change, list_changes).
 */
export const TYPE_MAP: Record<ChangeType, 'ins' | 'del' | 'sub' | 'highlight' | 'comment'> = {
  [ChangeType.Insertion]: 'ins',
  [ChangeType.Deletion]: 'del',
  [ChangeType.Substitution]: 'sub',
  [ChangeType.Highlight]: 'highlight',
  [ChangeType.Comment]: 'comment',
};

/**
 * Convert a character offset in text to a 1-based line number.
 * O(n) scan -- suitable for infrequent use on small-to-medium files.
 */
export function offsetToLineNumber(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}
