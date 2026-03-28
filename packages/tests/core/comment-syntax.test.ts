import { describe, it, expect } from 'vitest';
import { getCommentSyntax, wrapLineComment, stripLineComment } from '@changedown/core/internals';

describe('Comment Syntax Map', () => {

  // ─── getCommentSyntax ───────────────────────────────────────────────

  describe('getCommentSyntax', () => {
    it('returns # for python', () => {
      const syntax = getCommentSyntax('python');
      expect(syntax).toStrictEqual({ line: '#' });
    });

    it('returns // for typescript', () => {
      const syntax = getCommentSyntax('typescript');
      expect(syntax).toStrictEqual({ line: '//' });
    });

    it('returns // for javascript', () => {
      const syntax = getCommentSyntax('javascript');
      expect(syntax).toStrictEqual({ line: '//' });
    });

    it('returns // for go', () => {
      const syntax = getCommentSyntax('go');
      expect(syntax).toStrictEqual({ line: '//' });
    });

    it('returns // for rust', () => {
      const syntax = getCommentSyntax('rust');
      expect(syntax).toStrictEqual({ line: '//' });
    });

    it('returns # for ruby', () => {
      const syntax = getCommentSyntax('ruby');
      expect(syntax).toStrictEqual({ line: '#' });
    });

    it('returns # for shellscript', () => {
      const syntax = getCommentSyntax('shellscript');
      expect(syntax).toStrictEqual({ line: '#' });
    });

    it('returns -- for lua', () => {
      const syntax = getCommentSyntax('lua');
      expect(syntax).toStrictEqual({ line: '--' });
    });

    it('returns undefined for unknown language', () => {
      const syntax = getCommentSyntax('brainfuck');
      expect(syntax).toBeUndefined();
    });

    it('returns undefined for markdown', () => {
      const syntax = getCommentSyntax('markdown');
      expect(syntax).toBeUndefined();
    });
  });

  // ─── wrapLineComment ───────────────────────────────────────────────

  describe('wrapLineComment', () => {
    it('wraps deletion in python', () => {
      const result = wrapLineComment('x = 1', 'cn-1', { line: '#' }, true);
      expect(result).toBe('# - x = 1  # cn-1');
    });

    it('wraps deletion in typescript', () => {
      const result = wrapLineComment('const x = 1;', 'cn-2', { line: '//' }, true);
      expect(result).toBe('// - const x = 1;  // cn-2');
    });

    it('wraps insertion in python', () => {
      const result = wrapLineComment('y = 2', 'cn-3', { line: '#' }, false);
      expect(result).toBe('y = 2  # cn-3');
    });

    it('wraps insertion in typescript', () => {
      const result = wrapLineComment('const y = 2;', 'cn-4', { line: '//' }, false);
      expect(result).toBe('const y = 2;  // cn-4');
    });

    it('preserves indentation for deletion', () => {
      const result = wrapLineComment('    x = 1', 'cn-5', { line: '#' }, true);
      expect(result).toBe('    # - x = 1  # cn-5');
    });

    it('preserves indentation for insertion', () => {
      const result = wrapLineComment('    y = 2', 'cn-6', { line: '#' }, false);
      expect(result).toBe('    y = 2  # cn-6');
    });

    it('preserves tab indentation for deletion in typescript', () => {
      const result = wrapLineComment('\tconst x = 1;', 'cn-7', { line: '//' }, true);
      expect(result).toBe('\t// - const x = 1;  // cn-7');
    });

    it('preserves tab indentation for insertion in typescript', () => {
      const result = wrapLineComment('\tconst y = 2;', 'cn-8', { line: '//' }, false);
      expect(result).toBe('\tconst y = 2;  // cn-8');
    });
  });

  // ─── stripLineComment ──────────────────────────────────────────────

  describe('stripLineComment', () => {
    it('extracts code from deletion line in python', () => {
      const result = stripLineComment('# - x = 1  # cn-1', { line: '#' });
      expect(result !== null).toBeTruthy();
      expect(result!.code).toBe('x = 1');
      expect(result!.tag).toBe('cn-1');
      expect(result!.isDeletion).toBe(true);
      expect(result!.indent).toBe('');
    });

    it('extracts code from insertion tag in python', () => {
      const result = stripLineComment('y = 2  # cn-3', { line: '#' });
      expect(result !== null).toBeTruthy();
      expect(result!.code).toBe('y = 2');
      expect(result!.tag).toBe('cn-3');
      expect(result!.isDeletion).toBe(false);
      expect(result!.indent).toBe('');
    });

    it('extracts code from indented deletion in typescript', () => {
      const result = stripLineComment('    // - const x = 1;  // cn-5', { line: '//' });
      expect(result !== null).toBeTruthy();
      expect(result!.code).toBe('const x = 1;');
      expect(result!.tag).toBe('cn-5');
      expect(result!.isDeletion).toBe(true);
      expect(result!.indent).toBe('    ');
    });

    it('extracts code from indented insertion in typescript', () => {
      const result = stripLineComment('    const y = 2;  // cn-6', { line: '//' });
      expect(result !== null).toBeTruthy();
      expect(result!.code).toBe('const y = 2;');
      expect(result!.tag).toBe('cn-6');
      expect(result!.isDeletion).toBe(false);
      expect(result!.indent).toBe('    ');
    });

    it('returns null for line without sc tag', () => {
      const result = stripLineComment('x = 1', { line: '#' });
      expect(result).toBeNull();
    });

    it('returns null for regular comment without sc tag', () => {
      const result = stripLineComment('# this is a normal comment', { line: '#' });
      expect(result).toBeNull();
    });

    it('handles dotted sc IDs (grouped changes)', () => {
      const result = stripLineComment('y = 2  # cn-17.3', { line: '#' });
      expect(result !== null).toBeTruthy();
      expect(result!.tag).toBe('cn-17.3');
      expect(result!.isDeletion).toBe(false);
    });

    it('handles dotted sc IDs in deletion lines', () => {
      const result = stripLineComment('# - old_code  # cn-22.1', { line: '#' });
      expect(result !== null).toBeTruthy();
      expect(result!.code).toBe('old_code');
      expect(result!.tag).toBe('cn-22.1');
      expect(result!.isDeletion).toBe(true);
    });
  });
});
