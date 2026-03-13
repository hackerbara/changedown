import * as assert from 'assert';
import { offsetToPosition, positionToOffset, offsetRangeToLspRange, lspRangeToOffsetRange, Position, Range } from '@changetracks/lsp-server/internals';

describe('Converters', () => {
  describe('offsetToPosition', () => {
    it('should convert offset 0 to line 0, char 0', () => {
      const result = offsetToPosition('hello', 0);
      assert.strictEqual(result.line, 0);
      assert.strictEqual(result.character, 0);
    });

    it('should handle single line text', () => {
      const text = 'hello world';
      const result = offsetToPosition(text, 6); // After "hello "
      assert.strictEqual(result.line, 0);
      assert.strictEqual(result.character, 6);
    });

    it('should handle LF line breaks', () => {
      const text = 'line1\nline2\nline3';
      const result = offsetToPosition(text, 6); // Start of "line2"
      assert.strictEqual(result.line, 1);
      assert.strictEqual(result.character, 0);
    });

    it('should handle CRLF line breaks', () => {
      const text = 'line1\r\nline2\r\nline3';
      const result = offsetToPosition(text, 7); // Start of "line2"
      assert.strictEqual(result.line, 1);
      assert.strictEqual(result.character, 0);
    });

    it('should handle offset in middle of multi-line text', () => {
      const text = 'line1\nline2\nline3';
      const result = offsetToPosition(text, 9); // "li" in "line2"
      assert.strictEqual(result.line, 1);
      assert.strictEqual(result.character, 3);
    });

    it('should handle empty text', () => {
      const result = offsetToPosition('', 0);
      assert.strictEqual(result.line, 0);
      assert.strictEqual(result.character, 0);
    });

    it('should handle offset at end of text', () => {
      const text = 'hello';
      const result = offsetToPosition(text, 5);
      assert.strictEqual(result.line, 0);
      assert.strictEqual(result.character, 5);
    });
  });

  describe('positionToOffset', () => {
    it('should convert line 0, char 0 to offset 0', () => {
      const result = positionToOffset('hello', Position.create(0, 0));
      assert.strictEqual(result, 0);
    });

    it('should handle single line text', () => {
      const text = 'hello world';
      const result = positionToOffset(text, Position.create(0, 6));
      assert.strictEqual(result, 6);
    });

    it('should handle LF line breaks', () => {
      const text = 'line1\nline2\nline3';
      const result = positionToOffset(text, Position.create(1, 0));
      assert.strictEqual(result, 6); // After "line1\n"
    });

    it('should handle CRLF line breaks', () => {
      const text = 'line1\r\nline2\r\nline3';
      const result = positionToOffset(text, Position.create(1, 0));
      assert.strictEqual(result, 7); // After "line1\r\n"
    });

    it('should handle position in middle of multi-line text', () => {
      const text = 'line1\nline2\nline3';
      const result = positionToOffset(text, Position.create(1, 3));
      assert.strictEqual(result, 9); // "li" in "line2"
    });

    it('should handle empty text', () => {
      const result = positionToOffset('', Position.create(0, 0));
      assert.strictEqual(result, 0);
    });
  });

  describe('offsetRangeToLspRange', () => {
    it('should convert single line range', () => {
      const text = 'hello world';
      const result = offsetRangeToLspRange(text, 0, 5);
      assert.strictEqual(result.start.line, 0);
      assert.strictEqual(result.start.character, 0);
      assert.strictEqual(result.end.line, 0);
      assert.strictEqual(result.end.character, 5);
    });

    it('should convert multi-line range with LF', () => {
      const text = 'line1\nline2\nline3';
      const result = offsetRangeToLspRange(text, 0, 11); // "line1\nline2"
      assert.strictEqual(result.start.line, 0);
      assert.strictEqual(result.start.character, 0);
      assert.strictEqual(result.end.line, 1);
      assert.strictEqual(result.end.character, 5);
    });

    it('should convert multi-line range with CRLF', () => {
      const text = 'line1\r\nline2\r\nline3';
      const result = offsetRangeToLspRange(text, 0, 12); // "line1\r\nline2"
      assert.strictEqual(result.start.line, 0);
      assert.strictEqual(result.start.character, 0);
      assert.strictEqual(result.end.line, 1);
      assert.strictEqual(result.end.character, 5);
    });

    it('should handle zero-width range', () => {
      const text = 'hello';
      const result = offsetRangeToLspRange(text, 3, 3);
      assert.strictEqual(result.start.line, 0);
      assert.strictEqual(result.start.character, 3);
      assert.strictEqual(result.end.line, 0);
      assert.strictEqual(result.end.character, 3);
    });
  });

  describe('lspRangeToOffsetRange', () => {
    it('should convert single line range', () => {
      const text = 'hello world';
      const range = Range.create(0, 0, 0, 5);
      const result = lspRangeToOffsetRange(text, range);
      assert.strictEqual(result.start, 0);
      assert.strictEqual(result.end, 5);
    });

    it('should convert multi-line range with LF', () => {
      const text = 'line1\nline2\nline3';
      const range = Range.create(0, 0, 1, 5); // "line1\nline2"
      const result = lspRangeToOffsetRange(text, range);
      assert.strictEqual(result.start, 0);
      assert.strictEqual(result.end, 11);
    });

    it('should convert multi-line range with CRLF', () => {
      const text = 'line1\r\nline2\r\nline3';
      const range = Range.create(0, 0, 1, 5); // "line1\r\nline2"
      const result = lspRangeToOffsetRange(text, range);
      assert.strictEqual(result.start, 0);
      assert.strictEqual(result.end, 12);
    });

    it('should handle zero-width range', () => {
      const text = 'hello';
      const range = Range.create(0, 3, 0, 3);
      const result = lspRangeToOffsetRange(text, range);
      assert.strictEqual(result.start, 3);
      assert.strictEqual(result.end, 3);
    });
  });

  describe('Round-trip conversions', () => {
    it('offset -> position -> offset should preserve value', () => {
      const text = 'line1\nline2\nline3';
      const offset = 9;
      const position = offsetToPosition(text, offset);
      const result = positionToOffset(text, position);
      assert.strictEqual(result, offset);
    });

    it('position -> offset -> position should preserve value', () => {
      const text = 'line1\nline2\nline3';
      const position = Position.create(1, 3);
      const offset = positionToOffset(text, position);
      const result = offsetToPosition(text, offset);
      assert.strictEqual(result.line, position.line);
      assert.strictEqual(result.character, position.character);
    });

    it('offset range -> LSP range -> offset range should preserve value', () => {
      const text = 'line1\nline2\nline3';
      const start = 0;
      const end = 11;
      const lspRange = offsetRangeToLspRange(text, start, end);
      const result = lspRangeToOffsetRange(text, lspRange);
      assert.strictEqual(result.start, start);
      assert.strictEqual(result.end, end);
    });
  });
});
