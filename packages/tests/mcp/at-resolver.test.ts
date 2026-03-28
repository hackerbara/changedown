import { describe, it, expect, beforeAll } from 'vitest';
import { parseAt, resolveAt, type ResolvedTarget } from '@changedown/mcp/internals';
import { initHashline, computeLineHash } from '@changedown/core';

describe('parseAt', () => {
  it('parses single line coordinate', () => {
    expect(parseAt('12:a1')).toEqual({
      startLine: 12,
      startHash: 'a1',
      endLine: 12,
      endHash: 'a1',
    });
  });

  it('parses range coordinate', () => {
    expect(parseAt('12:a1-15:b3')).toEqual({
      startLine: 12,
      startHash: 'a1',
      endLine: 15,
      endHash: 'b3',
    });
  });

  it('throws on invalid format', () => {
    expect(() => parseAt('12')).toThrow();
    expect(() => parseAt('abc')).toThrow();
    expect(() => parseAt('')).toThrow();
  });

  it('throws when end line < start line', () => {
    expect(() => parseAt('15:b3-12:a1')).toThrow();
  });

  it('throws actionable error for dual-hash coordinate', () => {
    expect(() => parseAt('22:cd.18')).toThrow(
      /use only the first hash/i
    );
  });

  it('throws actionable error for dual-hash in range', () => {
    expect(() => parseAt('22:cd.18-25:ab.ff')).toThrow(
      /use only the first hash/i
    );
  });
});

describe('resolveAt', () => {
  beforeAll(async () => {
    await initHashline();
  });

  it('verifies hash matches file content', () => {
    const lines = ['first line', 'second line', 'third line'];
    const hash = computeLineHash(1, lines[1], lines); // 0-indexed
    const result = resolveAt(`2:${hash}`, lines);
    expect(result.startLine).toBe(2);
    expect(result.startOffset).toBeDefined();
    expect(result.endOffset).toBeDefined();
  });

  it('throws on hash mismatch', () => {
    const lines = ['first line', 'second line'];
    expect(() => resolveAt('2:ff', lines)).toThrow(/hash mismatch/i);
  });

  it('throws on out-of-range line number', () => {
    const lines = ['first line'];
    expect(() => resolveAt('5:ab', lines)).toThrow(/out of range/i);
  });

  it('includes batch workaround tip in hash mismatch error', () => {
    const lines = ['first line', 'second line'];
    try {
      resolveAt('2:ff', lines);
      expect.fail('should have thrown');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/hash mismatch/i);
      expect(msg).toMatch(/re-read/i);
      expect(msg).toMatch(/single edits/i);
    }
  });

  it('resolves range to start and end offsets', () => {
    const lines = ['line one', 'line two', 'line three', 'line four'];
    const h2 = computeLineHash(1, lines[1], lines);
    const h3 = computeLineHash(2, lines[2], lines);
    const result = resolveAt(`2:${h2}-3:${h3}`, lines);
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(3);
  });
});
