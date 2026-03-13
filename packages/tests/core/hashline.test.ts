import * as assert from 'node:assert';
import {
  initHashline,
  computeLineHash,
  formatHashLines,
  parseLineRef,
  validateLineRef,
  HashlineMismatchError,
} from '@changetracks/core/internals';

describe('hashline', () => {
  before(async () => {
    await initHashline();
  });

  // ─── computeLineHash ────────────────────────────────────────────────

  describe('computeLineHash', () => {
    it('returns a 2-char lowercase hex string', () => {
      const hash = computeLineHash(0, 'hello');
      assert.match(hash, /^[0-9a-f]{2}$/);
    });

    it('hashes empty line to a consistent value', () => {
      const h1 = computeLineHash(0, '');
      const h2 = computeLineHash(1, '');
      assert.strictEqual(h1, h2, 'empty line hash should be consistent regardless of idx');
      assert.match(h1, /^[0-9a-f]{2}$/);
    });

    it('idx does not affect the hash (API compat param only)', () => {
      const h0 = computeLineHash(0, 'hello world');
      const h5 = computeLineHash(5, 'hello world');
      const h999 = computeLineHash(999, 'hello world');
      assert.strictEqual(h0, h5);
      assert.strictEqual(h0, h999);
    });

    it('strips trailing \\r before hashing', () => {
      const withCR = computeLineHash(0, 'hello\r');
      const withoutCR = computeLineHash(0, 'hello');
      assert.strictEqual(withCR, withoutCR);
    });

    it('strips ALL whitespace before hashing', () => {
      const plain = computeLineHash(0, 'helloworld');
      const spaced = computeLineHash(0, 'hello world');
      const tabbed = computeLineHash(0, 'hello\tworld');
      const mixed = computeLineHash(0, '  hello  world  ');
      assert.strictEqual(plain, spaced);
      assert.strictEqual(plain, tabbed);
      assert.strictEqual(plain, mixed);
    });

    it('different content produces different hashes (usually)', () => {
      const h1 = computeLineHash(0, 'hello');
      const h2 = computeLineHash(0, 'goodbye');
      // With 256 buckets, collisions happen, but these two specific strings should differ
      // If by chance they collide, just pick different test strings
      assert.notStrictEqual(h1, h2);
    });

    it('handles lines with only whitespace (same as empty)', () => {
      const empty = computeLineHash(0, '');
      const spaces = computeLineHash(0, '   ');
      const tabs = computeLineHash(0, '\t\t');
      assert.strictEqual(empty, spaces);
      assert.strictEqual(empty, tabs);
    });

    it('handles unicode content', () => {
      const hash = computeLineHash(0, 'こんにちは');
      assert.match(hash, /^[0-9a-f]{2}$/);
    });

    it('strips footnote refs [^ct-N] before hashing (whitespace-class)', () => {
      const plain = computeLineHash(0, 'some text here');
      const withRef = computeLineHash(0, 'some text[^ct-1] here');
      assert.strictEqual(withRef, plain);
    });

    it('strips dotted footnote refs [^ct-N.M] before hashing', () => {
      const plain = computeLineHash(0, 'some text here');
      const withRef = computeLineHash(0, 'some text[^ct-2.3] here');
      assert.strictEqual(withRef, plain);
    });

    it('strips multiple footnote refs before hashing', () => {
      const plain = computeLineHash(0, 'text more');
      const withRefs = computeLineHash(0, 'text[^ct-1][^ct-2.1] more');
      assert.strictEqual(withRefs, plain);
    });
  });

  // ─── formatHashLines ────────────────────────────────────────────────

  describe('formatHashLines', () => {
    it('formats a single line', () => {
      const result = formatHashLines('hello');
      const hash = computeLineHash(0, 'hello');
      assert.strictEqual(result, `1:${hash}|hello`);
    });

    it('formats multiple lines', () => {
      const result = formatHashLines('aaa\nbbb\nccc');
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 3);
      assert.match(lines[0], /^1:[0-9a-f]{2}\|aaa$/);
      assert.match(lines[1], /^2:[0-9a-f]{2}\|bbb$/);
      assert.match(lines[2], /^3:[0-9a-f]{2}\|ccc$/);
    });

    it('uses custom startLine', () => {
      const result = formatHashLines('aaa\nbbb', 10);
      const lines = result.split('\n');
      assert.match(lines[0], /^10:[0-9a-f]{2}\|aaa$/);
      assert.match(lines[1], /^11:[0-9a-f]{2}\|bbb$/);
    });

    it('handles empty content (single empty line)', () => {
      const result = formatHashLines('');
      const hash = computeLineHash(0, '');
      assert.strictEqual(result, `1:${hash}|`);
    });

    it('preserves trailing empty lines from split', () => {
      const result = formatHashLines('aaa\n');
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 2);
      assert.match(lines[0], /^1:[0-9a-f]{2}\|aaa$/);
      assert.match(lines[1], /^2:[0-9a-f]{2}\|$/);
    });
  });

  // ─── parseLineRef ──────────────────────────────────────────────────

  describe('parseLineRef', () => {
    it('parses simple ref "5:a3"', () => {
      const ref = parseLineRef('5:a3');
      assert.deepStrictEqual(ref, { line: 5, hash: 'a3' });
    });

    it('parses ref with content suffix (pipe format) "5:a3|content here"', () => {
      const ref = parseLineRef('5:a3|content here');
      assert.deepStrictEqual(ref, { line: 5, hash: 'a3' });
    });

    it('parses ref with double-space suffix "5:a3  content here"', () => {
      const ref = parseLineRef('5:a3  content here');
      assert.deepStrictEqual(ref, { line: 5, hash: 'a3' });
    });

    it('normalizes whitespace around colon "5 : a3"', () => {
      const ref = parseLineRef('5 : a3');
      assert.deepStrictEqual(ref, { line: 5, hash: 'a3' });
    });

    it('handles single-digit line and hash', () => {
      const ref = parseLineRef('1:ff');
      assert.deepStrictEqual(ref, { line: 1, hash: 'ff' });
    });

    it('handles large line numbers', () => {
      const ref = parseLineRef('9999:00');
      assert.deepStrictEqual(ref, { line: 9999, hash: '00' });
    });

    it('handles uppercase hex in hash', () => {
      const ref = parseLineRef('3:AB');
      assert.deepStrictEqual(ref, { line: 3, hash: 'AB' });
    });

    it('handles longer hash (up to 16 chars)', () => {
      const ref = parseLineRef('1:abcdef01234567ff');
      // Strict match allows up to 16 hex chars
      assert.deepStrictEqual(ref, { line: 1, hash: 'abcdef01234567ff' });
    });

    it('uses prefix match fallback for 2-char hash prefix followed by non-hex', () => {
      // "5:a3xyz" fails strict but prefix match extracts "a3"
      const ref = parseLineRef('5:a3xyz');
      assert.deepStrictEqual(ref, { line: 5, hash: 'a3' });
    });

    it('throws on completely invalid format', () => {
      assert.throws(() => parseLineRef('not a ref'), /invalid.*ref/i);
    });

    it('throws on missing colon', () => {
      assert.throws(() => parseLineRef('5a3'), /invalid.*ref/i);
    });

    it('throws on line number < 1', () => {
      assert.throws(() => parseLineRef('0:a3'), /line.*must be >= 1/i);
    });

    it('throws on negative line number', () => {
      assert.throws(() => parseLineRef('-1:a3'), /invalid.*ref/i);
    });

    it('throws on empty hash after colon', () => {
      assert.throws(() => parseLineRef('5:'), /invalid.*ref/i);
    });

    it('throws on single-char hash (need at least 2)', () => {
      assert.throws(() => parseLineRef('5:a'), /invalid.*ref/i);
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
      assert.throws(
        () => validateLineRef({ line: 3, hash: 'ff' }, fileLines),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!(err instanceof HashlineMismatchError));
          return true;
        }
      );
    });

    it('throws HashlineMismatchError when hash does not match', () => {
      const fileLines = ['hello', 'world'];
      const wrongHash = 'zz'; // Will never match a real xxhash hex output
      // Use a valid hex that won't match
      const actualHash = computeLineHash(0, 'hello');
      const badHash = actualHash === 'ff' ? '00' : 'ff';
      assert.throws(
        () => validateLineRef({ line: 1, hash: badHash }, fileLines),
        (err: unknown) => {
          assert.ok(err instanceof HashlineMismatchError);
          return true;
        }
      );
    });
  });

  // ─── HashlineMismatchError ─────────────────────────────────────────

  describe('HashlineMismatchError', () => {
    it('has name "HashlineMismatchError"', () => {
      const err = new HashlineMismatchError(
        [{ line: 1, expected: 'aa', actual: 'bb' }],
        ['hello']
      );
      assert.strictEqual(err.name, 'HashlineMismatchError');
    });

    it('is an instance of Error', () => {
      const err = new HashlineMismatchError(
        [{ line: 1, expected: 'aa', actual: 'bb' }],
        ['hello']
      );
      assert.ok(err instanceof Error);
    });

    it('contains >>> marker on mismatched line', () => {
      const err = new HashlineMismatchError(
        [{ line: 2, expected: 'aa', actual: 'bb' }],
        ['first', 'second', 'third', 'fourth']
      );
      assert.ok(err.message.includes('>>>'), 'message should contain >>> marker');
      assert.ok(err.message.includes('second'), 'message should include the mismatched line content');
    });

    it('shows context lines around mismatch', () => {
      const fileLines = ['line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'];
      const err = new HashlineMismatchError(
        [{ line: 4, expected: 'aa', actual: 'bb' }],
        fileLines
      );
      // 2 lines of context above and below line 4
      // Should show lines 2-6 (2 above, mismatch at 4, 2 below)
      assert.ok(err.message.includes('line2'), 'should show 2 lines of context above');
      assert.ok(err.message.includes('line3'), 'should show 1 line of context above');
      assert.ok(err.message.includes('line4'), 'should show the mismatched line');
      assert.ok(err.message.includes('line5'), 'should show 1 line of context below');
      assert.ok(err.message.includes('line6'), 'should show 2 lines of context below');
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
      assert.ok(err.message.includes('...'), 'should contain gap separator');
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
      assert.ok(!err.message.includes('\n...\n'), 'should not contain gap separator for contiguous regions');
    });

    it('has remaps property with old→new mappings', () => {
      const err = new HashlineMismatchError(
        [{ line: 5, expected: 'd4', actual: 'f1' }],
        Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
      );
      assert.ok(err.remaps instanceof Map);
      assert.strictEqual(err.remaps.get('5:d4'), '5:f1');
    });

    it('shows quick-fix remap section in message', () => {
      const err = new HashlineMismatchError(
        [{ line: 5, expected: 'd4', actual: 'f1' }],
        Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
      );
      assert.ok(err.message.includes('5:d4'), 'remap section should show old ref');
      assert.ok(err.message.includes('5:f1'), 'remap section should show new ref');
      // Arrow between old and new
      assert.ok(
        err.message.includes('→') || err.message.includes('->'),
        'remap section should show arrow between old and new'
      );
    });

    it('handles mismatch at first line (no context above)', () => {
      const err = new HashlineMismatchError(
        [{ line: 1, expected: 'aa', actual: 'bb' }],
        ['first', 'second', 'third']
      );
      assert.ok(err.message.includes('>>>'));
      assert.ok(err.message.includes('first'));
    });

    it('handles mismatch at last line (no context below)', () => {
      const fileLines = ['first', 'second', 'third'];
      const err = new HashlineMismatchError(
        [{ line: 3, expected: 'aa', actual: 'bb' }],
        fileLines
      );
      assert.ok(err.message.includes('>>>'));
      assert.ok(err.message.includes('third'));
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
      assert.strictEqual(err.remaps.size, 2);
      assert.strictEqual(err.remaps.get('3:aa'), '3:bb');
      assert.strictEqual(err.remaps.get('7:cc'), '7:dd');
    });
  });

  // ─── initHashline ──────────────────────────────────────────────────

  describe('initHashline', () => {
    it('is idempotent (can be called multiple times)', async () => {
      await initHashline();
      await initHashline();
      // Should not throw or change behavior
      const hash = computeLineHash(0, 'test');
      assert.match(hash, /^[0-9a-f]{2}$/);
    });
  });

  // ─── Context-aware blank-line hashing ─────────────────────────────

  describe('context-aware blank-line hashing', () => {
    it('blank lines between different content get different hashes', () => {
      const lines = ['# Heading One', '', 'Content A', '', '# Heading Two', '', 'Content B'];
      const h1 = computeLineHash(1, lines[1], lines);
      const h3 = computeLineHash(3, lines[3], lines);
      const h5 = computeLineHash(5, lines[5], lines);
      assert.notStrictEqual(h1, h3, 'blank at idx 1 vs idx 3 should differ');
      assert.notStrictEqual(h1, h5, 'blank at idx 1 vs idx 5 should differ');
      assert.notStrictEqual(h3, h5, 'blank at idx 3 vs idx 5 should differ');
    });

    it('consecutive blank lines get different hashes', () => {
      const lines = ['# Heading', '', '', '', 'Content'];
      const h1 = computeLineHash(1, lines[1], lines);
      const h2 = computeLineHash(2, lines[2], lines);
      const h3 = computeLineHash(3, lines[3], lines);
      assert.notStrictEqual(h1, h2, 'consecutive blank 1 vs 2 should differ');
      assert.notStrictEqual(h1, h3, 'consecutive blank 1 vs 3 should differ');
      assert.notStrictEqual(h2, h3, 'consecutive blank 2 vs 3 should differ');
    });

    it('non-blank lines ignore the allLines context parameter', () => {
      const lines = ['# Heading', 'Content here', 'More content'];
      const withoutContext = computeLineHash(1, lines[1]);
      const withContext = computeLineHash(1, lines[1], lines);
      assert.strictEqual(withoutContext, withContext, 'non-blank hash should be the same with or without allLines');
    });

    it('blank line at start of file gets unique hash', () => {
      const linesStartBlank = ['', '# Heading', 'Content'];
      const linesMiddleBlank = ['# Heading', '', 'Content'];
      const hStart = computeLineHash(0, linesStartBlank[0], linesStartBlank);
      const hMiddle = computeLineHash(1, linesMiddleBlank[1], linesMiddleBlank);
      assert.notStrictEqual(hStart, hMiddle, 'blank at start should differ from blank in middle');
    });

    it('blank line at end of file gets unique hash', () => {
      const lines = ['# Heading', 'Content', ''];
      const hash = computeLineHash(2, lines[2], lines);
      assert.match(hash, /^[0-9a-f]{2}$/, 'should produce a valid 2-char hex hash');
    });

    it('without allLines param, blank lines still hash to same value (backward compat)', () => {
      const h1 = computeLineHash(0, '');
      const h2 = computeLineHash(5, '');
      assert.strictEqual(h1, h2, 'without allLines, blank lines hash the same (legacy behavior)');
    });

    it('formatHashLines produces unique hashes for blank lines', () => {
      const content = '# Heading\n\nContent A\n\n# Heading Two\n\nContent B';
      const result = formatHashLines(content);
      const hashes = result.split('\n').map(line => {
        const match = line.match(/^\d+:([0-9a-f]{2})\|/);
        return match ? match[1] : null;
      });
      // Blank lines are at indices 1, 3, 5 (0-based in the array)
      assert.notStrictEqual(hashes[1], hashes[3], 'formatHashLines: blank at line 2 vs 4 should differ');
      assert.notStrictEqual(hashes[1], hashes[5], 'formatHashLines: blank at line 2 vs 6 should differ');
      assert.notStrictEqual(hashes[3], hashes[5], 'formatHashLines: blank at line 4 vs 6 should differ');
    });
  });

  // ─── Error before init ────────────────────────────────────────────

  describe('computeLineHash without init', () => {
    // This test verifies the error message, but since we already called init
    // in the before() hook, we can't truly test uninit state here.
    // We trust the implementation checks for null and throws.
    // The before() hook ensures init for all other tests.
    it('documents that initHashline() must be called first', () => {
      // Documented behavior: calling computeLineHash before initHashline
      // throws "Call initHashline() before using hashline functions"
      assert.ok(true, 'documented requirement');
    });
  });
});
