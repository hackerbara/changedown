/**
 * Folding Range Capability
 *
 * Provides fold ranges for:
 * 1. L3 footnote sections (Level 1: whole section, Level 2: edit-op lines)
 * 2. Multi-line deletion hiding in changes mode (cursor-aware)
 */

import { FoldingRange, FoldingRangeKind } from 'vscode-languageserver';
import {
  ChangeNode, ChangeType,
  findFootnoteBlockStart, FOOTNOTE_L3_EDIT_OP, FOOTNOTE_DEF_START,
} from '@changedown/core';
import type { ViewName } from '@changedown/core';
import type { CursorState } from './code-lens';

/**
 * Compute auto-fold hint lines for an L3 document.
 * Returns edit-op lines (Level 2) first, then section start (Level 1).
 * Order matters: inner folds must be established before outer collapses them.
 *
 * Returns undefined if no L3 footnote section is found.
 */
export function computeAutoFoldLines(text: string): number[] | undefined {
  const lines = text.split('\n');
  const blockStart = findFootnoteBlockStart(lines);
  if (blockStart >= lines.length) return undefined;

  const sectionLine = (blockStart > 0 && lines[blockStart - 1].trim() === '')
    ? blockStart - 1
    : blockStart;

  const editOpLines: number[] = [];
  for (let i = blockStart; i < lines.length; i++) {
    if (FOOTNOTE_L3_EDIT_OP.test(lines[i])) {
      editOpLines.push(i);
    }
  }

  // Level 2 first, then Level 1
  return [...editOpLines, sectionLine];
}

/**
 * Create folding ranges for a document.
 *
 * @param changes Parsed ChangeNode[] (for deletion folds)
 * @param text Full document text
 * @param viewMode Current view mode
 * @param cursorState Cursor position (for cursor-aware deletion exclusion)
 * @returns Array of FoldingRange objects
 */
export function createFoldingRanges(
  changes: ChangeNode[],
  text: string,
  viewMode: ViewName | undefined,
  cursorState: CursorState | null,
): FoldingRange[] {
  const ranges: FoldingRange[] = [];
  const lines = text.split('\n');

  // ── Deletion folds (changes mode only) ──────────────────────────
  if (viewMode === 'changes') {
    for (const change of changes) {
      if (change.type !== ChangeType.Deletion) continue;
      if (change.settled) continue;

      const startLine = offsetToLine(text, change.range.start);
      const endLine = offsetToLine(text, change.range.end);

      if (endLine <= startLine) continue;
      if (cursorState && cursorState.line >= startLine && cursorState.line <= endLine) continue;

      ranges.push(FoldingRange.create(startLine, endLine, undefined, undefined, FoldingRangeKind.Region));
    }
  }

  // ── L3 footnote folds (review + changes modes) ─────────────────
  if (viewMode === 'review' || viewMode === 'changes') {
    const blockStart = findFootnoteBlockStart(lines);
    if (blockStart < lines.length) {
      // Level 1: fold entire footnote section
      const sectionStart = (blockStart > 0 && lines[blockStart - 1].trim() === '')
        ? blockStart - 1
        : blockStart;
      const sectionEnd = lines.length - 1;
      if (sectionEnd > sectionStart) {
        ranges.push(FoldingRange.create(sectionStart, sectionEnd, undefined, undefined, FoldingRangeKind.Region));
      }

      // Level 2: fold edit-op continuation lines within each footnote
      let currentFootnoteHeaderLine = -1;
      let editOpStartLine = -1;
      let lastContinuationLine = -1;

      for (let i = blockStart; i < lines.length; i++) {
        const line = lines[i];
        const isHeader = FOOTNOTE_DEF_START.test(line);

        if (isHeader) {
          if (editOpStartLine >= 0 && lastContinuationLine > editOpStartLine) {
            ranges.push(FoldingRange.create(editOpStartLine, lastContinuationLine, undefined, undefined, FoldingRangeKind.Region));
          }
          currentFootnoteHeaderLine = i;
          editOpStartLine = -1;
          lastContinuationLine = -1;
        } else if (currentFootnoteHeaderLine >= 0) {
          if (FOOTNOTE_L3_EDIT_OP.test(line)) {
            editOpStartLine = i;
            lastContinuationLine = i;
          } else if (editOpStartLine >= 0 && line.startsWith('    ')) {
            lastContinuationLine = i;
          }
        }
      }
      if (editOpStartLine >= 0 && lastContinuationLine > editOpStartLine) {
        ranges.push(FoldingRange.create(editOpStartLine, lastContinuationLine, undefined, undefined, FoldingRangeKind.Region));
      }
    }
  }

  return ranges;
}

/** Convert a character offset to a zero-based line number. */
function offsetToLine(text: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}
