import { describe, it, expect } from 'vitest';
import {
  parseTrackingHeader,
  generateTrackingHeader,
  insertTrackingHeader,
  defaultNormalizer,
  normalizedIndexOf,
} from '@changetracks/core';

// ──────────────────────────────────────────────
// parseTrackingHeader
// ──────────────────────────────────────────────

describe('parseTrackingHeader', () => {
  it('parses a valid tracked header', () => {
    const text = '<!-- ctrcks.com/v1: tracked -->\n# Hello';
    const result = parseTrackingHeader(text);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.status).toBe('tracked');
    expect(result!.line).toBe(0);
    expect(result!.offset).toBe(0);
    expect(result!.length).toBe('<!-- ctrcks.com/v1: tracked -->'.length);
  });

  it('parses a valid untracked header', () => {
    const text = '<!-- ctrcks.com/v1: untracked -->\n# Hello';
    const result = parseTrackingHeader(text);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.status).toBe('untracked');
  });

  it('returns null when header is missing', () => {
    const text = '# Just a heading\n\nSome content.';
    const result = parseTrackingHeader(text);
    expect(result).toBeNull();
  });

  it('returns null for invalid format (typo in domain)', () => {
    const text = '<!-- supercritik.dev/v1: tracked -->\n';
    const result = parseTrackingHeader(text);
    expect(result).toBeNull();
  });

  it('returns null for invalid format (wrong status)', () => {
    const text = '<!-- ctrcks.com/v1: enabled -->\n';
    const result = parseTrackingHeader(text);
    expect(result).toBeNull();
  });

  it('finds header after YAML frontmatter', () => {
    const text = [
      '---',
      'title: My Doc',
      'date: 2026-02-11',
      '---',
      '<!-- ctrcks.com/v1: tracked -->',
      '# Content',
    ].join('\n');
    const result = parseTrackingHeader(text);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.status).toBe('tracked');
    expect(result!.line).toBe(4);
    // Offset: lines 0-3 = "---\ntitle: My Doc\ndate: 2026-02-11\n---\n"
    const expectedOffset = '---\ntitle: My Doc\ndate: 2026-02-11\n---\n'.length;
    expect(result!.offset).toBe(expectedOffset);
  });

  it('does NOT find header on line 6+ (only checks first 5 lines)', () => {
    const text = [
      'line 0',
      'line 1',
      'line 2',
      'line 3',
      'line 4',
      '<!-- ctrcks.com/v1: tracked -->',
    ].join('\n');
    const result = parseTrackingHeader(text);
    // Header is on line 5 (0-indexed), which is the 6th line
    expect(result).toBeNull();
  });

  it('returns correct offset and length', () => {
    const text = '\n<!-- ctrcks.com/v1: untracked -->\n# Title';
    const result = parseTrackingHeader(text);
    expect(result).not.toBeNull();
    expect(result!.line).toBe(1);
    expect(result!.offset).toBe(1); // after the first \n
    expect(result!.length).toBe('<!-- ctrcks.com/v1: untracked -->'.length);
  });

  it('handles extra whitespace in the header comment', () => {
    const text = '<!--  ctrcks.com/v1:  tracked  -->\n';
    const result = parseTrackingHeader(text);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('tracked');
  });

  it('does NOT treat legacy breadcrumb as a tracking header', () => {
    const text = '<!-- changetracks: https://changetracks.dev/spec -->\n# Doc';
    const result = parseTrackingHeader(text);
    expect(result).toBeNull();
  });
});

// ──────────────────────────────────────────────
// generateTrackingHeader
// ──────────────────────────────────────────────

describe('generateTrackingHeader', () => {
  it('generates correct tracked string', () => {
    expect(generateTrackingHeader('tracked')).toBe(
      '<!-- ctrcks.com/v1: tracked -->'
    );
  });

  it('generates correct untracked string', () => {
    expect(generateTrackingHeader('untracked')).toBe(
      '<!-- ctrcks.com/v1: untracked -->'
    );
  });
});

// ──────────────────────────────────────────────
// insertTrackingHeader
// ──────────────────────────────────────────────

describe('insertTrackingHeader', () => {
  it('prepends header to plain markdown', () => {
    const text = '# Hello World\n\nSome content.';
    const result = insertTrackingHeader(text);
    expect(result.headerInserted).toBe(true);
    expect(result.newText).toBe(
      '<!-- ctrcks.com/v1: tracked -->\n# Hello World\n\nSome content.'
    );
  });

  it('inserts after YAML frontmatter (after closing ---)', () => {
    const text = '---\ntitle: Test\n---\n# Content';
    const result = insertTrackingHeader(text);
    expect(result.headerInserted).toBe(true);
    expect(result.newText).toBe(
      '---\ntitle: Test\n---\n<!-- ctrcks.com/v1: tracked -->\n# Content'
    );
  });

  it('returns headerInserted: false if header already exists', () => {
    const text = '<!-- ctrcks.com/v1: tracked -->\n# Hello';
    const result = insertTrackingHeader(text);
    expect(result.headerInserted).toBe(false);
    expect(result.newText).toBe(text);
  });

  it('handles empty file', () => {
    const text = '';
    const result = insertTrackingHeader(text);
    expect(result.headerInserted).toBe(true);
    expect(result.newText).toBe('<!-- ctrcks.com/v1: tracked -->\n');
  });

  it('returns headerInserted: false if untracked header exists', () => {
    const text = '<!-- ctrcks.com/v1: untracked -->\n# Hello';
    const result = insertTrackingHeader(text);
    expect(result.headerInserted).toBe(false);
    expect(result.newText).toBe(text);
  });
});

