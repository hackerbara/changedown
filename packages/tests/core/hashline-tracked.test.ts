import * as assert from 'node:assert';
import {
  initHashline,
  computeLineHash,
  settledLine,
  computeSettledLineHash,
  formatTrackedHashLines,
  formatTrackedHeader,
} from '@changetracks/core/internals';

describe('hashline-tracked', () => {
  before(async () => {
    await initHashline();
  });

  // ─── settledLine ──────────────────────────────────────────────────────

  describe('settledLine', () => {
    it('passes through plain text unchanged', () => {
      assert.strictEqual(settledLine('Hello world'), 'Hello world');
    });

    it('passes through empty string', () => {
      assert.strictEqual(settledLine(''), '');
    });

    it('strips insertion markup, keeps content (accept-all)', () => {
      assert.strictEqual(settledLine('Hello {++beautiful ++}world'), 'Hello beautiful world');
    });

    it('strips deletion markup and content entirely', () => {
      assert.strictEqual(settledLine('Hello {--ugly --}world'), 'Hello world');
    });

    it('strips substitution markup, keeps new text (after ~>)', () => {
      assert.strictEqual(settledLine('Hello {~~old~>new~~} world'), 'Hello new world');
    });

    it('strips highlight markup, keeps content', () => {
      assert.strictEqual(settledLine('Hello {==important==} world'), 'Hello important world');
    });

    it('strips comment markup entirely', () => {
      assert.strictEqual(settledLine('Hello {>>note<<} world'), 'Hello  world');
    });

    it('strips footnote references [^ct-N]', () => {
      assert.strictEqual(settledLine('Hello[^ct-1] world'), 'Hello world');
    });

    it('strips dotted footnote references [^ct-N.M]', () => {
      assert.strictEqual(settledLine('Hello[^ct-1.2] world'), 'Hello world');
    });

    it('handles multiple markup instances on one line', () => {
      assert.strictEqual(
        settledLine('Start {++added++} middle {--removed--} end'),
        'Start added middle  end',
      );
    });

    it('handles adjacent markup (highlight + comment)', () => {
      assert.strictEqual(
        settledLine('Check {==this text==}{>>important<<} carefully'),
        'Check this text carefully',
      );
    });

    it('handles multiple footnote refs', () => {
      assert.strictEqual(
        settledLine('A[^ct-1] B[^ct-2] C[^ct-3.1]'),
        'A B C',
      );
    });

    it('handles mixed content: markup + footnote refs + plain text', () => {
      assert.strictEqual(
        settledLine('Hello {++new ++}[^ct-1]{--old --}[^ct-2]world'),
        'Hello new world',
      );
    });

    it('handles substitution with multi-word content', () => {
      assert.strictEqual(
        settledLine('{~~the quick brown fox~>a lazy dog~~}'),
        'a lazy dog',
      );
    });

    it('handles insertion at start of line', () => {
      assert.strictEqual(settledLine('{++Start ++}of line'), 'Start of line');
    });

    it('handles deletion at end of line', () => {
      assert.strictEqual(settledLine('End of line{-- removed--}'), 'End of line');
    });

    it('handles line with only markup (all deleted)', () => {
      assert.strictEqual(settledLine('{--everything goes--}'), '');
    });

    it('handles line with only markup (all inserted)', () => {
      assert.strictEqual(settledLine('{++everything stays++}'), 'everything stays');
    });

    it('preserves whitespace outside markup', () => {
      assert.strictEqual(settledLine('  indented {++text++}  '), '  indented text  ');
    });
  });

  // ─── computeSettledLineHash ───────────────────────────────────────────

  describe('computeSettledLineHash', () => {
    it('line with markup settles to same hash as manually-stripped line', () => {
      const markupLine = 'Hello {++beautiful ++}world';
      const strippedLine = 'Hello beautiful world';
      const settledHash = computeSettledLineHash(0, markupLine);
      const directHash = computeLineHash(0, strippedLine);
      assert.strictEqual(settledHash, directHash);
    });

    it('line without markup: settled hash equals raw hash', () => {
      const plain = 'Hello world';
      const settledHash = computeSettledLineHash(0, plain);
      const rawHash = computeLineHash(0, plain);
      assert.strictEqual(settledHash, rawHash);
    });

    it('deletion line settles to hash of empty content', () => {
      const markupLine = '{--removed text--}';
      const settledHash = computeSettledLineHash(0, markupLine);
      const emptyHash = computeLineHash(0, '');
      assert.strictEqual(settledHash, emptyHash);
    });

    it('substitution line settles to hash of new text', () => {
      const markupLine = '{~~old~>new~~}';
      const settledHash = computeSettledLineHash(0, markupLine);
      const newTextHash = computeLineHash(0, 'new');
      assert.strictEqual(settledHash, newTextHash);
    });

    it('returns 2-char hex hash', () => {
      const hash = computeSettledLineHash(0, 'Hello {++world++}');
      assert.match(hash, /^[0-9a-f]{2}$/);
    });

    it('backward compat: works without allSettledLines parameter', () => {
      const hash = computeSettledLineHash(0, '# Heading');
      assert.match(hash, /^[0-9a-f]{2}$/);
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
      assert.notStrictEqual(hash1, hash3);
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
      assert.notStrictEqual(hash1, hash3);
    });

    it('settled hashes with context match direct computeLineHash with same context', () => {
      const lines = ['Hello {++beautiful ++}world', 'Second line'];
      const allSettled = lines.map(l => settledLine(l));
      const settledHash = computeSettledLineHash(0, lines[0], allSettled);
      const directHash = computeLineHash(0, 'Hello beautiful world', allSettled);
      assert.strictEqual(settledHash, directHash);
    });
  });

  // ─── formatTrackedHashLines ───────────────────────────────────────────

  describe('formatTrackedHashLines', () => {
    it('lines without markup get single hash (LINE:HASH|CONTENT)', () => {
      const result = formatTrackedHashLines('Hello world\nSecond line');
      const lines = result.split('\n');
      // Single hash format: no dot separator
      assert.match(lines[0], /^\s*1:[0-9a-f]{2}\|Hello world$/);
      assert.match(lines[1], /^\s*2:[0-9a-f]{2}\|Second line$/);
    });

    it('lines with markup also get single hash (LINE:HASH|CONTENT)', () => {
      const result = formatTrackedHashLines('Hello {++world++}');
      const lines = result.split('\n');
      // Single hash format: no dot separator
      assert.match(lines[0], /^\s*1:[0-9a-f]{2}\|Hello \{\+\+world\+\+\}$/);
    });

    it('right-aligns line numbers', () => {
      // Create content with 10+ lines to see right-alignment
      const content = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n');
      const result = formatTrackedHashLines(content);
      const lines = result.split('\n');
      // Line 1 should be padded: " 1:xx|..." and line 12: "12:xx|..."
      assert.match(lines[0], /^\s+1:[0-9a-f]{2}\|/);
      assert.match(lines[11], /^12:[0-9a-f]{2}\|/);
    });

    it('single-digit lines do not pad when total lines < 10', () => {
      const content = 'one\ntwo\nthree';
      const result = formatTrackedHashLines(content);
      const lines = result.split('\n');
      // 3 lines total: line numbers 1-3, all single digit, no padding needed
      assert.match(lines[0], /^1:[0-9a-f]{2}\|one$/);
    });

    it('handles custom startLine', () => {
      const result = formatTrackedHashLines('Hello\nWorld', { startLine: 5 });
      const lines = result.split('\n');
      assert.match(lines[0], /^5:[0-9a-f]{2}\|Hello$/);
      assert.match(lines[1], /^6:[0-9a-f]{2}\|World$/);
    });

    it('mixed lines: all get single hash format', () => {
      const content = 'Plain line\nMarkup {++here++} line\nAnother plain';
      const result = formatTrackedHashLines(content);
      const lines = result.split('\n');

      // All lines should have single hash (no dot separator)
      for (const line of lines) {
        assert.ok(!line.match(/\.[0-9a-f]{2}\|/), 'all lines should have single hash');
        assert.ok(line.match(/:[0-9a-f]{2}\|/), 'all lines should have hash');
      }
    });

    it('handles empty content', () => {
      const result = formatTrackedHashLines('');
      assert.match(result, /^\s*1:[0-9a-f]{2}\|$/);
    });
  });

  // ─── formatTrackedHeader ──────────────────────────────────────────────

  describe('formatTrackedHeader', () => {
    it('generates basic header with file path', () => {
      const header = formatTrackedHeader('docs/example.md', 'Hello world');
      assert.ok(header.includes('## file: docs/example.md'));
    });

    it('includes tracking status', () => {
      const header = formatTrackedHeader('test.md', 'Hello', 'tracked');
      assert.ok(header.includes('## tracking: tracked'));
    });

    it('defaults tracking status to "tracked"', () => {
      const header = formatTrackedHeader('test.md', 'Hello');
      assert.ok(header.includes('## tracking: tracked'));
    });

    it('counts proposed/accepted/rejected changes', () => {
      const content = [
        'Hello {++world++}[^ct-1] and {--gone--}[^ct-2]',
        '',
        '[^ct-1]: @a | 2026-02-11 | ins | proposed',
        '[^ct-2]: @a | 2026-02-11 | del | accepted',
      ].join('\n');
      const header = formatTrackedHeader('test.md', content);
      assert.ok(header.includes('1 proposed'), `header should show 1 proposed, got: ${header}`);
      assert.ok(header.includes('1 accepted'), `header should show 1 accepted, got: ${header}`);
    });

    it('counts rejected changes', () => {
      const content = [
        'Hello {++world++}[^ct-1]',
        '',
        '[^ct-1]: @a | 2026-02-11 | ins | rejected',
      ].join('\n');
      const header = formatTrackedHeader('test.md', content);
      assert.ok(header.includes('1 rejected'), `header should show 1 rejected, got: ${header}`);
    });

    it('counts Level 0 changes (no footnote) as proposed', () => {
      const content = 'Hello {++world++} and {--gone--}';
      const header = formatTrackedHeader('test.md', content);
      assert.ok(header.includes('2 proposed'), `header should show 2 proposed for Level 0, got: ${header}`);
    });

    it('includes line count', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const header = formatTrackedHeader('test.md', content);
      assert.ok(header.includes('## lines: 1-3 of 3'), `header should show line count, got: ${header}`);
    });

    it('includes tip line', () => {
      const header = formatTrackedHeader('test.md', 'Hello');
      assert.ok(header.includes('## tip:'));
    });

    it('handles content with no changes (zero counts)', () => {
      const header = formatTrackedHeader('test.md', 'Plain text only');
      // Should not show counts or show 0 for all
      assert.ok(header.includes('## tracking: tracked'));
    });

    it('uses custom tracking status', () => {
      const header = formatTrackedHeader('test.md', 'Hello', 'untracked');
      assert.ok(header.includes('## tracking: untracked'));
    });

    it('shows standard tip', () => {
      const content = 'Line one\n{++added++}[^ct-1]\n\n[^ct-1]: @test | 2026-02-12 | ins | proposed';
      const header = formatTrackedHeader('/path/to/file.md', content, 'tracked');
      assert.ok(header.includes('LINE:HASH'), `tip should mention LINE:HASH, got: ${header}`);
      assert.ok(!header.includes('RAW.SETTLED'), `tip should NOT mention RAW.SETTLED, got: ${header}`);
    });
  });
});
