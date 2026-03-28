import { describe, it, expect } from 'vitest';
import { settleRejectedChanges } from '@changedown/mcp/internals';

describe('settleRejectedChanges', () => {
  it('settles rejected insertion by removing inline markup, preserving footnote ref and definition', () => {
    const input =
      'Hello {++ beautiful ++}[^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | ins | rejected';
    const { settledContent, settledIds } = settleRejectedChanges(input);
    // Rejected insertion: {++ beautiful ++} removed, footnote ref [^cn-1] stays
    expect(settledContent).toBe(
      'Hello [^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | ins | rejected'
    );
    expect(settledIds).toEqual(['cn-1']);
  });

  it('settles rejected deletion by restoring original text, preserving footnote ref and definition', () => {
    const input =
      'Hello {-- beautiful --}[^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | del | rejected';
    const { settledContent, settledIds } = settleRejectedChanges(input);
    // Rejected deletion: original text restored with footnote ref
    expect(settledContent).toBe(
      'Hello  beautiful [^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | del | rejected'
    );
    expect(settledIds).toEqual(['cn-1']);
  });

  it('settles rejected substitution by restoring original text, preserving footnote ref and definition', () => {
    const input =
      'Hello {~~beautiful~>ugly~~}[^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | sub | rejected';
    const { settledContent, settledIds } = settleRejectedChanges(input);
    // Rejected substitution: original text (before ~>) restored with footnote ref
    expect(settledContent).toContain('beautiful[^cn-1]');
    expect(settledContent).not.toContain('ugly');
    expect(settledContent).not.toContain('{~~');
    expect(settledContent).toContain('[^cn-1]:');
    expect(settledIds).toEqual(['cn-1']);
  });

  it('leaves proposed and accepted changes untouched', () => {
    const input = [
      '{++new++}[^cn-1] {--old--}[^cn-2]',
      '',
      '[^cn-1]: @a | 2026-02-11 | ins | proposed',
      '[^cn-2]: @a | 2026-02-11 | del | accepted',
    ].join('\n');
    const { settledContent, settledIds } = settleRejectedChanges(input);
    expect(settledContent).toBe(input);
    expect(settledIds).toEqual([]);
  });

  it('returns empty settledIds when no rejected changes', () => {
    const input = 'No markup here.';
    const { settledContent, settledIds } = settleRejectedChanges(input);
    expect(settledContent).toBe(input);
    expect(settledIds).toEqual([]);
  });

  it('mix of rejected and proposed: only rejected settled', () => {
    const input = [
      'A {++rejected++}[^cn-1] B {++proposed++}[^cn-2] C',
      '',
      '[^cn-1]: @a | 2026-02-11 | ins | rejected',
      '[^cn-2]: @a | 2026-02-11 | ins | proposed',
    ].join('\n');
    const { settledContent, settledIds } = settleRejectedChanges(input);
    expect(settledIds).toEqual(['cn-1']);
    // cn-1 rejected insertion removed, footnote ref kept
    expect(settledContent).toContain('[^cn-1]');
    expect(settledContent).not.toContain('{++rejected++}');
    // cn-2 proposed: untouched
    expect(settledContent).toContain('{++proposed++}[^cn-2]');
    // Both footnote definitions preserved
    expect(settledContent).toContain('[^cn-1]:');
    expect(settledContent).toContain('[^cn-2]:');
  });

  it('mix of rejected and accepted: only rejected settled', () => {
    const input = [
      'A {++accepted++}[^cn-1] B {++rejected++}[^cn-2] C',
      '',
      '[^cn-1]: @a | 2026-02-11 | ins | accepted',
      '[^cn-2]: @a | 2026-02-11 | ins | rejected',
    ].join('\n');
    const { settledContent, settledIds } = settleRejectedChanges(input);
    expect(settledIds).toEqual(['cn-2']);
    // cn-1 accepted: untouched by reject settler
    expect(settledContent).toContain('{++accepted++}[^cn-1]');
    // cn-2 rejected insertion removed, footnote ref kept
    expect(settledContent).toContain('[^cn-2]');
    expect(settledContent).not.toContain('{++rejected++}');
    // Both footnote definitions preserved
    expect(settledContent).toContain('[^cn-1]:');
    expect(settledContent).toContain('[^cn-2]:');
  });

  it('footnotes for settled rejected changes are preserved (Layer 1)', () => {
    const input =
      'X {++y++}[^cn-1] Z\n\n[^cn-1]: @a | 2026-02-11 | ins | rejected\n    reason: no thanks';
    const { settledContent } = settleRejectedChanges(input);
    // Layer 1: footnote definition and inline ref preserved for audit trail
    expect(settledContent).toContain('[^cn-1]:');
    expect(settledContent).toContain('[^cn-1] Z');
    expect(settledContent).not.toContain('{++');
  });
});
