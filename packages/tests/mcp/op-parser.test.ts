import { describe, it, expect } from 'vitest';
import { parseOp, type ParsedOp } from '@changedown/mcp/internals';

describe('parseOp', () => {
  describe('substitution ({~~old~>new~~})', () => {
    it('parses simple substitution', () => {
      const result = parseOp('{~~timeout=30~>timeout=60~~}');
      expect(result).toEqual({
        type: 'sub',
        oldText: 'timeout=30',
        newText: 'timeout=60',
        reasoning: undefined,
      });
    });

    it('parses substitution with reasoning', () => {
      const result = parseOp('{~~timeout=30~>timeout=60~~}{>>increase for slow networks');
      expect(result).toEqual({
        type: 'sub',
        oldText: 'timeout=30',
        newText: 'timeout=60',
        reasoning: 'increase for slow networks',
      });
    });

    it('handles ~> in old text before the real operator', () => {
      const result = parseOp('{~~a~>b~~}');
      expect(result.type).toBe('sub');
      expect(result.oldText).toBe('a');
      expect(result.newText).toBe('b');
    });
  });

  describe('insertion ({++text++})', () => {
    it('parses simple insertion', () => {
      const result = parseOp('{++retry_count=3++}');
      expect(result).toEqual({
        type: 'ins',
        oldText: '',
        newText: 'retry_count=3',
        reasoning: undefined,
      });
    });

    it('parses insertion with reasoning', () => {
      const result = parseOp('{++retry_count=3++}{>>add retry support');
      expect(result).toEqual({
        type: 'ins',
        oldText: '',
        newText: 'retry_count=3',
        reasoning: 'add retry support',
      });
    });

    it('handles multi-line insertion', () => {
      const result = parseOp('{++line one\nline two++}');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('line one\nline two');
    });
  });

  describe('deletion ({--text--})', () => {
    it('parses simple deletion', () => {
      const result = parseOp('{--legacy_mode=true--}');
      expect(result).toEqual({
        type: 'del',
        oldText: 'legacy_mode=true',
        newText: '',
        reasoning: undefined,
      });
    });

    it('parses deletion with reasoning', () => {
      const result = parseOp('{--legacy_mode=true--}{>>deprecated');
      expect(result).toEqual({
        type: 'del',
        oldText: 'legacy_mode=true',
        newText: '',
        reasoning: 'deprecated',
      });
    });
  });

  describe('highlight ({==text==})', () => {
    it('parses highlight with comment', () => {
      const result = parseOp('{==critical section==}{>>needs review');
      expect(result).toEqual({
        type: 'highlight',
        oldText: 'critical section',
        newText: '',
        reasoning: 'needs review',
      });
    });

    it('parses highlight without comment', () => {
      const result = parseOp('{==important text==}');
      expect(result).toEqual({
        type: 'highlight',
        oldText: 'important text',
        newText: '',
        reasoning: undefined,
      });
    });
  });

  describe('comment ({>>)', () => {
    it('parses standalone comment', () => {
      const result = parseOp('{>>this needs attention');
      expect(result).toEqual({
        type: 'comment',
        oldText: '',
        newText: '',
        reasoning: 'this needs attention',
      });
    });
  });

  describe('{>> reasoning separator', () => {
    it('extracts reasoning from {>> at end of op', () => {
      const result = parseOp('{++new text++}{>>reason for adding');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('new text');
      expect(result.reasoning).toBe('reason for adding');
    });

    it('does not treat CriticMarkup comment as reasoning', () => {
      const result = parseOp('{++text with {>>comment<<} more text++}');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('text with {>>comment<<} more text');
      expect(result.reasoning).toBeUndefined();
    });

    it('extracts reasoning after CriticMarkup comment in content', () => {
      const result = parseOp('{++text {>>comment<<} more++}{>>reason');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('text {>>comment<<} more');
      expect(result.reasoning).toBe('reason');
    });

    it('handles substitution with {>> reasoning', () => {
      const result = parseOp('{~~old~>new~~}{>>why this change');
      expect(result.type).toBe('sub');
      expect(result.oldText).toBe('old');
      expect(result.newText).toBe('new');
      expect(result.reasoning).toBe('why this change');
    });

    it('bare >> in content is inert (not a separator)', () => {
      const result = parseOp('{++text with >> in it++}');
      expect(result.type).toBe('ins');
      expect(result.newText).toBe('text with >> in it');
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('error cases', () => {
    it('throws on empty op', () => {
      expect(() => parseOp('')).toThrow();
    });
  });
});
