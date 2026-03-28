import { describe, it, expect } from 'vitest';
import { scanMaxId, allocateIds } from 'changedown-hooks/internals';

describe('scanMaxId', () => {
  it('finds max cn-N in text', () => {
    const text = 'Some text [^cn-3] and [^cn-7] here [^cn-2]';
    expect(scanMaxId(text)).toBe(7);
  });

  it('returns 0 for no IDs', () => {
    expect(scanMaxId('no ids here')).toBe(0);
  });

  it('handles dotted IDs', () => {
    const text = '[^cn-5.1] [^cn-5.2] [^cn-3]';
    expect(scanMaxId(text)).toBe(5);
  });
});

describe('allocateIds', () => {
  it('allocates flat IDs for single edit', () => {
    const ids = allocateIds(1, 5);
    expect(ids).toEqual(['cn-6']);
  });

  it('allocates dotted IDs for multiple edits', () => {
    const ids = allocateIds(3, 5);
    expect(ids).toEqual(['cn-6.1', 'cn-6.2', 'cn-6.3']);
  });
});
