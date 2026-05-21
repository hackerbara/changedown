/**
 * Parses CriticMarkup-native operator strings into structured operations.
 *
 * Grammar:
 * - Insertion:     `{++text++}` or `{++text++}{>>reasoning`
 * - Deletion:      `{--text--}` or `{--text--}{>>reasoning`
 * - Substitution:  `{~~old~>new~~}` or `{~~old~>new~~}{>>reasoning`
 * - Range context: `{~~~\nopening\n...\nclosing\n~>\nreplacement\n~~}`
 * - Highlight:     `{==text==}` or `{==text==}{>>reasoning`
 * - Comment:       `{>>reasoning` or `{>>reasoning<<}`
 *
 * Reasoning is split on the rightmost `{>>` that is NOT part of a CriticMarkup
 * comment (i.e., does not have a matching `<<}` after it). Bare `>>` in content
 * is inert and not treated as a separator.
 */

export interface RangeContext {
  opening: string;
  closing: string;
}

export interface ParsedOp {
  type: 'ins' | 'del' | 'sub' | 'highlight' | 'comment';
  oldText: string;
  newText: string;
  reasoning: string | undefined;
  rangeContext?: RangeContext;
}

/**
 * Split on the rightmost `{>>` to separate edit from reasoning.
 *
 * Structural disambiguation rules:
 * - `{>>` followed by `<<}` with MORE CONTENT after `<<}` → CriticMarkup comment
 *   in content, not reasoning. (e.g., `{++text {>>comment<<} more text++}`)
 * - `{>>` followed by `<<}` at END OF STRING → agent closed reasoning out of habit;
 *   strip `<<}` and extract reasoning. (e.g., `{++text++}{>>reason<<}`)
 * - `{>>` with no `<<}` after it → pure reasoning. (e.g., `{++text++}{>>reason`)
 *
 * Returns [editPart, reasoning] or [fullOp, undefined] if no separator found.
 */
function splitReasoning(op: string): [string, string | undefined] {
  const idx = op.lastIndexOf('{>>');
  if (idx <= 0) return [op, undefined];

  const afterOpen = op.slice(idx + 3);
  const closeIdx = afterOpen.indexOf('<<}');

  if (closeIdx !== -1) {
    // There's a <<} after the {>>. Distinguish content vs terminal reasoning.
    const afterClose = afterOpen.slice(closeIdx + 3).trim();
    if (afterClose.length > 0) {
      // Content exists after <<} — genuine CriticMarkup comment in content
      return [op, undefined];
    }
    // <<} at end of string — agent closed reasoning by habit; forgive and extract
    const reasoning = afterOpen.slice(0, closeIdx).trimStart();
    const editPart = op.slice(0, idx).trimEnd();
    if (reasoning === '') return [op, undefined];
    return [editPart, reasoning];
  }

  // No <<} — pure reasoning separator
  const editPart = op.slice(0, idx).trimEnd();
  const reasoning = afterOpen.trimStart();
  if (reasoning === '') return [op, undefined];

  return [editPart, reasoning];
}

/**
 * Extract content between an opener and closer delimiter.
 * Uses lastIndexOf for the closer so that content containing the closer
 * pattern is handled correctly (outermost closer wins).
 *
 * Returns the content between delimiters, or null if delimiters are not found.
 */
function extractBetween(text: string, opener: string, closer: string): string | null {
  if (!text.startsWith(opener)) return null;
  const closerIdx = text.lastIndexOf(closer);
  if (closerIdx < opener.length) return null;
  return text.slice(opener.length, closerIdx);
}

