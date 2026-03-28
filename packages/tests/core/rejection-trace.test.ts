import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, traceDependencies } from '@changedown/core/internals';

beforeAll(async () => { await initHashline(); });

describe('traceDependencies', () => {
  it('returns empty dependents when no other operations depend on the target', () => {
    const l3 = `<!-- changedown.com/v1: tracked -->
The very lazy dog

[^cn-1]: @alice | 2026-03-20 | ins | proposed
    1:a1 The {++very ++}lazy dog`;

    const report = traceDependencies(l3, 'cn-1');

    expect(report.dependents).toHaveLength(0);
    expect(report.target).toBe('cn-1');
  });

  it('detects dependents when rejecting a consumed operation', () => {
    // cn-1 inserts "very ", cn-2 substitutes "very lazy" -> "extremely lazy"
    // Rejecting cn-1 means cn-2 can't find "very lazy"
    const l3 = `<!-- changedown.com/v1: tracked -->
The extremely lazy dog

[^cn-1]: @alice | 2026-03-20 | ins | proposed
    1:a1 The {++very ++}lazy dog

[^cn-2]: @bob | 2026-03-20 | sub | proposed
    1:b1 The {~~very lazy~>extremely lazy~~} dog`;

    const report = traceDependencies(l3, 'cn-1');

    expect(report.dependents).toHaveLength(1);
    expect(report.dependents[0].id).toBe('cn-2');
    expect(report.canAutoResolve).toBe(false);
  });

  it('reports no dependents when operations target different regions', () => {
    const l3 = `<!-- changedown.com/v1: tracked -->
The very lazy brown dog

[^cn-1]: @alice | 2026-03-20 | ins | proposed
    1:a1 The {++very ++}lazy brown dog

[^cn-2]: @bob | 2026-03-20 | ins | proposed
    1:b1 lazy {++brown ++}dog`;

    const report = traceDependencies(l3, 'cn-1');

    expect(report.dependents).toHaveLength(0);
  });
});
