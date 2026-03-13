import { describe, it, expect } from 'vitest';
import { computeStatus } from 'changetracks/internals';

describe('computeStatus', () => {
  it('returns all zeros for clean text', () => {
    const result = computeStatus('Hello world.');
    expect(result).toEqual({ proposed: 0, accepted: 0, rejected: 0, total: 0 });
  });

  it('counts proposed changes (no footnotes)', () => {
    const content = 'Hello {++world++} and {--goodbye--}.';
    const result = computeStatus(content);
    expect(result.proposed).toBe(2);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.total).toBe(2);
  });

  it('counts mixed accepted and rejected changes via footnotes', () => {
    const content = [
      'Hello {++world++}[^ct-1] and {--goodbye--}[^ct-2].',
      '',
      '[^ct-1]: @alice | 2026-02-01 | ins | accepted',
      '    reason: added greeting',
      '[^ct-2]: @bob | 2026-02-02 | del | rejected',
      '    reason: keep farewell',
    ].join('\n');
    const result = computeStatus(content);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.proposed).toBe(0);
    expect(result.total).toBe(2);
  });

  it('defaults to proposed when no footnote exists for a change', () => {
    // Change with footnote ref but no matching definition
    const content = 'Some {~~old~>new~~} text with {++added++}.';
    const result = computeStatus(content);
    expect(result.proposed).toBe(2);
    expect(result.total).toBe(2);
  });
});
