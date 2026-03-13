import { describe, it, expect } from 'vitest';
import { findEditPosition, findDeletionInsertionPoint } from 'changetracks-hooks/internals';

describe('findEditPosition', () => {
  const fileContent = 'The quick brown fox jumps over the lazy dog.';

  it('returns not-found for empty targetText', () => {
    const result = findEditPosition(fileContent, '');
    expect(result).toEqual({ start: -1, end: -1 });
  });

  // Strategy 1: contextBefore + targetText + contextAfter (most specific)
  describe('Strategy 1: full context (before + target + after)', () => {
    it('finds target using both context fields', () => {
      const result = findEditPosition(fileContent, 'fox', 'brown ', ' jumps');
      expect(result).toEqual({ start: 16, end: 19 });
    });

    it('disambiguates duplicate targets using full context', () => {
      const content = 'AAA BBB CCC BBB DDD';
      // Second "BBB" starts at index 12
      const result = findEditPosition(content, 'BBB', 'CCC ', ' DDD');
      expect(result).toEqual({ start: 12, end: 15 });
    });
  });

  // Strategy 2: contextBefore + targetText
  describe('Strategy 2: before + target', () => {
    it('finds target using contextBefore only', () => {
      const result = findEditPosition(fileContent, 'fox', 'brown ', undefined);
      expect(result).toEqual({ start: 16, end: 19 });
    });

    it('falls back to strategy 2 when strategy 1 fails', () => {
      // contextAfter does not match, but contextBefore + target does
      const result = findEditPosition(fileContent, 'fox', 'brown ', 'NONEXISTENT');
      expect(result).toEqual({ start: 16, end: 19 });
    });
  });

  // Strategy 3: targetText + contextAfter
  describe('Strategy 3: target + after', () => {
    it('finds target using contextAfter only', () => {
      const result = findEditPosition(fileContent, 'fox', undefined, ' jumps');
      expect(result).toEqual({ start: 16, end: 19 });
    });

    it('falls back to strategy 3 when strategies 1 and 2 fail', () => {
      // contextBefore does not match, but target + contextAfter does
      const result = findEditPosition(fileContent, 'fox', 'NONEXISTENT', ' jumps');
      expect(result).toEqual({ start: 16, end: 19 });
    });
  });

  // Strategy 4: bare indexOf (last resort)
  describe('Strategy 4: bare indexOf', () => {
    it('finds target with no context at all', () => {
      const result = findEditPosition(fileContent, 'fox');
      expect(result).toEqual({ start: 16, end: 19 });
    });

    it('finds target when both context fields are undefined', () => {
      const result = findEditPosition(fileContent, 'fox', undefined, undefined);
      expect(result).toEqual({ start: 16, end: 19 });
    });

    it('falls back to bare indexOf when all context strategies fail', () => {
      const result = findEditPosition(fileContent, 'fox', 'NOPE', 'NOPE');
      expect(result).toEqual({ start: 16, end: 19 });
    });
  });

  // Not found
  it('returns not-found when target does not exist in file', () => {
    const result = findEditPosition(fileContent, 'elephant');
    expect(result).toEqual({ start: -1, end: -1 });
  });

  it('returns not-found when target does not exist even with context', () => {
    const result = findEditPosition(fileContent, 'elephant', 'brown ', ' jumps');
    expect(result).toEqual({ start: -1, end: -1 });
  });

  // Unicode matching (NFKC only, no confusables)
  describe('unicode matching (NFKC only)', () => {
    it('does not match smart quotes against ASCII (no confusables)', () => {
      // File has straight quotes, search has smart quotes.
      // Without confusables, these are distinct characters.
      const content = 'He said "hello" to her.';
      // Smart double quotes: \u201C and \u201D
      const result = findEditPosition(content, '\u201Chello\u201D');
      expect(result).toEqual({ start: -1, end: -1 });
    });

    it('finds target with NBSP via NFKC normalization', () => {
      // NFKC normalizes NBSP (U+00A0) to regular SPACE (U+0020)
      // via compatibility decomposition, so normalizedIndexOf matches.
      const content = 'foo\u00A0bar baz';
      const result = findEditPosition(content, 'foo bar');
      expect(result.start).toBeGreaterThanOrEqual(0);
    });
  });

  // End position correctness
  it('returns correct end position for multi-char target', () => {
    const result = findEditPosition(fileContent, 'quick brown fox');
    expect(result).toEqual({ start: 4, end: 19 });
    expect(result.end - result.start).toBe('quick brown fox'.length);
  });
});

describe('findDeletionInsertionPoint', () => {
  const fileContent = 'The quick brown fox jumps over the lazy dog.';

  function makeEdit(overrides: {
    context_before?: string;
    context_after?: string;
  }) {
    return {
      file: '/test.md',
      old_text: 'removed',
      new_text: '',
      timestamp: '2026-01-01T00:00:00Z',
      session_id: 'test',
      context_before: overrides.context_before,
      context_after: overrides.context_after,
    };
  }

  // Strategy 1: context_before + context_after
  describe('Strategy 1: both contexts', () => {
    it('finds insertion point between before and after context', () => {
      // If "fox " was deleted: context_before="brown ", context_after="jumps"
      // In the post-deletion file: "brown jumps" is present
      const postDeleteContent = 'The quick brown jumps over the lazy dog.';
      const edit = makeEdit({ context_before: 'brown ', context_after: 'jumps' });
      const result = findDeletionInsertionPoint(postDeleteContent, edit);
      expect(result).toBe(16); // right after "brown "
    });
  });

  // Strategy 2: context_before only
  describe('Strategy 2: context_before only', () => {
    it('finds insertion point at end of context_before', () => {
      const edit = makeEdit({ context_before: 'brown ' });
      const result = findDeletionInsertionPoint(fileContent, edit);
      expect(result).toBe(16); // right after "brown "
    });

    it('falls back to strategy 2 when strategy 1 fails', () => {
      const edit = makeEdit({ context_before: 'brown ', context_after: 'NONEXISTENT' });
      const result = findDeletionInsertionPoint(fileContent, edit);
      expect(result).toBe(16);
    });
  });

  // Strategy 3: context_after only
  describe('Strategy 3: context_after only', () => {
    it('finds insertion point at start of context_after', () => {
      const edit = makeEdit({ context_after: 'jumps over' });
      const result = findDeletionInsertionPoint(fileContent, edit);
      expect(result).toBe(20); // right before "jumps"
    });

    it('falls back to strategy 3 when strategies 1 and 2 fail', () => {
      const edit = makeEdit({ context_before: 'NONEXISTENT', context_after: 'jumps over' });
      const result = findDeletionInsertionPoint(fileContent, edit);
      expect(result).toBe(20);
    });
  });

  // Not found
  it('returns -1 when no context is provided', () => {
    const edit = makeEdit({});
    const result = findDeletionInsertionPoint(fileContent, edit);
    expect(result).toBe(-1);
  });

  it('returns -1 when no context matches', () => {
    const edit = makeEdit({ context_before: 'NOPE', context_after: 'NOPE' });
    const result = findDeletionInsertionPoint(fileContent, edit);
    expect(result).toBe(-1);
  });

  // Unicode matching (NFKC only, no confusables)
  describe('unicode matching (NFKC only)', () => {
    it('does not match smart quotes against ASCII in context (no confusables)', () => {
      const content = 'He said "hello" to her.';
      const edit = makeEdit({ context_before: 'said \u201Chello\u201D' });
      const result = findDeletionInsertionPoint(content, edit);
      // Without confusables, smart quotes vs ASCII quotes is a mismatch.
      expect(result).toBe(-1);
    });
  });
});
