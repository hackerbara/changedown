/**
 * Sidecar accept/reject operations for code files annotated with cn-N tags.
 *
 * Handles:
 * - Accept insertion: strip sc tag from code line, keep code
 * - Accept deletion: remove entire deletion marker line
 * - Accept substitution: strip tag from new lines + remove old (deletion marker) lines
 * - Reject insertion: remove entire tagged line
 * - Reject deletion: uncomment the deletion line, restoring original code
 * - Reject substitution: restore old lines (uncomment deletions) + remove new lines
 *
 * Also cleans up the sidecar block: removes resolved entries, and removes the
 * entire block if all entries are resolved.
 *
 * Grouped changes (dotted IDs): when accepting/rejecting a parent tag (e.g. cn-1),
 * all children (cn-1.1, cn-1.2, etc.) are resolved together.
 */

import { TextEdit, ChangeNode } from '../model/types.js';
import { getCommentSyntax, stripLineComment, CommentSyntax, escapeRegex, lineOffset } from '../comment-syntax.js';
import { SIDECAR_BLOCK_MARKER, findSidecarBlockStart as findSidecarStart } from '../constants.js';

/**
 * Strips the `  # cn-N` or `  // cn-N` tag suffix from a raw line string.
 */
function stripTag(line: string, syntax: { line: string }): string {
  const escaped = escapeRegex(syntax.line);
  const pattern = new RegExp(`  ${escaped} cn-\\d+(?:\\.\\d+)?$`);
  return line.replace(pattern, '');
}

/**
 * Tests whether a tag matches the requested tag or is a child of it.
 *
 * - If `requestedTag` has no dot (e.g. `cn-1`), matches `cn-1` and any `cn-1.N`.
 * - If `requestedTag` has a dot (e.g. `cn-1.2`), matches only `cn-1.2` exactly.
 */
function tagMatches(lineTag: string, requestedTag: string): boolean {
  if (lineTag === requestedTag) {
    return true;
  }
  // If the requested tag is a parent (no dot), also match children
  if (!requestedTag.includes('.') && lineTag.startsWith(requestedTag + '.')) {
    return true;
  }
  return false;
}

/**
 * Finds the start of the sidecar block in the lines array.
 * Delegates to the shared utility in constants.ts.
 */
function findSidecarBlockStart(lines: string[], syntax: CommentSyntax): number {
  return findSidecarStart(lines, syntax.line);
}

/**
 * Finds the end of the sidecar block (closing delimiter line index).
 * Returns -1 if not found.
 */
