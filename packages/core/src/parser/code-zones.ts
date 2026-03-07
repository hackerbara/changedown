/**
 * Standalone utility for detecting code zones (fenced code blocks and inline
 * code spans) in markdown text. Uses the same logic as the parser's inline
 * state machine, but returns the zones as an array for use by consumers
 * that need zone data without running the full CriticMarkup parser.
 *
 * Consumers: preview layer, MCP server footnote placement, etc.
 */

export interface CodeZone {
  start: number;
  end: number;
  type: 'fence' | 'inline';
}

/**
 * Scans `text` and returns all code zones (fenced code blocks and inline code
 * spans) in document order. The algorithm is O(n) single-pass.
 *
 * Fenced code blocks follow CommonMark section 4.5:
 * - Opening fence: 0-3 leading spaces, then 3+ backticks or tildes, optional info string.
 * - Closing fence: 0-3 leading spaces, then N+ of the same marker (N >= opening length),
 *   then optional whitespace only.
 * - Unclosed fences extend to end of document.
 * - Backtick fences cannot have backticks in the info string.
 *
 * Inline code spans follow CommonMark section 6.1:
 * - Opening backtick run of length N, matching closing run of exactly length N.
 * - Backticks inside fenced blocks do NOT start inline code spans.
 * - Unmatched backtick runs do NOT produce a zone.
 */
export function findCodeZones(text: string): CodeZone[] {
  const zones: CodeZone[] = [];
  let position = 0;
  let atLineStart = true;
  let inFence = false;
  let fenceStart = 0;
  let fenceMarkerCode = 0;
  let fenceLength = 0;

  while (position < text.length) {
    const ch = text.charCodeAt(position);

    // ── Inside a fenced code block ───────────────────────────────
    if (inFence) {
      if (atLineStart) {
        const closeResult = tryMatchFenceClose(text, position, fenceMarkerCode, fenceLength);
        if (closeResult >= 0) {
          zones.push({ start: fenceStart, end: closeResult, type: 'fence' });
          inFence = false;
          position = closeResult;
          atLineStart = true;
          continue;
        }
      }
      // Skip to end of line
      const nextNewline = text.indexOf('\n', position);
      if (nextNewline === -1) {
        // No more newlines — remaining content is all inside the fence, handled post-loop
        position = text.length;
      } else {
        position = nextNewline + 1;
        atLineStart = true;
      }
      continue;
    }

    // ── Fence opening detection (only at line start) ─────────────
    if (atLineStart) {
      const fenceResult = tryMatchFenceOpen(text, position);
      if (fenceResult) {
        inFence = true;
        fenceStart = position;
        fenceMarkerCode = fenceResult.markerCode;
        fenceLength = fenceResult.length;
        position = fenceResult.nextPos;
        atLineStart = true;
        continue;
      }
    }

    // ── Inline code span detection ───────────────────────────────
    if (ch === 96) { // '`'
      const codeStart = position;
      // Count opening backtick run
      let openEnd = position;
      while (openEnd < text.length && text.charCodeAt(openEnd) === 96) {
        openEnd++;
      }
      const runLength = openEnd - position;

      // Scan forward for matching closing backtick run
      let scanPos = openEnd;
      let found = false;
      while (scanPos < text.length) {
        if (text.charCodeAt(scanPos) !== 96) {
          scanPos++;
          continue;
        }
        const closeRunStart = scanPos;
        while (scanPos < text.length && text.charCodeAt(scanPos) === 96) {
          scanPos++;
        }
        if (scanPos - closeRunStart === runLength) {
          zones.push({ start: codeStart, end: scanPos, type: 'inline' });
          atLineStart = text.charCodeAt(scanPos - 1) === 10;
          position = scanPos;
          found = true;
          break;
        }
      }
      if (!found) {
        // Unmatched backtick run — no zone, advance past opening run
        atLineStart = false;
        position = openEnd;
      }
      continue;
    }

    // ── Normal character — advance ───────────────────────────────
    atLineStart = ch === 10; // '\n'
    position++;
  }

  // Handle unclosed fence at end of document
  if (inFence) {
    zones.push({ start: fenceStart, end: text.length, type: 'fence' });
  }

  return zones;
}

