import { describe, it, expect } from 'vitest';
import { applyProposeChange, replaceUnique, findUniqueMatch } from '@changedown/mcp/internals';
import { defaultNormalizer } from '@changedown/core';

const TODAY = new Date().toISOString().slice(0, 10);
const TS_RE = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z';

describe('applyProposeChange', () => {
  describe('substitution', () => {
    it('replaces oldText with substitution markup and appends footnote', async () => {
      const result = await applyProposeChange({
        text: 'The quick brown fox jumps over the lazy dog.',
        oldText: 'quick brown',
        newText: 'slow red',
        changeId: 'cn-1',
        author: 'ai:claude-opus-4.6',
      });

      expect(result.changeType).toBe('sub');
      expect(result.modifiedText).toContain('{~~quick brown~>slow red~~}[^cn-1]');
      expect(result.modifiedText).toContain(
        `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`
      );
    });
  });

  describe('deletion', () => {
    it('replaces oldText with deletion markup and appends footnote', async () => {
      const result = await applyProposeChange({
        text: 'The quick brown fox jumps over the lazy dog.',
        oldText: ' brown',
        newText: '',
        changeId: 'cn-2',
        author: 'ai:claude-opus-4.6',
      });

      expect(result.changeType).toBe('del');
      expect(result.modifiedText).toContain('{-- brown--}[^cn-2]');
      expect(result.modifiedText).toContain(
        `[^cn-2]: @ai:claude-opus-4.6 | ${TODAY} | del | proposed`
      );
    });
  });

  describe('insertion', () => {
    it('inserts text after anchor with insertion markup and appends footnote', async () => {
      const result = await applyProposeChange({
        text: 'The quick fox jumps.',
        oldText: '',
        newText: ' brown',
        changeId: 'cn-3',
        author: 'ai:claude-opus-4.6',
        insertAfter: 'quick',
      });

      expect(result.changeType).toBe('ins');
      expect(result.modifiedText).toContain('quick{++ brown++}[^cn-3]');
      expect(result.modifiedText).toContain(
        `[^cn-3]: @ai:claude-opus-4.6 | ${TODAY} | ins | proposed`
      );
    });
  });

  describe('reasoning', () => {
    it('includes reason line in footnote when reasoning is provided', async () => {
      const result = await applyProposeChange({
        text: 'Hello world.',
        oldText: 'world',
        newText: 'earth',
        changeId: 'cn-1',
        author: 'ai:claude-opus-4.6',
        reasoning: 'More specific term',
      });

      // Footnote header uses date-only, reason line uses full ISO timestamp
      expect(result.modifiedText).toContain(
        `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`
      );
      expect(result.modifiedText).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE}: More specific term`));
    });

    it('omits reason line when reasoning is not provided', async () => {
      const result = await applyProposeChange({
        text: 'Hello world.',
        oldText: 'world',
        newText: 'earth',
        changeId: 'cn-1',
        author: 'ai:claude-opus-4.6',
      });

      expect(result.modifiedText).not.toContain('reason:');
    });
  });

  describe('footnote placement with existing footnotes', () => {
    it('appends new footnote after last existing footnote block', async () => {
      const text = `Some text with {++an insertion++}[^cn-1] in it.

[^cn-1]: @alice | 2026-02-10 | ins | proposed
    reason: Added for clarity`;

      const result = await applyProposeChange({
        text,
        oldText: 'Some',
        newText: 'The',
        changeId: 'cn-2',
        author: 'ai:claude-opus-4.6',
      });

      expect(result.modifiedText).toContain(
        `    reason: Added for clarity\n\n[^cn-2]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`
      );
    });

    it('ignores footnote definitions inside fenced code blocks and appends at end', async () => {
      const text = `## Example

\`\`\`markdown
The API should use {~~REST~>GraphQL~~}[^cn-42].

[^cn-42]: @alice | 2026-02-10 | sub | proposed
    reason: Example only
\`\`\`

## More content`;

      const result = await applyProposeChange({
        text,
        oldText: 'More content',
        newText: 'Further content',
        changeId: 'cn-1',
        author: 'ai:claude-opus-4.6',
      });

      // New footnote must be after the closing fence (end of file), not inside the block.
      const lastFence = result.modifiedText.lastIndexOf('```');
      const footnotePos = result.modifiedText.indexOf('[^cn-1]:');
      expect(footnotePos).toBeGreaterThan(lastFence);
      expect(result.modifiedText).toContain('Further content');
      // Content between first ``` and second ``` must not contain the new footnote.
      const firstFence = result.modifiedText.indexOf('```');
      const closingFence = result.modifiedText.indexOf('```', firstFence + 1);
      const insideFence = result.modifiedText.slice(firstFence, closingFence);
      expect(insideFence).not.toContain('[^cn-1]:');
      expect(insideFence).toContain('[^cn-42]:');
    });
  });

  describe('error cases', () => {
    it('throws when oldText is not found in text', async () => {
      await expect(async () =>
        applyProposeChange({
          text: 'Hello world.',
          oldText: 'xyz not here',
          newText: 'replacement',
          changeId: 'cn-1',
          author: 'ai:claude-opus-4.6',
        })
      ).rejects.toThrow(/xyz not here/);
    });

    it('throws when oldText is found multiple times', async () => {
      await expect(async () =>
        applyProposeChange({
          text: 'the cat and the dog',
          oldText: 'the',
          newText: 'a',
          changeId: 'cn-1',
          author: 'ai:claude-opus-4.6',
        })
      ).rejects.toThrow(/ambiguous|multiple|context/i);
    });

    it('throws when both oldText and newText are empty', async () => {
      await expect(async () =>
        applyProposeChange({
          text: 'Hello world.',
          oldText: '',
          newText: '',
          changeId: 'cn-1',
          author: 'ai:claude-opus-4.6',
        })
      ).rejects.toThrow();
    });

    it('throws when insertion has no insertAfter anchor', async () => {
      await expect(async () =>
        applyProposeChange({
          text: 'Hello world.',
          oldText: '',
          newText: 'inserted text',
          changeId: 'cn-1',
          author: 'ai:claude-opus-4.6',
        })
      ).rejects.toThrow(/insertAfter/i);
    });
  });
});

