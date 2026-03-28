import { describe, it, expect } from 'vitest';
import { countFootnoteHeadersWithStatus } from '@changedown/mcp/internals';

describe('countFootnoteHeadersWithStatus', () => {
  it('counts only footnote definition header lines with the given status', () => {
    const content = [
      '[^cn-1]: @a | 2026-02-11 | ins | proposed',
      '[^cn-2]: @a | 2026-02-11 | sub | accepted',
      '[^cn-3]: @a | 2026-02-11 | del | proposed',
    ].join('\n');
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(2);
    expect(countFootnoteHeadersWithStatus(content, 'accepted')).toBe(1);
    expect(countFootnoteHeadersWithStatus(content, 'rejected')).toBe(0);
  });

  it('does not count body text that contains | proposed', () => {
    const content = [
      'Some body line that says | proposed',
      '[^cn-1]: @a | 2026-02-11 | ins | accepted',
      '    discussion: we should keep | proposed as an option',
    ].join('\n');
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(0);
    expect(countFootnoteHeadersWithStatus(content, 'accepted')).toBe(1);
  });

  it('matches dotted ids (cn-N.M)', () => {
    const content = '[^cn-5.1]: @a | 2026-02-11 | del | proposed\n[^cn-5.2]: @a | 2026-02-11 | ins | proposed';
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(2);
  });

  it('returns 0 for empty content', () => {
    expect(countFootnoteHeadersWithStatus('', 'proposed')).toBe(0);
  });
});
