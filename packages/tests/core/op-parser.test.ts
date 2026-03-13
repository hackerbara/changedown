import * as assert from 'node:assert';
import { parseOp } from '@changetracks/core/internals';

describe('parseOp', () => {
  // ─── Substitution ──────────────────────────────────────────────────────

  describe('substitution', () => {
    it('parses basic substitution', () => {
      const result = parseOp('{~~old~>new~~}');
      assert.strictEqual(result.type, 'sub');
      assert.strictEqual(result.oldText, 'old');
      assert.strictEqual(result.newText, 'new');
      assert.strictEqual(result.reasoning, undefined);
    });

    it('parses substitution with reasoning', () => {
      const result = parseOp('{~~REST~>GraphQL~~}{>>better for this use case');
      assert.strictEqual(result.type, 'sub');
      assert.strictEqual(result.oldText, 'REST');
      assert.strictEqual(result.newText, 'GraphQL');
      assert.strictEqual(result.reasoning, 'better for this use case');
    });

    it('handles empty old text (range replacement)', () => {
      const result = parseOp('{~~~>replacement text~~}');
      assert.strictEqual(result.type, 'sub');
      assert.strictEqual(result.oldText, '');
      assert.strictEqual(result.newText, 'replacement text');
    });

    it('throws on substitution missing closing delimiter', () => {
      assert.throws(() => parseOp('{~~old~>new'), /Cannot parse op/);
    });

    it('throws on substitution missing ~> arrow', () => {
      assert.throws(() => parseOp('{~~just text~~}'), /Cannot parse op/);
    });
  });

  // ─── Insertion ─────────────────────────────────────────────────────────

  describe('insertion', () => {
    it('parses basic insertion', () => {
      const result = parseOp('{++new text++}');
      assert.strictEqual(result.type, 'ins');
      assert.strictEqual(result.oldText, '');
      assert.strictEqual(result.newText, 'new text');
      assert.strictEqual(result.reasoning, undefined);
    });

    it('parses insertion with reasoning', () => {
      const result = parseOp('{++added clause++}{>>required by spec');
      assert.strictEqual(result.type, 'ins');
      assert.strictEqual(result.newText, 'added clause');
      assert.strictEqual(result.reasoning, 'required by spec');
    });

    it('throws on insertion missing closing delimiter', () => {
      assert.throws(() => parseOp('{++unclosed text'), /Cannot parse op/);
    });
  });

  // ─── Deletion ──────────────────────────────────────────────────────────

  describe('deletion', () => {
    it('parses basic deletion', () => {
      const result = parseOp('{--removed text--}');
      assert.strictEqual(result.type, 'del');
      assert.strictEqual(result.oldText, 'removed text');
      assert.strictEqual(result.newText, '');
      assert.strictEqual(result.reasoning, undefined);
    });

    it('parses deletion with reasoning', () => {
      const result = parseOp('{--obsolete--}{>>no longer needed');
      assert.strictEqual(result.type, 'del');
      assert.strictEqual(result.oldText, 'obsolete');
      assert.strictEqual(result.reasoning, 'no longer needed');
    });

    it('throws on deletion missing closing delimiter', () => {
      assert.throws(() => parseOp('{--unclosed text'), /Cannot parse op/);
    });
  });

  // ─── Highlight ─────────────────────────────────────────────────────────

  describe('highlight', () => {
    it('parses basic highlight', () => {
      const result = parseOp('{==important text==}');
      assert.strictEqual(result.type, 'highlight');
      assert.strictEqual(result.oldText, 'important text');
      assert.strictEqual(result.newText, '');
      assert.strictEqual(result.reasoning, undefined);
    });

    it('parses highlight with reasoning', () => {
      const result = parseOp('{==key finding==}{>>needs review');
      assert.strictEqual(result.type, 'highlight');
      assert.strictEqual(result.oldText, 'key finding');
      assert.strictEqual(result.reasoning, 'needs review');
    });

    it('throws on highlight missing closing delimiter', () => {
      assert.throws(() => parseOp('{==unclosed text'), /Cannot parse op/);
    });
  });

  // ─── Comment ───────────────────────────────────────────────────────────

  describe('comment', () => {
    it('parses comment-only op (unclosed)', () => {
      const result = parseOp('{>>this is a comment');
      assert.strictEqual(result.type, 'comment');
      assert.strictEqual(result.oldText, '');
      assert.strictEqual(result.newText, '');
      assert.strictEqual(result.reasoning, 'this is a comment');
    });

    it('parses comment-only op with closing delimiter', () => {
      const result = parseOp('{>>this is a comment<<}');
      assert.strictEqual(result.type, 'comment');
      assert.strictEqual(result.oldText, '');
      assert.strictEqual(result.newText, '');
      assert.strictEqual(result.reasoning, 'this is a comment');
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws on empty string', () => {
      assert.throws(() => parseOp(''), /empty/);
    });

    it('throws on unparseable op', () => {
      assert.throws(() => parseOp('no delimiters here'), /Cannot parse op/);
    });

    it('throws on old prefix syntax (no backward compat)', () => {
      assert.throws(() => parseOp('+text'), /Cannot parse op/);
      assert.throws(() => parseOp('-text'), /Cannot parse op/);
      assert.throws(() => parseOp('=text'), /Cannot parse op/);
      assert.throws(() => parseOp('old~>new'), /Cannot parse op/);
      assert.throws(() => parseOp('>>comment'), /Cannot parse op/);
    });
  });

  // ─── Reasoning disambiguation ──────────────────────────────────────────

  describe('reasoning disambiguation', () => {
    it('does not treat CriticMarkup comment in content as reasoning separator', () => {
      // {>>comment<<} in content has a matching <<} so it's NOT a reasoning separator
      const result = parseOp('{++text with {>>inline comment<<} included++}');
      assert.strictEqual(result.type, 'ins');
      assert.strictEqual(result.newText, 'text with {>>inline comment<<} included');
      assert.strictEqual(result.reasoning, undefined);
    });

    it('uses rightmost {>> without <<} as reasoning', () => {
      const result = parseOp('{++text++}{>>real reasoning');
      assert.strictEqual(result.type, 'ins');
      assert.strictEqual(result.newText, 'text');
      assert.strictEqual(result.reasoning, 'real reasoning');
    });

    it('extracts reasoning when agent closes with <<} at end of string', () => {
      const result = parseOp('{++text++}{>>reason<<}');
      assert.strictEqual(result.type, 'ins');
      assert.strictEqual(result.newText, 'text');
      assert.strictEqual(result.reasoning, 'reason');
    });
  });

  // ─── Edge cases: content containing closer pattern ─────────────────────

  describe('edge cases', () => {
    it('uses lastIndexOf for closer — content containing closer pattern', () => {
      // Content is "code: x++}" — the ++} inside is part of content, outermost ++} closes
      const result = parseOp('{++code: x++}++}');
      assert.strictEqual(result.type, 'ins');
      assert.strictEqual(result.newText, 'code: x++}');
    });

    it('handles substitution with ~> appearing in content after first ~>', () => {
      const result = parseOp('{~~a~>b~>c~~}');
      assert.strictEqual(result.type, 'sub');
      assert.strictEqual(result.oldText, 'a');
      assert.strictEqual(result.newText, 'b~>c');
    });
  });
});
