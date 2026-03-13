import * as assert from 'node:assert';
import { getCommentSyntax, wrapLineComment, stripLineComment } from '@changetracks/core/internals';

describe('Comment Syntax Map', () => {

  // ─── getCommentSyntax ───────────────────────────────────────────────

  describe('getCommentSyntax', () => {
    it('returns # for python', () => {
      const syntax = getCommentSyntax('python');
      assert.deepStrictEqual(syntax, { line: '#' });
    });

    it('returns // for typescript', () => {
      const syntax = getCommentSyntax('typescript');
      assert.deepStrictEqual(syntax, { line: '//' });
    });

    it('returns // for javascript', () => {
      const syntax = getCommentSyntax('javascript');
      assert.deepStrictEqual(syntax, { line: '//' });
    });

    it('returns // for go', () => {
      const syntax = getCommentSyntax('go');
      assert.deepStrictEqual(syntax, { line: '//' });
    });

    it('returns // for rust', () => {
      const syntax = getCommentSyntax('rust');
      assert.deepStrictEqual(syntax, { line: '//' });
    });

    it('returns # for ruby', () => {
      const syntax = getCommentSyntax('ruby');
      assert.deepStrictEqual(syntax, { line: '#' });
    });

    it('returns # for shellscript', () => {
      const syntax = getCommentSyntax('shellscript');
      assert.deepStrictEqual(syntax, { line: '#' });
    });

    it('returns -- for lua', () => {
      const syntax = getCommentSyntax('lua');
      assert.deepStrictEqual(syntax, { line: '--' });
    });

    it('returns undefined for unknown language', () => {
      const syntax = getCommentSyntax('brainfuck');
      assert.strictEqual(syntax, undefined);
    });

    it('returns undefined for markdown', () => {
      const syntax = getCommentSyntax('markdown');
      assert.strictEqual(syntax, undefined);
    });
  });

  // ─── wrapLineComment ───────────────────────────────────────────────

  describe('wrapLineComment', () => {
    it('wraps deletion in python', () => {
      const result = wrapLineComment('x = 1', 'ct-1', { line: '#' }, true);
      assert.strictEqual(result, '# - x = 1  # ct-1');
    });

    it('wraps deletion in typescript', () => {
      const result = wrapLineComment('const x = 1;', 'ct-2', { line: '//' }, true);
      assert.strictEqual(result, '// - const x = 1;  // ct-2');
    });

    it('wraps insertion in python', () => {
      const result = wrapLineComment('y = 2', 'ct-3', { line: '#' }, false);
      assert.strictEqual(result, 'y = 2  # ct-3');
    });

    it('wraps insertion in typescript', () => {
      const result = wrapLineComment('const y = 2;', 'ct-4', { line: '//' }, false);
      assert.strictEqual(result, 'const y = 2;  // ct-4');
    });

    it('preserves indentation for deletion', () => {
      const result = wrapLineComment('    x = 1', 'ct-5', { line: '#' }, true);
      assert.strictEqual(result, '    # - x = 1  # ct-5');
    });

    it('preserves indentation for insertion', () => {
      const result = wrapLineComment('    y = 2', 'ct-6', { line: '#' }, false);
      assert.strictEqual(result, '    y = 2  # ct-6');
    });

    it('preserves tab indentation for deletion in typescript', () => {
      const result = wrapLineComment('\tconst x = 1;', 'ct-7', { line: '//' }, true);
      assert.strictEqual(result, '\t// - const x = 1;  // ct-7');
    });

    it('preserves tab indentation for insertion in typescript', () => {
      const result = wrapLineComment('\tconst y = 2;', 'ct-8', { line: '//' }, false);
      assert.strictEqual(result, '\tconst y = 2;  // ct-8');
    });
  });

  // ─── stripLineComment ──────────────────────────────────────────────

  describe('stripLineComment', () => {
    it('extracts code from deletion line in python', () => {
      const result = stripLineComment('# - x = 1  # ct-1', { line: '#' });
      assert.ok(result !== null);
      assert.strictEqual(result!.code, 'x = 1');
      assert.strictEqual(result!.tag, 'ct-1');
      assert.strictEqual(result!.isDeletion, true);
      assert.strictEqual(result!.indent, '');
    });

    it('extracts code from insertion tag in python', () => {
      const result = stripLineComment('y = 2  # ct-3', { line: '#' });
      assert.ok(result !== null);
      assert.strictEqual(result!.code, 'y = 2');
      assert.strictEqual(result!.tag, 'ct-3');
      assert.strictEqual(result!.isDeletion, false);
      assert.strictEqual(result!.indent, '');
    });

    it('extracts code from indented deletion in typescript', () => {
      const result = stripLineComment('    // - const x = 1;  // ct-5', { line: '//' });
      assert.ok(result !== null);
      assert.strictEqual(result!.code, 'const x = 1;');
      assert.strictEqual(result!.tag, 'ct-5');
      assert.strictEqual(result!.isDeletion, true);
      assert.strictEqual(result!.indent, '    ');
    });

    it('extracts code from indented insertion in typescript', () => {
      const result = stripLineComment('    const y = 2;  // ct-6', { line: '//' });
      assert.ok(result !== null);
      assert.strictEqual(result!.code, 'const y = 2;');
      assert.strictEqual(result!.tag, 'ct-6');
      assert.strictEqual(result!.isDeletion, false);
      assert.strictEqual(result!.indent, '    ');
    });

    it('returns null for line without sc tag', () => {
      const result = stripLineComment('x = 1', { line: '#' });
      assert.strictEqual(result, null);
    });

    it('returns null for regular comment without sc tag', () => {
      const result = stripLineComment('# this is a normal comment', { line: '#' });
      assert.strictEqual(result, null);
    });

    it('handles dotted sc IDs (grouped changes)', () => {
      const result = stripLineComment('y = 2  # ct-17.3', { line: '#' });
      assert.ok(result !== null);
      assert.strictEqual(result!.tag, 'ct-17.3');
      assert.strictEqual(result!.isDeletion, false);
    });

    it('handles dotted sc IDs in deletion lines', () => {
      const result = stripLineComment('# - old_code  # ct-22.1', { line: '#' });
      assert.ok(result !== null);
      assert.strictEqual(result!.code, 'old_code');
      assert.strictEqual(result!.tag, 'ct-22.1');
      assert.strictEqual(result!.isDeletion, true);
    });
  });
});
