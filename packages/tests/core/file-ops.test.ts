import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, splitBodyAndFootnotes } from '@changetracks/core';
import {
  findUniqueMatch,
  applyProposeChange,
  applySingleOperation,
  appendFootnote,
  extractLineRange,
  replaceUnique,
  stripCriticMarkupWithMap,
  stripCriticMarkup,
  checkCriticMarkupOverlap,
  guardOverlap,
  stripRefsFromContent,
  defaultNormalizer,
} from '@changetracks/core/internals';

const TODAY = new Date().toISOString().slice(0, 10);

// ─── findUniqueMatch ────────────────────────────────────────────────────────

describe('findUniqueMatch', () => {
  it('returns exact match with wasNormalized=false', () => {
    const result = findUniqueMatch('Hello world.', 'world');
    expect(result.index).toBe(6);
    expect(result).toHaveLength(5);
    expect(result.originalText).toBe('world');
    expect(result.wasNormalized).toBe(false);
  });

  it('throws when target not found (no normalizer)', () => {
    expect(() => findUniqueMatch('Hello world.', 'xyz')).toThrow(/not found/i);
  });

  it('throws when target is ambiguous (no normalizer)', () => {
    expect(() => findUniqueMatch('the cat and the dog', 'the')).toThrow(/multiple|ambiguous/i);
  });

  it('does not match smart quotes against ASCII (no confusables)', () => {
    const text = 'Sublime\u2019s architecture is elegant.';
    // With confusables removed, smart quote U+2019 is distinct from ASCII apostrophe
    expect(() => findUniqueMatch(text, "Sublime's", defaultNormalizer)).toThrow(/not found/i);
  });

  it('finds target with NBSP via normalization', () => {
    const text = 'hello\u00A0world';
    const result = findUniqueMatch(text, 'hello world', defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result).toHaveLength(11);
    expect(result.wasNormalized).toBe(true);
  });

  it('throws with diagnostic message when all levels fail', () => {
    expect(() => findUniqueMatch('Hello world.', 'completely missing', defaultNormalizer)).toThrow(/not found/i);
  });

  // ─── Error message improvements: haystack preview ─────────────────────────

  it('includes haystack preview in not-found error', () => {
    const haystack = 'The quick brown fox jumps over the lazy dog.';
    try {
      findUniqueMatch(haystack, 'completely missing text', defaultNormalizer);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message.includes('Searched in')).toBeTruthy();
      expect(err.message.includes('The quick brown fox')).toBeTruthy();
    }
  });

  it('truncates long haystack preview at 200 chars', () => {
    const haystack = 'A'.repeat(300) + ' end.';
    try {
      findUniqueMatch(haystack, 'not in here', defaultNormalizer);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message.includes('Searched in')).toBeTruthy();
      // The preview is 200 chars + "..."
      expect(err.message.includes('...')).toBeTruthy();
      // Should NOT include all 300 A's
      expect(err.message.includes('A'.repeat(300))).toBeFalsy();
    }
  });

  it('includes haystack line count in not-found error', () => {
    const haystack = 'line one\nline two\nline three\nline four';
    try {
      findUniqueMatch(haystack, 'not present', defaultNormalizer);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      // Should mention 4 lines
      expect(err.message.includes('4 lines')).toBeTruthy();
    }
  });

  it('uses singular "line" for single-line haystack', () => {
    const haystack = 'single line content';
    try {
      findUniqueMatch(haystack, 'not present', defaultNormalizer);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message.includes('1 line,')).toBeTruthy();
      expect(err.message.includes('1 lines')).toBeFalsy();
    }
  });

  it('includes haystack preview in confusable diagnostic error too', () => {
    // File has em dash (U+2014), agent sends hyphen -- triggers confusable diagnostic
    const haystack = 'Running \u2014 STUB=true';
    try {
      findUniqueMatch(haystack, 'Running - STUB=true', defaultNormalizer);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message.includes('Unicode mismatch')).toBeTruthy();
      expect(err.message.includes('Searched in')).toBeTruthy();
      expect(err.message.includes('Running')).toBeTruthy();
    }
  });

  it('does not match smart quotes against ASCII even when repeated (no confusables)', () => {
    const text = 'Sublime\u2019s and Sublime\u2019s';
    // With confusables removed, ASCII apostrophe does not bridge to smart quote
    expect(() => findUniqueMatch(text, "Sublime's", defaultNormalizer)).toThrow(/not found/i);
  });

  // Whitespace-collapsed matching (Level 3)
  it('matches when LLM omits space before newline', () => {
    const text = 'ground truth; \nprojections derive current state.';
    const target = 'truth;\nprojections derive current state.';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(7);
    expect(result.originalText).toBe('truth; \nprojections derive current state.');
    expect(result.wasNormalized).toBe(true);
  });

  it('matches when LLM collapses multiple spaces to one', () => {
    const text = 'hello    world  here';
    const target = 'hello world here';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result).toHaveLength(20);
    expect(result.wasNormalized).toBe(true);
  });

  it('throws when whitespace-collapsed match is ambiguous', () => {
    const text = 'hello  world and hello\nworld';
    expect(() => findUniqueMatch(text, 'hello world', defaultNormalizer)).toThrow(/ambiguous/i);
  });

  // Ref-transparent matching (Level 1.5)
  describe('ref-transparent matching', () => {
    it('finds clean prose when haystack has inline ref', () => {
      const text = 'The latency is 10-20 milliseconds[^ct-2.1] in practice.';
      const match = findUniqueMatch(text, '10-20 milliseconds in practice', defaultNormalizer);
      expect(match.index).toBe(15); // start of "10-20"
      // Length spans from "10-20" to "in practice" INCLUDING the ref
      expect(text.slice(match.index, match.index + match.length).includes('[^ct-2.1]')).toBeTruthy();
    });

    it('finds clean prose when haystack has multiple refs', () => {
      const text = 'value[^ct-4][^ct-2.1] is correct.';
      const match = findUniqueMatch(text, 'value is correct', defaultNormalizer);
      expect(match.index).toBe(0);
      expect(text.slice(match.index, match.index + match.length).includes('[^ct-4]')).toBeTruthy();
    });

    it('strips refs from needle too (agent copied from view)', () => {
      const text = 'value[^ct-1] is correct.';
      const match = findUniqueMatch(text, 'value[^ct-1] is correct', defaultNormalizer);
      expect(match.index).toBe(0);
    });

    it('rejects ambiguous match after ref stripping', () => {
      const text = 'value[^ct-1] then value again.';
      expect(() => findUniqueMatch(text, 'value', defaultNormalizer)).toThrow(/ambiguous|multiple/i);
    });
  });

  // View-surface-aware matching (also Level 1.5 now — promoted from Level 4)
  it('matches text transparently skipping footnote refs', () => {
    const text = 'The {++quick++}[^ct-1] brown fox.';
    // The text with footnote ref stripped is: "The {++quick++} brown fox."
    // Level 1.5 handles [^ct-N] only, not CriticMarkup, so target needs to include markup
    const target = 'The {++quick++} brown';
    const result = findUniqueMatch(text, target);
    expect(result.wasNormalized).toBe(true);
    // Raw text includes the footnote ref
    expect(result.originalText.includes('[^ct-1]')).toBeTruthy();
  });

  // Settled-text matching (Level 5)
  it('matches via settled text when target references inserted content', () => {
    const text = 'Hello {++beautiful ++}world.';
    const target = 'Hello beautiful world.';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.wasSettledMatch).toBe(true);
    expect(result.wasNormalized).toBe(true);
  });

  it('matches via settled text when target references substituted content', () => {
    const text = 'Hello {~~old~>new~~} world.';
    const target = 'Hello new world.';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.wasSettledMatch).toBe(true);
  });

  // Diagnostic confusable detection (ADR-061)
  describe('diagnostic confusable detection', () => {
    it('reports em dash vs hyphen mismatch with codepoints', () => {
      // File has em dash (U+2014), agent sends hyphen (U+002D)
      const text = 'Running \u2014 STUB=true';
      try {
        findUniqueMatch(text, 'Running - STUB=true', defaultNormalizer);
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message.includes('Unicode mismatch')).toBeTruthy();
        expect(err.message.includes('EM DASH')).toBeTruthy();
        expect(err.message.includes('HYPHEN-MINUS')).toBeTruthy();
        expect(err.message.includes('U+2014')).toBeTruthy();
        expect(err.message.includes('U+002D')).toBeTruthy();
        expect(err.message.includes('Running \u2014 STUB=true')).toBeTruthy();
      }
    });

    it('reports smart quote mismatch', () => {
      const text = 'She said \u201Chello\u201D today';
      try {
        findUniqueMatch(text, 'She said "hello" today', defaultNormalizer);
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message.includes('Unicode mismatch')).toBeTruthy();
        expect(err.message.includes('LEFT DOUBLE QUOTATION MARK') || err.message.includes('SMART DOUBLE QUOTE')).toBeTruthy();
      }
    });

    it('returns generic error when no confusable mismatch', () => {
      try {
        findUniqueMatch('Hello world.', 'completely missing', defaultNormalizer);
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message.includes('Unicode mismatch')).toBeFalsy();
        expect(err.message.includes('not found')).toBeTruthy();
        expect(err.message.includes('Searched in (1 line,')).toBeTruthy();
        expect(err.message.includes('Hello world.')).toBeTruthy();
      }
    });

    it('reports en dash vs hyphen mismatch', () => {
      const text = '2020\u20132025 report';
      try {
        findUniqueMatch(text, '2020-2025 report', defaultNormalizer);
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message.includes('Unicode mismatch')).toBeTruthy();
        expect(err.message.includes('EN DASH')).toBeTruthy();
      }
    });

    it('reports right single smart quote vs ASCII apostrophe', () => {
      const text = 'it\u2019s working';
      try {
        findUniqueMatch(text, "it's working", defaultNormalizer);
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message.includes('Unicode mismatch')).toBeTruthy();
        expect(err.message.includes('RIGHT SINGLE QUOTATION MARK')).toBeTruthy();
      }
    });
  });
});

