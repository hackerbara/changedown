import * as assert from 'node:assert';
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
    assert.strictEqual(result.index, 6);
    assert.strictEqual(result.length, 5);
    assert.strictEqual(result.originalText, 'world');
    assert.strictEqual(result.wasNormalized, false);
  });

  it('throws when target not found (no normalizer)', () => {
    assert.throws(
      () => findUniqueMatch('Hello world.', 'xyz'),
      /not found/i,
    );
  });

  it('throws when target is ambiguous (no normalizer)', () => {
    assert.throws(
      () => findUniqueMatch('the cat and the dog', 'the'),
      /multiple|ambiguous/i,
    );
  });

  it('does not match smart quotes against ASCII (no confusables)', () => {
    const text = 'Sublime\u2019s architecture is elegant.';
    // With confusables removed, smart quote U+2019 is distinct from ASCII apostrophe
    assert.throws(
      () => findUniqueMatch(text, "Sublime's", defaultNormalizer),
      /not found/i,
    );
  });

  it('finds target with NBSP via normalization', () => {
    const text = 'hello\u00A0world';
    const result = findUniqueMatch(text, 'hello world', defaultNormalizer);
    assert.strictEqual(result.index, 0);
    assert.strictEqual(result.length, 11);
    assert.strictEqual(result.wasNormalized, true);
  });

  it('throws with diagnostic message when all levels fail', () => {
    assert.throws(
      () => findUniqueMatch('Hello world.', 'completely missing', defaultNormalizer),
      /not found/i,
    );
  });

  // ─── Error message improvements: haystack preview ─────────────────────────

  it('includes haystack preview in not-found error', () => {
    const haystack = 'The quick brown fox jumps over the lazy dog.';
    try {
      findUniqueMatch(haystack, 'completely missing text', defaultNormalizer);
      assert.fail('Should have thrown');
    } catch (err: any) {
      assert.ok(err.message.includes('Searched in'), 'should include Target label');
      assert.ok(
        err.message.includes('The quick brown fox'),
        'should include first chars of haystack',
      );
    }
  });

  it('truncates long haystack preview at 200 chars', () => {
    const haystack = 'A'.repeat(300) + ' end.';
    try {
      findUniqueMatch(haystack, 'not in here', defaultNormalizer);
      assert.fail('Should have thrown');
    } catch (err: any) {
      assert.ok(err.message.includes('Searched in'), 'should include Target label');
      // The preview is 200 chars + "..."
      assert.ok(err.message.includes('...'), 'should truncate with ...');
      // Should NOT include all 300 A's
      assert.ok(
        !err.message.includes('A'.repeat(300)),
        'should not include full 300 chars',
      );
    }
  });

  it('includes haystack line count in not-found error', () => {
    const haystack = 'line one\nline two\nline three\nline four';
    try {
      findUniqueMatch(haystack, 'not present', defaultNormalizer);
      assert.fail('Should have thrown');
    } catch (err: any) {
      // Should mention 4 lines
      assert.ok(
        err.message.includes('4 lines'),
        `should include line count, got: ${err.message}`,
      );
    }
  });

  it('uses singular "line" for single-line haystack', () => {
    const haystack = 'single line content';
    try {
      findUniqueMatch(haystack, 'not present', defaultNormalizer);
      assert.fail('Should have thrown');
    } catch (err: any) {
      assert.ok(err.message.includes('1 line,'), 'should use singular form');
      assert.ok(!err.message.includes('1 lines'), 'should NOT use plural for 1');
    }
  });

  it('includes haystack preview in confusable diagnostic error too', () => {
    // File has em dash (U+2014), agent sends hyphen -- triggers confusable diagnostic
    const haystack = 'Running \u2014 STUB=true';
    try {
      findUniqueMatch(haystack, 'Running - STUB=true', defaultNormalizer);
      assert.fail('Should have thrown');
    } catch (err: any) {
      assert.ok(err.message.includes('Unicode mismatch'), 'should be confusable error');
      assert.ok(err.message.includes('Searched in'), 'confusable error should also include Target preview');
      assert.ok(
        err.message.includes('Running'),
        'confusable error should include haystack content',
      );
    }
  });

  it('does not match smart quotes against ASCII even when repeated (no confusables)', () => {
    const text = 'Sublime\u2019s and Sublime\u2019s';
    // With confusables removed, ASCII apostrophe does not bridge to smart quote
    assert.throws(
      () => findUniqueMatch(text, "Sublime's", defaultNormalizer),
      /not found/i,
    );
  });

  // Whitespace-collapsed matching (Level 3)
  it('matches when LLM omits space before newline', () => {
    const text = 'ground truth; \nprojections derive current state.';
    const target = 'truth;\nprojections derive current state.';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    assert.strictEqual(result.index, 7);
    assert.strictEqual(result.originalText, 'truth; \nprojections derive current state.');
    assert.strictEqual(result.wasNormalized, true);
  });

  it('matches when LLM collapses multiple spaces to one', () => {
    const text = 'hello    world  here';
    const target = 'hello world here';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    assert.strictEqual(result.index, 0);
    assert.strictEqual(result.length, 20);
    assert.strictEqual(result.wasNormalized, true);
  });

  it('throws when whitespace-collapsed match is ambiguous', () => {
    const text = 'hello  world and hello\nworld';
    assert.throws(
      () => findUniqueMatch(text, 'hello world', defaultNormalizer),
      /ambiguous/i,
    );
  });

  // Ref-transparent matching (Level 1.5)
  describe('ref-transparent matching', () => {
    it('finds clean prose when haystack has inline ref', () => {
      const text = 'The latency is 10-20 milliseconds[^ct-2.1] in practice.';
      const match = findUniqueMatch(text, '10-20 milliseconds in practice', defaultNormalizer);
      assert.strictEqual(match.index, 15); // start of "10-20"
      // Length spans from "10-20" to "in practice" INCLUDING the ref
      assert.ok(text.slice(match.index, match.index + match.length).includes('[^ct-2.1]'));
    });

    it('finds clean prose when haystack has multiple refs', () => {
      const text = 'value[^ct-4][^ct-2.1] is correct.';
      const match = findUniqueMatch(text, 'value is correct', defaultNormalizer);
      assert.strictEqual(match.index, 0);
      assert.ok(text.slice(match.index, match.index + match.length).includes('[^ct-4]'));
    });

    it('strips refs from needle too (agent copied from view)', () => {
      const text = 'value[^ct-1] is correct.';
      const match = findUniqueMatch(text, 'value[^ct-1] is correct', defaultNormalizer);
      assert.strictEqual(match.index, 0);
    });

    it('rejects ambiguous match after ref stripping', () => {
      const text = 'value[^ct-1] then value again.';
      assert.throws(
        () => findUniqueMatch(text, 'value', defaultNormalizer),
        /ambiguous|multiple/i,
      );
    });
  });

  // View-surface-aware matching (also Level 1.5 now — promoted from Level 4)
  it('matches text transparently skipping footnote refs', () => {
    const text = 'The {++quick++}[^ct-1] brown fox.';
    // The text with footnote ref stripped is: "The {++quick++} brown fox."
    // Level 1.5 handles [^ct-N] only, not CriticMarkup, so target needs to include markup
    const target = 'The {++quick++} brown';
    const result = findUniqueMatch(text, target);
    assert.strictEqual(result.wasNormalized, true);
    // Raw text includes the footnote ref
    assert.ok(result.originalText.includes('[^ct-1]'));
  });

  // Settled-text matching (Level 5)
  it('matches via settled text when target references inserted content', () => {
    const text = 'Hello {++beautiful ++}world.';
    const target = 'Hello beautiful world.';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    assert.strictEqual(result.wasSettledMatch, true);
    assert.strictEqual(result.wasNormalized, true);
  });

  it('matches via settled text when target references substituted content', () => {
    const text = 'Hello {~~old~>new~~} world.';
    const target = 'Hello new world.';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    assert.strictEqual(result.wasSettledMatch, true);
  });

  // Diagnostic confusable detection (ADR-061)
  describe('diagnostic confusable detection', () => {
    it('reports em dash vs hyphen mismatch with codepoints', () => {
      // File has em dash (U+2014), agent sends hyphen (U+002D)
      const text = 'Running \u2014 STUB=true';
      try {
        findUniqueMatch(text, 'Running - STUB=true', defaultNormalizer);
        assert.fail('Should have thrown');
      } catch (err: any) {
        assert.ok(err.message.includes('Unicode mismatch'), 'should mention Unicode mismatch');
        assert.ok(err.message.includes('EM DASH'), 'should name the file character');
        assert.ok(err.message.includes('HYPHEN-MINUS'), 'should name the agent character');
        assert.ok(err.message.includes('U+2014'), 'should include file codepoint');
        assert.ok(err.message.includes('U+002D'), 'should include agent codepoint');
        assert.ok(err.message.includes('Running \u2014 STUB=true'), 'should include copy-pasteable file text');
      }
    });

    it('reports smart quote mismatch', () => {
      const text = 'She said \u201Chello\u201D today';
      try {
        findUniqueMatch(text, 'She said "hello" today', defaultNormalizer);
        assert.fail('Should have thrown');
      } catch (err: any) {
        assert.ok(err.message.includes('Unicode mismatch'));
        assert.ok(
          err.message.includes('LEFT DOUBLE QUOTATION MARK') || err.message.includes('SMART DOUBLE QUOTE'),
        );
      }
    });

    it('returns generic error when no confusable mismatch', () => {
      try {
        findUniqueMatch('Hello world.', 'completely missing', defaultNormalizer);
        assert.fail('Should have thrown');
      } catch (err: any) {
        assert.ok(!err.message.includes('Unicode mismatch'), 'should NOT mention Unicode mismatch');
        assert.ok(err.message.includes('not found'), 'should be generic not-found');
        assert.ok(err.message.includes('Searched in (1 lines'), 'should include haystack preview');
        assert.ok(err.message.includes('Hello world.'), 'should include haystack content');
      }
    });

    it('reports en dash vs hyphen mismatch', () => {
      const text = '2020\u20132025 report';
      try {
        findUniqueMatch(text, '2020-2025 report', defaultNormalizer);
        assert.fail('Should have thrown');
      } catch (err: any) {
        assert.ok(err.message.includes('Unicode mismatch'));
        assert.ok(err.message.includes('EN DASH'));
      }
    });

    it('reports right single smart quote vs ASCII apostrophe', () => {
      const text = 'it\u2019s working';
      try {
        findUniqueMatch(text, "it's working", defaultNormalizer);
        assert.fail('Should have thrown');
      } catch (err: any) {
        assert.ok(err.message.includes('Unicode mismatch'));
        assert.ok(err.message.includes('RIGHT SINGLE QUOTATION MARK'));
      }
    });
  });
});