function findSidecarBlockEnd(lines: string[], startIndex: number, syntax: CommentSyntax): number {
  const escaped = escapeRegex(syntax.line);
  const closePattern = new RegExp(`^${escaped}\\s+-{3,}`);
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (closePattern.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Computes TextEdits to remove sidecar block entries for a given tag
 * (including children for parent tags). If all entries are removed,
 * removes the entire sidecar block and the blank line before it.
 */
function computeSidecarBlockEdits(
  lines: string[],
  tag: string,
  syntax: CommentSyntax
): TextEdit[] {
  const edits: TextEdit[] = [];
  const sidecarStart = findSidecarBlockStart(lines, syntax);
  if (sidecarStart < 0) {
    return edits;
  }

  const sidecarEnd = findSidecarBlockEnd(lines, sidecarStart, syntax);
  if (sidecarEnd < 0) {
    return edits;
  }

  const escaped = escapeRegex(syntax.line);
  // Pattern for footnote entry: `COMMENT [^cn-N]: TYPE | STATUS`
  const entryPattern = new RegExp(
    `^${escaped}\\s+\\[\\^(cn-\\d+(?:\\.\\d+)?)\\]:`
  );
  // Pattern for field lines (belonging to an entry): `COMMENT     key: value`
  const fieldPattern = new RegExp(`^${escaped}\\s{4,}\\w+:\\s+`);

  // Identify which lines in the sidecar block belong to entries we're removing
  // and which belong to entries we're keeping
  const linesToRemove: number[] = [];
  let totalEntryCount = 0;
  let removedEntryCount = 0;
  let currentEntryMatches = false;

  for (let i = sidecarStart + 1; i < sidecarEnd; i++) {
    const entryMatch = lines[i].match(entryPattern);
    if (entryMatch) {
      totalEntryCount++;
      const entryTag = entryMatch[1];
      currentEntryMatches = tagMatches(entryTag, tag);
      if (currentEntryMatches) {
        removedEntryCount++;
        linesToRemove.push(i);
      }
    } else if (fieldPattern.test(lines[i]) && currentEntryMatches) {
      // This field line belongs to an entry we're removing
      linesToRemove.push(i);
    }
  }

  if (removedEntryCount === totalEntryCount) {
    // Remove the entire sidecar block (including blank line before it if present)
    let blockStart = sidecarStart;
    // Check for blank line before the sidecar block
    if (sidecarStart > 0 && lines[sidecarStart - 1] === '') {
      blockStart = sidecarStart - 1;
    }

    const startOffset = lineOffset(lines, blockStart);
    // Include up to end of sidecar block closing line + its newline
    let endOffset: number;
    // Check if there's a trailing newline after the closing delimiter
    if (sidecarEnd + 1 < lines.length && lines[sidecarEnd + 1] === '') {
      // Include the trailing blank line too
      endOffset = lineOffset(lines, sidecarEnd + 1) + lines[sidecarEnd + 1].length + 1;
    } else {
      endOffset = lineOffset(lines, sidecarEnd) + lines[sidecarEnd].length + 1;
    }

    edits.push({
      offset: startOffset,
      length: endOffset - startOffset,
      newText: '',
    });
  } else {
    // Remove only the specific entry lines (in reverse to preserve offsets)
    for (let i = linesToRemove.length - 1; i >= 0; i--) {
      const idx = linesToRemove[i];
      const start = lineOffset(lines, idx);
      const length = lines[idx].length + 1; // +1 for newline
      edits.push({
        offset: start,
        length,
        newText: '',
      });
    }
  }

  return edits;
}

/**
 * Computes TextEdits to accept a sidecar-annotated change.
 *
 * - Accept insertion: strip the cn-N tag suffix, keep the code
 * - Accept deletion: remove the entire deletion marker line (including newline)
 * - Accept substitution: strip tag from new (insertion) lines + remove old (deletion) lines
 *
 * Also removes the sidecar block entry for the resolved tag.
 *
 * @param text The full file text
 * @param tag The cn-N tag to accept (e.g. "cn-1")
 * @param languageId VS Code language ID (e.g. "python", "typescript")
 * @returns TextEdit[] to apply (empty array if language unsupported or tag not found)
 */
export function computeSidecarAccept(text: string, tag: string, languageId: string): TextEdit[] {
  const syntax = getCommentSyntax(languageId);
  if (!syntax) {
    return [];
  }

  const lines = text.split('\n');
  const sidecarStart = findSidecarBlockStart(lines, syntax);
  const codeLineEnd = sidecarStart >= 0 ? sidecarStart : lines.length;
  const edits: TextEdit[] = [];

  let foundAny = false;

  for (let i = 0; i < codeLineEnd; i++) {
    const stripped = stripLineComment(lines[i], syntax);
    if (!stripped || !tagMatches(stripped.tag, tag)) {
      continue;
    }

    foundAny = true;
    const start = lineOffset(lines, i);
    const lineLen = lines[i].length;

    if (stripped.isDeletion) {
      // Accept deletion: remove the entire line (including its newline)
      edits.push({
        offset: start,
        length: lineLen + 1, // +1 for the \n
        newText: '',
      });
    } else {
      // Accept insertion: strip the tag, keep the code
      const cleanLine = stripTag(lines[i], syntax);
      edits.push({
        offset: start,
        length: lineLen,
        newText: cleanLine,
      });
    }
  }

  if (!foundAny) {
    return [];
  }

  // Sidecar block cleanup
  const blockEdits = computeSidecarBlockEdits(lines, tag, syntax);
  edits.push(...blockEdits);

  return edits;
}

/**
 * Computes TextEdits to reject a sidecar-annotated change.
 *
 * - Reject insertion: remove the entire tagged line (including newline)
 * - Reject deletion: uncomment the deletion line — restore original code with indentation
 * - Reject substitution: restore old lines (uncomment deletions) + remove new (insertion) lines
 *
 * Also removes the sidecar block entry for the resolved tag.
 *
 * @param text The full file text
 * @param tag The cn-N tag to reject (e.g. "cn-1")
 * @param languageId VS Code language ID (e.g. "python", "typescript")
 * @returns TextEdit[] to apply (empty array if language unsupported or tag not found)
 */
export function computeSidecarReject(text: string, tag: string, languageId: string): TextEdit[] {
  const syntax = getCommentSyntax(languageId);
  if (!syntax) {
    return [];
  }

  const lines = text.split('\n');
  const sidecarStart = findSidecarBlockStart(lines, syntax);
  const codeLineEnd = sidecarStart >= 0 ? sidecarStart : lines.length;
  const edits: TextEdit[] = [];

  let foundAny = false;

  for (let i = 0; i < codeLineEnd; i++) {
    const stripped = stripLineComment(lines[i], syntax);
    if (!stripped || !tagMatches(stripped.tag, tag)) {
      continue;
    }

    foundAny = true;
    const start = lineOffset(lines, i);
    const lineLen = lines[i].length;

    if (stripped.isDeletion) {
      // Reject deletion: uncomment the line — restore `indent + code`
      const restoredLine = stripped.indent + stripped.code;
      edits.push({
        offset: start,
        length: lineLen,
        newText: restoredLine,
      });
    } else {
      // Reject insertion: remove the entire line (including its newline)
      edits.push({
        offset: start,
        length: lineLen + 1, // +1 for the \n
        newText: '',
      });
    }
  }

  if (!foundAny) {
    return [];
  }

  // Sidecar block cleanup
  const blockEdits = computeSidecarBlockEdits(lines, tag, syntax);
  edits.push(...blockEdits);

  return edits;
}

/**
 * Computes a single TextEdit to remove the entire sidecar block
 * (including any blank line before and after it).
 *
 * Returns an empty array if no sidecar block is found.
 */
function computeEntireSidecarBlockRemoval(
  lines: string[],
  syntax: CommentSyntax
): TextEdit[] {
  const sidecarStart = findSidecarBlockStart(lines, syntax);
  if (sidecarStart < 0) {
    return [];
  }

  const sidecarEnd = findSidecarBlockEnd(lines, sidecarStart, syntax);
  if (sidecarEnd < 0) {
    return [];
  }

  let blockStart = sidecarStart;
  if (sidecarStart > 0 && lines[sidecarStart - 1] === '') {
    blockStart = sidecarStart - 1;
  }

  const startOffset = lineOffset(lines, blockStart);
  let endOffset: number;
  if (sidecarEnd + 1 < lines.length && lines[sidecarEnd + 1] === '') {
    endOffset = lineOffset(lines, sidecarEnd + 1) + lines[sidecarEnd + 1].length + 1;
  } else {
    endOffset = lineOffset(lines, sidecarEnd) + lines[sidecarEnd].length + 1;
  }

  return [{
    offset: startOffset,
    length: endOffset - startOffset,
    newText: '',
  }];
}

/**
 * Computes TextEdits to accept or reject ALL sidecar-annotated changes atomically.
 *
 * Unlike calling computeSidecarAccept/computeSidecarReject per-change (which
 * produces overlapping sidecar block cleanup edits), this function:
 * 1. Processes all inline tagged lines in a single pass
 * 2. Adds a single edit to remove the entire sidecar block
 *
 * @param text The full file text
 * @param changes The ChangeNode[] to resolve (used for tag IDs)
 * @param languageId VS Code language ID
 * @param action 'accept' or 'reject'
 * @returns TextEdit[] with non-overlapping edits
 */
export function computeSidecarResolveAll(
  text: string,
  changes: ChangeNode[],
  languageId: string,
  action: 'accept' | 'reject'
): TextEdit[] {
  const syntax = getCommentSyntax(languageId);
  if (!syntax) {
    return [];
  }

  const lines = text.split('\n');
  const sidecarStart = findSidecarBlockStart(lines, syntax);
  const codeLineEnd = sidecarStart >= 0 ? sidecarStart : lines.length;
  const edits: TextEdit[] = [];

  // Build a set of all tags we need to resolve (including parent expansion)
  const tags = new Set<string>();
  for (const change of changes) {
    tags.add(change.id);
  }

  // Single pass over code lines -- process all tags at once
  for (let i = 0; i < codeLineEnd; i++) {
    const stripped = stripLineComment(lines[i], syntax);
    if (!stripped) {
      continue;
    }

    // Check if this line's tag matches any of our target tags
    let matched = false;
    for (const tag of tags) {
      if (tagMatches(stripped.tag, tag)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      continue;
    }

    const start = lineOffset(lines, i);
    const lineLen = lines[i].length;

    if (action === 'accept') {
      if (stripped.isDeletion) {
        edits.push({ offset: start, length: lineLen + 1, newText: '' });
      } else {
        const cleanLine = stripTag(lines[i], syntax);
        edits.push({ offset: start, length: lineLen, newText: cleanLine });
      }
    } else {
      // reject
      if (stripped.isDeletion) {
        const restoredLine = stripped.indent + stripped.code;
        edits.push({ offset: start, length: lineLen, newText: restoredLine });
      } else {
        edits.push({ offset: start, length: lineLen + 1, newText: '' });
      }
    }
  }

  if (edits.length === 0) {
    return [];
  }

  // Single sidecar block removal (all changes resolved -> block is empty)
  edits.push(...computeEntireSidecarBlockRemoval(lines, syntax));

  return edits;
}
