import { describe, it, expect } from 'vitest';
import { insertComment, TextEdit } from '@changetracks/core/internals';

function applyEdit(text: string, edit: TextEdit): string {
  return text.substring(0, edit.offset) + edit.newText + text.substring(edit.offset + edit.length);
}

describe('Comment - insertComment', () => {
  describe('without selection (pure insert at cursor)', () => {
    it('inserts comment markup at the given offset', () => {
      const edit = insertComment('my note', 5);
      expect(edit.offset).toBe(5);
      expect(edit).toHaveLength(0);
      expect(edit.newText).toBe('{>> my note <<}');
    });

    it('produces correct result when applied to a string', () => {
      const text = 'Hello world';
      const edit = insertComment('important', 5);
      const result = applyEdit(text, edit);
      expect(result).toBe('Hello{>> important <<} world');
    });

    it('inserts at beginning of text', () => {
      const text = 'Some text';
      const edit = insertComment('start note', 0);
      const result = applyEdit(text, edit);
      expect(result).toBe('{>> start note <<}Some text');
    });

    it('inserts at end of text', () => {
      const text = 'Some text';
      const edit = insertComment('end note', 9);
      const result = applyEdit(text, edit);
      expect(result).toBe('Some text{>> end note <<}');
    });
  });

  describe('with empty comment text', () => {
    it('produces comment with two spaces when comment text is empty', () => {
      const edit = insertComment('', 5);
      expect(edit.newText).toBe('{>>  <<}');
    });

    it('applies empty comment correctly to a string', () => {
      const text = 'Hello world';
      const edit = insertComment('', 5);
      const result = applyEdit(text, edit);
      expect(result).toBe('Hello{>>  <<} world');
    });

    it('uses empty format with selection too', () => {
      const text = 'Hello world';
      const edit = insertComment('', 0, { start: 0, end: 5 }, 'Hello');
      expect(edit.newText).toBe('{==Hello==}{>>  <<}');
    });
  });

  describe('with selection (wraps in highlight + comment)', () => {
    it('replaces selection with highlight+comment markup', () => {
      const edit = insertComment('annotation', 0, { start: 6, end: 11 }, 'world');
      expect(edit.offset).toBe(6);
      expect(edit).toHaveLength(5);
      expect(edit.newText).toBe('{==world==}{>> annotation <<}');
    });

    it('produces correct result when applied to a string', () => {
      const text = 'Hello world, how are you?';
      const edit = insertComment('check this', 0, { start: 6, end: 11 }, 'world');
      const result = applyEdit(text, edit);
      expect(result).toBe('Hello {==world==}{>> check this <<}, how are you?');
    });

    it('handles selection at the beginning of the document', () => {
      const text = 'Hello world';
      const edit = insertComment('greeting', 0, { start: 0, end: 5 }, 'Hello');
      const result = applyEdit(text, edit);
      expect(result).toBe('{==Hello==}{>> greeting <<} world');
    });

    it('handles selection at the end of the document', () => {
      const text = 'Hello world';
      const edit = insertComment('ending', 0, { start: 6, end: 11 }, 'world');
      const result = applyEdit(text, edit);
      expect(result).toBe('Hello {==world==}{>> ending <<}');
    });

    it('handles selection of entire document', () => {
      const text = 'all selected';
      const edit = insertComment('everything', 0, { start: 0, end: 12 }, 'all selected');
      const result = applyEdit(text, edit);
      expect(result).toBe('{==all selected==}{>> everything <<}');
    });

    it('uses selectionRange offset not the offset parameter', () => {
      // The offset parameter is ignored when selectionRange is provided
      const edit = insertComment('note', 999, { start: 10, end: 15 }, 'stuff');
      expect(edit.offset).toBe(10);
      expect(edit).toHaveLength(5);
    });
  });

  describe('edge cases', () => {
    it('handles comment text with special characters', () => {
      const edit = insertComment('a & b < c', 0);
      expect(edit.newText).toBe('{>> a & b < c <<}');
    });

    it('handles comment text containing CriticMarkup delimiters', () => {
      const edit = insertComment('see {++addition++}', 0);
      expect(edit.newText).toBe('{>> see {++addition++} <<}');
    });

    it('handles selected text with special characters', () => {
      const text = 'a & b';
      const edit = insertComment('note', 0, { start: 0, end: 5 }, 'a & b');
      const result = applyEdit(text, edit);
      expect(result).toBe('{==a & b==}{>> note <<}');
    });

    it('selection with empty selected text still wraps', () => {
      const edit = insertComment('note', 0, { start: 5, end: 5 }, '');
      expect(edit.offset).toBe(5);
      expect(edit).toHaveLength(0);
      expect(edit.newText).toBe('{====}{>> note <<}');
    });
  });
});
