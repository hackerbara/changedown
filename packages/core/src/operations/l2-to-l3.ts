/**
 * L2 → L3 conversion.
 *
 * Takes an L2 document (inline CriticMarkup + footnotes) and produces an L3
 * document (clean body + enriched footnotes with LINE:HASH {edit-op}).
 *
 * Algorithm:
 *   1. Parse the L2 text with CriticMarkupParser → ChangeNode[]
 *   2. Strip all CriticMarkup from the body in reverse document order
 *      (so offsets remain valid as we splice)
 *   3. Strip all inline [^cn-N] footnote refs from the body
 *   4. Compute line hashes on the resulting clean body
 *   5. For each change, find which line it lands on in the clean body and build
 *      the edit-op string ({++...++}, {--...--}, etc.)
 *   6. Enrich each footnote definition's first body line with "LINE:HASH {edit-op}"
 *   7. Return the assembled L3 text
 */

import { ChangeNode, ChangeType, ChangeStatus } from '../model/types.js';
import { CriticMarkupParser } from '../parser/parser.js';
import { computeLineHash, initHashline } from '../hashline.js';
import { footnoteRefGlobal, FOOTNOTE_DEF_START, FOOTNOTE_CONTINUATION, splitBodyAndFootnotes } from '../footnote-patterns.js';
import { buildContextualL3EditOp } from './footnote-generator.js';

// ─── Body text replacement ────────────────────────────────────────────────────

/**
 * Returns the replacement text for a change node when stripping CriticMarkup
 * from the body. Status determines which text wins.
 *
 * The L3 body is the "accepted-all" view — every change is applied as if accepted,
 * regardless of status. The change status is preserved in the footnote definition.
 * This mirrors the settled-text.ts accept-all semantics.
 *
 * Exception: rejected insertions and rejected substitutions still strip their
 * inserted/modified text from the body (the text was never accepted), while
 * rejected deletions still keep their original text.
 */
export function bodyReplacement(change: ChangeNode): string {
  switch (change.type) {
    case ChangeType.Insertion:
      // Rejected insertion: the text was not accepted, so remove it from body
      if (change.status === ChangeStatus.Rejected) return '';
      return change.modifiedText ?? '';

    case ChangeType.Deletion:
      // Rejected deletion: original text is preserved (deletion was rejected)
      if (change.status === ChangeStatus.Rejected) return change.originalText ?? '';
      return '';

    case ChangeType.Substitution:
      // Rejected substitution: keep original text
      if (change.status === ChangeStatus.Rejected) return change.originalText ?? '';
      return change.modifiedText ?? '';

    case ChangeType.Highlight:
      return change.originalText ?? '';

    case ChangeType.Comment:
      return '';
  }
}

// ─── Line number finder ───────────────────────────────────────────────────────

/**
 * Build an array of line-start offsets for O(log n) offset→line lookups.
 */
export function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * Given a character offset, return the 1-indexed line number using binary search.
 */