// ─── applyProposeChange ─────────────────────────────────────────────────────

describe('applyProposeChange', () => {
  describe('substitution', () => {
    it('replaces oldText with substitution markup and appends footnote', () => {
      const result = applyProposeChange({
        text: 'The quick brown fox jumps over the lazy dog.',
        oldText: 'quick brown',
        newText: 'slow red',
        changeId: 'ct-1',
        author: 'ai:claude-opus-4.6',
      });
      assert.strictEqual(result.changeType, 'sub');
      assert.ok(result.modifiedText.includes('{~~quick brown~>slow red~~}[^ct-1]'));
      assert.ok(result.modifiedText.includes(
        `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`
      ));
    });
  });

  describe('deletion', () => {
    it('replaces oldText with deletion markup and appends footnote', () => {
      const result = applyProposeChange({
        text: 'The quick brown fox jumps over the lazy dog.',
        oldText: ' brown',
        newText: '',
        changeId: 'ct-2',
        author: 'ai:claude-opus-4.6',
      });
      assert.strictEqual(result.changeType, 'del');
      assert.ok(result.modifiedText.includes('{-- brown--}[^ct-2]'));
      assert.ok(result.modifiedText.includes(
        `[^ct-2]: @ai:claude-opus-4.6 | ${TODAY} | del | proposed`
      ));
    });
  });

  describe('insertion', () => {
    it('inserts text after anchor with insertion markup and appends footnote', () => {
      const result = applyProposeChange({
        text: 'The quick fox jumps.',
        oldText: '',
        newText: ' brown',
        changeId: 'ct-3',
        author: 'ai:claude-opus-4.6',
        insertAfter: 'quick',
      });
      assert.strictEqual(result.changeType, 'ins');
      assert.ok(result.modifiedText.includes('quick{++ brown++}[^ct-3]'));
      assert.ok(result.modifiedText.includes(
        `[^ct-3]: @ai:claude-opus-4.6 | ${TODAY} | ins | proposed`
      ));
    });
  });

  describe('reasoning', () => {
    it('includes reason line in footnote when reasoning is provided', () => {
      const result = applyProposeChange({
        text: 'Hello world.',
        oldText: 'world',
        newText: 'earth',
        changeId: 'ct-1',
        author: 'ai:claude-opus-4.6',
        reasoning: 'More specific term',
      });
      assert.ok(result.modifiedText.includes(
        `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed\n    @ai:claude-opus-4.6 ${TODAY}: More specific term`
      ));
    });
  });

  describe('overlap guard', () => {
    it('throws when oldText targets inside existing CriticMarkup', () => {
      const text = 'Before {++inserted text++} after.';
      assert.throws(
        () => applyProposeChange({
          text,
          oldText: 'inserted text',
          newText: 'replacement',
          changeId: 'ct-2',
          author: 'ai:test',
        }),
        /overlaps with proposed change/,
      );
    });
  });

  describe('error cases', () => {
    it('throws when oldText is not found in text', () => {
      assert.throws(
        () => applyProposeChange({
          text: 'Hello world.',
          oldText: 'xyz not here',
          newText: 'replacement',
          changeId: 'ct-1',
          author: 'ai:claude-opus-4.6',
        }),
        /xyz not here/,
      );
    });

    it('throws when oldText is found multiple times', () => {
      assert.throws(
        () => applyProposeChange({
          text: 'the cat and the dog',
          oldText: 'the',
          newText: 'a',
          changeId: 'ct-1',
          author: 'ai:claude-opus-4.6',
        }),
        /ambiguous|multiple|context/i,
      );
    });

    it('throws when both oldText and newText are empty', () => {
      assert.throws(
        () => applyProposeChange({
          text: 'Hello world.',
          oldText: '',
          newText: '',
          changeId: 'ct-1',
          author: 'ai:claude-opus-4.6',
        }),
      );
    });

    it('throws when insertion has no insertAfter anchor', () => {
      assert.throws(
        () => applyProposeChange({
          text: 'Hello world.',
          oldText: '',
          newText: 'inserted text',
          changeId: 'ct-1',
          author: 'ai:claude-opus-4.6',
        }),
        /insertAfter/i,
      );
    });
  });
});

