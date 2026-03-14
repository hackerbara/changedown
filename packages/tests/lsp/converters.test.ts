import { describe, it, expect } from 'vitest';
import { offsetToPosition, positionToOffset, offsetRangeToLspRange, lspRangeToOffsetRange, Position, Range } from '@changetracks/lsp-server/internals';

describe('Converters', () => {
  describe('offsetToPosition', () => {
    it('should convert offset 0 to line 0, char 0', () => {
      const result = offsetToPosition('hello', 0);
      expect(result.line).toBe(0);
      expect(result.character).toBe(0);
    });

    it('should handle single line text', () => {
      const text = 'hello world';
      const result = offsetToPosition(text, 6); // After "hello "
      expect(result.line).toBe(0);
      expect(result.character).toBe(6);
    });

    it('should handle LF line breaks', () => {
      const text = 'line1\nline2\nline3';
      const result = offsetToPosition(text, 6); // Start of "line2"
      expect(result.line).toBe(1);
      expect(result.character).toBe(0);
    });

    it('should handle CRLF line breaks', () => {
      const text = 'line1\r\nline2\r\nline3';
      const result = offsetToPosition(text, 7); // Start of "line2"
      expect(result.line).toBe(1);
      expect(result.character).toBe(0);
    });

    it('should handle offset in middle of multi-line text', () => {
      const text = 'line1\nline2\nline3';
      const result = offsetToPosition(text, 9); // "li" in "line2"
      expect(result.line).toBe(1);
      expect(result.character).toBe(3);
    });

    it('should handle empty text', () => {
      const result = offsetToPosition('', 0);
      expect(result.line).toBe(0);
      expect(result.character).toBe(0);
    });

    it('should handle offset at end of text', () => {
      const text = 'hello';
      const result = offsetToPosition(text, 5);
      expect(result.line).toBe(0);
      expect(result.character).toBe(5);
    });
  });

  describe('positionToOffset', () => {
    it('should convert line 0, char 0 to offset 0', () => {
      const result = positionToOffset('hello', Position.create(0, 0));
      expect(result).toBe(0);
    });

    it('should handle single line text', () => {
      const text = 'hello world';
      const result = positionToOffset(text, Position.create(0, 6));
      expect(result).toBe(6);
    });

    it('should handle LF line breaks', () => {
      const text = 'line1\nline2\nline3';
      const result = positionToOffset(text, Position.create(1, 0));
      expect(result).toBe(6); // After "line1\n"
    });

    it('should handle CRLF line breaks', () => {
      const text = 'line1\r\nline2\r\nline3';
      const result = positionToOffset(text, Position.create(1, 0));
      expect(result).toBe(7); // After "line1\r\n"
    });

    it('should handle position in middle of multi-line text', () => {
      const text = 'line1\nline2\nline3';
      const result = positionToOffset(text, Position.create(1, 3));
      expect(result).toBe(9); // "li" in "line2"
    });

    it('should handle empty text', () => {
      const result = positionToOffset('', Position.create(0, 0));
      expect(result).toBe(0);
    });
  });

  describe('offsetRangeToLspRange', () => {
    it('should convert single line range', () => {
      const text = 'hello world';
      const result = offsetRangeToLspRange(text, 0, 5);
      expect(result.start.line).toBe(0);
      expect(result.start.character).toBe(0);
      expect(result.end.line).toBe(0);
      expect(result.end.character).toBe(5);
    });

    it('should convert multi-line range with LF', () => {
      const text = 'line1\nline2\nline3';
      const result = offsetRangeToLspRange(text, 0, 11); // "line1\nline2"
      expect(result.start.line).toBe(0);
      expect(result.start.character).toBe(0);
      expect(result.end.line).toBe(1);
      expect(result.end.character).toBe(5);
    });

    it('should convert multi-line range with CRLF', () => {
      const text = 'line1\r\nline2\r\nline3';
      const result = offsetRangeToLspRange(text, 0, 12); // "line1\r\nline2"
      expect(result.start.line).toBe(0);
      expect(result.start.character).toBe(0);
      expect(result.end.line).toBe(1);
      expect(result.end.character).toBe(5);
    });

    it('should handle zero-width range', () => {
      const text = 'hello';
      const result = offsetRangeToLspRange(text, 3, 3);
      expect(result.start.line).toBe(0);
      expect(result.start.character).toBe(3);
      expect(result.end.line).toBe(0);
      expect(result.end.character).toBe(3);
    });
  });

  describe('lspRangeToOffsetRange', () => {
    it('should convert single line range', () => {
      const text = 'hello world';
      const range = Range.create(0, 0, 0, 5);
      const result = lspRangeToOffsetRange(text, range);
      expect(result.start).toBe(0);
      expect(result.end).toBe(5);
    });

    it('should convert multi-line range with LF', () => {
      const text = 'line1\nline2\nline3';
      const range = Range.create(0, 0, 1, 5); // "line1\nline2"
      const result = lspRangeToOffsetRange(text, range);
      expect(result.start).toBe(0);
      expect(result.end).toBe(11);
    });

    it('should convert multi-line range with CRLF', () => {
      const text = 'line1\r\nline2\r\nline3';
      const range = Range.create(0, 0, 1, 5); // "line1\r\nline2"
      const result = lspRangeToOffsetRange(text, range);
      expect(result.start).toBe(0);
      expect(result.end).toBe(12);
    });

    it('should handle zero-width range', () => {
      const text = 'hello';
      const range = Range.create(0, 3, 0, 3);
      const result = lspRangeToOffsetRange(text, range);
      expect(result.start).toBe(3);
      expect(result.end).toBe(3);
    });
  });

  describe('Round-trip conversions', () => {
    it('offset -> position -> offset should preserve value', () => {
      const text = 'line1\nline2\nline3';
      const offset = 9;
      const position = offsetToPosition(text, offset);
      const result = positionToOffset(text, position);
      expect(result).toBe(offset);
    });

    it('position -> offset -> position should preserve value', () => {
      const text = 'line1\nline2\nline3';
      const position = Position.create(1, 3);
      const offset = positionToOffset(text, position);
      const result = offsetToPosition(text, offset);
      expect(result.line).toBe(position.line);
      expect(result.character).toBe(position.character);
    });

    it('offset range -> LSP range -> offset range should preserve value', () => {
      const text = 'line1\nline2\nline3';
      const start = 0;
      const end = 11;
      const lspRange = offsetRangeToLspRange(text, start, end);
      const result = lspRangeToOffsetRange(text, lspRange);
      expect(result.start).toBe(start);
      expect(result.end).toBe(end);
    });
  });
});
