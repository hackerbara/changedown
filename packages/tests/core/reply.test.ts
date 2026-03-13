import { describe, it, expect } from 'vitest';
import { computeReplyEdit } from '@changetracks/core';

describe('computeReplyEdit', () => {
  const baseDoc = [
    'Hello {++world++}[^ct-1] more text',
    '',
    '[^ct-1]: @alice | 2026-03-09 | ins | proposed',
    '    reason: Added greeting',
    '',
  ].join('\n');

  it('appends reply to footnote', () => {
    const result = computeReplyEdit(baseDoc, 'ct-1', {
      text: 'Looks good, ship it',
      author: 'bob',
      date: '2026-03-09',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('    @bob 2026-03-09: Looks good, ship it');
    }
  });

  it('includes label when provided', () => {
    const result = computeReplyEdit(baseDoc, 'ct-1', {
      text: 'Consider rewording',
      author: 'bob',
      date: '2026-03-09',
      label: 'suggestion',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('    @bob 2026-03-09 [suggestion]: Consider rewording');
    }
  });

  it('handles multi-line replies with continuation indent', () => {
    const result = computeReplyEdit(baseDoc, 'ct-1', {
      text: 'Two issues:\n1. Naming\n2. Style',
      author: 'bob',
      date: '2026-03-09',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('    @bob 2026-03-09: Two issues:');
      expect(result.text).toContain('      1. Naming');
      expect(result.text).toContain('      2. Style');
    }
  });

  it('returns error for nonexistent change', () => {
    const result = computeReplyEdit(baseDoc, 'ct-999', {
      text: 'Hello',
      author: 'bob',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('ct-999');
    }
  });

  it('inserts reply after existing discussion, before approval', () => {
    const docWithApproval = [
      'Hello {++world++}[^ct-1]',
      '',
      '[^ct-1]: @alice | 2026-03-09 | ins | proposed',
      '    reason: Added greeting',
      '    @carol 2026-03-09: Looks fine',
      '    approved: @dave 2026-03-09 "LGTM"',
      '',
    ].join('\n');

    const result = computeReplyEdit(docWithApproval, 'ct-1', {
      text: 'One more thought',
      author: 'bob',
      date: '2026-03-09',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      const lines = result.text.split('\n');
      const replyIdx = lines.findIndex(l => l.includes('@bob 2026-03-09: One more thought'));
      const approvalIdx = lines.findIndex(l => l.includes('approved:'));
      expect(replyIdx).toBeGreaterThan(-1);
      expect(approvalIdx).toBeGreaterThan(-1);
      // Reply goes before approval
      expect(replyIdx).toBeLessThan(approvalIdx);
    }
  });

  it('uses nowTimestamp when date is not provided', () => {
    const result = computeReplyEdit(baseDoc, 'ct-1', {
      text: 'Auto-dated reply',
      author: 'bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      // Should contain a date in YYYY-MM-DD format
      expect(result.text).toMatch(/@bob \d{4}-\d{2}-\d{2}/);
    }
  });
});
