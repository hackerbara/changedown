/**
 * Unicode-tolerant text normalization for ChangeTracks.
 *
 * ADR-022: Pluggable normalizer architecture.
 *
 * Default normalizer: NFKC only.
 * Applies to user-text matching only (replaceUnique, anchor, findEditPosition).
 * NOT applied to footnotes, headers, or raw_edit operations.
 */

/**
 * A normalizer is a function that maps a string to its canonical form.
 * Must perform 1:1 character replacement so that positions in the
 * normalized string map directly to positions in the original string.
 */
export type TextNormalizer = (text: string) => string;

/**
 * Default normalizer: NFKC normalization only.
 *
 * NFKC handles the broad Unicode space (fullwidth letters, compatibility
 * decompositions, NBSP → space, etc.). Smart quotes and en-dashes are
 * preserved as distinct characters — agents must use the exact characters
 * from the file.
 */
export function defaultNormalizer(text: string): string {
  return text.normalize('NFKC');
}

/**
 * Find the index of `target` in `text` using normalized comparison.
 *
 * Returns the position in the ORIGINAL text (not the normalized text).
 * Since the default normalizer performs only 1:1 character replacements,
 * positions map directly between original and normalized strings.
 *
 * @param text       The text to search in.
 * @param target     The substring to find.
 * @param normalizer The normalizer function (defaults to `defaultNormalizer`).
 * @param startFrom  The position to start searching from (defaults to 0).
 * @returns          The 0-based index in the original text, or -1 if not found.
 */
export function normalizedIndexOf(
  text: string,
  target: string,
  normalizer?: TextNormalizer,
  startFrom?: number,
): number {
  const norm = normalizer ?? defaultNormalizer;
  const normalizedText = norm(text);
  const normalizedTarget = norm(target);
  return normalizedText.indexOf(normalizedTarget, startFrom ?? 0);
}

// ─── Whitespace-collapsed matching ─────────────────────────────────────────

/**
 * Collapse all runs of whitespace (spaces, tabs, \n, \r\n, \r) to a single space.
 * Leading and trailing whitespace is also collapsed (not trimmed) so that
 * position math stays consistent.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/**
 * Build a mapping from collapsed-string positions to original-string positions.
 *
 * Returns an array where `map[collapsedIndex]` gives the corresponding index
 * in the original string. The array has length `collapsed.length + 1` so that
 * the end-of-match position is also mappable.
 *
 * Example: original = "a  b\nc"
 *   collapsed = "a b c" (length 5)
 *   map = [0, 1, 3, 4, 5, 6]  (6 entries = collapsed.length + 1)
 *
 * The algorithm walks both strings in lockstep:
 * - When encountering a whitespace run in the original, the collapsed string
 *   has exactly one space. We map that one space to the first whitespace char
 *   in the original, then skip the rest.
 * - Non-whitespace characters map 1:1.
 */
export function buildWhitespaceCollapseMap(original: string): number[] {
  const map: number[] = [];
  let oi = 0; // original index

  while (oi < original.length) {
    if (/\s/.test(original[oi])) {
      // Map the single collapsed space to the start of this whitespace run
      map.push(oi);
      // Skip the entire whitespace run in the original
      while (oi < original.length && /\s/.test(original[oi])) {
        oi++;
      }
    } else {
      // Non-whitespace: 1:1 mapping
      map.push(oi);
      oi++;
    }
  }

  // End sentinel: maps to one-past-end of original
  map.push(oi);

  return map;
}

export interface WhitespaceCollapsedMatch {
  /** Start index in the ORIGINAL text */
  index: number;
  /** Length of the matched region in the ORIGINAL text */
  length: number;
  /** The actual text from the original at the matched region */
  originalText: string;
}

/**
 * Find `target` in `text` using whitespace-collapsed comparison.
 *
 * Collapses all whitespace runs to a single space in both text and target,
 * finds the match in collapsed space, then maps the position back to the
 * original text.
 *
 * @returns The match info with original-text coordinates, or null if not found.
 */
export function whitespaceCollapsedFind(
  text: string,
  target: string,
  startFrom?: number,
): WhitespaceCollapsedMatch | null {
  const collapsedText = collapseWhitespace(text);
  const collapsedTarget = collapseWhitespace(target);

  if (collapsedTarget.length === 0) return null;

  const map = buildWhitespaceCollapseMap(text);

  // If startFrom is specified, we need to map it to collapsed-space.
  // Find the collapsed index corresponding to startFrom in the original.
  let collapsedStartFrom = 0;
  if (startFrom !== undefined && startFrom > 0) {
    // Find the first collapsed index that maps to original >= startFrom
    for (let ci = 0; ci < map.length; ci++) {
      if (map[ci] >= startFrom) {
        collapsedStartFrom = ci;
        break;
      }
    }
  }

  const collapsedIdx = collapsedText.indexOf(collapsedTarget, collapsedStartFrom);
  if (collapsedIdx === -1) return null;

  // Map collapsed position back to original
  const originalStart = map[collapsedIdx];
  const collapsedEnd = collapsedIdx + collapsedTarget.length;
  const originalEnd = map[collapsedEnd];

  return {
    index: originalStart,
    length: originalEnd - originalStart,
    originalText: text.slice(originalStart, originalEnd),
  };
}

/**
 * Check if `target` appears more than once in `text` under whitespace-collapsed matching.
 */
export function whitespaceCollapsedIsAmbiguous(text: string, target: string): boolean {
  const first = whitespaceCollapsedFind(text, target);
  if (!first) return false;
  const second = whitespaceCollapsedFind(text, target, first.index + 1);
  return second !== null;
}

