import { ChangeNode, ChangeType, TextEdit } from '../model/types.js';
import { FOOTNOTE_DEF_STATUS } from '../footnote-patterns.js';
import { nowTimestamp } from '../timestamp.js';

/**
 * Separated text + footnote ref parts from an accept/reject operation.
 * Used by the segment builder in settleAcceptedChangesOnly to avoid
 * text duplication when processing adjacent changes on the same line.
 */
export interface AcceptRejectParts {
  offset: number;
  length: number;
  text: string;   // Content without footnote ref
  refId: string;  // Footnote ID (e.g. 'ct-1') or '' if no ref
}

export function computeAcceptParts(change: ChangeNode): AcceptRejectParts {
  const rangeLength = change.range.end - change.range.start;
  const refId = change.level >= 2 ? change.id : '';

  switch (change.type) {
    case ChangeType.Insertion:
      return { offset: change.range.start, length: rangeLength, text: change.modifiedText ?? '', refId };
    case ChangeType.Deletion:
      return { offset: change.range.start, length: rangeLength, text: '', refId };
    case ChangeType.Substitution:
      return { offset: change.range.start, length: rangeLength, text: change.modifiedText ?? '', refId };
    case ChangeType.Highlight:
      return { offset: change.range.start, length: rangeLength, text: change.originalText ?? '', refId };
    case ChangeType.Comment:
      return { offset: change.range.start, length: rangeLength, text: '', refId: '' };
  }
}

export function computeRejectParts(change: ChangeNode): AcceptRejectParts {
  const rangeLength = change.range.end - change.range.start;
  const refId = change.level >= 2 ? change.id : '';

  switch (change.type) {
    case ChangeType.Insertion:
      return { offset: change.range.start, length: rangeLength, text: '', refId };
    case ChangeType.Deletion:
      return { offset: change.range.start, length: rangeLength, text: change.originalText ?? '', refId };
    case ChangeType.Substitution:
      return { offset: change.range.start, length: rangeLength, text: change.originalText ?? '', refId };
    case ChangeType.Highlight:
      return { offset: change.range.start, length: rangeLength, text: change.originalText ?? '', refId };
    case ChangeType.Comment:
      return { offset: change.range.start, length: rangeLength, text: '', refId: '' };
  }
}

export function computeAccept(change: ChangeNode): TextEdit {
  const parts = computeAcceptParts(change);
  const ref = parts.refId ? `[^${parts.refId}]` : '';
  return { offset: parts.offset, length: parts.length, newText: parts.text + ref };
}

export function computeReject(change: ChangeNode): TextEdit {
  const parts = computeRejectParts(change);
  const ref = parts.refId ? `[^${parts.refId}]` : '';
  return { offset: parts.offset, length: parts.length, newText: parts.text + ref };
}

/**
 * Finds footnote definition header lines for the given change IDs and returns
 * TextEdits that replace the status field (4th pipe-delimited field).
 *
 * The canonical statuses (proposed, accepted, rejected) are exactly 8 characters.
 * Legacy 'pending' (7 chars) is also recognized for backward compatibility;
 * the 1-char length difference is safe because edits are applied in reverse
 * document order and each footnote occupies its own line.
 */
const FOOTNOTE_STATUS_RE = FOOTNOTE_DEF_STATUS;
const KNOWN_STATUSES = new Set(['proposed', 'accepted', 'rejected', 'pending']);

export function computeFootnoteStatusEdits(
  text: string,
  changeIds: string[],
  newStatus: 'accepted' | 'rejected'
): TextEdit[] {
  if (changeIds.length === 0) return [];

  const idSet = new Set(changeIds.filter(id => id !== ''));
  if (idSet.size === 0) return [];

  const edits: TextEdit[] = [];
  const lines = text.split('\n');
  let offset = 0;

  for (const line of lines) {
    const match = line.match(FOOTNOTE_STATUS_RE);
    if (match && idSet.has(match[1])) {
      const currentStatus = match[2];
      if (currentStatus !== newStatus && KNOWN_STATUSES.has(currentStatus)) {
        const matchEnd = match.index! + match[0].length;
        const statusOffset = offset + matchEnd - currentStatus.length;
        edits.push({
          offset: statusOffset,
          length: currentStatus.length,
          newText: newStatus,
        });
      }
    }
    offset += line.length + 1; // +1 for the \n
  }

  return edits;
}

