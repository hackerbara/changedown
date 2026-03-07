/**
 * Shared utilities for footnote block parsing and manipulation.
 *
 * Distinct from footnote-parser.ts which does full parsing into FootnoteInfo.
 * This module provides block-level operations: finding footnote blocks by ID,
 * parsing header fields, finding insertion indices for discussion/review lines,
 * and finding child footnotes.
 */

/** Matches a footnote definition header line; status is the fourth pipe-separated field. */
const FOOTNOTE_HEADER_STATUS_RE = /^\[\^ct-\d+(?:\.\d+)?\]:.*\|\s*(\S+)\s*$/;

/**
 * Counts footnote definition lines that have the given status.
 * Only lines that are footnote headers (e.g. `[^ct-1]: @a | date | type | proposed`) are counted,
 * not body text that might contain "| proposed" or similar.
 */
export function countFootnoteHeadersWithStatus(
  content: string,
  status: 'proposed' | 'accepted' | 'rejected'
): number {
  const lines = content.split('\n');
  let count = 0;
  for (const line of lines) {
    const m = line.match(FOOTNOTE_HEADER_STATUS_RE);
    if (m && m[1] === status) count++;
  }
  return count;
}

export interface FootnoteBlock {
  headerLine: number;      // index of the [^id]: line
  blockEnd: number;        // index of the last content line in this block
  headerContent: string;   // the raw header line text
}

/**
 * Finds a footnote definition block by change ID.
 * A block starts with `[^{changeId}]:` and includes all subsequent
 * 4-space-indented lines. Empty lines within the block are tolerated
 * (they don't terminate the block as long as more indented lines follow).
 */
export function findFootnoteBlock(lines: string[], changeId: string): FootnoteBlock | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`[^${changeId}]:`)) {
      let end = i;
      let j = i + 1;
      while (j < lines.length) {
        // Stop at next footnote definition
        if (lines[j].startsWith('[^ct-')) break;
        // Accept indented lines (content)
        if (lines[j].startsWith('    ')) {
          end = j;
          j++;
          continue;
        }
        // Accept empty lines only if more indented content follows
        if (lines[j].trim() === '') {
          // Look ahead for more indented content before next footnote
          let k = j + 1;
          let hasMore = false;
          while (k < lines.length && !lines[k].startsWith('[^ct-')) {
            if (lines[k].startsWith('    ')) { hasMore = true; break; }
            if (lines[k].trim() !== '') break; // non-indented, non-empty = end of block
            k++;
          }
          if (hasMore) {
            j++;
            continue; // skip empty line, more content follows
          }
          break; // no more content, end of block
        }
        break; // non-indented, non-empty line
      }
      return { headerLine: i, blockEnd: end, headerContent: lines[i] };
    }
  }
  return null;
}

/**
 * Parses a footnote header line into structured fields.
 * Format: `[^ct-N]: @author | date | type | status`
 * Returns null if the header is malformed (fewer than 4 pipe-separated parts).
 */
export interface FootnoteHeader {
  author: string;
  date: string;
  type: string;
  status: string;
}

export function parseFootnoteHeader(headerLine: string): FootnoteHeader | null {
  const colonIdx = headerLine.indexOf(':');
  if (colonIdx === -1) return null;
  const content = headerLine.slice(colonIdx + 1).trim();
  const parts = content.split('|').map(p => p.trim());
  if (parts.length < 4) return null;
  return {
    author: parts[0].replace(/^@/, ''),
    date: parts[1],
    type: parts[2],
    status: parts[3],
  };
}

/**
 * Finds the correct insertion point for a discussion entry.
 * Returns the line index AFTER which to insert (i.e., splice at returnValue + 1).
 *
 * Insertion goes after metadata (reason:, context:) and existing discussion,
 * but before approval (approved:, rejected:, request-changes:) and
 * resolution (resolved, open) markers.
 */
export function findDiscussionInsertionIndex(lines: string[], headerLine: number, blockEnd: number): number {
  // Walk from headerLine+1 to blockEnd, find the last line that is NOT an approval/resolution
  let insertAfter = headerLine; // default: right after header

  for (let i = headerLine + 1; i <= blockEnd; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue; // skip empty lines
    if (isApprovalOrResolutionLine(trimmed)) {
      // We've hit the approval/resolution section -- insert BEFORE this line
      return i - 1;
    }
    insertAfter = i;
  }

  return insertAfter;
}

/**
 * Finds the correct insertion point for an approval/review line.
 * Returns the line index AFTER which to insert.
 * Approval lines go after discussion but before resolution markers (resolved/open).
 */
export function findReviewInsertionIndex(lines: string[], headerLine: number, blockEnd: number): number {
  let insertAfter = headerLine;

  for (let i = headerLine + 1; i <= blockEnd; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (isResolutionLine(trimmed)) {
      return i - 1;
    }
    insertAfter = i;
  }

  return insertAfter;
}

/**
 * Finds all child footnote IDs for a group parent.
 * A child is any footnote whose ID starts with `{parentId}.` (dotted notation).
 * Returns an array of child IDs, e.g. ['ct-1.1', 'ct-1.2', 'ct-1.3'].
 */
export function findChildFootnoteIds(lines: string[], parentId: string): string[] {
  const prefix = `[^${parentId}.`;
  const children: string[] = [];
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      const closeBracket = line.indexOf(']:');
      if (closeBracket !== -1) {
        children.push(line.slice(2, closeBracket)); // Extract ID between [^ and ]
      }
    }
  }
  return children;
}

/**
 * Resolves a change by ID, searching both the footnote definition block and
 * any inline `[^changeId]` reference in prose.
 *
 * Returns an object with:
 * - `footnoteBlock`: the footnote definition block (authoritative), or null if absent
 * - `inlineRefOffset`: character offset of the inline `[^changeId]` ref in the file, or null if absent
 *
 * Returns null if neither a footnote block nor an inline ref exists for the ID.
 *
 * Distinguishes inline refs from footnote definitions by checking whether the
 * character immediately after `[^changeId]` is `:` (which would indicate a definition).
 *
 * Works for both simple IDs (e.g. `ct-1`) and dotted group members (e.g. `ct-3.2`).
 */
export function resolveChangeById(
  fileContent: string,
  changeId: string,
): {
  footnoteBlock: FootnoteBlock | null;
  inlineRefOffset: number | null;
} | null {
  const lines = fileContent.split('\n');

  // 1. Find footnote definition (authoritative)
  const footnoteBlock = findFootnoteBlock(lines, changeId);

  // 2. Find inline [^changeId] ref in prose
  const refPattern = `[^${changeId}]`;
  const refIndex = fileContent.indexOf(refPattern);
  // Distinguish inline ref from footnote definition: footnote def starts with [^id]:
  const inlineRefOffset = refIndex !== -1 && fileContent[refIndex + refPattern.length] !== ':'
    ? refIndex
    : null;

  if (!footnoteBlock && inlineRefOffset === null) {
    return null;
  }

  return { footnoteBlock, inlineRefOffset };
}

function isApprovalOrResolutionLine(trimmed: string): boolean {
  return trimmed.startsWith('approved:') ||
    trimmed.startsWith('rejected:') ||
    trimmed.startsWith('request-changes:') ||
    trimmed.startsWith('resolved') ||
    trimmed.startsWith('open --') ||
    trimmed.startsWith('open ') ||
    trimmed === 'open';
}

function isResolutionLine(trimmed: string): boolean {
  return trimmed.startsWith('resolved') ||
    trimmed.startsWith('open --') ||
    trimmed.startsWith('open ') ||
    trimmed === 'open';
}
