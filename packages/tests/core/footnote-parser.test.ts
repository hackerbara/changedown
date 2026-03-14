import { describe, it, expect } from 'vitest';
import { parseFootnotes, type FootnoteInfo } from '@changetracks/core/internals';

describe('parseFootnotes', () => {
  it('returns empty map for content without footnotes', () => {
    const result = parseFootnotes('# Title\nSome text\n');
    expect(result.size).toBe(0);
  });

  it('parses a single footnote definition', () => {
    const content = [
      '# Title',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const result = parseFootnotes(content);
    expect(result.size).toBe(1);

    const fn = result.get('ct-1')!;
    expect(fn.id).toBe('ct-1');
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
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
      '[^ct-2]: @bob | 2026-02-17 | del | accepted',
      '[^ct-3]: @ai:claude-opus-4.6 | 2026-02-18 | sub | rejected',
    ].join('\n');

    const result = parseFootnotes(content);
    expect(result.size).toBe(3);
    expect(result.get('ct-1')!.status).toBe('proposed');
    expect(result.get('ct-2')!.status).toBe('accepted');
    expect(result.get('ct-3')!.status).toBe('rejected');
    expect(result.get('ct-3')!.author).toBe('@ai:claude-opus-4.6');
  });

  it('parses reason from metadata line', () => {
    const content = [
      '[^ct-1]: @alice | 2026-02-17 | sub | proposed',
      '    reason: spelling fix',
    ].join('\n');

    const result = parseFootnotes(content);
    const fn = result.get('ct-1')!;
    expect(fn.reason).toBe('spelling fix');
    expect(fn.endLine).toBe(1);
  });

  it('counts thread replies', () => {
    const content = [
      '[^ct-1]: @alice | 2026-02-17 | sub | proposed',
      '    reason: clarity improvement',
      '    @bob 2026-02-17: I think this is correct',
      '    @alice 2026-02-17: Thanks for confirming',
    ].join('\n');

    const result = parseFootnotes(content);
    const fn = result.get('ct-1')!;
    expect(fn.replyCount).toBe(2);
    expect(fn.reason).toBe('clarity improvement');
    expect(fn.startLine).toBe(0);
    expect(fn.endLine).toBe(3);
  });

  it('handles dotted IDs (ct-N.M)', () => {
    const content = '[^ct-5.2]: @alice | 2026-02-17 | del | proposed';
    const result = parseFootnotes(content);
    expect(result.size).toBe(1);
    expect(result.get('ct-5.2')!.id).toBe('ct-5.2');
  });

  it('handles blank lines within footnote continuation', () => {
    const content = [
      '[^ct-1]: @alice | 2026-02-17 | sub | proposed',
      '    reason: complex change',
      '',
      '    @bob 2026-02-18: Looks good',
    ].join('\n');

    const result = parseFootnotes(content);
    const fn = result.get('ct-1')!;
    expect(fn.replyCount).toBe(1);
    expect(fn.reason).toBe('complex change');
  });

  it('stops scanning at non-indented line after footnote', () => {
    const content = [
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
      '    reason: fix',
      'This is regular text, not a footnote continuation.',
      '[^ct-2]: @bob | 2026-02-17 | del | accepted',
    ].join('\n');

    const result = parseFootnotes(content);
    expect(result.size).toBe(2);
    expect(result.get('ct-1')!.endLine).toBe(1);
    expect(result.get('ct-2')!.startLine).toBe(3);
  });
});
