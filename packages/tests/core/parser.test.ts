import * as assert from 'node:assert';
import {
  CriticMarkupParser,
  ChangeType,
  ChangeStatus,
  ChangeNode,
  parseTimestamp,
  VirtualDocument,
} from '@changetracks/core/internals';

describe('CriticMarkupParser', () => {
  let parser: CriticMarkupParser;

  beforeEach(() => {
    parser = new CriticMarkupParser();
  });

  // ─── 1. Basic markup types ─────────────────────────────────────────

  describe('basic markup types', () => {
    it('parses an insertion', () => {
      const doc = parser.parse('{++added text++}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Insertion);
      assert.strictEqual(c.modifiedText, 'added text');
      assert.strictEqual(c.originalText, undefined);
      assert.deepStrictEqual(c.range, { start: 0, end: 16 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 13 });
    });

    it('parses a deletion', () => {
      const doc = parser.parse('{--removed text--}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Deletion);
      assert.strictEqual(c.originalText, 'removed text');
      assert.strictEqual(c.modifiedText, undefined);
      assert.deepStrictEqual(c.range, { start: 0, end: 18 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 15 });
    });

    it('parses a substitution', () => {
      const doc = parser.parse('{~~old~>new~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Substitution);
      assert.strictEqual(c.originalText, 'old');
      assert.strictEqual(c.modifiedText, 'new');
      // full range: 0 to 14
      assert.deepStrictEqual(c.range, { start: 0, end: 14 });
      // contentRange: from after {~~ (3) to before ~~} (11)
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 11 });
      // originalRange: from 3 to separatorPos (6)
      assert.deepStrictEqual(c.originalRange, { start: 3, end: 6 });
      // modifiedRange: from after ~> (8) to before ~~} (11)
      assert.deepStrictEqual(c.modifiedRange, { start: 8, end: 11 });
    });

    it('parses a highlight', () => {
      const doc = parser.parse('{==highlighted==}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Highlight);
      assert.strictEqual(c.originalText, 'highlighted');
      assert.deepStrictEqual(c.range, { start: 0, end: 17 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 14 });
      assert.strictEqual(c.metadata, undefined);
    });

    it('parses a standalone comment', () => {
      const doc = parser.parse('{>>a note<<}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Comment);
      assert.deepStrictEqual(c.range, { start: 0, end: 12 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 9 });
      assert.deepStrictEqual(c.metadata, { comment: 'a note' });
    });
  });

  // ─── 2. Range accuracy ─────────────────────────────────────────────

  describe('range accuracy', () => {
    it('computes correct offsets for insertion within surrounding text', () => {
      // 'Hello {++world++} there'
      //  01234567890123456789012
      //        ^  ^    ^
      //        6  9    14 (contentRange.end) then ++} ends at 17
      const doc = parser.parse('Hello {++world++} there');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.deepStrictEqual(c.range, { start: 6, end: 17 });
      assert.deepStrictEqual(c.contentRange, { start: 9, end: 14 });
      assert.strictEqual(c.modifiedText, 'world');
    });

    it('computes correct offsets for deletion within surrounding text', () => {
      // 'abc{--xyz--}def'
      //  012345678901234
      //     ^  ^  ^   ^
      //     3  6  9   12
      const doc = parser.parse('abc{--xyz--}def');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.deepStrictEqual(c.range, { start: 3, end: 12 });
      assert.deepStrictEqual(c.contentRange, { start: 6, end: 9 });
      assert.strictEqual(c.originalText, 'xyz');
    });

    it('computes correct offsets for substitution within surrounding text', () => {
      // 'X{~~before~>after~~}Y'
      //  0123456789012345678901
      //  X{~~ = 1..4, content starts at 4
      //  'before' = 4..10, '~>' at 10..12, 'after' = 12..17, '~~}' = 17..20
      const doc = parser.parse('X{~~before~>after~~}Y');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.deepStrictEqual(c.range, { start: 1, end: 20 });
      assert.deepStrictEqual(c.contentRange, { start: 4, end: 17 });
      assert.deepStrictEqual(c.originalRange, { start: 4, end: 10 });
      assert.deepStrictEqual(c.modifiedRange, { start: 12, end: 17 });
      assert.strictEqual(c.originalText, 'before');
      assert.strictEqual(c.modifiedText, 'after');
    });

    it('computes correct offsets for highlight with attached comment', () => {
      // '{==text==}{>>note<<}'
      //  01234567890123456789
      //  {== = 0..3, text = 3..7, ==} = 7..10
      //  {>> = 10..13, note = 13..17, <<} = 17..20
      // The highlight absorbs the comment; range goes 0..20
      const doc = parser.parse('{==text==}{>>note<<}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Highlight);
      assert.deepStrictEqual(c.range, { start: 0, end: 20 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 7 });
      assert.strictEqual(c.originalText, 'text');
      assert.deepStrictEqual(c.metadata, { comment: 'note' });
    });
  });

  // ─── 3. Multi-line markup ──────────────────────────────────────────

  describe('multi-line markup', () => {
    it('parses insertion spanning multiple lines', () => {
      const text = '{++line1\nline2++}';
      // {++ = 0..3, content = 3..14 ('line1\nline2'), ++} = 14..17
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Insertion);
      assert.strictEqual(c.modifiedText, 'line1\nline2');
      assert.deepStrictEqual(c.range, { start: 0, end: 17 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 14 });
    });

    it('parses deletion spanning multiple lines', () => {
      const text = 'A{--first\nsecond\nthird--}B';
      // A = 0, {-- = 1..4, content = 4..22 ('first\nsecond\nthird'), --} = 22..25, B = 25
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.originalText, 'first\nsecond\nthird');
      assert.deepStrictEqual(c.range, { start: 1, end: 25 });
      assert.deepStrictEqual(c.contentRange, { start: 4, end: 22 });
    });

    it('parses substitution spanning multiple lines', () => {
      const text = '{~~old\ntext~>new\ntext~~}';
      // {~~ = 0..3, 'old\ntext' = 3..11, ~> = 11..13, 'new\ntext' = 13..21, ~~} = 21..24 -- wait let me recount
      // 'old\ntext' is 8 chars: o(3)l(4)d(5)\n(6)t(7)e(8)x(9)t(10) => 3..11
      // ~> at 11..13
      // 'new\ntext' is 8 chars: n(13)e(14)w(15)\n(16)t(17)e(18)x(19)t(20) => 13..21
      // ~~} at 21..24
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.originalText, 'old\ntext');
      assert.strictEqual(c.modifiedText, 'new\ntext');
      assert.deepStrictEqual(c.range, { start: 0, end: 24 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 21 });
      assert.deepStrictEqual(c.originalRange, { start: 3, end: 11 });
      assert.deepStrictEqual(c.modifiedRange, { start: 13, end: 21 });
    });
  });

  // ─── 4. Document order ─────────────────────────────────────────────

  describe('document order', () => {
    it('preserves order of multiple changes in the document', () => {
      const text = '{++first++} middle {--second--} end {~~old~>new~~}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 3);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[0].modifiedText, 'first');
      assert.strictEqual(changes[1].type, ChangeType.Deletion);
      assert.strictEqual(changes[1].originalText, 'second');
      assert.strictEqual(changes[2].type, ChangeType.Substitution);
      assert.strictEqual(changes[2].originalText, 'old');
      assert.strictEqual(changes[2].modifiedText, 'new');

      // ranges should be in ascending order
      assert.ok(changes[0].range.end <= changes[1].range.start);
      assert.ok(changes[1].range.end <= changes[2].range.start);
    });

    it('assigns incrementing counter-based IDs', () => {
      const text = '{++a++}{--b--}{~~c~>d~~}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes[0].id, 'ct-1');
      assert.strictEqual(changes[1].id, 'ct-2');
      assert.strictEqual(changes[2].id, 'ct-3');
    });
  });

  // ─── 5. Adjacent markup ────────────────────────────────────────────

  describe('adjacent markup', () => {
    it('parses two adjacent nodes as separate changes', () => {
      const text = '{++a++}{--b--}';
      // {++a++} = 0..7, {--b--} = 7..14
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[0].modifiedText, 'a');
      assert.deepStrictEqual(changes[0].range, { start: 0, end: 7 });
      assert.strictEqual(changes[1].type, ChangeType.Deletion);
      assert.strictEqual(changes[1].originalText, 'b');
      assert.deepStrictEqual(changes[1].range, { start: 7, end: 14 });
    });

    it('parses three adjacent nodes', () => {
      const text = '{==X==}{>>Y<<}{++Z++}';
      // {==X==} = 0..7, but wait -- highlight checks for adjacent comment
      // At endPos=7, text[7] = '{', text[7..10] = '{>>' which IS CommentOpen
      // So the highlight absorbs the comment. highlight range = 0..14
      // Then {++Z++} = 14..21
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].type, ChangeType.Highlight);
      assert.strictEqual(changes[0].originalText, 'X');
      assert.deepStrictEqual(changes[0].metadata, { comment: 'Y' });
      assert.deepStrictEqual(changes[0].range, { start: 0, end: 14 });
      assert.strictEqual(changes[1].type, ChangeType.Insertion);
      assert.strictEqual(changes[1].modifiedText, 'Z');
      assert.deepStrictEqual(changes[1].range, { start: 14, end: 21 });
    });
  });

  // ─── 6. Edge cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('parses empty insertion {++++}', () => {
      const doc = parser.parse('{++++}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Insertion);
      assert.strictEqual(c.modifiedText, '');
      assert.deepStrictEqual(c.range, { start: 0, end: 6 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 3 });
    });

    it('parses empty deletion {----}', () => {
      const doc = parser.parse('{----}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Deletion);
      assert.strictEqual(changes[0].originalText, '');
    });

    it('parses empty highlight {====}', () => {
      const doc = parser.parse('{====}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Highlight);
      assert.strictEqual(changes[0].originalText, '');
    });

    it('parses empty comment {>><<}', () => {
      const doc = parser.parse('{>><<}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Comment);
      assert.deepStrictEqual(changes[0].metadata, { comment: '' });
    });

    it('skips unclosed insertion', () => {
      const doc = parser.parse('hello {++unclosed text');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('skips unclosed deletion', () => {
      const doc = parser.parse('{--no close');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('skips unclosed substitution', () => {
      const doc = parser.parse('{~~old~>new');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('skips unclosed highlight', () => {
      const doc = parser.parse('{==no close');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('skips unclosed comment', () => {
      const doc = parser.parse('{>>no close');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('skips substitution without separator', () => {
      // {~~oldnew~~} has no ~> separator, so parser returns null
      const doc = parser.parse('{~~oldnew~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('returns empty changes for plain text', () => {
      const doc = parser.parse('This is plain text with no markup.');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('returns empty changes for empty string', () => {
      const doc = parser.parse('');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('skips unclosed markup but parses valid markup after it', () => {
      // The unclosed {++ runs from position 0. The parser tries indexOf('++}', 3) on
      // 'hello {++world++}'. '++}' first appears at position 14.
      // But wait -- '{++not closed then {++world++}':
      // position 0: '{' -> tries '{++' -> yes. contentStart=3, find '++}' from 3.
      // Text: '{++not closed then {++world++}'
      //        0123456789...
      // '++}' first occurrence from 3: at position 27. So it parses as one big insertion
      // with content 'not closed then {++world'.
      // That's not "unclosed then valid". Let me use a different unclosed type + valid type.
      const text = '{--unclosed then {++valid++}';
      // pos 0: '{--' matches DeletionOpen. contentStart=3, find '--}' from 3 => not found => null
      // pos 1: '-' no match; pos 2: '-' no match; pos 3: 'u' no match; ...
      // pos 17: '{' -> '{++' matches InsertionOpen. contentStart=20, find '++}' from 20 => at 25.
      // So we get one insertion.
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[0].modifiedText, 'valid');
    });
  });

  // ─── 7. Highlight with attached comment ────────────────────────────

  describe('highlight with attached comment', () => {
    it('produces ONE node when comment immediately follows highlight', () => {
      const text = '{==highlighted==}{>>this is a comment<<}';
      // {== = 0..3, 'highlighted' = 3..14, ==} = 14..17
      // {>> immediately at 17, commentContentStart = 20
      // 'this is a comment' = 17 chars: 20..37, <<} = 37..40
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Highlight);
      assert.strictEqual(c.originalText, 'highlighted');
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 14 });
      assert.deepStrictEqual(c.range, { start: 0, end: 40 });
      assert.deepStrictEqual(c.metadata, { comment: 'this is a comment' });
    });

    it('sets metadata.comment to the comment text', () => {
      const doc = parser.parse('{==X==}{>>Y<<}');
      const c = doc.getChanges()[0];
      assert.deepStrictEqual(c.metadata, { comment: 'Y' });
    });

    it('works with empty comment attached to highlight', () => {
      const doc = parser.parse('{==text==}{>><<}');
      // {== = 0..3, 'text' = 3..7, ==} = 7..10
      // {>> = 10..13, '' = 13..13, <<} = 13..16
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Highlight);
      assert.deepStrictEqual(changes[0].range, { start: 0, end: 16 });
      assert.deepStrictEqual(changes[0].metadata, { comment: '' });
    });

    it('highlight absorbs comment even when comment is also unclosed (no absorption)', () => {
      // {==text==}{>>unclosed
      // highlight: 0..10, then at 10 checks for {>> -- yes. commentContentStart=13.
      // find '<<}' from 13 => not found => comment not absorbed, endPos stays at 10.
      const doc = parser.parse('{==text==}{>>unclosed');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Highlight);
      assert.deepStrictEqual(c.range, { start: 0, end: 10 });
      assert.strictEqual(c.metadata, undefined);
      // The unclosed {>> after position 10 produces no node either
    });
  });

  // ─── 8. Highlight with whitespace before comment ───────────────────

  describe('highlight with whitespace before comment', () => {
    it('produces TWO nodes when whitespace separates highlight and comment', () => {
      const text = '{==text==} {>>comment<<}';
      // highlight: {== = 0..3, 'text' = 3..7, ==} = 7..10
      // At endPos=10, text[10]=' ' which is NOT '{>>', so no comment absorbed.
      // highlight range = 0..10
      // Then parser continues from 10. pos 10: ' ' no match. pos 11: '{>>' match.
      // comment: {>> = 11..14, 'comment' = 14..21, <<} = 21..24
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);

      assert.strictEqual(changes[0].type, ChangeType.Highlight);
      assert.strictEqual(changes[0].originalText, 'text');
      assert.deepStrictEqual(changes[0].range, { start: 0, end: 10 });
      assert.strictEqual(changes[0].metadata, undefined);

      assert.strictEqual(changes[1].type, ChangeType.Comment);
      assert.deepStrictEqual(changes[1].range, { start: 11, end: 24 });
      assert.deepStrictEqual(changes[1].metadata, { comment: 'comment' });
    });

    it('produces TWO nodes when newline separates highlight and comment', () => {
      const text = '{==text==}\n{>>comment<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].type, ChangeType.Highlight);
      assert.deepStrictEqual(changes[0].range, { start: 0, end: 10 });
      assert.strictEqual(changes[1].type, ChangeType.Comment);
      assert.deepStrictEqual(changes[1].range, { start: 11, end: 24 });
    });
  });

  // ─── 9. Nested / tricky content ───────────────────────────────────

  describe('nested and tricky content', () => {
    it('handles partial opening delimiter inside content', () => {
      // Content contains '{+' which is not a full '{++', should just be content
      const text = '{++text with {+ partial++}';
      // {++ = 0..3, find '++}' from 3 => at 23. content = 'text with {+ partial'
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'text with {+ partial');
    });

    it('handles closing delimiter characters inside content of different type', () => {
      // Content of an insertion that contains '--}' (a deletion close)
      const text = '{++some --} text++}';
      // {++ = 0..3, find '++}' from 3 => at 16. content = 'some --} text'
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'some --} text');
    });

    it('handles multiple ~> separators in substitution (first one wins)', () => {
      // {~~a~>b~>c~~}
      // {~~ = 0..3, find '~~}' from 3 => at 10. contentRange = 3..10 = 'a~>b~>c'
      // find '~>' from 3 => at 4. separatorPos=4, which is < closePos(10).
      // originalText = text[3..4] = 'a', modifiedStart = 4+2 = 6, modifiedText = text[6..10] = 'b~>c'
      const doc = parser.parse('{~~a~>b~>c~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].originalText, 'a');
      assert.strictEqual(changes[0].modifiedText, 'b~>c');
    });

    it('handles content that looks like other markup delimiters', () => {
      // Deletion containing insertion-like text
      const text = '{--{++not real++}--}';
      // {-- = 0..3, find '--}' from 3 => 'not real++}--}' -- where is '--}'?
      // text: {--{++not real++}--}
      //       0123456789012345678901
      // '--}' first at index 17. content = text[3..17] = '{++not real++}'
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Deletion);
      assert.strictEqual(changes[0].originalText, '{++not real++}');
    });

    it('handles curly brace that is not a delimiter', () => {
      const text = 'text {with} curly {++added++} end';
      // '{' at 5 doesn't match any open delimiter (next char 'w' not + - ~ = >)
      // '{' at 18 matches '{++'. {++ = 18..21, find '++}' from 21 => at 26
      // content = 'added', range = 18..29
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[0].modifiedText, 'added');
    });
  });

  // ─── 10. IDs and status ────────────────────────────────────────────

  describe('IDs and status', () => {
    it('generates unique IDs with ct-N format for each type', () => {
      const text = '{++ins++}{--del--}{~~sub~>stitution~~}{==hig==}{>>com<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 4); // highlight absorbs the comment

      // ct-1
      assert.strictEqual(changes[0].id, 'ct-1');
      // ct-2
      assert.strictEqual(changes[1].id, 'ct-2');
      // ct-3
      assert.strictEqual(changes[2].id, 'ct-3');
      // ct-4 (highlight that absorbed comment)
      assert.strictEqual(changes[3].id, 'ct-4');
    });

    it('all changes have Pending status', () => {
      const text = '{++a++}{--b--}{~~c~>d~~}{==e==}{>>f<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      for (const c of changes) {
        assert.strictEqual(c.status, ChangeStatus.Proposed);
      }
    });

    it('counter increments even across different types', () => {
      const text = '{--x--}{--y--}{--z--}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes[0].id, 'ct-1');
      assert.strictEqual(changes[1].id, 'ct-2');
      assert.strictEqual(changes[2].id, 'ct-3');
    });

    it('generates correct ct-N ID for comment type', () => {
      const doc = parser.parse('{>>note<<}');
      assert.strictEqual(doc.getChanges()[0].id, 'ct-1');
    });

    it('generates correct ct-N ID for highlight type', () => {
      const doc = parser.parse('{==note==}');
      assert.strictEqual(doc.getChanges()[0].id, 'ct-1');
    });
  });

  // ─── Additional edge cases ─────────────────────────────────────────

  describe('additional edge cases', () => {
    it('parses substitution with empty original and non-empty modified', () => {
      // {~~  ~>new~~}
      // Actually: {~~   has open at 0..3, we need '~>' in content.
      // Let's do {~~  ~>replacement~~}
      // But wait, does {~~  contain a ~> search? indexOf('~>', 3) on '{~~~~}' ... no that's wrong.
      // '{~~  ~>new~~}' -- open at 0..3, find '~~}' from 3 => at 10. content = '~>new' ... hmm
      // Actually: '{~~  ~>new~~}'
      //            0123456789012
      // find '~~}' from 3: '  ~>new~~}' -- '~~' at index 8,9 then '}' at 10? Let me re-examine.
      // text = '{~~  ~>new~~}'
      //         0123456789012
      // text[0..3] = '{~~'
      // text[3] = ' ', text[4] = ' ', text[5] = '~', text[6] = '>', text[7] = 'n', text[8] = 'e', text[9] = 'w', text[10] = '~', text[11] = '~', text[12] = '}'
      // indexOf('~~}', 3): looking for '~~}' -- at index 10: text[10]='~', text[11]='~', text[12]='}' => YES, closePos = 10.
      // indexOf('~>', 3): at index 5: text[5]='~', text[6]='>' => YES, separatorPos = 5. 5 < 10 so valid.
      // originalText = text[3..5] = '  ', modifiedStart = 5+2 = 7, modifiedText = text[7..10] = 'new'
      const doc = parser.parse('{~~  ~>new~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].originalText, '  ');
      assert.strictEqual(changes[0].modifiedText, 'new');
    });

    it('parses substitution with non-empty original and empty modified', () => {
      // '{~~old~>~~}'
      //  01234567890
      // {~~ = 0..3, find '~~}' from 3: text[7]='~', text[8]='~', text[9]='}' => closePos=7? Wait.
      // text = '{~~old~>~~}'
      //         01234567890
      // text[0]='{', text[1]='~', text[2]='~', text[3]='o', text[4]='l', text[5]='d', text[6]='~', text[7]='>', text[8]='~', text[9]='~', text[10]='}'
      // indexOf('~~}', 3): check index 8: text[8]='~', text[9]='~', text[10]='}' => closePos=8
      // indexOf('~>', 3): check index 6: text[6]='~', text[7]='>' => separatorPos=6, 6<8 OK
      // originalText = text[3..6] = 'old', modifiedStart = 6+2 = 8, modifiedText = text[8..8] = ''
      const doc = parser.parse('{~~old~>~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].originalText, 'old');
      assert.strictEqual(changes[0].modifiedText, '');
    });

    it('parses substitution when new text contains literal ~~} inside backticks', () => {
      // Closing ~~} inside `...` must not end the substitution; the real close is after the backticks.
      const doc = parser.parse('{~~old~>drops the `{~~` and `~~}` wrapping.~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.type, ChangeType.Substitution);
      assert.strictEqual(c.originalText, 'old');
      assert.strictEqual(c.modifiedText, 'drops the `{~~` and `~~}` wrapping.');
    });

    it('handles substitution where ~> appears after close (treated as malformed)', () => {
      // '{~~no separator~~} then ~> later'
      // Parser checks: indexOf('~~}', 3) => found. indexOf('~>', 3): is it before closePos?
      // text = '{~~no separator~~} then ~> later'
      //         0123456789012345678901234567890
      // text[3..] = 'no separator~~} then ~> later'
      // indexOf('~~}', 3): at index 15: text[15]='~', text[16]='~', text[17]='}' => closePos=15
      // indexOf('~>', 3): scanning from 3... 'no separator' has no ~>. Actually wait:
      // We need to check for '~>' within content. Let's look at each char:
      // text[15]='~', text[16]='~' but that's '~~' not '~>'.
      // Hmm actually we need a case where ~> is NOT found before ~~}.
      // Let's just use '{~~nosep~~}'
      const doc = parser.parse('{~~nosep~~}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('handles only opening brace characters (not full delimiters)', () => {
      const doc = parser.parse('{+ {- {~ {= {>');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });

    it('handles a document with all five types', () => {
      const text = '{++add++}{--del--}{~~old~>new~~}{==mark==}{>>note<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      // highlight absorbs the comment: {==mark==}{>>note<<} = 1 node
      assert.strictEqual(changes.length, 4);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[1].type, ChangeType.Deletion);
      assert.strictEqual(changes[2].type, ChangeType.Substitution);
      assert.strictEqual(changes[3].type, ChangeType.Highlight);
      assert.deepStrictEqual(changes[3].metadata, { comment: 'note' });
    });

    it('handles standalone comment not preceded by highlight', () => {
      const text = 'Some text {>>standalone comment<<} more text';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Comment);
      assert.deepStrictEqual(changes[0].metadata, { comment: 'standalone comment' });
      // 'Some text ' = 10 chars. {>> = 10..13, content = 13..31, <<} = 31..34
      assert.deepStrictEqual(changes[0].range, { start: 10, end: 34 });
      assert.deepStrictEqual(changes[0].contentRange, { start: 13, end: 31 });
    });
  });

  // ─── 11. Footnote references ──────────────────────────────────────

  describe('footnote references', () => {
    it('parses insertion with footnote ref [^ct-1]', () => {
      // '{++added++}[^ct-1]'
      //  0123456789012345678
      //  {++ = 0..3, 'added' = 3..8, ++} = 8..11, [^ct-1] = 11..18
      const doc = parser.parse('{++added++}[^ct-1]');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.type, ChangeType.Insertion);
      assert.deepStrictEqual(c.range, { start: 0, end: 18 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 8 });
      assert.strictEqual(c.modifiedText, 'added');
    });

    it('parses deletion with footnote ref [^ct-2]', () => {
      // '{--removed--}[^ct-2]'
      //  01234567890123456789
      //  {-- = 0..3, 'removed' = 3..10, --} = 10..13, [^ct-2] = 13..20
      const doc = parser.parse('{--removed--}[^ct-2]');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-2');
      assert.strictEqual(c.type, ChangeType.Deletion);
      assert.deepStrictEqual(c.range, { start: 0, end: 20 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 10 });
      assert.strictEqual(c.originalText, 'removed');
    });

    it('parses substitution with footnote ref [^ct-3]', () => {
      // '{~~old~>new~~}[^ct-3]'
      //  012345678901234567890
      //  {~~ = 0..3, 'old' = 3..6, ~> = 6..8, 'new' = 8..11, ~~} = 11..14, [^ct-3] = 14..21
      const doc = parser.parse('{~~old~>new~~}[^ct-3]');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-3');
      assert.strictEqual(c.type, ChangeType.Substitution);
      assert.deepStrictEqual(c.range, { start: 0, end: 21 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 11 });
      assert.strictEqual(c.originalText, 'old');
      assert.strictEqual(c.modifiedText, 'new');
    });

    it('parses highlight with footnote ref [^ct-4]', () => {
      // '{==text==}[^ct-4]'
      //  01234567890123456
      //  {== = 0..3, 'text' = 3..7, ==} = 7..10, [^ct-4] = 10..17
      const doc = parser.parse('{==text==}[^ct-4]');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-4');
      assert.strictEqual(c.type, ChangeType.Highlight);
      assert.deepStrictEqual(c.range, { start: 0, end: 17 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 7 });
      assert.strictEqual(c.originalText, 'text');
    });

    it('parses highlight+comment with footnote ref [^ct-5]', () => {
      // '{==text==}{>>note<<}[^ct-5]'
      //  012345678901234567890123456
      //  {== = 0..3, 'text' = 3..7, ==} = 7..10
      //  {>> = 10..13, 'note' = 13..17, <<} = 17..20
      //  [^ct-5] = 20..27
      const doc = parser.parse('{==text==}{>>note<<}[^ct-5]');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-5');
      assert.strictEqual(c.type, ChangeType.Highlight);
      assert.deepStrictEqual(c.range, { start: 0, end: 27 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 7 });
      assert.strictEqual(c.originalText, 'text');
      assert.deepStrictEqual(c.metadata, { comment: 'note' });
    });

    it('attaches footnote ref to Level 1 nodes (inline comment + footnote)', () => {
      const text = '{~~old~>new~~}{>>reason<<}[^ct-3]\n\n[^ct-3]: @alice | 2026-03-04 | sub | proposed';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      const change = changes.find(c => c.id === 'ct-3');
      assert.ok(change, 'should find change with ct-3 ID from footnote ref');
      assert.strictEqual(change!.level, 2);
      assert.strictEqual(change!.anchored, true);
    });

    it('parses dotted ID [^ct-17.2]', () => {
      // '{++text++}[^ct-17.2]'
      //  01234567890123456789
      //  {++ = 0..3, 'text' = 3..7, ++} = 7..10, [^ct-17.2] = 10..20
      const doc = parser.parse('{++text++}[^ct-17.2]');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-17.2');
      assert.strictEqual(c.type, ChangeType.Insertion);
      assert.deepStrictEqual(c.range, { start: 0, end: 20 });
      assert.deepStrictEqual(c.contentRange, { start: 3, end: 7 });
      assert.strictEqual(c.modifiedText, 'text');
    });

    it('assigns ct-1 ID when no footnote ref present', () => {
      const doc = parser.parse('{++text++}');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].id, 'ct-1');
    });

    it('computes correct ranges with surrounding text', () => {
      // 'Hello {++world++}[^ct-1] there'
      //  0123456789012345678901234567890
      //  'Hello ' = 0..6
      //  {++ = 6..9, 'world' = 9..14, ++} = 14..17
      //  [^ct-1] = 17..24
      //  ' there' = 24..30
      const doc = parser.parse('Hello {++world++}[^ct-1] there');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.deepStrictEqual(c.range, { start: 6, end: 24 });
      assert.deepStrictEqual(c.contentRange, { start: 9, end: 14 });
      assert.strictEqual(c.modifiedText, 'world');
    });
  });

  // ─── 12. Footnote definitions and metadata merge ──────────────────

  describe('footnote definitions', () => {
    it('merges author and date from footnote definition into metadata', () => {
      const text = [
        '{++added text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.metadata?.author, '@alice');
      assert.strictEqual(c.metadata?.date, '2026-02-10');
    });

    it('maps reason: to discussion comment (backward compat)', () => {
      const text = [
        '{--removed paragraph--}[^ct-2]',
        '',
        '[^ct-2]: @bob | 2026-02-09 | del | proposed',
        '    reason: Redundant paragraph',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.discussion?.[0].text, 'Redundant paragraph');
      assert.strictEqual(c.metadata?.discussion?.[0].author, '@bob');
      assert.strictEqual(c.metadata?.author, '@bob');
    });

    it('maps status from footnote definition', () => {
      const text = [
        '{++accepted text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | accepted',
      ].join('\n');
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges()[0].status, ChangeStatus.Accepted);
    });

    it('maps rejected status from footnote definition', () => {
      const text = [
        '{--rejected text--}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | del | rejected',
      ].join('\n');
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges()[0].status, ChangeStatus.Rejected);
    });

    it('parses multiple footnote definitions', () => {
      const text = [
        '{++first++}[^ct-1] and {--second--}[^ct-2]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | pending',
        '[^ct-2]: @bob | 2026-02-09 | del | accepted',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].metadata?.author, '@alice');
      assert.strictEqual(changes[1].metadata?.author, '@bob');
      assert.strictEqual(changes[1].status, ChangeStatus.Accepted);
    });

    it('handles dotted IDs in footnote definitions', () => {
      const text = [
        '{++first++}[^ct-17.1] and {++second++}[^ct-17.2]',
        '',
        '[^ct-17.1]: @alice | 2026-02-10 | ins | pending',
        '[^ct-17.2]: @alice | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].id, 'ct-17.1');
      assert.strictEqual(changes[1].id, 'ct-17.2');
      assert.strictEqual(changes[0].metadata?.author, '@alice');
      assert.strictEqual(changes[1].metadata?.author, '@alice');
    });

    it('works when inline markup has no matching footnote definition', () => {
      const text = '{++orphan++}[^ct-99]';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].id, 'ct-99');
      assert.strictEqual(changes[0].status, ChangeStatus.Proposed);
      // No metadata merged — should be undefined or only have pre-existing metadata
    });

    it('ignores orphan footnote definitions with no matching inline markup', () => {
      const text = [
        '{++text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | pending',
        '[^ct-999]: @ghost | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].id, 'ct-1');
      assert.strictEqual(changes[0].metadata?.author, '@alice');
    });

    it('synthesizes ChangeNodes from settled footnote refs (post-Layer-1 settlement)', () => {
      // After Layer 1 settlement: inline CriticMarkup removed, [^ct-N] refs and footnotes remain
      const text = [
        '<!-- ctrcks.com/v1: tracked -->',
        'The API uses GraphQL[^ct-1] for the public interface.',
        'We added rate limiting[^ct-2] to all endpoints.',
        '',
        '[^ct-1]: @ai:claude | 2026-02-25 | sub | accepted',
        '    @ai:claude 2026-02-25: Changed from REST to GraphQL',
        '[^ct-2]: @ai:claude | 2026-02-25 | ins | accepted',
        '    @ai:claude 2026-02-25: Added rate limiting',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);

      // ct-1: settled substitution
      assert.strictEqual(changes[0].id, 'ct-1');
      assert.strictEqual(changes[0].type, ChangeType.Substitution);
      assert.strictEqual(changes[0].status, ChangeStatus.Accepted);
      assert.strictEqual(changes[0].settled, true);
      assert.strictEqual(changes[0].level, 2);
      assert.strictEqual(changes[0].metadata?.author, '@ai:claude');

      // ct-2: settled insertion
      assert.strictEqual(changes[1].id, 'ct-2');
      assert.strictEqual(changes[1].type, ChangeType.Insertion);
      assert.strictEqual(changes[1].status, ChangeStatus.Accepted);
      assert.strictEqual(changes[1].settled, true);
    });

    it('does not double-count changes that have both inline markup and footnote refs', () => {
      // Normal case: inline CriticMarkup with footnote ref — should NOT create settled node
      const text = [
        '{++added text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].settled, undefined); // NOT settled — has inline markup
    });

    it('handles mixed settled and active changes in the same file', () => {
      const text = [
        'Settled change here[^ct-1] and {++active insertion++}[^ct-2].',
        '',
        '[^ct-1]: @ai:claude | 2026-02-25 | del | accepted',
        '[^ct-2]: @ai:claude | 2026-02-25 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);

      // ct-1 is settled (no inline markup)
      const settled = changes.find(c => c.id === 'ct-1');
      assert.ok(settled);
      assert.strictEqual(settled!.settled, true);
      assert.strictEqual(settled!.type, ChangeType.Deletion);

      // ct-2 is active (has inline markup)
      const active = changes.find(c => c.id === 'ct-2');
      assert.ok(active);
      assert.strictEqual(active!.settled, undefined);
      assert.strictEqual(active!.type, ChangeType.Insertion);
    });

    it('does not treat footnote definition lines as CriticMarkup', () => {
      // The [^ct-N]: line should not be parsed as inline markup
      const text = [
        '{++text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 1);
    });

    it('accepts 2-space indented field lines', () => {
      const text = [
        '{++text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
        '  reason: Two-space indent',
      ].join('\n');
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges()[0].metadata?.discussion?.[0].text, 'Two-space indent');
    });

    it('accepts tab-indented field lines', () => {
      const text = [
        '{++text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
        '\treason: Tab indent',
      ].join('\n');
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges()[0].metadata?.discussion?.[0].text, 'Tab indent');
    });

    it('accepts 8-space indented field lines', () => {
      const text = [
        '{++text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
        '        reason: Deep indent',
      ].join('\n');
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges()[0].metadata?.discussion?.[0].text, 'Deep indent');
    });

    it('parses footnote definition without author', () => {
      const text = [
        '{++added text++}[^ct-1]',
        '',
        '[^ct-1]: 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.metadata?.author, undefined);
      assert.strictEqual(c.metadata?.date, '2026-02-10');
    });

    it('preserves inline comment and maps reason to discussion', () => {
      const text = [
        '{==highlighted==}{>>inline note<<}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | hig | proposed',
        '    reason: Important section',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.author, '@alice');
      assert.strictEqual(c.metadata?.comment, 'inline note');
      assert.strictEqual(c.metadata?.discussion?.[0].text, 'Important section');
    });
  });

  // ─── 12b. Level 2 footnote parsing ────────────────────────────────────

  describe('Level 2 footnote parsing', () => {

    // --- Approvals / Rejections / Request-Changes ---

    it('parses approved: lines into metadata.approvals', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    approved: @eve 2024-01-20',
        '    approved: @carol 2024-01-19 "Benchmarks look good"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.approvals?.length, 2);
      assert.deepStrictEqual(c.metadata?.approvals?.[0], { author: '@eve', date: '2024-01-20', timestamp: parseTimestamp('2024-01-20') });
      assert.deepStrictEqual(c.metadata?.approvals?.[1], { author: '@carol', date: '2024-01-19', timestamp: parseTimestamp('2024-01-19'), reason: 'Benchmarks look good' });
    });

    it('parses rejected: lines into metadata.rejections', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    rejected: @carol 2024-01-19 "Needs more benchmarking"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.rejections?.length, 1);
      assert.deepStrictEqual(c.metadata?.rejections?.[0], { author: '@carol', date: '2024-01-19', timestamp: parseTimestamp('2024-01-19'), reason: 'Needs more benchmarking' });
    });

    it('parses request-changes: lines into metadata.requestChanges', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    request-changes: @eve 2024-01-18 "Pick one protocol"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.requestChanges?.length, 1);
      assert.deepStrictEqual(c.metadata?.requestChanges?.[0], { author: '@eve', date: '2024-01-18', timestamp: parseTimestamp('2024-01-18'), reason: 'Pick one protocol' });
    });

    // --- Context ---

    it('parses context: into metadata.context', () => {
      const text = [
        '{~~REST~>GraphQL~~}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | sub | proposed',
        '    context: "The API should use {REST} for the public interface"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.context, 'The API should use {REST} for the public interface');
    });

    // --- Revisions ---

    it('parses revisions: block into metadata.revisions', () => {
      const text = [
        '{~~REST~>GraphQL~~}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | sub | proposed',
        '    revisions:',
        '      r1 @bob 2024-01-16: "OAuth 2.0"',
        '      r2 @bob 2024-01-18: "OAuth 2.0 with JWT tokens"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.revisions?.length, 2);
      assert.deepStrictEqual(c.metadata?.revisions?.[0], {
        label: 'r1', author: '@bob', date: '2024-01-16', timestamp: parseTimestamp('2024-01-16'), text: 'OAuth 2.0',
      });
      assert.deepStrictEqual(c.metadata?.revisions?.[1], {
        label: 'r2', author: '@bob', date: '2024-01-18', timestamp: parseTimestamp('2024-01-18'), text: 'OAuth 2.0 with JWT tokens',
      });
    });

    // --- Discussion comments ---

    it('parses discussion comments with threading depth', () => {
      const text = [
        '{~~REST~>GraphQL~~}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | sub | proposed',
        '    @carol 2024-01-17: Why robust? Simple was intentional.',
        '      @alice 2024-01-17: Simple undersells our capabilities.',
        '        @dave 2024-01-18: Agreed with Alice on this.',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.discussion?.length, 3);
      assert.strictEqual(c.metadata?.discussion?.[0].author, '@carol');
      assert.strictEqual(c.metadata?.discussion?.[0].date, '2024-01-17');
      assert.strictEqual(c.metadata?.discussion?.[0].text, 'Why robust? Simple was intentional.');
      assert.strictEqual(c.metadata?.discussion?.[0].depth, 0);
      assert.strictEqual(c.metadata?.discussion?.[1].author, '@alice');
      assert.strictEqual(c.metadata?.discussion?.[1].depth, 1);
      assert.strictEqual(c.metadata?.discussion?.[2].author, '@dave');
      assert.strictEqual(c.metadata?.discussion?.[2].depth, 2);
    });

    // --- Comment labels ---

    it('parses comment labels like [question] and [issue/blocking]', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    @bob 2024-01-16 [question]: What about latency requirements for gRPC?',
        '    @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.discussion?.length, 2);
      assert.strictEqual(c.metadata?.discussion?.[0].label, 'question');
      assert.strictEqual(c.metadata?.discussion?.[0].text, 'What about latency requirements for gRPC?');
      assert.strictEqual(c.metadata?.discussion?.[1].label, 'issue/blocking');
      assert.strictEqual(c.metadata?.discussion?.[1].text, '100/min feels low for production.');
    });

    // --- Multi-line discussion comments ---

    it('parses multi-line discussion comments (continuation lines)', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    @carol 2024-01-17: This needs more thought. The current rate limit',
        '    is based on our staging environment, not production. We need to',
        '    model this against actual traffic patterns before committing.',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.discussion?.length, 1);
      assert.strictEqual(c.metadata?.discussion?.[0].author, '@carol');
      assert.strictEqual(
        c.metadata?.discussion?.[0].text,
        'This needs more thought. The current rate limit\nis based on our staging environment, not production. We need to\nmodel this against actual traffic patterns before committing.'
      );
    });

    // --- Resolution: resolved ---

    it('parses resolved @author date', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    resolved @dave 2024-01-17',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.deepStrictEqual(c.metadata?.resolution, {
        type: 'resolved', author: '@dave', date: '2024-01-17', timestamp: parseTimestamp('2024-01-17'), reason: undefined,
      });
    });

    it('parses resolved @author date: reason', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    resolved @carol 2024-01-18: Addressed by r2',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.deepStrictEqual(c.metadata?.resolution, {
        type: 'resolved', author: '@carol', date: '2024-01-18', timestamp: parseTimestamp('2024-01-18'), reason: 'Addressed by r2',
      });
    });

    // --- Resolution: open ---

    it('parses open -- reason', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    open -- awaiting load test results from @dave',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.deepStrictEqual(c.metadata?.resolution, {
        type: 'open', reason: 'awaiting load test results from @dave',
      });
    });

    it('parses bare open', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    open',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.deepStrictEqual(c.metadata?.resolution, {
        type: 'open', reason: undefined,
      });
    });

    // --- reason: backward compat ---

    it('maps reason: to discussion comment by footnote author', () => {
      const text = [
        '{--removed--}[^ct-1]',
        '',
        '[^ct-1]: @bob | 2024-01-15 | del | proposed',
        '    reason: This paragraph was redundant',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.discussion?.length, 1);
      assert.strictEqual(c.metadata?.discussion?.[0].author, '@bob');
      assert.strictEqual(c.metadata?.discussion?.[0].date, '2024-01-15');
      assert.strictEqual(c.metadata?.discussion?.[0].text, 'This paragraph was redundant');
      assert.strictEqual(c.metadata?.discussion?.[0].depth, 0);
      // Should NOT be in metadata.comment
      assert.strictEqual(c.metadata?.comment, undefined);
    });

    // --- Complete spec example ---

    it('parses the complete Level 2 spec example', () => {
      const text = [
        'The API should use {~~REST~>GraphQL~~}[^ct-1] for the public interface.',
        '',
        '[^ct-1]: @alice | 2024-01-15 | sub | accepted',
        '    approved: @eve 2024-01-20',
        '    context: "The API should use {REST} for the public interface"',
        '    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.',
        '    @dave 2024-01-16: GraphQL increases client complexity.',
        '      @alice 2024-01-16: But reduces over-fetching. See PR #42.',
        '    resolved @dave 2024-01-17',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];

      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.status, ChangeStatus.Accepted);
      assert.strictEqual(c.metadata?.author, '@alice');
      assert.strictEqual(c.metadata?.date, '2024-01-15');

      // Approvals
      assert.strictEqual(c.metadata?.approvals?.length, 1);
      assert.deepStrictEqual(c.metadata?.approvals?.[0], { author: '@eve', date: '2024-01-20', timestamp: parseTimestamp('2024-01-20') });

      // Context
      assert.strictEqual(c.metadata?.context, 'The API should use {REST} for the public interface');

      // Discussion
      assert.strictEqual(c.metadata?.discussion?.length, 3);
      assert.strictEqual(c.metadata?.discussion?.[0].author, '@alice');
      assert.strictEqual(c.metadata?.discussion?.[0].text, 'GraphQL reduces over-fetching for dashboard clients.');
      assert.strictEqual(c.metadata?.discussion?.[0].depth, 0);
      assert.strictEqual(c.metadata?.discussion?.[1].author, '@dave');
      assert.strictEqual(c.metadata?.discussion?.[1].text, 'GraphQL increases client complexity.');
      assert.strictEqual(c.metadata?.discussion?.[1].depth, 0);
      assert.strictEqual(c.metadata?.discussion?.[2].author, '@alice');
      assert.strictEqual(c.metadata?.discussion?.[2].text, 'But reduces over-fetching. See PR #42.');
      assert.strictEqual(c.metadata?.discussion?.[2].depth, 1);

      // Resolution
      assert.deepStrictEqual(c.metadata?.resolution, {
        type: 'resolved', author: '@dave', date: '2024-01-17', timestamp: parseTimestamp('2024-01-17'), reason: undefined,
      });
    });

    // --- AI authors ---

    it('parses AI authors in discussion (e.g., @ai:claude-opus-4.6)', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @ai:claude-opus-4.6 | 2024-01-15 | ins | proposed',
        '    @ai:claude-opus-4.6 2024-01-15: I suggest this change for clarity.',
        '      @alice 2024-01-16: Agreed, good suggestion.',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.author, '@ai:claude-opus-4.6');
      assert.strictEqual(c.metadata?.discussion?.length, 2);
      assert.strictEqual(c.metadata?.discussion?.[0].author, '@ai:claude-opus-4.6');
      assert.strictEqual(c.metadata?.discussion?.[0].depth, 0);
      assert.strictEqual(c.metadata?.discussion?.[1].author, '@alice');
      assert.strictEqual(c.metadata?.discussion?.[1].depth, 1);
    });

    // --- Empty footnote body (Level 1 only) ---

    it('leaves discussion/approvals/resolution undefined for header-only footnote', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.author, '@alice');
      assert.strictEqual(c.metadata?.discussion, undefined);
      assert.strictEqual(c.metadata?.approvals, undefined);
      assert.strictEqual(c.metadata?.resolution, undefined);
      assert.strictEqual(c.metadata?.context, undefined);
      assert.strictEqual(c.metadata?.revisions, undefined);
    });

    // --- Blank lines within footnote body ---

    it('tolerates blank lines within footnote body', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    approved: @eve 2024-01-20',
        '',
        '    @carol 2024-01-17: First comment.',
        '',
        '    @dave 2024-01-18: Second comment.',
        '    resolved @dave 2024-01-18',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.approvals?.length, 1);
      assert.strictEqual(c.metadata?.discussion?.length, 2);
      assert.strictEqual(c.metadata?.discussion?.[0].author, '@carol');
      assert.strictEqual(c.metadata?.discussion?.[1].author, '@dave');
      assert.deepStrictEqual(c.metadata?.resolution, {
        type: 'resolved', author: '@dave', date: '2024-01-18', timestamp: parseTimestamp('2024-01-18'), reason: undefined,
      });
    });

    // --- Approval without reason ---

    it('parses approval without quoted reason', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    approved: @eve 2024-01-20',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.approvals?.[0].reason, undefined);
    });

    // --- Discussion with no text after colon ---

    it('handles discussion comment with empty text after colon', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    @bob 2024-01-16:',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.discussion?.length, 1);
      assert.strictEqual(c.metadata?.discussion?.[0].text, '');
    });

    // --- Mixed metadata and discussion ---

    it('parses metadata and discussion interleaved correctly', () => {
      const text = [
        '{++added++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2024-01-15 | ins | proposed',
        '    context: "Some {context} here"',
        '    approved: @eve 2024-01-20',
        '    rejected: @frank 2024-01-19 "Not convinced"',
        '    request-changes: @grace 2024-01-18 "Needs tests"',
        '    revisions:',
        '      r1 @alice 2024-01-16: "First draft"',
        '    @alice 2024-01-15: Initial rationale.',
        '      @bob 2024-01-16 [suggestion]: Consider an alternative approach.',
        '    resolved @alice 2024-01-20: All feedback addressed',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];

      assert.strictEqual(c.metadata?.context, 'Some {context} here');
      assert.strictEqual(c.metadata?.approvals?.length, 1);
      assert.strictEqual(c.metadata?.rejections?.length, 1);
      assert.strictEqual(c.metadata?.rejections?.[0].reason, 'Not convinced');
      assert.strictEqual(c.metadata?.requestChanges?.length, 1);
      assert.strictEqual(c.metadata?.requestChanges?.[0].reason, 'Needs tests');
      assert.strictEqual(c.metadata?.revisions?.length, 1);
      assert.strictEqual(c.metadata?.revisions?.[0].label, 'r1');
      assert.strictEqual(c.metadata?.discussion?.length, 2);
      assert.strictEqual(c.metadata?.discussion?.[0].depth, 0);
      assert.strictEqual(c.metadata?.discussion?.[1].depth, 1);
      assert.strictEqual(c.metadata?.discussion?.[1].label, 'suggestion');
      assert.deepStrictEqual(c.metadata?.resolution, {
        type: 'resolved', author: '@alice', date: '2024-01-20', timestamp: parseTimestamp('2024-01-20'), reason: 'All feedback addressed',
      });
    });
  });

  // ─── 13. Move fields on ChangeNode ──────────────────────────────────

  describe('move fields on ChangeNode', () => {
    it('ChangeNode supports moveRole and groupId fields', () => {
      const node: ChangeNode = {
        id: 'ct-1.1',
        type: ChangeType.Deletion,
        status: ChangeStatus.Proposed,
        range: { start: 0, end: 10 },
        contentRange: { start: 3, end: 7 },
        originalText: 'moved',
        moveRole: 'from',
        groupId: 'ct-1',
        level: 0,
        anchored: false,
      };
      assert.strictEqual(node.moveRole, 'from');
      assert.strictEqual(node.groupId, 'ct-1');
    });

    it('ChangeNode moveRole and groupId are optional (backward compat)', () => {
      const node: ChangeNode = {
        id: 'ct-1',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        range: { start: 0, end: 10 },
        contentRange: { start: 3, end: 7 },
        level: 0,
        anchored: false,
      };
      assert.strictEqual(node.moveRole, undefined);
      assert.strictEqual(node.groupId, undefined);
    });
  });

  // ─── 14. Move resolution ──────────────────────────────────────────

  describe('move resolution', () => {
    it('sets moveRole and groupId on move group members', () => {
      const text = [
        '{--moved text--}[^ct-5.1] and {++moved text++}[^ct-5.2]',
        '',
        '[^ct-5]: @alice | 2026-02-10 | move | proposed',
        '[^ct-5.1]: @alice | 2026-02-10 | del | proposed',
        '[^ct-5.2]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);

      const del = changes.find(c => c.id === 'ct-5.1')!;
      assert.strictEqual(del.groupId, 'ct-5');
      assert.strictEqual(del.moveRole, 'from');

      const ins = changes.find(c => c.id === 'ct-5.2')!;
      assert.strictEqual(ins.groupId, 'ct-5');
      assert.strictEqual(ins.moveRole, 'to');
    });

    it('does not set moveRole/groupId on non-move changes', () => {
      const text = [
        '{++added text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.groupId, undefined);
      assert.strictEqual(c.moveRole, undefined);
    });

    it('handles multiple move groups independently', () => {
      const text = [
        '{--first--}[^ct-3.1] {++first++}[^ct-3.2] {--second--}[^ct-4.1] {++second++}[^ct-4.2]',
        '',
        '[^ct-3]: @alice | 2026-02-10 | move | proposed',
        '[^ct-3.1]: @alice | 2026-02-10 | del | proposed',
        '[^ct-3.2]: @alice | 2026-02-10 | ins | proposed',
        '[^ct-4]: @bob | 2026-02-10 | move | proposed',
        '[^ct-4.1]: @bob | 2026-02-10 | del | proposed',
        '[^ct-4.2]: @bob | 2026-02-10 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();

      const g3del = changes.find(c => c.id === 'ct-3.1')!;
      assert.strictEqual(g3del.groupId, 'ct-3');
      assert.strictEqual(g3del.moveRole, 'from');

      const g4ins = changes.find(c => c.id === 'ct-4.2')!;
      assert.strictEqual(g4ins.groupId, 'ct-4');
      assert.strictEqual(g4ins.moveRole, 'to');
    });

    it('handles orphan move parent (no matching children)', () => {
      const text = [
        '{++normal text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | proposed',
        '[^ct-99]: @alice | 2026-02-10 | move | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      assert.strictEqual(c.groupId, undefined);
      assert.strictEqual(c.moveRole, undefined);
    });
  });

  // ─── VirtualDocument integration ───────────────────────────────────

  describe('VirtualDocument.fromOverlayOnly', () => {
    it('creates a single insertion ChangeNode from overlay at start', () => {
      const doc = VirtualDocument.fromOverlayOnly({
        range: { start: 0, end: 5 },
        text: 'hello',
        type: 'insertion',
      });
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[0].status, ChangeStatus.Proposed);
      assert.strictEqual(changes[0].range.start, 0);
      assert.strictEqual(changes[0].range.end, 5);
      assert.strictEqual(changes[0].contentRange.start, 0);
      assert.strictEqual(changes[0].contentRange.end, 5);
      assert.strictEqual(changes[0].level, 1);
      assert.strictEqual(changes[0].id, 'ct-pending-0');
    });

    it('uses scId when provided', () => {
      const doc = VirtualDocument.fromOverlayOnly({
        range: { start: 10, end: 20 },
        text: 'inserted',
        type: 'insertion',
        scId: 'ct-17',
      });
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].id, 'ct-17');
    });

    it('changeAtOffset finds overlay change', () => {
      const doc = VirtualDocument.fromOverlayOnly({
        range: { start: 5, end: 12 },
        text: 'world',
        type: 'insertion',
      });
      assert.ok(doc.changeAtOffset(7) !== null);
      assert.strictEqual(doc.changeAtOffset(7)!.type, ChangeType.Insertion);
      assert.strictEqual(doc.changeAtOffset(0), null);
    });
  });

  describe('VirtualDocument integration', () => {
    it('returns a VirtualDocument with getChanges() method', () => {
      const doc = parser.parse('{++test++}');
      assert.ok(typeof doc.getChanges === 'function');
      assert.ok(Array.isArray(doc.getChanges()));
    });

    it('changeAtOffset finds the correct node', () => {
      const doc = parser.parse('abc{++def++}ghi');
      // {++ at 3..6, content 'def' at 6..9, ++} at 9..12
      // changeAtOffset should find nodes where offset is within range [start, end]
      const node = doc.changeAtOffset(5);
      assert.ok(node !== null);
      assert.strictEqual(node!.type, ChangeType.Insertion);

      const noNode = doc.changeAtOffset(0);
      assert.strictEqual(noNode, null);
    });
  });

  // ─── Level 1 adjacent comment parsing ─────────────────────────────

  describe('Level 1 adjacent comment parsing', () => {
    it('parses adjacent comment as Level 1 metadata (author only)', () => {
      const text = '{~~REST~>GraphQL~~}{>>@alice<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      assert.strictEqual(change.level, 1);
      assert.strictEqual(change.inlineMetadata?.author, '@alice');
    });

    it('parses adjacent comment with pipe-separated fields', () => {
      const text = '{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|proposed<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      assert.strictEqual(change.level, 1);
      assert.strictEqual(change.inlineMetadata?.author, '@alice');
      assert.strictEqual(change.inlineMetadata?.date, '2026-02-13');
      assert.strictEqual(change.inlineMetadata?.type, 'sub');
      assert.strictEqual(change.inlineMetadata?.status, 'proposed');
    });

    it('parses Level 1 with author and status only', () => {
      const text = '{++new text++}{>>@bob|approved<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      assert.strictEqual(change.level, 1);
      assert.strictEqual(change.inlineMetadata?.author, '@bob');
      assert.strictEqual(change.inlineMetadata?.status, 'approved');
    });

    it('parses free-text reason in Level 1 comment', () => {
      const text = '{++rate limiting++}{>>performance concern<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      assert.strictEqual(change.level, 1);
      assert.strictEqual(change.inlineMetadata?.freeText, 'performance concern');
    });

    it('distinguishes Level 0 (no adjacent comment)', () => {
      const text = '{~~REST~>GraphQL~~}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      assert.strictEqual(change.level, 0);
      assert.strictEqual(change.inlineMetadata, undefined);
    });

    it('distinguishes Level 2 (footnote ref)', () => {
      const text = '{~~REST~>GraphQL~~}[^ct-1]\n\n[^ct-1]: @alice | 2026-02-13 | sub | proposed';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      assert.strictEqual(change.level, 2);
    });

    it('handles whitespace around pipes in Level 1', () => {
      const text = '{~~old~>new~~}{>>@alice | approved<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      assert.strictEqual(change.inlineMetadata?.author, '@alice');
      assert.strictEqual(change.inlineMetadata?.status, 'approved');
    });

    it('handles empty fields between pipes', () => {
      const text = '{~~old~>new~~}{>>@alice||2026-02-13<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      assert.strictEqual(change.inlineMetadata?.author, '@alice');
      assert.strictEqual(change.inlineMetadata?.date, '2026-02-13');
    });
  });

  // ─── 15. Code block awareness ──────────────────────────────────────

  describe('code block awareness — fenced code blocks', () => {
    it('ignores CriticMarkup inside backtick fence', () => {
      const text = '```\n{++not a change++}\n```\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('ignores CriticMarkup inside tilde fence', () => {
      const text = '~~~\n{++not a change++}\n~~~\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('ignores CriticMarkup in fence with info string', () => {
      const text = '```javascript\n{++not a change++}\n```\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('parses real change BEFORE fence, ignores CriticMarkup inside fence', () => {
      const text = 'Real {++change++}\n```\n{++not a change++}\n```\n';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'change');
    });

    it('parses real change AFTER fence', () => {
      const text = '```\n{++not a change++}\n```\n{++real++}\n';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'real');
    });

    it('treats unclosed fence as extending to end of document', () => {
      const text = '```\n{++everything after unclosed fence is code++}\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('does not close fence when closing fence is too short', () => {
      // 4-backtick fence opened, 3-backtick close attempt
      const text = '````\n{++still in fence++}\n```\n{++still in fence too++}\n````\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('handles nested backtick inside tilde fence (inner backticks are content)', () => {
      const text = '~~~\n```\n{++inside both fences++}\n```\n~~~\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('handles real changes before, between, and after fences', () => {
      const text = '{--deleted--}\n```\n{++code example++}\n```\n{++real insertion++}\n';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].type, ChangeType.Deletion);
      assert.strictEqual(changes[0].originalText, 'deleted');
      assert.strictEqual(changes[1].type, ChangeType.Insertion);
      assert.strictEqual(changes[1].modifiedText, 'real insertion');
    });

    it('ignores substitution syntax in tilde fence', () => {
      const text = '~~~\n{~~old~>new~~}\n~~~\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('handles fence with up to 3 leading spaces', () => {
      const text = '   ```\n{++indented fence++}\n   ```\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('does NOT treat 4-space indented backticks as a fence', () => {
      // 4 spaces = not a fence per CommonMark. However, the triple backticks
      // still form an inline code span per CommonMark section 6.1 (inline code
      // spans can cross lines), so the CriticMarkup inside is still skipped.
      const text = '    ```\n{++not a fence with 4 spaces++}\n    ```\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('4-space indented single backticks do not suppress CriticMarkup', () => {
      // A single backtick on a line that has no matching close means no inline code span
      const text = '    `\n{++real change++}\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 1);
      assert.strictEqual(doc.getChanges()[0].modifiedText, 'real change');
    });

    it('does not close backtick fence with tildes', () => {
      const text = '```\n{++still in fence++}\n~~~\n{++still in fence too++}\n```\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('does not close tilde fence with backticks', () => {
      const text = '~~~\n{++still in fence++}\n```\n{++still in fence too++}\n~~~\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('handles fence closing with trailing whitespace', () => {
      const text = '```\n{++code++}\n```   \n{++real++}\n';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'real');
    });

    it('does not treat closing fence with trailing content as a close', () => {
      const text = '```\n{++still code++}\n``` not a close\n{++still code too++}\n```\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });
  });

  describe('code block awareness — inline code spans', () => {
    it('ignores CriticMarkup inside single-backtick inline code', () => {
      const text = 'The syntax `{++text++}` for additions.';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('ignores CriticMarkup inside double-backtick inline code', () => {
      const text = 'Use ``{++text++}`` for additions.';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('ignores CriticMarkup inside triple-backtick inline code', () => {
      const text = 'Use ```{++text++}``` for additions.';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('parses CriticMarkup after unmatched backtick (no code span)', () => {
      // A single backtick with no matching close is NOT a code span
      const text = 'Some `unmatched backtick and {++real change++}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'real change');
    });

    it('does not start inline code inside fenced block', () => {
      // Backticks inside a fence are content, not inline code delimiters
      const text = '```\n`{++inside fence++}`\n```\n';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('handles multiple inline code spans on one line', () => {
      const text = '`{++a++}` and `{--b--}` and {++real++}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'real');
    });

    it('handles deletion inside inline code', () => {
      const text = 'Use `{--deletion syntax--}` to remove text.';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('handles substitution inside inline code', () => {
      const text = 'Use `{~~old~>new~~}` for substitutions.';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('handles highlight inside inline code', () => {
      const text = 'Use `{==text==}` for highlights.';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('handles comment inside inline code', () => {
      const text = 'Use `{>>note<<}` for comments.';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });
  });

  describe('code block awareness — mixed scenarios', () => {
    it('handles real changes + code fences + inline code together', () => {
      const text = [
        '{++real insertion++}',
        '```',
        '{++fenced code++}',
        '```',
        'Use `{--inline code--}` syntax.',
        '{--real deletion--}',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[0].modifiedText, 'real insertion');
      assert.strictEqual(changes[1].type, ChangeType.Deletion);
      assert.strictEqual(changes[1].originalText, 'real deletion');
    });

    it('footnote definitions NOT inside code blocks still parse correctly', () => {
      const text = [
        '{++added text++}[^ct-1]',
        '',
        '```',
        '{++not a change++}',
        '```',
        '',
        '[^ct-1]: @alice | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].id, 'ct-1');
      assert.strictEqual(changes[0].metadata?.author, '@alice');
    });

    it('handles CriticMarkup cheatsheet document correctly', () => {
      const text = [
        '# CriticMarkup Cheatsheet',
        '',
        'Use `{++inserted text++}` for additions.',
        '',
        '```javascript',
        'const example = "{++not a real insertion++}";',
        '```',
        '',
        'Inline: backtick-wrapped `{--also not real--}` should be left alone.',
        '',
        'This is a {++real change++} in the document.',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'real change');
    });

    it('existing plain text tests still work (no code constructs = no zones)', () => {
      // This verifies backward compat: no backticks/fences → parser works as before
      const text = '{++a++}{--b--}{~~c~>d~~}{==e==}{>>f<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      // highlight absorbs comment: 4 changes total
      assert.strictEqual(changes.length, 4);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[1].type, ChangeType.Deletion);
      assert.strictEqual(changes[2].type, ChangeType.Substitution);
      assert.strictEqual(changes[3].type, ChangeType.Highlight);
    });

    it('real change adjacent to code fence', () => {
      const text = '```\ncode\n```\n{++real++}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].modifiedText, 'real');
    });

    it('fence at very start of document', () => {
      const text = '```\n{++code++}\n```';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('inline code at very start of document', () => {
      const text = '`{++code++}` rest';
      const doc = parser.parse(text);
      assert.strictEqual(doc.getChanges().length, 0);
    });
  });

  // ─── Settled ref detection (post-Layer-1 settlement) ────────────────

  describe('settled ref detection', () => {
    it('synthesizes a ChangeNode from a standalone [^ct-N] ref with footnote', () => {
      const text = [
        'The API uses REST[^ct-1] for all endpoints.',
        '',
        '[^ct-1]: @ai:claude-opus-4.6 | 2026-02-20 | sub | accepted',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.type, ChangeType.Substitution);
      assert.strictEqual(c.status, ChangeStatus.Accepted);
      assert.strictEqual(c.settled, true);
      assert.strictEqual(c.level, 2);
      assert.strictEqual(c.metadata?.author, '@ai:claude-opus-4.6');
      assert.strictEqual(c.metadata?.status, 'accepted');
      // Range covers exactly the [^ct-1] ref
      const ref = '[^ct-1]';
      assert.strictEqual(c.range.end - c.range.start, ref.length);
      // contentRange is empty (no inline content)
      assert.strictEqual(c.contentRange.start, c.contentRange.end);
    });

    it('does not synthesize when [^ct-N] is attached to CriticMarkup', () => {
      const text = [
        '{++new text++}[^ct-1]',
        '',
        '[^ct-1]: @alice | 2026-02-20 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.type, ChangeType.Insertion);
      assert.strictEqual(c.settled, undefined); // NOT a settled ref
    });

    it('ignores standalone [^ct-N] refs with no matching footnote definition', () => {
      const text = 'Some text[^ct-99] with an orphan ref.';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 0);
    });
  });

  // ─── Unified ct-N IDs ──────────────────────────────────────────────

  describe('unified change IDs', () => {
    it('assigns ct-N IDs to Level 0 changes', () => {
      const parser2 = new CriticMarkupParser();
      const doc = parser2.parse('{++added++} and {--removed--}');
      const changes = doc.getChanges();
      assert.strictEqual(changes[0].id, 'ct-1');
      assert.strictEqual(changes[1].id, 'ct-2');
      assert.strictEqual(changes[0].anchored, false);
      assert.strictEqual(changes[1].anchored, false);
    });

    it('assigns ct-N IDs starting after max existing ct-N in file', () => {
      const parser2 = new CriticMarkupParser();
      const text = '{++first++}[^ct-5]\n\n[^ct-5]: @alice | 2026-03-04 | ins | proposed\n\n{++second++}';
      const doc = parser2.parse(text);
      const changes = doc.getChanges();
      const anchored = changes.find(c => c.id === 'ct-5');
      const unanchored = changes.find(c => c.id === 'ct-6');
      assert.ok(anchored, 'should find ct-5');
      assert.ok(unanchored, 'should find ct-6 (next after max)');
      assert.strictEqual(anchored!.anchored, true);
      assert.strictEqual(unanchored!.anchored, false);
    });

    it('does not produce positional IDs like ins-0 or sub-1', () => {
      const parser2 = new CriticMarkupParser();
      const doc = parser2.parse('{++a++} {--b--} {~~c~>d~~}');
      for (const c of doc.getChanges()) {
        assert.ok(c.id.startsWith('ct-'), `expected ct- prefix, got ${c.id}`);
      }
    });
  });
});
