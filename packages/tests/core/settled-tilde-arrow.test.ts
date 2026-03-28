import { describe, it, expect, beforeAll } from 'vitest';
import {
  computeSettledText,
  settledLine,
  initHashline,
  CriticMarkupParser,
} from '@changedown/core/internals';

describe('Settlement with ~> in content (Bug 5)', () => {
  beforeAll(async () => {
    await initHashline();
  });

  // ─── computeSettledText (parser-based, uses indexOf for first ~>) ─────

  describe('computeSettledText handles ~> in substitution new text', () => {
    it('preserves literal ~> in new text of substitution', () => {
      const input = 'Use {~~old syntax~>new arrow ~> function~~}[^cn-1] here.\n\n[^cn-1]: @ai:test | 2026-02-25 | sub | proposed';
      const result = computeSettledText(input);
      expect(result.includes('new arrow ~> function')).toBeTruthy();
    });

    it('handles ~> in code backticks inside substitution new text', () => {
      const input = 'The operator {~~is `=>`~>is `~>`~~}[^cn-1] for substitution.\n\n[^cn-1]: @ai:test | 2026-02-25 | sub | proposed';
      const result = computeSettledText(input);
      expect(result.includes('is `~>`')).toBeTruthy();
    });

    it('handles multiple ~> in new text', () => {
      const input = '{~~A~>B ~> C ~> D~~} end.\n';
      const result = computeSettledText(input);
      expect(result.includes('B ~> C ~> D')).toBeTruthy();
    });

    it('handles ~> as the entire new text', () => {
      const input = '{~~old~>~>~~} done';
      const result = computeSettledText(input);
      expect(result.includes('~>')).toBeTruthy();
      expect(result.includes('done')).toBeTruthy();
    });

    it('handles ~> immediately after separator (no space)', () => {
      const input = '{~~before~>~>after~~}';
      const result = computeSettledText(input);
      expect(result).toBe('~>after');
    });
  });

  // ─── Parser: verify modifiedText is correct ──────────────────────────

  describe('Parser splits on first ~> in substitution', () => {
    it('first ~> is the separator, remaining ~> are in modifiedText', () => {
      const parser = new CriticMarkupParser();
      const doc = parser.parse('{~~old~>new ~> more~~}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].originalText).toBe('old');
      expect(changes[0].modifiedText).toBe('new ~> more');
    });

    it('handles ~> at start of new text', () => {
      const parser = new CriticMarkupParser();
      const doc = parser.parse('{~~old~>~> new~~}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].originalText).toBe('old');
      expect(changes[0].modifiedText).toBe('~> new');
    });

    it('handles multiple ~> in new text', () => {
      const parser = new CriticMarkupParser();
      const doc = parser.parse('{~~A~>B ~> C ~> D~~}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].originalText).toBe('A');
      expect(changes[0].modifiedText).toBe('B ~> C ~> D');
    });
  });

  // ─── settledLine (regex-based, single-line stripping) ─────────────────

  describe('settledLine handles ~> in substitution new text', () => {
    it('preserves literal ~> in new text of substitution', () => {
      const result = settledLine('Use {~~old syntax~>new arrow ~> function~~} here.');
      expect(result).toBe('Use new arrow ~> function here.');
    });

    it('handles ~> in code backticks inside substitution new text', () => {
      const result = settledLine('The operator {~~is `=>`~>is `~>`~~} for substitution.');
      expect(result).toBe('The operator is `~>` for substitution.');
    });

    it('handles multiple ~> in new text', () => {
      const result = settledLine('{~~A~>B ~> C ~> D~~} end.');
      expect(result).toBe('B ~> C ~> D end.');
    });

    it('handles ~> as the entire new text', () => {
      const result = settledLine('{~~old~>~>~~} done');
      expect(result).toBe('~> done');
    });

    it('handles ~> immediately after separator', () => {
      const result = settledLine('{~~before~>~>after~~}');
      expect(result).toBe('~>after');
    });
  });
});
