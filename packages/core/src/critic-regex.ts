/**
 * Shared CriticMarkup regex patterns.
 *
 * Two regex families exist for different use cases:
 *
 * 1. **Single-line** (character-class negation): used by `hashline-tracked.ts`
 *    for fast per-line stripping. These use `[^X]|X(?!Y)` to avoid matching
 *    across closing delimiters. They do NOT match across newlines.
 *
 * 2. **Multi-line** (lazy `[\s\S]*?`): used by `committed-text.ts` for
 *    document-level processing where CriticMarkup spans lines. These include
 *    optional footnote reference capture groups `(\[\^(ct-\d+(?:\.\d+)?)\])?`.
 *
 * Both families match the same 5 CriticMarkup types:
 *   - Insertion:    {++text++}
 *   - Deletion:     {--text--}
 *   - Substitution: {~~old~>new~~}
 *   - Highlight:    {==text==}
 *   - Comment:      {>>text<<}
 *
 * IMPORTANT: All regex constants with the /g flag are defined as getter functions
 * that return fresh RegExp instances, because /g regexes have mutable lastIndex
 * state. Callers get a new regex each time, preventing cross-call contamination.
 */

// ─── Single-line family (hashline-tracked) ──────────────────────────────────
// Uses character-class negation to avoid matching across closing delimiters.
// Suitable for per-line processing where content does not span newlines.

/** Substitution: {~~old~>new~~} -> captures new text in $1 */
export function singleLineSubstitution(): RegExp {
  return /\{~~(?:[^~]|~(?!>))*~>((?:[^~]|~(?!~\}))*?)~~\}/g;
}

/** Deletion: {--text--} -> no capture (entire match removed) */
export function singleLineDeletion(): RegExp {
  return /\{--(?:[^-]|-(?!-\}))*--\}/g;
}

/** Insertion: {++text++} -> captures content in $1 */
export function singleLineInsertion(): RegExp {
  return /\{\+\+((?:[^+]|\+(?!\+\}))*?)\+\+\}/g;
}

/** Highlight: {==text==} -> captures content in $1 */
export function singleLineHighlight(): RegExp {
  return /\{==((?:[^=]|=(?!=\}))*?)==\}/g;
}

/** Comment: {>>text<<} -> captures content in $1 */
export function singleLineComment(): RegExp {
  return /\{>>((?:[^<]|<(?!<\}))*?)<<\}/g;
}

// ─── Multi-line family (committed-text) ─────────────────────────────────────
// Uses lazy [\s\S]*? to match content that spans newlines.
// Includes optional footnote reference capture groups for status-aware processing.
//
// Capture groups for types with footnote refs:
//   Substitution: $1=old, $2=new, $3=full ref or undefined, $4=ref ID or undefined
//   Insertion:    $1=content, $2=full ref or undefined, $3=ref ID or undefined
//   Deletion:     $1=content, $2=full ref or undefined, $3=ref ID or undefined
//   Highlight:    $1=content, $2=full ref or undefined, $3=ref ID or undefined
//   Comment:      $1=content (no footnote ref capture)

/** Substitution: {~~old~>new~~} with optional footnote ref */
export function multiLineSubstitution(): RegExp {
  return /\{~~([\s\S]*?)~>([\s\S]*?)~~\}(\[\^(ct-\d+(?:\.\d+)?)\])?/g;
}

/** Insertion: {++text++} with optional footnote ref */
export function multiLineInsertion(): RegExp {
  return /\{\+\+([\s\S]*?)\+\+\}(\[\^(ct-\d+(?:\.\d+)?)\])?/g;
}

/** Deletion: {--text--} with optional footnote ref */
export function multiLineDeletion(): RegExp {
  return /\{--([\s\S]*?)--\}(\[\^(ct-\d+(?:\.\d+)?)\])?/g;
}

/** Highlight: {==text==} with optional footnote ref */
export function multiLineHighlight(): RegExp {
  return /\{==([\s\S]*?)==\}(\[\^(ct-\d+(?:\.\d+)?)\])?/g;
}

/** Comment: {>>text<<} -> captures content in $1 (no footnote ref) */
export function multiLineComment(): RegExp {
  return /\{>>([\s\S]*?)<<\}/g;
}

// ─── Shared utility patterns ────────────────────────────────────────────────

/**
 * Quick-check: does a line contain CriticMarkup delimiters or footnote refs?
 * Non-global, used with .test() for fast boolean detection.
 */
export const HAS_CRITIC_MARKUP = /\{\+\+|\{--|\{~~|\{==|\{>>|\[\^ct-\d/;

/**
 * Returns true if the given line contains any CriticMarkup opening delimiter
 * or footnote reference. Wrapper around HAS_CRITIC_MARKUP.test().
 */
export function hasCriticMarkup(line: string): boolean {
  return HAS_CRITIC_MARKUP.test(line);
}

/**
 * Matches any inline CriticMarkup change (all 5 types).
 * Uses [^]*? (equivalent to [\s\S]*?) for multi-line matching.
 * Used for counting total markup instances in a document.
 */
export function inlineMarkupAll(): RegExp {
  return /\{\+\+[^]*?\+\+\}|\{--[^]*?--\}|\{~~[^]*?~~\}|\{==[^]*?==\}|\{>>[^]*?<<\}/g;
}

/**
 * Matches a CriticMarkup closing delimiter immediately followed by a footnote ref.
 * Used to count markup instances that have associated footnote references.
 */
export function markupWithRef(): RegExp {
  return /(?:\+\+\}|-{2}\}|~~\}|==\}|<<\})\[\^ct-\d+(?:\.\d+)?\]/g;
}
