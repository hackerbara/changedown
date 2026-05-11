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

type HashlineHashAPI = Pick<XXHashAPI, 'h32Raw'>;

function getXXHash(): HashlineHashAPI | null {
  return (globalThis as any)[HASHLINE_KEY] ?? null;
}

const XXH_PRIME32_1 = 0x9E3779B1;
const XXH_PRIME32_2 = 0x85EBCA77;
const XXH_PRIME32_3 = 0xC2B2AE3D;
const XXH_PRIME32_4 = 0x27D4EB2F;
const XXH_PRIME32_5 = 0x165667B1;

function rotl32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function readUInt32LE(input: Uint8Array, offset: number): number {
  return (
    input[offset] |
    (input[offset + 1] << 8) |
    (input[offset + 2] << 16) |
    (input[offset + 3] << 24)
  ) >>> 0;
}

function xxh32Round(acc: number, value: number): number {
  acc = (acc + Math.imul(value, XXH_PRIME32_2)) >>> 0;
  acc = rotl32(acc, 13);
  return Math.imul(acc, XXH_PRIME32_1) >>> 0;
}

function xxh32Raw(input: Uint8Array, seed = 0): number {
  let offset = 0;
  const length = input.length;
  const limit = length - 16;
  let h32: number;

  if (length >= 16) {
    let v1 = (seed + XXH_PRIME32_1 + XXH_PRIME32_2) >>> 0;
    let v2 = (seed + XXH_PRIME32_2) >>> 0;
    let v3 = seed >>> 0;
    let v4 = (seed - XXH_PRIME32_1) >>> 0;

    while (offset <= limit) {
      v1 = xxh32Round(v1, readUInt32LE(input, offset)); offset += 4;
      v2 = xxh32Round(v2, readUInt32LE(input, offset)); offset += 4;
      v3 = xxh32Round(v3, readUInt32LE(input, offset)); offset += 4;
      v4 = xxh32Round(v4, readUInt32LE(input, offset)); offset += 4;
    }

    h32 = (
      rotl32(v1, 1) +
      rotl32(v2, 7) +
      rotl32(v3, 12) +
      rotl32(v4, 18)
    ) >>> 0;
  } else {
    h32 = (seed + XXH_PRIME32_5) >>> 0;
  }

  h32 = (h32 + length) >>> 0;

  while (offset <= length - 4) {
    h32 = (h32 + Math.imul(readUInt32LE(input, offset), XXH_PRIME32_3)) >>> 0;
    h32 = Math.imul(rotl32(h32, 17), XXH_PRIME32_4) >>> 0;
    offset += 4;
  }

  while (offset < length) {
    h32 = (h32 + Math.imul(input[offset], XXH_PRIME32_5)) >>> 0;
    h32 = Math.imul(rotl32(h32, 11), XXH_PRIME32_1) >>> 0;
    offset++;
  }

  h32 ^= h32 >>> 15;
  h32 = Math.imul(h32, XXH_PRIME32_2) >>> 0;
  h32 ^= h32 >>> 13;
  h32 = Math.imul(h32, XXH_PRIME32_3) >>> 0;
  h32 ^= h32 >>> 16;
  return h32 >>> 0;
}

function createPureJsXXHash(): HashlineHashAPI {
  return { h32Raw: (input: Uint8Array) => xxh32Raw(input) };
}

/**
 * Initialize the xxhash-wasm module. Must be called once before any hash
 * functions. Idempotent — safe to call multiple times.
 */
export async function initHashline(): Promise<void> {
  if (!getXXHash()) {
    try {
      (globalThis as any)[HASHLINE_KEY] = await xxhashWasm();
    } catch (err) {
      // Some embedders, including Cloudflare Worker isolates used by the remote
      // relay, disallow dynamic WebAssembly code generation. Hashline
      // coordinates are still required there, so fall back to a small pure JS
      // xxHash32 implementation with the same seed and byte semantics.
      (globalThis as any)[HASHLINE_KEY] = createPureJsXXHash();
    }
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
