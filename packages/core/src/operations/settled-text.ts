import { ChangeNode, ChangeType, ChangeStatus, TextEdit } from '../model/types.js';
import { computeReject, computeAcceptParts, computeRejectParts, AcceptRejectParts } from './accept-reject.js';
import { computeLineHash } from '../hashline.js';
import { FOOTNOTE_DEF_START, footnoteRefGlobal, isL3Format, splitBodyAndFootnotes } from '../footnote-patterns.js';
import { findCodeZones, CodeZone } from '../parser/code-zones.js';
import { parseForFormat } from '../format-aware-parse.js';

/**
 * Computes a TextEdit that "settles" a single CriticMarkup change node using
 * **accept-all** semantics — every change is applied regardless of footnote status:
 *
 * - Insertion (any status): keep inserted text, remove markup
 * - Deletion (any status): remove everything (text is deleted)
 * - Substitution (any status): keep modified (new) text, remove markup
 * - Highlight (any status): keep highlighted text, remove markup
 * - Comment (any status): remove entirely
 *
 * This produces "the document as it would be if all proposals were approved".
 * Per V1 view model design doc §5.
 */
export function computeSettledReplace(change: ChangeNode): TextEdit {
  const rangeLength = change.range.end - change.range.start;

  // Comments are always removed entirely
  if (change.type === ChangeType.Comment) {
    return { offset: change.range.start, length: rangeLength, newText: '' };
  }

  // Highlights always reduce to their plain text content
  if (change.type === ChangeType.Highlight) {
    return { offset: change.range.start, length: rangeLength, newText: change.originalText ?? '' };
  }

  // Accept-all: every change is treated as accepted regardless of footnote status.
  switch (change.type) {
    case ChangeType.Insertion:
      return { offset: change.range.start, length: rangeLength, newText: change.modifiedText ?? '' };
    case ChangeType.Deletion:
      return { offset: change.range.start, length: rangeLength, newText: '' };
    case ChangeType.Substitution:
      return { offset: change.range.start, length: rangeLength, newText: change.modifiedText ?? '' };
  }

  // Exhaustiveness guard: fail-fast if a new ChangeType is added without updating this switch
  throw new Error(`Unknown ChangeType: ${change.type}`);
}

// FOOTNOTE_DEF_START imported from footnote-patterns.ts

/**
 * Strips all footnote definition blocks from the text.
 * A footnote definition starts with `[^ct-N]:` at column 0 and continues
 * on subsequent indented lines (or blank lines within the body).
 * Trailing blank lines left behind are also cleaned up.
 */
function stripFootnoteDefinitions(text: string, zones: CodeZone[]): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  let inFootnote = false;
  let foundFootnote = false;
  let charOffset = 0;

  for (const line of lines) {
    // Check if this line's start is inside a code zone
    const inCodeZone = zones.some(z => charOffset >= z.start && charOffset < z.end);

    if (!inCodeZone && FOOTNOTE_DEF_START.test(line)) {
      inFootnote = true;
      foundFootnote = true;
      // Remove trailing blank lines that were separators before this footnote block
      while (kept.length > 0 && kept[kept.length - 1].trim() === '') {
        kept.pop();
      }
      charOffset += line.length + 1; // +1 for newline
      continue;
    }
    if (inFootnote) {
      // Continuation lines are indented or blank
      if (line.trim() === '' || /^[\t ]/.test(line)) {
        charOffset += line.length + 1;
        continue;
      }
      // Non-indented, non-blank line ends the footnote body
      inFootnote = false;
    }
    kept.push(line);
    charOffset += line.length + 1;
  }

  // Only strip trailing blank lines if we actually removed footnote definitions
  if (foundFootnote) {
    while (kept.length > 0 && kept[kept.length - 1].trim() === '') {
      kept.pop();
    }
  }

  return kept.join('\n');
}

/**
 * Strips orphaned inline footnote references `[^ct-N]` or `[^ct-N.M]` that
 * remain in the text after CriticMarkup processing (these are not part of any
 * change node's range and appear as bare refs in the settled text).
 */
