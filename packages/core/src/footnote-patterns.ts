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
