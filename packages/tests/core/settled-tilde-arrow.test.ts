import * as assert from 'node:assert';
import {
  computeSettledText,
  settledLine,
  initHashline,
  CriticMarkupParser,
} from '@changetracks/core/internals';

describe('Settlement with ~> in content (Bug 5)', () => {
  before(async () => {
    await initHashline();
  });

  // ─── computeSettledText (parser-based, uses indexOf for first ~>) ─────

  describe('computeSettledText handles ~> in substitution new text', () => {
    it('preserves literal ~> in new text of substitution', () => {
      const input = 'Use {~~old syntax~>new arrow ~> function~~}[^ct-1] here.\n\n[^ct-1]: @ai:test | 2026-02-25 | sub | proposed';
      const result = computeSettledText(input);
      assert.ok(result.includes('new arrow ~> function'), `settled text should contain "new arrow ~> function", got: ${result}`);
    });

    it('handles ~> in code backticks inside substitution new text', () => {
      const input = 'The operator {~~is `=>`~>is `~>`~~}[^ct-1] for substitution.\n\n[^ct-1]: @ai:test | 2026-02-25 | sub | proposed';
      const result = computeSettledText(input);
      assert.ok(result.includes('is `~>`'), 'settled text should contain "is `~>`", got: ' + result);
    });

    it('handles multiple ~> in new text', () => {
      const input = '{~~A~>B ~> C ~> D~~} end.\n';
      const result = computeSettledText(input);
      assert.ok(result.includes('B ~> C ~> D'), `settled text should contain "B ~> C ~> D", got: ${result}`);
    });

    it('handles ~> as the entire new text', () => {
      const input = '{~~old~>~>~~} done';
      const result = computeSettledText(input);
      assert.ok(result.includes('~>'), `settled text should contain "~>", got: ${result}`);
      assert.ok(result.includes('done'), `settled text should contain "done", got: ${result}`);
    });

    it('handles ~> immediately after separator (no space)', () => {
      const input = '{~~before~>~>after~~}';
      const result = computeSettledText(input);
      assert.strictEqual(result, '~>after');
    });
  });

  // ─── Parser: verify modifiedText is correct ──────────────────────────

  describe('Parser splits on first ~> in substitution', () => {
    it('first ~> is the separator, remaining ~> are in modifiedText', () => {
      const parser = new CriticMarkupParser();
      const doc = parser.parse('{~~old~>new ~> more~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].originalText, 'old');
      assert.strictEqual(changes[0].modifiedText, 'new ~> more');
    });

    it('handles ~> at start of new text', () => {
      const parser = new CriticMarkupParser();
      const doc = parser.parse('{~~old~>~> new~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].originalText, 'old');
      assert.strictEqual(changes[0].modifiedText, '~> new');
    });

    it('handles multiple ~> in new text', () => {
      const parser = new CriticMarkupParser();
      const doc = parser.parse('{~~A~>B ~> C ~> D~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].originalText, 'A');
      assert.strictEqual(changes[0].modifiedText, 'B ~> C ~> D');
    });
  });

  // ─── settledLine (regex-based, single-line stripping) ─────────────────

  describe('settledLine handles ~> in substitution new text', () => {
    it('preserves literal ~> in new text of substitution', () => {
      const result = settledLine('Use {~~old syntax~>new arrow ~> function~~} here.');
      assert.strictEqual(result, 'Use new arrow ~> function here.');
    });

    it('handles ~> in code backticks inside substitution new text', () => {
      const result = settledLine('The operator {~~is `=>`~>is `~>`~~} for substitution.');
      assert.strictEqual(result, 'The operator is `~>` for substitution.');
    });

    it('handles multiple ~> in new text', () => {
      const result = settledLine('{~~A~>B ~> C ~> D~~} end.');
      assert.strictEqual(result, 'B ~> C ~> D end.');
    });

    it('handles ~> as the entire new text', () => {
      const result = settledLine('{~~old~>~>~~} done');
      assert.strictEqual(result, '~> done');
    });

    it('handles ~> immediately after separator', () => {
      const result = settledLine('{~~before~>~>after~~}');
      assert.strictEqual(result, '~>after');
    });
  });
});
