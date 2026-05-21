import { describe, it, expect, beforeAll } from 'vitest';
import {
  initHashline,
  computeLineHash,
  currentLine,
  computeCurrentLineHash,
  formatTrackedHashLines,
  formatTrackedHeader,
} from '@changedown/core/internals';

describe('hashline-tracked', () => {
  beforeAll(async () => {
    await initHashline();
  });

  // ─── currentLine ──────────────────────────────────────────────────────

  describe('currentLine', () => {
    it('passes through plain text unchanged', () => {
      expect(currentLine('Hello world')).toBe('Hello world');
    });

    it('passes through empty string', () => {
      expect(currentLine('')).toBe('');
    });

    it('strips insertion markup, keeps content (accept-all)', () => {
      expect(currentLine('Hello {++beautiful ++}world')).toBe('Hello beautiful world');
    });

    it('strips deletion markup and content entirely', () => {
      expect(currentLine('Hello {--ugly --}world')).toBe('Hello world');
    });

    it('strips substitution markup, keeps new text (after ~>)', () => {
      expect(currentLine('Hello {~~old~>new~~} world')).toBe('Hello new world');
    });

    it('strips highlight markup, keeps content', () => {
      expect(currentLine('Hello {==important==} world')).toBe('Hello important world');
    });

    it('strips comment markup entirely', () => {
      expect(currentLine('Hello {>>note<<} world')).toBe('Hello  world');
    });

    it('strips footnote references [^cn-N]', () => {
      expect(currentLine('Hello[^cn-1] world')).toBe('Hello world');
    });

    it('strips dotted footnote references [^cn-N.M]', () => {
      expect(currentLine('Hello[^cn-1.2] world')).toBe('Hello world');
    });

    it('handles multiple markup instances on one line', () => {
      expect(
        currentLine('Start {++added++} middle {--removed--} end'),
      ).toBe('Start added middle  end');
    });

    it('handles adjacent markup (highlight + comment)', () => {
      expect(
        currentLine('Check {==this text==}{>>important<<} carefully'),
      ).toBe('Check this text carefully');
    });

    it('handles multiple footnote refs', () => {
      expect(
        currentLine('A[^cn-1] B[^cn-2] C[^cn-3.1]'),
      ).toBe('A B C');
    });

    it('handles mixed content: markup + footnote refs + plain text', () => {
      expect(
        currentLine('Hello {++new ++}[^cn-1]{--old --}[^cn-2]world'),
      ).toBe('Hello new world');
    });

    it('handles substitution with multi-word content', () => {
      expect(
        currentLine('{~~the quick brown fox~>a lazy dog~~}'),
      ).toBe('a lazy dog');
    });

    it('handles insertion at start of line', () => {
      expect(currentLine('{++Start ++}of line')).toBe('Start of line');
    });

    it('handles deletion at end of line', () => {
      expect(currentLine('End of line{-- removed--}')).toBe('End of line');
    });

    it('handles line with only markup (all deleted)', () => {
      expect(currentLine('{--everything goes--}')).toBe('');
    });

    it('handles line with only markup (all inserted)', () => {
      expect(currentLine('{++everything stays++}')).toBe('everything stays');
    });

    it('preserves whitespace outside markup', () => {
      expect(currentLine('  indented {++text++}  ')).toBe('  indented text  ');
    });
  });

  // ─── computeCurrentLineHash ───────────────────────────────────────────

  describe('computeCurrentLineHash', () => {
    it('line with markup settles to same hash as manually-stripped line', () => {
      const markupLine = 'Hello {++beautiful ++}world';
      const strippedLine = 'Hello beautiful world';
      const currentHash = computeCurrentLineHash(0, markupLine);
      const directHash = computeLineHash(0, strippedLine);
      expect(currentHash).toBe(directHash);
    });

    it('line without markup: current hash equals raw hash', () => {
      const plain = 'Hello world';
      const currentHash = computeCurrentLineHash(0, plain);
      const rawHash = computeLineHash(0, plain);
      expect(currentHash).toBe(rawHash);
    });

    it('deletion line: current hash equals hash of empty content', () => {
      const markupLine = '{--removed text--}';
      const currentHash = computeCurrentLineHash(0, markupLine);
      const emptyHash = computeLineHash(0, '');
      expect(currentHash).toBe(emptyHash);
    });

    it('substitution line: current hash equals hash of new text', () => {
      const markupLine = '{~~old~>new~~}';
      const currentHash = computeCurrentLineHash(0, markupLine);
      const newTextHash = computeLineHash(0, 'new');
      expect(currentHash).toBe(newTextHash);
    });

    it('returns 2-char hex hash', () => {
      const hash = computeCurrentLineHash(0, 'Hello {++world++}');
      expect(hash).toMatch(/^[0-9a-f]{2}$/);
    });

    it('backward compat: works without allCurrentLines parameter', () => {
      const hash = computeCurrentLineHash(0, '# Heading');
      expect(hash).toMatch(/^[0-9a-f]{2}$/);
    });
  });

  // ─── context-aware settled blank-line hashing ──────────────────────────

  describe('context-aware settled blank-line hashing', () => {
    it('blank lines in current view get different hashes with allCurrentLines', () => {
      const lines = [
        '# Heading',
        '',
        'Content A',
        '',
        '# Heading Two',
      ];
      const allCurrent = lines.map(l => currentLine(l));
      const hash1 = computeCurrentLineHash(1, lines[1], allCurrent);
      const hash3 = computeCurrentLineHash(3, lines[3], allCurrent);
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
      const allCurrent = lines.map(l => currentLine(l));
      // Line 1 (markup that settles to blank) and line 3 (plain blank) should differ
      const hash1 = computeCurrentLineHash(1, lines[1], allCurrent);
      const hash3 = computeCurrentLineHash(3, lines[3], allCurrent);
      expect(hash1).not.toBe(hash3);
    });

    it('current hashes with context match direct computeLineHash with same context', () => {
      const lines = ['Hello {++beautiful ++}world', 'Second line'];
      const allCurrent = lines.map(l => currentLine(l));
      const currentHash = computeCurrentLineHash(0, lines[0], allCurrent);
      const directHash = computeLineHash(0, 'Hello beautiful world', allCurrent);
      expect(currentHash).toBe(directHash);
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
        'Hello {++world++}[^cn-1] and {--gone--}[^cn-2]',
        '',
        '[^cn-1]: @a | 2026-02-11 | ins | proposed',
        '[^cn-2]: @a | 2026-02-11 | del | accepted',
      ].join('\n');
      const header = formatTrackedHeader('test.md', content);
      expect(header.includes('1 proposed')).toBeTruthy();
      expect(header.includes('1 accepted')).toBeTruthy();
    });

    it('counts rejected changes', () => {
      const content = [
        'Hello {++world++}[^cn-1]',
        '',
        '[^cn-1]: @a | 2026-02-11 | ins | rejected',
      ].join('\n');
      const header = formatTrackedHeader('test.md', content);
      expect(header.includes('1 rejected')).toBeTruthy();
    });

    it('counts Level 0 changes (no footnote) as proposed', () => {
      const content = 'Hello {++world++} and {--gone--}';
      const header = formatTrackedHeader('test.md', content);
      expect(header.includes('2 proposed')).toBeTruthy();
    });

    it('does not count CriticMarkup inside audit footnotes as proposed Level 0 changes', () => {
      const content = [
        'A [^cn-1] B {++pending++}[^cn-2]',
        '',
        '[^cn-1]: @a | 2026-05-16 | ins | rejected',
        '    1:f9 A {++bad++} B',
        '[^cn-2]: @a | 2026-05-16 | ins | proposed',
      ].join('\n');

      const header = formatTrackedHeader('test.md', content, 'tracked');

      expect(header).toContain('1 proposed');
      expect(header).toContain('1 rejected');
      expect(header).not.toContain('2 proposed');
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
      const content = 'Line one\n{++added++}[^cn-1]\n\n[^cn-1]: @test | 2026-02-12 | ins | proposed';
      const header = formatTrackedHeader('/path/to/file.md', content, 'tracked');
      expect(header.includes('LINE:HASH')).toBeTruthy();
      expect(!header.includes('RAW.SETTLED')).toBeTruthy();
    });
  });
});
