import { describe, it, expect } from 'vitest';
import {
  computeResolutionEdit,
  computeUnresolveEdit,
} from '@changedown/core';

/**
 * Helper: apply a TextEdit to a string.
 */
function applyEdit(text: string, edit: { offset: number; length: number; newText: string }): string {
  return text.slice(0, edit.offset) + edit.newText + text.slice(edit.offset + edit.length);
}

describe('thread resolution', () => {
  const footnote = [
    'Hello {++world++}[^cn-1]',
    '',
    '[^cn-1]: @alice | 2026-03-09 | insertion | proposed',
    '    reason: Added for clarity',
    '    @bob 2026-03-09: Looks good',
  ].join('\n');

  it('appends resolved line to footnote', () => {
    const edit = computeResolutionEdit(footnote, 'cn-1', { author: '@carol', date: '2026-03-09' });
    expect(edit).toBeDefined();
    expect(edit!.newText).toContain('resolved: @carol 2026-03-09');
  });

  it('resolved line is 4-space indented', () => {
    const edit = computeResolutionEdit(footnote, 'cn-1', { author: '@carol', date: '2026-03-09' });
    expect(edit).toBeDefined();
    expect(edit!.newText).toContain('\n    resolved: @carol 2026-03-09');
  });

  it('appends at end of footnote block', () => {
    const edit = computeResolutionEdit(footnote, 'cn-1', { author: '@carol', date: '2026-03-09' });
    expect(edit).toBeDefined();
    const result = applyEdit(footnote, edit!);
    const lines = result.split('\n');
    // The resolved line should be the last line of the footnote block
    const lastContentLine = lines[lines.length - 1].trim();
    expect(lastContentLine).toBe('resolved: @carol 2026-03-09');
  });

  it('returns null when footnote block is not found', () => {
    const doc = 'Hello {++world++}[^cn-1]\n';
    const edit = computeResolutionEdit(doc, 'cn-1', { author: '@carol', date: '2026-03-09' });
    expect(edit).toBeNull();
  });

  it('strips leading @ from author if present', () => {
    const edit = computeResolutionEdit(footnote, 'cn-1', { author: '@carol', date: '2026-03-09' });
    expect(edit).toBeDefined();
    // Should not double the @
    expect(edit!.newText).toContain('@carol');
    expect(edit!.newText).not.toContain('@@carol');
  });

  it('handles author without @ prefix', () => {
    const edit = computeResolutionEdit(footnote, 'cn-1', { author: 'carol', date: '2026-03-09' });
    expect(edit).toBeDefined();
    expect(edit!.newText).toContain('@carol');
  });

  it('inserts after existing approval lines', () => {
    const withApproval = [
      'Hello {++world++}[^cn-1]',
      '',
      '[^cn-1]: @alice | 2026-03-09 | insertion | proposed',
      '    reason: Added for clarity',
      '    @bob 2026-03-09: Looks good',
      '    approved: @bob 2026-03-09',
    ].join('\n');

    const edit = computeResolutionEdit(withApproval, 'cn-1', { author: '@carol', date: '2026-03-09' });
    expect(edit).toBeDefined();
    const result = applyEdit(withApproval, edit!);
    const lines = result.split('\n');
    // resolved line should be after approved line
    const approvedIdx = lines.findIndex(l => l.trim().startsWith('approved:'));
    const resolvedIdx = lines.findIndex(l => l.trim().startsWith('resolved:'));
    expect(resolvedIdx).toBeGreaterThan(approvedIdx);
  });

  it('works with multi-footnote documents', () => {
    const multi = [
      'Hello {++world++}[^cn-1] and {--gone--}[^cn-2]',
      '',
      '[^cn-1]: @alice | 2026-03-09 | insertion | proposed',
      '    reason: Added for clarity',
      '[^cn-2]: @alice | 2026-03-09 | deletion | proposed',
      '    reason: Removed redundancy',
    ].join('\n');

    const edit = computeResolutionEdit(multi, 'cn-2', { author: '@carol', date: '2026-03-09' });
    expect(edit).toBeDefined();
    const result = applyEdit(multi, edit!);
    // cn-2 block should have the resolved line
    expect(result).toContain('    reason: Removed redundancy\n    resolved: @carol 2026-03-09');
    // cn-1 block should NOT have a resolved line
    const ct1Block = result.split('[^cn-2]:')[0];
    expect(ct1Block).not.toContain('resolved:');
  });
});

describe('unresolve thread', () => {
  const resolvedDoc = [
    'Hello {++world++}[^cn-1]',
    '',
    '[^cn-1]: @alice | 2026-03-09 | insertion | proposed',
    '    reason: Added for clarity',
    '    @bob 2026-03-09: Looks good',
    '    resolved: @carol 2026-03-09',
  ].join('\n');

  it('removes resolved line on unresolve', () => {
    const edit = computeUnresolveEdit(resolvedDoc, 'cn-1');
    expect(edit).toBeDefined();
    const result = applyEdit(resolvedDoc, edit!);
    expect(result).not.toContain('resolved:');
  });

  it('preserves other footnote lines', () => {
    const edit = computeUnresolveEdit(resolvedDoc, 'cn-1');
    expect(edit).toBeDefined();
    const result = applyEdit(resolvedDoc, edit!);
    expect(result).toContain('reason: Added for clarity');
    expect(result).toContain('@bob 2026-03-09: Looks good');
    expect(result).toContain('[^cn-1]: @alice');
  });

  it('returns null when no resolved line exists', () => {
    const noResolved = [
      'Hello {++world++}[^cn-1]',
      '',
      '[^cn-1]: @alice | 2026-03-09 | insertion | proposed',
      '    reason: Added for clarity',
    ].join('\n');
    const edit = computeUnresolveEdit(noResolved, 'cn-1');
    expect(edit).toBeNull();
  });

  it('returns null when footnote block is not found', () => {
    const doc = 'Hello {++world++}[^cn-1]\n';
    const edit = computeUnresolveEdit(doc, 'cn-1');
    expect(edit).toBeNull();
  });

  it('only removes resolved line from correct footnote', () => {
    const multi = [
      'Hello {++world++}[^cn-1] and {--gone--}[^cn-2]',
      '',
      '[^cn-1]: @alice | 2026-03-09 | insertion | proposed',
      '    resolved: @carol 2026-03-09',
      '[^cn-2]: @alice | 2026-03-09 | deletion | proposed',
      '    resolved: @dave 2026-03-09',
    ].join('\n');

    const edit = computeUnresolveEdit(multi, 'cn-1');
    expect(edit).toBeDefined();
    const result = applyEdit(multi, edit!);
    // cn-1 resolved line gone
    const ct1Section = result.split('[^cn-2]:')[0];
    expect(ct1Section).not.toContain('resolved:');
    // cn-2 resolved line preserved
    const ct2Section = result.split('[^cn-2]:')[1];
    expect(ct2Section).toContain('resolved: @dave 2026-03-09');
  });
});