// ─── appendFootnote ─────────────────────────────────────────────────────────

describe('appendFootnote', () => {
  it('appends to text without existing footnotes', () => {
    const result = appendFootnote('Some text.', '\n\n[^ct-1]: @alice | 2026-02-10 | sub | proposed');
    assert.strictEqual(result, 'Some text.\n\n[^ct-1]: @alice | 2026-02-10 | sub | proposed');
  });

  it('appends after existing footnotes', () => {
    const text = `Some text.

[^ct-1]: @alice | 2026-02-10 | sub | proposed
    @alice 2026-02-10: reason`;

    const result = appendFootnote(text, '\n\n[^ct-2]: @bob | 2026-02-10 | ins | proposed');
    assert.ok(result.includes('reason\n\n[^ct-2]:'));
    assert.ok(result.includes('[^ct-1]:'));
  });

  it('ignores footnote definitions inside fenced code blocks', () => {
    const text = `## Example

\`\`\`markdown
[^ct-42]: @alice | 2026-02-10 | sub | proposed
\`\`\`

## More content`;

    const result = appendFootnote(text, '\n\n[^ct-1]: @bob | 2026-02-10 | ins | proposed');
    // The new footnote should appear at the end, not after the fenced code block footnote
    assert.ok(result.endsWith('[^ct-1]: @bob | 2026-02-10 | ins | proposed'));
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
    assert.ok(ct2Line > ct1Line, `ct-2 line (${ct2Line}) should be after ct-1 line (${ct1Line})`);

    // Table should be intact
    assert.ok(result.includes('| Col A | Col B |'));
  });
});