/**
 * Checks whether a fence opening line starts at `position`.
 * CommonMark section 4.5: 0-3 leading spaces, then 3+ backticks or tildes,
 * optional info string (backtick fences cannot have backticks in info string).
 * Returns marker char code, run length, and position of the next line.
 */
export function tryMatchFenceOpen(text: string, position: number): { markerCode: number; length: number; nextPos: number } | null {
  let pos = position;
  let spaces = 0;
  while (spaces < 3 && pos < text.length && text.charCodeAt(pos) === 32) {
    spaces++;
    pos++;
  }
  if (pos >= text.length) return null;
  const markerCode = text.charCodeAt(pos);
  if (markerCode !== 96 && markerCode !== 126) return null;
  let runLength = 0;
  while (pos < text.length && text.charCodeAt(pos) === markerCode) {
    runLength++;
    pos++;
  }
  if (runLength < 3) return null;

  // Backtick fences: info string must not contain backticks
  if (markerCode === 96) {
    const lineEnd = text.indexOf('\n', pos);
    const infoEnd = lineEnd === -1 ? text.length : lineEnd;
    const infoString = text.substring(pos, infoEnd);
    if (infoString.includes('`')) return null;
  }

  const nextNewline = text.indexOf('\n', pos);
  const nextPos = nextNewline === -1 ? text.length : nextNewline + 1;
  return { markerCode, length: runLength, nextPos };
}

/**
 * Checks whether a fence closing line starts at `position`.
 * CommonMark section 4.5: 0-3 leading spaces, then N+ of the same marker
 * (N >= fenceLength), then only optional whitespace to end of line.
 * Returns the position of the next line on match, or -1 if no match.
 */
export function tryMatchFenceClose(text: string, position: number, fenceMarkerCode: number, fenceLength: number): number {
  let pos = position;
  let spaces = 0;
  while (spaces < 3 && pos < text.length && text.charCodeAt(pos) === 32) {
    spaces++;
    pos++;
  }
  if (pos >= text.length) return -1;
  if (text.charCodeAt(pos) !== fenceMarkerCode) return -1;
  let runLength = 0;
  while (pos < text.length && text.charCodeAt(pos) === fenceMarkerCode) {
    runLength++;
    pos++;
  }
  if (runLength < fenceLength) return -1;
  while (pos < text.length && text.charCodeAt(pos) !== 10) {
    const c = text.charCodeAt(pos);
    if (c !== 32 && c !== 9) return -1;
    pos++;
  }
  if (pos < text.length && text.charCodeAt(pos) === 10) {
    pos++;
  }
  return pos;
}

/**
 * Detects an inline code span starting at `position` (which must be a backtick).
 * Counts the opening backtick run, then scans forward for a matching closing run
 * of the same length (CommonMark section 6.1).
 * Returns the position right after the closing backtick run, or the original
 * `position` if no matching close is found (unmatched backticks).
 */
export function skipInlineCode(text: string, position: number): number {
  // Count opening backtick run
  let openEnd = position;
  while (openEnd < text.length && text.charCodeAt(openEnd) === 96) { // '`'
    openEnd++;
  }
  const runLength = openEnd - position;

  // Scan forward for a matching closing backtick run
  let scanPos = openEnd;
  while (scanPos < text.length) {
    if (text.charCodeAt(scanPos) !== 96) {
      scanPos++;
      continue;
    }
    // Found a backtick -- count this run
    const closeRunStart = scanPos;
    while (scanPos < text.length && text.charCodeAt(scanPos) === 96) {
      scanPos++;
    }
    if (scanPos - closeRunStart === runLength) {
      // Matching close found
      return scanPos;
    }
    // Not matching length -- keep scanning
  }
  // No matching close found -- return original position (unmatched)
  return position;
}
