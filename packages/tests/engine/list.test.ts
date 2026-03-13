import { describe, it, expect } from 'vitest';
import { computeChangeList } from 'changetracks/internals';

describe('computeChangeList', () => {
  it('returns empty array for clean text', () => {
    const result = computeChangeList('Hello world.');
    expect(result).toEqual([]);
  });

  it('lists an insertion with metadata from footnote', () => {
    const content = [
      'Hello {++world++}[^ct-1].',
      '',
      '[^ct-1]: @alice | 2026-02-01 | ins | proposed',
      '    reason: added greeting',
    ].join('\n');
    const result = computeChangeList(content);
    expect(result).toHaveLength(1);
    expect(result[0].change_id).toBe('ct-1');
    expect(result[0].type).toBe('ins');
    expect(result[0].status).toBe('proposed');
    expect(result[0].author).toBe('@alice');
    expect(result[0].line).toBe(1);
    expect(result[0].preview).toBe('world');
  });

  it('shows substitution preview with ~> separator', () => {
    const content = 'Some {~~old text~>new text~~} here.';
    const result = computeChangeList(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('sub');
    expect(result[0].preview).toBe('old text~>new text');
  });

  it('filters by status', () => {
    const content = [
      '{++added++}[^ct-1] and {--removed--}[^ct-2].',
      '',
      '[^ct-1]: @alice | 2026-02-01 | ins | accepted',
      '    reason: good addition',
      '[^ct-2]: @bob | 2026-02-02 | del | proposed',
      '    reason: remove this',
    ].join('\n');
    const accepted = computeChangeList(content, 'accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0].change_id).toBe('ct-1');

    const proposed = computeChangeList(content, 'proposed');
    expect(proposed).toHaveLength(1);
    expect(proposed[0].change_id).toBe('ct-2');

    const rejected = computeChangeList(content, 'rejected');
    expect(rejected).toHaveLength(0);
  });
});