// ─── stripCriticMarkupWithMap ───────────────────────────────────────────────

describe('stripCriticMarkupWithMap', () => {
  it('keeps insertion content', () => {
    const result = stripCriticMarkupWithMap('Hello {++beautiful ++}world.');
    assert.strictEqual(result.settled, 'Hello beautiful world.');
  });

  it('removes deletion content', () => {
    const result = stripCriticMarkupWithMap('Hello {--ugly --}world.');
    assert.strictEqual(result.settled, 'Hello world.');
  });

  it('keeps substitution new text', () => {
    const result = stripCriticMarkupWithMap('Hello {~~old~>new~~} world.');
    assert.strictEqual(result.settled, 'Hello new world.');
  });

  it('keeps highlight content', () => {
    const result = stripCriticMarkupWithMap('Hello {==important==} world.');
    assert.strictEqual(result.settled, 'Hello important world.');
  });

  it('removes comment content', () => {
    const result = stripCriticMarkupWithMap('Hello{>>a note<<} world.');
    assert.strictEqual(result.settled, 'Hello world.');
  });

  it('removes footnote references', () => {
    const result = stripCriticMarkupWithMap('Hello[^ct-1] world[^ct-2.3].');
    assert.strictEqual(result.settled, 'Hello world.');
  });

  it('provides correct position mapping for insertion', () => {
    // "Hello {++beautiful ++}world."
    //  01234567890...
    const result = stripCriticMarkupWithMap('Hello {++beautiful ++}world.');
    // settled: "Hello beautiful world."
    // The 'b' of 'beautiful' is at settled index 6, raw index 9 (after '{++')
    assert.strictEqual(result.toRaw[6], 9);
  });

  it('returns plain text unchanged', () => {
    const result = stripCriticMarkupWithMap('No markup here.');
    assert.strictEqual(result.settled, 'No markup here.');
    assert.strictEqual(result.markupRanges.length, 0);
  });
});