function stripInlineFootnoteRefs(text: string, zones: CodeZone[]): string {
  return text.replace(footnoteRefGlobal(), (match, offset) => {
    if (zones.some(z => offset >= z.start && offset < z.end)) {
      return match; // preserve refs inside code zones
    }
    return '';
  });
}

export interface SettledTextOptions {
  /** When true, the parser skips CriticMarkup inside fenced code blocks and
   *  inline code spans. Default: false (backward compatible with existing callers). */
  skipCodeBlocks?: boolean;
}

/**
 * Computes the settled state of an L3 (footnote-native) document.
 * L3 body already contains the accepted state — just strip the footnote block.
 */
function computeSettledTextL3(text: string): string {
  const { bodyLines } = splitBodyAndFootnotes(text.split('\n'));
  return bodyLines.join('\n') + '\n';
}

/**
 * Computes the original (reject-all) view of an L3 document.
 *
 * For L3, the body reflects the current state (proposed changes applied).
 * To get the "original" view: undo all proposed changes.
 * - Proposed insertion → remove from body (text was added, undo it)
 * - Proposed deletion → restore originalText (text was removed, put it back)
 * - Proposed substitution → revert to originalText
 * - Accepted/rejected changes are already resolved in the body — leave as-is
 */
/**
 * Revert changes in body text by undoing their effects. Processes changes
 * in reverse offset order to preserve positions. Used by both
 * computeOriginalTextL3 and settleRejectedChangesOnly.
 */
function revertChangesInBody(body: string, changes: ChangeNode[]): string {
  const sorted = [...changes].sort((a, b) => b.range.start - a.range.start);
  for (const change of sorted) {
    if (change.anchored === false) continue;
    switch (change.type) {
      case ChangeType.Insertion:
        body = body.slice(0, change.range.start) + body.slice(change.range.end);
        break;
      case ChangeType.Deletion:
        if (change.originalText) {
          body = body.slice(0, change.range.start) + change.originalText + body.slice(change.range.start);
        }
        break;
      case ChangeType.Substitution:
        if (change.originalText) {
          body = body.slice(0, change.range.start) + change.originalText + body.slice(change.range.end);
        }
        break;
    }
  }
  return body;
}

function computeOriginalTextL3(text: string): string {
  const doc = parseForFormat(text);
  const proposed = doc.getChanges().filter(c => c.status === ChangeStatus.Proposed);

  const { bodyLines } = splitBodyAndFootnotes(text.split('\n'));
  let body = bodyLines.join('\n');

  if (proposed.length > 0) {
    body = revertChangesInBody(body, proposed);
  }

  return body + '\n';
}

/**
 * Computes the "settled state" of a CriticMarkup document using accept-all semantics.
 *
 * The settled text represents what the document would look like if every proposed
 * change were approved:
 * - All insertions are kept (text absorbed, markup removed) regardless of status
 * - All deletions are applied (text removed) regardless of status
 * - All substitutions use new text regardless of status
 * - Highlights reduce to plain text
 * - Comments are removed entirely
 * - Footnote definitions are stripped
 * - Orphaned inline footnote references are stripped
 *
 * For L3 (footnote-native) format, the body already reflects the accepted state,
 * so this function routes to computeSettledTextL3 which simply strips the footnote
 * block. This gives SCM QuickDiff and all other consumers free L3 support.
 *
 * Per V1 view model design doc §5: settled = "document as it would be if all
 * proposals were approved". The committed view (separate function) handles
 * status-aware rendering.
 *
 * This is a pure function: it does not modify the input string.
 */
