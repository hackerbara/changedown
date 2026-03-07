/**
 * Tracked hashline extensions — ChangeTracks layer on top of base hashline.
 *
 * Provides "settled" line hashing (strips CriticMarkup using accept-all semantics)
 * and hashline formatting for tracked files.
 */

import { computeLineHash } from './hashline.js';
import {
  singleLineSubstitution,
  singleLineDeletion,
  singleLineInsertion,
  singleLineHighlight,
  singleLineComment,
  inlineMarkupAll,
  markupWithRef,
} from './critic-regex.js';
import {
  footnoteRefGlobal,
  FOOTNOTE_DEF_STATUS_VALUE,
} from './footnote-patterns.js';

// ─── settledLine ────────────────────────────────────────────────────────────

/**
 * Strip CriticMarkup from a single line using accept-all semantics.
 *
 * - `{++text++}` → `text`
 * - `{--text--}` → `` (empty)
 * - `{~~old~>new~~}` → `new`
 * - `{==text==}` → `text`
 * - `{>>comment<<}` → `` (empty)
 * - `[^ct-N]` / `[^ct-N.M]` → `` (empty)
 *
 * Does NOT use the full parser — regex-based for speed on single lines.
 */
export function settledLine(line: string): string {
  let result = line;

  // Order: substitutions first (contain ~> which could confuse other patterns),
  // then deletions, insertions, highlights, comments, footnote refs.
  result = result.replace(singleLineSubstitution(), '$1');
  result = result.replace(singleLineDeletion(), '');
  result = result.replace(singleLineInsertion(), '$1');
  result = result.replace(singleLineHighlight(), '$1');
  result = result.replace(singleLineComment(), '');
  result = result.replace(footnoteRefGlobal(), '');

  return result;
}

// ─── computeSettledLineHash ─────────────────────────────────────────────────

/**
 * Compute a settled-content hash for a line.
 * Strips CriticMarkup (accept-all), then hashes the result.
 *
 * @param idx - Line index (passed through to computeLineHash for API compat)
 * @param line - The raw line content (with CriticMarkup)
 * @param allSettledLines - Optional pre-computed settled versions of all lines
 *   for context-aware hashing. When provided, blank lines hash differently
 *   based on surrounding content (eliminates the frequency-attractor problem).
 *   Callers should pre-compute this once via `lines.map(l => settledLine(l))`
 *   and pass it to each call to avoid O(n²) redundant work.
 * @returns 2-char lowercase hex hash of the settled content
 */
export function computeSettledLineHash(idx: number, line: string, allSettledLines?: string[]): string {
  return computeLineHash(idx, settledLine(line), allSettledLines);
}

// ─── formatTrackedHashLines ─────────────────────────────────────────────────


/**
 * Format file content with tracked hashline coordinates.
 *
 * Each line is formatted as `LINE:HASH|CONTENT` where HASH is the raw
 * content hash (2-char hex). Line numbers are right-aligned for readability.
 *
 * @param content - The file content (newline-separated)
 * @param options.startLine - Starting line number (default: 1)
 */
export function formatTrackedHashLines(
  content: string,
  options?: { startLine?: number },
): string {
  const startLine = options?.startLine ?? 1;
  const lines = content.split('\n');
  const totalLines = lines.length;
  const maxLineNum = startLine + totalLines - 1;
  const padWidth = String(maxLineNum).length;

  return lines
    .map((line, i) => {
      const lineNum = startLine + i;
      const paddedNum = String(lineNum).padStart(padWidth, ' ');
      const rawHash = computeLineHash(i, line, lines);

      return `${paddedNum}:${rawHash}|${line}`;
    })
    .join('\n');
}

// ─── formatTrackedHeader ────────────────────────────────────────────────────

// Regex constants imported from shared modules:
// - FOOTNOTE_DEF_STATUS_VALUE (from footnote-patterns.ts)
// - inlineMarkupAll(), markupWithRef() (from critic-regex.ts)

/**
 * Count CriticMarkup changes by status (proposed, accepted, rejected).
 *
 * Scans footnote definitions for status and counts Level 0 changes
 * (inline markup without an immediately following footnote ref) as proposed.
 */
function countChanges(content: string): { proposed: number; accepted: number; rejected: number } {
  const counts = { proposed: 0, accepted: 0, rejected: 0 };
  const lines = content.split('\n');

  // Count from footnote definitions
  for (const line of lines) {
    const match = line.match(FOOTNOTE_DEF_STATUS_VALUE);
    if (match) {
      const status = match[1] as 'proposed' | 'accepted' | 'rejected';
      counts[status]++;
    }
  }

  // Count Level 0 changes (inline markup NOT followed by a footnote ref)
  // Strategy: count all inline markup instances, subtract those with refs
  const allMarkup = content.match(inlineMarkupAll()) || [];
  const markupWithRefs = content.match(markupWithRef()) || [];
  const level0Count = allMarkup.length - markupWithRefs.length;

  if (level0Count > 0) {
    counts.proposed += level0Count;
  }

  return counts;
}

/**
 * Generate the header block for read_tracked_file output.
 *
 * Format:
 * ```
 * ## file: <filePath>
 * ## tracking: <status> (N proposed, M accepted, K rejected)
 * ## lines: S-E of L
 * ## tip: Use LINE:HASH refs in propose_change for precise edits
 * ```
 *
 * @param filePath - The file path to display
 * @param content - The full file content (for counting changes and lines)
 * @param trackingStatus - Override tracking status (default: "tracked")
 */
export function formatTrackedHeader(
  filePath: string,
  content: string,
  trackingStatus?: string,
): string {
  const status = trackingStatus ?? 'tracked';
  const lineCount = content.split('\n').length;
  const changes = countChanges(content);

  // Build change summary
  const changeParts: string[] = [];
  if (changes.proposed > 0) changeParts.push(`${changes.proposed} proposed`);
  if (changes.accepted > 0) changeParts.push(`${changes.accepted} accepted`);
  if (changes.rejected > 0) changeParts.push(`${changes.rejected} rejected`);

  const changeSummary = changeParts.length > 0 ? ` (${changeParts.join(', ')})` : '';

  const headerLines = [
    `## file: ${filePath}`,
    `## tracking: ${status}${changeSummary}`,
    `## lines: 1-${lineCount} of ${lineCount}`,
    `## tip: Use LINE:HASH refs in propose_change for precise edits`,
  ];

  return headerLines.join('\n');
}
