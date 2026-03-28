import { describe, it, expect } from 'vitest';
import { parseFootnotes, type FootnoteInfo } from '@changedown/core/internals';

describe('parseFootnotes', () => {
  it('returns empty map for content without footnotes', () => {
    const result = parseFootnotes('# Title\nSome text\n');
    expect(result.size).toBe(0);
  });

  it('parses a single footnote definition', () => {
    const content = [
      '# Title',
      '',
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const result = parseFootnotes(content);
    expect(result.size).toBe(1);

    const fn = result.get('cn-1')!;
    expect(fn.id).toBe('cn-1');
    expect(fn.author).toBe('@alice');
    expect(fn.date).toBe('2026-02-17');
    expect(fn.type).toBe('ins');
    expect(fn.status).toBe('proposed');
    expect(fn.reason).toBe('');
    expect(fn.replyCount).toBe(0);
    expect(fn.startLine).toBe(2);
    expect(fn.endLine).toBe(2);
  });

  it('parses multiple footnotes', () => {
    const content = [
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
      '[^cn-2]: @bob | 2026-02-17 | del | accepted',
      '[^cn-3]: @ai:claude-opus-4.6 | 2026-02-18 | sub | rejected',
    ].join('\n');

    const result = parseFootnotes(content);
    expect(result.size).toBe(3);
    expect(result.get('cn-1')!.status).toBe('proposed');
    expect(result.get('cn-2')!.status).toBe('accepted');
    expect(result.get('cn-3')!.status).toBe('rejected');
    expect(result.get('cn-3')!.author).toBe('@ai:claude-opus-4.6');
  });

  it('parses reason from metadata line', () => {
    const content = [
      '[^cn-1]: @alice | 2026-02-17 | sub | proposed',
      '    reason: spelling fix',
    ].join('\n');

    const result = parseFootnotes(content);
    const fn = result.get('cn-1')!;
    expect(fn.reason).toBe('spelling fix');
    expect(fn.endLine).toBe(1);
  });

  it('counts thread replies', () => {
    const content = [
      '[^cn-1]: @alice | 2026-02-17 | sub | proposed',
      '    reason: clarity improvement',
      '    @bob 2026-02-17: I think this is correct',
      '    @alice 2026-02-17: Thanks for confirming',
    ].join('\n');

    const result = parseFootnotes(content);
    const fn = result.get('cn-1')!;
    expect(fn.replyCount).toBe(2);
    expect(fn.reason).toBe('clarity improvement');
    expect(fn.startLine).toBe(0);
    expect(fn.endLine).toBe(3);
  });

  it('handles dotted IDs (cn-N.M)', () => {
    const content = '[^cn-5.2]: @alice | 2026-02-17 | del | proposed';
    const result = parseFootnotes(content);
    expect(result.size).toBe(1);
    expect(result.get('cn-5.2')!.id).toBe('cn-5.2');
  });

  it('handles blank lines within footnote continuation', () => {
    const content = [
      '[^cn-1]: @alice | 2026-02-17 | sub | proposed',
      '    reason: complex change',
      '',
      '    @bob 2026-02-18: Looks good',
    ].join('\n');

    const result = parseFootnotes(content);
    const fn = result.get('cn-1')!;
    expect(fn.replyCount).toBe(1);
    expect(fn.reason).toBe('complex change');
  });

  it('only parses footnotes in the terminal block (non-terminal footnotes are skipped)', () => {
    // cn-1 appears before body text — it is NOT in the terminal footnote block.
    // findFootnoteBlockStart scans backward and stops at the body text line,
    // so only cn-2 (after the body text) is parsed.
    const content = [
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
      '    reason: fix',
      'This is regular text, not a footnote continuation.',
      '[^cn-2]: @bob | 2026-02-17 | del | accepted',
    ].join('\n');

    const result = parseFootnotes(content);
    expect(result.size).toBe(1);
    expect(result.get('cn-2')!.startLine).toBe(3);
  });
});
