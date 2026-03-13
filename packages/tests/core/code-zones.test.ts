import * as assert from 'node:assert';
import { findCodeZones } from '@changetracks/core/internals';

describe('findCodeZones', () => {

  // ─── Fenced code blocks ──────────────────────────────────────────

  describe('fenced code blocks', () => {
    it('detects a basic backtick fence', () => {
      const text = '```\ncontent\n```\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'fence');
      assert.strictEqual(zones[0].start, 0);
      assert.strictEqual(zones[0].end, text.length);
    });

    it('detects a basic tilde fence', () => {
      const text = '~~~\ncontent\n~~~\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'fence');
    });

    it('detects a fence with info string', () => {
      const text = '```javascript\ncontent\n```\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'fence');
    });

    it('detects multiple fences in one document', () => {
      const text = '```\na\n```\nbetween\n```\nb\n```\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 2);
      assert.strictEqual(zones[0].type, 'fence');
      assert.strictEqual(zones[1].type, 'fence');
    });

    it('respects longer opening fence (close must be >= length)', () => {
      const text = '````\ncontent\n````\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'fence');
    });

    it('closing fence too short does not close — zone extends to EOF', () => {
      const text = '````\ncontent\n```\nmore content';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].end, text.length);
    });

    it('unclosed fence extends to EOF', () => {
      const text = '```\ncontent that never ends';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].end, text.length);
    });

    it('nested backtick inside tilde fence (inner ``` is content)', () => {
      const text = '~~~\n```\nstill in tilde fence\n```\n~~~\n';
      const zones = findCodeZones(text);
      // Only one zone — the outer tilde fence
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].start, 0);
    });

    it('adjacent fences with no gap', () => {
      const text = '```\na\n```\n```\nb\n```\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 2);
    });

    it('does not treat backtick fence with backtick in info string as a fence', () => {
      // CommonMark: backtick fences cannot have backticks in the info string
      const text = '``` `js\nnot a fence\n```\n';
      const zones = findCodeZones(text);
      // The opening line is not a valid fence
      assert.strictEqual(zones.filter(z => z.type === 'fence').length, 0);
    });

    it('fence with leading spaces (up to 3)', () => {
      const text = '   ```\ncontent\n   ```\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'fence');
    });

    it('4 spaces does not start a fence', () => {
      const text = '    ```\ncontent\n    ```\n';
      const zones = findCodeZones(text);
      // No fence zone — 4 spaces disqualifies
      assert.strictEqual(zones.filter(z => z.type === 'fence').length, 0);
    });

    it('closing fence with trailing whitespace is valid', () => {
      const text = '```\ncontent\n```   \n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
    });

    it('closing fence with trailing content is NOT valid', () => {
      const text = '```\ncontent\n``` not valid\n```\n';
      const zones = findCodeZones(text);
      // ``` not valid is not a close, so the fence extends to the real ```
      assert.strictEqual(zones.length, 1);
    });

    it('backtick fence cannot be closed by tildes', () => {
      const text = '```\ncontent\n~~~\nmore\n```\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.ok(zones[0].end >= text.indexOf('```\n', 4));
    });

    it('tilde fence cannot be closed by backticks', () => {
      const text = '~~~\ncontent\n```\nmore\n~~~\n';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
    });
  });

  // ─── Inline code spans ───────────────────────────────────────────

  describe('inline code spans', () => {
    it('detects single-backtick inline code', () => {
      const text = 'text `code` more';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'inline');
      assert.strictEqual(zones[0].start, 5);
      assert.strictEqual(zones[0].end, 11);
    });

    it('detects double-backtick inline code', () => {
      const text = 'text ``code`` more';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'inline');
    });

    it('detects multiple inline code spans on one line', () => {
      const text = '`a` and `b` end';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 2);
      assert.strictEqual(zones[0].type, 'inline');
      assert.strictEqual(zones[1].type, 'inline');
    });

    it('does not create a zone for unmatched backtick', () => {
      const text = 'text with `unmatched backtick and more text';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 0);
    });

    it('does not create a zone for unmatched double backtick', () => {
      const text = 'text with ``unmatched double and more text';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 0);
    });

    it('backtick inside fenced block does NOT create inline zone', () => {
      const text = '```\n`inline inside fence`\n```\n';
      const zones = findCodeZones(text);
      // Only the fence zone, no inline zone
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'fence');
    });

    it('inline code containing CriticMarkup delimiter', () => {
      const text = '`{++text++}` rest';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'inline');
      assert.strictEqual(zones[0].start, 0);
      assert.strictEqual(zones[0].end, 12);
    });

    it('inline code span with spaces around content', () => {
      const text = '` code ` rest';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 1);
      assert.strictEqual(zones[0].type, 'inline');
    });
  });

  // ─── No zones ────────────────────────────────────────────────────

  describe('no zones in plain text', () => {
    it('returns empty for plain text with curly braces', () => {
      const text = 'text {with} curly {braces} end';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 0);
    });

    it('returns empty for empty string', () => {
      const zones = findCodeZones('');
      assert.strictEqual(zones.length, 0);
    });

    it('returns empty for text without code constructs', () => {
      const text = 'Hello world\nThis is markdown\n{++insertion++}';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 0);
    });
  });

  // ─── Mixed scenarios ─────────────────────────────────────────────

  describe('mixed fences and inline code', () => {
    it('returns zones in document order', () => {
      const text = '`inline` text\n```\nfenced\n```\n`more inline`';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 3);
      assert.strictEqual(zones[0].type, 'inline');
      assert.strictEqual(zones[1].type, 'fence');
      assert.strictEqual(zones[2].type, 'inline');
      // Verify document order
      assert.ok(zones[0].end <= zones[1].start);
      assert.ok(zones[1].end <= zones[2].start);
    });

    it('inline code before and after fenced block', () => {
      const text = 'pre `a` mid\n```\ncode\n```\npost `b` end';
      const zones = findCodeZones(text);
      assert.strictEqual(zones.length, 3);
    });
  });
});
