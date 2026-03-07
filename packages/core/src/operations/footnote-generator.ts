import { footnoteRefNumericGlobal } from '../footnote-patterns.js';
import { nowTimestamp } from '../timestamp.js';

/**
 * Generates a footnote definition line for a ChangeTracks change.
 *
 * Format: `[^id]: @author | date | type | proposed`
 * When author is omitted: `[^id]: date | type | proposed`
 *
 * Always prefixed with `\n\n` (blank line separator) so the footnote
 * can be appended at the end of a document.
 */
export function generateFootnoteDefinition(
  id: string,
  type: string,
  author?: string,
  date?: string,
): string {
  const d = date ?? nowTimestamp().date;
  const authorPart = author ? `@${author} | ` : '';
  return `\n\n[^${id}]: ${authorPart}${d} | ${type} | proposed`;
}

/**
 * Scans text for all `[^ct-N]` and `[^ct-N.M]` patterns and returns
 * the maximum parent ID number found. Returns 0 if no ct-IDs exist.
 */
export function scanMaxCtId(text: string): number {
  const pattern = footnoteRefNumericGlobal();
  let max = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const n = parseInt(match[1], 10);
    if (n > max) {
      max = n;
    }
  }
  return max;
}