export function computeSettledText(text: string, options?: SettledTextOptions): string {
  // L3 format: footnote-native body is already the settled state.
  // Auto-detect: has [^ct-N]: footnote defs, no inline CriticMarkup in body,
  // and at least one L3 footnote body line (LINE:HASH {op}).
  if (isL3Format(text)) {
    return computeSettledTextL3(text);
  }

  const doc = parseForFormat(text, { skipCodeBlocks: options?.skipCodeBlocks ?? false });
  const changes = doc.getChanges();

  if (changes.length === 0) {
    // Compute zones on original text (no edits to shift offsets)
    const zones = findCodeZones(text);
    return stripInlineFootnoteRefs(stripFootnoteDefinitions(text, zones), zones);
  }

  // Sort changes by descending offset so we can apply edits from end to start
  // without invalidating earlier offsets
  const edits = [...changes]
    .sort((a, b) => b.range.start - a.range.start)
    .map(computeSettledReplace);

  let result = text;
  for (const edit of edits) {
    result = result.slice(0, edit.offset) + edit.newText + result.slice(edit.offset + edit.length);
  }

  // Compute zones on intermediate text (post-edit, pre-strip).
  // CriticMarkup edits can shift code fence offsets, so zones must be computed
  // on the intermediate result. Footnote definitions always appear after all
  // content and code fences, so stripping them does not shift zone offsets.
  const zones = findCodeZones(result);
  result = stripFootnoteDefinitions(result, zones);
  result = stripInlineFootnoteRefs(result, zones);

  return result;
}
/**
 * Compute the "Original" view: reject all changes, strip all markup.
 * Insertions are removed entirely. Deletions keep their content.
 * Substitutions keep the original (pre-change) text.
 */
export function computeOriginalText(text: string, options?: SettledTextOptions): string {
  if (isL3Format(text)) {
    return computeOriginalTextL3(text);
  }

  const doc = parseForFormat(text, { skipCodeBlocks: options?.skipCodeBlocks ?? false });
  const changes = doc.getChanges();

  if (changes.length === 0) {
    const zones = findCodeZones(text);
    return stripInlineFootnoteRefs(stripFootnoteDefinitions(text, zones), zones);
  }

  const edits = [...changes]
    .sort((a, b) => b.range.start - a.range.start)
    .map(computeReject);

  let result = text;
  for (const edit of edits) {
    result = result.slice(0, edit.offset) + edit.newText + result.slice(edit.offset + edit.length);
  }

  const zones = findCodeZones(result);
  result = stripFootnoteDefinitions(result, zones);
  result = stripInlineFootnoteRefs(result, zones);

  return result;
}

// ─── Zone-aware ref placement ────────────────────────────────────────────────

/**
 * Check whether a given offset falls inside any code zone.
 * Returns the zone if found, undefined otherwise.
 */
function findContainingCodeZone(offset: number, zones: CodeZone[]): CodeZone | undefined {
  for (const zone of zones) {
    if (offset >= zone.start && offset < zone.end) return zone;
  }
  return undefined;
}

interface DeferredRef {
  ref: string;
  /** Line number in the original text (0-indexed) */
  origLineIndex: number;
}

/**
 * Build settled text with zone-aware ref placement.
 * Refs for edits inside code zones are deferred to end-of-line.
 */
function buildSegmentsWithZoneAwareness(
  text: string,
  parts: AcceptRejectParts[],
  zones: CodeZone[],
): string {
  const segments: string[] = [];
  const deferredRefs: DeferredRef[] = [];
  let cursor = 0;

  // Pre-compute line boundaries in original text for offset→line mapping
  const lineBreaks: number[] = []; // offsets of each '\n'
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineBreaks.push(i);
  }

  function offsetToLine(offset: number): number {
    // Binary search for the line containing offset (0-indexed)
    let lo = 0;
    let hi = lineBreaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lineBreaks[mid] < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  for (const part of parts) {
    // Original text before this edit
    if (part.offset > cursor) {
      segments.push(text.slice(cursor, part.offset));
    } else if (part.offset < cursor) {
      continue; // overlapping edit, skip
    }

    const ref = part.refId ? `[^${part.refId}]` : '';

    if (ref && findContainingCodeZone(part.offset, zones)) {
      // Edit is inside a code zone — emit text without ref, defer ref to end of line
      segments.push(part.text);
      deferredRefs.push({ ref, origLineIndex: offsetToLine(part.offset) });
    } else {
      // Normal placement — ref inline
      segments.push(part.text + ref);
    }

    cursor = part.offset + part.length;
  }

  // Remaining original text
  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  if (deferredRefs.length === 0) {
    return segments.join('');
  }

  // Apply deferred refs: split result into lines, append refs at their target lines
  const result = segments.join('');
  const lines = result.split('\n');

  // Group deferred refs by their original line index.
  // INVARIANT: Settlement does not add or remove newlines — each AcceptRejectParts
  // replacement is inline (same line). The line index in the result corresponds to
  // the same line index in the original text. If multi-line range settlement is
  // added in the future, this mapping must be recalculated.
  const refsByLine = new Map<number, string[]>();
  for (const dr of deferredRefs) {
    const existing = refsByLine.get(dr.origLineIndex) ?? [];
    existing.push(dr.ref);
    refsByLine.set(dr.origLineIndex, existing);
  }

  for (const [lineIdx, refs] of refsByLine) {
    if (lineIdx < lines.length) {
      lines[lineIdx] = lines[lineIdx] + refs.join('');
    }
  }

  return lines.join('\n');
}

