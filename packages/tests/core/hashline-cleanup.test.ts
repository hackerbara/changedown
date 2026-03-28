import { describe, it, expect } from 'vitest';
import {
  stripHashlinePrefixes,
  detectNoOp,
  relocateHashRef,
  stripBoundaryEcho,
} from '@changedown/core/internals';

describe('hashline-cleanup', () => {
  // ─── stripHashlinePrefixes ──────────────────────────────────────────

  describe('stripHashlinePrefixes', () => {
    it('strips LINE:HASH| prefixes when majority of lines have them', () => {
      const lines = [
        '1:a3|Hello world',
        '2:b7|This is a test',
        '3:f0|Another line',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual([
        'Hello world',
        'This is a test',
        'Another line',
      ]);
    });

    it('strips prefixes with multi-digit line numbers', () => {
      const lines = [
        '100:ab|Line one hundred',
        '101:cd|Line one hundred and one',
        '102:ef|Line one hundred and two',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual([
        'Line one hundred',
        'Line one hundred and one',
        'Line one hundred and two',
      ]);
    });

    it('strips prefixes with longer hashes (up to 16 chars)', () => {
      const lines = [
        '5:abcdef0123456789|Long hash line',
        '6:1234567890abcdef|Another long hash',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual([
        'Long hash line',
        'Another long hash',
      ]);
    });

    it('does NOT strip when minority of lines have the prefix', () => {
      const lines = [
        '1:a3|This has a prefix',
        'This is normal text',
        'More normal text',
        'Even more normal text',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual(lines);
    });

    it('skips empty lines when computing majority threshold', () => {
      const lines = [
        '1:a3|Hello',
        '',
        '3:f0|World',
        '',
      ];
      // 2 non-empty, both have prefix => 100% majority => strip
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual([
        'Hello',
        '',
        'World',
        '',
      ]);
    });

    it('handles lines with empty content after prefix', () => {
      const lines = [
        '1:a3|',
        '2:b7|Some content',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual([
        '',
        'Some content',
      ]);
    });

    it('returns unchanged for lines without any prefix pattern', () => {
      const lines = [
        'Just normal text',
        'Nothing special here',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual(lines);
    });

    it('returns unchanged for empty input', () => {
      const result = stripHashlinePrefixes([]);
      expect(result).toStrictEqual([]);
    });

    it('handles exactly 50% threshold (strips)', () => {
      // 2 non-empty lines, 1 has prefix = 50% exactly => strip
      const lines = [
        '1:a3|Prefixed line',
        'Normal line',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual([
        'Prefixed line',
        'Normal line',
      ]);
    });

    it('does NOT strip when below 50% threshold', () => {
      // 3 non-empty lines, 1 has prefix = 33% < 50% => no strip
      const lines = [
        '1:a3|Prefixed line',
        'Normal line',
        'Another normal line',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual(lines);
    });

    // ─── Diff prefix stripping ──────────────────────────────────────

    it('strips + diff prefixes when majority have them', () => {
      const lines = [
        '+Added line one',
        '+Added line two',
        '+Added line three',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual([
        'Added line one',
        'Added line two',
        'Added line three',
      ]);
    });

    it('does NOT strip ++ (diff header markers)', () => {
      const lines = [
        '++ b/file.ts',
        '+Added line',
        '+Another add',
      ];
      // The ++ line should not be considered a diff prefix
      // Only 2 of 3 non-empty lines have + prefix => 66% => strip
      // But ++ line doesn't match ^+(?!\+)
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual([
        '++ b/file.ts',
        'Added line',
        'Another add',
      ]);
    });

    it('does NOT strip + diff prefix when minority have it', () => {
      const lines = [
        '+One prefixed',
        'Normal line two',
        'Normal line three',
        'Normal line four',
      ];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual(lines);
    });

    it('prioritizes hashline prefix over diff prefix', () => {
      // When both hashline and diff prefixes are present, hashline wins
      const lines = [
        '1:a3|+Added with hashline',
        '2:b7|+More added with hashline',
      ];
      const result = stripHashlinePrefixes(lines);
      // Should strip hashline prefix, leaving +Added...
      expect(result).toStrictEqual([
        '+Added with hashline',
        '+More added with hashline',
      ]);
    });

    it('handles single non-empty line with prefix', () => {
      const lines = ['5:ff|Only line'];
      const result = stripHashlinePrefixes(lines);
      expect(result).toStrictEqual(['Only line']);
    });
  });

  // ─── detectNoOp ────────────────────────────────────────────────────

  describe('detectNoOp', () => {
    it('returns true for identical content', () => {
      expect(detectNoOp('hello world', 'hello world')).toBe(true);
    });

    it('returns true when only whitespace differs', () => {
      expect(
        detectNoOp('hello   world', 'hello world'),
      ).toBe(true);
    });

    it('returns true when leading/trailing whitespace differs', () => {
      expect(
        detectNoOp('  hello world  ', 'hello world'),
      ).toBe(true);
    });

    it('returns true when newlines vs spaces differ', () => {
      expect(
        detectNoOp('hello\nworld', 'hello world'),
      ).toBe(true);
    });

    it('returns true when tabs vs spaces differ', () => {
      expect(
        detectNoOp('hello\tworld', 'hello world'),
      ).toBe(true);
    });

    it('returns false for genuinely different content', () => {
      expect(
        detectNoOp('hello world', 'goodbye world'),
      ).toBe(false);
    });

    it('returns false for content with added words', () => {
      expect(
        detectNoOp('hello world', 'hello beautiful world'),
      ).toBe(false);
    });

    it('returns true for empty strings', () => {
      expect(detectNoOp('', '')).toBe(true);
    });

    it('returns true for whitespace-only vs empty', () => {
      expect(detectNoOp('   \n\t  ', '')).toBe(true);
    });

    it('handles mixed whitespace normalization', () => {
      expect(
        detectNoOp('  hello  \n  world  \t', 'hello world'),
      ).toBe(true);
    });
  });

  // ─── relocateHashRef ──────────────────────────────────────────────

  describe('relocateHashRef', () => {
    // Simple hash function for testing — maps line content to a deterministic hash
    const testHash = (idx: number, line: string): string => {
      // Simple hash: first 2 chars of content, lowercased, or '00' for empty
      const stripped = line.replace(/\s+/g, '');
      if (stripped.length === 0) return '00';
      // Use a simple numeric hash mod 256 for predictability
      let h = 0;
      for (let i = 0; i < stripped.length; i++) {
        h = (h * 31 + stripped.charCodeAt(i)) % 256;
      }
      return h.toString(16).padStart(2, '0');
    };

    it('returns null when hash matches at expected line', () => {
      const fileLines = ['alpha', 'beta', 'gamma'];
      const hash = testHash(1, 'beta');
      const result = relocateHashRef(
        { line: 2, hash },
        fileLines,
        testHash,
      );
      // Hash matches at line 2, no relocation needed
      expect(result).toBeNull();
    });

    it('relocates when line moved to a different position', () => {
      const fileLines = ['alpha', 'gamma', 'delta', 'beta'];
      // beta was at line 2, now at line 4
      const hash = testHash(1, 'beta'); // hash of 'beta'
      const result = relocateHashRef(
        { line: 2, hash },
        fileLines,
        testHash,
      );
      expect(result !== null).toBeTruthy();
      expect(result!.relocated).toBe(true);
      expect(result!.newLine).toBe(4); // 1-indexed
    });

    it('returns null when hash not found anywhere', () => {
      const fileLines = ['alpha', 'gamma', 'delta'];
      // Hash for 'beta' which is not in the file
      const hash = testHash(0, 'beta');
      const result = relocateHashRef(
        { line: 1, hash },
        fileLines,
        testHash,
      );
      expect(result).toBeNull();
    });

    it('returns null when hash is ambiguous (multiple matches)', () => {
      // Create duplicate content so hash appears multiple times
      const fileLines = ['alpha', 'beta', 'beta', 'gamma'];
      const hash = testHash(0, 'beta');
      const result = relocateHashRef(
        { line: 1, hash }, // ref at line 1 (alpha), looking for beta's hash
        fileLines,
        testHash,
      );
      // beta appears at lines 2 and 3 => ambiguous
      expect(result).toBeNull();
    });

    it('handles ref.line out of bounds', () => {
      const fileLines = ['alpha', 'beta'];
      const hash = testHash(0, 'beta');
      const result = relocateHashRef(
        { line: 10, hash },
        fileLines,
        testHash,
      );
      // Line 10 doesn't exist, but beta is uniquely at line 2
      expect(result !== null).toBeTruthy();
      expect(result!.relocated).toBe(true);
      expect(result!.newLine).toBe(2);
    });

    it('handles empty file', () => {
      const result = relocateHashRef(
        { line: 1, hash: 'ab' },
        [],
        testHash,
      );
      expect(result).toBeNull();
    });

    it('handles single-line file with matching hash', () => {
      const fileLines = ['alpha'];
      const hash = testHash(0, 'alpha');
      const result = relocateHashRef(
        { line: 5, hash }, // wrong line number
        fileLines,
        testHash,
      );
      expect(result !== null).toBeTruthy();
      expect(result!.relocated).toBe(true);
      expect(result!.newLine).toBe(1);
    });
  });

  // ─── stripBoundaryEcho ─────────────────────────────────────────────

  describe('stripBoundaryEcho', () => {
    it('strips echoed context line before startLine', () => {
      const fileLines = [
        'line before',     // line 1
        'start line',      // line 2 (startLine)
        'end line',        // line 3 (endLine)
        'line after',      // line 4
      ];
      const newLines = [
        'line before',     // echoed context (matches fileLines[0])
        'replaced start',
        'replaced end',
        'new extra line',
      ];
      // startLine=2, endLine=3 (1-indexed), original span = 2 lines, newLines = 4 => grew
      const result = stripBoundaryEcho(fileLines, 2, 3, newLines);
      expect(result).toStrictEqual([
        'replaced start',
        'replaced end',
        'new extra line',
      ]);
    });

    it('strips echoed context line after endLine', () => {
      const fileLines = [
        'line before',     // line 1
        'start line',      // line 2 (startLine)
        'end line',        // line 3 (endLine)
        'line after',      // line 4
      ];
      const newLines = [
        'replaced start',
        'replaced end',
        'new extra line',
        'line after',      // echoed context (matches fileLines[3])
      ];
      const result = stripBoundaryEcho(fileLines, 2, 3, newLines);
      expect(result).toStrictEqual([
        'replaced start',
        'replaced end',
        'new extra line',
      ]);
    });

    it('strips both leading and trailing echoed lines', () => {
      const fileLines = [
        'context above',   // line 1
        'target line',     // line 2 (startLine = endLine)
        'context below',   // line 3
      ];
      const newLines = [
        'context above',   // echo of line before
        'modified target',
        'new extra',
        'context below',   // echo of line after
      ];
      const result = stripBoundaryEcho(fileLines, 2, 2, newLines);
      expect(result).toStrictEqual([
        'modified target',
        'new extra',
      ]);
    });

    it('does NOT strip when replacement did not grow', () => {
      const fileLines = [
        'context above',
        'target line',
        'context below',
      ];
      const newLines = [
        'context above',  // looks like echo, but replacement didn't grow
      ];
      // startLine=2, endLine=2, original span = 1, newLines.length = 1 => no growth
      const result = stripBoundaryEcho(fileLines, 2, 2, newLines);
      expect(result).toStrictEqual(newLines);
    });

    it('matches ignoring whitespace differences', () => {
      const fileLines = [
        '  line  before  ',
        'target',
        'after',
      ];
      const newLines = [
        'line before',     // matches after whitespace normalization
        'modified target',
        'new line',
      ];
      const result = stripBoundaryEcho(fileLines, 2, 2, newLines);
      expect(result).toStrictEqual([
        'modified target',
        'new line',
      ]);
    });

    it('handles no context line before startLine (first line of file)', () => {
      const fileLines = [
        'first line',      // line 1 = startLine
        'second line',     // line 2 = endLine
        'after context',   // line 3
      ];
      const newLines = [
        'new first',
        'new second',
        'extra line',
        'after context',   // echo of line after
      ];
      // startLine=1, no line before => only check trailing echo
      const result = stripBoundaryEcho(fileLines, 1, 2, newLines);
      expect(result).toStrictEqual([
        'new first',
        'new second',
        'extra line',
      ]);
    });

    it('handles no context line after endLine (last line of file)', () => {
      const fileLines = [
        'before context',  // line 1
        'last line',       // line 2 = startLine = endLine
      ];
      const newLines = [
        'before context',  // echo of line before
        'modified last',
        'extra line',
      ];
      // endLine=2, no line after => only check leading echo
      const result = stripBoundaryEcho(fileLines, 2, 2, newLines);
      expect(result).toStrictEqual([
        'modified last',
        'extra line',
      ]);
    });

    it('returns unchanged when no boundary echoes detected', () => {
      const fileLines = [
        'context above',
        'target',
        'context below',
      ];
      const newLines = [
        'completely new line 1',
        'completely new line 2',
        'completely new line 3',
      ];
      // Grew (3 > 1), but no echo at boundaries
      const result = stripBoundaryEcho(fileLines, 2, 2, newLines);
      expect(result).toStrictEqual(newLines);
    });

    it('returns unchanged for empty newLines', () => {
      const fileLines = ['before', 'target', 'after'];
      const result = stripBoundaryEcho(fileLines, 2, 2, []);
      expect(result).toStrictEqual([]);
    });
  });

});