describe('findUniqueMatch', () => {
  it('returns exact match with wasNormalized=false', () => {
    const result = findUniqueMatch('Hello world.', 'world');
    expect(result.index).toBe(6);
    expect(result.length).toBe(5);
    expect(result.originalText).toBe('world');
    expect(result.wasNormalized).toBe(false);
  });

  it('throws when target not found (no normalizer)', () => {
    expect(() => findUniqueMatch('Hello world.', 'xyz')).toThrow(/not found/i);
  });

  it('throws when target is ambiguous (no normalizer)', () => {
    expect(() => findUniqueMatch('the cat and the dog', 'the')).toThrow(/multiple|ambiguous/i);
  });

  it('does not match smart quote against ASCII via normalizer (no confusables)', () => {
    const text = 'Sublime\u2019s architecture is elegant.';
    // Without confusables, smart quote vs ASCII quote is a mismatch.
    // No level bridges this gap, so findUniqueMatch throws.
    expect(() => findUniqueMatch(text, "Sublime's", defaultNormalizer)).toThrow(/not found/i);
  });

  it('finds target with NBSP via NFKC normalization (level 2)', () => {
    // NFKC normalizes NBSP (U+00A0) to SPACE (U+0020) via compatibility decomposition.
    // So level 2 (normalized match) still catches this.
    const text = 'hello\u00A0world';
    const result = findUniqueMatch(text, 'hello world', defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result.originalText).toBe('hello\u00A0world');
    expect(result.wasNormalized).toBe(true);
  });

  it('throws with diagnostic message when even normalization fails', () => {
    expect(() =>
      findUniqueMatch('Hello world.', 'completely missing', defaultNormalizer)
    ).toThrow(/not found/i);
    // Also verify the message mentions normalization was tried
    try {
      findUniqueMatch('Hello world.', 'completely missing', defaultNormalizer);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('normalized match');
      expect(msg).toContain('completely missing');
    }
  });

  it('does not match smart quote vs ASCII even when repeated (no confusables)', () => {
    const text = 'Sublime\u2019s and Sublime\u2019s';
    // Without confusables, "Sublime's" (ASCII) does not match "\u2019" at any level.
    expect(() =>
      findUniqueMatch(text, "Sublime's", defaultNormalizer)
    ).toThrow(/not found/i);
  });
});