describe('stripCriticMarkup', () => {
  it('returns settled text as a string', () => {
    assert.strictEqual(
      stripCriticMarkup('Hello {++beautiful ++}world.'),
      'Hello beautiful world.',
    );
  });
});

// ─── checkCriticMarkupOverlap ───────────────────────────────────────────────

describe('checkCriticMarkupOverlap', () => {
  it('returns null for non-overlapping range', () => {
    const text = 'Before {++inserted++} after.';
    // "Before " is at index 0-6, overlapping with nothing
    const result = checkCriticMarkupOverlap(text, 0, 6);
    assert.strictEqual(result, null);
  });

  it('detects overlap with insertion', () => {
    const text = 'Before {++inserted++} after.';
    // The insertion spans index 7-21. Target index 10 is inside it.
    const result = checkCriticMarkupOverlap(text, 10, 4);
    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.changeType, 'ins');
  });

  it('detects overlap with substitution', () => {
    const text = 'Before {~~old~>new~~} after.';
    const result = checkCriticMarkupOverlap(text, 10, 3);
    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.changeType, 'sub');
  });

  it('detects overlap with deletion', () => {
    const text = 'Before {--deleted--} after.';
    const result = checkCriticMarkupOverlap(text, 10, 3);
    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.changeType, 'del');
  });
});

