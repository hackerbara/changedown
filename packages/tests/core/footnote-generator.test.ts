import { describe, it, expect } from 'vitest';
import { generateFootnoteDefinition, scanMaxCnId } from '@changedown/core/internals';

describe('generateFootnoteDefinition', () => {
  it('generates a full footnote definition with author, date, and type', () => {
    const result = generateFootnoteDefinition('cn-5', 'insertion', 'alice', '2026-02-10');
    expect(result).toBe('\n\n[^cn-5]: @alice | 2026-02-10 | insertion | proposed');
  });

  it('omits author field when author is not provided', () => {
    const result = generateFootnoteDefinition('cn-6', 'deletion', undefined, '2026-02-10');
    expect(result).toBe('\n\n[^cn-6]: 2026-02-10 | deletion | proposed');
  });

  it('uses current ISO date when date is not provided', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = generateFootnoteDefinition('cn-7', 'substitution', 'bob');
    expect(result).toBe(`\n\n[^cn-7]: @bob | ${today} | substitution | proposed`);
  });

  it('uses current ISO date and omits author when both are missing', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = generateFootnoteDefinition('cn-8', 'highlight');
    expect(result).toBe(`\n\n[^cn-8]: ${today} | highlight | proposed`);
  });

  it('handles dotted IDs for grouped changes', () => {
    const result = generateFootnoteDefinition('cn-3.1', 'move-from', 'carol', '2026-02-10');
    expect(result).toBe('\n\n[^cn-3.1]: @carol | 2026-02-10 | move-from | proposed');
  });

  it('always starts with double newline', () => {
    const result = generateFootnoteDefinition('cn-1', 'insertion', 'alice', '2026-02-10');
    expect(result.startsWith('\n\n')).toBeTruthy();
  });

  it('always ends with proposed status', () => {
    const result = generateFootnoteDefinition('cn-1', 'insertion', 'alice', '2026-02-10');
    expect(result.endsWith('| proposed')).toBeTruthy();
  });
});

describe('scanMaxCnId', () => {
  it('returns 0 for text with no cn-IDs', () => {
    const result = scanMaxCnId('Just plain text with no markup.');
    expect(result).toBe(0);
  });

  it('finds a single cn-ID', () => {
    const result = scanMaxCnId('Some text [^cn-3] here.');
    expect(result).toBe(3);
  });

  it('finds the maximum among multiple cn-IDs', () => {
    const result = scanMaxCnId('[^cn-1] and [^cn-5] and [^cn-3]');
    expect(result).toBe(5);
  });

  it('handles dotted IDs and returns the parent number', () => {
    const result = scanMaxCnId('[^cn-3] and [^cn-17.2] and [^cn-5.1]');
    expect(result).toBe(17);
  });

  it('handles dotted IDs only', () => {
    const result = scanMaxCnId('[^cn-2.1] and [^cn-2.3]');
    expect(result).toBe(2);
  });

  it('ignores non-sc footnotes', () => {
    const result = scanMaxCnId('[^1] and [^note] and [^cn-4]');
    expect(result).toBe(4);
  });

  it('handles IDs in footnote definitions', () => {
    const text = `Some text [^cn-3]

[^cn-3]: @alice | 2026-02-10 | insertion | proposed`;
    const result = scanMaxCnId(text);
    expect(result).toBe(3);
  });

  it('handles large numbers', () => {
    const result = scanMaxCnId('[^cn-999] and [^cn-1000]');
    expect(result).toBe(1000);
  });

  it('returns 0 for empty string', () => {
    const result = scanMaxCnId('');
    expect(result).toBe(0);
  });
});
