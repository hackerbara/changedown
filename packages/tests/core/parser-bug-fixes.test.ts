import { describe, it, expect } from 'vitest';
import { ChangeStatus, CriticMarkupParser } from '@changedown/core';
import { FootnoteNativeParser, injectGhostDelimiters } from '@changedown/core/internals';
import type { OffsetDecoration, ParsedFootnote } from '@changedown/core/internals';

// L3 document: body has deletion already applied ("brown " is absent).
// Edit-op uses contextual embedding syntax: contextBefore{--deleted--}contextAfter.
// This exercises the contextual-resolution branch (footnote-native-parser.ts:622-652).
describe('parser bug fixes', () => {
  describe('terminal footnote audit markup is metadata', () => {
    it('does not parse CriticMarkup inside terminal audit footnotes as Level 0 changes', () => {
      const input = [
        'A [^cn-1] B {++pending++}[^cn-2]',
        '',
        '[^cn-1]: @a | 2026-05-16 | ins | rejected',
        '    1:f9 A {++bad++} B',
        '[^cn-2]: @a | 2026-05-16 | ins | proposed',
      ].join('\n');

      const doc = new CriticMarkupParser().parse(input, { skipCodeBlocks: false });
      const changes = doc.getChanges();

      expect(changes.map((c) => c.id)).toContain('cn-1');
      expect(changes.map((c) => c.id)).toContain('cn-2');
      expect(changes.filter((c) => c.status === ChangeStatus.Proposed).map((c) => c.id)).toEqual(['cn-2']);
      expect(changes.some((c) => c.level === 0 && input.slice(c.range.start, c.range.end).includes('{++bad++}'))).toBe(false);
    });

    it('still parses indented body CriticMarkup immediately before terminal footnotes', () => {
      const input = [
        'Intro',
        '',
        '    indented {++body-code++}',
        '',
        '[^cn-1]: @a | 2026-05-16 | ins | accepted',
      ].join('\n');

      const doc = new CriticMarkupParser().parse(input, { skipCodeBlocks: false });
      const changes = doc.getChanges();

      expect(changes.some((c) => c.level === 0 && input.slice(c.range.start, c.range.end).includes('{++body-code++}'))).toBe(true);
    });
  });

  describe('bug 5: contextual deletion emits non-zero range', () => {
    it('emits range covering context span with deletionSeamOffset', () => {
      const l3Text = [
        '# Doc',
        '',
        'The quick fox jumped over the lazy dog.',
        '',
        '[^cn-1]: @alice | 2026-04-08 | del | proposed',
        '    3:ff The quick {--brown --}fox',
        '',
      ].join('\n');

      const parser = new FootnoteNativeParser();
      const doc = parser.parse(l3Text);
      const changes = doc.getChanges();

      expect(changes).toHaveLength(1);
      const change = changes[0];

      // range covers the full contextual span "The quick fox" (13 chars), not zero-width.
      expect(change.range.end).toBeGreaterThan(change.range.start);
      expect(change.range.end - change.range.start).toBe('The quick fox'.length);

      // deletionSeamOffset = contextBefore.length = "The quick ".length = 10.
      expect(change.deletionSeamOffset).toBeDefined();
      expect(change.deletionSeamOffset).toBe('The quick '.length); // === 10

      // originalText is populated from the {--brown --} capture.
      expect(change.originalText).toBe('brown ');
    });
  });

  describe('bug 4: injectGhostDelimiters fires unconditionally', () => {
    it('emits renderBefore and renderAfter even when range === contentRange', () => {
      // L3 shape: fullRange and contentRange are equal (no inline delimiter bytes)
      const fullRange = { start: 100, end: 110 };
      const contentRange = { start: 100, end: 110 };
      const ghostDelimiters: OffsetDecoration[] = [];

      injectGhostDelimiters(fullRange, contentRange, ghostDelimiters, '', '');

      expect(ghostDelimiters).toHaveLength(2);
      expect(ghostDelimiters[0].renderBefore?.contentText).toBe('');
      expect(ghostDelimiters[0].range).toEqual({ start: 100, end: 100 });
      expect(ghostDelimiters[1].renderAfter?.contentText).toBe('');
      expect(ghostDelimiters[1].range).toEqual({ start: 110, end: 110 });
    });
  });

  describe('bug 3: multi-line discussion preserved', () => {
    it('all unmatched continuation lines land in unknownBodyLines, not truncated to one', () => {
      // Each of these three lines is free-form prose with no colon after the
      // first word, so they bypass every earlier branch:
      //   - FOOTNOTE_L3_EDIT_OP  (needs LINE:HASH {op} format)
      //   - FOOTNOTE_THREAD_REPLY (needs @author YYYY-MM-DD:)
      //   - APPROVED_RE / REJECTED_META_RE (needs approved:/rejected: keyword)
      //   - imageMeta /^\s+([\w-]+):\s*(.*)/ (needs word + colon)
      // All three must reach the unknownBodyLines fallback.
      //
      // Before the bug fix, the old discussionText single-assignment would have
      // kept only the FIRST line. Post-fix, unknownBodyLines is an array that
      // accumulates every unmatched line — which is what we assert here.
      const l3Text = [
        '# Doc',
        '',
        'The quick brown fox.',
        '',
        '[^cn-1]: @alice | 2026-04-08 | ins | proposed',
        '    3:ff {++quick ++}',
        '    this is the first discussion note',
        '    this is the second discussion note',
        '    this is the third discussion note',
        '',
      ].join('\n');

      const parser = new FootnoteNativeParser();
      const footnotes: ParsedFootnote[] = parser._testScanFootnotes(l3Text);

      expect(footnotes).toHaveLength(1);
      const fn = footnotes[0];

      // All three free-form lines must be preserved — not truncated to one.
      expect(fn.unknownBodyLines).toHaveLength(3);
      expect(fn.unknownBodyLines![0]).toBe('this is the first discussion note');
      expect(fn.unknownBodyLines![1]).toBe('this is the second discussion note');
      expect(fn.unknownBodyLines![2]).toBe('this is the third discussion note');
    });
  });
});
