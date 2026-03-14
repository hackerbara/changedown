import { describe, it, expect, beforeAll } from 'vitest';
import {
  initHashline,
  computeLineHash,
  settledLine,
  computeSettledLineHash,
  formatTrackedHashLines,
  formatTrackedHeader,
} from '@changetracks/core/internals';

describe('hashline-tracked', () => {
  beforeAll(async () => {
    await initHashline();
  });

  // ─── settledLine ──────────────────────────────────────────────────────

  describe('settledLine', () => {
    it('passes through plain text unchanged', () => {
      expect(settledLine('Hello world')).toBe('Hello world');
    });

    it('passes through empty string', () => {
      expect(settledLine('')).toBe('');
    });

    it('strips insertion markup, keeps content (accept-all)', () => {
      expect(settledLine('Hello {++beautiful ++}world')).toBe('Hello beautiful world');
    });

    it('strips deletion markup and content entirely', () => {
      expect(settledLine('Hello {--ugly --}world')).toBe('Hello world');
    });

    it('strips substitution markup, keeps new text (after ~>)', () => {
      expect(settledLine('Hello {~~old~>new~~} world')).toBe('Hello new world');
    });

    it('strips highlight markup, keeps content', () => {
      expect(settledLine('Hello {==important==} world')).toBe('Hello important world');
    });

    it('strips comment markup entirely', () => {
      expect(settledLine('Hello {>>note<<} world')).toBe('Hello  world');
    });

    it('strips footnote references [^ct-N]', () => {
      expect(settledLine('Hello[^ct-1] world')).toBe('Hello world');
    });

    it('strips dotted footnote references [^ct-N.M]', () => {
      expect(settledLine('Hello[^ct-1.2] world')).toBe('Hello world');
    });

    it('handles multiple markup instances on one line', () => {
      expect(
        settledLine('Start {++added++} middle {--removed--} end'),
      ).toBe('Start added middle  end');
    });

    it('handles adjacent markup (highlight + comment)', () => {
      expect(
        settledLine('Check {==this text==}{>>important<<} carefully'),
      ).toBe('Check this text carefully');
    });

    it('handles multiple footnote refs', () => {
      expect(
        settledLine('A[^ct-1] B[^ct-2] C[^ct-3.1]'),
      ).toBe('A B C');
    });

    it('handles mixed content: markup + footnote refs + plain text', () => {
      expect(
        settledLine('Hello {++new ++}[^ct-1]{--old --}[^ct-2]world'),
      ).toBe('Hello new world');
    });

    it('handles substitution with multi-word content', () => {
      expect(
        settledLine('{~~the quick brown fox~>a lazy dog~~}'),
      ).toBe('a lazy dog');
    });

    it('handles insertion at start of line', () => {
      expect(settledLine('{++Start ++}of line')).toBe('Start of line');
    });

    it('handles deletion at end of line', () => {
      expect(settledLine('End of line{-- removed--}')).toBe('End of line');
    });

    it('handles line with only markup (all deleted)', () => {
      expect(settledLine('{--everything goes--}')).toBe('');
    });

    it('handles line with only markup (all inserted)', () => {
      expect(settledLine('{++everything stays++}')).toBe('everything stays');
    });

    it('preserves whitespace outside markup', () => {
      expect(settledLine('  indented {++text++}  ')).toBe('  indented text  ');
    });
  });

  // ─── computeSettledLineHash ───────────────────────────────────────────

  describe('computeSettledLineHash', () => {
    it('line with markup settles to same hash as manually-stripped line', () => {
      const markupLine = 'Hello {++beautiful ++}world';
      const strippedLine = 'Hello beautiful world';
      const settledHash = computeSettledLineHash(0, markupLine);
      const directHash = computeLineHash(0, strippedLine);
      expect(settledHash).toBe(directHash);
    });

    it('line without markup: settled hash equals raw hash', () => {
      const plain = 'Hello world';
      const settledHash = computeSettledLineHash(0, plain);
      const rawHash = computeLineHash(0, plain);
      expect(settledHash).toBe(rawHash);
    });

    it('deletion line settles to hash of empty content', () => {
      const markupLine = '{--removed text--}';
      const settledHash = computeSettledLineHash(0, markupLine);
      const emptyHash = computeLineHash(0, '');
      expect(settledHash).toBe(emptyHash);
    });

    it('substitution line settles to hash of new text', () => {
      const markupLine = '{~~old~>new~~}';
      const settledHash = computeSettledLineHash(0, markupLine);
      const newTextHash = computeLineHash(0, 'new');
      expect(settledHash).toBe(newTextHash);
    });

    it('returns 2-char hex hash', () => {
      const hash = computeSettledLineHash(0, 'Hello {++world++}');
      expect(hash).toMatch(/^[0-9a-f]{2}$/);
    });

    it('backward compat: works without allSettledLines parameter', () => {
      const hash = computeSettledLineHash(0, '# Heading');
      expect(hash).toMatch(/^[0-9a-f]{2}$/);
    });
  });

  // ─── context-aware settled blank-line hashing ──────────────────────────

  describe('context-aware settled blank-line hashing', () => {
    it('blank lines in settled view get different hashes with allSettledLines', () => {
      const lines = [
        '# Heading',
        '',
        'Content A',
        '',
        '# Heading Two',
      ];
      const allSettled = lines.map(l => settledLine(l));
      const hash1 = computeSettledLineHash(1, lines[1], allSettled);
      const hash3 = computeSettledLineHash(3, lines[3], allSettled);
      expect(hash1).not.toBe(hash3);
    });

    it('blank lines after stripping markup get context-aware hashes', () => {
      const lines = [
        '# Title',
        '{--removed content--}',  // settles to ''
        'Middle paragraph',
        '',                        // already blank
        '# Another Title',
      ];
      const allSettled = lines.map(l => settledLine(l));
      // Line 1 (markup that settles to blank) and line 3 (plain blank) should differ
      const hash1 = computeSettledLineHash(1, lines[1], allSettled);
      const hash3 = computeSettledLineHash(3, lines[3], allSettled);
      expect(hash1).not.toBe(hash3);
    });

    it('settled hashes with context match direct computeLineHash with same context', () => {
      const lines = ['Hello {++beautiful ++}world', 'Second line'];
      const allSettled = lines.map(l => settledLine(l));
      const settledHash = computeSettledLineHash(0, lines[0], allSettled);
      const directHash = computeLineHash(0, 'Hello beautiful world', allSettled);
      expect(settledHash).toBe(directHash);
    });
  });

  // ─── formatTrackedHashLines ───────────────────────────────────────────

  describe('formatTrackedHashLines', () => {
    it('lines without markup get single hash (LINE:HASH|CONTENT)', () => {
      const result = formatTrackedHashLines('Hello world\nSecond line');
      const lines = result.split('\n');
      // Single hash format: no dot separator
      expect(lines[0]).toMatch(/^\s*1:[0-9a-f]{2}\|Hello world$/);
      expect(lines[1]).toMatch(/^\s*2:[0-9a-f]{2}\|Second line$/);
    });

    it('lines with markup also get single hash (LINE:HASH|CONTENT)', () => {
      const result = formatTrackedHashLines('Hello {++world++}');
      const lines = result.split('\n');
      // Single hash format: no dot separator
      expect(lines[0]).toMatch(/^\s*1:[0-9a-f]{2}\|Hello \{\+\+world\+\+\}$/);
    });

    it('right-aligns line numbers', () => {
      // Create content with 10+ lines to see right-alignment
      const content = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n');
      const result = formatTrackedHashLines(content);
      const lines = result.split('\n');
      // Line 1 should be padded: " 1:xx|..." and line 12: "12:xx|..."
      expect(lines[0]).toMatch(/^\s+1:[0-9a-f]{2}\|/);
      expect(lines[11]).toMatch(/^12:[0-9a-f]{2}\|/);
    });

    it('single-digit lines do not pad when total lines < 10', () => {
      const content = 'one\ntwo\nthree';
      const result = formatTrackedHashLines(content);
      const lines = result.split('\n');
      // 3 lines total: line numbers 1-3, all single digit, no padding needed
      expect(lines[0]).toMatch(/^1:[0-9a-f]{2}\|one$/);
    });

    it('handles custom startLine', () => {
      const result = formatTrackedHashLines('Hello\nWorld', { startLine: 5 });
      const lines = result.split('\n');
      expect(lines[0]).toMatch(/^5:[0-9a-f]{2}\|Hello$/);
      expect(lines[1]).toMatch(/^6:[0-9a-f]{2}\|World$/);
    });

    it('mixed lines: all get single hash format', () => {
      const content = 'Plain line\nMarkup {++here++} line\nAnother plain';
      const result = formatTrackedHashLines(content);
      const lines = result.split('\n');

      // All lines should have single hash (no dot separator)
      for (const line of lines) {
        expect(line).not.toMatch(/\.[0-9a-f]{2}\|/);
        expect(line).toMatch(/:[0-9a-f]{2}\|/);
      }
    });

    it('handles empty content', () => {
      const result = formatTrackedHashLines('');
      expect(result).toMatch(/^\s*1:[0-9a-f]{2}\|$/);
    });
  });

  // ─── formatTrackedHeader ──────────────────────────────────────────────

  describe('formatTrackedHeader', () => {
    it('generates basic header with file path', () => {
      const header = formatTrackedHeader('docs/example.md', 'Hello world');
      expect(header.includes('## file: docs/example.md')).toBeTruthy();
    });

    it('includes tracking status', () => {
      const header = formatTrackedHeader('test.md', 'Hello', 'tracked');
      expect(header.includes('## tracking: tracked')).toBeTruthy();
    });

    it('defaults tracking status to "tracked"', () => {
      const header = formatTrackedHeader('test.md', 'Hello');
      expect(header.includes('## tracking: tracked')).toBeTruthy();
    });

    it('counts proposed/accepted/rejected changes', () => {
      const content = [
        'Hello {++world++}[^ct-1] and {--gone--}[^ct-2]',
        '',
        '[^ct-1]: @a | 2026-02-11 | ins | proposed',
        '[^ct-2]: @a | 2026-02-11 | del | accepted',
      ].join('\n');
      const header = formatTrackedHeader('test.md', content);
      expect(header.includes('1 proposed')).toBeTruthy();
      expect(header.includes('1 accepted')).toBeTruthy();
    });

    it('counts rejected changes', () => {
      const content = [
        'Hello {++world++}[^ct-1]',
        '',
        '[^ct-1]: @a | 2026-02-11 | ins | rejected',
      ].join('\n');
      const header = formatTrackedHeader('test.md', content);
      expect(header.includes('1 rejected')).toBeTruthy();
    });

    it('counts Level 0 changes (no footnote) as proposed', () => {
      const content = 'Hello {++world++} and {--gone--}';
      const header = formatTrackedHeader('test.md', content);
      expect(header.includes('2 proposed')).toBeTruthy();
    });

    it('includes line count', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const header = formatTrackedHeader('test.md', content);
      expect(header.includes('## lines: 1-3 of 3')).toBeTruthy();
    });

    it('includes tip line', () => {
      const header = formatTrackedHeader('test.md', 'Hello');
      expect(header.includes('## tip:')).toBeTruthy();
    });

    it('handles content with no changes (zero counts)', () => {
      const header = formatTrackedHeader('test.md', 'Plain text only');
      // Should not show counts or show 0 for all
      expect(header.includes('## tracking: tracked')).toBeTruthy();
    });

    it('uses custom tracking status', () => {
      const header = formatTrackedHeader('test.md', 'Hello', 'untracked');
      expect(header.includes('## tracking: untracked')).toBeTruthy();
    });

    it('shows standard tip', () => {
      const content = 'Line one\n{++added++}[^ct-1]\n\n[^ct-1]: @test | 2026-02-12 | ins | proposed';
      const header = formatTrackedHeader('/path/to/file.md', content, 'tracked');
      expect(header.includes('LINE:HASH')).toBeTruthy();
      expect(!header.includes('RAW.SETTLED')).toBeTruthy();
    });
  });
});
