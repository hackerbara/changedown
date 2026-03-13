import { describe, it, expect } from 'vitest';
import { findAllProposedOverlaps } from '@changetracks/core';

describe('findAllProposedOverlaps', () => {
  it('returns all overlapping proposed changes with authors', () => {
    const text = 'A{~~X~>B~~}[^ct-1]C{++D++}[^ct-2]E\n\n' +
      '[^ct-1]: @ai:opus | 2026-01-01 | sub | proposed\n' +
      '[^ct-2]: @ai:opus | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps).toHaveLength(2);
    expect(overlaps[0]!.changeId).toBe('ct-1');
    expect(overlaps[0]!.author).toBe('@ai:opus');
    expect(overlaps[1]!.changeId).toBe('ct-2');
    expect(overlaps[1]!.author).toBe('@ai:opus');
  });

  it('returns empty array when no overlaps', () => {
    const text = 'Hello world.';
    const overlaps = findAllProposedOverlaps(text, 0, 5);
    expect(overlaps).toHaveLength(0);
  });

  it('ignores accepted/rejected changes', () => {
    const text = 'A{~~X~>B~~}[^ct-1]C{++D++}[^ct-2]E\n\n' +
      '[^ct-1]: @ai:opus | 2026-01-01 | sub | accepted\n' +
      '[^ct-2]: @ai:opus | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.changeId).toBe('ct-2');
  });

  it('resolves author from footnote definition', () => {
    const text = 'Start {++hello++}[^ct-1] end\n\n' +
      '[^ct-1]: @ai:sonnet | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps[0]!.author).toBe('@ai:sonnet');
  });

  it('returns overlaps from different authors', () => {
    const text = 'A{~~X~>B~~}[^ct-1]C{++D++}[^ct-2]E\n\n' +
      '[^ct-1]: @ai:opus | 2026-01-01 | sub | proposed\n' +
      '[^ct-2]: @ai:sonnet | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps).toHaveLength(2);
    expect(overlaps[0]!.author).toBe('@ai:opus');
    expect(overlaps[1]!.author).toBe('@ai:sonnet');
  });

  it('includes group change members', () => {
    const text = '{~~A~>B~~}[^ct-3.1] {++C++}[^ct-3.2]\n\n' +
      '[^ct-3.1]: @ai:opus | 2026-01-01 | sub | proposed\n' +
      '[^ct-3.2]: @ai:opus | 2026-01-01 | ins | proposed';
    const overlaps = findAllProposedOverlaps(text, 0, text.indexOf('\n'));
    expect(overlaps).toHaveLength(2);
    expect(overlaps.map(o => o.changeId)).toEqual(['ct-3.1', 'ct-3.2']);
  });

  it('returns undefined author for Level 0 markup (no footnote)', () => {
    const text = 'hello {++world++} end';
    const overlaps = findAllProposedOverlaps(text, 0, text.length);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.author).toBeUndefined();
    expect(overlaps[0]!.changeId).toBeUndefined();
  });
});
