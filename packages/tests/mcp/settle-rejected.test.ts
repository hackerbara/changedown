import { describe, it, expect } from 'vitest';
import { settleRejectedChanges } from '@changetracks/mcp/internals';

describe('settleRejectedChanges', () => {
  it('settles rejected insertion by removing inline markup, preserving footnote ref and definition', () => {
    const input =
      'Hello {++ beautiful ++}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | ins | rejected';
    const { settledContent, settledIds } = settleRejectedChanges(input);
    // Rejected insertion: {++ beautiful ++} removed, footnote ref [^ct-1] stays
    expect(settledContent).toBe(
      'Hello [^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | ins | rejected'
    );
    expect(settledIds).toEqual(['ct-1']);
  });

  it('settles rejected deletion by restoring original text, preserving footnote ref and definition', () => {
    const input =
      'Hello {-- beautiful --}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | del | rejected';
    const { settledContent, settledIds } = settleRejectedChanges(input);
    // Rejected deletion: original text restored with footnote ref
    expect(settledContent).toBe(
      'Hello  beautiful [^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | del | rejected'
    );
    expect(settledIds).toEqual(['ct-1']);
  });

  it('settles rejected substitution by restoring original text, preserving footnote ref and definition', () => {
    const input =
      'Hello {~~beautiful~>ugly~~}[^ct-1]world\n\n[^ct-1]: @alice | 2026-02-11 | sub | rejected';
    const { settledContent, settledIds } = settleRejectedChanges(input);
    // Rejected substitution: original text (before ~>) restored with footnote ref
    expect(settledContent).toContain('beautiful[^ct-1]');
    expect(settledContent).not.toContain('ugly');
    expect(settledContent).not.toContain('{~~');
    expect(settledContent).toContain('[^ct-1]:');
    expect(settledIds).toEqual(['ct-1']);
  });

  it('leaves proposed and accepted changes untouched', () => {
    const input = [
      '{++new++}[^ct-1] {--old--}[^ct-2]',
      '',
      '[^ct-1]: @a | 2026-02-11 | ins | proposed',
      '[^ct-2]: @a | 2026-02-11 | del | accepted',
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
      'A {++rejected++}[^ct-1] B {++proposed++}[^ct-2] C',
      '',
      '[^ct-1]: @a | 2026-02-11 | ins | rejected',
      '[^ct-2]: @a | 2026-02-11 | ins | proposed',
    ].join('\n');
    const { settledContent, settledIds } = settleRejectedChanges(input);
    expect(settledIds).toEqual(['ct-1']);
    // ct-1 rejected insertion removed, footnote ref kept
    expect(settledContent).toContain('[^ct-1]');
    expect(settledContent).not.toContain('{++rejected++}');
    // ct-2 proposed: untouched
    expect(settledContent).toContain('{++proposed++}[^ct-2]');
    // Both footnote definitions preserved
    expect(settledContent).toContain('[^ct-1]:');
    expect(settledContent).toContain('[^ct-2]:');
  });

  it('mix of rejected and accepted: only rejected settled', () => {
    const input = [
      'A {++accepted++}[^ct-1] B {++rejected++}[^ct-2] C',
      '',
      '[^ct-1]: @a | 2026-02-11 | ins | accepted',
      '[^ct-2]: @a | 2026-02-11 | ins | rejected',
    ].join('\n');
    const { settledContent, settledIds } = settleRejectedChanges(input);
    expect(settledIds).toEqual(['ct-2']);
    // ct-1 accepted: untouched by reject settler
    expect(settledContent).toContain('{++accepted++}[^ct-1]');
    // ct-2 rejected insertion removed, footnote ref kept
    expect(settledContent).toContain('[^ct-2]');
    expect(settledContent).not.toContain('{++rejected++}');
    // Both footnote definitions preserved
    expect(settledContent).toContain('[^ct-1]:');
    expect(settledContent).toContain('[^ct-2]:');
  });

  it('footnotes for settled rejected changes are preserved (Layer 1)', () => {
    const input =
      'X {++y++}[^ct-1] Z\n\n[^ct-1]: @a | 2026-02-11 | ins | rejected\n    reason: no thanks';
    const { settledContent } = settleRejectedChanges(input);
    // Layer 1: footnote definition and inline ref preserved for audit trail
    expect(settledContent).toContain('[^ct-1]:');
    expect(settledContent).toContain('[^ct-1] Z');
    expect(settledContent).not.toContain('{++');
  });
});
