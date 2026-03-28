/**
 * Shared utilities for footnote block parsing and manipulation.
 *
 * Provides block-level operations: detecting the terminal footnote block start,
 * finding footnote blocks by ID, parsing header fields, finding insertion indices
 * for discussion/review lines, and finding child footnotes.
 */

import { FOOTNOTE_DEF_START, FOOTNOTE_CONTINUATION } from './footnote-patterns.js';

/**
 * Counts footnote definition lines that have the given status.
 * Only lines that are footnote headers (e.g. `[^cn-1]: @a | date | type | proposed`) are counted,
 * not body text that might contain "| proposed" or similar.
 */
export function countFootnoteHeadersWithStatus(
  content: string,
  status: 'proposed' | 'accepted' | 'rejected'
): number {
  let count = 0;
  for (const s of extractFootnoteStatuses(content).values()) {
    if (s === status) count++;
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
        if (lines[j].startsWith('[^cn-')) break;
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
          while (k < lines.length && !lines[k].startsWith('[^cn-')) {
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
 * Format: `[^cn-N]: @author | date | type | status`
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
 * Returns an array of child IDs, e.g. ['cn-1.1', 'cn-1.2', 'cn-1.3'].
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
 * Works for both simple IDs (e.g. `cn-1`) and dotted group members (e.g. `cn-3.2`).
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

/**
 * Find the 0-based line index where the terminal footnote block starts.
 * Returns `lines.length` if no footnote definitions exist.
 *
 * Uses a backward scan from end-of-file, exploiting the structural invariant
 * that real footnotes are always a contiguous block at the end. This avoids
 * false positives from [^cn- patterns inside code blocks, CriticMarkup, or
 * literal body text.
 *
 * Uses FOOTNOTE_DEF_START (matches `[^cn-N]:` at column 0) rather than
 * FOOTNOTE_DEF_LENIENT for resilience against malformed trailing footnotes.
 */
export function findFootnoteBlockStart(lines: string[]): number {

  // Phase 1: Find the last footnote definition (scanning backward)
  let lastDefIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (FOOTNOTE_DEF_START.test(lines[i])) {
      lastDefIdx = i;
      break;
    }
  }

  if (lastDefIdx === -1) {
    return lines.length; // No footnotes
  }

  // Phase 1b: Verify the block containing lastDefIdx is truly terminal.
  // Walk forward from lastDefIdx through footnote defs, continuations, and
  // blank lines. If we encounter non-blank, non-footnote body content before
  // reaching EOF, this "footnote" is inside body text (e.g. a code fence) and
  // we must scan backward for the next candidate.
  let candidate = lastDefIdx;
  while (candidate >= 0) {
    let j = candidate + 1;
    let isTerminal = true;
    while (j < lines.length) {
      const line = lines[j];
      if (FOOTNOTE_DEF_START.test(line) || FOOTNOTE_CONTINUATION.test(line)) {
        j++;
      } else if (line.trim() === '') {
        j++;
      } else {
        isTerminal = false;
        break;
      }
    }
    if (isTerminal) {
      lastDefIdx = candidate;
      break;
    }
    // Not terminal — scan backward for the next candidate
    candidate--;
    while (candidate >= 0 && !FOOTNOTE_DEF_START.test(lines[candidate])) {
      candidate--;
    }
  }

  if (candidate < 0) {
    return lines.length; // No terminal footnote block
  }

  // Phase 2: Scan backward from lastDefIdx through the contiguous block.
  // Blank lines are included only if a footnote def or continuation appears before them.
  let blockStart = lastDefIdx;
  for (let i = lastDefIdx - 1; i >= 0; i--) {
    const line = lines[i];
    if (FOOTNOTE_DEF_START.test(line) || FOOTNOTE_CONTINUATION.test(line)) {
      blockStart = i;
    } else if (line.trim() === '') {
      // Include this blank only if there is a footnote def or continuation before it
      let hasFootnoteBefore = false;
      for (let k = i - 1; k >= 0; k--) {
        if (lines[k].trim() === '') continue;
        if (FOOTNOTE_DEF_START.test(lines[k]) || FOOTNOTE_CONTINUATION.test(lines[k])) {
          hasFootnoteBefore = true;
        }
        break;
      }
      if (hasFootnoteBefore) {
        blockStart = i;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return blockStart;
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

/**
 * Lightweight footnote status extractor. Scans footnote definition headers
 * for change IDs and their statuses using regex — no full AST parse needed.
 *
 * Uses the last pipe-delimited field as the status, handling all author formats
 * (with or without @ prefix, ai: prefix, etc.).
 *
 * Returns Map<changeId, statusString> where statusString is lowercase
 * (e.g. "proposed", "accepted", "rejected").
 */
const FOOTNOTE_ID_AND_STATUS_RE = /^\[\^(cn-\d+(?:\.\d+)?)\]:.*\|\s*(\S+)\s*$/;

export function extractFootnoteStatuses(text: string): Map<string, string> {
  const statuses = new Map<string, string>();
  const lines = text.split('\n');
  for (const line of lines) {
    const m = FOOTNOTE_ID_AND_STATUS_RE.exec(line);
    if (m) {
      statuses.set(m[1], m[2].toLowerCase());
    }
  }
  return statuses;
}
