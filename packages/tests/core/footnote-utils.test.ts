import { describe, it, expect } from 'vitest';
import {
  countFootnoteHeadersWithStatus,
  findFootnoteBlock,
  parseFootnoteHeader,
  findDiscussionInsertionIndex,
  findReviewInsertionIndex,
  findChildFootnoteIds,
  resolveChangeById,
} from '@changedown/core/internals';

// ─── countFootnoteHeadersWithStatus ──────────────────────────────────────────

describe('countFootnoteHeadersWithStatus', () => {
  it('counts proposed footnotes', () => {
    const content = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '[^cn-2]: @bob | 2026-01-02 | ins | accepted',
      '[^cn-3]: @carol | 2026-01-03 | del | proposed',
    ].join('\n');
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(2);
  });

  it('counts accepted footnotes', () => {
    const content = [
      '[^cn-1]: @alice | 2026-01-01 | sub | accepted',
      '[^cn-2]: @bob | 2026-01-02 | ins | accepted',
    ].join('\n');
    expect(countFootnoteHeadersWithStatus(content, 'accepted')).toBe(2);
  });

  it('returns 0 when no matches', () => {
    const content = '[^cn-1]: @alice | 2026-01-01 | sub | proposed';
    expect(countFootnoteHeadersWithStatus(content, 'rejected')).toBe(0);
  });

  it('ignores body text containing status words', () => {
    const content = [
      '[^cn-1]: @alice | 2026-01-01 | sub | accepted',
      '    This line says | proposed but is body text',
    ].join('\n');
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(0);
    expect(countFootnoteHeadersWithStatus(content, 'accepted')).toBe(1);
  });

  it('handles dotted IDs', () => {
    const content = '[^cn-1.2]: @alice | 2026-01-01 | ins | proposed';
    expect(countFootnoteHeadersWithStatus(content, 'proposed')).toBe(1);
  });
});

// ─── findFootnoteBlock ───────────────────────────────────────────────────────

describe('findFootnoteBlock', () => {
  it('finds a single-line footnote', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
    ];
    const block = findFootnoteBlock(lines, 'cn-1');
    expect(block).not.toBe(null);
    expect(block!.headerLine).toBe(0);
    expect(block!.blockEnd).toBe(0);
    expect(block!.headerContent).toBe(lines[0]);
  });

  it('finds a multi-line footnote block', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '    reason: fixing typo',
      '    context: "the quik brown fox"',
    ];
    const block = findFootnoteBlock(lines, 'cn-1');
    expect(block).not.toBe(null);
    expect(block!.headerLine).toBe(0);
    expect(block!.blockEnd).toBe(2);
  });

  it('stops at next footnote definition', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '    reason: first',
      '[^cn-2]: @bob | 2026-01-02 | ins | proposed',
      '    reason: second',
    ];
    const block = findFootnoteBlock(lines, 'cn-1');
    expect(block).not.toBe(null);
    expect(block!.blockEnd).toBe(1);
  });

  it('returns null when ID not found', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
    ];
    const block = findFootnoteBlock(lines, 'cn-99');
    expect(block).toBeNull();
  });

  it('tolerates empty lines within a block when more content follows', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '    reason: first',
      '',
      '    @bob 2026-01-02: I agree',
    ];
    const block = findFootnoteBlock(lines, 'cn-1');
    expect(block).not.toBe(null);
    expect(block!.blockEnd).toBe(3);
  });

  it('ends block at trailing empty lines with no more content', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '    reason: first',
      '',
      '',
    ];
    const block = findFootnoteBlock(lines, 'cn-1');
    expect(block).not.toBe(null);
    expect(block!.blockEnd).toBe(1);
  });
});

// ─── parseFootnoteHeader ─────────────────────────────────────────────────────

describe('parseFootnoteHeader', () => {
  it('parses a standard header', () => {
    const header = parseFootnoteHeader('[^cn-1]: @alice | 2026-01-01 | sub | proposed');
    expect(header).not.toBe(null);
    expect(header!.author).toBe('alice');
    expect(header!.date).toBe('2026-01-01');
    expect(header!.type).toBe('sub');
    expect(header!.status).toBe('proposed');
  });

  it('strips @ from author', () => {
    const header = parseFootnoteHeader('[^cn-2]: @ai:claude-opus-4.6 | 2026-01-05 | ins | accepted');
    expect(header).not.toBe(null);
    expect(header!.author).toBe('ai:claude-opus-4.6');
  });

  it('returns null for malformed header (too few parts)', () => {
    const header = parseFootnoteHeader('[^cn-1]: @alice | 2026-01-01');
    expect(header).toBeNull();
  });

  it('returns null for line with no colon', () => {
    const header = parseFootnoteHeader('no colon here');
    expect(header).toBeNull();
  });

  it('handles dotted ID', () => {
    const header = parseFootnoteHeader('[^cn-1.2]: @bob | 2026-01-01 | del | rejected');
    expect(header).not.toBe(null);
    expect(header!.author).toBe('bob');
    expect(header!.status).toBe('rejected');
  });
});

// ─── findDiscussionInsertionIndex ────────────────────────────────────────────

