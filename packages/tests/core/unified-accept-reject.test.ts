import { describe, it, expect } from 'vitest';
import {
  computeAccept,
  computeReject,
  computeSettledText,
  ChangeNode,
  ChangeType,
  ChangeStatus,
} from '@changetracks/core/internals';

/**
 * Factory for building L3-shaped ChangeNodes (range === contentRange, no delimiters in body).
 */
function makeL3Node(overrides: Partial<ChangeNode> & { type: ChangeType }): ChangeNode {
  return {
    id: 'ct-1',
    status: ChangeStatus.Proposed,
    range: { start: 10, end: 15 },
    contentRange: { start: 10, end: 15 },
    level: 2,
    anchored: true,
    ...overrides,
  };
}

/**
 * Factory for building L2-shaped ChangeNodes (range wraps delimiters, contentRange is smaller).
 */
function makeL2Node(overrides: Partial<ChangeNode> & { type: ChangeType }): ChangeNode {
  return {
    id: 'ct-1',
    status: ChangeStatus.Proposed,
    range: { start: 0, end: 12 },
    contentRange: { start: 3, end: 8 },
    level: 1,
    anchored: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// L3 accept: body already shows accepted state, so accept is a no-op
// ---------------------------------------------------------------------------
describe('computeAccept with L3 ChangeNode shape (range === contentRange)', () => {
  it('accept insertion: no-op (inserted text already in body)', () => {
    const node = makeL3Node({
      type: ChangeType.Insertion,
      range: { start: 10, end: 15 },
      contentRange: { start: 10, end: 15 },
      modifiedText: 'hello',
    });
    const edit = computeAccept(node);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('');
  });

  it('accept deletion: no-op (deleted text already absent from body)', () => {
    const node = makeL3Node({
      type: ChangeType.Deletion,
      range: { start: 10, end: 10 },
      contentRange: { start: 10, end: 10 },
      originalText: 'deleted',
    });
    const edit = computeAccept(node);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('');
  });

  it('accept substitution: no-op (modified text already in body)', () => {
    const node = makeL3Node({
      type: ChangeType.Substitution,
      range: { start: 10, end: 20 },
      contentRange: { start: 10, end: 20 },
      originalText: 'old text',
      modifiedText: 'new text!!',
    });
    const edit = computeAccept(node);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('');
  });

  it('accept highlight: no-op (text already in body)', () => {
    const node = makeL3Node({
      type: ChangeType.Highlight,
      range: { start: 10, end: 17 },
      contentRange: { start: 10, end: 17 },
      originalText: 'notable',
    });
    const edit = computeAccept(node);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('');
  });

  it('accept comment: no-op (comments not in body for L3)', () => {
    const node = makeL3Node({
      type: ChangeType.Comment,
      range: { start: 10, end: 10 },
      contentRange: { start: 10, end: 10 },
    });
    const edit = computeAccept(node);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('');
  });
});

// ---------------------------------------------------------------------------
// L3 reject: must revert body to pre-change state
// ---------------------------------------------------------------------------
describe('computeReject with L3 ChangeNode shape (range === contentRange)', () => {
  it('reject insertion: removes inserted text from body', () => {
    const node = makeL3Node({
      type: ChangeType.Insertion,
      range: { start: 10, end: 15 },
      contentRange: { start: 10, end: 15 },
      modifiedText: 'hello',
    });
    const edit = computeReject(node);
    expect(edit.offset).toBe(10);
    expect(edit.length).toBe(5);
    expect(edit.newText).toBe('');
  });

  it('reject deletion: restores deleted text at zero-width anchor point', () => {
    const node = makeL3Node({
      type: ChangeType.Deletion,
      range: { start: 10, end: 10 },
      contentRange: { start: 10, end: 10 },
      originalText: 'deleted',
    });
    const edit = computeReject(node);
    expect(edit.offset).toBe(10);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('deleted');
  });

  it('reject substitution: replaces modified text with original', () => {
    const node = makeL3Node({
      type: ChangeType.Substitution,
      range: { start: 10, end: 20 },
      contentRange: { start: 10, end: 20 },
      originalText: 'old text',
      modifiedText: 'new text!!',
    });
    const edit = computeReject(node);
    expect(edit.offset).toBe(10);
    expect(edit.length).toBe(10);
    expect(edit.newText).toBe('old text');
  });

  it('reject highlight: no-op (decorative only, no body change)', () => {
    const node = makeL3Node({
      type: ChangeType.Highlight,
      range: { start: 10, end: 17 },
      contentRange: { start: 10, end: 17 },
      originalText: 'notable',
    });
    const edit = computeReject(node);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('');
  });

  it('reject comment: no-op (comments not in body for L3)', () => {
    const node = makeL3Node({
      type: ChangeType.Comment,
      range: { start: 10, end: 10 },
      contentRange: { start: 10, end: 10 },
    });
    const edit = computeReject(node);
    expect(edit.length).toBe(0);
    expect(edit.newText).toBe('');
  });
});

// ---------------------------------------------------------------------------
// L2 backward compatibility: existing behavior must be unchanged
// ---------------------------------------------------------------------------
describe('computeAccept/computeReject with L2 ChangeNode shape (range !== contentRange)', () => {
  it('accept insertion: keeps inserted text with delimiter removal', () => {
    const node = makeL2Node({
      type: ChangeType.Insertion,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      modifiedText: 'hello',
    });
    const edit = computeAccept(node);
    // L2: replaces full range (including delimiters) with content
    expect(edit.offset).toBe(0);
    expect(edit.length).toBe(12);
    expect(edit.newText).toBe('hello');
  });

  it('reject insertion: removes insertion including delimiters', () => {
    const node = makeL2Node({
      type: ChangeType.Insertion,
      range: { start: 0, end: 12 },
      contentRange: { start: 3, end: 8 },
      modifiedText: 'hello',
    });
    const edit = computeReject(node);
    expect(edit.offset).toBe(0);
    expect(edit.length).toBe(12);
    expect(edit.newText).toBe('');
  });

  it('reject deletion: restores original text', () => {
    const node = makeL2Node({
      type: ChangeType.Deletion,
      range: { start: 0, end: 15 },
      contentRange: { start: 3, end: 12 },
      originalText: 'old stuff',
    });
    const edit = computeReject(node);
    expect(edit.offset).toBe(0);
    expect(edit.length).toBe(15);
    expect(edit.newText).toBe('old stuff');
  });

  it('accept substitution: keeps modified text', () => {
    const node = makeL2Node({
      type: ChangeType.Substitution,
      range: { start: 0, end: 20 },
      contentRange: { start: 3, end: 17 },
      originalText: 'old text',
      modifiedText: 'new text here',
    });
    const edit = computeAccept(node);
    expect(edit.offset).toBe(0);
    expect(edit.length).toBe(20);
    expect(edit.newText).toBe('new text here');
  });
});

// ---------------------------------------------------------------------------
// computeSettledText with L3 input
// ---------------------------------------------------------------------------
describe('computeSettledText with L3 format input', () => {
  const l3Doc = [
    '<!-- ctrcks.com/v1: tracked -->',
    '# Doc',
    '',
    'Some text with additions.',
    '',
    '[^ct-1]: @alice | 2026-03-16 | ins | proposed',
    '    3:a3 {++additions++}',
  ].join('\n');

  it('strips footnote block and returns body only', () => {
    const settled = computeSettledText(l3Doc);
    expect(settled).not.toMatch(/\[\^ct-/);
    expect(settled).toContain('Some text with additions.');
  });

  it('settled text ends with single newline', () => {
    const settled = computeSettledText(l3Doc);
    expect(settled.endsWith('\n')).toBe(true);
    expect(settled.endsWith('\n\n')).toBe(false);
  });

  it('preserves body content including frontmatter marker', () => {
    const settled = computeSettledText(l3Doc);
    expect(settled).toContain('# Doc');
    expect(settled).toContain('<!-- ctrcks.com/v1: tracked -->');
  });

  it('L2 documents still use CriticMarkup parser path', () => {
    const l2Doc = 'Hello {++world++} there\n\n[^ct-1]: @alice | 2026-03-16 | ins | proposed';
    const settled = computeSettledText(l2Doc);
    // L2: CriticMarkup is expanded and footnote defs stripped
    expect(settled).toContain('world');
    expect(settled).not.toMatch(/\{\+\+/);
    expect(settled).not.toMatch(/\[\^ct-/);
  });
});
