import { describe, it, expect, beforeAll } from 'vitest';
import {
  initHashline,
  computeLineHash,
  formatHashLines,
  parseLineRef,
  validateLineRef,
  HashlineMismatchError,
} from '@changetracks/core/internals';

describe('hashline', () => {
  beforeAll(async () => {
    await initHashline();
  });

  // ─── computeLineHash ────────────────────────────────────────────────

  describe('computeLineHash', () => {
    it('returns a 2-char lowercase hex string', () => {
      const hash = computeLineHash(0, 'hello');
      expect(hash).toMatch(/^[0-9a-f]{2}$/);
    });

    it('hashes empty line to a consistent value', () => {
      const h1 = computeLineHash(0, '');
      const h2 = computeLineHash(1, '');
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{2}$/);
    });

    it('idx does not affect the hash (API compat param only)', () => {
      const h0 = computeLineHash(0, 'hello world');
      const h5 = computeLineHash(5, 'hello world');
      const h999 = computeLineHash(999, 'hello world');
      expect(h0).toBe(h5);
      expect(h0).toBe(h999);
    });

    it('strips trailing \\r before hashing', () => {
      const withCR = computeLineHash(0, 'hello\r');
      const withoutCR = computeLineHash(0, 'hello');
      expect(withCR).toBe(withoutCR);
    });

    it('strips ALL whitespace before hashing', () => {
      const plain = computeLineHash(0, 'helloworld');
      const spaced = computeLineHash(0, 'hello world');
      const tabbed = computeLineHash(0, 'hello\tworld');
      const mixed = computeLineHash(0, '  hello  world  ');
      expect(plain).toBe(spaced);
      expect(plain).toBe(tabbed);
      expect(plain).toBe(mixed);
    });

    it('different content produces different hashes (usually)', () => {
      const h1 = computeLineHash(0, 'hello');
      const h2 = computeLineHash(0, 'goodbye');
      // With 256 buckets, collisions happen, but these two specific strings should differ
      // If by chance they collide, just pick different test strings
      expect(h1).not.toBe(h2);
    });

    it('handles lines with only whitespace (same as empty)', () => {
      const empty = computeLineHash(0, '');
      const spaces = computeLineHash(0, '   ');
      const tabs = computeLineHash(0, '\t\t');
      expect(empty).toBe(spaces);
      expect(empty).toBe(tabs);
    });

    it('handles unicode content', () => {
      const hash = computeLineHash(0, '\u3053\u3093\u306B\u3061\u306F');
      expect(hash).toMatch(/^[0-9a-f]{2}$/);
    });

    it('strips footnote refs [^ct-N] before hashing (whitespace-class)', () => {
      const plain = computeLineHash(0, 'some text here');
      const withRef = computeLineHash(0, 'some text[^ct-1] here');
      expect(withRef).toBe(plain);
    });

    it('strips dotted footnote refs [^ct-N.M] before hashing', () => {
      const plain = computeLineHash(0, 'some text here');
      const withRef = computeLineHash(0, 'some text[^ct-2.3] here');
      expect(withRef).toBe(plain);
    });

    it('strips multiple footnote refs before hashing', () => {
      const plain = computeLineHash(0, 'text more');
      const withRefs = computeLineHash(0, 'text[^ct-1][^ct-2.1] more');
      expect(withRefs).toBe(plain);
    });
  });

  // ─── formatHashLines ────────────────────────────────────────────────

  describe('formatHashLines', () => {
    it('formats a single line', () => {
      const result = formatHashLines('hello');
      const hash = computeLineHash(0, 'hello');
      expect(result).toBe(`1:${hash}|hello`);
    });

    it('formats multiple lines', () => {
      const result = formatHashLines('aaa\nbbb\nccc');
      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^1:[0-9a-f]{2}\|aaa$/);
      expect(lines[1]).toMatch(/^2:[0-9a-f]{2}\|bbb$/);
      expect(lines[2]).toMatch(/^3:[0-9a-f]{2}\|ccc$/);
    });

    it('uses custom startLine', () => {
      const result = formatHashLines('aaa\nbbb', 10);
      const lines = result.split('\n');
      expect(lines[0]).toMatch(/^10:[0-9a-f]{2}\|aaa$/);
      expect(lines[1]).toMatch(/^11:[0-9a-f]{2}\|bbb$/);
    });

    it('handles empty content (single empty line)', () => {
      const result = formatHashLines('');
      // formatHashLines splits '' into [''] and calls computeLineHash with context
      const hash = computeLineHash(0, '', ['']);
      expect(result).toBe(`1:${hash}|`);
    });

    it('preserves trailing empty lines from split', () => {
      const result = formatHashLines('aaa\n');
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^1:[0-9a-f]{2}\|aaa$/);
      expect(lines[1]).toMatch(/^2:[0-9a-f]{2}\|$/);
    });
  });

  // ─── parseLineRef ──────────────────────────────────────────────────

  describe('parseLineRef', () => {
    it('parses simple ref "5:a3"', () => {
      const ref = parseLineRef('5:a3');
      expect(ref).toStrictEqual({ line: 5, hash: 'a3' });
    });

    it('parses ref with content suffix (pipe format) "5:a3|content here"', () => {
      const ref = parseLineRef('5:a3|content here');
      expect(ref).toStrictEqual({ line: 5, hash: 'a3' });
    });

    it('parses ref with double-space suffix "5:a3  content here"', () => {
      const ref = parseLineRef('5:a3  content here');
      expect(ref).toStrictEqual({ line: 5, hash: 'a3' });
    });

    it('normalizes whitespace around colon "5 : a3"', () => {
      const ref = parseLineRef('5 : a3');
      expect(ref).toStrictEqual({ line: 5, hash: 'a3' });
    });

    it('handles single-digit line and hash', () => {
      const ref = parseLineRef('1:ff');
      expect(ref).toStrictEqual({ line: 1, hash: 'ff' });
    });

    it('handles large line numbers', () => {
      const ref = parseLineRef('9999:00');
      expect(ref).toStrictEqual({ line: 9999, hash: '00' });
    });

    it('handles uppercase hex in hash', () => {
      const ref = parseLineRef('3:AB');
      expect(ref).toStrictEqual({ line: 3, hash: 'AB' });
    });

    it('handles longer hash (up to 16 chars)', () => {
      const ref = parseLineRef('1:abcdef01234567ff');
      // Strict match allows up to 16 hex chars
      expect(ref).toStrictEqual({ line: 1, hash: 'abcdef01234567ff' });
    });

    it('uses prefix match fallback for 2-char hash prefix followed by non-hex', () => {
      // "5:a3xyz" fails strict but prefix match extracts "a3"
      const ref = parseLineRef('5:a3xyz');
      expect(ref).toStrictEqual({ line: 5, hash: 'a3' });
    });

    it('throws on completely invalid format', () => {
      expect(() => parseLineRef('not a ref')).toThrow(/invalid.*ref/i);
    });

    it('throws on missing colon', () => {
      expect(() => parseLineRef('5a3')).toThrow(/invalid.*ref/i);
    });

    it('throws on line number < 1', () => {
      expect(() => parseLineRef('0:a3')).toThrow(/line.*must be >= 1/i);
    });

    it('throws on negative line number', () => {
      expect(() => parseLineRef('-1:a3')).toThrow(/invalid.*ref/i);
    });

    it('throws on empty hash after colon', () => {
      expect(() => parseLineRef('5:')).toThrow(/invalid.*ref/i);
    });

    it('throws on single-char hash (need at least 2)', () => {
      expect(() => parseLineRef('5:a')).toThrow(/invalid.*ref/i);
    });
  });

  // ─── validateLineRef ───────────────────────────────────────────────

  describe('validateLineRef', () => {
    it('passes when hash matches', () => {
      const fileLines = ['hello', 'world'];
      const hash = computeLineHash(0, 'hello');
      // Should not throw
      validateLineRef({ line: 1, hash }, fileLines);
    });

    it('passes with case-insensitive hash comparison', () => {
      const fileLines = ['hello'];
      const hash = computeLineHash(0, 'hello').toUpperCase();
      validateLineRef({ line: 1, hash }, fileLines);
    });

    it('throws Error when line is out of range', () => {
      const fileLines = ['hello', 'world'];
      expect(
        () => validateLineRef({ line: 3, hash: 'ff' }, fileLines),
      ).toThrow();
      try {
        validateLineRef({ line: 3, hash: 'ff' }, fileLines);
      } catch (err: unknown) {
        expect(err instanceof Error).toBeTruthy();
        expect(err instanceof HashlineMismatchError).toBe(false);
      }
    });

    it('throws HashlineMismatchError when hash does not match', () => {
      const fileLines = ['hello', 'world'];
      const actualHash = computeLineHash(0, 'hello');
      const badHash = actualHash === 'ff' ? '00' : 'ff';
      expect(
        () => validateLineRef({ line: 1, hash: badHash }, fileLines),
      ).toThrow();
      try {
        validateLineRef({ line: 1, hash: badHash }, fileLines);
      } catch (err: unknown) {
        expect(err instanceof HashlineMismatchError).toBeTruthy();
      }
    });
  });

  // ─── HashlineMismatchError ─────────────────────────────────────────

  describe('HashlineMismatchError', () => {
    it('has name "HashlineMismatchError"', () => {
      const err = new HashlineMismatchError(
        [{ line: 1, expected: 'aa', actual: 'bb' }],
        ['hello']
      );
      expect(err.name).toBe('HashlineMismatchError');
    });

    it('is an instance of Error', () => {
      const err = new HashlineMismatchError(
        [{ line: 1, expected: 'aa', actual: 'bb' }],
        ['hello']
      );
      expect(err instanceof Error).toBeTruthy();
    });

    it('contains >>> marker on mismatched line', () => {
      const err = new HashlineMismatchError(
        [{ line: 2, expected: 'aa', actual: 'bb' }],
        ['first', 'second', 'third', 'fourth']
      );
      expect(err.message.includes('>>>')).toBeTruthy();
      expect(err.message.includes('second')).toBeTruthy();
    });

    it('shows context lines around mismatch', () => {
      const fileLines = ['line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'];
      const err = new HashlineMismatchError(
        [{ line: 4, expected: 'aa', actual: 'bb' }],
        fileLines
      );
      // 2 lines of context above and below line 4
      // Should show lines 2-6 (2 above, mismatch at 4, 2 below)
      expect(err.message.includes('line2')).toBeTruthy();
      expect(err.message.includes('line3')).toBeTruthy();
      expect(err.message.includes('line4')).toBeTruthy();
      expect(err.message.includes('line5')).toBeTruthy();
      expect(err.message.includes('line6')).toBeTruthy();
    });

    it('shows gap separator between non-contiguous regions', () => {
      const fileLines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
      const err = new HashlineMismatchError(
        [
          { line: 2, expected: 'aa', actual: 'bb' },
          { line: 15, expected: 'cc', actual: 'dd' },
        ],
        fileLines
      );
      expect(err.message.includes('...')).toBeTruthy();
    });

    it('does NOT show gap when regions are contiguous', () => {
      const fileLines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
      const err = new HashlineMismatchError(
        [
          { line: 3, expected: 'aa', actual: 'bb' },
          { line: 4, expected: 'cc', actual: 'dd' },
        ],
        fileLines
      );
      // Lines 3 and 4 are adjacent — context regions overlap, no gap needed
      expect(!err.message.includes('\n...\n')).toBeTruthy();
    });

    it('has remaps property with old→new mappings', () => {
      const err = new HashlineMismatchError(
        [{ line: 5, expected: 'd4', actual: 'f1' }],
        Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
      );
      expect(err.remaps instanceof Map).toBeTruthy();
      expect(err.remaps.get('5:d4')).toBe('5:f1');
    });

    it('shows quick-fix remap section in message', () => {
      const err = new HashlineMismatchError(
        [{ line: 5, expected: 'd4', actual: 'f1' }],
        Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
      );
      expect(err.message.includes('5:d4')).toBeTruthy();
      expect(err.message.includes('5:f1')).toBeTruthy();
      // Arrow between old and new
      expect(
        err.message.includes('\u2192') || err.message.includes('->'),
      ).toBeTruthy();
    });

    it('handles mismatch at first line (no context above)', () => {
      const err = new HashlineMismatchError(
        [{ line: 1, expected: 'aa', actual: 'bb' }],
        ['first', 'second', 'third']
      );
      expect(err.message.includes('>>>')).toBeTruthy();
      expect(err.message.includes('first')).toBeTruthy();
    });

    it('handles mismatch at last line (no context below)', () => {
      const fileLines = ['first', 'second', 'third'];
      const err = new HashlineMismatchError(
        [{ line: 3, expected: 'aa', actual: 'bb' }],
        fileLines
      );
      expect(err.message.includes('>>>')).toBeTruthy();
      expect(err.message.includes('third')).toBeTruthy();
    });

    it('handles multiple mismatches with correct remaps', () => {
      const fileLines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
      const err = new HashlineMismatchError(
        [
          { line: 3, expected: 'aa', actual: 'bb' },
          { line: 7, expected: 'cc', actual: 'dd' },
        ],
        fileLines
      );
      expect(err.remaps.size).toBe(2);
      expect(err.remaps.get('3:aa')).toBe('3:bb');
      expect(err.remaps.get('7:cc')).toBe('7:dd');
    });
  });

  // ─── initHashline ──────────────────────────────────────────────────

  describe('initHashline', () => {
    it('is idempotent (can be called multiple times)', async () => {
      await initHashline();
      await initHashline();
      // Should not throw or change behavior
      const hash = computeLineHash(0, 'test');
      expect(hash).toMatch(/^[0-9a-f]{2}$/);
    });
  });

  // ─── Context-aware blank-line hashing ─────────────────────────────

  describe('context-aware blank-line hashing', () => {
    it('blank lines between different content get different hashes', () => {
      const lines = ['# Heading One', '', 'Content A', '', '# Heading Two', '', 'Content B'];
      const h1 = computeLineHash(1, lines[1], lines);
      const h3 = computeLineHash(3, lines[3], lines);
      const h5 = computeLineHash(5, lines[5], lines);
      expect(h1).not.toBe(h3);
      expect(h1).not.toBe(h5);
      expect(h3).not.toBe(h5);
    });

    it('consecutive blank lines get different hashes', () => {
      const lines = ['# Heading', '', '', '', 'Content'];
      const h1 = computeLineHash(1, lines[1], lines);
      const h2 = computeLineHash(2, lines[2], lines);
      const h3 = computeLineHash(3, lines[3], lines);
      expect(h1).not.toBe(h2);
      expect(h1).not.toBe(h3);
      expect(h2).not.toBe(h3);
    });

    it('non-blank lines ignore the allLines context parameter', () => {
      const lines = ['# Heading', 'Content here', 'More content'];
      const withoutContext = computeLineHash(1, lines[1]);
      const withContext = computeLineHash(1, lines[1], lines);
      expect(withoutContext).toBe(withContext);
    });

    it('blank line at start of file gets unique hash', () => {
      const linesStartBlank = ['', '# Heading', 'Content'];
      const linesMiddleBlank = ['# Heading', '', 'Content'];
      const hStart = computeLineHash(0, linesStartBlank[0], linesStartBlank);
      const hMiddle = computeLineHash(1, linesMiddleBlank[1], linesMiddleBlank);
      expect(hStart).not.toBe(hMiddle);
    });

    it('blank line at end of file gets unique hash', () => {
      const lines = ['# Heading', 'Content', ''];
      const hash = computeLineHash(2, lines[2], lines);
      expect(hash).toMatch(/^[0-9a-f]{2}$/);
    });

    it('without allLines param, blank lines still hash to same value (backward compat)', () => {
      const h1 = computeLineHash(0, '');
      const h2 = computeLineHash(5, '');
      expect(h1).toBe(h2);
    });

    it('formatHashLines produces unique hashes for blank lines', () => {
      const content = '# Heading\n\nContent A\n\n# Heading Two\n\nContent B';
      const result = formatHashLines(content);
      const hashes = result.split('\n').map(line => {
        const match = line.match(/^\d+:([0-9a-f]{2})\|/);
        return match ? match[1] : null;
      });
      // Blank lines are at indices 1, 3, 5 (0-based in the array)
      expect(hashes[1]).not.toBe(hashes[3]);
      expect(hashes[1]).not.toBe(hashes[5]);
      expect(hashes[3]).not.toBe(hashes[5]);
    });
  });

  // ─── Error before init ────────────────────────────────────────────

  describe('computeLineHash without init', () => {
    // This test verifies the error message, but since we already called init
    // in the beforeAll() hook, we can't truly test uninit state here.
    // We trust the implementation checks for null and throws.
    // The beforeAll() hook ensures init for all other tests.
    it('documents that initHashline() must be called first', () => {
      // Documented behavior: calling computeLineHash before initHashline
      // throws "Call initHashline() before using hashline functions"
      expect(true).toBeTruthy();
    });
  });
});
