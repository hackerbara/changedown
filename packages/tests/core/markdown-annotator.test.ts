import { describe, it, expect } from 'vitest';
import { annotateMarkdown } from '@changetracks/core/internals';

describe('Markdown Annotator - annotateMarkdown', () => {
  describe('no differences', () => {
    it('returns unchanged text when old and new are identical', () => {
      const text = 'Hello world\nSecond line\n';
      expect(annotateMarkdown(text, text)).toBe(text);
    });

    it('returns empty string when both are empty', () => {
      expect(annotateMarkdown('', '')).toBe('');
    });
  });

  describe('character-level insertion', () => {
    it('marks a single word insertion', () => {
      const old = 'Hello world';
      const now = 'Hello beautiful world';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('Hello {++beautiful ++}world');
    });

    it('marks insertion at beginning', () => {
      const old = 'world';
      const now = 'Hello world';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('{++Hello ++}world');
    });

    it('marks insertion at end', () => {
      const old = 'Hello';
      const now = 'Hello world';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('Hello{++ world++}');
    });
  });

  describe('character-level deletion', () => {
    it('marks a single word deletion', () => {
      const old = 'Hello beautiful world';
      const now = 'Hello world';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('Hello {--beautiful --}world');
    });

    it('marks deletion at beginning', () => {
      const old = 'Hello world';
      const now = 'world';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('{--Hello --}world');
    });

    it('marks deletion at end', () => {
      const old = 'Hello world';
      const now = 'Hello';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('Hello{-- world--}');
    });
  });

  describe('character-level substitution', () => {
    it('marks a word substitution with adjacent delete+insert', () => {
      const old = 'The cat sat';
      const now = 'The dog sat';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('The {~~cat~>dog~~} sat');
    });

    it('marks substitution of a single character', () => {
      const old = 'color';
      const now = 'colour';
      const result = annotateMarkdown(old, now);
      // diff algorithm: "colo" unchanged, inserts "u", "r" unchanged
      expect(result).toBe('colo{++u++}r');
    });
  });

  describe('multiple changes in one line', () => {
    it('handles two changes in a single line', () => {
      const old = 'The quick brown fox';
      const now = 'The slow brown dog';
      const result = annotateMarkdown(old, now);
      // "The " unchanged, "quick" -> "slow", " brown " unchanged, then char-level on "fox" vs "dog"
      // diff algorithm splits "fox"->"dog" as f->d, o, x->g (shares the 'o')
      expect(result).toBe('The {~~quick~>slow~~} brown {~~f~>d~~}o{~~x~>g~~}');
    });
  });

  describe('multi-line insertions', () => {
    it('marks insertion of a complete new line', () => {
      const old = 'Line 1\nLine 3\n';
      const now = 'Line 1\nLine 2\nLine 3\n';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('Line 1\n{++Line 2\n++}Line 3\n');
    });

    it('marks insertion of multiple new lines', () => {
      const old = 'A\nD\n';
      const now = 'A\nB\nC\nD\n';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('A\n{++B\nC\n++}D\n');
    });
  });

  describe('multi-line deletions', () => {
    it('marks deletion of a complete line', () => {
      const old = 'Line 1\nLine 2\nLine 3\n';
      const now = 'Line 1\nLine 3\n';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('Line 1\n{--Line 2\n--}Line 3\n');
    });

    it('marks deletion of multiple lines', () => {
      const old = 'A\nB\nC\nD\n';
      const now = 'A\nD\n';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('A\n{--B\nC\n--}D\n');
    });
  });

  describe('complete line replacement with character-level diff', () => {
    it('uses character-level diff for replaced line', () => {
      const old = 'The old line\n';
      const now = 'The new line\n';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('The {~~old~>new~~} line\n');
    });

    it('handles replaced line among unchanged lines', () => {
      const old = 'Before\nThe old line\nAfter\n';
      const now = 'Before\nThe new line\nAfter\n';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('Before\nThe {~~old~>new~~} line\nAfter\n');
    });
  });

  describe('empty old text (entirely new file)', () => {
    it('wraps entire content as insertion', () => {
      const old = '';
      const now = 'Hello world\nSecond line\n';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('{++Hello world\nSecond line\n++}');
    });

    it('wraps single line as insertion', () => {
      const old = '';
      const now = 'Hello';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('{++Hello++}');
    });
  });

  describe('empty new text (entirely deleted file)', () => {
    it('wraps entire content as deletion', () => {
      const old = 'Hello world\nSecond line\n';
      const now = '';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('{--Hello world\nSecond line\n--}');
    });

    it('wraps single line as deletion', () => {
      const old = 'Hello';
      const now = '';
      const result = annotateMarkdown(old, now);
      expect(result).toBe('{--Hello--}');
    });
  });

  describe('CriticMarkup invariants', () => {
    it('accepting all changes in output produces newText', () => {
      const old = 'The quick brown fox jumps over the lazy dog';
      const now = 'The slow red fox leaps over a lazy cat';
      const result = annotateMarkdown(old, now);

      // Accept: keep insertions, remove deletions, use substitution replacement
      const accepted = result
        .replace(/\{--[^]*?--\}/g, '')
        .replace(/\{\+\+([^]*?)\+\+\}/g, '$1')
        .replace(/\{~~[^]*?~>([^]*?)~~\}/g, '$1');
      expect(accepted).toBe(now);
    });

    it('rejecting all changes in output produces oldText', () => {
      const old = 'The quick brown fox jumps over the lazy dog';
      const now = 'The slow red fox leaps over a lazy cat';
      const result = annotateMarkdown(old, now);

      // Reject: remove insertions, keep deletions, use substitution original
      const rejected = result
        .replace(/\{\+\+[^]*?\+\+\}/g, '')
        .replace(/\{--([^]*?)--\}/g, '$1')
        .replace(/\{~~([^]*?)~>[^]*?~~\}/g, '$1');
      expect(rejected).toBe(old);
    });

    it('accept invariant holds for multi-line changes', () => {
      const old = 'Line 1\nLine 2\nLine 3\n';
      const now = 'Line 1\nModified line\nNew line\nLine 3\n';
      const result = annotateMarkdown(old, now);

      const accepted = result
        .replace(/\{--[^]*?--\}/g, '')
        .replace(/\{\+\+([^]*?)\+\+\}/g, '$1')
        .replace(/\{~~[^]*?~>([^]*?)~~\}/g, '$1');
      expect(accepted).toBe(now);
    });

    it('reject invariant holds for multi-line changes', () => {
      const old = 'Line 1\nLine 2\nLine 3\n';
      const now = 'Line 1\nModified line\nNew line\nLine 3\n';
      const result = annotateMarkdown(old, now);

      const rejected = result
        .replace(/\{\+\+[^]*?\+\+\}/g, '')
        .replace(/\{--([^]*?)--\}/g, '$1')
        .replace(/\{~~([^]*?)~>[^]*?~~\}/g, '$1');
      expect(rejected).toBe(old);
    });
  });
});
