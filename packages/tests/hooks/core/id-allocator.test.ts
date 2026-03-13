import { describe, it, expect } from 'vitest';
import { scanMaxId, allocateIds } from 'changetracks-hooks/internals';

describe('scanMaxId', () => {
  it('finds max ct-N in text', () => {
    const text = 'Some text [^ct-3] and [^ct-7] here [^ct-2]';
    expect(scanMaxId(text)).toBe(7);
  });

  it('returns 0 for no IDs', () => {
    expect(scanMaxId('no ids here')).toBe(0);
  });

  it('handles dotted IDs', () => {
    const text = '[^ct-5.1] [^ct-5.2] [^ct-3]';
    expect(scanMaxId(text)).toBe(5);
  });
});

describe('allocateIds', () => {
  it('allocates flat IDs for single edit', () => {
    const ids = allocateIds(1, 5);
    expect(ids).toEqual(['ct-6']);
  });

  it('allocates dotted IDs for multiple edits', () => {
    const ids = allocateIds(3, 5);
    expect(ids).toEqual(['ct-6.1', 'ct-6.2', 'ct-6.3']);
  });
});
