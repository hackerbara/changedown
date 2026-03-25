import { footnoteRefNumericGlobal } from '../footnote-patterns.js';
import { nowTimestamp } from '../timestamp.js';
import { ChangeType } from '../model/types.js';

/**
 * Generates a footnote definition line for a ChangeTracks change.
 *
 * Format: `[^id]: @author | date | type | proposed`
 * When author is omitted: `[^id]: date | type | proposed`
 *
 * Always prefixed with `\n\n` (blank line separator) so the footnote
 * can be appended at the end of a document.
 */
export function generateFootnoteDefinition(
  id: string,
  type: string,
  author?: string,
  date?: string,
): string {
  const d = date ?? nowTimestamp().date;
  const authorPart = author ? `@${author} | ` : '';
  return `\n\n[^${id}]: ${authorPart}${d} | ${type} | proposed`;
}

/**
 * Builds a CriticMarkup edit-op string from parts.
 * Used by L2→L3 conversion and L3 crystallization.
 *
 * Examples: `{++text++}`, `{--text--}`, `{~~old~>new~~}`
 */
export function buildEditOpFromParts(
  changeType: string,
  originalText: string,
  currentText: string,
): string {
  switch (changeType) {
    case 'insertion': return `{++${currentText}++}`;
    case 'deletion': return `{--${originalText}--}`;
    case 'highlight': return `{==${originalText}==}`;
    case 'comment': return `{>>${originalText}<<}`;
    default: return `{~~${originalText}~>${currentText}~~}`;  // substitution
  }
}

/**
 * Formats the L3 footnote continuation line: `    LINE:HASH {edit-op}`
 * The 4-space indent marks it as a continuation of the footnote definition.
 */
export function formatL3EditOpLine(lineNumber: number, hash: string, editOp: string): string {
  return `    ${lineNumber}:${hash} ${editOp}`;
}

/** Maps ChangeType enum to the string key used by buildEditOpFromParts. */
const CHANGE_TYPE_KEY: Record<ChangeType, string> = {
  [ChangeType.Insertion]: 'insertion',
  [ChangeType.Deletion]: 'deletion',
  [ChangeType.Substitution]: 'substitution',
  [ChangeType.Highlight]: 'highlight',
  [ChangeType.Comment]: 'comment',
};

export interface ContextualEditOpParams {
  changeType: ChangeType;
  originalText: string;
  currentText: string;
  lineContent: string;   // clean body line (footnote refs MUST be stripped)
  lineNumber: number;     // 1-indexed
  hash: string;           // 2+ hex char line hash
  column: number;         // 0-indexed on the ref-stripped line
  anchorLen: number;      // body-side text length (caller-computed, status-dependent)
}

/**
 * Builds a complete L3 edit-op line with contextual anchoring.
 *
 * Always embeds the CriticMarkup op within a unique substring of the body
 * line, using surrounding context for unambiguous parser resolution.
 * Word-boundary snapping makes context durable against minor edits.
 *
 * IMPORTANT: `lineContent` must be the clean body line with footnote refs
 * stripped. `column` must be the offset on this stripped line.
 *
 * Returns: `    LINE:HASH contextBefore{op}contextAfter`
 */
export function buildContextualL3EditOp(params: ContextualEditOpParams): string {
  const { changeType, originalText, currentText, lineContent, lineNumber, hash, column, anchorLen } = params;

  const rawOp = buildEditOpFromParts(CHANGE_TYPE_KEY[changeType], originalText, currentText);

  if (!lineContent) {
    return formatL3EditOpLine(lineNumber, hash, rawOp);
  }

  const clampedCol = Math.max(0, Math.min(column, lineContent.length));
  const clampedEnd = Math.max(clampedCol, Math.min(clampedCol + anchorLen, lineContent.length));

  // Expand to unique span — right-first, always expand at least once.
  // Right-first bias means contextBefore stays within the anchor word
  // when right-side context is sufficient for uniqueness.
  let spanStart = clampedCol;
  let spanEnd = clampedEnd;
  let expandLeft = false; // start by expanding right
  let unique = false;

  while (!unique) {
    if (!expandLeft) {
      if (spanEnd < lineContent.length) spanEnd++;
      expandLeft = true;
    } else {
      if (spanStart > 0) spanStart--;
      expandLeft = false;
    }

    const candidate = lineContent.slice(spanStart, spanEnd);
    const first = lineContent.indexOf(candidate);
    const second = lineContent.indexOf(candidate, first + 1);
    unique = second === -1;

    if (spanStart === 0 && spanEnd === lineContent.length) {
      unique = true; // full line is always unique within itself
    }
  }

  // Word-boundary snap
  const preSnapStart = spanStart;
  const preSnapEnd = spanEnd;

  // Right snap: extend to end of current word
  while (spanEnd < lineContent.length && lineContent[spanEnd] !== ' ') spanEnd++;

  // Left snap: extend spanStart left to the previous space (or line start).
  while (spanStart > 0 && lineContent[spanStart - 1] !== ' ') spanStart--;

  // Re-check uniqueness after snap — fall back to pre-snap if broken
  const snapped = lineContent.slice(spanStart, spanEnd);
  const snapFirst = lineContent.indexOf(snapped);
  const snapSecond = lineContent.indexOf(snapped, snapFirst + 1);
  if (snapSecond !== -1) {
    spanStart = preSnapStart;
    spanEnd = preSnapEnd;
  }

  const contextBefore = lineContent.slice(spanStart, clampedCol);
  const contextAfter = lineContent.slice(clampedEnd, spanEnd);

  return `    ${lineNumber}:${hash} ${contextBefore}${rawOp}${contextAfter}`;
}

/**
 * Scans text for all `[^ct-N]` and `[^ct-N.M]` patterns and returns
 * the maximum parent ID number found. Returns 0 if no ct-IDs exist.
 */
export function scanMaxCtId(text: string): number {
  const pattern = footnoteRefNumericGlobal();
  let max = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const n = parseInt(match[1], 10);
    if (n > max) {
      max = n;
    }
  }
  return max;
}