describe('checkCriticMarkupOverlap — semantic filtering', () => {
  it('skips settled footnote refs (accepted status)', () => {
    // Settled ref: inline markup removed, only [^ct-1] remains with accepted footnote
    const text = 'The quick brown fox[^ct-1] jumps over.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | accepted';
    const idx = text.indexOf('quick brown fox');
    const result = checkCriticMarkupOverlap(text, idx, 'quick brown fox'.length);
    assert.strictEqual(result, null, 'accepted settled ref should not block');
  });

  it('skips settled footnote refs (rejected status)', () => {
    const text = 'The quick brown fox[^ct-1] jumps over.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | rejected';
    const idx = text.indexOf('quick brown fox');
    const result = checkCriticMarkupOverlap(text, idx, 'quick brown fox'.length);
    assert.strictEqual(result, null, 'rejected settled ref should not block');
  });

  it('skips standalone settled refs even with proposed status in footnote', () => {
    // A standalone [^ct-1] ref (no surrounding CriticMarkup) is a metadata anchor
    // The parser sets settled=true for orphaned refs regardless of footnote status
    const text = 'Result: done[^ct-1] next step.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | proposed';
    const idx = text.indexOf('Result: done');
    const result = checkCriticMarkupOverlap(text, idx, 'Result: done'.length);
    assert.strictEqual(result, null, 'standalone settled ref should not block regardless of footnote status');
  });

  it('still blocks overlap with proposed inline CriticMarkup', () => {
    const text = 'Before {++inserted text++}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | ins | proposed';
    const idx = text.indexOf('inserted text');
    const result = checkCriticMarkupOverlap(text, idx, 'inserted text'.length);
    assert.notStrictEqual(result, null, 'proposed inline markup must still block');
    assert.strictEqual(result!.changeType, 'ins');
  });

  it('still blocks overlap with proposed substitution', () => {
    const text = 'Before {~~old~>new~~}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | proposed';
    const idx = text.indexOf('old');
    const result = checkCriticMarkupOverlap(text, idx, 'old'.length);
    assert.notStrictEqual(result, null, 'proposed inline sub must still block');
  });

  it('allows overlap with accepted inline CriticMarkup (pre-compaction)', () => {
    const text = 'Before {++added++}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | ins | accepted';
    const idx = text.indexOf('added');
    const result = checkCriticMarkupOverlap(text, idx, 'added'.length);
    assert.strictEqual(result, null, 'accepted inline markup should not block');
  });

  it('allows overlap with rejected inline CriticMarkup (pre-compaction)', () => {
    const text = 'Before {--removed--}[^ct-1] after.\n\n[^ct-1]: @ai:test | 2026-02-20 | del | rejected';
    const idx = text.indexOf('removed');
    const result = checkCriticMarkupOverlap(text, idx, 'removed'.length);
    assert.strictEqual(result, null, 'rejected inline markup should not block');
  });

  it('blocks Level 0 markup (no footnote, status defaults to Proposed)', () => {
    const text = 'Before {++inserted text++} after.';
    const idx = text.indexOf('inserted text');
    const result = checkCriticMarkupOverlap(text, idx, 'inserted text'.length);
    assert.notStrictEqual(result, null, 'Level 0 markup with no status should block');
  });
});

describe('guardOverlap', () => {
  it('does not throw for safe range', () => {
    const text = 'Before {++inserted++} after.';
    assert.doesNotThrow(() => guardOverlap(text, 0, 6));
  });

  it('throws for overlapping range', () => {
    const text = 'Before {++inserted++} after.';
    assert.throws(
      () => guardOverlap(text, 10, 4),
      /overlaps with proposed change/,
    );
  });
});

