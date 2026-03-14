import { describe, it, expect } from 'vitest';
import { generateFootnoteDefinition, scanMaxCtId } from '@changetracks/core/internals';

describe('generateFootnoteDefinition', () => {
  it('generates a full footnote definition with author, date, and type', () => {
    const result = generateFootnoteDefinition('ct-5', 'insertion', 'alice', '2026-02-10');
    expect(result).toBe('\n\n[^ct-5]: @alice | 2026-02-10 | insertion | proposed');
  });

  it('omits author field when author is not provided', () => {
    const result = generateFootnoteDefinition('ct-6', 'deletion', undefined, '2026-02-10');
    expect(result).toBe('\n\n[^ct-6]: 2026-02-10 | deletion | proposed');
  });

  it('uses current ISO date when date is not provided', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = generateFootnoteDefinition('ct-7', 'substitution', 'bob');
    expect(result).toBe(`\n\n[^ct-7]: @bob | ${today} | substitution | proposed`);
  });

  it('uses current ISO date and omits author when both are missing', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = generateFootnoteDefinition('ct-8', 'highlight');
    expect(result).toBe(`\n\n[^ct-8]: ${today} | highlight | proposed`);
  });

  it('handles dotted IDs for grouped changes', () => {
    const result = generateFootnoteDefinition('ct-3.1', 'move-from', 'carol', '2026-02-10');
    expect(result).toBe('\n\n[^ct-3.1]: @carol | 2026-02-10 | move-from | proposed');
  });

  it('always starts with double newline', () => {
    const result = generateFootnoteDefinition('ct-1', 'insertion', 'alice', '2026-02-10');
    expect(result.startsWith('\n\n')).toBeTruthy();
  });

  it('always ends with proposed status', () => {
    const result = generateFootnoteDefinition('ct-1', 'insertion', 'alice', '2026-02-10');
    expect(result.endsWith('| proposed')).toBeTruthy();
  });
});

describe('scanMaxCtId', () => {
  it('returns 0 for text with no ct-IDs', () => {
    const result = scanMaxCtId('Just plain text with no markup.');
    expect(result).toBe(0);
  });

  it('finds a single ct-ID', () => {
    const result = scanMaxCtId('Some text [^ct-3] here.');
    expect(result).toBe(3);
  });

  it('finds the maximum among multiple ct-IDs', () => {
    const result = scanMaxCtId('[^ct-1] and [^ct-5] and [^ct-3]');
    expect(result).toBe(5);
  });

  it('handles dotted IDs and returns the parent number', () => {
    const result = scanMaxCtId('[^ct-3] and [^ct-17.2] and [^ct-5.1]');
    expect(result).toBe(17);
  });

  it('handles dotted IDs only', () => {
    const result = scanMaxCtId('[^ct-2.1] and [^ct-2.3]');
    expect(result).toBe(2);
  });

  it('ignores non-sc footnotes', () => {
    const result = scanMaxCtId('[^1] and [^note] and [^ct-4]');
    expect(result).toBe(4);
  });

  it('handles IDs in footnote definitions', () => {
    const text = `Some text [^ct-3]

[^ct-3]: @alice | 2026-02-10 | insertion | proposed`;
    const result = scanMaxCtId(text);
    expect(result).toBe(3);
  });

  it('handles large numbers', () => {
    const result = scanMaxCtId('[^ct-999] and [^ct-1000]');
    expect(result).toBe(1000);
  });

  it('returns 0 for empty string', () => {
    const result = scanMaxCtId('');
    expect(result).toBe(0);
  });
});
