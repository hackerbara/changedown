import { describe, it, expect } from 'vitest';
import { computeSettlement } from 'changetracks/internals';

describe('computeSettlement', () => {
  it('settles an accepted insertion (removes markup, keeps text)', () => {
    const content = [
      'Hello {++world++}[^ct-1].',
      '',
      '[^ct-1]: @alice | 2026-02-01 | ins | accepted',
      '    reason: added greeting',
    ].join('\n');
    const result = computeSettlement(content);
    expect(result.settledCount).toBe(1);
    // After settlement, the inline markup is removed but footnote ref and definition remain (Layer 1)
    expect(result.settledContent).toContain('world');
    expect(result.settledContent).not.toContain('{++');
    expect(result.settledContent).not.toContain('++}');
  });

  it('settles an accepted deletion (removes markup and text)', () => {
    const content = [
      'Hello {--world--}[^ct-1] there.',
      '',
      '[^ct-1]: @alice | 2026-02-01 | del | accepted',
      '    reason: removed word',
    ].join('\n');
    const result = computeSettlement(content);
    expect(result.settledCount).toBe(1);
    expect(result.settledContent).not.toContain('{--');
    expect(result.settledContent).not.toContain('--}');
    // The deleted text "world" is removed; "Hello" and "there" remain
    expect(result.settledContent).toContain('Hello');
    expect(result.settledContent).toContain('there');
  });

  it('leaves proposed changes untouched', () => {
    const content = 'Hello {++world++} there.';
    const result = computeSettlement(content);
    expect(result.settledCount).toBe(0);
    expect(result.settledContent).toBe(content);
  });

  it('returns zero settledCount when no changes exist', () => {
    const content = 'Just plain text.';
    const result = computeSettlement(content);
    expect(result.settledCount).toBe(0);
    expect(result.settledContent).toBe(content);
  });
});
