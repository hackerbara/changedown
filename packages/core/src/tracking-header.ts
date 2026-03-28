/**
 * Tracking header parsing, generation, and insertion for ChangeDown files.
 *
 * ADR-021: File-level tracking headers.
 * Header format: `<!-- changedown.com/v1: tracked|untracked -->`
 *
 * Precedence: File header > Project config > Global default.
 */

export interface TrackingHeader {
  version: number;
  status: 'tracked' | 'untracked';
  /** 0-indexed line number where the header was found */
  line: number;
  /** Character offset from the start of the document */
  offset: number;
  /** Character length of the header comment */
  length: number;
}

/**
 * Regex matching the tracking header comment.
 * Allows flexible whitespace inside the HTML comment.
 */
export const TRACKING_HEADER_RE = /<!--\s*(?:changedown\.com|ctrcks\.com)\/v(\d+):\s*(tracked|untracked)\s*-->/;

/**
 * Maximum number of lines to scan for a tracking header (0-indexed: lines 0..4).
 */
const MAX_SCAN_LINES = 5;

/**
 * Parse the first 5 lines of `text` for a ChangeDown tracking header.
 *
 * Returns a `TrackingHeader` if found, or `null` if no valid header exists
 * within the first 5 lines. Legacy breadcrumb comments
 * (`<!-- changedown: https://changedown.com/spec -->`) are explicitly
 * NOT treated as tracking headers.
 */
export function parseTrackingHeader(text: string): TrackingHeader | null {
  const lines = text.split('\n');
  const scanLimit = Math.min(lines.length, MAX_SCAN_LINES);
  let offset = 0;

  for (let i = 0; i < scanLimit; i++) {
    const match = TRACKING_HEADER_RE.exec(lines[i]);
    if (match) {
      return {
        version: parseInt(match[1], 10),
        status: match[2] as 'tracked' | 'untracked',
        line: i,
        offset: offset + match.index,
        length: match[0].length,
      };
    }
    // +1 for the newline character consumed by split
    offset += lines[i].length + 1;
  }

  return null;
}

/**
 * Generate a tracking header comment string.
 */
export function generateTrackingHeader(status: 'tracked' | 'untracked'): string {
  return `<!-- changedown.com/v1: ${status} -->`;
}

/**
 * Insert a `tracked` header into `text` if one does not already exist.
 *
 * - If the file starts with YAML frontmatter (`---`), the header is inserted
 *   immediately after the closing `---`.
 * - Otherwise, the header is prepended to the file.
 * - If a tracking header (tracked OR untracked) already exists, the text is
 *   returned unchanged with `headerInserted: false`.
 *
 * @returns `{ newText, headerInserted }` — the (possibly modified) text and
 *   whether a header was actually inserted.
 */
export function insertTrackingHeader(text: string): { newText: string; headerInserted: boolean } {
  // If header already exists, return unchanged
  if (parseTrackingHeader(text) !== null) {
    return { newText: text, headerInserted: false };
  }

  const header = generateTrackingHeader('tracked');

  // Handle empty file
  if (text === '') {
    return { newText: header + '\n', headerInserted: true };
  }

  // Check for YAML frontmatter: file starts with `---`
  if (text.startsWith('---')) {
    // Find the closing `---` (must be on its own line, not the opening one)
    const lines = text.split('\n');
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trimEnd() === '---') {
        // Insert header after the closing --- line
        const before = lines.slice(0, i + 1).join('\n');
        const after = lines.slice(i + 1).join('\n');
        return {
          newText: before + '\n' + header + '\n' + after,
          headerInserted: true,
        };
      }
    }
  }

  // Default: prepend header
  return { newText: header + '\n' + text, headerInserted: true };
}
