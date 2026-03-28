import { describe, it, expect } from 'vitest';
import { resolveOverlapWithAuthor } from '@changedown/core';

describe('resolveOverlapWithAuthor', () => {
  it('returns null when no overlaps', () => {
    const text = 'Hello world.';
    const result = resolveOverlapWithAuthor(text, 0, 5, '@ai:opus');
    expect(result).toBeNull();
  });

  it('auto-supersedes same-author overlap', () => {
    const text =
      'The {~~quick~>slow~~}[^cn-1] brown fox.\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | sub | proposed';
    const subStart = text.indexOf('{~~');
    const subEnd = text.indexOf('~~}') + 3;
    const result = resolveOverlapWithAuthor(text, subStart, subEnd - subStart, '@ai:opus');
    expect(result).not.toBeNull();
    expect(result!.supersededIds).toEqual(['cn-1']);
    // Settled content should have the proposed sub rejected and settled (reverted to "quick")
    expect(result!.settledContent).toContain('quick');
    expect(result!.settledContent).not.toContain('{~~');
  });

  it('throws for different-author overlap', () => {
    const text =
      'The {~~quick~>slow~~}[^cn-1] brown fox.\n\n' +
      '[^cn-1]: @ai:sonnet | 2026-01-01 | sub | proposed';
    const subStart = text.indexOf('{~~');
    const subEnd = text.indexOf('~~}') + 3;
    expect(() =>
      resolveOverlapWithAuthor(text, subStart, subEnd - subStart, '@ai:opus'),
    ).toThrow();
  });

  it('throws when no author provided', () => {
    const text =
      'The {~~quick~>slow~~}[^cn-1] brown fox.\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | sub | proposed';
    const subStart = text.indexOf('{~~');
    const subEnd = text.indexOf('~~}') + 3;
    expect(() =>
      resolveOverlapWithAuthor(text, subStart, subEnd - subStart, undefined),
    ).toThrow();
  });

  it('supersedes multiple same-author overlaps', () => {
    const text =
      'A{~~X~>B~~}[^cn-1]C{++D++}[^cn-2]E\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | sub | proposed\n' +
      '[^cn-2]: @ai:opus | 2026-01-01 | ins | proposed';
    const result = resolveOverlapWithAuthor(text, 0, text.indexOf('\n'), '@ai:opus');
    expect(result).not.toBeNull();
    expect(result!.supersededIds).toContain('cn-1');
    expect(result!.supersededIds).toContain('cn-2');
  });

  it('throws for mixed-author overlaps', () => {
    const text =
      'A{~~X~>B~~}[^cn-1]C{++D++}[^cn-2]E\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | sub | proposed\n' +
      '[^cn-2]: @ai:sonnet | 2026-01-01 | ins | proposed';
    expect(() =>
      resolveOverlapWithAuthor(text, 0, text.indexOf('\n'), '@ai:opus'),
    ).toThrow();
  });

  it('returns settled content without footnote definitions for superseded ids', () => {
    const text =
      'Hello {++world++}[^cn-1] there.\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | ins | proposed';
    const insStart = text.indexOf('{++');
    const insEnd = text.indexOf('++}') + 3;
    const result = resolveOverlapWithAuthor(text, insStart, insEnd - insStart, '@ai:opus');
    expect(result).not.toBeNull();
    // Rejected insertion: text is removed (reverted to nothing)
    expect(result!.settledContent).not.toContain('{++');
    expect(result!.settledContent).not.toContain('world');
    expect(result!.supersededIds).toEqual(['cn-1']);
  });

  it('throws for Level 0 overlap (no footnote = no author = conflict)', () => {
    const text = 'hello {++world++} end';
    // Level 0 markup has no footnote, so author is undefined — always conflicts
    expect(() =>
      resolveOverlapWithAuthor(text, 0, text.length, '@ai:opus'),
    ).toThrow();
  });

  it('handles deletion overlap same-author', () => {
    const text =
      'The {--quick--}[^cn-1] brown fox.\n\n' +
      '[^cn-1]: @ai:opus | 2026-01-01 | del | proposed';
    const delStart = text.indexOf('{--');
    const delEnd = text.indexOf('--}') + 3;
    const result = resolveOverlapWithAuthor(text, delStart, delEnd - delStart, '@ai:opus');
    expect(result).not.toBeNull();
    expect(result!.supersededIds).toEqual(['cn-1']);
    // Rejected deletion: original text is restored
    expect(result!.settledContent).toContain('quick');
    expect(result!.settledContent).not.toContain('{--');
  });
});
