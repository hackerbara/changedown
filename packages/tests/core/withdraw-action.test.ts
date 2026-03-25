import { describe, it, expect } from 'vitest';
import { applyReview } from '@changetracks/core';

const baseDoc = [
  'Hello world',
  '',
  '[^ct-1]: @alice | 2026-03-15 | ins | proposed',
  '    3:a1 world',
  '    request-changes: @carol 2026-03-16 "Error handling missing"',
  '    blocked: @carol',
].join('\n');

describe('applyReview — withdraw', () => {
  it('appends withdrew: line to footnote', () => {
    const result = applyReview(baseDoc, 'ct-1', 'withdraw', 'Addressed in ct-5', 'carol');
    expect('error' in result).toBe(false);
    if ('updatedContent' in result) {
      expect(result.updatedContent).toContain('withdrew: @carol');
      expect(result.updatedContent).toContain('"Addressed in ct-5"');
    }
  });

  it('does NOT change status', () => {
    const result = applyReview(baseDoc, 'ct-1', 'withdraw', 'Reason', 'carol');
    if ('updatedContent' in result) {
      expect(result.updatedContent).toContain('| proposed');
      expect(result.updatedContent).not.toContain('| accepted');
      expect(result.updatedContent).not.toContain('| rejected');
      expect(result.result.status_updated).toBe(false);
    }
  });

  it('does NOT cascade to children', () => {
    const docWithChildren = baseDoc + '\n\n' +
      '[^ct-1.1]: @alice | 2026-03-15 | ins | proposed\n' +
      '    4:b2 child';
    const result = applyReview(docWithChildren, 'ct-1', 'withdraw', 'Reason', 'carol');
    if ('updatedContent' in result) {
      expect(result.result.cascaded_children).toBeUndefined();
      // Child should still be proposed
      expect(result.updatedContent).toMatch(/\[.ct-1\.1\].*\| proposed/);
    }
  });

  it('accepts withdraw without prior request-changes (forgiving input)', () => {
    const cleanDoc = [
      'Hello world',
      '',
      '[^ct-1]: @alice | 2026-03-15 | ins | proposed',
      '    3:a1 world',
    ].join('\n');
    const result = applyReview(cleanDoc, 'ct-1', 'withdraw', 'No longer needed', 'bob');
    expect('error' in result).toBe(false);
    if ('updatedContent' in result) {
      expect(result.updatedContent).toContain('withdrew: @bob');
    }
  });
});
