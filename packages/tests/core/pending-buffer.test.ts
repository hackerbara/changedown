import { describe, it, expect } from 'vitest';
import type { PendingBuffer } from '@changetracks/core/edit-boundary';
import {
  isEmpty,
  bufferEnd,
  containsOffset,
  extend,
  spliceInsert,
  spliceDelete,
  createBuffer,
  prependOriginal,
  appendOriginal,
} from '@changetracks/core/edit-boundary';

describe('PendingBuffer', () => {
  const NOW = 1000;

  function makeBuf(currentText: string, anchorOffset = 10, originalText = ''): PendingBuffer {
    return createBuffer(anchorOffset, currentText, originalText, NOW, 'sc-1');
  }

  // ── createBuffer ────────────────────────────────────────────────────

  describe('createBuffer', () => {
    it('sets all fields correctly', () => {
      const buf = createBuffer(42, 'hello', '', 1234, 'sc-99');
      expect(buf.anchorOffset).toBe(42);
      expect(buf.currentText).toBe('hello');
      expect(buf.originalText).toBe('');
      expect(buf.cursorOffset).toBe(5);
      expect(buf.startTime).toBe(1234);
      expect(buf.lastEditTime).toBe(1234);
      expect(buf.scId).toBe('sc-99');
    });

    it('works without scId', () => {
      const buf = createBuffer(0, 'x', '', 0);
      expect(buf.scId).toBeUndefined();
    });

    it('creates deletion buffer (empty currentText, non-empty originalText)', () => {
      const buf = createBuffer(5, '', 'deleted', 1234, 'sc-1');
      expect(buf.currentText).toBe('');
      expect(buf.originalText).toBe('deleted');
      expect(buf.cursorOffset).toBe(0);
    });

    it('creates substitution buffer (both non-empty)', () => {
      const buf = createBuffer(5, 'new', 'old', 1234);
      expect(buf.currentText).toBe('new');
      expect(buf.originalText).toBe('old');
    });
  });

  // ── isEmpty ─────────────────────────────────────────────────────────

  describe('isEmpty', () => {
    it('returns true when both fields empty', () => {
      const buf = makeBuf('', 10, '');
      expect(isEmpty(buf)).toBe(true);
    });

    it('returns false when currentText non-empty', () => {
      const buf = makeBuf('a');
      expect(isEmpty(buf)).toBe(false);
    });

    it('returns false when originalText non-empty', () => {
      const buf = makeBuf('', 10, 'deleted');
      expect(isEmpty(buf)).toBe(false);
    });

    it('returns false when both non-empty', () => {
      const buf = makeBuf('new', 10, 'old');
      expect(isEmpty(buf)).toBe(false);
    });
  });

  // ── bufferEnd ───────────────────────────────────────────────────────

  describe('bufferEnd', () => {
    it('returns anchorOffset + currentText.length', () => {
      const buf = makeBuf('hello', 10);
      expect(bufferEnd(buf)).toBe(15);
    });

    it('returns anchorOffset for empty currentText', () => {
      const buf = makeBuf('', 10, 'deleted');
      expect(bufferEnd(buf)).toBe(10);
    });
  });

  // ── containsOffset ─────────────────────────────────────────────────

  describe('containsOffset', () => {
    it('returns true for offset at anchorOffset', () => {
      const buf = makeBuf('hello', 10);
      expect(containsOffset(buf, 10)).toBe(true);
    });

    it('returns true for offset within range', () => {
      const buf = makeBuf('hello', 10);
      expect(containsOffset(buf, 12)).toBe(true);
    });

    it('returns false for offset at end (exclusive)', () => {
      const buf = makeBuf('hello', 10);
      expect(containsOffset(buf, 15)).toBe(false);
    });

    it('returns false for offset before range', () => {
      const buf = makeBuf('hello', 10);
      expect(containsOffset(buf, 9)).toBe(false);
    });

    it('returns false for offset after range', () => {
      const buf = makeBuf('hello', 10);
      expect(containsOffset(buf, 16)).toBe(false);
    });
  });

  // ── extend ──────────────────────────────────────────────────────────

  describe('extend', () => {
    it('appends text and advances cursor', () => {
      const buf = makeBuf('hel', 10);
      const result = extend(buf, 'lo', 2000);
      expect(result.currentText).toBe('hello');
      expect(result.cursorOffset).toBe(5);
      expect(result.lastEditTime).toBe(2000);
    });

    it('preserves anchorOffset and startTime', () => {
      const buf = makeBuf('a', 10);
      const result = extend(buf, 'b', 2000);
      expect(result.anchorOffset).toBe(10);
      expect(result.startTime).toBe(NOW);
    });

    it('preserves scId', () => {
      const buf = makeBuf('a', 10);
      const result = extend(buf, 'b', 2000);
      expect(result.scId).toBe('sc-1');
    });

    it('preserves originalText', () => {
      const buf = makeBuf('new', 10, 'old');
      const result = extend(buf, 'er', 2000);
      expect(result.currentText).toBe('newer');
      expect(result.originalText).toBe('old');
    });

    it('does not mutate original buffer', () => {
      const buf = makeBuf('a', 10);
      extend(buf, 'b', 2000);
      expect(buf.currentText).toBe('a');
      expect(buf.cursorOffset).toBe(1);
    });

    it('handles multi-character extension', () => {
      const buf = makeBuf('h', 0);
      const result = extend(buf, 'ello world', 2000);
      expect(result.currentText).toBe('hello world');
      expect(result.cursorOffset).toBe(11);
    });
  });

  // ── prependOriginal ─────────────────────────────────────────────────

  describe('prependOriginal', () => {
    it('prepends to originalText and shifts anchor backward', () => {
      const buf = makeBuf('', 10, 'bc');
      const result = prependOriginal(buf, 'a', 2000);
      expect(result.originalText).toBe('abc');
      expect(result.anchorOffset).toBe(9);
      expect(result.lastEditTime).toBe(2000);
    });

    it('preserves currentText', () => {
      const buf = makeBuf('new', 10, 'old');
      const result = prependOriginal(buf, 'very', 2000);
      expect(result.currentText).toBe('new');
      expect(result.originalText).toBe('veryold');
      expect(result.anchorOffset).toBe(6);
    });

    it('does not mutate original', () => {
      const buf = makeBuf('', 10, 'x');
      prependOriginal(buf, 'y', 2000);
      expect(buf.originalText).toBe('x');
      expect(buf.anchorOffset).toBe(10);
    });
  });

  // ── appendOriginal ──────────────────────────────────────────────────

  describe('appendOriginal', () => {
    it('appends to originalText without moving anchor', () => {
      const buf = makeBuf('', 10, 'ab');
      const result = appendOriginal(buf, 'c', 2000);
      expect(result.originalText).toBe('abc');
      expect(result.anchorOffset).toBe(10);
      expect(result.lastEditTime).toBe(2000);
    });

    it('preserves currentText', () => {
      const buf = makeBuf('new', 10, 'old');
      const result = appendOriginal(buf, 'er', 2000);
      expect(result.currentText).toBe('new');
      expect(result.originalText).toBe('older');
    });

    it('does not mutate original', () => {
      const buf = makeBuf('', 10, 'x');
      appendOriginal(buf, 'y', 2000);
      expect(buf.originalText).toBe('x');
    });
  });

  // ── spliceInsert ────────────────────────────────────────────────────

  describe('spliceInsert', () => {
    it('inserts at the beginning of the buffer', () => {
      const buf = makeBuf('world', 10);
      const result = spliceInsert(buf, 10, 'hello ', 2000);
      expect(result.currentText).toBe('hello world');
      expect(result.cursorOffset).toBe(6);
      expect(result.lastEditTime).toBe(2000);
    });

    it('inserts in the middle of the buffer', () => {
      const buf = makeBuf('hllo', 10);
      const result = spliceInsert(buf, 11, 'e', 2000);
      expect(result.currentText).toBe('hello');
      expect(result.cursorOffset).toBe(2);
    });

    it('inserts at last position within buffer', () => {
      const buf = makeBuf('helo', 10);
      const result = spliceInsert(buf, 13, 'l', 2000);
      expect(result.currentText).toBe('hello');
      expect(result.cursorOffset).toBe(4);
    });

    it('does not mutate original', () => {
      const buf = makeBuf('ab', 10);
      spliceInsert(buf, 11, 'X', 2000);
      expect(buf.currentText).toBe('ab');
    });

    it('preserves anchorOffset', () => {
      const buf = makeBuf('ab', 10);
      const result = spliceInsert(buf, 11, 'X', 2000);
      expect(result.anchorOffset).toBe(10);
    });
  });

  // ── spliceDelete ────────────────────────────────────────────────────

  describe('spliceDelete', () => {
    it('deletes from the middle of the buffer', () => {
      const buf = makeBuf('hello', 10);
      const result = spliceDelete(buf, 11, 2, 2000);
      expect(result !== null).toBeTruthy();
      expect(result!.currentText).toBe('hlo');
      expect(result!.cursorOffset).toBe(1);
      expect(result!.lastEditTime).toBe(2000);
    });

    it('deletes from the beginning of the buffer', () => {
      const buf = makeBuf('hello', 10);
      const result = spliceDelete(buf, 10, 1, 2000);
      expect(result !== null).toBeTruthy();
      expect(result!.currentText).toBe('ello');
      expect(result!.cursorOffset).toBe(0);
    });

    it('deletes from the end of the buffer', () => {
      const buf = makeBuf('hello', 10);
      const result = spliceDelete(buf, 14, 1, 2000);
      expect(result !== null).toBeTruthy();
      expect(result!.currentText).toBe('hell');
      expect(result!.cursorOffset).toBe(4);
    });

    it('deletes multiple characters', () => {
      const buf = makeBuf('hello', 10);
      const result = spliceDelete(buf, 10, 3, 2000);
      expect(result !== null).toBeTruthy();
      expect(result!.currentText).toBe('lo');
      expect(result!.cursorOffset).toBe(0);
    });

    it('returns null when deletion empties the buffer and no originalText', () => {
      const buf = makeBuf('ab', 10);
      const result = spliceDelete(buf, 10, 2, 2000);
      expect(result).toBeNull();
    });

    it('returns buffer with empty currentText when originalText exists', () => {
      const buf = makeBuf('ab', 10, 'old');
      const result = spliceDelete(buf, 10, 2, 2000);
      expect(result !== null).toBeTruthy();
      expect(result!.currentText).toBe('');
      expect(result!.originalText).toBe('old');
    });

    it('handles single-character buffer deletion (no originalText)', () => {
      const buf = makeBuf('x', 10);
      const result = spliceDelete(buf, 10, 1, 2000);
      expect(result).toBeNull();
    });

    it('does not mutate original', () => {
      const buf = makeBuf('abc', 10);
      spliceDelete(buf, 11, 1, 2000);
      expect(buf.currentText).toBe('abc');
    });
  });

  // ── Integration: extend then spliceDelete at end ────────────────────

  describe('extend + backspace (spliceDelete at end) sequence', () => {
    it('typing and backspacing produces correct state', () => {
      let buf: PendingBuffer | null = createBuffer(0, 'h', '', 100);
      buf = extend(buf!, 'e', 200);
      buf = extend(buf!, 'l', 300);
      buf = extend(buf!, 'l', 400);
      buf = extend(buf!, 'o', 500);
      expect(buf!.currentText).toBe('hello');
      expect(buf!.cursorOffset).toBe(5);

      // Backspace twice (spliceDelete at end)
      buf = spliceDelete(buf!, 4, 1, 600);
      expect(buf !== null).toBeTruthy();
      expect(buf!.currentText).toBe('hell');

      buf = spliceDelete(buf!, 3, 1, 700);
      expect(buf !== null).toBeTruthy();
      expect(buf!.currentText).toBe('hel');
    });
  });

  // ── Integration: spliceInsert then spliceDelete ─────────────────────

  describe('splice sequences', () => {
    it('insert then delete within buffer', () => {
      let buf: PendingBuffer | null = createBuffer(0, 'helo', '', 100);
      buf = spliceInsert(buf!, 2, 'l', 200);
      expect(buf!.currentText).toBe('hello');

      buf = spliceDelete(buf!, 1, 1, 300);
      expect(buf !== null).toBeTruthy();
      expect(buf!.currentText).toBe('hllo');
    });
  });
});