// ─── extractLineRange ───────────────────────────────────────────────────────

describe('extractLineRange', () => {
  const lines = ['line one', 'line two', 'line three'];

  it('extracts a single line', () => {
    const result = extractLineRange(lines, 1, 1);
    assert.strictEqual(result.content, 'line one');
    assert.strictEqual(result.startOffset, 0);
    assert.strictEqual(result.endOffset, 8);
  });

  it('extracts a multi-line range', () => {
    const result = extractLineRange(lines, 1, 2);
    assert.strictEqual(result.content, 'line one\nline two');
    assert.strictEqual(result.startOffset, 0);
    assert.strictEqual(result.endOffset, 17);
  });

  it('extracts the last line', () => {
    const result = extractLineRange(lines, 3, 3);
    assert.strictEqual(result.content, 'line three');
    // 'line one\n' = 9, 'line two\n' = 9 => start at 18
    assert.strictEqual(result.startOffset, 18);
    assert.strictEqual(result.endOffset, 28);
  });

  it('throws for out-of-range start line', () => {
    assert.throws(
      () => extractLineRange(lines, 0, 1),
      /out of range/,
    );
  });

  it('throws for out-of-range end line', () => {
    assert.throws(
      () => extractLineRange(lines, 1, 4),
      /out of range/,
    );
  });

  it('throws when endLine < startLine', () => {
    assert.throws(
      () => extractLineRange(lines, 2, 1),
      /out of range/,
    );
  });
});

// ─── replaceUnique ──────────────────────────────────────────────────────────

describe('replaceUnique', () => {
  it('replaces exact unique match', () => {
    assert.strictEqual(
      replaceUnique('Hello world.', 'world', 'earth'),
      'Hello earth.',
    );
  });

  it('throws when target not found', () => {
    assert.throws(
      () => replaceUnique('Hello world.', 'xyz', 'replacement'),
      /not found/i,
    );
  });

  it('throws when target is ambiguous', () => {
    assert.throws(
      () => replaceUnique('the cat and the dog', 'the', 'a'),
      /multiple|ambiguous/i,
    );
  });

  it('does not match smart quotes against ASCII (no confusables)', () => {
    const text = 'Sublime\u2019s architecture is elegant.';
    // Without confusables, smart quote vs ASCII apostrophe is a mismatch.
    assert.throws(
      () => replaceUnique(text, "Sublime's", 'REPLACED', defaultNormalizer),
      /not found/i,
    );
  });

  it('without normalizer throws on Unicode mismatch', () => {
    const text = 'Sublime\u2019s architecture';
    assert.throws(() => replaceUnique(text, "Sublime's", 'REPLACED'));
  });
});

// ─── applySingleOperation ───────────────────────────────────────────────────

describe('applySingleOperation', () => {
  it('delegates to applyProposeChange for string-match substitution', () => {
    const result = applySingleOperation({
      fileContent: 'Hello world.',
      oldText: 'world',
      newText: 'earth',
      changeId: 'ct-1',
      author: 'ai:test',
    });
    assert.strictEqual(result.changeType, 'sub');
    assert.ok(result.modifiedText.includes('{~~world~>earth~~}[^ct-1]'));
  });

  it('handles afterLine insertion', () => {
    const result = applySingleOperation({
      fileContent: 'line one\nline two\nline three',
      oldText: '',
      newText: 'inserted text',
      changeId: 'ct-1',
      author: 'ai:test',
      afterLine: 1,
    });
    assert.strictEqual(result.changeType, 'ins');
    assert.ok(result.modifiedText.includes('{++inserted text++}'));
  });

  it('handles startLine/endLine range substitution', () => {
    const result = applySingleOperation({
      fileContent: 'line one\nline two\nline three',
      oldText: '',
      newText: 'replaced content',
      changeId: 'ct-1',
      author: 'ai:test',
      startLine: 2,
      endLine: 2,
    });
    assert.strictEqual(result.changeType, 'sub');
    assert.ok(result.modifiedText.includes('{~~line two~>replaced content~~}'));
  });

  it('throws when both oldText and newText are empty', () => {
    assert.throws(
      () => applySingleOperation({
        fileContent: 'Hello world.',
        oldText: '',
        newText: '',
        changeId: 'ct-1',
        author: 'ai:test',
      }),
    );
  });
});

