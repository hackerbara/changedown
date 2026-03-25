import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, traceDependencies } from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

describe('traceDependencies', () => {
  it('returns empty dependents when no other operations depend on the target', () => {
    const l3 = `<!-- ctrcks.com/v1: tracked -->
The very lazy dog

[^ct-1]: @alice | 2026-03-20 | ins | proposed
    1:a1 The {++very ++}lazy dog`;

    const report = traceDependencies(l3, 'ct-1');

    expect(report.dependents).toHaveLength(0);
    expect(report.target).toBe('ct-1');
  });

  it('detects dependents when rejecting a consumed operation', () => {
    // ct-1 inserts "very ", ct-2 substitutes "very lazy" -> "extremely lazy"
    // Rejecting ct-1 means ct-2 can't find "very lazy"
    const l3 = `<!-- ctrcks.com/v1: tracked -->
The extremely lazy dog

[^ct-1]: @alice | 2026-03-20 | ins | proposed
    1:a1 The {++very ++}lazy dog

[^ct-2]: @bob | 2026-03-20 | sub | proposed
    1:b1 The {~~very lazy~>extremely lazy~~} dog`;

    const report = traceDependencies(l3, 'ct-1');

    expect(report.dependents).toHaveLength(1);
    expect(report.dependents[0].id).toBe('ct-2');
    expect(report.canAutoResolve).toBe(false);
  });

  it('reports no dependents when operations target different regions', () => {
    const l3 = `<!-- ctrcks.com/v1: tracked -->
The very lazy brown dog

[^ct-1]: @alice | 2026-03-20 | ins | proposed
    1:a1 The {++very ++}lazy brown dog

[^ct-2]: @bob | 2026-03-20 | ins | proposed
    1:b1 lazy {++brown ++}dog`;

    const report = traceDependencies(l3, 'ct-1');

    expect(report.dependents).toHaveLength(0);
  });
});
