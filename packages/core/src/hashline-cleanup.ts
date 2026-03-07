/**
 * Model-output cleanup heuristics for hashline-based edits.
 *
 * Ported from oh-my-pi's hashline.ts (MIT license). These are hard-won
 * fixes for common model behaviors when producing text replacements:
 *
 * 1. Models copy LINE:HASH| prefixes into their new_text
 * 2. Models produce "edits" that are whitespace-only changes (no-ops)
 * 3. Models reference lines that have moved (hash relocation)
 * 4. Models echo context lines before/after their replacement
 *
 * All functions are pure — no I/O, no state, no side effects.
 */

// ─── Regex patterns ──────────────────────────────────────────────────────────

/** Matches LINE:HASH| prefix where HASH is 1-16 alphanumeric chars */
const HASHLINE_PREFIX = /^\d+:[0-9a-zA-Z]{1,16}\|/;

/** Matches a single + diff prefix (but not ++ which is a diff header) */
const DIFF_ADD_PREFIX = /^\+(?!\+)/;

// ─── stripHashlinePrefixes ───────────────────────────────────────────────────

/**
 * Strip LINE:HASH| prefixes that models copy into their new_text.
 *
 * Detection: if >= 50% of non-empty lines match the hashline prefix pattern,
 * strip all matching lines. Otherwise return unchanged.
 *
 * Also handles `+` diff prefixes (single `+`, not `++`) with the same
 * majority-detection logic. Hashline detection takes priority over diff prefix.
 *
 * @param lines - Array of lines (without trailing newlines)
 * @returns Cleaned lines with prefixes stripped, or original array unchanged
 */
export function stripHashlinePrefixes(lines: string[]): string[] {
  if (lines.length === 0) return lines;

  const nonEmptyLines = lines.filter((l) => l.length > 0);
  if (nonEmptyLines.length === 0) return lines;

  // Check hashline prefix first (higher priority)
  const hashlineCount = nonEmptyLines.filter((l) => HASHLINE_PREFIX.test(l)).length;
  if (hashlineCount >= nonEmptyLines.length / 2) {
    return lines.map((l) => l.replace(HASHLINE_PREFIX, ''));
  }

  // Check diff + prefix
  const diffCount = nonEmptyLines.filter((l) => DIFF_ADD_PREFIX.test(l)).length;
  if (diffCount >= nonEmptyLines.length / 2) {
    return lines.map((l) => l.replace(DIFF_ADD_PREFIX, ''));
  }

  return lines;
}

// ─── detectNoOp ──────────────────────────────────────────────────────────────

/**
 * Detect when a model's "edit" produces content identical to the original
 * after whitespace normalization.
 *
 * Whitespace normalization: collapse all whitespace sequences to a single
 * space, then trim. This catches:
 * - Extra/missing spaces
 * - Newline vs space changes
 * - Tab vs space changes
 * - Leading/trailing whitespace changes
 *
 * @param oldContent - The original text
 * @param newContent - The model's proposed replacement
 * @returns true if the edit is a no-op (identical after normalization)
 */
export function detectNoOp(oldContent: string, newContent: string): boolean {
  const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();
  return normalize(oldContent) === normalize(newContent);
}

// ─── relocateHashRef ─────────────────────────────────────────────────────────

/**
 * Attempt to relocate a hashline reference whose hash no longer matches
 * at the expected line number.
 *
 * Builds a hash-to-line map for the entire file, excluding any hash that
 * appears more than once (ambiguous). If the expected hash appears exactly
 * once elsewhere, returns the new location.
 *
 * @param ref - The reference to relocate: { line (1-indexed), hash }
 * @param fileLines - Array of file lines (0-indexed)
 * @param computeHash - Hash function: (idx: number, line: string) => string
 * @returns { relocated: true, newLine } if found uniquely elsewhere,
 *          or null if hash matches at ref.line, not found, or ambiguous
 */
export function relocateHashRef(
  ref: { line: number; hash: string },
  fileLines: string[],
  computeHash: (idx: number, line: string, allLines?: string[]) => string,
): { relocated: boolean; newLine: number } | null {
  if (fileLines.length === 0) return null;

  // Check if hash already matches at the expected line
  const lineIdx = ref.line - 1; // convert to 0-indexed
  if (lineIdx >= 0 && lineIdx < fileLines.length) {
    const currentHash = computeHash(lineIdx, fileLines[lineIdx], fileLines);
    if (currentHash.toLowerCase() === ref.hash.toLowerCase()) {
      // Hash matches at expected line — no relocation needed
      return null;
    }
  }

  // Build hash → line number map, tracking duplicates
  const hashToLine = new Map<string, number>();
  const duplicateHashes = new Set<string>();

  for (let i = 0; i < fileLines.length; i++) {
    const h = computeHash(i, fileLines[i], fileLines).toLowerCase();
    if (duplicateHashes.has(h)) continue;
    if (hashToLine.has(h)) {
      // Second occurrence — mark as duplicate, remove from map
      duplicateHashes.add(h);
      hashToLine.delete(h);
    } else {
      hashToLine.set(h, i + 1); // store as 1-indexed
    }
  }

  const targetHash = ref.hash.toLowerCase();
  const newLine = hashToLine.get(targetHash);

  if (newLine === undefined) {
    // Not found or ambiguous
    return null;
  }

  return { relocated: true, newLine };
}

// ─── stripBoundaryEcho ───────────────────────────────────────────────────────

/**
 * Compare two strings ignoring all whitespace.
 */
function equalsIgnoringWhitespace(a: string, b: string): boolean {
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
}

/**
 * Strip context lines that models echo at the boundaries of their replacement.
 *
 * Models frequently include the line before and/or after their actual edit range
 * as "context" in their replacement text. This function detects and removes those
 * echoed boundary lines.
 *
 * Only activates when the replacement grew (newLines.length > original span),
 * since shrinking replacements have different semantics.
 *
 * @param fileLines - All lines of the file (0-indexed array)
 * @param startLine - First line of the edit range (1-indexed)
 * @param endLine - Last line of the edit range (1-indexed)
 * @param newLines - The model's replacement lines
 * @returns Cleaned replacement lines with boundary echoes removed
 */
export function stripBoundaryEcho(
  fileLines: string[],
  startLine: number,
  endLine: number,
  newLines: string[],
): string[] {
  if (newLines.length === 0) return newLines;

  const originalSpan = endLine - startLine + 1;

  // Only strip when replacement grew
  if (newLines.length <= originalSpan) return newLines;

  let result = [...newLines];

  // Check if first newLine matches the line BEFORE startLine
  // fileLines is 0-indexed, startLine is 1-indexed
  // Line before startLine = fileLines[startLine - 2] (0-indexed: startLine-1 - 1)
  const beforeIdx = startLine - 2; // 0-indexed index of line before startLine
  if (beforeIdx >= 0 && result.length > 0) {
    if (equalsIgnoringWhitespace(result[0], fileLines[beforeIdx])) {
      result = result.slice(1);
    }
  }

  // Check if last newLine matches the line AFTER endLine
  // fileLines is 0-indexed, endLine is 1-indexed
  // Line after endLine = fileLines[endLine] (0-indexed: endLine-1 + 1 = endLine)
  const afterIdx = endLine; // 0-indexed index of line after endLine
  if (afterIdx < fileLines.length && result.length > 0) {
    if (equalsIgnoringWhitespace(result[result.length - 1], fileLines[afterIdx])) {
      result = result.slice(0, -1);
    }
  }

  return result;
}