// ──────────────────────────────────────────────
// defaultNormalizer
// ──────────────────────────────────────────────

describe('defaultNormalizer', () => {
  it('preserves smart single quotes (NFKC only, no confusable mapping)', () => {
    // U+2018 LEFT SINGLE QUOTATION MARK — preserved
    expect(defaultNormalizer('\u2018')).toBe('\u2018');
    // U+2019 RIGHT SINGLE QUOTATION MARK — preserved
    expect(defaultNormalizer('\u2019')).toBe('\u2019');
    // U+201A SINGLE LOW-9 QUOTATION MARK — preserved
    expect(defaultNormalizer('\u201A')).toBe('\u201A');
  });

  it('preserves smart double quotes (NFKC only, no confusable mapping)', () => {
    // U+201C LEFT DOUBLE QUOTATION MARK — preserved
    expect(defaultNormalizer('\u201C')).toBe('\u201C');
    // U+201D RIGHT DOUBLE QUOTATION MARK — preserved
    expect(defaultNormalizer('\u201D')).toBe('\u201D');
    // U+201E DOUBLE LOW-9 QUOTATION MARK — preserved
    expect(defaultNormalizer('\u201E')).toBe('\u201E');
  });

  it('normalizes NBSP to regular space via NFKC', () => {
    // NFKC applies compatibility decomposition: NBSP (U+00A0) -> SPACE (U+0020)
    expect(defaultNormalizer('\u00A0')).toBe(' ');
  });

  it('preserves en dash (no confusable mapping)', () => {
    expect(defaultNormalizer('\u2013')).toBe('\u2013');
  });

  it('passes ASCII text through unchanged', () => {
    const ascii = 'Hello, world! This is a test. 123 - "quoted"';
    expect(defaultNormalizer(ascii)).toBe(ascii);
  });

  it('preserves smart quotes and en dash, but NFKC normalizes NBSP', () => {
    const input = '\u201Chello\u201D \u2013 it\u2019s a\u00A0test';
    // Smart quotes and en dash are preserved; NBSP is normalized to space by NFKC
    const expected = '\u201Chello\u201D \u2013 it\u2019s a test';
    expect(defaultNormalizer(input)).toBe(expected);
  });

  it('applies NFKC normalization (e.g., fullwidth letters)', () => {
    // Fullwidth A (U+FF21) should normalize to regular A via NFKC
    expect(defaultNormalizer('\uFF21')).toBe('A');
  });
});

// ──────────────────────────────────────────────
// normalizedIndexOf
// ──────────────────────────────────────────────

describe('normalizedIndexOf', () => {
  it('returns same as indexOf for exact match', () => {
    const text = 'hello world';
    expect(normalizedIndexOf(text, 'world')).toBe(6);
  });

  it('does not match smart quote against ASCII at normalizer level', () => {
    const text = 'it\u2019s a test'; // it's a test (smart quote)
    expect(normalizedIndexOf(text, "it's")).toBe(-1);
  });

  it('does not match ASCII against smart quote at normalizer level', () => {
    const text = "it's a test";
    expect(normalizedIndexOf(text, 'it\u2019s')).toBe(-1);
  });

  it('returns -1 when not found', () => {
    const text = 'hello world';
    expect(normalizedIndexOf(text, 'xyz')).toBe(-1);
  });

  it('respects startFrom parameter', () => {
    const text = 'abc abc abc';
    expect(normalizedIndexOf(text, 'abc', undefined, 1)).toBe(4);
  });

  it('returns first occurrence by default', () => {
    const text = 'abc abc abc';
    expect(normalizedIndexOf(text, 'abc')).toBe(0);
  });

  it('works with custom normalizer', () => {
    const toUpper = (s: string) => s.toUpperCase();
    const text = 'Hello World';
    // With toUpper normalizer, 'hello' should match 'Hello' at position 0
    expect(normalizedIndexOf(text, 'hello', toUpper)).toBe(0);
  });

  it('matches NBSP against regular space via NFKC (compatibility decomposition)', () => {
    // NFKC normalizes NBSP to regular space, so normalizedIndexOf matches.
    const text = 'hello\u00A0world';
    expect(normalizedIndexOf(text, 'hello world')).toBe(0);
  });

  it('does not match en dash against hyphen at normalizer level', () => {
    const text = 'pre\u2013post';
    expect(normalizedIndexOf(text, 'pre-post')).toBe(-1);
  });
});
