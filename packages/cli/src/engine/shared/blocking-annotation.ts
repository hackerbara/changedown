import { findFootnoteBlock, findReviewInsertionIndex } from '@changedown/core';

/**
 * Post-processes review content to add [label] suffix and/or blocked: line
 * after a request-changes review line. Returns updated content string.
 */
export function applyBlockingAnnotation(
  content: string,
  changeId: string,
  author: string,
  label: string | undefined,
  shouldBlock: boolean,
): string {
  const lines = content.split('\n');
  const block = findFootnoteBlock(lines, changeId);
  if (!block) return content;

  const insertIdx = findReviewInsertionIndex(lines, block.headerLine, block.blockEnd);
  if (label && insertIdx >= block.headerLine) {
    const rcLine = lines[insertIdx];
    if (rcLine.trimStart().startsWith('request-changes:')) {
      lines[insertIdx] = rcLine + ` [${label}]`;
    }
  }
  if (shouldBlock) {
    lines.splice(insertIdx + 1, 0, `    blocked: @${author}`);
  }
  return lines.join('\n');
}
