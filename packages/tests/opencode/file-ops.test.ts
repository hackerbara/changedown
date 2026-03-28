import { describe, it, expect } from 'vitest';
import { extractLineRange, findUniqueMatch, appendFootnote } from '@changedown/opencode-plugin/internals';
import { defaultNormalizer } from '@changedown/core';

describe('extractLineRange', () => {
  it('returns correct content and offsets for a valid line range', () => {
    const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
    const result = extractLineRange(lines, 2, 4);

    expect(result.content).toBe('Line 2\nLine 3\nLine 4');
    expect(result.startOffset).toBe(7); // 'Line 1\n'.length
    expect(result.endOffset).toBe(27);  // startOffset + content.length
  });

  it('returns single line when start and end are the same', () => {
    const lines = ['Line 1', 'Line 2', 'Line 3'];
    const result = extractLineRange(lines, 2, 2);

    expect(result.content).toBe('Line 2');
    expect(result.startOffset).toBe(7);
    expect(result.endOffset).toBe(13);
  });

  it('throws when startLine is out of range', () => {
    const lines = ['Line 1', 'Line 2'];
    expect(() => extractLineRange(lines, 0, 1)).toThrow(/out of range/);
    expect(() => extractLineRange(lines, 3, 3)).toThrow(/out of range/);
  });

  it('throws when endLine is less than startLine', () => {
    const lines = ['Line 1', 'Line 2', 'Line 3'];
    expect(() => extractLineRange(lines, 3, 2)).toThrow(/out of range/);
  });

  it('throws when endLine exceeds file length', () => {
    const lines = ['Line 1', 'Line 2'];
    expect(() => extractLineRange(lines, 1, 5)).toThrow(/out of range/);
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

  it('does not match smart quote via NFKC normalization (confusables removed per ADR-061)', () => {
    const text = 'Sublime\u2019s architecture is elegant.';
    // NFKC does not normalize \u2019 (right single quotation mark) to ASCII apostrophe.
    // After ADR-061 removed confusables normalization, this should throw "not found".
    expect(() => findUniqueMatch(text, "Sublime's", defaultNormalizer)).toThrow(/not found/i);
  });

  it('finds target with NBSP via normalization', () => {
    const text = 'hello\u00A0world';
    const result = findUniqueMatch(text, 'hello world', defaultNormalizer);
    expect(result.index).toBe(0);
    expect(result.length).toBe(11);
    expect(result.originalText).toBe('hello\u00A0world');
    expect(result.wasNormalized).toBe(true);
  });

  it('throws with diagnostic message when even normalization fails', () => {
    expect(() =>
      findUniqueMatch('Hello world.', 'completely missing', defaultNormalizer)
    ).toThrow(/not found/i);
    try {
      findUniqueMatch('Hello world.', 'completely missing', defaultNormalizer);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('normalized match');
      expect(msg).toContain('completely missing');
    }
  });

  it('does not match smart quote even when ambiguous (confusables removed per ADR-061)', () => {
    const text = 'Sublime\u2019s and Sublime\u2019s';
    // NFKC does not normalize smart quotes, so the ASCII apostrophe search fails
    // with "not found", not "ambiguous".
    expect(() =>
      findUniqueMatch(text, "Sublime's", defaultNormalizer)
    ).toThrow(/not found/i);
  });
});

describe('appendFootnote', () => {
  it('appends footnote to document without existing footnotes', () => {
    const text = 'Some content here.';
    const footnote = '\n[^cn-1]: @author | 2026-02-12 | ins | proposed';
    const result = appendFootnote(text, footnote);

    expect(result).toBe(text + footnote);
  });

  it('appends after existing footnote block', () => {
    const text = `Some text with markup[^cn-1] here.

[^cn-1]: @alice | 2026-02-10 | ins | proposed`;
    const footnote = '\n[^cn-2]: @bob | 2026-02-12 | sub | proposed';
    const result = appendFootnote(text, footnote);

    expect(result.indexOf('[^cn-2]:')).toBeGreaterThan(result.indexOf('[^cn-1]:'));
    expect(result).toContain('[^cn-1]: @alice');
    expect(result).toContain('[^cn-2]: @bob');
  });

  it('handles footnote with continuation lines', () => {
    const text = `Content[^cn-1].

[^cn-1]: @alice | 2026-02-10 | ins | proposed
    reason: Some reason`;
    const footnote = '\n[^cn-2]: @bob | 2026-02-12 | del | proposed';
    const result = appendFootnote(text, footnote);

    // New footnote should come after the continuation lines
    const sc1Pos = result.indexOf('[^cn-1]:');
    const reasonPos = result.indexOf('    reason:');
    const sc2Pos = result.indexOf('[^cn-2]:');
    expect(sc2Pos).toBeGreaterThan(reasonPos);
    expect(sc2Pos).toBeGreaterThan(sc1Pos);
  });

  it('ignores footnotes inside fenced code blocks', () => {
    const text = `## Example

\`\`\`markdown
Content[^cn-99] here.

[^cn-99]: @alice | 2026-02-10 | ins | proposed
\`\`\`

More content`;
    const footnote = '\n[^cn-1]: @bob | 2026-02-12 | sub | proposed';
    const result = appendFootnote(text, footnote);

    // New footnote should be at the end, not after the code block footnote
    const lastFence = result.lastIndexOf('```');
    const footnotePos = result.indexOf('[^cn-1]:');
    expect(footnotePos).toBeGreaterThan(lastFence);
  });
});
