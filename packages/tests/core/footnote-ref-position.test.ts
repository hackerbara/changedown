import { describe, it, expect } from 'vitest';
import { CriticMarkupParser } from '@changedown/core/internals';

describe('footnote ref position', () => {
  const parser = new CriticMarkupParser();

  it('range.end is one-past-end of closing delimiter for insertion', () => {
    const text = 'Hello {++world++} more text';
    const doc = parser.parse(text);
    const changes = doc.getChanges();
    expect(changes.length).toBe(1);
    const change = changes[0];
    // range should cover the full markup from { to }
    expect(text.substring(change.range.start, change.range.end)).toBe('{++world++}');
    // The footnote ref should go at range.end (after closing })
    expect(text[change.range.end - 1]).toBe('}');
  });

  it('range.end is one-past-end for all change types', () => {
    const types = [
      { text: 'a{++ins++}b', expected: '{++ins++}' },
      { text: 'a{--del--}b', expected: '{--del--}' },
      { text: 'a{~~old~>new~~}b', expected: '{~~old~>new~~}' },
      { text: 'a{==hl==}b', expected: '{==hl==}' },
      { text: 'a{>>cmt<<}b', expected: '{>>cmt<<}' },
    ];
    for (const { text, expected } of types) {
      const doc = parser.parse(text);
      const change = doc.getChanges()[0];
      expect(text.substring(change.range.start, change.range.end)).toBe(expected);
    }
  });
});
