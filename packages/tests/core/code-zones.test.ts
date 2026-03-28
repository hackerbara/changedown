import { describe, it, expect } from 'vitest';
import { findCodeZones } from '@changedown/core/internals';

describe('findCodeZones', () => {

  // ─── Fenced code blocks ──────────────────────────────────────────

  describe('fenced code blocks', () => {
    it('detects a basic backtick fence', () => {
      const text = '```\ncontent\n```\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('fence');
      expect(zones[0].start).toBe(0);
      expect(zones[0].end).toBe(text.length);
    });

    it('detects a basic tilde fence', () => {
      const text = '~~~\ncontent\n~~~\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('fence');
    });

    it('detects a fence with info string', () => {
      const text = '```javascript\ncontent\n```\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('fence');
    });

    it('detects multiple fences in one document', () => {
      const text = '```\na\n```\nbetween\n```\nb\n```\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(2);
      expect(zones[0].type).toBe('fence');
      expect(zones[1].type).toBe('fence');
    });

    it('respects longer opening fence (close must be >= length)', () => {
      const text = '````\ncontent\n````\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('fence');
    });

    it('closing fence too short does not close — zone extends to EOF', () => {
      const text = '````\ncontent\n```\nmore content';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].end).toBe(text.length);
    });

    it('unclosed fence extends to EOF', () => {
      const text = '```\ncontent that never ends';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].end).toBe(text.length);
    });

    it('nested backtick inside tilde fence (inner ``` is content)', () => {
      const text = '~~~\n```\nstill in tilde fence\n```\n~~~\n';
      const zones = findCodeZones(text);
      // Only one zone — the outer tilde fence
      expect(zones).toHaveLength(1);
      expect(zones[0].start).toBe(0);
    });

    it('adjacent fences with no gap', () => {
      const text = '```\na\n```\n```\nb\n```\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(2);
    });

    it('does not treat backtick fence with backtick in info string as a fence', () => {
      // CommonMark: backtick fences cannot have backticks in the info string
      const text = '``` `js\nnot a fence\n```\n';
      const zones = findCodeZones(text);
      // The opening line is not a valid fence
      expect(zones.filter(z => z.type === 'fence')).toHaveLength(0);
    });

    it('fence with leading spaces (up to 3)', () => {
      const text = '   ```\ncontent\n   ```\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('fence');
    });

    it('4 spaces does not start a fence', () => {
      const text = '    ```\ncontent\n    ```\n';
      const zones = findCodeZones(text);
      // No fence zone — 4 spaces disqualifies
      expect(zones.filter(z => z.type === 'fence')).toHaveLength(0);
    });

    it('closing fence with trailing whitespace is valid', () => {
      const text = '```\ncontent\n```   \n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
    });

    it('closing fence with trailing content is NOT valid', () => {
      const text = '```\ncontent\n``` not valid\n```\n';
      const zones = findCodeZones(text);
      // ``` not valid is not a close, so the fence extends to the real ```
      expect(zones).toHaveLength(1);
    });

    it('backtick fence cannot be closed by tildes', () => {
      const text = '```\ncontent\n~~~\nmore\n```\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].end >= text.indexOf('```\n', 4)).toBeTruthy();
    });

    it('tilde fence cannot be closed by backticks', () => {
      const text = '~~~\ncontent\n```\nmore\n~~~\n';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
    });
  });

  // ─── Inline code spans ───────────────────────────────────────────

  describe('inline code spans', () => {
    it('detects single-backtick inline code', () => {
      const text = 'text `code` more';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('inline');
      expect(zones[0].start).toBe(5);
      expect(zones[0].end).toBe(11);
    });

    it('detects double-backtick inline code', () => {
      const text = 'text ``code`` more';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('inline');
    });

    it('detects multiple inline code spans on one line', () => {
      const text = '`a` and `b` end';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(2);
      expect(zones[0].type).toBe('inline');
      expect(zones[1].type).toBe('inline');
    });

    it('does not create a zone for unmatched backtick', () => {
      const text = 'text with `unmatched backtick and more text';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(0);
    });

    it('does not create a zone for unmatched double backtick', () => {
      const text = 'text with ``unmatched double and more text';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(0);
    });

    it('backtick inside fenced block does NOT create inline zone', () => {
      const text = '```\n`inline inside fence`\n```\n';
      const zones = findCodeZones(text);
      // Only the fence zone, no inline zone
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('fence');
    });

    it('inline code containing CriticMarkup delimiter', () => {
      const text = '`{++text++}` rest';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('inline');
      expect(zones[0].start).toBe(0);
      expect(zones[0].end).toBe(12);
    });

    it('inline code span with spaces around content', () => {
      const text = '` code ` rest';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(1);
      expect(zones[0].type).toBe('inline');
    });
  });

  // ─── No zones ────────────────────────────────────────────────────

  describe('no zones in plain text', () => {
    it('returns empty for plain text with curly braces', () => {
      const text = 'text {with} curly {braces} end';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(0);
    });

    it('returns empty for empty string', () => {
      const zones = findCodeZones('');
      expect(zones).toHaveLength(0);
    });

    it('returns empty for text without code constructs', () => {
      const text = 'Hello world\nThis is markdown\n{++insertion++}';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(0);
    });
  });

  // ─── Mixed scenarios ─────────────────────────────────────────────

  describe('mixed fences and inline code', () => {
    it('returns zones in document order', () => {
      const text = '`inline` text\n```\nfenced\n```\n`more inline`';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(3);
      expect(zones[0].type).toBe('inline');
      expect(zones[1].type).toBe('fence');
      expect(zones[2].type).toBe('inline');
      // Verify document order
      expect(zones[0].end <= zones[1].start).toBeTruthy();
      expect(zones[1].end <= zones[2].start).toBeTruthy();
    });

    it('inline code before and after fenced block', () => {
      const text = 'pre `a` mid\n```\ncode\n```\npost `b` end';
      const zones = findCodeZones(text);
      expect(zones).toHaveLength(3);
    });
  });
});