// ─── Diagnostic confusable detection (ADR-061) ──────────────────────────────
//
// These functions are NEVER used in the matching pipeline. They run only
// after all 5 matching levels fail, to produce actionable error messages
// when the root cause is a confusable character (em dash vs hyphen,
// smart quotes vs ASCII, etc.).
//
// CRITICAL: Do NOT add confusable normalization to any matching level.
// See MEMORY.md "Confusables History" for rationale.

/**
 * Map from Unicode codepoint to its ASCII replacement and human-readable name.
 * Only contains characters that NFKC does NOT normalize (NFKC handles
 * NBSP and HORIZONTAL ELLIPSIS already).
 */
const CONFUSABLE_MAP = new Map<number, { replacement: string; name: string }>([
  [0x2018, { replacement: "'", name: 'LEFT SINGLE QUOTATION MARK' }],
  [0x2019, { replacement: "'", name: 'RIGHT SINGLE QUOTATION MARK' }],
  [0x201A, { replacement: "'", name: 'SINGLE LOW-9 QUOTATION MARK' }],
  [0x201C, { replacement: '"', name: 'LEFT DOUBLE QUOTATION MARK' }],
  [0x201D, { replacement: '"', name: 'RIGHT DOUBLE QUOTATION MARK' }],
  [0x201E, { replacement: '"', name: 'DOUBLE LOW-9 QUOTATION MARK' }],
  [0x2014, { replacement: '-', name: 'EM DASH' }],
  [0x2013, { replacement: '-', name: 'EN DASH' }],
]);

/**
 * Unicode character name lookup for common confusables and their ASCII counterparts.
 */
const UNICODE_NAMES: Record<number, string> = {
  0x0020: 'SPACE',
  0x002D: 'HYPHEN-MINUS',
  0x0022: 'QUOTATION MARK',
  0x0027: 'APOSTROPHE',
  0x002E: 'FULL STOP',
  0x2018: 'LEFT SINGLE QUOTATION MARK',
  0x2019: 'RIGHT SINGLE QUOTATION MARK',
  0x201A: 'SINGLE LOW-9 QUOTATION MARK',
  0x201C: 'LEFT DOUBLE QUOTATION MARK',
  0x201D: 'RIGHT DOUBLE QUOTATION MARK',
  0x201E: 'DOUBLE LOW-9 QUOTATION MARK',
  0x2013: 'EN DASH',
  0x2014: 'EM DASH',
};

export function unicodeName(codepoint: number): string {
  return UNICODE_NAMES[codepoint] ?? `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Apply confusable normalization to text. Diagnostic use only.
 * Replaces smart quotes and dashes with their ASCII equivalents.
 * All replacements are 1:1 (same string length), so position mapping is trivial.
 */
export function diagnosticConfusableNormalize(text: string): string {
  let result = text;
  for (const [codepoint, entry] of CONFUSABLE_MAP) {
    const char = String.fromCodePoint(codepoint);
    // All CONFUSABLE_MAP entries have 1-char replacements, so this is safe
    result = result.split(char).join(entry.replacement);
  }
  return result;
}

export interface ConfusableDifference {
  position: number;
  agentChar: string;
  fileChar: string;
  agentCodepoint: number;
  fileCodepoint: number;
  agentName: string;
  fileName: string;
}

/**
 * Find character-level confusable differences between agent text and file text.
 * Both strings are the same length (all CONFUSABLE_MAP entries are 1:1).
 */
function findConfusableDifferences(
  agentText: string,
  fileText: string,
): ConfusableDifference[] {
  const diffs: ConfusableDifference[] = [];
  const len = Math.min(agentText.length, fileText.length);
  for (let i = 0; i < len; i++) {
    if (agentText[i] !== fileText[i]) {
      const agentCp = agentText.codePointAt(i)!;
      const fileCp = fileText.codePointAt(i)!;
      diffs.push({
        position: i,
        agentChar: agentText[i]!,
        fileChar: fileText[i]!,
        agentCodepoint: agentCp,
        fileCodepoint: fileCp,
        agentName: unicodeName(agentCp),
        fileName: unicodeName(fileCp),
      });
    }
  }
  return diffs;
}

export interface DiagnosticConfusableResult {
  /** The exact text from the file at the matched position */
  matchedText: string;
  /** Character-level differences between agent text and file text */
  differences: ConfusableDifference[];
}

/**
 * Try to find a diagnostic confusable match for `target` in `documentText`.
 *
 * Applies confusable normalization to both the document and target, then
 * attempts an indexOf match. If found uniquely, extracts the original file
 * text and reports character-level differences.
 *
 * Returns null if:
 * - No match even after confusable normalization
 * - Match is ambiguous (multiple occurrences)
 * - No actual confusable differences found
 *
 * This function is diagnostic ONLY. It is NEVER used for actual matching.
 */
export function tryDiagnosticConfusableMatch(
  documentText: string,
  target: string,
): DiagnosticConfusableResult | null {
  const normDoc = diagnosticConfusableNormalize(documentText);
  const normTarget = diagnosticConfusableNormalize(target);

  const normIdx = normDoc.indexOf(normTarget);
  if (normIdx === -1) return null;

  // Check uniqueness: if ambiguous, cannot produce a useful diagnostic
  if (normDoc.indexOf(normTarget, normIdx + 1) !== -1) return null;

  // Since all CONFUSABLE_MAP entries are 1:1 character replacements,
  // the normalized string has the same length as the original.
  // Position mapping is direct: normIdx in normalized text = normIdx in original text.
  const matchedText = documentText.slice(normIdx, normIdx + target.length);

  // Find character-level differences
  const diffs = findConfusableDifferences(target, matchedText);

  return diffs.length > 0 ? { matchedText, differences: diffs } : null;
}
