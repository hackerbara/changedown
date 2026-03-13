import * as assert from 'assert';
import { insertComment, TextEdit } from '@changetracks/core/internals';

function applyEdit(text: string, edit: TextEdit): string {
  return text.substring(0, edit.offset) + edit.newText + text.substring(edit.offset + edit.length);
}

describe('Comment - insertComment', () => {
  describe('without selection (pure insert at cursor)', () => {
    it('inserts comment markup at the given offset', () => {
      const edit = insertComment('my note', 5);
      assert.strictEqual(edit.offset, 5);
      assert.strictEqual(edit.length, 0);
      assert.strictEqual(edit.newText, '{>> my note <<}');
    });

    it('produces correct result when applied to a string', () => {
      const text = 'Hello world';
      const edit = insertComment('important', 5);
      const result = applyEdit(text, edit);
      assert.strictEqual(result, 'Hello{>> important <<} world');
    });

    it('inserts at beginning of text', () => {
      const text = 'Some text';
      const edit = insertComment('start note', 0);
      const result = applyEdit(text, edit);
      assert.strictEqual(result, '{>> start note <<}Some text');
    });

    it('inserts at end of text', () => {
      const text = 'Some text';
      const edit = insertComment('end note', 9);
      const result = applyEdit(text, edit);
      assert.strictEqual(result, 'Some text{>> end note <<}');
    });
  });

  describe('with empty comment text', () => {
    it('produces comment with two spaces when comment text is empty', () => {
      const edit = insertComment('', 5);
      assert.strictEqual(edit.newText, '{>>  <<}');
    });

    it('applies empty comment correctly to a string', () => {
      const text = 'Hello world';
      const edit = insertComment('', 5);
      const result = applyEdit(text, edit);
      assert.strictEqual(result, 'Hello{>>  <<} world');
    });

    it('uses empty format with selection too', () => {
      const text = 'Hello world';
      const edit = insertComment('', 0, { start: 0, end: 5 }, 'Hello');
      assert.strictEqual(edit.newText, '{==Hello==}{>>  <<}');
    });
  });

  describe('with selection (wraps in highlight + comment)', () => {
    it('replaces selection with highlight+comment markup', () => {
      const edit = insertComment('annotation', 0, { start: 6, end: 11 }, 'world');
      assert.strictEqual(edit.offset, 6);
      assert.strictEqual(edit.length, 5);
      assert.strictEqual(edit.newText, '{==world==}{>> annotation <<}');
    });

    it('produces correct result when applied to a string', () => {
      const text = 'Hello world, how are you?';
      const edit = insertComment('check this', 0, { start: 6, end: 11 }, 'world');
      const result = applyEdit(text, edit);
      assert.strictEqual(result, 'Hello {==world==}{>> check this <<}, how are you?');
    });

    it('handles selection at the beginning of the document', () => {
      const text = 'Hello world';
      const edit = insertComment('greeting', 0, { start: 0, end: 5 }, 'Hello');
      const result = applyEdit(text, edit);
      assert.strictEqual(result, '{==Hello==}{>> greeting <<} world');
    });

    it('handles selection at the end of the document', () => {
      const text = 'Hello world';
      const edit = insertComment('ending', 0, { start: 6, end: 11 }, 'world');
      const result = applyEdit(text, edit);
      assert.strictEqual(result, 'Hello {==world==}{>> ending <<}');
    });

    it('handles selection of entire document', () => {
      const text = 'all selected';
      const edit = insertComment('everything', 0, { start: 0, end: 12 }, 'all selected');
      const result = applyEdit(text, edit);
      assert.strictEqual(result, '{==all selected==}{>> everything <<}');
    });

    it('uses selectionRange offset not the offset parameter', () => {
      // The offset parameter is ignored when selectionRange is provided
      const edit = insertComment('note', 999, { start: 10, end: 15 }, 'stuff');
      assert.strictEqual(edit.offset, 10);
      assert.strictEqual(edit.length, 5);
    });
  });

  describe('edge cases', () => {
    it('handles comment text with special characters', () => {
      const edit = insertComment('a & b < c', 0);
      assert.strictEqual(edit.newText, '{>> a & b < c <<}');
    });

    it('handles comment text containing CriticMarkup delimiters', () => {
      const edit = insertComment('see {++addition++}', 0);
      assert.strictEqual(edit.newText, '{>> see {++addition++} <<}');
    });

    it('handles selected text with special characters', () => {
      const text = 'a & b';
      const edit = insertComment('note', 0, { start: 0, end: 5 }, 'a & b');
      const result = applyEdit(text, edit);
      assert.strictEqual(result, '{==a & b==}{>> note <<}');
    });

    it('selection with empty selected text still wraps', () => {
      const edit = insertComment('note', 0, { start: 5, end: 5 }, '');
      assert.strictEqual(edit.offset, 5);
      assert.strictEqual(edit.length, 0);
      assert.strictEqual(edit.newText, '{====}{>> note <<}');
    });
  });
});