// ─── applyProposeChange ─────────────────────────────────────────────────────

describe('applyProposeChange', () => {
  describe('substitution', () => {
    it('replaces oldText with substitution markup and appends footnote', async () => {
      const result = await applyProposeChange({
        text: 'The quick brown fox jumps over the lazy dog.',
        oldText: 'quick brown',
        newText: 'slow red',
        changeId: 'ct-1',
        author: 'ai:claude-opus-4.6',
      });
      expect(result.changeType).toBe('sub');
      expect(result.modifiedText.includes('{~~quick brown~>slow red~~}[^ct-1]')).toBeTruthy();
      expect(result.modifiedText.includes(
        `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`
      )).toBeTruthy();
    });
  });

  describe('deletion', () => {
    it('replaces oldText with deletion markup and appends footnote', async () => {
      const result = await applyProposeChange({
        text: 'The quick brown fox jumps over the lazy dog.',
        oldText: ' brown',
        newText: '',
        changeId: 'ct-2',
        author: 'ai:claude-opus-4.6',
      });
      expect(result.changeType).toBe('del');
      expect(result.modifiedText.includes('{-- brown--}[^ct-2]')).toBeTruthy();
      expect(result.modifiedText.includes(
        `[^ct-2]: @ai:claude-opus-4.6 | ${TODAY} | del | proposed`
      )).toBeTruthy();
    });
  });

  describe('insertion', () => {
    it('inserts text after anchor with insertion markup and appends footnote', async () => {
      const result = await applyProposeChange({
        text: 'The quick fox jumps.',
        oldText: '',
        newText: ' brown',
        changeId: 'ct-3',
        author: 'ai:claude-opus-4.6',
        insertAfter: 'quick',
      });
      expect(result.changeType).toBe('ins');
      expect(result.modifiedText.includes('quick{++ brown++}[^ct-3]')).toBeTruthy();
      expect(result.modifiedText.includes(
        `[^ct-3]: @ai:claude-opus-4.6 | ${TODAY} | ins | proposed`
      )).toBeTruthy();
    });
  });

  describe('reasoning', () => {
    it('includes reason line in footnote when reasoning is provided', async () => {
      const result = await applyProposeChange({
        text: 'Hello world.',
        oldText: 'world',
        newText: 'earth',
        changeId: 'ct-1',
        author: 'ai:claude-opus-4.6',
        reasoning: 'More specific term',
      });
      // Footnote header uses date-only, but reason line uses nowTimestamp().raw (full ISO)
      const footnote = result.modifiedText;
      expect(footnote.includes(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`)).toBeTruthy();
      expect(footnote).toMatch(new RegExp(`@ai:claude-opus-4\\.6 ${TODAY}T\\d{2}:\\d{2}:\\d{2}Z: More specific term`));
    });
  });

  describe('overlap guard', () => {
    it('throws when oldText targets inside existing CriticMarkup', async () => {
      const text = 'Before {++inserted text++} after.';
      await expect(applyProposeChange({
          text,
          oldText: 'inserted text',
          newText: 'replacement',
          changeId: 'ct-2',
          author: 'ai:test',
        })).rejects.toThrow(/overlaps with proposed change/);
    });
  });

  describe('error cases', () => {
    it('throws when oldText is not found in text', async () => {
      await expect(applyProposeChange({
          text: 'Hello world.',
          oldText: 'xyz not here',
          newText: 'replacement',
          changeId: 'ct-1',
          author: 'ai:claude-opus-4.6',
        })).rejects.toThrow(/xyz not here/);
    });

    it('throws when oldText is found multiple times', async () => {
      await expect(applyProposeChange({
          text: 'the cat and the dog',
          oldText: 'the',
          newText: 'a',
          changeId: 'ct-1',
          author: 'ai:claude-opus-4.6',
        })).rejects.toThrow(/ambiguous|multiple|context/i);
    });

    it('throws when both oldText and newText are empty', async () => {
      await expect(applyProposeChange({
          text: 'Hello world.',
          oldText: '',
          newText: '',
          changeId: 'ct-1',
          author: 'ai:claude-opus-4.6',
        })).rejects.toThrow();
    });

    it('throws when insertion has no insertAfter anchor', async () => {
      await expect(applyProposeChange({
          text: 'Hello world.',
          oldText: '',
          newText: 'inserted text',
          changeId: 'ct-1',
          author: 'ai:claude-opus-4.6',
        })).rejects.toThrow(/insertAfter/i);
    });
  });
});

// ─── appendFootnote ─────────────────────────────────────────────────────────

describe('appendFootnote', () => {
  it('appends to text without existing footnotes', () => {
    const result = appendFootnote('Some text.', '\n\n[^ct-1]: @alice | 2026-02-10 | sub | proposed');
    expect(result).toBe('Some text.\n\n[^ct-1]: @alice | 2026-02-10 | sub | proposed');
  });

  it('appends after existing footnotes', () => {
    const text = `Some text.

[^ct-1]: @alice | 2026-02-10 | sub | proposed
    @alice 2026-02-10: reason`;

    const result = appendFootnote(text, '\n\n[^ct-2]: @bob | 2026-02-10 | ins | proposed');
    expect(result.includes('reason\n\n[^ct-2]:')).toBeTruthy();
    expect(result.includes('[^ct-1]:')).toBeTruthy();
  });

  it('ignores footnote definitions inside fenced code blocks', () => {
    const text = `## Example

\`\`\`markdown
[^ct-42]: @alice | 2026-02-10 | sub | proposed
\`\`\`

## More content`;

    const result = appendFootnote(text, '\n\n[^ct-1]: @bob | 2026-02-10 | ins | proposed');
    // The new footnote should appear at the end, not after the fenced code block footnote
    expect(result.endsWith('[^ct-1]: @bob | 2026-02-10 | ins | proposed')).toBeTruthy();
  });

  it('places footnote after last footnote block when document contains tables', () => {
    const text = [
      '# Doc',
      '',
      '| Col A | Col B |',
      '|-------|-------|',
      '| cell  | data{==highlighted==}[^ct-1] |',
      '',
      'More content here.',
      '',
      '[^ct-1]: @ai:test | 2026-03-06 | comment | proposed',
      '    @ai:test 2026-03-06T00:00:00Z: Original comment',
    ].join('\n');

    const newFootnote = '\n\n[^ct-2]: @ai:test | 2026-03-06 | comment | proposed\n    @ai:test 2026-03-06T00:00:00Z: New comment';

    const result = appendFootnote(text, newFootnote);

    // New footnote should appear after ct-1 block
    const lines = result.split('\n');
    const ct1Line = lines.findIndex(l => l.startsWith('[^ct-1]:'));
    const ct2Line = lines.findIndex(l => l.startsWith('[^ct-2]:'));
    expect(ct2Line > ct1Line).toBeTruthy();

    // Table should be intact
    expect(result.includes('| Col A | Col B |')).toBeTruthy();
  });
});

// ─── stripCriticMarkupWithMap ───────────────────────────────────────────────

describe('stripCriticMarkupWithMap', () => {
  it('keeps insertion content', () => {
    const result = stripCriticMarkupWithMap('Hello {++beautiful ++}world.');
    expect(result.settled).toBe('Hello beautiful world.');
  });

  it('removes deletion content', () => {
    const result = stripCriticMarkupWithMap('Hello {--ugly --}world.');
    expect(result.settled).toBe('Hello world.');
  });

  it('keeps substitution new text', () => {
    const result = stripCriticMarkupWithMap('Hello {~~old~>new~~} world.');
    expect(result.settled).toBe('Hello new world.');
  });

  it('keeps highlight content', () => {
    const result = stripCriticMarkupWithMap('Hello {==important==} world.');
    expect(result.settled).toBe('Hello important world.');
  });

  it('removes comment content', () => {
    const result = stripCriticMarkupWithMap('Hello{>>a note<<} world.');
    expect(result.settled).toBe('Hello world.');
  });

  it('removes footnote references', () => {
    const result = stripCriticMarkupWithMap('Hello[^ct-1] world[^ct-2.3].');
    expect(result.settled).toBe('Hello world.');
  });

  it('provides correct position mapping for insertion', () => {
    // "Hello {++beautiful ++}world."
    //  01234567890...
    const result = stripCriticMarkupWithMap('Hello {++beautiful ++}world.');
    // settled: "Hello beautiful world."
    // The 'b' of 'beautiful' is at settled index 6, raw index 9 (after '{++')
    expect(result.toRaw[6]).toBe(9);
  });

  it('returns plain text unchanged', () => {
    const result = stripCriticMarkupWithMap('No markup here.');
    expect(result.settled).toBe('No markup here.');
    expect(result.markupRanges).toHaveLength(0);
  });
});

describe('stripCriticMarkup', () => {
  it('returns settled text as a string', () => {
    expect(stripCriticMarkup('Hello {++beautiful ++}world.')).toBe('Hello beautiful world.');
  });
});

// ─── checkCriticMarkupOverlap ───────────────────────────────────────────────

describe('checkCriticMarkupOverlap', () => {
  it('returns null for non-overlapping range', () => {
    const text = 'Before {++inserted++} after.';
    // "Before " is at index 0-6, overlapping with nothing
    const result = checkCriticMarkupOverlap(text, 0, 6);
    expect(result).toBeNull();
  });

  it('detects overlap with insertion', () => {
    const text = 'Before {++inserted++} after.';
    // The insertion spans index 7-21. Target index 10 is inside it.
    const result = checkCriticMarkupOverlap(text, 10, 4);
    expect(result).not.toBe(null);
    expect(result!.changeType).toBe('ins');
  });

  it('detects overlap with substitution', () => {
    const text = 'Before {~~old~>new~~} after.';
    const result = checkCriticMarkupOverlap(text, 10, 3);
    expect(result).not.toBe(null);
    expect(result!.changeType).toBe('sub');
  });

  it('detects overlap with deletion', () => {
    const text = 'Before {--deleted--} after.';
    const result = checkCriticMarkupOverlap(text, 10, 3);
    expect(result).not.toBe(null);
    expect(result!.changeType).toBe('del');
  });
});

describe('checkCriticMarkupOverlap — semantic filtering', () => {
  it('skips settled footnote refs (accepted status)', () => {
    // Settled ref: inline markup removed, only [^ct-1] remains with accepted footnote
    const text = 'The quick brown fox[^ct-1] jumps over.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | accepted';
    const idx = text.indexOf('quick brown fox');
    const result = checkCriticMarkupOverlap(text, idx, 'quick brown fox'.length);
    expect(result).toBeNull();
  });

  it('skips settled footnote refs (rejected status)', () => {
    const text = 'The quick brown fox[^ct-1] jumps over.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | rejected';
    const idx = text.indexOf('quick brown fox');
    const result = checkCriticMarkupOverlap(text, idx, 'quick brown fox'.length);
    expect(result).toBeNull();
  });

  it('skips standalone settled refs even with proposed status in footnote', () => {
    // A standalone [^ct-1] ref (no surrounding CriticMarkup) is a metadata anchor
    // The parser sets settled=true for orphaned refs regardless of footnote status
    const text = 'Result: done[^ct-1] next step.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | proposed';
    const idx = text.indexOf('Result: done');
    const result = checkCriticMarkupOverlap(text, idx, 'Result: done'.length);
    expect(result).toBeNull();
  });

  it('still blocks overlap with proposed inline CriticMarkup', () => {
    const text = 'Before {++inserted text++}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | ins | proposed';
    const idx = text.indexOf('inserted text');
    const result = checkCriticMarkupOverlap(text, idx, 'inserted text'.length);
    expect(result).not.toBeNull();
    expect(result!.changeType).toBe('ins');
  });

  it('still blocks overlap with proposed substitution', () => {
    const text = 'Before {~~old~>new~~}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | proposed';
    const idx = text.indexOf('old');
    const result = checkCriticMarkupOverlap(text, idx, 'old'.length);
    expect(result).not.toBeNull();
  });

  it('allows overlap with accepted inline CriticMarkup (pre-compaction)', () => {
    const text = 'Before {++added++}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | ins | accepted';
    const idx = text.indexOf('added');
    const result = checkCriticMarkupOverlap(text, idx, 'added'.length);
    expect(result).toBeNull();
  });

  it('allows overlap with rejected inline CriticMarkup (pre-compaction)', () => {
    const text = 'Before {--removed--}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | del | rejected';
    const idx = text.indexOf('removed');
    const result = checkCriticMarkupOverlap(text, idx, 'removed'.length);
    expect(result).toBeNull();
  });

  it('blocks Level 0 markup (no footnote, status defaults to Proposed)', () => {
    const text = 'Before {++inserted text++} after.';
    const idx = text.indexOf('inserted text');
    const result = checkCriticMarkupOverlap(text, idx, 'inserted text'.length);
    expect(result).not.toBeNull();
  });
});

describe('guardOverlap', () => {
  it('does not throw for safe range', () => {
    const text = 'Before {++inserted++} after.';
    expect(() => guardOverlap(text, 0, 6)).not.toThrow();
  });

  it('throws for overlapping range', () => {
    const text = 'Before {++inserted++} after.';
    expect(() => guardOverlap(text, 10, 4)).toThrow(/overlaps with proposed change/);
  });
});

// ─── extractLineRange ───────────────────────────────────────────────────────

describe('extractLineRange', () => {
  const lines = ['line one', 'line two', 'line three'];

  it('extracts a single line', () => {
    const result = extractLineRange(lines, 1, 1);
    expect(result.content).toBe('line one');
    expect(result.startOffset).toBe(0);
    expect(result.endOffset).toBe(8);
  });

  it('extracts a multi-line range', () => {
    const result = extractLineRange(lines, 1, 2);
    expect(result.content).toBe('line one\nline two');
    expect(result.startOffset).toBe(0);
    expect(result.endOffset).toBe(17);
  });

  it('extracts the last line', () => {
    const result = extractLineRange(lines, 3, 3);
    expect(result.content).toBe('line three');
    // 'line one\n' = 9, 'line two\n' = 9 => start at 18
    expect(result.startOffset).toBe(18);
    expect(result.endOffset).toBe(28);
  });

  it('throws for out-of-range start line', () => {
    expect(() => extractLineRange(lines, 0, 1)).toThrow(/out of range/);
  });

  it('throws for out-of-range end line', () => {
    expect(() => extractLineRange(lines, 1, 4)).toThrow(/out of range/);
  });

  it('throws when endLine < startLine', () => {
    expect(() => extractLineRange(lines, 2, 1)).toThrow(/out of range/);
  });
});

// ─── replaceUnique ──────────────────────────────────────────────────────────

describe('replaceUnique', () => {
  it('replaces exact unique match', () => {
    expect(replaceUnique('Hello world.', 'world', 'earth')).toBe('Hello earth.');
  });

  it('throws when target not found', () => {
    expect(() => replaceUnique('Hello world.', 'xyz', 'replacement')).toThrow(/not found/i);
  });

  it('throws when target is ambiguous', () => {
    expect(() => replaceUnique('the cat and the dog', 'the', 'a')).toThrow(/multiple|ambiguous/i);
  });

  it('does not match smart quotes against ASCII (no confusables)', () => {
    const text = 'Sublime\u2019s architecture is elegant.';
    // Without confusables, smart quote vs ASCII apostrophe is a mismatch.
    expect(() => replaceUnique(text, "Sublime's", 'REPLACED', defaultNormalizer)).toThrow(/not found/i);
  });

  it('without normalizer throws on Unicode mismatch', () => {
    const text = 'Sublime\u2019s architecture';
    expect(() => replaceUnique(text, "Sublime's", 'REPLACED')).toThrow();
  });
});

// ─── applySingleOperation ───────────────────────────────────────────────────

describe('applySingleOperation', () => {
  it('delegates to applyProposeChange for string-match substitution', async () => {
    const result = await applySingleOperation({
      fileContent: 'Hello world.',
      oldText: 'world',
      newText: 'earth',
      changeId: 'ct-1',
      author: 'ai:test',
    });
    expect(result.changeType).toBe('sub');
    expect(result.modifiedText.includes('{~~world~>earth~~}[^ct-1]')).toBeTruthy();
  });

  it('handles afterLine insertion', async () => {
    const result = await applySingleOperation({
      fileContent: 'line one\nline two\nline three',
      oldText: '',
      newText: 'inserted text',
      changeId: 'ct-1',
      author: 'ai:test',
      afterLine: 1,
    });
    expect(result.changeType).toBe('ins');
    expect(result.modifiedText.includes('{++inserted text++}')).toBeTruthy();
  });

  it('handles startLine/endLine range substitution', async () => {
    const result = await applySingleOperation({
      fileContent: 'line one\nline two\nline three',
      oldText: '',
      newText: 'replaced content',
      changeId: 'ct-1',
      author: 'ai:test',
      startLine: 2,
      endLine: 2,
    });
    expect(result.changeType).toBe('sub');
    expect(result.modifiedText.includes('{~~line two~>replaced content~~}')).toBeTruthy();
  });

  it('throws when both oldText and newText are empty', async () => {
    await expect(applySingleOperation({
        fileContent: 'Hello world.',
        oldText: '',
        newText: '',
        changeId: 'ct-1',
        author: 'ai:test',
      })).rejects.toThrow();
  });
});

// ─── stripRefsFromContent ────────────────────────────────────────────────────

describe('stripRefsFromContent', () => {
  it('strips single ref and returns it', () => {
    const result = stripRefsFromContent('| **RUNNING** | check |[^ct-2.1]');
    expect(result.cleaned).toBe('| **RUNNING** | check |');
    expect(result.refs).toStrictEqual(['[^ct-2.1]']);
  });

  it('strips multiple refs', () => {
    const result = stripRefsFromContent('text[^ct-1][^ct-2] more');
    expect(result.cleaned).toBe('text more');
    expect(result.refs).toStrictEqual(['[^ct-1]', '[^ct-2]']);
  });

  it('handles dotted refs (ct-N.M)', () => {
    const result = stripRefsFromContent('data[^ct-3.1] here[^ct-3.2]');
    expect(result.cleaned).toBe('data here');
    expect(result.refs).toStrictEqual(['[^ct-3.1]', '[^ct-3.2]']);
  });

  it('returns text unchanged when no refs', () => {
    const result = stripRefsFromContent('just plain text');
    expect(result.cleaned).toBe('just plain text');
    expect(result.refs).toStrictEqual([]);
  });

  it('handles multi-line text, returning all refs', () => {
    const result = stripRefsFromContent('line1[^ct-1]\nline2[^ct-2]');
    expect(result.cleaned).toBe('line1\nline2');
    expect(result.refs).toStrictEqual(['[^ct-1]', '[^ct-2]']);
  });
});

// ─── applyProposeChange — ref preservation ──────────────────────────────────

describe('applyProposeChange — ref preservation', () => {
  it('preserves settled ref when substitution target includes ref via view-aware match', async () => {
    const text = '| **RUNNING** | check |[^ct-1] end.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | accepted';
    const result = await applyProposeChange({
      text,
      oldText: '| **RUNNING** | check |',
      newText: '| **DONE** 95% | check passed |',
      changeId: 'ct-2',
      author: 'ai:test',
    });
    expect(result.modifiedText.includes('[^ct-1]')).toBeTruthy();
    expect(result.modifiedText.includes('{~~')).toBeTruthy();
    const subMatch = result.modifiedText.match(/\{~~[^~]*~>[^~]*~~\}/);
    expect(subMatch, 'should have substitution').toBeTruthy();
    expect(subMatch![0].includes('[^ct-1]')).toBeFalsy();
  });

  it('preserves settled ref during deletion', async () => {
    const text = 'remove this[^ct-1] text.\n\n[^ct-1]: @ai:test | 2026-02-20 | del | accepted';
    const result = await applyProposeChange({
      text,
      oldText: 'remove this',
      newText: '',
      changeId: 'ct-2',
      author: 'ai:test',
    });
    expect(result.modifiedText.includes('[^ct-1]')).toBeTruthy();
  });

  it('preserves ref in applySingleOperation line-range path', async () => {
    const fileContent = 'line one\n| data |[^ct-1]\nline three\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | accepted';
    const result = await applySingleOperation({
      fileContent,
      oldText: '',
      newText: '| updated data |',
      changeId: 'ct-2',
      author: 'ai:test',
      startLine: 2,
      endLine: 2,
    });
    expect(result.modifiedText.includes('[^ct-1]')).toBeTruthy();
  });
});

// ─── applyProposeChange level=3 (L3) ────────────────────────────────────────

describe('applyProposeChange level=3 (L3)', () => {
  const l3Doc = [
    '# Test Document',
    '',
    'The quick brown fox jumps over the lazy dog.',
    '',
    '[^ct-1]: @alice | 2026-03-15 | ins | proposed',
    '    3:a1 fox jumps over the',
    '    @alice 2026-03-15: Added verb',
  ].join('\n');

  beforeAll(async () => {
    await initHashline();
  });

  describe('insertion', () => {
    it('inserts text directly (no CriticMarkup in body) and appends footnote with edit-op line', async () => {
      const result = await applyProposeChange({
        text: l3Doc,
        oldText: '',
        newText: ' rapidly',
        changeId: 'ct-2',
        author: 'ai:claude-opus-4.6',
        insertAfter: 'jumps over',
        level: 3,
      });
      expect(result.changeType).toBe('ins');
      // Body has the inserted text directly — no {++...++} wrapping in body
      const body = splitBodyAndFootnotes(result.modifiedText.split('\n')).bodyLines.join('\n');
      expect(body).toContain('jumps over rapidly the lazy');
      expect(body).not.toContain('{++');
      // Footnote has LINE:HASH edit-op line (may contain {++ ... ++} as the change record)
      expect(result.modifiedText).toMatch(/\[\^ct-2\]:.*\| ins \| proposed/);
      expect(result.modifiedText).toMatch(/^ {4}\d+:[0-9a-f]{2,} .*\{\+\+ rapidly\+\+\}/m);
    });
  });

  describe('deletion', () => {
    it('removes text directly and appends footnote with edit-op line', async () => {
      const result = await applyProposeChange({
        text: l3Doc,
        oldText: 'brown ',
        newText: '',
        changeId: 'ct-2',
        author: 'ai:claude-opus-4.6',
        level: 3,
      });
      expect(result.changeType).toBe('del');
      // Body has the text removed — no {--...--} in body
      const body = splitBodyAndFootnotes(result.modifiedText.split('\n')).bodyLines.join('\n');
      expect(body).toContain('The quick fox jumps');
      expect(body).not.toContain('{--');
      // Footnote has edit-op with deletion markup as the change record
      expect(result.modifiedText).toMatch(/\[\^ct-2\]:.*\| del \| proposed/);
      expect(result.modifiedText).toMatch(/^ {4}\d+:[0-9a-f]{2,} .*\{--brown --\}/m);
    });
  });

  describe('substitution', () => {
    it('replaces text directly and appends footnote with edit-op line', async () => {
      const result = await applyProposeChange({
        text: l3Doc,
        oldText: 'quick brown',
        newText: 'slow red',
        changeId: 'ct-2',
        author: 'ai:claude-opus-4.6',
        level: 3,
      });
      expect(result.changeType).toBe('sub');
      // Body has the replacement directly — no {~~...~~} in body
      const body = splitBodyAndFootnotes(result.modifiedText.split('\n')).bodyLines.join('\n');
      expect(body).toContain('The slow red fox');
      expect(body).not.toContain('{~~');
      // Footnote has edit-op with substitution markup as the change record
      expect(result.modifiedText).toMatch(/\[\^ct-2\]:.*\| sub \| proposed/);
      expect(result.modifiedText).toMatch(/^ {4}\d+:[0-9a-f]{2,} .*\{~~quick brown~>slow red~~\}/m);
    });
  });

  describe('safety check', () => {
    it('throws when level=2 is passed for L3 text', async () => {
      await expect(applyProposeChange({
        text: l3Doc,
        oldText: 'quick',
        newText: 'slow',
        changeId: 'ct-2',
        author: 'test',
        level: 2,
      })).rejects.toThrow();
    });
  });
});
