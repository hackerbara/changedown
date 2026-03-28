import { describe, it, expect } from 'vitest';
import { createFoldingRanges, computeAutoFoldLines } from '@changedown/lsp-server/internals';
import { ChangeNode, ChangeType, ChangeStatus } from '@changedown/core';
import type { FoldingRange } from '@changedown/lsp-server/internals';

describe('createFoldingRanges', () => {
  describe('deletion folds (changes mode)', () => {
    it('returns empty for no changes', () => {
      const result = createFoldingRanges([], 'hello\nworld', 'changes', null);
      expect(result).toEqual([]);
    });

    it('folds multi-line unsettled deletion', () => {
      // text: 'line1\n{--deleted\ntext--}\nline4'
      // offset 6 = '{' (line 1), offset 24 = '\n' after '}' (still line 2)
      const text = 'line1\n{--deleted\ntext--}\nline4';
      const changes: ChangeNode[] = [{
        id: 'c1', type: ChangeType.Deletion, status: ChangeStatus.Proposed,
        range: { start: 6, end: 24 }, contentRange: { start: 9, end: 21 },
        level: 0, anchored: false
      }];
      const result = createFoldingRanges(changes, text, 'changes', null);
      expect(result).toHaveLength(1);
      expect(result[0].startLine).toBe(1);
      expect(result[0].endLine).toBe(2);
    });

    it('skips single-line deletion', () => {
      const text = 'line1\n{--deleted--}\nline3';
      const changes: ChangeNode[] = [{
        id: 'c1', type: ChangeType.Deletion, status: ChangeStatus.Proposed,
        range: { start: 6, end: 19 }, contentRange: { start: 9, end: 17 },
        level: 0, anchored: false
      }];
      const result = createFoldingRanges(changes, text, 'changes', null);
      expect(result).toEqual([]);
    });

    it('skips settled deletion', () => {
      const text = 'line1\n{--deleted\ntext--}\nline4';
      const changes: ChangeNode[] = [{
        id: 'c1', type: ChangeType.Deletion, status: ChangeStatus.Proposed,
        range: { start: 6, end: 24 }, contentRange: { start: 9, end: 21 },
        level: 0, anchored: false, settled: true
      }];
      const result = createFoldingRanges(changes, text, 'changes', null);
      expect(result).toEqual([]);
    });

    it('excludes deletion containing cursor line', () => {
      const text = 'line1\n{--deleted\ntext--}\nline4';
      const changes: ChangeNode[] = [{
        id: 'c1', type: ChangeType.Deletion, status: ChangeStatus.Proposed,
        range: { start: 6, end: 24 }, contentRange: { start: 9, end: 21 },
        level: 0, anchored: false
      }];
      const cursor = { line: 2 };
      const result = createFoldingRanges(changes, text, 'changes', cursor);
      expect(result).toEqual([]);
    });

    it('returns empty in review mode (deletion folds are changes-only)', () => {
      const text = 'line1\n{--deleted\ntext--}\nline4';
      const changes: ChangeNode[] = [{
        id: 'c1', type: ChangeType.Deletion, status: ChangeStatus.Proposed,
        range: { start: 6, end: 24 }, contentRange: { start: 9, end: 21 },
        level: 0, anchored: false
      }];
      const result = createFoldingRanges(changes, text, 'review', null);
      expect(result).toEqual([]);
    });
  });

  describe('L3 footnote folds', () => {
    const l3Doc = [
      'Some body text',
      '',
      '[^cn-1]: author | date',
      '    3:ab {++inserted++}',
      '[^cn-2]: author | date',
      '    5:cd {--deleted--}',
      '    continuation line',
    ].join('\n');

    it('creates Level 1 section fold from blank line to end', () => {
      const result = createFoldingRanges([], l3Doc, 'review', null);
      const level1 = result.find(r => r.startLine === 1 && r.endLine === 6);
      expect(level1).toBeDefined();
    });

    it('creates Level 2 edit-op folds within each footnote', () => {
      const result = createFoldingRanges([], l3Doc, 'review', null);
      const level2 = result.find(r => r.startLine === 5 && r.endLine === 6);
      expect(level2).toBeDefined();
    });

    it('returns no L3 folds in settled mode', () => {
      const result = createFoldingRanges([], l3Doc, 'settled', null);
      expect(result).toEqual([]);
    });

    it('returns no L3 folds in raw mode', () => {
      const result = createFoldingRanges([], l3Doc, 'raw', null);
      expect(result).toEqual([]);
    });

    it('returns no L3 folds for non-L3 document', () => {
      const result = createFoldingRanges([], 'just plain text\nno footnotes', 'review', null);
      expect(result).toEqual([]);
    });

    it('returns L3 folds in changes mode', () => {
      const result = createFoldingRanges([], l3Doc, 'changes', null);
      // Level 1 section fold starting at the blank line (line 1)
      const level1 = result.find(r => r.startLine === 1 && r.endLine === 6);
      expect(level1).toBeDefined();
    });
  });
});

describe('computeAutoFoldLines', () => {
  it('returns undefined for non-L3 document', () => {
    const result = computeAutoFoldLines('just plain text\nno footnotes');
    expect(result).toBeUndefined();
  });

  it('returns edit-op lines first, then section start line, for an L3 document', () => {
    const l3Doc = [
      'Some body text',
      '',
      '[^cn-1]: author | date',
      '    3:ab {++inserted++}',
      '[^cn-2]: author | date',
      '    5:cd {--deleted--}',
      '    continuation line',
    ].join('\n');
    // blockStart=2 (first [^cn-N]:), sectionLine=1 (blank line before)
    // edit-op lines: 3 (    3:ab ...) and 5 (    5:cd ...)
    const result = computeAutoFoldLines(l3Doc);
    expect(result).toEqual([3, 5, 1]);
  });

  it('uses blank line before footnote section as section start', () => {
    const docWithBlank = [
      'Body text',
      '',
      '[^cn-1]: author | date',
      '    1:ab {++hello++}',
    ].join('\n');
    const result = computeAutoFoldLines(docWithBlank);
    // blockStart=2, blank at line 1 → sectionLine=1
    expect(result).toBeDefined();
    expect(result![result!.length - 1]).toBe(1);
  });

  it('uses footnote header line as section start when no blank line precedes it', () => {
    const docNoBlank = [
      'Body text',
      '[^cn-1]: author | date',
      '    1:ab {++hello++}',
    ].join('\n');
    const result = computeAutoFoldLines(docNoBlank);
    // blockStart=1, no blank before it → sectionLine=1
    expect(result).toBeDefined();
    expect(result![result!.length - 1]).toBe(1);
  });
});
