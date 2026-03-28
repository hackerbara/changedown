import { describe, it, expect } from 'vitest';
import { stripCriticMarkupToCommittedWithMap, findUniqueMatch } from '@changedown/core';
import { extractFootnoteStatuses } from '@changedown/core/internals';

describe('stripCriticMarkupToCommittedWithMap', () => {
  it('reverts proposed insertion (removes inserted text)', () => {
    const raw = 'Hello {++world ++}[^cn-1]there.\n\n[^cn-1]: @ai:test | 2026-01-01 | ins | proposed';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    expect(result.committed).toContain('Hello there.');
    expect(result.committed).not.toContain('world');
  });

  it('reverts proposed deletion (keeps original text)', () => {
    const raw = 'Hello {--beautiful --}[^cn-1]world.\n\n[^cn-1]: @ai:test | 2026-01-01 | del | proposed';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    expect(result.committed).toContain('Hello beautiful world.');
  });

  it('reverts proposed substitution (keeps old text)', () => {
    const raw = 'The {~~quick~>slow~~}[^cn-1] fox.\n\n[^cn-1]: @ai:test | 2026-01-01 | sub | proposed';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    expect(result.committed).toContain('The quick fox.');
    expect(result.committed).not.toContain('slow');
  });

  it('applies accepted insertion (keeps inserted text)', () => {
    const raw = 'Hello {++world ++}[^cn-1]there.\n\n[^cn-1]: @ai:test | 2026-01-01 | ins | accepted';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    expect(result.committed).toContain('Hello world there.');
  });

  it('applies accepted deletion (removes text)', () => {
    const raw = 'Hello {--beautiful --}[^cn-1]world.\n\n[^cn-1]: @ai:test | 2026-01-01 | del | accepted';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    expect(result.committed).toContain('Hello world.');
    expect(result.committed).not.toContain('beautiful');
  });

  it('applies accepted substitution (keeps new text)', () => {
    const raw = 'The {~~quick~>slow~~}[^cn-1] fox.\n\n[^cn-1]: @ai:test | 2026-01-01 | sub | accepted';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    expect(result.committed).toContain('The slow fox.');
  });

  it('builds correct position map (committed index -> raw index)', () => {
    // "AB{++CD++}[^cn-1]EF" with proposed insertion → committed = "ABEF"
    const raw = 'AB{++CD++}[^cn-1]EF\n\n[^cn-1]: @ai:test | 2026-01-01 | ins | proposed';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    expect(result.committed.slice(0, 4)).toBe('ABEF');
    expect(result.toRaw[0]).toBe(0); // A
    expect(result.toRaw[1]).toBe(1); // B
    // toRaw[2] should point past the markup to 'E'
    expect(raw[result.toRaw[2]!]).toBe('E');
  });

  it('records markup ranges for proposed changes', () => {
    const raw = 'The {~~quick~>slow~~}[^cn-1] fox.\n\n[^cn-1]: @ai:test | 2026-01-01 | sub | proposed';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    expect(result.markupRanges.length).toBeGreaterThan(0);
  });

  it('handles mixed proposed and accepted on same line', () => {
    const raw = '{++new ++}[^cn-1]and {~~old~>changed~~}[^cn-2] text.\n\n' +
      '[^cn-1]: @ai:test | 2026-01-01 | ins | accepted\n' +
      '[^cn-2]: @ai:test | 2026-01-01 | sub | proposed';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    // cn-1 accepted: keep "new "
    // cn-2 proposed: revert to "old"
    expect(result.committed).toContain('new and old text.');
  });

  it('handles bare Level 0 markup (no footnote = proposed)', () => {
    const raw = 'The {~~quick~>slow~~} fox.';
    const result = stripCriticMarkupToCommittedWithMap(raw);
    // No footnote → unknown → treated as proposed → revert to old
    expect(result.committed).toContain('The quick fox.');
  });
});

describe('extractFootnoteStatuses', () => {
  it('extracts statuses matching parser output', () => {
    const text = [
      'Hello {++world++}[^cn-1] and {--gone--}[^cn-2]',
      '',
      '[^cn-1]: @alice | 2026-03-23 | ins | proposed',
      '[^cn-2]: @bob | 2026-03-23 | del | accepted',
    ].join('\n');
    const regexResult = extractFootnoteStatuses(text);
    expect(regexResult.get('cn-1')).toBe('proposed');
    expect(regexResult.get('cn-2')).toBe('accepted');
  });

  it('returns empty map for text without footnotes', () => {
    expect(extractFootnoteStatuses('plain text')).toEqual(new Map());
  });

  it('extracts status from ai: author without @ prefix', () => {
    const text = [
      '{~~quick~>slow~~}[^cn-1]',
      '',
      '[^cn-1]: ai:test | 2026-02-25 | sub | accepted',
    ].join('\n');
    expect(extractFootnoteStatuses(text).get('cn-1')).toBe('accepted');
  });
});

describe('findUniqueMatch committed-text cascade level', () => {
  it('finds original text under proposed substitution', () => {
    const text = 'The {~~quick~>slow~~}[^cn-1] brown fox.\n\n[^cn-1]: @ai:test | 2026-01-01 | sub | proposed';
    const result = findUniqueMatch(text, 'quick brown');
    expect(result.wasCommittedMatch).toBe(true);
    // The raw match should cover the CriticMarkup construct
    expect(result.originalText).toContain('{~~quick~>slow~~}');
  });

  it('finds text spanning a proposed insertion gap', () => {
    const text = 'Hello {++world ++}[^cn-1]there.\n\n[^cn-1]: @ai:test | 2026-01-01 | ins | proposed';
    // In committed view: "Hello there." — "Hello there" should match
    const result = findUniqueMatch(text, 'Hello there');
    expect(result.wasCommittedMatch).toBe(true);
    // Raw range should span from 'H' to past the markup to 'there'
    const matched = text.slice(result.index, result.index + result.length);
    expect(matched).toContain('{++world ++}');
  });

  it('prefers exact match over committed-text match', () => {
    // If the text is findable exactly, don't fall through to committed
    const text = 'The quick brown fox.';
    const result = findUniqueMatch(text, 'quick brown');
    expect(result.wasCommittedMatch).toBeUndefined();
    expect(result.wasNormalized).toBe(false);
  });

  it('does NOT use committed matching for accepted changes', () => {
    const text = 'The {~~quick~>slow~~}[^cn-1] brown fox.\n\n[^cn-1]: @ai:test | 2026-01-01 | sub | accepted';
    // Committed text for accepted sub = "slow brown fox"
    // Searching for "quick brown" should NOT match via committed
    expect(() => findUniqueMatch(text, 'quick brown')).toThrow();
  });

  it('expands raw range to cover complete CriticMarkup constructs', () => {
    const text = 'A{~~XY~>B~~}[^cn-1]CD\n\n[^cn-1]: @ai:test | 2026-01-01 | sub | proposed';
    // Committed: "AXYCD" — searching for "XYC"
    const result = findUniqueMatch(text, 'XYC');
    expect(result.wasCommittedMatch).toBe(true);
    // Raw range must span the entire {~~XY~>B~~} construct plus the C
    const matched = text.slice(result.index, result.index + result.length);
    expect(matched).toContain('{~~XY~>B~~}');
    expect(matched).toContain('C');
  });
});
