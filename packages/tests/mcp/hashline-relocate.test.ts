import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, computeLineHash } from '@changetracks/core';
import { tryRelocate, type RelocationResult } from '@changetracks/mcp/internals';

beforeAll(async () => {
  await initHashline();
});

describe('tryRelocate', () => {
  it('returns null when hash matches at expected line', () => {
    const lines = ['alpha', 'beta', 'gamma'];
    const hash = computeLineHash(1, 'beta', lines); // line 2 (0-indexed: 1)
    const result = tryRelocate({ line: 2, hash }, lines);
    expect(result).toBeNull();
  });

  it('returns relocated line when hash found uniquely elsewhere', () => {
    // Simulate shift: 'beta' moved from line 2 to line 3
    const lines = ['alpha', 'NEW LINE', 'beta', 'gamma'];
    // Use the original file context to compute the hash (beta was at index 1)
    const originalLines = ['alpha', 'beta', 'gamma'];
    const hash = computeLineHash(1, 'beta', originalLines); // original hash for 'beta'
    const result = tryRelocate({ line: 2, hash }, lines);
    expect(result).not.toBeNull();
    expect(result!.newLine).toBe(3);
  });

  it('returns error when hash is ambiguous (multiple matches)', () => {
    // Two identical non-blank lines produce the same hash
    const lines = ['alpha', 'duplicate line', 'beta', 'duplicate line'];
    const hash = computeLineHash(1, 'duplicate line', lines);
    // Line 5 is out of range AND hash matches lines 2 and 4 → ambiguous → null (can't relocate)
    const result = tryRelocate({ line: 5, hash }, lines);
    expect(result).toBeNull();
  });

  it('returns error when hash not found anywhere', () => {
    const lines = ['alpha', 'beta', 'gamma'];
    const result = tryRelocate({ line: 2, hash: 'zz' }, lines);
    expect(result).toBeNull();
  });

  it('relocates when line shifted (propose_change scenario)', () => {
    // Same scenario as propose-change test: "Line three" was at line 3, now at line 4
    const lines = ['Line one', 'Line two', 'INSERTED', 'Line three', 'Line four'];
    // Use the original file context to compute the hash (Line three was at index 2)
    const originalLines = ['Line one', 'Line two', 'Line three', 'Line four'];
    const hashLine3 = computeLineHash(2, 'Line three', originalLines); // original position index 2
    const result = tryRelocate({ line: 3, hash: hashLine3 }, lines);
    expect(result).not.toBeNull();
    expect(result!.newLine).toBe(4);
  });
});
