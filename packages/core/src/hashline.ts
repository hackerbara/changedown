/**
 * Hashline coordinate system — compatible with oh-my-pi's implementation (MIT).
 *
 * Provides content-addressed line references: LINE:HASH where HASH is
 * xxHash32(whitespace-stripped content) mod 256, formatted as 2-char hex.
 *
 * Requires async initialization: call initHashline() once before use.
 */

import xxhashWasm, { XXHashAPI } from 'xxhash-wasm';

// ─── Hash constants (must match oh-my-pi exactly) ──────────────────────────

const HASH_LEN = 2;
const RADIX = 16;
const HASH_MOD = RADIX ** HASH_LEN; // 256
const DICT = Array.from({ length: HASH_MOD }, (_, i) =>
  i.toString(RADIX).padStart(HASH_LEN, '0')
);
const encoder = new TextEncoder();

// ─── WASM instance (lazy-initialized) ──────────────────────────────────────

// Store on globalThis so the instance survives module duplication.
// Vitest (and other bundlers) can load the same source file under multiple
// module IDs — e.g. via direct import vs transitive re-export through another
// workspace package. A module-level `let` would be separate per instance,
// causing "xxhash-wasm not initialized" errors even after calling initHashline().
// All read sites use getXXHash() so they always get the live global value.
const HASHLINE_KEY = '__changedown_xxhash__';

function getXXHash(): XXHashAPI | null {
  return (globalThis as any)[HASHLINE_KEY] ?? null;
}

/**
 * Initialize the xxhash-wasm module. Must be called once before any hash
 * functions. Idempotent — safe to call multiple times.
 */
export async function initHashline(): Promise<void> {
  if (!getXXHash()) {
    (globalThis as any)[HASHLINE_KEY] = await xxhashWasm();
  }
}

/**
 * Ensure the hashline WASM module is initialized. Semantic alias for
 * `initHashline()` — intended for handler entry points that want to
 * guarantee readiness without caring whether init already happened.
 *
 * Idempotent: no-op if already initialized.
 */
export const ensureHashlineReady: () => Promise<void> = initHashline;

// ─── computeLineHash ───────────────────────────────────────────────────────

/**
 * Strip a line for hashing: remove trailing \r, footnote refs, and ALL whitespace.
 */
function stripForHash(line: string): string {
  return line.replace(/\r$/, '').replace(/\[\^cn-[\w.]+\]/g, '').replace(/\s+/g, '');
}

/**
 * Compute a 2-char hex hash for a single line.
 *
 * Algorithm: strip trailing \r, strip footnote refs, strip ALL whitespace,
 * xxHash32 on UTF-8 bytes, mod 256, format as 2-char lowercase hex.
 *
 * When `allLines` is provided and the line is blank (stripped content is empty),
 * uses structural context (prev non-blank content + next non-blank content +
 * distance from prev non-blank) to produce a unique hash per blank line.
 *
 * @param idx - Line index (0-based). Used for context-aware blank-line hashing.
 * @param line - The line content to hash
 * @param allLines - Optional full document lines array. When provided, enables
 *   context-aware hashing for blank lines so each gets a unique hash.
 * @returns 2-char lowercase hex hash
 */
export function computeLineHash(idx: number, line: string, allLines?: string[]): string {
  const h = getXXHash();
  if (!h) {
    throw new Error(
      'xxhash-wasm not initialized. Call `await initHashline()` or ' +
      '`await ensureHashlineReady()` before using hashline functions.'
    );
  }
  const stripped = stripForHash(line);

  // Non-blank line or no context: content-based hash (original behavior)
  if (stripped.length > 0 || !allLines) {
    return DICT[h.h32Raw(encoder.encode(stripped)) % HASH_MOD];
  }

  // Blank line with context: hash(prevNonBlank + "\0" + nextNonBlank + "\0" + dist)
  let prevNonBlank = '';
  let distFromPrev = 0;
  for (let i = idx - 1; i >= 0; i--) {
    distFromPrev++;
    const s = stripForHash(allLines[i]);
    if (s.length > 0) { prevNonBlank = s; break; }
  }
  // At start of file with no non-blank predecessor: use idx+1 as distance
  // so consecutive leading blanks each get a different hash
  if (distFromPrev === 0) distFromPrev = idx + 1;

  let nextNonBlank = '';
  for (let i = idx + 1; i < allLines.length; i++) {
    const s = stripForHash(allLines[i]);
    if (s.length > 0) { nextNonBlank = s; break; }
  }

  const contextKey = prevNonBlank + '\0' + nextNonBlank + '\0' + distFromPrev;
  return DICT[h.h32Raw(encoder.encode(contextKey)) % HASH_MOD];
}

// ─── formatHashLines ───────────────────────────────────────────────────────

/**
 * Format file content with hashline coordinates.
 *
 * Each line becomes `LINE:HASH|CONTENT` where LINE is 1-indexed.
 *
 * @param content - The file content (newline-separated)
 * @param startLine - Starting line number (default 1)
 * @returns Formatted hashline output
 */
export function formatHashLines(content: string, startLine: number = 1): string {
  const lines = content.split('\n');
  return lines
    .map((line, i) => {
      const lineNum = startLine + i;
      const hash = computeLineHash(i, line, lines);
      return `${lineNum}:${hash}|${line}`;
    })
    .join('\n');
}

// ─── parseLineRef ──────────────────────────────────────────────────────────

