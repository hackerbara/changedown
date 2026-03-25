import { findCodeZones } from './parser/code-zones.js';

/**
 * Shared footnote regex patterns for ChangeTracks.
 *
 * Single source of truth for all patterns matching `[^ct-N]` references
 * and `[^ct-N]: ...` definitions. Consumers import the specific pattern
 * they need rather than re-inventing it inline.
 *
 * Pattern naming conventions:
 *   - `FOOTNOTE_ID_PATTERN` — the raw ID pattern string (not a RegExp), for composition
 *   - `FOOTNOTE_REF_*` — patterns for inline references `[^ct-N]`
 *   - `FOOTNOTE_DEF_*` — patterns for definition lines `[^ct-N]: ...`
 *   - Functions returning RegExp — for /g patterns (fresh instance each call)
 */

// ─── Building blocks ────────────────────────────────────────────────────────

/**
 * Raw pattern string matching a footnote ID: `ct-N` or `ct-N.M`.
 * Not a RegExp — use for composing larger patterns.
 */
export const FOOTNOTE_ID_PATTERN = 'ct-\\d+(?:\\.\\d+)?';

/**
 * Raw pattern string matching the numeric portion of a footnote ID.
 * Captures the parent number in group 1: `(\\d+)`.
 * Used by scanMaxCtId to find the highest-numbered change.
 */
export const FOOTNOTE_ID_NUMERIC_PATTERN = 'ct-(\\d+)(?:\\.\\d+)?';

// ─── Inline reference patterns ──────────────────────────────────────────────

/**
 * Anchored footnote reference. Matches `[^ct-N]` or `[^ct-N.M]` at the
 * start of a string. Captures the ID (e.g. "ct-1", "ct-2.3") in group 1.
 *
 * Used by the parser to detect refs immediately after CriticMarkup or
 * as standalone refs in the text.
 *
 * Non-global (no /g flag) — safe to reuse.
 */
export const FOOTNOTE_REF_ANCHORED = new RegExp(`^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]`);

/**
 * Returns a global regex matching inline footnote refs `[^ct-N]` or `[^ct-N.M]`.
 * No capture groups — used for stripping refs from text.
 *
 * Returns fresh RegExp each call (/g flag has mutable lastIndex).
 */
export function footnoteRefGlobal(): RegExp {
  return new RegExp(`\\[\\^${FOOTNOTE_ID_PATTERN}\\]`, 'g');
}

/**
 * Returns a global regex matching `[^ct-(N)]` with the numeric parent ID
 * captured in group 1. Used by scanMaxCtId.
 *
 * Returns fresh RegExp each call (/g flag has mutable lastIndex).
 */
export function footnoteRefNumericGlobal(): RegExp {
  return new RegExp(`\\[\\^${FOOTNOTE_ID_NUMERIC_PATTERN}\\]`, 'g');
}

// ─── Footnote definition patterns ───────────────────────────────────────────

/**
 * Simple detection: does a line start with a footnote definition?
 * Matches `[^ct-N]:` at column 0. Used for finding/skipping footnote blocks.
 *
 * More permissive than the full header parser — matches even if the
 * rest of the header line is malformed.
 *
 * Non-global, no capture groups.
 */
export const FOOTNOTE_DEF_START = new RegExp(`^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:`);

/**
 * Even simpler detection: does a line start with `[^ct-` followed by digits?
 * Used by committed-text.ts findFootnoteLineIndices for fast scanning.
 * Matches lines like `[^ct-1]:` and also `[^ct-1.2]:`.
 *
 * Non-global, no capture groups.
 */
