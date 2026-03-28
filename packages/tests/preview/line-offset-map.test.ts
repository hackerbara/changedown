import { describe, it, expect } from 'vitest';
import { LineOffsetMap } from '@changedown/preview';

describe('LineOffsetMap', () => {
  it('returns same line when no replacements', () => {
    const map = new LineOffsetMap();
    expect(map.toOriginal(0)).toBe(0);
    expect(map.toOriginal(5)).toBe(5);
    expect(map.toOriginal(100)).toBe(100);
  });

  it('adjusts for a single-line insertion', () => {
    const map = new LineOffsetMap();
    map.addDelta(3, 2);
    expect(map.toOriginal(5)).toBe(3);
    expect(map.toOriginal(2)).toBe(2);
  });

  it('handles multiple deltas', () => {
    const map = new LineOffsetMap();
    map.addDelta(3, 2);
    map.addDelta(10, -1);
    expect(map.toOriginal(2)).toBe(2);
    expect(map.toOriginal(5)).toBe(3);
    expect(map.toOriginal(12)).toBe(11);
  });

  it('handles zero delta', () => {
    const map = new LineOffsetMap();
    map.addDelta(5, 0);
    expect(map.toOriginal(5)).toBe(5);
    expect(map.toOriginal(10)).toBe(10);
  });
});
