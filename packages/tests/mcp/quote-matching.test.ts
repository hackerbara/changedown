import { describe, it, expect } from 'vitest';
import { parseOp } from '@changedown/mcp/internals';
import { findUniqueMatch } from '@changedown/mcp/internals';
import { defaultNormalizer } from '@changedown/core';

describe('ISSUE-4: Quote matching in op parameter', () => {

  // ─── parseOp: double quotes in substitution ──────────────────────────────

  describe('parseOp with double quotes', () => {
    it('handles old text with double quotes in substitution', () => {
      const op = '{~~No continuous "space" in the geometric sense~>No continuous "region" in the geometric sense~~}';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('sub');
      expect(parsed.oldText).toBe('No continuous "space" in the geometric sense');
      expect(parsed.newText).toBe('No continuous "region" in the geometric sense');
    });

    it('handles reasoning separator {>> with quotes in old text', () => {
      const op = '{~~"quoted text"~>"new text"~~}{>>reasoning here';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('sub');
      expect(parsed.oldText).toBe('"quoted text"');
      expect(parsed.newText).toBe('"new text"');
      expect(parsed.reasoning).toBe('reasoning here');
    });

    it('handles single-quoted text in substitution', () => {
      const op = "{~~It's a 'test'~>It's a 'result'~~}";
      const parsed = parseOp(op);
      expect(parsed.type).toBe('sub');
      expect(parsed.oldText).toBe("It's a 'test'");
      expect(parsed.newText).toBe("It's a 'result'");
    });

    it('handles mixed quotes and reasoning', () => {
      const op = '{~~The "old" value~>The "new" value~~}{>>update the quoted term';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('sub');
      expect(parsed.oldText).toBe('The "old" value');
      expect(parsed.newText).toBe('The "new" value');
      expect(parsed.reasoning).toBe('update the quoted term');
    });

    it('handles double quotes in deletion', () => {
      const op = '{--"deprecated feature"--}';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('del');
      expect(parsed.oldText).toBe('"deprecated feature"');
    });

    it('handles double quotes in insertion', () => {
      const op = '{++"new feature"++}';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('ins');
      expect(parsed.newText).toBe('"new feature"');
    });

    it('handles double quotes in highlight', () => {
      const op = '{=="important quote"==}{>>needs review';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('highlight');
      expect(parsed.oldText).toBe('"important quote"');
      expect(parsed.reasoning).toBe('needs review');
    });
  });

  // ─── parseOp: >> inside text (bare >> is inert) ─────────────────────────────

  describe('parseOp with >> inside text content', () => {
    it('bare >> in old text is inert, {>> separates reasoning', () => {
      // Bare >> in old text is just content. Use {>> for reasoning.
      const op = '{~~text with >> inside~>replacement~~}{>>actual reasoning';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('sub');
      expect(parsed.oldText).toBe('text with >> inside');
      expect(parsed.newText).toBe('replacement');
      expect(parsed.reasoning).toBe('actual reasoning');
    });

    it('bare >> in old text is preserved when no reasoning', () => {
      // Old text contains >> but there is no {>> reasoning separator.
      const op = '{~~text with >> inside~>replacement~~}';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('sub');
      expect(parsed.oldText).toBe('text with >> inside');
      expect(parsed.newText).toBe('replacement');
      expect(parsed.reasoning).toBeUndefined();
    });

    it('bare >> in new text is inert (not a separator)', () => {
      // New text contains bare >> which is NOT a reasoning separator.
      // Only {>> separates reasoning.
      const op = '{~~old text~>new text with >> inside~~}';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('sub');
      expect(parsed.oldText).toBe('old text');
      expect(parsed.newText).toBe('new text with >> inside');
      expect(parsed.reasoning).toBeUndefined();
    });

    it('bare >> in both old and new text is inert, {>> separates reasoning', () => {
      const op = '{~~old >> text~>new >> text~~}{>>reason';
      const parsed = parseOp(op);
      expect(parsed.type).toBe('sub');
      expect(parsed.oldText).toBe('old >> text');
      expect(parsed.newText).toBe('new >> text');
      expect(parsed.reasoning).toBe('reason');
    });
  });

  // ─── findUniqueMatch: double quotes ──────────────────────────────────────

  describe('findUniqueMatch with double quotes', () => {
    it('finds text containing double quotes via exact match', () => {
      const fileContent = 'a bounded sequence of tokens. No continuous "space" in the geometric sense.';
      const target = 'No continuous "space" in the geometric sense';
      const result = findUniqueMatch(fileContent, target, defaultNormalizer);
      expect(result).toBeDefined();
      expect(result.originalText).toBe(target);
      expect(result.wasNormalized).toBe(false);
    });

    it('does not match smart double quotes against ASCII (no confusables)', () => {
      // File has smart (curly) quotes, search uses ASCII quotes.
      // Without confusables, these are distinct characters.
      const fileContent = 'No continuous \u201Cspace\u201D in the geometric sense.';
      const target = 'No continuous "space" in the geometric sense';
      expect(() => findUniqueMatch(fileContent, target, defaultNormalizer)).toThrow(/not found/i);
    });

    it('does not match ASCII quotes against smart quotes (no confusables)', () => {
      // File has ASCII quotes, search uses smart (curly) quotes.
      const fileContent = 'No continuous "space" in the geometric sense.';
      const target = 'No continuous \u201Cspace\u201D in the geometric sense';
      expect(() => findUniqueMatch(fileContent, target, defaultNormalizer)).toThrow(/not found/i);
    });

    it('does not match mixed smart quotes against ASCII (no confusables)', () => {
      const fileContent = "It\u2019s a \u201Ctest\u201D of the system.";
      const target = "It's a \"test\" of the system";
      expect(() => findUniqueMatch(fileContent, target, defaultNormalizer)).toThrow(/not found/i);
    });
  });

  // ─── Integration: parseOp + findUniqueMatch pipeline ─────────────────────

  describe('parseOp + findUniqueMatch integration', () => {
    it('full pipeline: parse op with quotes, then match in document', () => {
      const op = '{~~No continuous "space" in the geometric sense~>No continuous "region" in the geometric sense~~}';
      const parsed = parseOp(op);

      const fileContent = 'The context window is a bounded sequence of tokens. No continuous "space" in the geometric sense.';
      const match = findUniqueMatch(fileContent, parsed.oldText, defaultNormalizer);

      expect(match).toBeDefined();
      expect(match.originalText).toBe('No continuous "space" in the geometric sense');
      expect(match.index).toBe(52);
    });

    it('full pipeline: parse op with quotes + reasoning, then match', () => {
      const op = '{~~"deprecated API"~>"modern API"~~}{>>update terminology';
      const parsed = parseOp(op);

      const fileContent = 'Use the "deprecated API" for legacy support.';
      const match = findUniqueMatch(fileContent, parsed.oldText, defaultNormalizer);

      expect(match).toBeDefined();
      expect(match.originalText).toBe('"deprecated API"');
    });
  });
});