describe('replaceUnique with normalization', () => {
  it('does not match smart quotes against ASCII (no confusables)', () => {
    const text = 'Sublime\u2019s architecture is elegant.';
    // Without confusables, smart quote vs ASCII is a mismatch at all levels.
    expect(() => replaceUnique(text, "Sublime's", 'REPLACED', defaultNormalizer)).toThrow(/not found/i);
  });

  it('finds text with NBSP when target has regular space (via whitespace collapse)', () => {
    // NBSP is matched at level 3 (whitespace-collapsed) since \s matches NBSP in JS.
    const text = 'hello\u00A0world';
    const result = replaceUnique(text, 'hello world', 'REPLACED', defaultNormalizer);
    expect(result).toBe('REPLACED');
  });

  it('without normalizer throws on Unicode mismatch', () => {
    const text = 'Sublime\u2019s architecture';
    expect(() => replaceUnique(text, "Sublime's", 'REPLACED')).toThrow();
  });

  it('prefers exact match over normalized match', () => {
    // Text contains both ASCII and smart quote versions
    const text = "Sublime's architecture and Sublime\u2019s design";
    const result = replaceUnique(text, "Sublime's", 'REPLACED', defaultNormalizer);
    // Should use exact match (first occurrence with ASCII quote)
    expect(result).toBe("REPLACED architecture and Sublime\u2019s design");
  });
});

describe('applyProposeChange without confusable matching', () => {
  it('does not match smart quotes against ASCII (no confusables)', async () => {
    const text = 'The API uses \u201Csmart quotes\u201D for strings.';
    // Without confusables, ASCII double quotes don't match smart quotes.
    await expect(async () => applyProposeChange({
      text,
      oldText: '"smart quotes"',  // agent uses ASCII
      newText: '"regular quotes"',
      changeId: 'cn-1',
      author: 'ai:claude-opus-4.6',
    })).rejects.toThrow(/not found/i);
  });

  it('does not match smart apostrophe against ASCII (no confusables)', async () => {
    const text = 'Remove Sublime\u2019s text here.';
    // Without confusables, ASCII apostrophe doesn't match smart quote.
    await expect(async () => applyProposeChange({
      text,
      oldText: "Sublime's text ",  // agent uses ASCII apostrophe
      newText: '',
      changeId: 'cn-1',
      author: 'ai:claude-opus-4.6',
    })).rejects.toThrow(/not found/i);
  });

  it('insertion anchor does not match smart quotes against ASCII (no confusables)', async () => {
    const text = 'After Sublime\u2019s intro, the content continues.';
    // Without confusables, insertion anchor with ASCII quote won't match.
    await expect(async () => applyProposeChange({
      text,
      oldText: '',
      newText: ' INSERTED',
      changeId: 'cn-1',
      author: 'ai:claude-opus-4.6',
      insertAfter: "Sublime's intro",  // ASCII quote
    })).rejects.toThrow(/insertAfter anchor not found/i);
  });
});

describe('raw_edit does NOT normalize', () => {
  it('replaceUnique without normalizer throws on Unicode mismatch (raw_edit behavior)', () => {
    const text = 'Sublime\u2019s architecture';
    // raw_edit calls replaceUnique(fileContent, oldText, newText) — no normalizer
    expect(() => replaceUnique(text, "Sublime's", 'REPLACED')).toThrow(/not found/i);
  });
});

