import {
  validateLineRef,
  HashlineMismatchError,
  computeLineHash,
  relocateHashRef,
} from '@changetracks/core';

/** Re-exported so tests can use the same hash function as relocation (avoids duplicate module instances). */
export { computeLineHash } from '@changetracks/core';

export interface RelocationEntry {
  param: string; // 'start_line' | 'end_line' | 'after_line'
  from: number; // original line number
  to: number; // relocated line number
}

export interface RelocationResult {
  newLine: number;
}

/**
 * Attempt to relocate a hashline reference.
 * Returns { newLine } if uniquely found elsewhere, null if ambiguous/not found.
 * Does NOT throw — caller decides what to do with null.
 */
export function tryRelocate(
  ref: { line: number; hash: string },
  fileLines: string[],
): RelocationResult | null {
  const result = relocateHashRef(ref, fileLines, computeLineHash);
  if (result && result.relocated) {
    return { newLine: result.newLine };
  }
  return null;
}

/**
 * Validate a line:hash reference, auto-relocating on mismatch if possible.
 *
 * @returns The (possibly adjusted) line number
 * @throws HashlineMismatchError if hash is ambiguous or not found
 * @throws Error if line is out of range and hash can't be relocated
 */
export function validateOrRelocate(
  ref: { line: number; hash: string },
  fileLines: string[],
  paramName: string,
  relocations: RelocationEntry[],
): number {
  try {
    validateLineRef(ref, fileLines);
    return ref.line; // exact match, no relocation
  } catch (err: unknown) {
    // Always attempt relocation on any validation error (mismatch or out-of-range)
    const relocated = tryRelocate(ref, fileLines);
    if (relocated) {
      relocations.push({
        param: paramName,
        from: ref.line,
        to: relocated.newLine,
      });
      return relocated.newLine;
    }
    if (err instanceof HashlineMismatchError) {
      // Could not relocate — re-throw the original mismatch error
      throw err;
    }
    throw err;
  }
}

// ── Auto-remap support ─────────────────────────────────────────────────

export interface AutoRemapResult {
  line: number;
  originalRef: string;
  correctedRef: string;
  reason: string;
}

/**
 * Validate a line:hash reference with auto-remap support.
 *
 * When a hash mismatches and exactly one candidate matches nearby (via relocation),
 * auto-correct the hash and proceed instead of failing. When relocation fails
 * (ambiguous or no match found), throw a protocol-educational error message.
 *
 * @param autoRemap - When true and relocation succeeds, include remap metadata in result.
 *                    When false and relocation succeeds, return corrected line silently (existing behavior).
 * @throws HashlineMismatchError with educational message if relocation fails
 */
export function validateOrAutoRemap(
  ref: { line: number; hash: string },
  fileLines: string[],
  paramName: string,
  relocations: RelocationEntry[],
  autoRemap: boolean,
): { line: number; remap?: AutoRemapResult } {
  try {
    validateLineRef(ref, fileLines);
    return { line: ref.line };
  } catch (err: unknown) {
    // Attempt relocation on any validation error (mismatch or out-of-range)
    const relocated = tryRelocate(ref, fileLines);
    if (relocated) {
      relocations.push({ param: paramName, from: ref.line, to: relocated.newLine });
      if (autoRemap) {
        const actualHash = computeLineHash(
          relocated.newLine - 1,
          fileLines[relocated.newLine - 1],
          fileLines,
        );
        return {
          line: relocated.newLine,
          remap: {
            line: relocated.newLine,
            originalRef: `${ref.line}:${ref.hash}`,
            correctedRef: `${relocated.newLine}:${actualHash}`,
            reason: 'auto_corrected',
          },
        };
      }
      // auto_remap disabled but relocation found — still relocate silently
      // (matches existing validateOrRelocate behavior)
      return { line: relocated.newLine };
    }

    // No relocation possible — enhance error message with protocol education
    if (err instanceof HashlineMismatchError) {
      const actualHash = ref.line >= 1 && ref.line <= fileLines.length
        ? computeLineHash(ref.line - 1, fileLines[ref.line - 1], fileLines)
        : 'unknown';
      err.message = [
        `Hash mismatch on line ${ref.line}: expected ${actualHash}, got ${ref.hash}.`,
        '',
        'This means the file content has changed since your last read — likely because',
        'a proposal was accepted and settled, or another agent edited this region.',
        'The hash is a verification token that confirms you are targeting the content',
        'you intend to modify.',
        '',
        'Call read_tracked_file to get current hashes, then retry your full batch',
        'with corrected coordinates. Do not break your batch into smaller pieces —',
        'the mismatch affects specific coordinates, not your batch structure.',
        '',
        `Quick-fix: ${ref.line}:${ref.hash} → ${ref.line}:${actualHash}`,
      ].join('\n');
      throw err;
    }
    throw err;
  }
}
