import * as assert from 'node:assert';
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
      assert.strictEqual(buf.anchorOffset, 42);
      assert.strictEqual(buf.currentText, 'hello');
      assert.strictEqual(buf.originalText, '');
      assert.strictEqual(buf.cursorOffset, 5);
      assert.strictEqual(buf.startTime, 1234);
      assert.strictEqual(buf.lastEditTime, 1234);
      assert.strictEqual(buf.scId, 'sc-99');
    });

    it('works without scId', () => {
      const buf = createBuffer(0, 'x', '', 0);
      assert.strictEqual(buf.scId, undefined);
    });

    it('creates deletion buffer (empty currentText, non-empty originalText)', () => {
      const buf = createBuffer(5, '', 'deleted', 1234, 'sc-1');
      assert.strictEqual(buf.currentText, '');
      assert.strictEqual(buf.originalText, 'deleted');
      assert.strictEqual(buf.cursorOffset, 0);
    });

    it('creates substitution buffer (both non-empty)', () => {
      const buf = createBuffer(5, 'new', 'old', 1234);
      assert.strictEqual(buf.currentText, 'new');
      assert.strictEqual(buf.originalText, 'old');
    });
  });

  // ── isEmpty ─────────────────────────────────────────────────────────

  describe('isEmpty', () => {
    it('returns true when both fields empty', () => {
      const buf = makeBuf('', 10, '');
      assert.strictEqual(isEmpty(buf), true);
    });

    it('returns false when currentText non-empty', () => {
      const buf = makeBuf('a');
      assert.strictEqual(isEmpty(buf), false);
    });

    it('returns false when originalText non-empty', () => {
      const buf = makeBuf('', 10, 'deleted');
      assert.strictEqual(isEmpty(buf), false);
    });

    it('returns false when both non-empty', () => {
      const buf = makeBuf('new', 10, 'old');
      assert.strictEqual(isEmpty(buf), false);
    });
  });

  // ── bufferEnd ───────────────────────────────────────────────────────

  describe('bufferEnd', () => {
    it('returns anchorOffset + currentText.length', () => {
      const buf = makeBuf('hello', 10);
      assert.strictEqual(bufferEnd(buf), 15);
    });

    it('returns anchorOffset for empty currentText', () => {
      const buf = makeBuf('', 10, 'deleted');
      assert.strictEqual(bufferEnd(buf), 10);
    });
  });

  // ── containsOffset ─────────────────────────────────────────────────

  describe('containsOffset', () => {
    it('returns true for offset at anchorOffset', () => {
      const buf = makeBuf('hello', 10);
      assert.strictEqual(containsOffset(buf, 10), true);
    });

    it('returns true for offset within range', () => {
      const buf = makeBuf('hello', 10);
      assert.strictEqual(containsOffset(buf, 12), true);
    });

    it('returns false for offset at end (exclusive)', () => {
      const buf = makeBuf('hello', 10);
      assert.strictEqual(containsOffset(buf, 15), false);
    });

    it('returns false for offset before range', () => {
      const buf = makeBuf('hello', 10);
      assert.strictEqual(containsOffset(buf, 9), false);
    });

    it('returns false for offset after range', () => {
      const buf = makeBuf('hello', 10);
      assert.strictEqual(containsOffset(buf, 16), false);
    });
  });

  // ── extend ──────────────────────────────────────────────────────────

  describe('extend', () => {
    it('appends text and advances cursor', () => {
      const buf = makeBuf('hel', 10);
      const result = extend(buf, 'lo', 2000);
      assert.strictEqual(result.currentText, 'hello');
      assert.strictEqual(result.cursorOffset, 5);
      assert.strictEqual(result.lastEditTime, 2000);
    });

    it('preserves anchorOffset and startTime', () => {
      const buf = makeBuf('a', 10);
      const result = extend(buf, 'b', 2000);
      assert.strictEqual(result.anchorOffset, 10);
      assert.strictEqual(result.startTime, NOW);
    });

    it('preserves scId', () => {
      const buf = makeBuf('a', 10);
      const result = extend(buf, 'b', 2000);
      assert.strictEqual(result.scId, 'sc-1');
    });

    it('preserves originalText', () => {
      const buf = makeBuf('new', 10, 'old');
      const result = extend(buf, 'er', 2000);
      assert.strictEqual(result.currentText, 'newer');
      assert.strictEqual(result.originalText, 'old');
    });

    it('does not mutate original buffer', () => {
      const buf = makeBuf('a', 10);
      extend(buf, 'b', 2000);
      assert.strictEqual(buf.currentText, 'a');
      assert.strictEqual(buf.cursorOffset, 1);
    });

    it('handles multi-character extension', () => {
      const buf = makeBuf('h', 0);
      const result = extend(buf, 'ello world', 2000);
      assert.strictEqual(result.currentText, 'hello world');
      assert.strictEqual(result.cursorOffset, 11);
    });
  });

  // ── prependOriginal ─────────────────────────────────────────────────

  describe('prependOriginal', () => {
    it('prepends to originalText and shifts anchor backward', () => {
      const buf = makeBuf('', 10, 'bc');
      const result = prependOriginal(buf, 'a', 2000);
      assert.strictEqual(result.originalText, 'abc');
      assert.strictEqual(result.anchorOffset, 9);
      assert.strictEqual(result.lastEditTime, 2000);
    });

    it('preserves currentText', () => {
      const buf = makeBuf('new', 10, 'old');
      const result = prependOriginal(buf, 'very', 2000);
      assert.strictEqual(result.currentText, 'new');
      assert.strictEqual(result.originalText, 'veryold');
      assert.strictEqual(result.anchorOffset, 6);
    });

    it('does not mutate original', () => {
      const buf = makeBuf('', 10, 'x');
      prependOriginal(buf, 'y', 2000);
      assert.strictEqual(buf.originalText, 'x');
      assert.strictEqual(buf.anchorOffset, 10);
    });
  });

  // ── appendOriginal ──────────────────────────────────────────────────

  describe('appendOriginal', () => {
    it('appends to originalText without moving anchor', () => {
      const buf = makeBuf('', 10, 'ab');
      const result = appendOriginal(buf, 'c', 2000);
      assert.strictEqual(result.originalText, 'abc');
      assert.strictEqual(result.anchorOffset, 10);
      assert.strictEqual(result.lastEditTime, 2000);
    });

    it('preserves currentText', () => {
      const buf = makeBuf('new', 10, 'old');
      const result = appendOriginal(buf, 'er', 2000);
      assert.strictEqual(result.currentText, 'new');
      assert.strictEqual(result.originalText, 'older');
    });

    it('does not mutate original', () => {
      const buf = makeBuf('', 10, 'x');
      appendOriginal(buf, 'y', 2000);
      assert.strictEqual(buf.originalText, 'x');
    });
  });

  // ── spliceInsert ────────────────────────────────────────────────────

  describe('spliceInsert', () => {
    it('inserts at the beginning of the buffer', () => {
      const buf = makeBuf('world', 10);
      const result = spliceInsert(buf, 10, 'hello ', 2000);
      assert.strictEqual(result.currentText, 'hello world');
      assert.strictEqual(result.cursorOffset, 6);
      assert.strictEqual(result.lastEditTime, 2000);
    });

    it('inserts in the middle of the buffer', () => {
      const buf = makeBuf('hllo', 10);
      const result = spliceInsert(buf, 11, 'e', 2000);
      assert.strictEqual(result.currentText, 'hello');
      assert.strictEqual(result.cursorOffset, 2);
    });

    it('inserts at last position within buffer', () => {
      const buf = makeBuf('helo', 10);
      const result = spliceInsert(buf, 13, 'l', 2000);
      assert.strictEqual(result.currentText, 'hello');
      assert.strictEqual(result.cursorOffset, 4);
    });

    it('does not mutate original', () => {
      const buf = makeBuf('ab', 10);
      spliceInsert(buf, 11, 'X', 2000);
      assert.strictEqual(buf.currentText, 'ab');
    });

    it('preserves anchorOffset', () => {
      const buf = makeBuf('ab', 10);
      const result = spliceInsert(buf, 11, 'X', 2000);
      assert.strictEqual(result.anchorOffset, 10);
    });
  });

  // ── spliceDelete ────────────────────────────────────────────────────

  describe('spliceDelete', () => {
    it('deletes from the middle of the buffer', () => {
      const buf = makeBuf('hello', 10);
      const result = spliceDelete(buf, 11, 2, 2000);
      assert.ok(result !== null);
      assert.strictEqual(result!.currentText, 'hlo');
      assert.strictEqual(result!.cursorOffset, 1);
      assert.strictEqual(result!.lastEditTime, 2000);
    });

    it('deletes from the beginning of the buffer', () => {
      const buf = makeBuf('hello', 10);
      const result = spliceDelete(buf, 10, 1, 2000);
      assert.ok(result !== null);
      assert.strictEqual(result!.currentText, 'ello');
      assert.strictEqual(result!.cursorOffset, 0);
    });

    it('deletes from the end of the buffer', () => {
      const buf = makeBuf('hello', 10);
      const result = spliceDelete(buf, 14, 1, 2000);
      assert.ok(result !== null);
      assert.strictEqual(result!.currentText, 'hell');
      assert.strictEqual(result!.cursorOffset, 4);
    });

    it('deletes multiple characters', () => {
      const buf = makeBuf('hello', 10);
      const result = spliceDelete(buf, 10, 3, 2000);
      assert.ok(result !== null);
      assert.strictEqual(result!.currentText, 'lo');
      assert.strictEqual(result!.cursorOffset, 0);
    });

    it('returns null when deletion empties the buffer and no originalText', () => {
      const buf = makeBuf('ab', 10);
      const result = spliceDelete(buf, 10, 2, 2000);
      assert.strictEqual(result, null);
    });

    it('returns buffer with empty currentText when originalText exists', () => {
      const buf = makeBuf('ab', 10, 'old');
      const result = spliceDelete(buf, 10, 2, 2000);
      assert.ok(result !== null);
      assert.strictEqual(result!.currentText, '');
      assert.strictEqual(result!.originalText, 'old');
    });

    it('handles single-character buffer deletion (no originalText)', () => {
      const buf = makeBuf('x', 10);
      const result = spliceDelete(buf, 10, 1, 2000);
      assert.strictEqual(result, null);
    });

    it('does not mutate original', () => {
      const buf = makeBuf('abc', 10);
      spliceDelete(buf, 11, 1, 2000);
      assert.strictEqual(buf.currentText, 'abc');
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
      assert.strictEqual(buf!.currentText, 'hello');
      assert.strictEqual(buf!.cursorOffset, 5);

      // Backspace twice (spliceDelete at end)
      buf = spliceDelete(buf!, 4, 1, 600);
      assert.ok(buf !== null);
      assert.strictEqual(buf!.currentText, 'hell');

      buf = spliceDelete(buf!, 3, 1, 700);
      assert.ok(buf !== null);
      assert.strictEqual(buf!.currentText, 'hel');
    });
  });

  // ── Integration: spliceInsert then spliceDelete ─────────────────────

  describe('splice sequences', () => {
    it('insert then delete within buffer', () => {
      let buf: PendingBuffer | null = createBuffer(0, 'helo', '', 100);
      buf = spliceInsert(buf!, 2, 'l', 200);
      assert.strictEqual(buf!.currentText, 'hello');

      buf = spliceDelete(buf!, 1, 1, 300);
      assert.ok(buf !== null);
      assert.strictEqual(buf!.currentText, 'hllo');
    });
  });
});
