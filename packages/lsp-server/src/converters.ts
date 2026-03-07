/**
 * Converters for offset-based POD types to LSP line:char based types.
 *
 * The core package uses offset-based ranges (single number representing
 * position in string). LSP uses line:character Position and Range types.
 * These converters handle the translation, including proper handling of
 * both LF and CRLF line endings.
 */

import { Position, Range } from 'vscode-languageserver';

/**
 * Convert a string offset to an LSP Position (line:character).
 *
 * Handles both LF (\n) and CRLF (\r\n) line endings correctly.
 * Line numbers are 0-indexed, character positions are 0-indexed.
 *
 * @param text The full document text
 * @param offset The offset into the text (0-based)
 * @returns LSP Position with line and character
 */
export function offsetToPosition(text: string, offset: number): Position {
  let line = 0;
  let character = 0;
  let currentOffset = 0;

  while (currentOffset < offset && currentOffset < text.length) {
    const char = text[currentOffset];

    if (char === '\n') {
      line++;
      character = 0;
      currentOffset++;
    } else if (char === '\r' && text[currentOffset + 1] === '\n') {
      // CRLF - skip both characters
      line++;
      character = 0;
      currentOffset += 2;
    } else {
      character++;
      currentOffset++;
    }
  }

  return Position.create(line, character);
}

/**
 * Convert an LSP Position (line:character) to a string offset.
 *
 * Handles both LF (\n) and CRLF (\r\n) line endings correctly.
 *
 * @param text The full document text
 * @param position The LSP position
 * @returns The offset into the text (0-based)
 */
export function positionToOffset(text: string, position: Position): number {
  let line = 0;
  let character = 0;
  let offset = 0;

  while (offset < text.length) {
    // Check if we've reached the target position
    if (line === position.line && character === position.character) {
      return offset;
    }

    const char = text[offset];

    if (char === '\n') {
      if (line === position.line) {
        // We're on the target line but haven't found the character yet
        // This means the position is beyond the line length
        return offset;
      }
      line++;
      character = 0;
      offset++;
    } else if (char === '\r' && text[offset + 1] === '\n') {
      if (line === position.line) {
        // We're on the target line but haven't found the character yet
        return offset;
      }
      // CRLF - skip both characters
      line++;
      character = 0;
      offset += 2;
    } else {
      character++;
      offset++;
    }
  }

  // Position is at or beyond end of document
  return offset;
}

/**
 * Convert an offset-based range to an LSP Range.
 *
 * @param text The full document text
 * @param start The start offset (inclusive)
 * @param end The end offset (exclusive)
 * @returns LSP Range with start and end positions
 */
export function offsetRangeToLspRange(text: string, start: number, end: number): Range {
  const startPos = offsetToPosition(text, start);
  const endPos = offsetToPosition(text, end);
  return Range.create(startPos, endPos);
}

/**
 * Convert an LSP Range to an offset-based range.
 *
 * @param text The full document text
 * @param range The LSP range
 * @returns Object with start and end offsets
 */
export function lspRangeToOffsetRange(text: string, range: Range): { start: number; end: number } {
  const start = positionToOffset(text, range.start);
  const end = positionToOffset(text, range.end);
  return { start, end };
}
