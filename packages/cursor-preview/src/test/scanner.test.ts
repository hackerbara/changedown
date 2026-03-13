import { describe, it, expect } from 'vitest';
import { scanCriticMarkup } from '../scanner.js';

describe('scanCriticMarkup', () => {
  it('finds a simple insertion', () => {
    const matches = scanCriticMarkup('Hello {++world++}!');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('insertion');
    expect(matches[0].start).toBe(6);
    expect(matches[0].end).toBe(17);
    expect(matches[0].regions).toEqual([
      { role: 'open-delim', start: 6, end: 9 },
      { role: 'content', start: 9, end: 14 },
      { role: 'close-delim', start: 14, end: 17 },
    ]);
  });

  it('finds a simple deletion', () => {
    const matches = scanCriticMarkup('Hello {--world--}!');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('deletion');
    expect(matches[0].regions).toEqual([
      { role: 'open-delim', start: 6, end: 9 },
      { role: 'content', start: 9, end: 14 },
      { role: 'close-delim', start: 14, end: 17 },
    ]);
  });

  it('finds a substitution with old and new content', () => {
    const matches = scanCriticMarkup('The {~~quick~>slow~~} fox');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('substitution');
    expect(matches[0].regions).toEqual([
      { role: 'open-delim', start: 4, end: 7 },
      { role: 'old-content', start: 7, end: 12 },
      { role: 'separator', start: 12, end: 14 },
      { role: 'new-content', start: 14, end: 18 },
      { role: 'close-delim', start: 18, end: 21 },
    ]);
  });

  it('finds a highlight', () => {
    const matches = scanCriticMarkup('Some {==important==} text');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('highlight');
  });

  it('finds a comment', () => {
    const matches = scanCriticMarkup('Text {>>note<<}');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('comment');
  });

  it('finds a footnote reference', () => {
    const matches = scanCriticMarkup('Changed text[^ct-1]');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('footnote-ref');
    expect(matches[0].start).toBe(12);
    expect(matches[0].end).toBe(19);
  });

  it('finds dotted footnote reference', () => {
    const matches = scanCriticMarkup('Moved[^ct-3.1]');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('footnote-ref');
  });

  it('finds multiple matches in one string', () => {
    const matches = scanCriticMarkup('Hello {++world++} and {--goodbye--}!');
    expect(matches).toHaveLength(2);
    expect(matches[0].type).toBe('insertion');
    expect(matches[1].type).toBe('deletion');
  });

  it('returns empty array for plain text', () => {
    const matches = scanCriticMarkup('No markup here');
    expect(matches).toHaveLength(0);
  });

  it('handles multiline content', () => {
    const matches = scanCriticMarkup('Before\n{++line one\nline two++}\nAfter');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('insertion');
  });

  it('handles adjacent changes', () => {
    const matches = scanCriticMarkup('{--old--}{++new++}');
    expect(matches).toHaveLength(2);
    expect(matches[0].type).toBe('deletion');
    expect(matches[1].type).toBe('insertion');
    expect(matches[0].end).toBe(9);
    expect(matches[1].start).toBe(9);
  });
});