export const FOOTNOTE_DEF_START_QUICK = /^\[\^ct-\d+/;

/**
 * Full footnote definition header with lenient whitespace (`\s*` around pipes).
 * Requires `@` prefix on author field.
 *
 * Format: `[^ct-N]: @author | date | type | status`
 *
 * Captures:
 *   1: ID (e.g. "ct-1", "ct-2.3")
 *   2: author without @ (e.g. "alice", "ai:claude-opus-4.6")
 *   3: date (e.g. "2026-02-17")
 *   4: type (e.g. "sub", "ins")
 *   5: status (e.g. "proposed", "accepted")
 *
 * Used by footnote-parser.ts for lightweight metadata extraction.
 *
 * Non-global.
 */
export const FOOTNOTE_DEF_LENIENT = new RegExp(
  `^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s*@(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(\\S+)\\s*\\|\\s*(\\S+)`
);

/**
 * Full footnote definition header with strict whitespace (`\s+` around pipes).
 * Author field is optional (captured when present with `@` prefix).
 *
 * Format: `[^ct-N]: @author | date | type | status`
 *    or:  `[^ct-N]: date | type | status`
 *
 * Captures:
 *   1: ID (e.g. "ct-1", "ct-2.3")
 *   2: author with @ prefix or undefined (e.g. "@alice")
 *   3: date (e.g. "2026-02-17")
 *   4: type word (e.g. "sub", "ins")
 *   5: status word (e.g. "proposed", "accepted")
 *
 * Used by parser/parser.ts for full AST construction.
 *
 * Non-global.
 */
export const FOOTNOTE_DEF_STRICT = new RegExp(
  `^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s+(?:(@\\S+)\\s+\\|\\s+)?(\\S+)\\s+\\|\\s+(\\S+)\\s+\\|\\s+(\\S+)`
);

/**
 * Footnote definition header that captures only ID and status.
 * Author/date/type fields are matched but not captured.
 * Uses `\s+` whitespace.
 *
 * Format: `[^ct-N]: @author | date | type | status`
 *
 * Captures:
 *   1: ID (e.g. "ct-1")
 *   2: status word (e.g. "proposed", "accepted", "rejected", "pending")
 *
 * Used by accept-reject.ts for updating footnote status fields.
 *
 * Non-global.
 */
export const FOOTNOTE_DEF_STATUS = new RegExp(
  `^\\[\\^(${FOOTNOTE_ID_PATTERN})\\]:\\s+(?:@\\S+\\s+\\|\\s+)?\\S+\\s+\\|\\s+\\S+\\s+\\|\\s+(\\S+)`
);

/**
 * Footnote definition that captures only the status field value.
 * Uses `\s` (allowing both zero and more whitespace around the last pipe).
 *
 * Captures:
 *   1: status value — one of "proposed", "accepted", "rejected"
 *
 * Used by hashline-tracked.ts countChanges for tallying change statuses.
 *
 * Non-global.
 */
export const FOOTNOTE_DEF_STATUS_VALUE = new RegExp(
  `^\\[\\^${FOOTNOTE_ID_PATTERN}\\]:\\s.*\\|\\s*(proposed|accepted|rejected)`
);

// ─── L3 format detection ────────────────────────────────────────────────────

/**
 * Matches an L3 edit-op body line inside a footnote definition.
 * Format: 4-space indent, LINE:HASH, space, then CriticMarkup op.
 * Example: `    5:a3 {++inserted text++}`
 *
 * Captures:
 *   1: line number (e.g. "5")
 *   2: hash (e.g. "a3")
 *   3: edit-op string (e.g. "{++inserted text++}")
 *
 * Non-global.
 */
export const FOOTNOTE_L3_EDIT_OP = /^ {4}(\d+):([0-9a-fA-F]{2,}) (.*)/;

/**
 * Auto-detect whether text is in L3 (footnote-native) format.
 *
 * L3 format has:
 * 1. At least one `[^ct-N]:` footnote definition
 * 2. No inline CriticMarkup delimiters in the body (before footnotes)
 * 3. At least one footnote body line with LINE:HASH {edit-op} format
 *
 * This is the single source of truth for L3 detection. Used by
 * Workspace.isFootnoteNative() and standalone functions like
 * computeSettledText() that need format detection without a Workspace.
 */
export function isL3Format(text: string): boolean {
  // Find the first footnote definition that is NOT inside a code zone.
  // text.search() would match inside code fences — use exec() loop with zone check.
  const zones = findCodeZones(text);
  const defRe = new RegExp(FOOTNOTE_DEF_START.source, 'gm');
  let defMatch: RegExpExecArray | null;
  let firstFootnote = -1;
  while ((defMatch = defRe.exec(text)) !== null) {
    if (!zones.some(z => defMatch!.index >= z.start && defMatch!.index < z.end)) {
      firstFootnote = defMatch.index;
      break;
    }
  }
  if (firstFootnote < 0) return false;
  const body = text.slice(0, firstFootnote);

  // Check for inline CriticMarkup in body, respecting code zones.
  // Delimiters inside code fences or inline code spans (e.g. `{++text++}`)
  // are documentation examples, not actual markup.
  // Reuse the zones computed on the full text — body is text[0..firstFootnote],
  // so match indices in body equal text offsets.
  const cmRe = /\{\+\+|\{--|\{~~|\{==|\{>>/g;
  if (cmRe.test(body)) {
    // Body has potential CriticMarkup — check if any are outside code zones
    cmRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = cmRe.exec(body)) !== null) {
      if (!zones.some(z => m!.index >= z.start && m!.index < z.end)) {
        return false; // real inline CriticMarkup outside code zones
      }
    }
  }

  // Check footnote section for at least one LINE:HASH {op} body line
  const footnoteSection = text.slice(firstFootnote);
  return footnoteSection.split('\n').some(line => FOOTNOTE_L3_EDIT_OP.test(line));
}

// ─── @ctx: deletion context escaping ────────────────────────────────────────

/** Regex for @ctx:"before"||"after" with escaped-aware quoting */
export const CTX_RE = /@ctx:"((?:[^"\\]|\\.)*)"\|\|"((?:[^"\\]|\\.)*)"/;

/** Escape a string for use inside @ctx:"..." quoting (\ and " are escaped) */
export function escapeCtxString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Unescape a string from @ctx:"..." quoting */
export function unescapeCtxString(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// ─── Body / footnote splitting ──────────────────────────────────────────────

/**
 * Split a document's lines into body and footnote sections.
 *
 * Finds the first footnote definition line (`[^ct-N]:`), trims trailing
 * blank lines from the body, and returns both sections as line arrays.
 * If no footnotes exist, all lines go to body (with trailing blanks trimmed).
 *
 * This is the single source of truth for body/footnote separation.
 * Used by the parser, conversion functions, and settlement functions.
 */
export function splitBodyAndFootnotes(lines: string[]): {
  bodyLines: string[];
  footnoteLines: string[];
  bodyEndIndex: number;
} {
  // Compute code zones so we skip footnote-like patterns inside code fences.
  // Same pattern as stripFootnoteDefinitions() in settled-text.ts.
  const text = lines.join('\n');
  const zones = findCodeZones(text);

  let firstFootnoteLine = lines.length;
  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const inCodeZone = zones.some(z => charOffset >= z.start && charOffset < z.end);
    if (!inCodeZone && FOOTNOTE_DEF_START.test(lines[i])) {
      firstFootnoteLine = i;
      break;
    }
    charOffset += lines[i].length + 1; // +1 for newline
  }
  // Trim trailing blank lines before footnote block
  let bodyEnd = firstFootnoteLine;
  while (bodyEnd > 0 && lines[bodyEnd - 1].trim() === '') {
    bodyEnd--;
  }
  return {
    bodyLines: lines.slice(0, bodyEnd),
    footnoteLines: lines.slice(firstFootnoteLine),
    bodyEndIndex: bodyEnd,
  };
}

// ─── Continuation line pattern ──────────────────────────────────────────────

/**
 * Matches an indented continuation line (starts with whitespace then non-whitespace).
 * Used by footnote-parser, committed-text, and file-ops to detect multi-line
 * footnote definitions.
 *
 * Non-global.
 */
export const FOOTNOTE_CONTINUATION = /^\s+\S/;

// ─── Thread reply pattern ───────────────────────────────────────────────────

/**
 * Matches a discussion reply line inside a footnote body.
 * Format: indented, starts with `@author date:`.
 * e.g. `    @bob 2026-02-17: I think this is correct`
 *
 * Used by footnote-parser.ts and compact.ts for thread detection.
 *
 * Non-global.
 */
export const FOOTNOTE_THREAD_REPLY = /^\s+@\S+\s+\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?Z?)?:/;
