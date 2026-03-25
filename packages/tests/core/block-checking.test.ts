import { describe, it, expect } from 'vitest';
import { applyReview, DEFAULT_CONFIG } from '@changetracks/core';

function makeDoc(footnoteLines: string[]): string {
  return [
    'Hello world',
    '',
    `[^ct-1]: @alice | 2026-03-15 | ins | proposed`,
    '    3:a1 world',
    ...footnoteLines,
  ].join('\n');
}

describe('block checking on acceptance', () => {
  it('prevents acceptance when unresolved block exists', () => {
    const doc = makeDoc([
      '    request-changes: @carol 2026-03-16 "Missing tests"',
      '    blocked: @carol',
    ]);
    const result = applyReview(doc, 'ct-1', 'approve', 'Looks good', 'bob', DEFAULT_CONFIG);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('blocked');
      expect(result.error).toContain('@carol');
    }
  });

  it('allows acceptance when block is resolved via withdrew', () => {
    const doc = makeDoc([
      '    request-changes: @carol 2026-03-16 "Missing tests"',
      '    blocked: @carol',
      '    withdrew: @carol 2026-03-17 "Tests added"',
    ]);
    const result = applyReview(doc, 'ct-1', 'approve', 'Good now', 'bob', DEFAULT_CONFIG);
    expect('error' in result).toBe(false);
    if ('updatedContent' in result) {
      expect(result.result.status_updated).toBe(true);
    }
  });

  it('allows acceptance when block is resolved via approve from blocker', () => {
    const doc = makeDoc([
      '    request-changes: @carol 2026-03-16 "Missing tests"',
      '    blocked: @carol',
      '    approved: @carol 2026-03-17 "Tests look good"',
    ]);
    const result = applyReview(doc, 'ct-1', 'approve', 'Agreed', 'bob', DEFAULT_CONFIG);
    expect('error' in result).toBe(false);
  });

  it('allows acceptance when no blocks exist', () => {
    const doc = makeDoc([
      '    request-changes: @carol 2026-03-16 "Minor nit"',
      // No blocked: line — not a blocking request-changes
    ]);
    const result = applyReview(doc, 'ct-1', 'approve', 'Fine', 'bob', DEFAULT_CONFIG);
    expect('error' in result).toBe(false);
  });

  it('checks may_review gate', () => {
    const doc = makeDoc([]);
    const config = {
      ...DEFAULT_CONFIG,
      review: { ...DEFAULT_CONFIG.review, may_review: { human: true, agent: false } },
    };
    const result = applyReview(doc, 'ct-1', 'approve', 'OK', 'ai:claude', config);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('cannot review');
    }
  });

  it('checks self_acceptance gate', () => {
    const doc = makeDoc([]);
    const config = {
      ...DEFAULT_CONFIG,
      review: { ...DEFAULT_CONFIG.review, self_acceptance: { human: false, agent: false } },
    };
    const result = applyReview(doc, 'ct-1', 'approve', 'OK', 'alice', config);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('cannot accept their own');
    }
  });
});
