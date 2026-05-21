import { describe, it, expect } from 'vitest';
import { findUniqueEndpointPairWithCascade } from '@changedown/core';

describe('findUniqueEndpointPairWithCascade', () => {
  it('finds one ordered opening/closing pair', () => {
    const text = ['before', 'old opening text', 'middle', 'old closing text', 'after'].join('\n');
    const match = findUniqueEndpointPairWithCascade(text, {
      opening: 'old opening text',
      closing: 'old closing text',
    });
    expect(text.slice(match.start, match.end)).toBe('old opening text\nmiddle\nold closing text');
  });

  it('finds a coherent pair when nearby noise does not match either endpoint', () => {
    const text = ['intro opening', 'noise opening', 'real opening', 'body', 'real closing'].join('\n');
    const match = findUniqueEndpointPairWithCascade(text, {
      opening: 'real opening',
      closing: 'real closing',
    });
    expect(text.slice(match.start, match.end)).toBe('real opening\nbody\nreal closing');
  });

  it('fails when repeated openings can pair with one closing', () => {
    const text = ['opening', 'middle', 'opening', 'closing'].join('\n');
    expect(() => findUniqueEndpointPairWithCascade(text, { opening: 'opening', closing: 'closing' }))
      .toThrow(/ambiguous/i);
  });

  it('fails when overlapping endpoint occurrences make the range ambiguous', () => {
    const text = 'aaa\nZ';
    expect(() => findUniqueEndpointPairWithCascade(text, { opening: 'aa', closing: 'Z' }))
      .toThrow(/ambiguous/i);
  });

  it('fails when endpoint pairs are ambiguous', () => {
    const text = ['open', 'close', 'open', 'close'].join('\n');
    expect(() => findUniqueEndpointPairWithCascade(text, { opening: 'open', closing: 'close' }))
      .toThrow(/ambiguous/i);
  });

  it('uses whitespace-collapsed matching for wrapped anchors', () => {
    const text = ['start alpha beta', 'middle', 'omega gamma end'].join('\n');
    const match = findUniqueEndpointPairWithCascade(text, {
      opening: 'alpha\n beta',
      closing: 'omega   gamma',
    });
    expect(text.slice(match.start, match.end)).toContain('alpha beta');
    expect(text.slice(match.start, match.end)).toContain('omega gamma');
  });

  it('matches endpoint pairs through committed-text projection and expands to markup constructs', () => {
    const text = [
      '{~~old opening~>new opening~~}[^cn-1]',
      'middle',
      '{~~old closing~>new closing~~}[^cn-2]',
      '',
      '[^cn-1]: @ai:test | 2026-05-16 | sub | proposed',
      '[^cn-2]: @ai:test | 2026-05-16 | sub | proposed',
    ].join('\n');
    const match = findUniqueEndpointPairWithCascade(text, {
      opening: 'old opening',
      closing: 'old closing',
    });
    const raw = text.slice(match.start, match.end);
    expect(raw).toContain('{~~old opening~>new opening~~}[^cn-1]');
    expect(raw).toContain('{~~old closing~>new closing~~}[^cn-2]');
  });

  it('matches endpoint pairs through current-text projection and expands to markup constructs', () => {
    const text = [
      '{~~old opening~>new opening~~}[^cn-1]',
      'middle',
      '{~~old closing~>new closing~~}[^cn-2]',
      '',
      '[^cn-1]: @ai:test | 2026-05-16 | sub | proposed',
      '[^cn-2]: @ai:test | 2026-05-16 | sub | proposed',
    ].join('\n');
    const match = findUniqueEndpointPairWithCascade(text, {
      opening: 'new opening',
      closing: 'new closing',
    });
    const raw = text.slice(match.start, match.end);
    expect(raw).toContain('{~~old opening~>new opening~~}[^cn-1]');
    expect(raw).toContain('{~~old closing~>new closing~~}[^cn-2]');
  });
});