// ─── stripRefsFromContent ────────────────────────────────────────────────────

describe('stripRefsFromContent', () => {
  it('strips single ref and returns it', () => {
    const result = stripRefsFromContent('| **RUNNING** | check |[^ct-2.1]');
    assert.strictEqual(result.cleaned, '| **RUNNING** | check |');
    assert.deepStrictEqual(result.refs, ['[^ct-2.1]']);
  });

  it('strips multiple refs', () => {
    const result = stripRefsFromContent('text[^ct-1][^ct-2] more');
    assert.strictEqual(result.cleaned, 'text more');
    assert.deepStrictEqual(result.refs, ['[^ct-1]', '[^ct-2]']);
  });

  it('handles dotted refs (ct-N.M)', () => {
    const result = stripRefsFromContent('data[^ct-3.1] here[^ct-3.2]');
    assert.strictEqual(result.cleaned, 'data here');
    assert.deepStrictEqual(result.refs, ['[^ct-3.1]', '[^ct-3.2]']);
  });

  it('returns text unchanged when no refs', () => {
    const result = stripRefsFromContent('just plain text');
    assert.strictEqual(result.cleaned, 'just plain text');
    assert.deepStrictEqual(result.refs, []);
  });

  it('handles multi-line text, returning all refs', () => {
    const result = stripRefsFromContent('line1[^ct-1]\nline2[^ct-2]');
    assert.strictEqual(result.cleaned, 'line1\nline2');
    assert.deepStrictEqual(result.refs, ['[^ct-1]', '[^ct-2]']);
  });
});

// ─── applyProposeChange — ref preservation ──────────────────────────────────

describe('applyProposeChange — ref preservation', () => {
  it('preserves settled ref when substitution target includes ref via view-aware match', () => {
    const text = '| **RUNNING** | check |[^ct-1] end.\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | accepted';
    const result = applyProposeChange({
      text,
      oldText: '| **RUNNING** | check |',
      newText: '| **DONE** 95% | check passed |',
      changeId: 'ct-2',
      author: 'ai:test',
    });
    assert.ok(result.modifiedText.includes('[^ct-1]'), 'settled ref must be preserved');
    assert.ok(result.modifiedText.includes('{~~'), 'should contain substitution markup');
    const subMatch = result.modifiedText.match(/\{~~[^~]*~>[^~]*~~\}/);
    assert.ok(subMatch, 'should have substitution');
    assert.ok(!subMatch![0].includes('[^ct-1]'), 'ref should not be inside delimiters');
  });

  it('preserves settled ref during deletion', () => {
    const text = 'remove this[^ct-1] text.\n\n[^ct-1]: @ai:test | 2026-02-20 | del | accepted';
    const result = applyProposeChange({
      text,
      oldText: 'remove this',
      newText: '',
      changeId: 'ct-2',
      author: 'ai:test',
    });
    assert.ok(result.modifiedText.includes('[^ct-1]'), 'settled ref must be preserved');
  });

  it('preserves ref in applySingleOperation line-range path', () => {
    const fileContent = 'line one\n| data |[^ct-1]\nline three\n\n[^ct-1]: @ai:test | 2026-02-20 | sub | accepted';
    const result = applySingleOperation({
      fileContent,
      oldText: '',
      newText: '| updated data |',
      changeId: 'ct-2',
      author: 'ai:test',
      startLine: 2,
      endLine: 2,
    });
    assert.ok(result.modifiedText.includes('[^ct-1]'), 'settled ref must be preserved');
  });
});
