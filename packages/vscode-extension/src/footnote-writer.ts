import * as vscode from 'vscode';
import { nowTimestamp } from '@changedown/core';

/**
 * Locates the insertion point for a new discussion entry in a footnote block.
 * Returns the offset where the new line should be inserted.
 *
 * Insertion point: after the last existing discussion line, before any
 * resolution marker. If no discussion lines exist, after the header line.
 */
export function findReplyInsertionPoint(text: string, scId: string): number | null {
  const defPattern = new RegExp(`^\\[\\^${escapeRegex(scId)}\\]:\\s+`, 'm');
  const match = text.match(defPattern);
  if (!match || match.index === undefined) return null;

  const lines = text.split('\n');
  let offset = 0;
  let inFootnote = false;
  let lastBodyLineEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inFootnote) {
      if (offset === match.index || line.match(new RegExp(`^\\[\\^${escapeRegex(scId)}\\]:`))) {
        inFootnote = true;
        lastBodyLineEnd = offset + line.length;
      }
    } else {
      // Still in footnote body?
      if (line.trim() === '') {
        // Blank line: tolerated in body
      } else if (/^[\t ]/.test(line)) {
        // Indented continuation — check if it's a resolution marker
        if (/^\s+(resolved|open)\b/.test(line)) {
          // Insert BEFORE resolution marker
          break;
        }
        lastBodyLineEnd = offset + line.length;
      } else {
        // Non-indented, non-blank: end of footnote
        break;
      }
    }
    offset += line.length + 1; // +1 for \n
  }

  return lastBodyLineEnd === -1 ? null : lastBodyLineEnd;
}

/**
 * Format a reply as a footnote discussion entry.
 */
export function formatReply(author: string, text: string): string {
  const date = nowTimestamp().raw;
  const lines = text.split('\n');
  const first = `\n    @${author} ${date}: ${lines[0]}`;
  const rest = lines.slice(1).map(l => `    ${l}`).join('\n');
  return rest ? `${first}\n${rest}` : first;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
