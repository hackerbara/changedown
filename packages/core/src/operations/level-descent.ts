/**
 * Level descent (compaction): L2 → L1 (footnote to adjacent comment), L1 → L0 (remove adjacent comment).
 */
import { CriticMarkupParser } from '../parser/parser.js';

/**
 * Finds the footnote definition block for changeId (header line + indented body) and returns
 * the header fields plus the range [start, end] of the block in text.
 */
function findFootnoteBlock(
  text: string,
  changeId: string,
): { author: string; date: string; type: string; status: string; start: number; end: number } | null {
  const idPattern = changeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const defLineRe = new RegExp(`^\\[\\^${idPattern}\\]:\\s+(?:(@\\S+)\\s+\\|\\s+)?(\\S+)\\s+\\|\\s+(\\S+)\\s+\\|\\s+(\\S+)`);
  const lines = text.split(/\r?\n/);
  let lineStartOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(defLineRe);
    if (match) {
      const author = match[1] ?? '';
      const date = match[2];
      const type = match[3];
      const status = match[4];
      let endLineIndex = i + 1;
      while (endLineIndex < lines.length && /^[\t ]/.test(lines[endLineIndex])) {
        endLineIndex++;
      }
      let blockEndOffset = lineStartOffset + line.length;
      for (let j = i + 1; j < endLineIndex; j++) {
        blockEndOffset += lines[j].length + 1;
      }
      return { author, date, type, status, start: lineStartOffset, end: blockEndOffset };
    }
    lineStartOffset += line.length + 1;
  }
  return null;
}

/**
 * Compacts the change with the given footnote id from Level 2 to Level 1:
 * removes the footnote ref and definition, inserts an adjacent comment with the header fields.
 */
export function compactToLevel1(text: string, changeId: string): string {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  const change = changes.find((c) => c.id === changeId);
  if (!change) return text;
  const refStr = `[^${changeId}]`;
  const refIndex = text.indexOf(refStr, change.range.start);
  if (refIndex === -1) return text;
  const block = findFootnoteBlock(text, changeId);
  if (!block) return text;
  const authorPart = block.author ? `${block.author}|` : '';
  const comment = `{>>${authorPart}${block.date}|${block.type}|${block.status}<<}`;

  // Safety guard: check if there is non-whitespace content between ref and footnote block.
  // The old code did `beforeRef + comment + afterBlock` which discards everything in between.
  const refEnd = refIndex + refStr.length;
  const textBetween = text.slice(refEnd, block.start);
  if (textBetween.trim().length > 0) {
    // Content exists between ref and footnote — handle separately to preserve it.
    // Remove footnote block first (comes later in text, so offsets stay valid).
    let result = text.slice(0, block.start) + text.slice(block.end);
    // Then replace the ref with the inline comment.
    result = result.slice(0, refIndex) + comment + result.slice(refIndex + refStr.length);
    return result;
  }

  // No content between ref and footnote — safe to concatenate directly
  const beforeRef = text.slice(0, refIndex);
  const afterBlock = text.slice(block.end);
  return beforeRef + comment + afterBlock;
}

/**
 * Compacts the change at changeIndex from Level 1 to Level 0 by removing its adjacent comment.
 */
export function compactToLevel0(text: string, changeIndex: number): string {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(text);
  const changes = doc.getChanges();
  if (changeIndex < 0 || changeIndex >= changes.length) return text;
  const change = changes[changeIndex];
  if (change.level !== 1) return text;
  const commentOpen = text.indexOf('{>>', change.range.start);
  if (commentOpen === -1) return text;
  return text.slice(0, commentOpen) + text.slice(change.range.end);
}
