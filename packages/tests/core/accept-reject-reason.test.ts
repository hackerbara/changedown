import { describe, it, expect } from 'vitest';
import {
  computeApprovalLineEdit,
  computeFootnoteStatusEdits,
} from '@changedown/core/internals';

/**
 * Helper: build a document with an insertion and a footnote block.
 */
function docWithFootnote(status: string = 'proposed'): string {
  return [
    'Hello {++world++}[^cn-1]',
    '',
    `[^cn-1]: @alice | 2026-03-09 | insertion | ${status}`,
  ].join('\n');
}

// ─── Task 1: Accept/Reject with Reason ──────────────────────────────────────

describe('computeApprovalLineEdit with reason', () => {
  it('appends reason in quotes when provided', () => {
    const doc = docWithFootnote();
    const edit = computeApprovalLineEdit(doc, 'cn-1', 'accepted', {
      author: 'bob',
      date: '2026-03-09',
      reason: 'Clear and well-structured',
    });
    expect(edit).toBeDefined();
    expect(edit!.newText).toContain('approved: @bob 2026-03-09 "Clear and well-structured"');
  });

  it('omits reason when not provided', () => {
    const doc = docWithFootnote();
    const edit = computeApprovalLineEdit(doc, 'cn-1', 'accepted', {
      author: 'bob',
      date: '2026-03-09',
    });
    expect(edit).toBeDefined();
    expect(edit!.newText).toContain('approved: @bob 2026-03-09');
    expect(edit!.newText).not.toContain('"');
  });

  it('appends reason for rejection', () => {
    const doc = docWithFootnote();
    const edit = computeApprovalLineEdit(doc, 'cn-1', 'rejected', {
      author: 'bob',
      date: '2026-03-09',
      reason: 'Duplicates existing content',
    });
    expect(edit).toBeDefined();
    expect(edit!.newText).toContain('rejected: @bob 2026-03-09 "Duplicates existing content"');
  });

  it('treats empty-string reason same as no reason', () => {
    const doc = docWithFootnote();
    const edit = computeApprovalLineEdit(doc, 'cn-1', 'accepted', {
      author: 'bob',
      date: '2026-03-09',
      reason: '',
    });
    expect(edit).toBeDefined();
    expect(edit!.newText).not.toContain('"');
  });

  it('returns null when footnote block is not found', () => {
    const doc = 'Hello {++world++}[^cn-1]\n';
    const edit = computeApprovalLineEdit(doc, 'cn-1', 'accepted', {
      author: 'bob',
    });
    expect(edit).toBeNull();
  });
});

// ─── Task 2: Request-Changes Decision ───────────────────────────────────────

describe('request-changes decision', () => {
  it('appends request-changes line to footnote', () => {
    const doc = docWithFootnote();
    const edit = computeApprovalLineEdit(doc, 'cn-1', 'request-changes', {
      author: 'bob',
      date: '2026-03-09',
      reason: 'Needs rewording in second paragraph',
    });
    expect(edit).toBeDefined();
    expect(edit!.newText).toContain(
      'request-changes: @bob 2026-03-09 "Needs rewording in second paragraph"'
    );
  });

  it('request-changes does not produce status edits', () => {
    const doc = docWithFootnote();
    const edits = computeFootnoteStatusEdits(doc, ['cn-1'], 'request-changes');
    // request-changes should not change footnote status — change stays proposed
    expect(edits).toHaveLength(0);
  });
});
