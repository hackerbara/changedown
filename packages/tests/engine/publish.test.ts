import { describe, it, expect } from 'vitest';
import { publishSettled } from 'changedown/internals';

describe('publishSettled', () => {
  it('produces clean output with all changes applied', () => {
    const content = [
      'Hello {++beautiful ++}world{-- of pain--}.',
      '',
      '[^cn-1]: @alice | 2026-02-01 | ins | proposed',
    ].join('\n');
    const result = publishSettled(content);
    // Accept-all semantics: insertions kept, deletions removed, footnotes stripped
    expect(result).toBe('Hello beautiful world.');
  });

  it('passes through plain text unchanged', () => {
    const content = 'Just plain text.';
    const result = publishSettled(content);
    expect(result).toBe('Just plain text.');
  });
});
