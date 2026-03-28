import { describe, it, expect, beforeEach } from 'vitest';
import {
  CriticMarkupParser,
  ChangeType,
  ChangeStatus,
  ChangeNode,
  parseTimestamp,
  VirtualDocument,
} from '@changedown/core/internals';

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
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Insertion);
      expect(c.modifiedText).toBe('added text');
      expect(c.originalText).toBeUndefined();
      expect(c.range).toStrictEqual({ start: 0, end: 16 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 13 });
    });

    it('parses a deletion', () => {
      const doc = parser.parse('{--removed text--}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Deletion);
      expect(c.originalText).toBe('removed text');
      expect(c.modifiedText).toBeUndefined();
      expect(c.range).toStrictEqual({ start: 0, end: 18 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 15 });
    });

    it('parses a substitution', () => {
      const doc = parser.parse('{~~old~>new~~}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Substitution);
      expect(c.originalText).toBe('old');
      expect(c.modifiedText).toBe('new');
      // full range: 0 to 14
      expect(c.range).toStrictEqual({ start: 0, end: 14 });
      // contentRange: from after {~~ (3) to before ~~} (11)
      expect(c.contentRange).toStrictEqual({ start: 3, end: 11 });
      // originalRange: from 3 to separatorPos (6)
      expect(c.originalRange).toStrictEqual({ start: 3, end: 6 });
      // modifiedRange: from after ~> (8) to before ~~} (11)
      expect(c.modifiedRange).toStrictEqual({ start: 8, end: 11 });
    });

    it('parses a highlight', () => {
      const doc = parser.parse('{==highlighted==}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Highlight);
      expect(c.originalText).toBe('highlighted');
      expect(c.range).toStrictEqual({ start: 0, end: 17 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 14 });
      expect(c.metadata).toBeUndefined();
    });

    it('parses a standalone comment', () => {
      const doc = parser.parse('{>>a note<<}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Comment);
      expect(c.range).toStrictEqual({ start: 0, end: 12 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 9 });
      expect(c.metadata).toStrictEqual({ comment: 'a note' });
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
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.range).toStrictEqual({ start: 6, end: 17 });
      expect(c.contentRange).toStrictEqual({ start: 9, end: 14 });
      expect(c.modifiedText).toBe('world');
    });

    it('computes correct offsets for deletion within surrounding text', () => {
      // 'abc{--xyz--}def'
      //  012345678901234
      //     ^  ^  ^   ^
      //     3  6  9   12
      const doc = parser.parse('abc{--xyz--}def');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.range).toStrictEqual({ start: 3, end: 12 });
      expect(c.contentRange).toStrictEqual({ start: 6, end: 9 });
      expect(c.originalText).toBe('xyz');
    });

    it('computes correct offsets for substitution within surrounding text', () => {
      // 'X{~~before~>after~~}Y'
      //  0123456789012345678901
      //  X{~~ = 1..4, content starts at 4
      //  'before' = 4..10, '~>' at 10..12, 'after' = 12..17, '~~}' = 17..20
      const doc = parser.parse('X{~~before~>after~~}Y');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.range).toStrictEqual({ start: 1, end: 20 });
      expect(c.contentRange).toStrictEqual({ start: 4, end: 17 });
      expect(c.originalRange).toStrictEqual({ start: 4, end: 10 });
      expect(c.modifiedRange).toStrictEqual({ start: 12, end: 17 });
      expect(c.originalText).toBe('before');
      expect(c.modifiedText).toBe('after');
    });

    it('computes correct offsets for highlight with attached comment', () => {
      // '{==text==}{>>note<<}'
      //  01234567890123456789
      //  {== = 0..3, text = 3..7, ==} = 7..10
      //  {>> = 10..13, note = 13..17, <<} = 17..20
      // The highlight absorbs the comment; range goes 0..20
      const doc = parser.parse('{==text==}{>>note<<}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Highlight);
      expect(c.range).toStrictEqual({ start: 0, end: 20 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 7 });
      expect(c.originalText).toBe('text');
      expect(c.metadata).toStrictEqual({ comment: 'note' });
    });
  });

  // ─── 3. Multi-line markup ──────────────────────────────────────────

  describe('multi-line markup', () => {
    it('parses insertion spanning multiple lines', () => {
      const text = '{++line1\nline2++}';
      // {++ = 0..3, content = 3..14 ('line1\nline2'), ++} = 14..17
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Insertion);
      expect(c.modifiedText).toBe('line1\nline2');
      expect(c.range).toStrictEqual({ start: 0, end: 17 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 14 });
    });

    it('parses deletion spanning multiple lines', () => {
      const text = 'A{--first\nsecond\nthird--}B';
      // A = 0, {-- = 1..4, content = 4..22 ('first\nsecond\nthird'), --} = 22..25, B = 25
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.originalText).toBe('first\nsecond\nthird');
      expect(c.range).toStrictEqual({ start: 1, end: 25 });
      expect(c.contentRange).toStrictEqual({ start: 4, end: 22 });
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
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.originalText).toBe('old\ntext');
      expect(c.modifiedText).toBe('new\ntext');
      expect(c.range).toStrictEqual({ start: 0, end: 24 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 21 });
      expect(c.originalRange).toStrictEqual({ start: 3, end: 11 });
      expect(c.modifiedRange).toStrictEqual({ start: 13, end: 21 });
    });
  });

  // ─── 4. Document order ─────────────────────────────────────────────

  describe('document order', () => {
    it('preserves order of multiple changes in the document', () => {
      const text = '{++first++} middle {--second--} end {~~old~>new~~}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(3);
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[0].modifiedText).toBe('first');
      expect(changes[1].type).toBe(ChangeType.Deletion);
      expect(changes[1].originalText).toBe('second');
      expect(changes[2].type).toBe(ChangeType.Substitution);
      expect(changes[2].originalText).toBe('old');
      expect(changes[2].modifiedText).toBe('new');

      // ranges should be in ascending order
      expect(changes[0].range.end <= changes[1].range.start).toBeTruthy();
      expect(changes[1].range.end <= changes[2].range.start).toBeTruthy();
    });

    it('assigns incrementing counter-based IDs', () => {
      const text = '{++a++}{--b--}{~~c~>d~~}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes[0].id).toBe('cn-1');
      expect(changes[1].id).toBe('cn-2');
      expect(changes[2].id).toBe('cn-3');
    });
  });

  // ─── 5. Adjacent markup ────────────────────────────────────────────

  describe('adjacent markup', () => {
    it('parses two adjacent nodes as separate changes', () => {
      const text = '{++a++}{--b--}';
      // {++a++} = 0..7, {--b--} = 7..14
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[0].modifiedText).toBe('a');
      expect(changes[0].range).toStrictEqual({ start: 0, end: 7 });
      expect(changes[1].type).toBe(ChangeType.Deletion);
      expect(changes[1].originalText).toBe('b');
      expect(changes[1].range).toStrictEqual({ start: 7, end: 14 });
    });

    it('parses three adjacent nodes', () => {
      const text = '{==X==}{>>Y<<}{++Z++}';
      // {==X==} = 0..7, but wait -- highlight checks for adjacent comment
      // At endPos=7, text[7] = '{', text[7..10] = '{>>' which IS CommentOpen
      // So the highlight absorbs the comment. highlight range = 0..14
      // Then {++Z++} = 14..21
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);
      expect(changes[0].type).toBe(ChangeType.Highlight);
      expect(changes[0].originalText).toBe('X');
      expect(changes[0].metadata).toStrictEqual({ comment: 'Y' });
      expect(changes[0].range).toStrictEqual({ start: 0, end: 14 });
      expect(changes[1].type).toBe(ChangeType.Insertion);
      expect(changes[1].modifiedText).toBe('Z');
      expect(changes[1].range).toStrictEqual({ start: 14, end: 21 });
    });
  });

  // ─── 6. Edge cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('parses empty insertion {++++}', () => {
      const doc = parser.parse('{++++}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Insertion);
      expect(c.modifiedText).toBe('');
      expect(c.range).toStrictEqual({ start: 0, end: 6 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 3 });
    });

    it('parses empty deletion {----}', () => {
      const doc = parser.parse('{----}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Deletion);
      expect(changes[0].originalText).toBe('');
    });

    it('parses empty highlight {====}', () => {
      const doc = parser.parse('{====}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Highlight);
      expect(changes[0].originalText).toBe('');
    });

    it('parses empty comment {>><<}', () => {
      const doc = parser.parse('{>><<}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Comment);
      expect(changes[0].metadata).toStrictEqual({ comment: '' });
    });

    it('skips unclosed insertion', () => {
      const doc = parser.parse('hello {++unclosed text');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });

    it('skips unclosed deletion', () => {
      const doc = parser.parse('{--no close');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });

    it('skips unclosed substitution', () => {
      const doc = parser.parse('{~~old~>new');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });

    it('skips unclosed highlight', () => {
      const doc = parser.parse('{==no close');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });

    it('skips unclosed comment', () => {
      const doc = parser.parse('{>>no close');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });

    it('skips substitution without separator', () => {
      // {~~oldnew~~} has no ~> separator, so parser returns null
      const doc = parser.parse('{~~oldnew~~}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });

    it('returns empty changes for plain text', () => {
      const doc = parser.parse('This is plain text with no markup.');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });

    it('returns empty changes for empty string', () => {
      const doc = parser.parse('');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
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
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[0].modifiedText).toBe('valid');
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
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Highlight);
      expect(c.originalText).toBe('highlighted');
      expect(c.contentRange).toStrictEqual({ start: 3, end: 14 });
      expect(c.range).toStrictEqual({ start: 0, end: 40 });
      expect(c.metadata).toStrictEqual({ comment: 'this is a comment' });
    });

    it('sets metadata.comment to the comment text', () => {
      const doc = parser.parse('{==X==}{>>Y<<}');
      const c = doc.getChanges()[0];
      expect(c.metadata).toStrictEqual({ comment: 'Y' });
    });

    it('works with empty comment attached to highlight', () => {
      const doc = parser.parse('{==text==}{>><<}');
      // {== = 0..3, 'text' = 3..7, ==} = 7..10
      // {>> = 10..13, '' = 13..13, <<} = 13..16
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Highlight);
      expect(changes[0].range).toStrictEqual({ start: 0, end: 16 });
      expect(changes[0].metadata).toStrictEqual({ comment: '' });
    });

    it('highlight absorbs comment even when comment is also unclosed (no absorption)', () => {
      // {==text==}{>>unclosed
      // highlight: 0..10, then at 10 checks for {>> -- yes. commentContentStart=13.
      // find '<<}' from 13 => not found => comment not absorbed, endPos stays at 10.
      const doc = parser.parse('{==text==}{>>unclosed');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Highlight);
      expect(c.range).toStrictEqual({ start: 0, end: 10 });
      expect(c.metadata).toBeUndefined();
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
      expect(changes).toHaveLength(2);

      expect(changes[0].type).toBe(ChangeType.Highlight);
      expect(changes[0].originalText).toBe('text');
      expect(changes[0].range).toStrictEqual({ start: 0, end: 10 });
      expect(changes[0].metadata).toBeUndefined();

      expect(changes[1].type).toBe(ChangeType.Comment);
      expect(changes[1].range).toStrictEqual({ start: 11, end: 24 });
      expect(changes[1].metadata).toStrictEqual({ comment: 'comment' });
    });

    it('produces TWO nodes when newline separates highlight and comment', () => {
      const text = '{==text==}\n{>>comment<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);
      expect(changes[0].type).toBe(ChangeType.Highlight);
      expect(changes[0].range).toStrictEqual({ start: 0, end: 10 });
      expect(changes[1].type).toBe(ChangeType.Comment);
      expect(changes[1].range).toStrictEqual({ start: 11, end: 24 });
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
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('text with {+ partial');
    });

    it('handles closing delimiter characters inside content of different type', () => {
      // Content of an insertion that contains '--}' (a deletion close)
      const text = '{++some --} text++}';
      // {++ = 0..3, find '++}' from 3 => at 16. content = 'some --} text'
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('some --} text');
    });

    it('handles multiple ~> separators in substitution (first one wins)', () => {
      // {~~a~>b~>c~~}
      // {~~ = 0..3, find '~~}' from 3 => at 10. contentRange = 3..10 = 'a~>b~>c'
      // find '~>' from 3 => at 4. separatorPos=4, which is < closePos(10).
      // originalText = text[3..4] = 'a', modifiedStart = 4+2 = 6, modifiedText = text[6..10] = 'b~>c'
      const doc = parser.parse('{~~a~>b~>c~~}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].originalText).toBe('a');
      expect(changes[0].modifiedText).toBe('b~>c');
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
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Deletion);
      expect(changes[0].originalText).toBe('{++not real++}');
    });

    it('handles curly brace that is not a delimiter', () => {
      const text = 'text {with} curly {++added++} end';
      // '{' at 5 doesn't match any open delimiter (next char 'w' not + - ~ = >)
      // '{' at 18 matches '{++'. {++ = 18..21, find '++}' from 21 => at 26
      // content = 'added', range = 18..29
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[0].modifiedText).toBe('added');
    });
  });

  // ─── 10. IDs and status ────────────────────────────────────────────

  describe('IDs and status', () => {
    it('generates unique IDs with cn-N format for each type', () => {
      const text = '{++ins++}{--del--}{~~sub~>stitution~~}{==hig==}{>>com<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(4); // highlight absorbs the comment

      // cn-1
      expect(changes[0].id).toBe('cn-1');
      // cn-2
      expect(changes[1].id).toBe('cn-2');
      // cn-3
      expect(changes[2].id).toBe('cn-3');
      // cn-4 (highlight that absorbed comment)
      expect(changes[3].id).toBe('cn-4');
    });

    it('all changes have Pending status', () => {
      const text = '{++a++}{--b--}{~~c~>d~~}{==e==}{>>f<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      for (const c of changes) {
        expect(c.status).toBe(ChangeStatus.Proposed);
      }
    });

    it('counter increments even across different types', () => {
      const text = '{--x--}{--y--}{--z--}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes[0].id).toBe('cn-1');
      expect(changes[1].id).toBe('cn-2');
      expect(changes[2].id).toBe('cn-3');
    });

    it('generates correct cn-N ID for comment type', () => {
      const doc = parser.parse('{>>note<<}');
      expect(doc.getChanges()[0].id).toBe('cn-1');
    });

    it('generates correct cn-N ID for highlight type', () => {
      const doc = parser.parse('{==note==}');
      expect(doc.getChanges()[0].id).toBe('cn-1');
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
      expect(changes).toHaveLength(1);
      expect(changes[0].originalText).toBe('  ');
      expect(changes[0].modifiedText).toBe('new');
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
      expect(changes).toHaveLength(1);
      expect(changes[0].originalText).toBe('old');
      expect(changes[0].modifiedText).toBe('');
    });

    it('parses substitution when new text contains literal ~~} inside backticks', () => {
      // Closing ~~} inside `...` must not end the substitution; the real close is after the backticks.
      const doc = parser.parse('{~~old~>drops the `{~~` and `~~}` wrapping.~~}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.type).toBe(ChangeType.Substitution);
      expect(c.originalText).toBe('old');
      expect(c.modifiedText).toBe('drops the `{~~` and `~~}` wrapping.');
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
      expect(changes).toHaveLength(0);
    });

    it('handles only opening brace characters (not full delimiters)', () => {
      const doc = parser.parse('{+ {- {~ {= {>');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });

    it('handles a document with all five types', () => {
      const text = '{++add++}{--del--}{~~old~>new~~}{==mark==}{>>note<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      // highlight absorbs the comment: {==mark==}{>>note<<} = 1 node
      expect(changes).toHaveLength(4);
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[1].type).toBe(ChangeType.Deletion);
      expect(changes[2].type).toBe(ChangeType.Substitution);
      expect(changes[3].type).toBe(ChangeType.Highlight);
      expect(changes[3].metadata).toStrictEqual({ comment: 'note' });
    });

    it('handles standalone comment not preceded by highlight', () => {
      const text = 'Some text {>>standalone comment<<} more text';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Comment);
      expect(changes[0].metadata).toStrictEqual({ comment: 'standalone comment' });
      // 'Some text ' = 10 chars. {>> = 10..13, content = 13..31, <<} = 31..34
      expect(changes[0].range).toStrictEqual({ start: 10, end: 34 });
      expect(changes[0].contentRange).toStrictEqual({ start: 13, end: 31 });
    });
  });

  // ─── 11. Footnote references ──────────────────────────────────────

  describe('footnote references', () => {
    it('parses insertion with footnote ref [^cn-1]', () => {
      // '{++added++}[^cn-1]'
      //  0123456789012345678
      //  {++ = 0..3, 'added' = 3..8, ++} = 8..11, [^cn-1] = 11..18
      const doc = parser.parse('{++added++}[^cn-1]');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-1');
      expect(c.type).toBe(ChangeType.Insertion);
      expect(c.range).toStrictEqual({ start: 0, end: 18 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 8 });
      expect(c.modifiedText).toBe('added');
    });

    it('parses deletion with footnote ref [^cn-2]', () => {
      // '{--removed--}[^cn-2]'
      //  01234567890123456789
      //  {-- = 0..3, 'removed' = 3..10, --} = 10..13, [^cn-2] = 13..20
      const doc = parser.parse('{--removed--}[^cn-2]');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-2');
      expect(c.type).toBe(ChangeType.Deletion);
      expect(c.range).toStrictEqual({ start: 0, end: 20 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 10 });
      expect(c.originalText).toBe('removed');
    });

    it('parses substitution with footnote ref [^cn-3]', () => {
      // '{~~old~>new~~}[^cn-3]'
      //  012345678901234567890
      //  {~~ = 0..3, 'old' = 3..6, ~> = 6..8, 'new' = 8..11, ~~} = 11..14, [^cn-3] = 14..21
      const doc = parser.parse('{~~old~>new~~}[^cn-3]');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-3');
      expect(c.type).toBe(ChangeType.Substitution);
      expect(c.range).toStrictEqual({ start: 0, end: 21 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 11 });
      expect(c.originalText).toBe('old');
      expect(c.modifiedText).toBe('new');
    });

    it('parses highlight with footnote ref [^cn-4]', () => {
      // '{==text==}[^cn-4]'
      //  01234567890123456
      //  {== = 0..3, 'text' = 3..7, ==} = 7..10, [^cn-4] = 10..17
      const doc = parser.parse('{==text==}[^cn-4]');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-4');
      expect(c.type).toBe(ChangeType.Highlight);
      expect(c.range).toStrictEqual({ start: 0, end: 17 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 7 });
      expect(c.originalText).toBe('text');
    });

    it('parses highlight+comment with footnote ref [^cn-5]', () => {
      // '{==text==}{>>note<<}[^cn-5]'
      //  012345678901234567890123456
      //  {== = 0..3, 'text' = 3..7, ==} = 7..10
      //  {>> = 10..13, 'note' = 13..17, <<} = 17..20
      //  [^cn-5] = 20..27
      const doc = parser.parse('{==text==}{>>note<<}[^cn-5]');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-5');
      expect(c.type).toBe(ChangeType.Highlight);
      expect(c.range).toStrictEqual({ start: 0, end: 27 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 7 });
      expect(c.originalText).toBe('text');
      expect(c.metadata).toStrictEqual({ comment: 'note' });
    });

    it('attaches footnote ref to Level 1 nodes (inline comment + footnote)', () => {
      const text = '{~~old~>new~~}{>>reason<<}[^cn-3]\n\n[^cn-3]: @alice | 2026-03-04 | sub | proposed';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      const change = changes.find(c => c.id === 'cn-3');
      expect(change, 'should find change with cn-3 ID from footnote ref').toBeTruthy();
      expect(change!.level).toBe(2);
      expect(change!.anchored).toBe(true);
    });

    it('parses dotted ID [^cn-17.2]', () => {
      // '{++text++}[^cn-17.2]'
      //  01234567890123456789
      //  {++ = 0..3, 'text' = 3..7, ++} = 7..10, [^cn-17.2] = 10..20
      const doc = parser.parse('{++text++}[^cn-17.2]');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-17.2');
      expect(c.type).toBe(ChangeType.Insertion);
      expect(c.range).toStrictEqual({ start: 0, end: 20 });
      expect(c.contentRange).toStrictEqual({ start: 3, end: 7 });
      expect(c.modifiedText).toBe('text');
    });

    it('assigns cn-1 ID when no footnote ref present', () => {
      const doc = parser.parse('{++text++}');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].id).toBe('cn-1');
    });

    it('computes correct ranges with surrounding text', () => {
      // 'Hello {++world++}[^cn-1] there'
      //  0123456789012345678901234567890
      //  'Hello ' = 0..6
      //  {++ = 6..9, 'world' = 9..14, ++} = 14..17
      //  [^cn-1] = 17..24
      //  ' there' = 24..30
      const doc = parser.parse('Hello {++world++}[^cn-1] there');
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-1');
      expect(c.range).toStrictEqual({ start: 6, end: 24 });
      expect(c.contentRange).toStrictEqual({ start: 9, end: 14 });
      expect(c.modifiedText).toBe('world');
    });
  });

  // ─── 12. Footnote definitions and metadata merge ──────────────────

  describe('footnote definitions', () => {
    it('merges author and date from footnote definition into metadata', () => {
      const text = [
        '{++added text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-1');
      expect(c.metadata?.author).toBe('@alice');
      expect(c.metadata?.date).toBe('2026-02-10');
    });

    it('maps reason: to discussion comment (backward compat)', () => {
      const text = [
        '{--removed paragraph--}[^cn-2]',
        '',
        '[^cn-2]: @bob | 2026-02-09 | del | proposed',
        '    reason: Redundant paragraph',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.discussion?.[0].text).toBe('Redundant paragraph');
      expect(c.metadata?.discussion?.[0].author).toBe('@bob');
      expect(c.metadata?.author).toBe('@bob');
    });

    it('maps status from footnote definition', () => {
      const text = [
        '{++accepted text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | accepted',
      ].join('\n');
      const doc = parser.parse(text);
      expect(doc.getChanges()[0].status).toBe(ChangeStatus.Accepted);
    });

    it('maps rejected status from footnote definition', () => {
      const text = [
        '{--rejected text--}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | del | rejected',
      ].join('\n');
      const doc = parser.parse(text);
      expect(doc.getChanges()[0].status).toBe(ChangeStatus.Rejected);
    });

    it('parses multiple footnote definitions', () => {
      const text = [
        '{++first++}[^cn-1] and {--second--}[^cn-2]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | pending',
        '[^cn-2]: @bob | 2026-02-09 | del | accepted',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);
      expect(changes[0].metadata?.author).toBe('@alice');
      expect(changes[1].metadata?.author).toBe('@bob');
      expect(changes[1].status).toBe(ChangeStatus.Accepted);
    });

    it('handles dotted IDs in footnote definitions', () => {
      const text = [
        '{++first++}[^cn-17.1] and {++second++}[^cn-17.2]',
        '',
        '[^cn-17.1]: @alice | 2026-02-10 | ins | pending',
        '[^cn-17.2]: @alice | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);
      expect(changes[0].id).toBe('cn-17.1');
      expect(changes[1].id).toBe('cn-17.2');
      expect(changes[0].metadata?.author).toBe('@alice');
      expect(changes[1].metadata?.author).toBe('@alice');
    });

    it('works when inline markup has no matching footnote definition', () => {
      const text = '{++orphan++}[^cn-99]';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].id).toBe('cn-99');
      expect(changes[0].status).toBe(ChangeStatus.Proposed);
      // No metadata merged — should be undefined or only have pre-existing metadata
    });

    it('ignores orphan footnote definitions with no matching inline markup', () => {
      const text = [
        '{++text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | pending',
        '[^cn-999]: @ghost | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].id).toBe('cn-1');
      expect(changes[0].metadata?.author).toBe('@alice');
    });

    it('synthesizes ChangeNodes from settled footnote refs (post-Layer-1 settlement)', () => {
      // After Layer 1 settlement: inline CriticMarkup removed, [^cn-N] refs and footnotes remain
      const text = [
        '<!-- changedown.com/v1: tracked -->',
        'The API uses GraphQL[^cn-1] for the public interface.',
        'We added rate limiting[^cn-2] to all endpoints.',
        '',
        '[^cn-1]: @ai:claude | 2026-02-25 | sub | accepted',
        '    @ai:claude 2026-02-25: Changed from REST to GraphQL',
        '[^cn-2]: @ai:claude | 2026-02-25 | ins | accepted',
        '    @ai:claude 2026-02-25: Added rate limiting',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);

      // cn-1: settled substitution
      expect(changes[0].id).toBe('cn-1');
      expect(changes[0].type).toBe(ChangeType.Substitution);
      expect(changes[0].status).toBe(ChangeStatus.Accepted);
      expect(changes[0].settled).toBe(true);
      expect(changes[0].level).toBe(2);
      expect(changes[0].metadata?.author).toBe('@ai:claude');

      // cn-2: settled insertion
      expect(changes[1].id).toBe('cn-2');
      expect(changes[1].type).toBe(ChangeType.Insertion);
      expect(changes[1].status).toBe(ChangeStatus.Accepted);
      expect(changes[1].settled).toBe(true);
    });

    it('does not double-count changes that have both inline markup and footnote refs', () => {
      // Normal case: inline CriticMarkup with footnote ref — should NOT create settled node
      const text = [
        '{++added text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].settled).toBeUndefined(); // NOT settled — has inline markup
    });

    it('handles mixed settled and active changes in the same file', () => {
      const text = [
        'Settled change here[^cn-1] and {++active insertion++}[^cn-2].',
        '',
        '[^cn-1]: @ai:claude | 2026-02-25 | del | accepted',
        '[^cn-2]: @ai:claude | 2026-02-25 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);

      // cn-1 is settled (no inline markup)
      const settled = changes.find(c => c.id === 'cn-1');
      expect(settled).toBeTruthy();
      expect(settled!.settled).toBe(true);
      expect(settled!.type).toBe(ChangeType.Deletion);

      // cn-2 is active (has inline markup)
      const active = changes.find(c => c.id === 'cn-2');
      expect(active).toBeTruthy();
      expect(active!.settled).toBeUndefined();
      expect(active!.type).toBe(ChangeType.Insertion);
    });

    it('does not treat footnote definition lines as CriticMarkup', () => {
      // The [^cn-N]: line should not be parsed as inline markup
      const text = [
        '{++text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(1);
    });

    it('accepts 2-space indented field lines', () => {
      const text = [
        '{++text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | proposed',
        '  reason: Two-space indent',
      ].join('\n');
      const doc = parser.parse(text);
      expect(doc.getChanges()[0].metadata?.discussion?.[0].text).toBe('Two-space indent');
    });

    it('accepts tab-indented field lines', () => {
      const text = [
        '{++text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | proposed',
        '\treason: Tab indent',
      ].join('\n');
      const doc = parser.parse(text);
      expect(doc.getChanges()[0].metadata?.discussion?.[0].text).toBe('Tab indent');
    });

    it('accepts 8-space indented field lines', () => {
      const text = [
        '{++text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | proposed',
        '        reason: Deep indent',
      ].join('\n');
      const doc = parser.parse(text);
      expect(doc.getChanges()[0].metadata?.discussion?.[0].text).toBe('Deep indent');
    });

    it('parses footnote definition without author', () => {
      const text = [
        '{++added text++}[^cn-1]',
        '',
        '[^cn-1]: 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.id).toBe('cn-1');
      expect(c.metadata?.author).toBeUndefined();
      expect(c.metadata?.date).toBe('2026-02-10');
    });

    it('preserves inline comment and maps reason to discussion', () => {
      const text = [
        '{==highlighted==}{>>inline note<<}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | hig | proposed',
        '    reason: Important section',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.author).toBe('@alice');
      expect(c.metadata?.comment).toBe('inline note');
      expect(c.metadata?.discussion?.[0].text).toBe('Important section');
    });
  });

  // ─── 12b. Level 2 footnote parsing ────────────────────────────────────

  describe('Level 2 footnote parsing', () => {

    // --- Approvals / Rejections / Request-Changes ---

    it('parses approved: lines into metadata.approvals', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    approved: @eve 2024-01-20',
        '    approved: @carol 2024-01-19 "Benchmarks look good"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.approvals).toHaveLength(2);
      expect(c.metadata?.approvals?.[0]).toStrictEqual({ author: '@eve', date: '2024-01-20', timestamp: parseTimestamp('2024-01-20') });
      expect(c.metadata?.approvals?.[1]).toStrictEqual({ author: '@carol', date: '2024-01-19', timestamp: parseTimestamp('2024-01-19'), reason: 'Benchmarks look good' });
    });

    it('parses rejected: lines into metadata.rejections', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    rejected: @carol 2024-01-19 "Needs more benchmarking"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.rejections).toHaveLength(1);
      expect(c.metadata?.rejections?.[0]).toStrictEqual({ author: '@carol', date: '2024-01-19', timestamp: parseTimestamp('2024-01-19'), reason: 'Needs more benchmarking' });
    });

    it('parses request-changes: lines into metadata.requestChanges', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    request-changes: @eve 2024-01-18 "Pick one protocol"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.requestChanges).toHaveLength(1);
      expect(c.metadata?.requestChanges?.[0]).toStrictEqual({ author: '@eve', date: '2024-01-18', timestamp: parseTimestamp('2024-01-18'), reason: 'Pick one protocol' });
    });

    // --- Context ---

    it('parses context: into metadata.context', () => {
      const text = [
        '{~~REST~>GraphQL~~}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | sub | proposed',
        '    context: "The API should use {REST} for the public interface"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.context).toBe('The API should use {REST} for the public interface');
    });

    // --- Revisions ---

    it('parses revisions: block into metadata.revisions', () => {
      const text = [
        '{~~REST~>GraphQL~~}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | sub | proposed',
        '    revisions:',
        '      r1 @bob 2024-01-16: "OAuth 2.0"',
        '      r2 @bob 2024-01-18: "OAuth 2.0 with JWT tokens"',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.revisions).toHaveLength(2);
      expect(c.metadata?.revisions?.[0]).toStrictEqual({
        label: 'r1', author: '@bob', date: '2024-01-16', timestamp: parseTimestamp('2024-01-16'), text: 'OAuth 2.0',
      });
      expect(c.metadata?.revisions?.[1]).toStrictEqual({
        label: 'r2', author: '@bob', date: '2024-01-18', timestamp: parseTimestamp('2024-01-18'), text: 'OAuth 2.0 with JWT tokens',
      });
    });

    // --- Discussion comments ---

    it('parses discussion comments with threading depth', () => {
      const text = [
        '{~~REST~>GraphQL~~}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | sub | proposed',
        '    @carol 2024-01-17: Why robust? Simple was intentional.',
        '      @alice 2024-01-17: Simple undersells our capabilities.',
        '        @dave 2024-01-18: Agreed with Alice on this.',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.discussion).toHaveLength(3);
      expect(c.metadata?.discussion?.[0].author).toBe('@carol');
      expect(c.metadata?.discussion?.[0].date).toBe('2024-01-17');
      expect(c.metadata?.discussion?.[0].text).toBe('Why robust? Simple was intentional.');
      expect(c.metadata?.discussion?.[0].depth).toBe(0);
      expect(c.metadata?.discussion?.[1].author).toBe('@alice');
      expect(c.metadata?.discussion?.[1].depth).toBe(1);
      expect(c.metadata?.discussion?.[2].author).toBe('@dave');
      expect(c.metadata?.discussion?.[2].depth).toBe(2);
    });

    // --- Comment labels ---

    it('parses comment labels like [question] and [issue/blocking]', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    @bob 2024-01-16 [question]: What about latency requirements for gRPC?',
        '    @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.discussion).toHaveLength(2);
      expect(c.metadata?.discussion?.[0].label).toBe('question');
      expect(c.metadata?.discussion?.[0].text).toBe('What about latency requirements for gRPC?');
      expect(c.metadata?.discussion?.[1].label).toBe('issue/blocking');
      expect(c.metadata?.discussion?.[1].text).toBe('100/min feels low for production.');
    });

    // --- Multi-line discussion comments ---

    it('parses multi-line discussion comments (continuation lines)', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    @carol 2024-01-17: This needs more thought. The current rate limit',
        '    is based on our staging environment, not production. We need to',
        '    model this against actual traffic patterns before committing.',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.discussion).toHaveLength(1);
      expect(c.metadata?.discussion?.[0].author).toBe('@carol');
      expect(c.metadata?.discussion?.[0].text).toBe('This needs more thought. The current rate limit\nis based on our staging environment, not production. We need to\nmodel this against actual traffic patterns before committing.');
    });

    // --- Resolution: resolved ---

    it('parses resolved @author date', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    resolved @dave 2024-01-17',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.resolution).toStrictEqual({
        type: 'resolved', author: '@dave', date: '2024-01-17', timestamp: parseTimestamp('2024-01-17'), reason: undefined,
      });
    });

    it('parses resolved @author date: reason', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    resolved @carol 2024-01-18: Addressed by r2',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.resolution).toStrictEqual({
        type: 'resolved', author: '@carol', date: '2024-01-18', timestamp: parseTimestamp('2024-01-18'), reason: 'Addressed by r2',
      });
    });

    // --- Resolution: open ---

    it('parses open -- reason', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    open -- awaiting load test results from @dave',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.resolution).toStrictEqual({
        type: 'open', reason: 'awaiting load test results from @dave',
      });
    });

    it('parses bare open', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    open',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.resolution).toStrictEqual({
        type: 'open', reason: undefined,
      });
    });

    // --- reason: backward compat ---

    it('maps reason: to discussion comment by footnote author', () => {
      const text = [
        '{--removed--}[^cn-1]',
        '',
        '[^cn-1]: @bob | 2024-01-15 | del | proposed',
        '    reason: This paragraph was redundant',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.discussion).toHaveLength(1);
      expect(c.metadata?.discussion?.[0].author).toBe('@bob');
      expect(c.metadata?.discussion?.[0].date).toBe('2024-01-15');
      expect(c.metadata?.discussion?.[0].text).toBe('This paragraph was redundant');
      expect(c.metadata?.discussion?.[0].depth).toBe(0);
      // Should NOT be in metadata.comment
      expect(c.metadata?.comment).toBeUndefined();
    });

    // --- Complete spec example ---

    it('parses the complete Level 2 spec example', () => {
      const text = [
        'The API should use {~~REST~>GraphQL~~}[^cn-1] for the public interface.',
        '',
        '[^cn-1]: @alice | 2024-01-15 | sub | accepted',
        '    approved: @eve 2024-01-20',
        '    context: "The API should use {REST} for the public interface"',
        '    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.',
        '    @dave 2024-01-16: GraphQL increases client complexity.',
        '      @alice 2024-01-16: But reduces over-fetching. See PR #42.',
        '    resolved @dave 2024-01-17',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];

      expect(c.id).toBe('cn-1');
      expect(c.status).toBe(ChangeStatus.Accepted);
      expect(c.metadata?.author).toBe('@alice');
      expect(c.metadata?.date).toBe('2024-01-15');

      // Approvals
      expect(c.metadata?.approvals).toHaveLength(1);
      expect(c.metadata?.approvals?.[0]).toStrictEqual({ author: '@eve', date: '2024-01-20', timestamp: parseTimestamp('2024-01-20') });

      // Context
      expect(c.metadata?.context).toBe('The API should use {REST} for the public interface');

      // Discussion
      expect(c.metadata?.discussion).toHaveLength(3);
      expect(c.metadata?.discussion?.[0].author).toBe('@alice');
      expect(c.metadata?.discussion?.[0].text).toBe('GraphQL reduces over-fetching for dashboard clients.');
      expect(c.metadata?.discussion?.[0].depth).toBe(0);
      expect(c.metadata?.discussion?.[1].author).toBe('@dave');
      expect(c.metadata?.discussion?.[1].text).toBe('GraphQL increases client complexity.');
      expect(c.metadata?.discussion?.[1].depth).toBe(0);
      expect(c.metadata?.discussion?.[2].author).toBe('@alice');
      expect(c.metadata?.discussion?.[2].text).toBe('But reduces over-fetching. See PR #42.');
      expect(c.metadata?.discussion?.[2].depth).toBe(1);

      // Resolution
      expect(c.metadata?.resolution).toStrictEqual({
        type: 'resolved', author: '@dave', date: '2024-01-17', timestamp: parseTimestamp('2024-01-17'), reason: undefined,
      });
    });

    // --- AI authors ---

    it('parses AI authors in discussion (e.g., @ai:claude-opus-4.6)', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @ai:claude-opus-4.6 | 2024-01-15 | ins | proposed',
        '    @ai:claude-opus-4.6 2024-01-15: I suggest this change for clarity.',
        '      @alice 2024-01-16: Agreed, good suggestion.',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.author).toBe('@ai:claude-opus-4.6');
      expect(c.metadata?.discussion).toHaveLength(2);
      expect(c.metadata?.discussion?.[0].author).toBe('@ai:claude-opus-4.6');
      expect(c.metadata?.discussion?.[0].depth).toBe(0);
      expect(c.metadata?.discussion?.[1].author).toBe('@alice');
      expect(c.metadata?.discussion?.[1].depth).toBe(1);
    });

    // --- Empty footnote body (Level 1 only) ---

    it('leaves discussion/approvals/resolution undefined for header-only footnote', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.author).toBe('@alice');
      expect(c.metadata?.discussion).toBeUndefined();
      expect(c.metadata?.approvals).toBeUndefined();
      expect(c.metadata?.resolution).toBeUndefined();
      expect(c.metadata?.context).toBeUndefined();
      expect(c.metadata?.revisions).toBeUndefined();
    });

    // --- Blank lines within footnote body ---

    it('tolerates blank lines within footnote body', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    approved: @eve 2024-01-20',
        '',
        '    @carol 2024-01-17: First comment.',
        '',
        '    @dave 2024-01-18: Second comment.',
        '    resolved @dave 2024-01-18',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.approvals).toHaveLength(1);
      expect(c.metadata?.discussion).toHaveLength(2);
      expect(c.metadata?.discussion?.[0].author).toBe('@carol');
      expect(c.metadata?.discussion?.[1].author).toBe('@dave');
      expect(c.metadata?.resolution).toStrictEqual({
        type: 'resolved', author: '@dave', date: '2024-01-18', timestamp: parseTimestamp('2024-01-18'), reason: undefined,
      });
    });

    // --- Approval without reason ---

    it('parses approval without quoted reason', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    approved: @eve 2024-01-20',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.approvals?.[0].reason).toBeUndefined();
    });

    // --- Discussion with no text after colon ---

    it('handles discussion comment with empty text after colon', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
        '    @bob 2024-01-16:',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.metadata?.discussion).toHaveLength(1);
      expect(c.metadata?.discussion?.[0].text).toBe('');
    });

    // --- Mixed metadata and discussion ---

    it('parses metadata and discussion interleaved correctly', () => {
      const text = [
        '{++added++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2024-01-15 | ins | proposed',
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

      expect(c.metadata?.context).toBe('Some {context} here');
      expect(c.metadata?.approvals).toHaveLength(1);
      expect(c.metadata?.rejections).toHaveLength(1);
      expect(c.metadata?.rejections?.[0].reason).toBe('Not convinced');
      expect(c.metadata?.requestChanges).toHaveLength(1);
      expect(c.metadata?.requestChanges?.[0].reason).toBe('Needs tests');
      expect(c.metadata?.revisions).toHaveLength(1);
      expect(c.metadata?.revisions?.[0].label).toBe('r1');
      expect(c.metadata?.discussion).toHaveLength(2);
      expect(c.metadata?.discussion?.[0].depth).toBe(0);
      expect(c.metadata?.discussion?.[1].depth).toBe(1);
      expect(c.metadata?.discussion?.[1].label).toBe('suggestion');
      expect(c.metadata?.resolution).toStrictEqual({
        type: 'resolved', author: '@alice', date: '2024-01-20', timestamp: parseTimestamp('2024-01-20'), reason: 'All feedback addressed',
      });
    });
  });

  // ─── 13. Move fields on ChangeNode ──────────────────────────────────

  describe('move fields on ChangeNode', () => {
    it('ChangeNode supports moveRole and groupId fields', () => {
      const node: ChangeNode = {
        id: 'cn-1.1',
        type: ChangeType.Deletion,
        status: ChangeStatus.Proposed,
        range: { start: 0, end: 10 },
        contentRange: { start: 3, end: 7 },
        originalText: 'moved',
        moveRole: 'from',
        groupId: 'cn-1',
        level: 0,
        anchored: false,
      };
      expect(node.moveRole).toBe('from');
      expect(node.groupId).toBe('cn-1');
    });

    it('ChangeNode moveRole and groupId are optional (backward compat)', () => {
      const node: ChangeNode = {
        id: 'cn-1',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        range: { start: 0, end: 10 },
        contentRange: { start: 3, end: 7 },
        level: 0,
        anchored: false,
      };
      expect(node.moveRole).toBeUndefined();
      expect(node.groupId).toBeUndefined();
    });
  });

  // ─── 14. Move resolution ──────────────────────────────────────────

  describe('move resolution', () => {
    it('sets moveRole and groupId on move group members', () => {
      const text = [
        '{--moved text--}[^cn-5.1] and {++moved text++}[^cn-5.2]',
        '',
        '[^cn-5]: @alice | 2026-02-10 | move | proposed',
        '[^cn-5.1]: @alice | 2026-02-10 | del | proposed',
        '[^cn-5.2]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);

      const del = changes.find(c => c.id === 'cn-5.1')!;
      expect(del.groupId).toBe('cn-5');
      expect(del.moveRole).toBe('from');

      const ins = changes.find(c => c.id === 'cn-5.2')!;
      expect(ins.groupId).toBe('cn-5');
      expect(ins.moveRole).toBe('to');
    });

    it('does not set moveRole/groupId on non-move changes', () => {
      const text = [
        '{++added text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.groupId).toBeUndefined();
      expect(c.moveRole).toBeUndefined();
    });

    it('handles multiple move groups independently', () => {
      const text = [
        '{--first--}[^cn-3.1] {++first++}[^cn-3.2] {--second--}[^cn-4.1] {++second++}[^cn-4.2]',
        '',
        '[^cn-3]: @alice | 2026-02-10 | move | proposed',
        '[^cn-3.1]: @alice | 2026-02-10 | del | proposed',
        '[^cn-3.2]: @alice | 2026-02-10 | ins | proposed',
        '[^cn-4]: @bob | 2026-02-10 | move | proposed',
        '[^cn-4.1]: @bob | 2026-02-10 | del | proposed',
        '[^cn-4.2]: @bob | 2026-02-10 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();

      const g3del = changes.find(c => c.id === 'cn-3.1')!;
      expect(g3del.groupId).toBe('cn-3');
      expect(g3del.moveRole).toBe('from');

      const g4ins = changes.find(c => c.id === 'cn-4.2')!;
      expect(g4ins.groupId).toBe('cn-4');
      expect(g4ins.moveRole).toBe('to');
    });

    it('handles orphan move parent (no matching children)', () => {
      const text = [
        '{++normal text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | proposed',
        '[^cn-99]: @alice | 2026-02-10 | move | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const c = doc.getChanges()[0];
      expect(c.groupId).toBeUndefined();
      expect(c.moveRole).toBeUndefined();
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
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[0].status).toBe(ChangeStatus.Proposed);
      expect(changes[0].range.start).toBe(0);
      expect(changes[0].range.end).toBe(5);
      expect(changes[0].contentRange.start).toBe(0);
      expect(changes[0].contentRange.end).toBe(5);
      expect(changes[0].level).toBe(1);
      expect(changes[0].id).toBe('cn-pending-0');
    });

    it('uses scId when provided', () => {
      const doc = VirtualDocument.fromOverlayOnly({
        range: { start: 10, end: 20 },
        text: 'inserted',
        type: 'insertion',
        scId: 'cn-17',
      });
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].id).toBe('cn-17');
    });

    it('changeAtOffset finds overlay change', () => {
      const doc = VirtualDocument.fromOverlayOnly({
        range: { start: 5, end: 12 },
        text: 'world',
        type: 'insertion',
      });
      expect(doc.changeAtOffset(7) !== null).toBeTruthy();
      expect(doc.changeAtOffset(7)!.type).toBe(ChangeType.Insertion);
      expect(doc.changeAtOffset(0)).toBeNull();
    });
  });

  describe('VirtualDocument integration', () => {
    it('returns a VirtualDocument with getChanges() method', () => {
      const doc = parser.parse('{++test++}');
      expect(typeof doc.getChanges === 'function').toBeTruthy();
      expect(Array.isArray(doc.getChanges())).toBeTruthy();
    });

    it('changeAtOffset finds the correct node', () => {
      const doc = parser.parse('abc{++def++}ghi');
      // {++ at 3..6, content 'def' at 6..9, ++} at 9..12
      // changeAtOffset should find nodes where offset is within range [start, end]
      const node = doc.changeAtOffset(5);
      expect(node !== null).toBeTruthy();
      expect(node!.type).toBe(ChangeType.Insertion);

      const noNode = doc.changeAtOffset(0);
      expect(noNode).toBeNull();
    });
  });

  // ─── Level 1 adjacent comment parsing ─────────────────────────────

  describe('Level 1 adjacent comment parsing', () => {
    it('parses adjacent comment as Level 1 metadata (author only)', () => {
      const text = '{~~REST~>GraphQL~~}{>>@alice<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(change.level).toBe(1);
      expect(change.inlineMetadata?.author).toBe('@alice');
    });

    it('parses adjacent comment with pipe-separated fields', () => {
      const text = '{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|proposed<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(change.level).toBe(1);
      expect(change.inlineMetadata?.author).toBe('@alice');
      expect(change.inlineMetadata?.date).toBe('2026-02-13');
      expect(change.inlineMetadata?.type).toBe('sub');
      expect(change.inlineMetadata?.status).toBe('proposed');
    });

    it('parses Level 1 with author and status only', () => {
      const text = '{++new text++}{>>@bob|approved<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(change.level).toBe(1);
      expect(change.inlineMetadata?.author).toBe('@bob');
      expect(change.inlineMetadata?.status).toBe('approved');
    });

    it('parses free-text reason in Level 1 comment', () => {
      const text = '{++rate limiting++}{>>performance concern<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(change.level).toBe(1);
      expect(change.inlineMetadata?.freeText).toBe('performance concern');
    });

    it('distinguishes Level 0 (no adjacent comment)', () => {
      const text = '{~~REST~>GraphQL~~}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(change.level).toBe(0);
      expect(change.inlineMetadata).toBeUndefined();
    });

    it('distinguishes Level 2 (footnote ref)', () => {
      const text = '{~~REST~>GraphQL~~}[^cn-1]\n\n[^cn-1]: @alice | 2026-02-13 | sub | proposed';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(change.level).toBe(2);
    });

    it('handles whitespace around pipes in Level 1', () => {
      const text = '{~~old~>new~~}{>>@alice | approved<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(change.inlineMetadata?.author).toBe('@alice');
      expect(change.inlineMetadata?.status).toBe('approved');
    });

    it('handles empty fields between pipes', () => {
      const text = '{~~old~>new~~}{>>@alice||2026-02-13<<}';
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(change.inlineMetadata?.author).toBe('@alice');
      expect(change.inlineMetadata?.date).toBe('2026-02-13');
    });
  });

  // ─── 15. Code block awareness ──────────────────────────────────────

  describe('code block awareness — fenced code blocks', () => {
    it('ignores CriticMarkup inside backtick fence', () => {
      const text = '```\n{++not a change++}\n```\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('ignores CriticMarkup inside tilde fence', () => {
      const text = '~~~\n{++not a change++}\n~~~\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('ignores CriticMarkup in fence with info string', () => {
      const text = '```javascript\n{++not a change++}\n```\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('parses real change BEFORE fence, ignores CriticMarkup inside fence', () => {
      const text = 'Real {++change++}\n```\n{++not a change++}\n```\n';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('change');
    });

    it('parses real change AFTER fence', () => {
      const text = '```\n{++not a change++}\n```\n{++real++}\n';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('real');
    });

    it('treats unclosed fence as extending to end of document', () => {
      const text = '```\n{++everything after unclosed fence is code++}\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('does not close fence when closing fence is too short', () => {
      // 4-backtick fence opened, 3-backtick close attempt
      const text = '````\n{++still in fence++}\n```\n{++still in fence too++}\n````\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('handles nested backtick inside tilde fence (inner backticks are content)', () => {
      const text = '~~~\n```\n{++inside both fences++}\n```\n~~~\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('handles real changes before, between, and after fences', () => {
      const text = '{--deleted--}\n```\n{++code example++}\n```\n{++real insertion++}\n';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(2);
      expect(changes[0].type).toBe(ChangeType.Deletion);
      expect(changes[0].originalText).toBe('deleted');
      expect(changes[1].type).toBe(ChangeType.Insertion);
      expect(changes[1].modifiedText).toBe('real insertion');
    });

    it('ignores substitution syntax in tilde fence', () => {
      const text = '~~~\n{~~old~>new~~}\n~~~\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('handles fence with up to 3 leading spaces', () => {
      const text = '   ```\n{++indented fence++}\n   ```\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('does NOT treat 4-space indented backticks as a fence', () => {
      // 4 spaces = not a fence per CommonMark. However, the triple backticks
      // still form an inline code span per CommonMark section 6.1 (inline code
      // spans can cross lines), so the CriticMarkup inside is still skipped.
      const text = '    ```\n{++not a fence with 4 spaces++}\n    ```\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('4-space indented single backticks do not suppress CriticMarkup', () => {
      // A single backtick on a line that has no matching close means no inline code span
      const text = '    `\n{++real change++}\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(1);
      expect(doc.getChanges()[0].modifiedText).toBe('real change');
    });

    it('does not close backtick fence with tildes', () => {
      const text = '```\n{++still in fence++}\n~~~\n{++still in fence too++}\n```\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('does not close tilde fence with backticks', () => {
      const text = '~~~\n{++still in fence++}\n```\n{++still in fence too++}\n~~~\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('handles fence closing with trailing whitespace', () => {
      const text = '```\n{++code++}\n```   \n{++real++}\n';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('real');
    });

    it('does not treat closing fence with trailing content as a close', () => {
      const text = '```\n{++still code++}\n``` not a close\n{++still code too++}\n```\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });
  });

  describe('code block awareness — inline code spans', () => {
    it('ignores CriticMarkup inside single-backtick inline code', () => {
      const text = 'The syntax `{++text++}` for additions.';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('ignores CriticMarkup inside double-backtick inline code', () => {
      const text = 'Use ``{++text++}`` for additions.';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('ignores CriticMarkup inside triple-backtick inline code', () => {
      const text = 'Use ```{++text++}``` for additions.';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('parses CriticMarkup after unmatched backtick (no code span)', () => {
      // A single backtick with no matching close is NOT a code span
      const text = 'Some `unmatched backtick and {++real change++}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('real change');
    });

    it('does not start inline code inside fenced block', () => {
      // Backticks inside a fence are content, not inline code delimiters
      const text = '```\n`{++inside fence++}`\n```\n';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('handles multiple inline code spans on one line', () => {
      const text = '`{++a++}` and `{--b--}` and {++real++}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('real');
    });

    it('handles deletion inside inline code', () => {
      const text = 'Use `{--deletion syntax--}` to remove text.';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('handles substitution inside inline code', () => {
      const text = 'Use `{~~old~>new~~}` for substitutions.';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('handles highlight inside inline code', () => {
      const text = 'Use `{==text==}` for highlights.';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('handles comment inside inline code', () => {
      const text = 'Use `{>>note<<}` for comments.';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
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
      expect(changes).toHaveLength(2);
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[0].modifiedText).toBe('real insertion');
      expect(changes[1].type).toBe(ChangeType.Deletion);
      expect(changes[1].originalText).toBe('real deletion');
    });

    it('footnote definitions NOT inside code blocks still parse correctly', () => {
      const text = [
        '{++added text++}[^cn-1]',
        '',
        '```',
        '{++not a change++}',
        '```',
        '',
        '[^cn-1]: @alice | 2026-02-10 | ins | pending',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].id).toBe('cn-1');
      expect(changes[0].metadata?.author).toBe('@alice');
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
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('real change');
    });

    it('existing plain text tests still work (no code constructs = no zones)', () => {
      // This verifies backward compat: no backticks/fences → parser works as before
      const text = '{++a++}{--b--}{~~c~>d~~}{==e==}{>>f<<}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      // highlight absorbs comment: 4 changes total
      expect(changes).toHaveLength(4);
      expect(changes[0].type).toBe(ChangeType.Insertion);
      expect(changes[1].type).toBe(ChangeType.Deletion);
      expect(changes[2].type).toBe(ChangeType.Substitution);
      expect(changes[3].type).toBe(ChangeType.Highlight);
    });

    it('real change adjacent to code fence', () => {
      const text = '```\ncode\n```\n{++real++}';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      expect(changes[0].modifiedText).toBe('real');
    });

    it('fence at very start of document', () => {
      const text = '```\n{++code++}\n```';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('inline code at very start of document', () => {
      const text = '`{++code++}` rest';
      const doc = parser.parse(text);
      expect(doc.getChanges()).toHaveLength(0);
    });
  });

  // ─── Settled ref detection (post-Layer-1 settlement) ────────────────

  describe('settled ref detection', () => {
    it('synthesizes a ChangeNode from a standalone [^cn-N] ref with footnote', () => {
      const text = [
        'The API uses REST[^cn-1] for all endpoints.',
        '',
        '[^cn-1]: @ai:claude-opus-4.6 | 2026-02-20 | sub | accepted',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-1');
      expect(c.type).toBe(ChangeType.Substitution);
      expect(c.status).toBe(ChangeStatus.Accepted);
      expect(c.settled).toBe(true);
      expect(c.level).toBe(2);
      expect(c.metadata?.author).toBe('@ai:claude-opus-4.6');
      expect(c.metadata?.status).toBe('accepted');
      // Range covers exactly the [^cn-1] ref
      const ref = '[^cn-1]';
      expect(c.range.end - c.range.start).toBe(ref.length);
      // contentRange covers the [^cn-N] ref (same as range for settled refs)
      expect(c.contentRange.start).toBe(c.range.start);
      expect(c.contentRange.end).toBe(c.range.end);
    });

    it('does not synthesize when [^cn-N] is attached to CriticMarkup', () => {
      const text = [
        '{++new text++}[^cn-1]',
        '',
        '[^cn-1]: @alice | 2026-02-20 | ins | proposed',
      ].join('\n');
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('cn-1');
      expect(c.type).toBe(ChangeType.Insertion);
      expect(c.settled).toBeUndefined(); // NOT a settled ref
    });

    it('ignores standalone [^cn-N] refs with no matching footnote definition', () => {
      const text = 'Some text[^cn-99] with an orphan ref.';
      const doc = parser.parse(text);
      const changes = doc.getChanges();
      expect(changes).toHaveLength(0);
    });
  });

  // ─── Unified cn-N IDs ──────────────────────────────────────────────

  describe('unified change IDs', () => {
    it('assigns cn-N IDs to Level 0 changes', () => {
      const parser2 = new CriticMarkupParser();
      const doc = parser2.parse('{++added++} and {--removed--}');
      const changes = doc.getChanges();
      expect(changes[0].id).toBe('cn-1');
      expect(changes[1].id).toBe('cn-2');
      expect(changes[0].anchored).toBe(false);
      expect(changes[1].anchored).toBe(false);
    });

    it('assigns cn-N IDs starting after max existing cn-N in file', () => {
      const parser2 = new CriticMarkupParser();
      const text = '{++first++}[^cn-5]\n\n[^cn-5]: @alice | 2026-03-04 | ins | proposed\n\n{++second++}';
      const doc = parser2.parse(text);
      const changes = doc.getChanges();
      const anchored = changes.find(c => c.id === 'cn-5');
      const unanchored = changes.find(c => c.id === 'cn-6');
      expect(anchored, 'should find cn-5').toBeTruthy();
      expect(unanchored).toBeTruthy();
      expect(anchored!.anchored).toBe(true);
      expect(unanchored!.anchored).toBe(false);
    });

    it('does not produce positional IDs like ins-0 or sub-1', () => {
      const parser2 = new CriticMarkupParser();
      const doc = parser2.parse('{++a++} {--b--} {~~c~>d~~}');
      for (const c of doc.getChanges()) {
        expect(c.id.startsWith('cn-')).toBeTruthy();
      }
    });
  });
});
