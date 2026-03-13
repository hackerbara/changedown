import { describe, it, expect } from 'vitest';
import { countFootnoteHeadersWithStatus } from '@changetracks/mcp/internals';

describe('countFootnoteHeadersWithStatus', () => {
  it('counts only footnote definition header lines with the given status', () => {
    const content = [
      '[^ct-1]: @a | 2026-02-11 | ins | proposed',
      '[^ct-2]: @a | 2026-02-11 | sub | accepted',
      '[^ct-3]: @a | 2026-02-11 | del | proposed',
    ].join('\n');
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(2);
    expect(countFootnoteHeadersWithStatus(content, 'accepted')).toBe(1);
    expect(countFootnoteHeadersWithStatus(content, 'rejected')).toBe(0);
  });

  it('does not count body text that contains | proposed', () => {
    const content = [
      'Some body line that says | proposed',
      '[^ct-1]: @a | 2026-02-11 | ins | accepted',
      '    discussion: we should keep | proposed as an option',
    ].join('\n');
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(0);
    expect(countFootnoteHeadersWithStatus(content, 'accepted')).toBe(1);
  });

  it('matches dotted ids (ct-N.M)', () => {
    const content = '[^ct-5.1]: @a | 2026-02-11 | del | proposed\n[^ct-5.2]: @a | 2026-02-11 | ins | proposed';
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(2);
  });

  it('returns 0 for empty content', () => {
    expect(countFootnoteHeadersWithStatus('', 'proposed')).toBe(0);
  });
});