export function offsetToLineNumber(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// ─── Main conversion ─────────────────────────────────────────────────────────

/**
 * Convert an L2 document (inline CriticMarkup + footnotes) to L3 format
 * (clean body + enriched footnotes with LINE:HASH {edit-op}).
 *
 * Returns the input unchanged if no CriticMarkup changes are found.
 */
export async function convertL2ToL3(text: string): Promise<string> {
  await initHashline();

  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();

  if (changes.length === 0) return text;

  // ── Step 1: Strip CriticMarkup from body in reverse order ─────────────────
  // Sort descending by range.start so splicing doesn't invalidate later offsets.
  const sortedAsc = [...changes].sort((a, b) => a.range.start - b.range.start);
  const sortedDesc = sortedAsc.slice().reverse();

  // Perform actual body replacement in reverse order
  let body = text;
  for (const change of sortedDesc) {
    const replacement = bodyReplacement(change);
    body = body.slice(0, change.range.start) + replacement + body.slice(change.range.end);
  }

  // ── Step 2: Split body from footnote section ──────────────────────────────
  // Do this BEFORE stripping refs so that footnote def lines ([^cn-N]: ...)
  // are not corrupted by the global ref-stripping regex.
  const split = splitBodyAndFootnotes(body.split('\n'));
  let cleanBodyLines = split.bodyLines;
  const footnoteLines = split.footnoteLines;

  // ── Step 3: Strip inline [^cn-N] refs from body ONLY ─────────────────────
  // Note: The parser already includes [^cn-N] in change.range for L2 changes,
  // so refs attached to CriticMarkup were already removed in Step 1.
  // This step removes any standalone refs remaining in the body (not footnotes).
  const refRe = footnoteRefGlobal();
  cleanBodyLines = cleanBodyLines.map(line => line.replace(refRe, ''));

  // ── Step 5: For each change, find the anchor line in the clean body ────────
  // Map change.id → pre-formatted L3 edit-op line string
  const anchorMap = new Map<string, string>();
  const bodyStr = cleanBodyLines.join('\n');
  const lineStarts = buildLineStarts(bodyStr);

  // Precompute cumulative offset deltas for each change in ascending order.
  // cumulativeDeltas[i] = change.range.start shifted by all preceding edits.
  const cumulativeDeltas: number[] = [];
  let cumDelta = 0;
  for (let i = 0; i < sortedAsc.length; i++) {
    cumulativeDeltas.push(sortedAsc[i].range.start + cumDelta);
    const origLen = sortedAsc[i].range.end - sortedAsc[i].range.start;
    cumDelta += bodyReplacement(sortedAsc[i]).length - origLen;
  }

  for (let changeIdx = 0; changeIdx < sortedAsc.length; changeIdx++) {
    const change = sortedAsc[changeIdx];
    const shiftedLineNum = offsetToLineNumber(lineStarts, cumulativeDeltas[changeIdx]);
    let lineNum = shiftedLineNum;

    // Clamp to valid body line range
    lineNum = Math.max(1, Math.min(lineNum, cleanBodyLines.length || 1));

    const lineIdx = lineNum - 1;
    const lineContent = cleanBodyLines[lineIdx] ?? '';
    const lineStart = lineStarts[lineIdx] ?? 0;
    const changeCol = Math.max(0, Math.min(
      cumulativeDeltas[changeIdx] - lineStart,
      lineContent.length,
    ));

    // Anchor length: how much body-side text this change contributes
    let anchorLen: number;
    switch (change.type) {
      case ChangeType.Insertion:
        anchorLen = change.status === ChangeStatus.Rejected ? 0 : (change.modifiedText ?? '').length;
        break;
      case ChangeType.Deletion:
        anchorLen = 0;
        break;
      case ChangeType.Substitution:
        anchorLen = change.status === ChangeStatus.Rejected
          ? (change.originalText ?? '').length
          : (change.modifiedText ?? '').length;
        break;
      case ChangeType.Highlight:
        anchorLen = (change.originalText ?? '').length;
        break;
      default:
        anchorLen = 0;
        break;
    }

    const hash = computeLineHash(lineIdx, cleanBodyLines[lineIdx] ?? '', cleanBodyLines);

    const editOpLine = buildContextualL3EditOp({
      changeType: change.type,
      originalText: change.originalText ?? '',
      currentText: change.modifiedText ?? '',
      lineContent,
      lineNumber: lineNum,
      hash,
      column: changeCol,
      anchorLen,
    });

    anchorMap.set(change.id, editOpLine);
  }

  // ── Step 6: Enrich footnote definitions with LINE:HASH {edit-op} ──────────
  // We rebuild the footnote section: for each footnote block, prepend the
  // "    LINE:HASH {edit-op}" line as the first body line (before existing body).

  if (footnoteLines.length === 0 && changes.length > 0) {
    // No existing footnote section — build one from scratch
    // (This handles L0/L1 changes that were promoted inline but lack footnotes)
    // For now, return body + blank footnote section; caller should add footnotes.
    return cleanBodyLines.join('\n') + '\n';
  }

  // Parse the existing footnote section line by line and inject the edit-op.
  const rebuiltFootnotes: string[] = [];
  let i = 0;

  while (i < footnoteLines.length) {
    const line = footnoteLines[i];

    // Check if this is a footnote definition header
    if (FOOTNOTE_DEF_START.test(line)) {
      // Extract the change ID from the header
      const idMatch = line.match(/^\[\^(cn-[\w.]+)\]:/);
      const changeId = idMatch ? idMatch[1] : null;

      rebuiltFootnotes.push(line);
      i++;

      if (changeId) {
        const anchor = anchorMap.get(changeId);
        if (anchor) {
          rebuiltFootnotes.push(anchor);
        }
      }

      // Include existing body lines of this footnote definition
      while (i < footnoteLines.length) {
        const bodyLine = footnoteLines[i];
        // Stop at next footnote definition or non-continuation non-blank line
        if (FOOTNOTE_DEF_START.test(bodyLine)) break;
        // Accept indented continuation lines and blank lines between them
        if (FOOTNOTE_CONTINUATION.test(bodyLine) || bodyLine.trim() === '') {
          rebuiltFootnotes.push(bodyLine);
          i++;
        } else {
          break;
        }
      }
    } else {
      rebuiltFootnotes.push(line);
      i++;
    }
  }

  // ── Step 7: Assemble result ───────────────────────────────────────────────
  const cleanBody = cleanBodyLines.join('\n');
  const footnoteSection = rebuiltFootnotes.join('\n');

  return cleanBody + '\n\n' + footnoteSection + '\n';
}
