/**
 * Browser-safe basename: extracts filename from a path string.
 * Replaces Node's `path.basename()` for browser compatibility.
 */
export function basename(p: string): string {
  return p.split('/').pop() ?? '';
}
