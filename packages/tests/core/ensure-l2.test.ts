import { describe, it, expect } from 'vitest';
import { ensureL2 } from '@changetracks/core';

describe('ensureL2', () => {
  it('promotes L0 insertion to L2 with footnote', () => {
    const text = 'Hello {++world++} more text';
    const result = ensureL2(text, 6, { author: 'alice', type: 'ins' });
    expect(result.promoted).toBe(true);
    expect(result.changeId).toMatch(/^ct-\d+$/);
    expect(result.text).toContain(`{++world++}[^${result.changeId}]`);
    expect(result.text).toContain(`[^${result.changeId}]: @alice`);
    expect(result.text).toContain('| ins | proposed');
  });

  it('returns text unchanged for L2 change (already has footnote)', () => {
    const text = 'Hello {++world++}[^ct-1] more text\n\n[^ct-1]: @alice | 2026-03-09 | ins | proposed\n    reason: test\n';
    const result = ensureL2(text, 6, { author: 'alice', type: 'ins', existingId: 'ct-1' });
    expect(result.promoted).toBe(false);
    expect(result.changeId).toBe('ct-1');
    expect(result.text).toBe(text);
  });

  it('assigns sequential ct-ID based on existing footnotes', () => {
    const text = 'Hello {++a++}[^ct-1] and {++b++} more\n\n[^ct-1]: @alice | 2026-03-09 | ins | proposed\n    reason: test\n';
    const offset = text.indexOf('{++b++}');
    const result = ensureL2(text, offset, { author: 'bob', type: 'ins' });
    expect(result.changeId).toBe('ct-2');
    expect(result.promoted).toBe(true);
  });

  it('promotes L0 substitution to L2', () => {
    const text = 'Hello {~~old~>new~~} more text';
    const result = ensureL2(text, 6, { author: 'alice', type: 'sub' });
    expect(result.promoted).toBe(true);
    expect(result.text).toContain('{~~old~>new~~}[^');
    expect(result.text).toContain('| sub | proposed');
  });

  it('promotes L0 deletion to L2', () => {
    const text = 'Hello {--removed--} more text';
    const result = ensureL2(text, 6, { author: 'bob', type: 'del' });
    expect(result.promoted).toBe(true);
    expect(result.text).toContain('{--removed--}[^');
    expect(result.text).toContain('| del | proposed');
  });

  it('returns unchanged when no change at offset', () => {
    const text = 'Hello plain text';
    const result = ensureL2(text, 0, { author: 'alice', type: 'ins' });
    expect(result.promoted).toBe(false);
    expect(result.text).toBe(text);
    expect(result.changeId).toBe('');
  });

  it('detects L2 from parse without existingId hint', () => {
    const text = 'Hello {++world++}[^ct-1] more text\n\n[^ct-1]: @alice | 2026-03-09 | ins | proposed\n';
    const result = ensureL2(text, 6, { author: 'alice', type: 'ins' });
    expect(result.promoted).toBe(false);
    expect(result.changeId).toBe('ct-1');
  });

  it('assigns ct-1 when no existing footnotes', () => {
    const text = 'Some {++new++} text';
    const result = ensureL2(text, 5, { author: 'carol', type: 'ins' });
    expect(result.changeId).toBe('ct-1');
    expect(result.promoted).toBe(true);
  });
});
