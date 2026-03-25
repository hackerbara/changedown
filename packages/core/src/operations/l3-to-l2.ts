/**
 * L3 → L2 conversion.
 *
 * Takes an L3 document (clean body + footnotes with LINE:HASH {edit-op}) and
 * produces an L2 document (inline CriticMarkup + footnotes).
 *
 * Algorithm:
 *   1. Parse the L3 text with FootnoteNativeParser → ChangeNode[]
 *   2. Process changes in REVERSE document order (to preserve offsets)
 *      by inserting CriticMarkup delimiters at each ChangeNode position
 *   3. Remove the L3-specific "LINE:HASH {edit-op}" body lines from footnotes
 *      (those are internal and don't belong in L2)
 *   4. Return the assembled L2 text
 */

import { ChangeNode, ChangeType, ChangeStatus } from '../model/types.js';
import { FootnoteNativeParser } from '../parser/footnote-native-parser.js';
import { initHashline } from '../hashline.js';
import { FOOTNOTE_DEF_START, FOOTNOTE_CONTINUATION, FOOTNOTE_L3_EDIT_OP, splitBodyAndFootnotes } from '../footnote-patterns.js';

// ─── CriticMarkup insertion helpers ──────────────────────────────────────────

/**
 * Build the CriticMarkup inline markup for a change node, plus the [^ct-N] ref.
 * Returns [markup, offset_delta] where offset_delta is the net character count
 * added to the body (positive = added chars, negative = removed chars).
 */
function buildInlineMarkup(change: ChangeNode, bodyText: string): {
  /** The CriticMarkup text to substitute at [range.start, range.end) */
  replacement: string;
} {
  const { type, status, range, originalText, modifiedText, metadata } = change;
  const ref = `[^${change.id}]`;

  switch (type) {
    case ChangeType.Insertion: {
      if (status === ChangeStatus.Rejected) {
        // Rejected insertion: text is NOT in body (range is zero-width).
        // Insert the rejected text wrapped in {++...++} so L2 shows what was rejected.
        return { replacement: `{++${modifiedText ?? ''}++}${ref}` };
      }
      // Proposed/accepted insertion: text IS in body, wrap it.
      const bodySlice = bodyText.slice(range.start, range.end);
      return { replacement: `{++${bodySlice}++}${ref}` };
    }

    case ChangeType.Deletion: {
      // Zero-width range — original text is not in body.
      // Insert {--originalText--}[^ct-N] at the anchor.
      return { replacement: `{--${originalText ?? ''}--}${ref}` };
    }

    case ChangeType.Substitution: {
      if (status === ChangeStatus.Rejected) {
        // Rejected substitution: original text IS in body (range covers original).
        const bodySlice = bodyText.slice(range.start, range.end);
        return { replacement: `{~~${bodySlice}~>${modifiedText ?? ''}~~}${ref}` };
      }
      // Proposed/accepted substitution: modified text IS in body.
      // originalText stored in the node, modifiedText is the current body text.
      const bodySlice = bodyText.slice(range.start, range.end);
      return { replacement: `{~~${originalText ?? ''}~>${bodySlice}~~}${ref}` };
    }

    case ChangeType.Highlight: {
      // Text IS in body; wrap it.
      const bodySlice = bodyText.slice(range.start, range.end);
      const comment = metadata?.comment;
      const commentPart = comment ? `{>>${comment}<<}` : '';
      return { replacement: `{==${bodySlice}==}${commentPart}${ref}` };
    }

    case ChangeType.Comment: {
      // Zero-width anchor; insert {>>comment<<}[^ct-N].
      const comment = metadata?.comment ?? '';
      return { replacement: `{>>${comment}<<}${ref}` };
    }
  }
}

// ─── L3-specific line detector ────────────────────────────────────────────────

/**
 * Returns true if a footnote body line is the L3-specific "LINE:HASH {edit-op}" line.
 * These lines are internal metadata and must be stripped when converting back to L2.
 *
 * Pattern: 4 spaces, digits, colon, hex-hash, space, then a CriticMarkup open delimiter.
 */
// ─── Main conversion ──────────────────────────────────────────────────────────

/**
 * Convert an L3 document (clean body + enriched footnotes) to L2 format
 * (inline CriticMarkup + footnotes).
 *
 * Returns the input unchanged if no footnote-native changes are found.
 */