export interface ApprovalLineOptions {
  author: string;
  date?: string;
  reason?: string;
}

function findFootnoteBlock(lines: string[], changeId: string): { headerLine: number; blockEnd: number } | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`[^${changeId}]:`)) {
      let end = i;
      let j = i + 1;
      while (j < lines.length) {
        if (lines[j].startsWith('[^ct-')) break;
        if (lines[j].startsWith('    ')) {
          end = j;
          j++;
          continue;
        }
        if (lines[j].trim() === '') {
          let k = j + 1;
          let hasMore = false;
          while (k < lines.length && !lines[k].startsWith('[^ct-')) {
            if (lines[k].startsWith('    ')) {
              hasMore = true;
              break;
            }
            if (lines[k].trim() !== '') break;
            k++;
          }
          if (hasMore) {
            j++;
            continue;
          }
          break;
        }
        break;
      }
      return { headerLine: i, blockEnd: end };
    }
  }
  return null;
}

function isResolutionLine(trimmed: string): boolean {
  return trimmed.startsWith('resolved') || trimmed.startsWith('open --') || trimmed.startsWith('open ') || trimmed === 'open';
}

function findReviewInsertionIndex(lines: string[], headerLine: number, blockEnd: number): number {
  let insertAfter = headerLine;
  for (let i = headerLine + 1; i <= blockEnd; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (isResolutionLine(trimmed)) return i - 1;
    insertAfter = i;
  }
  return insertAfter;
}

/**
 * Returns a TextEdit that inserts one `approved:` or `rejected:` line into the
 * footnote block for the given change ID, or null if the block is not found.
 * Used to record who accepted/rejected when identity is available (ADR-031).
 */
export function computeApprovalLineEdit(
  text: string,
  changeId: string,
  newStatus: 'accepted' | 'rejected',
  opts: ApprovalLineOptions
): TextEdit | null {
  const lines = text.split('\n');
  const block = findFootnoteBlock(lines, changeId);
  if (!block) return null;

  const keyword = newStatus === 'accepted' ? 'approved:' : 'rejected:';
  const date = opts.date ?? nowTimestamp().raw;
  const reasonPart = opts.reason !== undefined && opts.reason !== '' ? ` "${opts.reason}"` : '';
  const line = `    ${keyword} @${opts.author} ${date}${reasonPart}`;

  const insertAfterIdx = findReviewInsertionIndex(lines, block.headerLine, block.blockEnd);
  const offset = lines
    .slice(0, insertAfterIdx + 1)
    .join('\n')
    .length;
  return { offset, length: 0, newText: '\n' + line };
}

/**
 * Returns a TextEdit that inserts an `archive:` line into the footnote block
 * for the given change ID, recording the reference text (for "archive on accept").
 * Used when the user wants to keep a footnote record of what was accepted.
 * Escapes content with JSON.stringify so newlines and quotes are safe.
 */
export function computeFootnoteArchiveLineEdit(
  text: string,
  changeId: string,
  referenceText: string
): TextEdit | null {
  if (!referenceText.trim()) return null;
  const lines = text.split('\n');
  const block = findFootnoteBlock(lines, changeId);
  if (!block) return null;

  const line = `    archive: ${JSON.stringify(referenceText)}`;
  const insertAfterIdx = block.headerLine;
  const offset = lines
    .slice(0, insertAfterIdx + 1)
    .join('\n')
    .length;
  return { offset, length: 0, newText: '\n' + line };
}
