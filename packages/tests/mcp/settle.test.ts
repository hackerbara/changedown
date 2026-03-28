import { describe, it, expect } from 'vitest';
import { settleAcceptedChanges } from '@changedown/mcp/internals';

describe('settleAcceptedChanges', () => {
  it('settles single accepted insertion to clean text and returns its id', () => {
    const input =
      'Hello {++beautiful ++}[^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | insertion | accepted';
    const { settledContent, settledIds } = settleAcceptedChanges(input);
    // Layer 1 settlement: removes inline markup, keeps footnote ref and definition
    expect(settledContent).toBe('Hello beautiful [^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | insertion | accepted');
    expect(settledIds).toEqual(['cn-1']);
  });

  it('settles single accepted deletion (text removed)', () => {
    const input =
      'Hello {--ugly --}[^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | deletion | accepted';
    const { settledContent, settledIds } = settleAcceptedChanges(input);
    // Deletion: text removed, footnote ref stays in its position, definition kept
    expect(settledContent).toBe('Hello [^cn-1]world\n\n[^cn-1]: @alice | 2026-02-11 | deletion | accepted');
    expect(settledIds).toEqual(['cn-1']);
  });

  it('settles single accepted substitution (new text kept)', () => {
    const input =
      'Hello {~~old~>new~~}[^cn-1] world\n\n[^cn-1]: @alice | 2026-02-11 | sub | accepted';
    const { settledContent, settledIds } = settleAcceptedChanges(input);
    // Substitution: new text kept with footnote ref and definition
    expect(settledContent).toBe('Hello new[^cn-1] world\n\n[^cn-1]: @alice | 2026-02-11 | sub | accepted');
    expect(settledIds).toEqual(['cn-1']);
  });

  it('mix of accepted and proposed: only accepted settled', () => {
    const input = [
      'Start {++accepted ++}[^cn-1]{++proposed ++}[^cn-2]end',
      '',
      '[^cn-1]: @a | 2026-02-11 | ins | accepted',
      '[^cn-2]: @a | 2026-02-11 | ins | proposed',
    ].join('\n');
    const { settledContent, settledIds } = settleAcceptedChanges(input);
    expect(settledIds).toEqual(['cn-1']);
    expect(settledContent).toContain('accepted [^cn-1]'); // Accepted: markup removed, ref kept
    expect(settledContent).toContain('{++proposed ++}[^cn-2]'); // Proposed: untouched
    expect(settledContent).toContain('[^cn-1]:'); // Both footnotes kept
    expect(settledContent).toContain('[^cn-2]:');
  });

  it('mix of accepted and rejected: only accepted settled', () => {
    const input = [
      'A {++yes++}[^cn-1] B {++no++}[^cn-2] C',
      '',
      '[^cn-1]: @a | 2026-02-11 | ins | accepted',
      '[^cn-2]: @a | 2026-02-11 | ins | rejected',
    ].join('\n');
    const { settledContent, settledIds } = settleAcceptedChanges(input);
    expect(settledIds).toEqual(['cn-1']);
    expect(settledContent).toContain('A yes[^cn-1] B {++no++}[^cn-2] C'); // cn-1 settled with ref kept
    expect(settledContent).toContain('[^cn-1]:'); // Both footnotes kept
    expect(settledContent).toContain('[^cn-2]: @a | 2026-02-11 | ins | rejected');
  });

  it('all proposed: no changes', () => {
    const input =
      'Hello {++maybe++}[^cn-1] world\n\n[^cn-1]: @a | 2026-02-11 | ins | proposed';
    const { settledContent, settledIds } = settleAcceptedChanges(input);
    expect(settledIds).toEqual([]);
    expect(settledContent).toBe(input);
  });

  it('footnotes for settled changes PRESERVED (BUG-001 fix)', () => {
    const input =
      'X {++y++}[^cn-1] Z\n\n[^cn-1]: @a | 2026-02-11 | ins | accepted\n    reason: ok';
    const { settledContent } = settleAcceptedChanges(input);
    // BUG-001 fix: Layer 1 settlement preserves footnote ref and definition
    expect(settledContent).toBe('X y[^cn-1] Z\n\n[^cn-1]: @a | 2026-02-11 | ins | accepted\n    reason: ok');
    expect(settledContent).toContain('[^cn-1]:'); // Footnote definition preserved
    expect(settledContent).toContain('[^cn-1] Z'); // Inline ref preserved
  });

  it('footnotes for ALL changes preserved (BUG-001 fix)', () => {
    const input = [
      'A {++b++}[^cn-1] C {++d++}[^cn-2] E',
      '',
      '[^cn-1]: @a | 2026-02-11 | ins | accepted',
      '[^cn-2]: @a | 2026-02-11 | ins | proposed',
    ].join('\n');
    const { settledContent } = settleAcceptedChanges(input);
    // BUG-001 fix: Both footnotes preserved (accepted and proposed)
    expect(settledContent).toContain('[^cn-1]:'); // Accepted footnote kept
    expect(settledContent).toContain('[^cn-2]:'); // Proposed footnote kept
    expect(settledContent).toContain('b[^cn-1]'); // Accepted: markup removed, ref kept
    expect(settledContent).toContain('{++d++}[^cn-2]'); // Proposed: untouched
  });

  it('inline footnote refs for settled changes PRESERVED (BUG-001 fix)', () => {
    const input =
      'Text {++added++}[^cn-1] more\n\n[^cn-1]: @a | 2026-02-11 | ins | accepted';
    const { settledContent } = settleAcceptedChanges(input);
    // BUG-001 fix: Inline refs preserved for audit trail
    expect(settledContent).toBe('Text added[^cn-1] more\n\n[^cn-1]: @a | 2026-02-11 | ins | accepted');
    expect(settledContent).toContain('[^cn-1]'); // Ref preserved
  });

  it('multi-line accepted changes settle correctly with footnote preserved', () => {
    const input = [
      'Line1 {++Line2\nLine3++}[^cn-1] Line4',
      '',
      '[^cn-1]: @a | 2026-02-11 | ins | accepted',
    ].join('\n');
    const { settledContent, settledIds } = settleAcceptedChanges(input);
    expect(settledIds).toEqual(['cn-1']);
    // Multi-line content kept with footnote ref and definition
    expect(settledContent).toBe('Line1 Line2\nLine3[^cn-1] Line4\n\n[^cn-1]: @a | 2026-02-11 | ins | accepted');
  });

  it('accepted substitution whose new text contains CriticMarkup-like characters settles correctly', () => {
    const input =
      'Code {~~old~>new { brace ~~}[^cn-1] end\n\n[^cn-1]: @a | 2026-02-11 | sub | accepted';
    const { settledContent, settledIds } = settleAcceptedChanges(input);
    expect(settledIds).toEqual(['cn-1']);
    expect(settledContent).toContain('new { brace [^cn-1]'); // Text with ref
    expect(settledContent).not.toContain('{~~'); // Markup removed
    expect(settledContent).toContain('[^cn-1]:'); // Footnote preserved
  });

  it('sequential propose-accept cycles on same line produce no ghost text', () => {
    // Cycle 1: propose substitution, then settle
    const cycle1Input = [
      'The system uses {~~256 bits for ECDSA~>256-bit ECDSA~~}[^cn-1] key generation.',
      '',
      '[^cn-1]: @ai:test | 2026-02-27 | sub | accepted',
    ].join('\n');

    const cycle1 = settleAcceptedChanges(cycle1Input);
    expect(cycle1.settledContent).toContain('256-bit ECDSA');
    // Count occurrences of '256-bit ECDSA' — should be exactly 1
    const matches1 = cycle1.settledContent.match(/256-bit ECDSA/g);
    expect(matches1?.length).toBe(1);

    // Cycle 2: another edit on the settled text
    // After cycle 1, the text is: "The system uses 256-bit ECDSA[^cn-1] key generation."
    // Now propose another change on the same content
    const postCycle1 = cycle1.settledContent;
    const cycle2Input = postCycle1.replace(
      '256-bit ECDSA[^cn-1] key generation',
      '{~~256-bit ECDSA[^cn-1] key generation~>256-bit ECDSA key derivation~~}[^cn-2]'
    ) + '\n[^cn-2]: @ai:test | 2026-02-27 | sub | accepted';

    const cycle2 = settleAcceptedChanges(cycle2Input);
    // Should contain the new text exactly once, no duplication
    const matches2 = cycle2.settledContent.match(/256-bit ECDSA/g);
    expect(matches2?.length).toBe(1);
    expect(cycle2.settledContent).toContain('256-bit ECDSA key derivation');
    expect(cycle2.settledContent).not.toContain('256-bit ECDSA256-bit ECDSA');
  });
});
