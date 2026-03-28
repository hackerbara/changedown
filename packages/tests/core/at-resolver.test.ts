import { describe, it, expect, beforeAll } from 'vitest';
import {
  parseAt,
  resolveAt,
  initHashline,
  computeLineHash,
} from '@changedown/core/internals';

// ─── parseAt ─────────────────────────────────────────────────────────────────

describe('parseAt', () => {
  it('parses single line coordinate', () => {
    const result = parseAt('12:a1');
    expect(result.startLine).toBe(12);
    expect(result.startHash).toBe('a1');
    expect(result.endLine).toBe(12);
    expect(result.endHash).toBe('a1');
  });

  it('parses range coordinate', () => {
    const result = parseAt('3:ff-7:0a');
    expect(result.startLine).toBe(3);
    expect(result.startHash).toBe('ff');
    expect(result.endLine).toBe(7);
    expect(result.endHash).toBe('0a');
  });

  it('throws on empty string', () => {
    expect(() => parseAt('')).toThrow(/empty/);
  });

  it('throws on invalid format', () => {
    expect(() => parseAt('abc')).toThrow(/Invalid at coordinate/);
  });

  it('throws on dual hash format with helpful message', () => {
    expect(() => parseAt('5:ab.cd')).toThrow(/Dual hashes/);
  });

  it('throws on dual hash in range', () => {
    expect(() => parseAt('5:ab.cd-7:ef')).toThrow(/dual hash/i);
  });

  it('throws when end line < start line', () => {
    expect(() => parseAt('7:ab-3:cd')).toThrow(/end line 3 < start line 7/);
  });

  it('accepts single-digit line number', () => {
    const result = parseAt('1:00');
    expect(result.startLine).toBe(1);
    expect(result.startHash).toBe('00');
  });
});

// ─── resolveAt ───────────────────────────────────────────────────────────────

describe('resolveAt', () => {
  beforeAll(async () => {
    await initHashline();
  });

  it('resolves a single line with correct hash', () => {
    const lines = ['first line', 'second line', 'third line'];
    const hash = computeLineHash(1, 'second line', lines);
    const result = resolveAt(`2:${hash}`, lines);
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(2);
    expect(result.content).toBe('second line');
    // startOffset should be after "first line\n"
    expect(result.startOffset).toBe(11);
    // endOffset should be at end of "second line"
    expect(result.endOffset).toBe(22);
  });

  it('resolves a range with correct hashes', () => {
    const lines = ['line one', 'line two', 'line three', 'line four'];
    const hash2 = computeLineHash(1, 'line two', lines);
    const hash3 = computeLineHash(2, 'line three', lines);
    const result = resolveAt(`2:${hash2}-3:${hash3}`, lines);
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(3);
    expect(result.content).toBe('line two\nline three');
  });

  it('throws on hash mismatch (stale coordinate)', () => {
    const lines = ['hello world'];
    const actualHash = computeLineHash(0, 'hello world', lines);
    // Use a valid hex hash that definitely differs from the actual
    const wrongHash = actualHash === '00' ? '01' : '00';
    expect(
      () => resolveAt(`1:${wrongHash}`, lines),
    ).toThrow(/Hash mismatch at line 1/);
  });

  it('throws on line out of range', () => {
    const lines = ['only line'];
    expect(
      () => resolveAt('5:ab', lines),
    ).toThrow(/out of range/);
  });

  it('throws on end line hash mismatch in range', () => {
    const lines = ['first', 'second', 'third'];
    const hash1 = computeLineHash(0, 'first', lines);
    const hash3 = computeLineHash(2, 'third', lines);
    // Use a valid hex hash that does not match the actual line 3 content
    const wrongHash = hash3 === '00' ? '01' : '00';
    expect(
      () => resolveAt(`1:${hash1}-3:${wrongHash}`, lines),
    ).toThrow(/Hash mismatch at line 3/);
  });

  it('returns correct offsets for first line', () => {
    const lines = ['hello'];
    const hash = computeLineHash(0, 'hello', lines);
    const result = resolveAt(`1:${hash}`, lines);
    expect(result.startOffset).toBe(0);
    expect(result.endOffset).toBe(5);
  });
});