describe('findDiscussionInsertionIndex', () => {
  it('inserts after last discussion line, before approval', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '    reason: typo fix',
      '    @bob 2026-01-02: LGTM',
      '    approved: @carol 2026-01-03',
      '    resolved @dave 2026-01-04: done',
    ];
    const idx = findDiscussionInsertionIndex(lines, 0, 4);
    expect(idx).toBe(2); // after "@bob 2026-01-02: LGTM"
  });

  it('inserts after header when no body lines exist', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
    ];
    const idx = findDiscussionInsertionIndex(lines, 0, 0);
    expect(idx).toBe(0);
  });

  it('inserts at end when no approval/resolution lines', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '    reason: typo',
      '    @bob 2026-01-02: question',
    ];
    const idx = findDiscussionInsertionIndex(lines, 0, 2);
    expect(idx).toBe(2);
  });
});

// ─── findReviewInsertionIndex ────────────────────────────────────────────────

describe('findReviewInsertionIndex', () => {
  it('inserts after discussion and approvals, before resolution', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '    reason: typo fix',
      '    approved: @carol 2026-01-03',
      '    resolved @dave 2026-01-04: done',
    ];
    const idx = findReviewInsertionIndex(lines, 0, 3);
    expect(idx).toBe(2); // after "approved:", before "resolved"
  });

  it('inserts at end when no resolution lines', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '    reason: typo',
      '    approved: @bob 2026-01-02',
    ];
    const idx = findReviewInsertionIndex(lines, 0, 2);
    expect(idx).toBe(2);
  });
});

// ─── findChildFootnoteIds ────────────────────────────────────────────────────

describe('findChildFootnoteIds', () => {
  it('finds children of a parent', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | group | proposed',
      '    group parent',
      '[^cn-1.1]: @alice | 2026-01-01 | del | proposed',
      '[^cn-1.2]: @alice | 2026-01-01 | ins | proposed',
      '[^cn-2]: @bob | 2026-01-02 | sub | proposed',
    ];
    const children = findChildFootnoteIds(lines, 'cn-1');
    expect(children).toStrictEqual(['cn-1.1', 'cn-1.2']);
  });

  it('returns empty array when no children', () => {
    const lines = [
      '[^cn-1]: @alice | 2026-01-01 | sub | proposed',
      '[^cn-2]: @bob | 2026-01-02 | ins | proposed',
    ];
    const children = findChildFootnoteIds(lines, 'cn-1');
    expect(children).toStrictEqual([]);
  });

  it('does not match unrelated IDs', () => {
    const lines = [
      '[^cn-10]: @alice | 2026-01-01 | sub | proposed',
      '[^cn-1.1]: @alice | 2026-01-01 | del | proposed',
    ];
    const children = findChildFootnoteIds(lines, 'cn-10');
    expect(children).toStrictEqual([]);
  });
});

// ─── resolveChangeById ───────────────────────────────────────────────────────

describe('resolveChangeById', () => {
  it('finds a change by footnote block and inline ref', () => {
    const content = 'Hello {++world++}[^cn-1]\n\n[^cn-1]: @alice | 2026-03-04 | ins | proposed';
    const result = resolveChangeById(content, 'cn-1');
    expect(result).toBeTruthy();
    expect(result.footnoteBlock).toBeTruthy();
    expect(result.inlineRefOffset !== null).toBeTruthy();
  });

  it('finds a dotted group member', () => {
    const content = 'A {~~old~>new~~}[^cn-3.2]\n\n[^cn-3.2]: @alice | 2026-03-04 | sub | proposed';
    const result = resolveChangeById(content, 'cn-3.2');
    expect(result).toBeTruthy();
    expect(result.footnoteBlock).toBeTruthy();
  });

  it('returns null for nonexistent ID', () => {
    const content = 'Hello world\n\n[^cn-1]: @alice | 2026-03-04 | ins | proposed';
    const result = resolveChangeById(content, 'cn-999');
    expect(result).toBeNull();
  });

  it('finds footnote even when inline ref is missing (compacted state)', () => {
    const content = 'Hello world\n\n[^cn-1]: @alice | 2026-03-04 | ins | accepted\n    position: 1:a3';
    const result = resolveChangeById(content, 'cn-1');
    expect(result).toBeTruthy();
    expect(result.footnoteBlock).toBeTruthy();
    expect(result.inlineRefOffset).toBeNull();
  });

  it('finds inline ref even when footnote definition is absent', () => {
    const content = 'Hello {++world++}[^cn-1]';
    const result = resolveChangeById(content, 'cn-1');
    expect(result).toBeTruthy();
    expect(result.footnoteBlock).toBeNull();
    expect(result.inlineRefOffset !== null).toBeTruthy();
  });

  it('does not treat a footnote definition line as an inline ref', () => {
    const content = '[^cn-1]: @alice | 2026-03-04 | ins | proposed';
    const result = resolveChangeById(content, 'cn-1');
    // footnoteBlock found, but the [^cn-1] at position 0 is a definition (followed by ':'), not an inline ref
    expect(result).toBeTruthy();
    expect(result.footnoteBlock).toBeTruthy();
    expect(result.inlineRefOffset).toBeNull();
  });

  it('correctly identifies inline ref offset', () => {
    const content = 'Prefix text [^cn-2] suffix\n\n[^cn-2]: @bob | 2026-03-04 | del | proposed';
    const result = resolveChangeById(content, 'cn-2');
    expect(result).toBeTruthy();
    expect(result.inlineRefOffset).toBe(12); // "Prefix text " is 12 chars
  });
});
