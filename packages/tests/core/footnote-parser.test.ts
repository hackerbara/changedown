import * as assert from 'node:assert';
import { parseFootnotes, type FootnoteInfo } from '@changetracks/core/internals';

describe('parseFootnotes', () => {
  it('returns empty map for content without footnotes', () => {
    const result = parseFootnotes('# Title\nSome text\n');
    assert.strictEqual(result.size, 0);
  });

  it('parses a single footnote definition', () => {
    const content = [
      '# Title',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const result = parseFootnotes(content);
    assert.strictEqual(result.size, 1);

    const fn = result.get('ct-1')!;
    assert.strictEqual(fn.id, 'ct-1');
    assert.strictEqual(fn.author, '@alice');
    assert.strictEqual(fn.date, '2026-02-17');
    assert.strictEqual(fn.type, 'ins');
    assert.strictEqual(fn.status, 'proposed');
    assert.strictEqual(fn.reason, '');
    assert.strictEqual(fn.replyCount, 0);
    assert.strictEqual(fn.startLine, 2);
    assert.strictEqual(fn.endLine, 2);
  });

  it('parses multiple footnotes', () => {
    const content = [
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
      '[^ct-2]: @bob | 2026-02-17 | del | accepted',
      '[^ct-3]: @ai:claude-opus-4.6 | 2026-02-18 | sub | rejected',
    ].join('\n');

    const result = parseFootnotes(content);
    assert.strictEqual(result.size, 3);
    assert.strictEqual(result.get('ct-1')!.status, 'proposed');
    assert.strictEqual(result.get('ct-2')!.status, 'accepted');
    assert.strictEqual(result.get('ct-3')!.status, 'rejected');
    assert.strictEqual(result.get('ct-3')!.author, '@ai:claude-opus-4.6');
  });

  it('parses reason from metadata line', () => {
    const content = [
      '[^ct-1]: @alice | 2026-02-17 | sub | proposed',
      '    reason: spelling fix',
    ].join('\n');

    const result = parseFootnotes(content);
    const fn = result.get('ct-1')!;
    assert.strictEqual(fn.reason, 'spelling fix');
    assert.strictEqual(fn.endLine, 1);
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
    assert.strictEqual(fn.replyCount, 2);
    assert.strictEqual(fn.reason, 'clarity improvement');
    assert.strictEqual(fn.startLine, 0);
    assert.strictEqual(fn.endLine, 3);
  });

  it('handles dotted IDs (ct-N.M)', () => {
    const content = '[^ct-5.2]: @alice | 2026-02-17 | del | proposed';
    const result = parseFootnotes(content);
    assert.strictEqual(result.size, 1);
    assert.strictEqual(result.get('ct-5.2')!.id, 'ct-5.2');
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
    assert.strictEqual(fn.replyCount, 1);
    assert.strictEqual(fn.reason, 'complex change');
  });

  it('stops scanning at non-indented line after footnote', () => {
    const content = [
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
      '    reason: fix',
      'This is regular text, not a footnote continuation.',
      '[^ct-2]: @bob | 2026-02-17 | del | accepted',
    ].join('\n');

    const result = parseFootnotes(content);
    assert.strictEqual(result.size, 2);
    assert.strictEqual(result.get('ct-1')!.endLine, 1);
    assert.strictEqual(result.get('ct-2')!.startLine, 3);
  });
});
