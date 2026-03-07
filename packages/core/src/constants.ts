/**
 * Marker string used to identify the start of a sidecar annotation block
 * in non-markdown (code) files. Appears as: `COMMENT_CHAR -- ChangeTracks ---...`
 */
export const SIDECAR_BLOCK_MARKER = '-- ChangeTracks';

/**
 * Finds the line index where the sidecar block starts.
 * Looks for: `COMMENT_CHAR -- ChangeTracks`
 * Returns -1 if not found.
 *
 * Shared by sidecar-parser and sidecar-accept-reject.
 */
export function findSidecarBlockStart(lines: string[], commentLinePrefix: string): number {
  const prefix = `${commentLinePrefix} ${SIDECAR_BLOCK_MARKER}`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(prefix)) {
      return i;
    }
  }
  return -1;
}