/**
 * Settles only accepted changes: resolves their markup to clean text while
 * preserving footnote references and definitions. Proposed and rejected changes
 * are left untouched. Uses parser range information (no regex replacement) so
 * substitution text that looks like CriticMarkup is handled correctly.
 *
 * For L2: removes inline CriticMarkup delimiters but keeps footnote references
 * [^ct-N] and footnote definition blocks with their 'accepted' status.
 *
 * For L3: no-op. The body is already the Current projection (accepted text
 * present), and edit-op lines must be preserved per ADR-C §2.
 */
export function settleAcceptedChangesOnly(text: string): { settledContent: string; settledIds: string[] } {
  // L3 accepted settlement is a no-op per ADR-C §2 / Compaction spec §1:
  // the body is already the Current projection (accepted text present),
  // and edit-op lines must be preserved for coherence verification.
  // Only the status field changed (done by applyReview). Nothing else to do.
  if (isL3Format(text)) {
    return { settledContent: text, settledIds: [] };
  }

  const doc = parseForFormat(text, { skipCodeBlocks: false });
  const accepted = doc.getChanges().filter((c) => c.status === ChangeStatus.Accepted);
  const settledIds = accepted.map((c) => c.id);

  if (accepted.length === 0) {
    return { settledContent: text, settledIds: [] };
  }

  // Get parts (text + ref separated) for each accepted change
  const parts = [...accepted]
    .sort((a, b) => a.range.start - b.range.start)
    .map(computeAcceptParts);

  const zones = findCodeZones(text);
  const settledContent = buildSegmentsWithZoneAwareness(text, parts, zones);

  return { settledContent, settledIds };
}

/**
 * Settles only rejected changes: resolves their markup to clean text while
 * preserving footnote references and definitions. Proposed and accepted changes
 * are left untouched. Uses parser range information (no regex replacement) so
 * substitution text that looks like CriticMarkup is handled correctly.
 *
 * For L2: removes rejected inline CriticMarkup (insertions removed, deletions
 * and substitutions reverted to original text). Footnote refs stay.
 *
 * For L3: reverts the body (removes rejected insertions, restores rejected
 * deletions/substitutions) but preserves edit-op lines per ADR-C §2.
 */
export function settleRejectedChangesOnly(text: string): { settledContent: string; settledIds: string[] } {
  // L3 rejected settlement: revert the body (remove rejected insertions,
  // restore rejected deletions/substitutions) but preserve edit-op lines
  // per ADR-C §2. The edit-op anchors become stale after body reversion —
  // this is expected. The Resolution Protocol handles stale anchors via
  // fast-path exits and intermediate-state replay.
  if (isL3Format(text)) {
    const doc = parseForFormat(text);
    const rejected = doc.getChanges().filter((c) => c.status === ChangeStatus.Rejected);
    const settledIds = rejected.map((c) => c.id);
    if (rejected.length === 0) return { settledContent: text, settledIds: [] };

    const { bodyLines, footnoteLines } = splitBodyAndFootnotes(text.split('\n'));
    const body = revertChangesInBody(bodyLines.join('\n'), rejected);

    const settledContent = footnoteLines.length > 0
      ? body + '\n\n' + footnoteLines.join('\n')
      : body;
    return { settledContent, settledIds };
  }

  const doc = parseForFormat(text, { skipCodeBlocks: false });
  const rejected = doc.getChanges().filter((c) => c.status === ChangeStatus.Rejected);
  const settledIds = rejected.map((c) => c.id);

  if (rejected.length === 0) {
    return { settledContent: text, settledIds: [] };
  }

  const parts = [...rejected]
    .sort((a, b) => a.range.start - b.range.start)
    .map(computeRejectParts);

  const zones = findCodeZones(text);
  const settledContent = buildSegmentsWithZoneAwareness(text, parts, zones);

  return { settledContent, settledIds };
}

