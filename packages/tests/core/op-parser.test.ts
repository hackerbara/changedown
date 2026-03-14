import { describe, it, expect } from 'vitest';
import { parseOp } from '@changetracks/core/internals';

describe('parseOp', () => {
  // ─── Substitution ──────────────────────────────────────────────────────

  describe('substitution', () => {
    it('parses basic substitution', () => {
      const result = parseOp('{~~old~>new~~}');
      expect(result.type).toBe('sub');
      expect(result.oldText).toBe('old');
      expect(result.newText).toBe('new');
      expect(result.reasoning).toBeUndefined();
    });

    it('parses substitution with reasoning', () => {
      const result = parseOp('{~~REST~>GraphQL~~}{>>better for this use case');
      expect(result.type).toBe('sub');
      expect(result.oldText).toBe('REST');
      expect(result.newText).toBe('GraphQL');
      expect(result.reasoning).toBe('better for this use case');
    });

    it('handles empty old text (range replacement)', () => {
      const result = parseOp('{~~~>replacement text~~}');
      expect(result.type).toBe('sub');
      expect(result.oldText).toBe('');
      expect(result.newText).toBe('replacement text');
    });

    it('throws on substitution missing closing delimiter', () => {
      expect(() => parseOp('{~~old~>new')).toThrow(/Cannot parse op/);
    });

    it('throws on substitution missing ~> arrow', () => {
      expect(() => parseOp('{~~just text~~}')).toThrow(/Cannot parse op/);
    });
  });

  // ─── Insertion ─────────────────────────────────────────────────────────

  describe('insertion', () => {
    it('parses basic insertion', () => {
      const result = parseOp('{++new text++}');
      expect(result.type).toBe('ins');
      expect(result.oldText).toBe('');
      expect(result.newText).toBe('new text');
      expect(result.reasoning).toBeUndefined();
    });

    it('parses insertion with reasoning', () => {
      const result = parseOp('{++added clause++}{>>required by spec');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('added clause');
      expect(result.reasoning).toBe('required by spec');
    });

    it('throws on insertion missing closing delimiter', () => {
      expect(() => parseOp('{++unclosed text')).toThrow(/Cannot parse op/);
    });
  });

  // ─── Deletion ──────────────────────────────────────────────────────────

  describe('deletion', () => {
    it('parses basic deletion', () => {
      const result = parseOp('{--removed text--}');
      expect(result.type).toBe('del');
      expect(result.oldText).toBe('removed text');
      expect(result.newText).toBe('');
      expect(result.reasoning).toBeUndefined();
    });

    it('parses deletion with reasoning', () => {
      const result = parseOp('{--obsolete--}{>>no longer needed');
      expect(result.type).toBe('del');
      expect(result.oldText).toBe('obsolete');
      expect(result.reasoning).toBe('no longer needed');
    });

    it('throws on deletion missing closing delimiter', () => {
      expect(() => parseOp('{--unclosed text')).toThrow(/Cannot parse op/);
    });
  });

  // ─── Highlight ─────────────────────────────────────────────────────────

  describe('highlight', () => {
    it('parses basic highlight', () => {
      const result = parseOp('{==important text==}');
      expect(result.type).toBe('highlight');
      expect(result.oldText).toBe('important text');
      expect(result.newText).toBe('');
      expect(result.reasoning).toBeUndefined();
    });

    it('parses highlight with reasoning', () => {
      const result = parseOp('{==key finding==}{>>needs review');
      expect(result.type).toBe('highlight');
      expect(result.oldText).toBe('key finding');
      expect(result.reasoning).toBe('needs review');
    });

    it('throws on highlight missing closing delimiter', () => {
      expect(() => parseOp('{==unclosed text')).toThrow(/Cannot parse op/);
    });
  });

  // ─── Comment ───────────────────────────────────────────────────────────

  describe('comment', () => {
    it('parses comment-only op (unclosed)', () => {
      const result = parseOp('{>>this is a comment');
      expect(result.type).toBe('comment');
      expect(result.oldText).toBe('');
      expect(result.newText).toBe('');
      expect(result.reasoning).toBe('this is a comment');
    });

    it('parses comment-only op with closing delimiter', () => {
      const result = parseOp('{>>this is a comment<<}');
      expect(result.type).toBe('comment');
      expect(result.oldText).toBe('');
      expect(result.newText).toBe('');
      expect(result.reasoning).toBe('this is a comment');
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws on empty string', () => {
      expect(() => parseOp('')).toThrow(/empty/);
    });

    it('throws on unparseable op', () => {
      expect(() => parseOp('no delimiters here')).toThrow(/Cannot parse op/);
    });

    it('throws on old prefix syntax (no backward compat)', () => {
      expect(() => parseOp('+text')).toThrow(/Cannot parse op/);
      expect(() => parseOp('-text')).toThrow(/Cannot parse op/);
      expect(() => parseOp('=text')).toThrow(/Cannot parse op/);
      expect(() => parseOp('old~>new')).toThrow(/Cannot parse op/);
      expect(() => parseOp('>>comment')).toThrow(/Cannot parse op/);
    });
  });

  // ─── Reasoning disambiguation ──────────────────────────────────────────

  describe('reasoning disambiguation', () => {
    it('does not treat CriticMarkup comment in content as reasoning separator', () => {
      // {>>comment<<} in content has a matching <<} so it's NOT a reasoning separator
      const result = parseOp('{++text with {>>inline comment<<} included++}');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('text with {>>inline comment<<} included');
      expect(result.reasoning).toBeUndefined();
    });

    it('uses rightmost {>> without <<} as reasoning', () => {
      const result = parseOp('{++text++}{>>real reasoning');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('text');
      expect(result.reasoning).toBe('real reasoning');
    });

    it('extracts reasoning when agent closes with <<} at end of string', () => {
      const result = parseOp('{++text++}{>>reason<<}');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('text');
      expect(result.reasoning).toBe('reason');
    });
  });

  // ─── Edge cases: content containing closer pattern ─────────────────────

  describe('edge cases', () => {
    it('uses lastIndexOf for closer — content containing closer pattern', () => {
      // Content is "code: x++}" — the ++} inside is part of content, outermost ++} closes
      const result = parseOp('{++code: x++}++}');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('code: x++}');
    });

    it('handles substitution with ~> appearing in content after first ~>', () => {
      const result = parseOp('{~~a~>b~>c~~}');
      expect(result.type).toBe('sub');
      expect(result.oldText).toBe('a');
      expect(result.newText).toBe('b~>c');
    });
  });
});
