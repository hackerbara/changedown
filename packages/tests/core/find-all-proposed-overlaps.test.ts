import { describe, it, expect } from 'vitest';
import { findAllProposedOverlaps } from '@changedown/core';

describe('findAllProposedOverlaps', () => {
  it('returns all overlapping proposed changes with authors', () => {
    const text = 'A{~~X~>B~~}[^cn-1]C{++D++}[^cn-2]E\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | sub | proposed\n' +
      '[^cn-2]: @ai:opus | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps).toHaveLength(2);
    expect(overlaps[0]!.changeId).toBe('cn-1');
    expect(overlaps[0]!.author).toBe('@ai:opus');
    expect(overlaps[1]!.changeId).toBe('cn-2');
    expect(overlaps[1]!.author).toBe('@ai:opus');
  });

  it('returns empty array when no overlaps', () => {
    const text = 'Hello world.';
    const overlaps = findAllProposedOverlaps(text, 0, 5);
    expect(overlaps).toHaveLength(0);
  });

  it('ignores accepted/rejected changes', () => {
    const text = 'A{~~X~>B~~}[^cn-1]C{++D++}[^cn-2]E\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | sub | accepted\n' +
      '[^cn-2]: @ai:opus | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.changeId).toBe('cn-2');
  });

  it('resolves author from footnote definition', () => {
    const text = 'Start {++hello++}[^cn-1] end\n\n' +
      '[^cn-1]: @ai:sonnet | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps[0]!.author).toBe('@ai:sonnet');
  });

  it('returns overlaps from different authors', () => {
    const text = 'A{~~X~>B~~}[^cn-1]C{++D++}[^cn-2]E\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | sub | proposed\n' +
      '[^cn-2]: @ai:sonnet | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps).toHaveLength(2);
    expect(overlaps[0]!.author).toBe('@ai:opus');
    expect(overlaps[1]!.author).toBe('@ai:sonnet');
  });

  it('includes group change members', () => {
    const text = '{~~A~>B~~}[^cn-3.1] {++C++}[^cn-3.2]\n\n' +
      '[^cn-3.1]: @ai:opus | 2026-01-01 | sub | proposed\n' +
      '[^cn-3.2]: @ai:opus | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps).toHaveLength(2);
    expect(overlaps.map(o => o.changeId)).toEqual(['cn-3.1', 'cn-3.2']);
  });

  it('returns undefined author for Level 0 markup (no footnote)', () => {
    const text = 'hello {++world++} end';
    const overlaps = findAllProposedOverlaps(text, 0, text.length);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.author).toBeUndefined();
    expect(overlaps[0]!.changeId).toBeUndefined();
  });
});
