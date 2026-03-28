import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, convertL2ToL3, resolve } from '@changedown/core/internals';

beforeAll(async () => {
  await initHashline();
});

describe('resolve', () => {
  it('returns 100% coherence for a well-formed L3 document', async () => {
    const l2 = `<!-- changedown.com/v1: tracked -->
The {++very ++}[^cn-1]lazy dog

[^cn-1]: @alice | 2026-03-20 | ins | proposed
    reason: test`;

    const l3 = await convertL2ToL3(l2);
    const result = resolve(l3);

    expect(result.coherenceRate).toBe(100);
    expect(result.unresolvedDiagnostics).toHaveLength(0);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.every(c => c.resolved)).toBe(true);
  });

  it('repairs a stale anchor via Phase B replay', async () => {
    await initHashline();
    const l3 = `<!-- changedown.com/v1: tracked -->
A new line was added here
The very lazy dog

[^cn-1]: @alice | 2026-03-20 | ins | proposed
    1:a1 The {++very ++}lazy dog
    reason: test`;
    // cn-1's anchor says line 1, but text is actually on line 2

    const result = resolve(l3);

    expect(result.coherenceRate).toBe(100);
    const ct1 = result.changes.find(c => c.id === 'cn-1');
    expect(ct1).toBeDefined();
    expect(ct1!.resolved).toBe(true);
    // Fresh anchor should point to line 3 (header=1, new line=2, text=3)
    expect(ct1!.freshAnchor).toBeDefined();
    expect(ct1!.freshAnchor).toMatch(/^\s*3:/);
  });

  it('resolves edit-over-edit via Phase B', async () => {
    await initHashline();
    // cn-1 inserts "very ", cn-2 deletes "very " — cn-1 is consumed
    const l3 = `<!-- changedown.com/v1: tracked -->
The lazy dog

[^cn-1]: @alice | 2026-03-20 | ins | proposed
    1:a1 The {++very ++}lazy dog

[^cn-2]: @alice | 2026-03-20 | del | proposed
    1:b1 The {--very --}lazy dog`;

    const result = resolve(l3);

    expect(result.coherenceRate).toBe(100);
    const ct1 = result.changes.find(c => c.id === 'cn-1');
    expect(ct1!.resolved).toBe(true);
    expect(ct1!.consumedBy).toBe('cn-2');
    // Consumed ops have no body range — their text is absent from Current
    expect(ct1!.resolvedRange).toBeUndefined();
  });

  it('resolves via Phase A (hash match) without running Phase B', async () => {
    const l2 = `<!-- changedown.com/v1: tracked -->
The {++very ++}[^cn-1]lazy dog

[^cn-1]: @alice | 2026-03-20 | ins | proposed
    reason: test`;
    const l3 = await convertL2ToL3(l2);
    const result = resolve(l3);

    const ct1 = result.changes.find(c => c.id === 'cn-1');
    expect(ct1).toBeDefined();
    expect(ct1!.resolved).toBe(true);
    expect(ct1!.resolutionPath).toBe('hash');
  });

  it('resolves rejected operations', async () => {
    await initHashline();
    const l3 = `<!-- changedown.com/v1: tracked -->
The lazy dog

[^cn-1]: @alice | 2026-03-20 | ins | rejected
    1:a1 The {++very ++}lazy dog
    rejected: @bob 2026-03-20 "Not needed"`;

    const result = resolve(l3);

    const ct1 = result.changes.find(c => c.id === 'cn-1');
    expect(ct1).toBeDefined();
    expect(ct1!.resolved).toBe(true);
    expect(ct1!.resolutionPath).toBe('rejected');
  });
});