function parseRangeContextReplacement(editPart: string): { rangeContext: RangeContext; newText: string } | null {
  // Legacy coordinate-only range replacement is `{~~~>new~~}`. Only the
  // context-bearing form starts with `{~~~` followed by a newline; all other
  // `{~~~...` shapes fall through to the normal substitution parser.
  if (!editPart.startsWith('{~~~\n')) return null;

  const lines = editPart.split('\n');
  if (lines[0] !== '{~~~' || lines[lines.length - 1] !== '~~}') {
    throw new Error('Context-bearing range replacement must start with a line exactly "{~~~" and end with a line exactly "~~}".');
  }

  const ellipsisIndices = lines
    .map((line, index) => line === '...' ? index : -1)
    .filter(index => index !== -1);
  if (ellipsisIndices.length !== 1) {
    throw new Error('Context-bearing range replacement requires exactly one standalone ... endpoint separator line.');
  }
  const ellipsisIndex = ellipsisIndices[0]!;

  const arrowIndex = lines.findIndex((line, index) => index > ellipsisIndex && line === '~>');
  if (arrowIndex === -1) {
    throw new Error('Context-bearing range replacement requires a standalone ~> separator line.');
  }

  const opening = lines.slice(1, ellipsisIndex).join('\n');
  const closing = lines.slice(ellipsisIndex + 1, arrowIndex).join('\n');
  const newText = lines.slice(arrowIndex + 1, -1).join('\n');
  if (opening.trim() === '' || closing.trim() === '') {
    throw new Error('Context-bearing range replacement requires non-empty opening and closing anchors.');
  }

  return { rangeContext: { opening, closing }, newText };
}

export function parseOp(op: string): ParsedOp {
  if (op === '') {
    throw new Error('Op string is empty — nothing to parse.');
  }

  // Comment-only op: starts with `{>>`. Produces oldText="" and newText=""
  // because comments annotate existing content without modifying it.
  // The closing `<<}` is optional (forgiven).
  if (op.startsWith('{>>')) {
    let reasoning = op.slice(3);
    // Strip terminal <<} if present
    if (reasoning.endsWith('<<}')) {
      reasoning = reasoning.slice(0, -3);
    }
    return {
      type: 'comment',
      oldText: '',
      newText: '',
      reasoning,
    };
  }

  // Split reasoning FIRST -- uniform for all op types.
  const [withoutReasoning, reasoning] = splitReasoning(op);

  const rangeReplacement = parseRangeContextReplacement(withoutReasoning);
  if (rangeReplacement) {
    return {
      type: 'sub',
      oldText: '',
      newText: rangeReplacement.newText,
      reasoning,
      rangeContext: rangeReplacement.rangeContext,
    };
  }

  // Insertion: {++text++}
  const insContent = extractBetween(withoutReasoning, '{++', '++}');
  if (insContent !== null) {
    return {
      type: 'ins',
      oldText: '',
      newText: insContent,
      reasoning,
    };
  }

  // Deletion: {--text--}
  const delContent = extractBetween(withoutReasoning, '{--', '--}');
  if (delContent !== null) {
    return {
      type: 'del',
      oldText: delContent,
      newText: '',
      reasoning,
    };
  }

  // Substitution: {~~old~>new~~}
  const subContent = extractBetween(withoutReasoning, '{~~', '~~}');
  if (subContent !== null) {
    const arrowIdx = subContent.indexOf('~>');
    if (arrowIdx === -1) {
      throw new Error(
        `Cannot parse op: "${op}". Substitution {~~...~~} requires ~> separator between old and new text.`
      );
    }
    const oldText = subContent.slice(0, arrowIdx);
    const newText = subContent.slice(arrowIdx + 2);
    return {
      type: 'sub',
      oldText,
      newText,
      reasoning,
    };
  }

  // Highlight: {==text==}
  const hlContent = extractBetween(withoutReasoning, '{==', '==}');
  if (hlContent !== null) {
    return {
      type: 'highlight',
      oldText: hlContent,
      newText: '',
      reasoning,
    };
  }

  throw new Error(
    `Cannot parse op: "${op}". Expected CriticMarkup syntax: {++text++} (ins), {--text--} (del), {~~old~>new~~} (sub), {==text==} (highlight), {>>comment.`
  );
}
