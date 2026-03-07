/**
 * At-resolver -- parse and resolve `at` coordinate strings.
 *
 * Coordinates use the hashline format: "LINE:HASH" (single line) or
 * "LINE:HASH-LINE:HASH" (range). LINE is 1-indexed. HASH is a 2-char
 * lowercase hex string produced by xxHash32 (see computeLineHash in hashline.ts).
 *
 * resolveAt() verifies hashes against actual file content and returns
 * character offsets for the targeted region.
 */

import { computeLineHash } from './hashline.js';

export interface ParsedAt {
  startLine: number;
  startHash: string;
  endLine: number;
  endHash: string;
}

export interface ResolvedTarget {
  startLine: number;   // 1-indexed
  endLine: number;     // 1-indexed
  startOffset: number; // character offset in full text
  endOffset: number;   // character offset (end of last line, before \n)
  content: string;     // the text at the target range
}

const LINE_HASH_RE = /^(\d+):([0-9a-f]{2})$/;
const DUAL_HASH_RE = /^\d+:[0-9a-f]{2}\.[0-9a-f]{2}$/;

/**
 * Parse an `at` coordinate string into line/hash pairs.
 * Accepts "LINE:HASH" (single) or "LINE:HASH-LINE:HASH" (range).
 */
export function parseAt(at: string): ParsedAt {
  if (!at || at.trim() === '') {
    throw new Error('at coordinate is empty.');
  }

  const dashIdx = at.indexOf('-');
  if (dashIdx === -1) {
    // Single line
    const m = at.match(LINE_HASH_RE);
    if (!m) {
      if (DUAL_HASH_RE.test(at)) {
        const rawPart = at.split('.')[0];
        throw new Error(
          `at must be LINE:HASH (e.g. ${rawPart}). ` +
          `Dual hashes (LINE:RAW.SETTLED) appear in read output — use only the first hash (before the dot).`
        );
      }
      throw new Error(`Invalid at coordinate: "${at}". Expected format: LINE:HASH (e.g., "12:a1").`);
    }
    const line = parseInt(m[1], 10);
    return { startLine: line, startHash: m[2], endLine: line, endHash: m[2] };
  }

  // Range: "12:a1-15:b3"
  const startPart = at.slice(0, dashIdx);
  const endPart = at.slice(dashIdx + 1);

  const startMatch = startPart.match(LINE_HASH_RE);
  const endMatch = endPart.match(LINE_HASH_RE);

  if (!startMatch || !endMatch) {
    const hasDualHash = DUAL_HASH_RE.test(startPart) || DUAL_HASH_RE.test(endPart);
    if (hasDualHash) {
      throw new Error(
        `at range contains dual hash — use only the first hash (before the dot) in each LINE:HASH. ` +
        `Example: "${startPart.split('.')[0]}-${endPart.split('.')[0]}".`
      );
    }
    throw new Error(`Invalid at range: "${at}". Expected format: LINE:HASH-LINE:HASH (e.g., "12:a1-15:b3").`);
  }

  const startLine = parseInt(startMatch[1], 10);
  const endLine = parseInt(endMatch[1], 10);

  if (endLine < startLine) {
    throw new Error(`Invalid at range: end line ${endLine} < start line ${startLine}.`);
  }

  return {
    startLine,
    startHash: startMatch[2],
    endLine,
    endHash: endMatch[2],
  };
}

/**
 * Resolve an `at` coordinate against file lines. Verifies hashes and returns
 * character offsets into the full text.
 */
export function resolveAt(at: string, fileLines: string[]): ResolvedTarget {
  const parsed = parseAt(at);

  // Validate line range
  if (parsed.startLine < 1 || parsed.startLine > fileLines.length) {
    throw new Error(
      `Line ${parsed.startLine} out of range (file has ${fileLines.length} lines).`
    );
  }
  if (parsed.endLine < 1 || parsed.endLine > fileLines.length) {
    throw new Error(
      `Line ${parsed.endLine} out of range (file has ${fileLines.length} lines).`
    );
  }

  // Verify start hash (0-indexed for computeLineHash)
  const actualStartHash = computeLineHash(parsed.startLine - 1, fileLines[parsed.startLine - 1], fileLines);
  if (actualStartHash !== parsed.startHash) {
    throw new Error(
      `Hash mismatch at line ${parsed.startLine}: expected ${parsed.startHash}, ` +
      `current hash is ${actualStartHash}. ` +
      `Re-read the file with read_tracked_file to get updated coordinates. ` +
      `For batch edits, consider single edits with re-reads between them.`
    );
  }

  // Verify end hash (if different from start)
  if (parsed.endLine !== parsed.startLine) {
    const actualEndHash = computeLineHash(parsed.endLine - 1, fileLines[parsed.endLine - 1], fileLines);
    if (actualEndHash !== parsed.endHash) {
      throw new Error(
        `Hash mismatch at line ${parsed.endLine}: expected ${parsed.endHash}, ` +
        `current hash is ${actualEndHash}. ` +
        `Re-read the file with read_tracked_file to get updated coordinates. ` +
        `For batch edits, consider single edits with re-reads between them.`
      );
    }
  }

  // Compute character offsets
  let startOffset = 0;
  for (let i = 0; i < parsed.startLine - 1; i++) {
    startOffset += fileLines[i].length + 1; // +1 for \n
  }

  let endOffset = startOffset;
  for (let i = parsed.startLine - 1; i <= parsed.endLine - 1; i++) {
    endOffset += fileLines[i].length + (i < parsed.endLine - 1 ? 1 : 0);
  }

  // Extract content
  const content = fileLines.slice(parsed.startLine - 1, parsed.endLine).join('\n');

  return {
    startLine: parsed.startLine,
    endLine: parsed.endLine,
    startOffset,
    endOffset,
    content,
  };
}