/**
 * Parse a hashline reference string into { line, hash }.
 *
 * Handles formats:
 *   - "5:a3"           — bare ref
 *   - "5:a3|content"   — with pipe-separated display content
 *   - "5:a3  content"  — with double-space-separated display content
 *
 * Normalizes whitespace around the colon. Validates format strictly, with
 * fallback to 2-char prefix match for robustness.
 *
 * @param ref - The reference string to parse
 * @returns Parsed line number and hash
 * @throws Error on invalid format or line < 1
 */
export function parseLineRef(ref: string): { line: number; hash: string } {
  // Strip display-format suffix: pipe or double-space
  let cleaned = ref;

  // Remove pipe-suffixed content: "5:a3|content" → "5:a3"
  const pipeIdx = cleaned.indexOf('|');
  if (pipeIdx !== -1) {
    cleaned = cleaned.substring(0, pipeIdx);
  }

  // Remove double-space-suffixed content: "5:a3  content" → "5:a3"
  const dblSpaceIdx = cleaned.indexOf('  ');
  if (dblSpaceIdx !== -1) {
    cleaned = cleaned.substring(0, dblSpaceIdx);
  }

  // Normalize whitespace around colon
  cleaned = cleaned.replace(/\s*:\s*/, ':');

  // Trim any remaining whitespace
  cleaned = cleaned.trim();

  // Strict match: line:hash where hash is 2-16 hex/alphanumeric chars, nothing trailing
  const strictMatch = cleaned.match(/^(\d+):([0-9a-fA-F]{2,16})$/);
  if (strictMatch) {
    const line = parseInt(strictMatch[1], 10);
    if (line < 1) {
      throw new Error('Invalid line ref: line must be >= 1');
    }
    return { line, hash: strictMatch[2] };
  }

  // Fallback: prefix match extracting exactly 2 hex chars from the start of hash
  const prefixMatch = cleaned.match(/^(\d+):([0-9a-fA-F]{2})/);
  if (prefixMatch) {
    const line = parseInt(prefixMatch[1], 10);
    if (line < 1) {
      throw new Error('Invalid line ref: line must be >= 1');
    }
    return { line, hash: prefixMatch[2] };
  }

  throw new Error(
    `Invalid line ref: "${ref}". Expected format "LINE:HASH" (e.g. "5:a3")`
  );
}

// ─── HashlineMismatchError ─────────────────────────────────────────────────

export class HashlineMismatchError extends Error {
  readonly name = 'HashlineMismatchError';
  readonly remaps: ReadonlyMap<string, string>;

  constructor(
    public readonly mismatches: Array<{ line: number; expected: string; actual: string }>,
    fileLines: string[]
  ) {
    const CONTEXT = 2; // lines of context above/below

    // Build remap entries
    const remapEntries = mismatches.map(
      (m) => [`${m.line}:${m.expected}`, `${m.line}:${m.actual}`] as [string, string]
    );

    // Compute display regions: for each mismatch, the range of lines to show
    // (1-indexed, clamped to file bounds)
    const regions: Array<{ start: number; end: number }> = mismatches.map((m) => ({
      start: Math.max(1, m.line - CONTEXT),
      end: Math.min(fileLines.length, m.line + CONTEXT),
    }));

    // Merge overlapping/contiguous regions
    const merged: Array<{ start: number; end: number }> = [];
    for (const region of regions) {
      if (merged.length > 0 && region.start <= merged[merged.length - 1].end + 1) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, region.end);
      } else {
        merged.push({ ...region });
      }
    }

    // Build the mismatch line set for fast lookup
    const mismatchLines = new Set(mismatches.map((m) => m.line));

    // Build display output
    const outputParts: string[] = ['Hashline mismatch:'];

    for (let r = 0; r < merged.length; r++) {
      if (r > 0) {
        outputParts.push('...');
      }
      const region = merged[r];
      for (let lineNum = region.start; lineNum <= region.end; lineNum++) {
        const content = fileLines[lineNum - 1]; // 0-indexed in array
        const prefix = mismatchLines.has(lineNum) ? '>>>' : '   ';
        outputParts.push(`${prefix} ${lineNum}:${computeLineHash(lineNum - 1, content, fileLines)}|${content}`);
      }
    }

    // Quick-fix remap section
    outputParts.push('');
    outputParts.push('Quick-fix remaps:');
    for (const [oldRef, newRef] of remapEntries) {
      outputParts.push(`  ${oldRef} → ${newRef}`);
    }

    // Recovery hint
    outputParts.push('');
    outputParts.push('Re-read the file with read_tracked_file to get updated coordinates.');

    super(outputParts.join('\n'));

    this.remaps = new Map(remapEntries);
  }
}

// ─── validateLineRef ───────────────────────────────────────────────────────

/**
 * Validate that a parsed line ref matches the actual file content.
 *
 * @param ref - Parsed line reference { line, hash }
 * @param fileLines - Array of file lines (0-indexed array, but ref.line is 1-indexed)
 * @throws Error if line is out of range
 * @throws HashlineMismatchError if hash does not match actual content
 */
export function validateLineRef(
  ref: { line: number; hash: string },
  fileLines: string[]
): void {
  if (ref.line < 1 || ref.line > fileLines.length) {
    throw new Error(
      `Line ${ref.line} is out of range (file has ${fileLines.length} lines)`
    );
  }

  const actualHash = computeLineHash(ref.line - 1, fileLines[ref.line - 1], fileLines);

  if (ref.hash.toLowerCase() !== actualHash.toLowerCase()) {
    throw new HashlineMismatchError(
      [{ line: ref.line, expected: ref.hash, actual: actualHash }],
      fileLines
    );
  }
}