// ─── Settled view types ──────────────────────────────────────────────────────

export interface SettledLine {
  settledLineNum: number;  // 1-indexed, sequential (no gaps)
  rawLineNum: number;      // 1-indexed, raw file line number
  text: string;            // settled text (no CriticMarkup, no footnotes)
  hash: string;            // hash of settled text (2 hex chars)
}

export interface SettledViewResult {
  lines: SettledLine[];
  settledToRaw: Map<number, number>;  // settled line num → raw line num
  rawToSettled: Map<number, number>;  // raw line num → settled line num
  changes?: ChangeNode[];
}

// ─── Settled view computation ────────────────────────────────────────────────

/**
 * L3 fast-path: body is already the settled view (1:1 line mapping).
 * Strip footnote section and build line mappings directly.
 */
function computeSettledViewL3(rawText: string): SettledViewResult {
  const { bodyLines } = splitBodyAndFootnotes(rawText.split('\n'));
  const lines: SettledLine[] = [];
  const settledToRaw = new Map<number, number>();
  const rawToSettled = new Map<number, number>();

  for (let i = 0; i < bodyLines.length; i++) {
    const settledNum = i + 1;  // 1-indexed
    const rawNum = i + 1;      // 1:1 mapping for body lines
    lines.push({
      settledLineNum: settledNum,
      rawLineNum: rawNum,
      text: bodyLines[i],
      hash: computeLineHash(i, bodyLines[i], bodyLines),
    });
    settledToRaw.set(settledNum, rawNum);
    rawToSettled.set(rawNum, settledNum);
  }

  return { lines, settledToRaw, rawToSettled };
}

/**
 * Compute the settled view for an entire file using accept-all semantics.
 *
 * Uses the parser-based `computeSettledText()` for correct handling of multi-line
 * CriticMarkup, then builds line mappings by tracking offset deltas through the
 * edits applied. This provides:
 *
 * 1. Correct settled text (multi-line markup handled via parser)
 * 2. settled-line-num → raw-line-num mapping for coordinate resolution
 * 3. Per-line hashes for settled-space write targeting
 *
 * Returns structured data enabling settled-space → raw-space coordinate mapping
 * (the settled-space analog of committed-space write targeting from ADR-049).
 *
 * **Mapping strategy:** Applies CriticMarkup edits forward, tracking cumulative
 * offset deltas. For each line in the settled text, maps its starting offset
 * back through the deltas to find the corresponding raw line. Footnote and
 * inline-ref stripping are line-level operations that preserve the character-to-line
 * correspondence established by the CriticMarkup edits.
 */
