import * as assert from 'assert';
import {
  CriticMarkupParser,
  nextChange,
  previousChange,
  VirtualDocument,
} from '@changetracks/core/internals';

describe('Navigation', () => {
  const parser = new CriticMarkupParser();

  describe('nextChange', () => {
    it('returns first change when cursor is at beginning of document', () => {
      const doc = parser.parse('Hello {++world++} foo');
      const result = nextChange(doc, 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.modifiedText, 'world');
    });

    it('returns next change when cursor is between two changes', () => {
      const doc = parser.parse('{++first++} middle {--second--}');
      // Cursor at offset 15 is inside "middle " — between the two changes
      // First change: {++first++} occupies [0, 11)
      // Second change: {--second--} starts at 19
      const result = nextChange(doc, 15);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.originalText, 'second');
    });

    it('wraps to first change when cursor is after the last change', () => {
      const doc = parser.parse('{++alpha++} text {--beta--} trailing');
      // "trailing" starts after the last change ends
      // {--beta--} ends at 27, so cursor at 30 is after
      const result = nextChange(doc, 30);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.modifiedText, 'alpha');
    });

    it('returns null when document has no changes', () => {
      const doc = parser.parse('plain text with no markup');
      const result = nextChange(doc, 0);
      assert.strictEqual(result, null);
    });

    it('wraps to itself when only one change exists and cursor is after it', () => {
      const doc = parser.parse('{++only++} trailing');
      // {++only++} spans [0, 10), cursor at 12 is after
      const result = nextChange(doc, 12);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.modifiedText, 'only');
    });

    it('returns the single change when cursor is before it', () => {
      const doc = parser.parse('prefix {++only++}');
      const result = nextChange(doc, 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.modifiedText, 'only');
    });

    it('skips current change and returns next when cursor is at change start', () => {
      // Cursor at exact start of first change: range.start is NOT > cursorOffset, so it skips
      // {++first++} starts at 0, {--second--} starts at 11
      const doc = parser.parse('{++first++} {--second--}');
      const result = nextChange(doc, 0);
      // cursorOffset=0, first change start=0, 0 > 0 is false so skips first
      // second change start=12, 12 > 0 is true so returns second
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.originalText, 'second');
    });

    it('handles three changes and navigates through them', () => {
      const doc = parser.parse('a{++ins++}b{--del--}c{~~old~>new~~}d');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 3);

      // From before all changes
      const first = nextChange(doc, 0);
      assert.notStrictEqual(first, null);
      assert.strictEqual(first!.modifiedText, 'ins');

      // From between first and second
      const second = nextChange(doc, changes[0].range.end);
      assert.notStrictEqual(second, null);
      assert.strictEqual(second!.originalText, 'del');

      // From between second and third
      const third = nextChange(doc, changes[1].range.end);
      assert.notStrictEqual(third, null);
      assert.strictEqual(third!.originalText, 'old');
      assert.strictEqual(third!.modifiedText, 'new');
    });

    it('returns empty document changes as null', () => {
      const doc = parser.parse('');
      assert.strictEqual(nextChange(doc, 0), null);
    });
  });

  describe('previousChange', () => {
    it('returns last change before cursor when cursor is at end', () => {
      const doc = parser.parse('Hello {++world++} end');
      const result = previousChange(doc, 21);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.modifiedText, 'world');
    });

    it('returns the change immediately before cursor when between changes', () => {
      const doc = parser.parse('{++first++} middle {--second--}');
      // First change ends at 11, second starts at 19
      // Cursor at 15 is in "middle"
      const result = previousChange(doc, 15);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.modifiedText, 'first');
    });

    it('wraps to last change when cursor is before the first change', () => {
      // previousChange iterates backwards; if no change has start < cursorOffset, wraps to last
      const doc = parser.parse('{++alpha++} text {--beta--}');
      // Cursor at 0, first change starts at 0 — 0 < 0 is false
      const result = previousChange(doc, 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.originalText, 'beta');
    });

    it('returns null when document has no changes', () => {
      const doc = parser.parse('no markup here');
      const result = previousChange(doc, 5);
      assert.strictEqual(result, null);
    });

    it('wraps to itself when only one change exists and cursor is before it', () => {
      const doc = parser.parse('prefix {--only--}');
      // {--only--} starts at 7, cursor at 0: 7 < 0 is false, so wraps to last = itself
      const result = previousChange(doc, 0);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.originalText, 'only');
    });

    it('returns the single change when cursor is after it', () => {
      const doc = parser.parse('{--only--} suffix');
      // {--only--} starts at 0, cursor at 15: 0 < 15 is true
      const result = previousChange(doc, 15);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.originalText, 'only');
    });

    it('handles three changes and navigates backwards through them', () => {
      const doc = parser.parse('a{++ins++}b{--del--}c{~~old~>new~~}d');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 3);

      // From after all changes
      const last = previousChange(doc, 100);
      assert.notStrictEqual(last, null);
      assert.strictEqual(last!.originalText, 'old');

      // From between second and third
      const middle = previousChange(doc, changes[2].range.start);
      assert.notStrictEqual(middle, null);
      assert.strictEqual(middle!.originalText, 'del');

      // From between first and second
      const first = previousChange(doc, changes[1].range.start);
      assert.notStrictEqual(first, null);
      assert.strictEqual(first!.modifiedText, 'ins');
    });

    it('returns empty document changes as null', () => {
      const doc = parser.parse('');
      assert.strictEqual(previousChange(doc, 0), null);
    });

    it('returns the closer change when cursor is between two adjacent changes', () => {
      // Two changes next to each other: {++a++}{--b--}
      // {++a++} range [0,7), {--b--} range [7,14)
      const doc = parser.parse('{++a++}{--b--}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].range.end, 7);
      assert.strictEqual(changes[1].range.start, 7);

      // Cursor at 8 is inside the second change.
      // Iterating backwards: second change start=7, 7 < 8 is true => returns second (deletion).
      const result = previousChange(doc, 8);
      assert.notStrictEqual(result, null);
      assert.strictEqual(result!.originalText, 'b');

      // Cursor exactly at boundary (7): second change start=7, 7 < 7 is false.
      // First change start=0, 0 < 7 is true => returns first (insertion).
      const atBoundary = previousChange(doc, 7);
      assert.notStrictEqual(atBoundary, null);
      assert.strictEqual(atBoundary!.modifiedText, 'a');
    });
  });
});
