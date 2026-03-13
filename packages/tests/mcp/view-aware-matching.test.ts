import { describe, it, expect } from 'vitest';
import { buildViewSurfaceMap, viewAwareFind } from '@changetracks/mcp/internals';
import { findUniqueMatch } from '@changetracks/mcp/internals';

describe('buildViewSurfaceMap', () => {
  it('strips footnote refs and builds position map', () => {
    const raw = 'reducing connection latency[^ct-1.4] 10-20 milliseconds';
    const { surface, toRaw } = buildViewSurfaceMap(raw);

    expect(surface).toBe('reducing connection latency 10-20 milliseconds');
    // 'y' is at index 26 in both surface and raw
    expect(toRaw[26]).toBe(26);
    // [^ct-1.4] is 9 chars: raw 27='[', 28='^', ...35=']', 36=' '
    // space after ref: surface index 27 maps to raw index 36
    expect(toRaw[27]).toBe(36);
  });

  it('handles multiple footnote refs', () => {
    const raw = 'word[^ct-1] and[^ct-2] more';
    const { surface } = buildViewSurfaceMap(raw);

    expect(surface).toBe('word and more');
  });

  it('returns identity map when no refs present', () => {
    const raw = 'plain text with no refs';
    const { surface, toRaw } = buildViewSurfaceMap(raw);

    expect(surface).toBe(raw);
    for (let i = 0; i < raw.length; i++) {
      expect(toRaw[i]).toBe(i);
    }
  });

  it('handles ref at start of text', () => {
    const raw = '[^ct-1]Some text';
    const { surface } = buildViewSurfaceMap(raw);
    expect(surface).toBe('Some text');
  });

  it('handles ref at end of text', () => {
    const raw = 'Some text[^ct-1]';
    const { surface } = buildViewSurfaceMap(raw);
    expect(surface).toBe('Some text');
  });
});

describe('viewAwareFind', () => {
  it('finds text spanning a footnote ref', () => {
    const raw = 'reducing connection latency[^ct-1.4] 10-20 milliseconds';
    const target = 'latency 10-20';

    const match = viewAwareFind(raw, target);
    expect(match).not.toBeNull();
    // The raw range should include the footnote ref
    expect(raw.slice(match!.index, match!.index + match!.length)).toBe(
      'latency[^ct-1.4] 10-20'
    );
  });

  it('returns null when target not found even after stripping', () => {
    const raw = 'some[^ct-1] text';
    const match = viewAwareFind(raw, 'not here');
    expect(match).toBeNull();
  });

  it('returns null on ambiguous match', () => {
    const raw = 'word[^ct-1] word[^ct-2] word';
    const match = viewAwareFind(raw, 'word word');
    // 'word word' appears at index 0 and index 5 in stripped 'word word word'
    expect(match).toBeNull();
  });
});

describe('findUniqueMatch with footnote refs (Level 1.5 — promoted from Level 4)', () => {
  it('matches text spanning footnote ref', () => {
    const text = 'reducing connection latency[^ct-1.4] 10-20 milliseconds';
    const target = 'latency 10-20';

    const match = findUniqueMatch(text, target);
    expect(match.index).toBeDefined();
    expect(text.slice(match.index, match.index + match.length)).toContain('[^ct-1.4]');
  });

  it('Level 1 still preferred over Level 1.5', () => {
    const text = 'some plain text without refs';
    const match = findUniqueMatch(text, 'plain text');
    expect(match.wasNormalized).toBe(false); // Exact match, no normalization
  });
});

describe('ref-transparent matching in findUniqueMatch', () => {
  it('finds clean prose when haystack has inline ref', () => {
    const text = 'The latency is 10-20 milliseconds[^ct-2.1] in practice.';
    const match = findUniqueMatch(text, '10-20 milliseconds in practice');
    expect(match.index).toBe(15); // start of "10-20"
    // Length spans from "10-20" to "in practice" INCLUDING the ref
    expect(text.slice(match.index, match.index + match.length)).toContain('[^ct-2.1]');
  });

  it('finds clean prose when haystack has multiple refs', () => {
    const text = 'value[^ct-4][^ct-2.1] is correct.';
    const match = findUniqueMatch(text, 'value is correct');
    expect(match.index).toBe(0);
    expect(text.slice(match.index, match.index + match.length)).toContain('[^ct-4]');
  });

  it('strips refs from needle too (agent copied from view)', () => {
    const text = 'value[^ct-1] is correct.';
    const match = findUniqueMatch(text, 'value[^ct-1] is correct');
    expect(match.index).toBe(0);
  });

  it('rejects ambiguous match after ref stripping', () => {
    const text = 'value[^ct-1] then value again.';
    expect(() => findUniqueMatch(text, 'value'))
      .toThrow(/ambiguous|multiple/i);
  });
});