export function computeSettledView(rawText: string, preParsed?: ChangeNode[]): SettledViewResult {
  // L3 early-return: body is already the settled view
  if (isL3Format(rawText)) {
    return computeSettledViewL3(rawText);
  }

  // 1. Get parser edits for CriticMarkup settlement
  const changes = preParsed ?? parseForFormat(rawText, { skipCodeBlocks: false }).getChanges();

  // 2. Apply CriticMarkup edits and build offset delta table
  // Each entry: { rawOffset, delta } where delta = cumulative shift
  // (positive = settled text is longer at this point, negative = shorter)
  const edits = [...changes]
    .sort((a, b) => a.range.start - b.range.start)
    .map(computeSettledReplace);

  // Build delta table: sorted by raw offset
  // delta = how much the settled text has shifted relative to raw at this point
  const deltaTable: Array<{ rawOffset: number; delta: number }> = [];
  let cumulativeDelta = 0;

  for (const edit of edits) {
    deltaTable.push({ rawOffset: edit.offset, delta: cumulativeDelta });
    const oldLen = edit.length;
    const newLen = edit.newText.length;
    cumulativeDelta += (newLen - oldLen);
  }

  // Build offset → edit lookup for O(1) access in settledOffsetToRawOffset.
  // Replaces linear edits.find() scan that was O(n) per delta table entry.
  const editsByOffset = new Map(edits.map(e => [e.offset, e]));

  // Function: map a settled offset back to the approximate raw offset
  // For a given offset in the settled text, find which raw offset it corresponds to.
  // We invert the forward mapping: settledOffset = rawOffset + delta
  // => rawOffset = settledOffset - delta (using the delta that was active at that raw position)
  function settledOffsetToRawOffset(settledOffset: number): number {
    // Walk through delta table to find the right delta
    // The settled offset = raw offset + cumulative delta at that point
    // We need to find which raw range this settled offset falls in
    let delta = 0;
    let rawConsumed = 0;
    let settledConsumed = 0;

    for (const entry of deltaTable) {
      // Gap between previous edit end and this edit start (in raw space)
      const rawGap = entry.rawOffset - rawConsumed;
      // This gap maps 1:1 in settled space
      if (settledOffset <= settledConsumed + rawGap) {
        // The target settled offset is in the gap before this edit
        return rawConsumed + (settledOffset - settledConsumed);
      }
      settledConsumed += rawGap;
      rawConsumed = entry.rawOffset;
      delta = entry.delta;

      // Find the corresponding edit to get old/new lengths
      const edit = editsByOffset.get(entry.rawOffset);
      if (edit) {
        const oldLen = edit.length;
        const newLen = edit.newText.length;
        if (settledOffset < settledConsumed + newLen) {
          // The target is inside this edit's new text
          // Map to the start of the edit in raw space
          return rawConsumed;
        }
        settledConsumed += newLen;
        rawConsumed += oldLen;
      }
    }

    // Past all edits: 1:1 mapping with final cumulative delta
    return rawConsumed + (settledOffset - settledConsumed);
  }

  // 3. Compute settled text via the standard function (handles multi-line correctly)
  const settledText = computeSettledText(rawText);

  // 4. Build line start offsets for raw text
  const rawLines = rawText.split('\n');
  const rawLineStarts: number[] = [0]; // 0-indexed offsets
  for (let i = 0; i < rawLines.length - 1; i++) {
    rawLineStarts.push(rawLineStarts[i] + rawLines[i].length + 1);
  }

  // Function: offset to raw line number (1-indexed)
  function rawOffsetToLineNum(offset: number): number {
    // Binary search for the line containing this offset
    let lo = 0;
    let hi = rawLineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (rawLineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1; // 1-indexed
  }

  // 5. Split settled text into lines and build mappings
  const settledTextLines = settledText.split('\n');
  const settledLines: SettledLine[] = [];
  const settledToRaw = new Map<number, number>();
  const rawToSettled = new Map<number, number>();

  let settledCharOffset = 0;
  for (let i = 0; i < settledTextLines.length; i++) {
    const settledLineText = settledTextLines[i];
    const settledLineNum = i + 1;

    // Map the start of this settled line back to raw offset, then to raw line
    const rawOffset = settledOffsetToRawOffset(settledCharOffset);
    const rawLineNum = rawOffsetToLineNum(rawOffset);

    const hash = computeLineHash(settledLineNum - 1, settledLineText, settledTextLines);

    settledLines.push({
      settledLineNum,
      rawLineNum,
      text: settledLineText,
      hash,
    });

    settledToRaw.set(settledLineNum, rawLineNum);
    if (!rawToSettled.has(rawLineNum)) {
      rawToSettled.set(rawLineNum, settledLineNum);
    }

    settledCharOffset += settledLineText.length + 1; // +1 for newline
  }

  return { lines: settledLines, settledToRaw, rawToSettled, changes };
}