describe('findUniqueMatch — whitespace-collapsed matching (Level 3)', () => {
  it('matches when LLM omits space before newline', () => {
    // File has "truth; \nprojections" but LLM sends "truth;\nprojections"
    const text = 'ground truth; \nprojections derive current state.';
    const target = 'truth;\nprojections derive current state.';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(7);
    // The matched region spans from "truth;" through "current state."
    // including the original whitespace in the file
    expect(result.originalText).toBe('truth; \nprojections derive current state.');
    expect(result.wasNormalized).toBe(true);
  });

  it('matches when LLM collapses multiple spaces to one', () => {
    const text = 'hello    world  here';
    const target = 'hello world here';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result.length).toBe(20); // "hello    world  here" = 20 chars
    expect(result.originalText).toBe('hello    world  here');
    expect(result.wasNormalized).toBe(true);
  });

  it('matches when LLM replaces newline with space', () => {
    const text = 'first line\nsecond line';
    const target = 'first line second line';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result.length).toBe(22); // 'first line\nsecond line' = 22 chars
    expect(result.originalText).toBe('first line\nsecond line');
    expect(result.wasNormalized).toBe(true);
  });

  it('matches when LLM replaces space with newline', () => {
    const text = 'first line second line';
    const target = 'first line\nsecond line';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result.length).toBe(22);
    expect(result.originalText).toBe('first line second line');
    expect(result.wasNormalized).toBe(true);
  });

  it('matches across \\r\\n line endings', () => {
    const text = 'hello\r\nworld';
    const target = 'hello world';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result.length).toBe(12);
    expect(result.originalText).toBe('hello\r\nworld');
    expect(result.wasNormalized).toBe(true);
  });

  it('matches when LLM adds extra space after newline', () => {
    const text = 'end of line.\nStart of next.';
    const target = 'end of line.\n  Start of next.';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result.length).toBe(27); // 'end of line.\nStart of next.' = 27 chars
    expect(result.originalText).toBe('end of line.\nStart of next.');
    expect(result.wasNormalized).toBe(true);
  });

  it('matches with tabs collapsed', () => {
    const text = 'key:\tvalue';
    const target = 'key: value';
    const result = findUniqueMatch(text, target, defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result.length).toBe(10);
    expect(result.originalText).toBe('key:\tvalue');
    expect(result.wasNormalized).toBe(true);
  });

  it('throws when whitespace-collapsed match is ambiguous', () => {
    const text = 'hello  world and hello\nworld';
    expect(() =>
      findUniqueMatch(text, 'hello world', defaultNormalizer)
    ).toThrow(/ambiguous/i);
  });

  it('prefers exact match over whitespace-collapsed match', () => {
    const text = 'hello world is here';
    const result = findUniqueMatch(text, 'hello world', defaultNormalizer);
    expect(result.wasNormalized).toBe(false); // exact match found
    expect(result.index).toBe(0);
  });

  it('NBSP matched via NFKC at level 2 (not level 3)', () => {
    // NFKC normalizes NBSP to regular space, so level 2 catches this.
    // It does NOT fall through to level 3 whitespace-collapse.
    const text = 'hello\u00A0world';
    const result = findUniqueMatch(text, 'hello world', defaultNormalizer);
    expect(result.wasNormalized).toBe(true);
    expect(result.index).toBe(0);
    // Level 2 returns target.length as the length (since NFKC is 1:1 for NBSP)
    expect(result.length).toBe(11);
  });

  it('diagnostic error mentions whitespace-collapsed when all levels fail', () => {
    try {
      findUniqueMatch('Hello world.', 'completely missing text', defaultNormalizer);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('whitespace-collapsed');
    }
  });
});

describe('applyProposeChange with whitespace-collapsed matching', () => {
  it('substitution works with different line wrapping', async () => {
    const text = 'ground truth; \nprojections derive current state.';
    const result = await applyProposeChange({
      text,
      oldText: 'truth;\nprojections derive current state.',
      newText: 'truth; models predict future state.',
      changeId: 'cn-1',
      author: 'ai:claude-opus-4.6',
    });
    expect(result.changeType).toBe('sub');
    // CriticMarkup should contain the FILE's original whitespace
    expect(result.modifiedText).toContain('{~~truth; \nprojections derive current state.~>truth; models predict future state.~~}');
  });

  it('deletion works with different line wrapping', async () => {
    const text = 'remove this \ntext please.';
    const result = await applyProposeChange({
      text,
      oldText: 'this\ntext',
      newText: '',
      changeId: 'cn-1',
      author: 'ai:claude-opus-4.6',
    });
    expect(result.changeType).toBe('del');
    // File's original " \n" preserved in markup
    expect(result.modifiedText).toContain('{--this \ntext--}');
  });

  it('insertion anchor matches with different whitespace', async () => {
    const text = 'after this\nanchor we insert.';
    const result = await applyProposeChange({
      text,
      oldText: '',
      newText: ' INSERTED',
      changeId: 'cn-1',
      author: 'ai:claude-opus-4.6',
      insertAfter: 'this anchor',  // LLM sends space instead of newline
    });
    expect(result.changeType).toBe('ins');
    expect(result.modifiedText).toContain('anchor{++ INSERTED++}');
  });
});

describe('replaceUnique with whitespace-collapsed matching', () => {
  it('finds text with collapsed whitespace differences', () => {
    const text = 'hello  world\nfoo  bar';
    const result = replaceUnique(text, 'hello world\nfoo bar', 'REPLACED', defaultNormalizer);
    expect(result).toBe('REPLACED');
  });

  it('without normalizer, whitespace-collapsed match still works', () => {
    // Even without a normalizer, Level 3 (whitespace-collapsed) is always attempted
    const text = 'hello  world';
    const result = replaceUnique(text, 'hello world', 'REPLACED');
    expect(result).toBe('REPLACED');
  });
});