export async function convertL3ToL2(text: string): Promise<string> {
  await initHashline();

  const parser = new FootnoteNativeParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();

  if (changes.length === 0) return text;

  // If there are no proposed changes, nothing needs demotion to L2.
  // Return the input unchanged — it's still valid L3 with only decided changes.
  // This prevents isL3Format() from misclassifying hybrid output as plain L3.
  const hasProposed = changes.some(c => c.status === ChangeStatus.Proposed);
  if (!hasProposed) return text;

  // Partition changes into resolved and unresolved.
  // Unresolved changes have anchored:false (sentinel range {0,0}) — they could not
  // be placed in the body. Inserting CriticMarkup at position 0 for these is a
  // data-loss bug; instead, preserve their footnote blocks verbatim.
  const unresolvedIds = new Set<string>(
    changes.filter(c => c.anchored === false).map(c => c.id)
  );

  // ── Step 1: Split body from footnote section ──────────────────────────────
  const { bodyLines, footnoteLines } = splitBodyAndFootnotes(text.split('\n'));

  // ── Step 2: Insert CriticMarkup in REVERSE document order ─────────────────
  // Sort descending by range.start so splicing doesn't invalidate earlier offsets.
  const sortedDesc = [...changes].sort((a, b) => b.range.start - a.range.start);

  let body = bodyLines.join('\n');

  // Build a status map so Step 3 can look up each change's status by ID.
  const statusMap = new Map<string, ChangeStatus>();
  for (const change of changes) {
    statusMap.set(change.id, change.status);
  }

  for (const change of sortedDesc) {
    // Status-aware: only insert CriticMarkup for proposed changes.
    // Decided changes (accepted/rejected) keep their L3 edit-op representation.
    if (change.status !== ChangeStatus.Proposed) continue;

    // Unresolved changes (anchored:false) cannot be placed in the body — skip them.
    // Their footnote blocks are preserved verbatim in Step 3.
    if (unresolvedIds.has(change.id)) continue;

    const { replacement } = buildInlineMarkup(change, body);

    // Only proposed changes reach here. Deletions and comments are zero-width;
    // proposed insertions/substitutions/highlights have a non-empty span.
    // (Rejected insertions are skipped above because they are not Proposed.)
    if (change.type === ChangeType.Deletion || change.type === ChangeType.Comment) {
      // Zero-width position: insert at range.start (range.start === range.end)
      body = body.slice(0, change.range.start) + replacement + body.slice(change.range.start);
    } else {
      // Replace the span [range.start, range.end) with the wrapped markup
      body = body.slice(0, change.range.start) + replacement + body.slice(change.range.end);
    }
  }

  // ── Step 3: Rebuild footnote section, stripping L3-specific edit-op lines ──
  // Edit-op lines are stripped ONLY for proposed changes (they get inline CriticMarkup).
  // Decided changes (accepted/rejected) keep their edit-op lines as metadata.
  const rebuiltFootnotes: string[] = [];
  let i = 0;

  while (i < footnoteLines.length) {
    const line = footnoteLines[i];

    if (FOOTNOTE_DEF_START.test(line)) {
      // Footnote definition header — keep it and look up this change's status
      const idMatch = line.match(/^\[\^(ct-[\w.]+)\]:/);
      const changeId = idMatch ? idMatch[1] : '';
      const changeStatus = statusMap.get(changeId);

      rebuiltFootnotes.push(line);
      i++;

      // Process body lines of this footnote definition
      while (i < footnoteLines.length) {
        const bodyLine = footnoteLines[i];
        // Stop at the next footnote definition header
        if (FOOTNOTE_DEF_START.test(bodyLine)) break;

        if (FOOTNOTE_L3_EDIT_OP.test(bodyLine)) {
          if (changeStatus === ChangeStatus.Proposed && !unresolvedIds.has(changeId)) {
            // Strip the edit-op line for resolved proposed changes (they get inline CriticMarkup instead).
            // Unresolved proposed changes keep their edit-op line since they are preserved verbatim.
            i++;
            continue;
          }
          // Keep the edit-op line for decided changes (accepted/rejected) and unresolved changes.
          rebuiltFootnotes.push(bodyLine);
          i++;
          continue;
        }

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

  // ── Step 4: Assemble result ───────────────────────────────────────────────
  const footnoteSection = rebuiltFootnotes.join('\n');

  if (rebuiltFootnotes.length === 0) {
    return body + '\n';
  }

  return body + '\n\n' + footnoteSection + '\n';
}
