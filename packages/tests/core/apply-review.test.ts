import { describe, it, expect } from 'vitest';
import { applyReview } from '@changetracks/core';

describe('applyReview (core)', () => {
  const baseDoc = [
    'Hello {++world++}[^ct-1] more text',
    '',
    '[^ct-1]: @alice | 2026-03-09 | ins | proposed',
    '    reason: Added greeting',
    '',
  ].join('\n');

  it('approve changes status to accepted and adds approval line', () => {
    const result = applyReview(baseDoc, 'ct-1', 'approve', 'Clear addition', 'bob');
    expect('error' in result && result.error).toBeFalsy();
    if ('updatedContent' in result) {
      expect(result.updatedContent).toContain('| accepted');
      expect(result.updatedContent).toContain('approved:');
      expect(result.updatedContent).toContain('@bob');
      expect(result.updatedContent).toContain('"Clear addition"');
      expect(result.result.status_updated).toBe(true);
      expect(result.result.decision).toBe('approve');
    }
  });

  it('reject changes status to rejected', () => {
    const result = applyReview(baseDoc, 'ct-1', 'reject', 'Not needed', 'bob');
    expect('error' in result && result.error).toBeFalsy();
    if ('updatedContent' in result) {
      expect(result.updatedContent).toContain('| rejected');
      expect(result.updatedContent).toContain('rejected:');
      expect(result.updatedContent).toContain('"Not needed"');
      expect(result.result.status_updated).toBe(true);
    }
  });

  it('request_changes does not change status', () => {
    const result = applyReview(baseDoc, 'ct-1', 'request_changes', 'Needs work', 'bob');
    expect('error' in result && result.error).toBeFalsy();
    if ('updatedContent' in result) {
      expect(result.updatedContent).toContain('| proposed');
      expect(result.updatedContent).toContain('request-changes:');
      expect(result.updatedContent).toContain('"Needs work"');
      expect(result.result.status_updated).toBe(false);
      expect(result.result.reason).toBe('request_changes_no_status_change');
    }
  });

  it('idempotent: already-accepted change returns no-op', () => {
    const acceptedDoc = baseDoc.replace('| proposed', '| accepted');
    const result = applyReview(acceptedDoc, 'ct-1', 'approve', 'Again', 'bob');
    expect('error' in result && result.error).toBeFalsy();
    if ('updatedContent' in result) {
      expect(result.result.status_updated).toBe(false);
      expect(result.result.reason).toBe('already_accepted');
    }
  });

  it('idempotent: already-rejected change returns no-op', () => {
    const rejectedDoc = baseDoc.replace('| proposed', '| rejected');
    const result = applyReview(rejectedDoc, 'ct-1', 'reject', 'Again', 'bob');
    expect('error' in result && result.error).toBeFalsy();
    if ('updatedContent' in result) {
      expect(result.result.status_updated).toBe(false);
      expect(result.result.reason).toBe('already_rejected');
    }
  });

  it('returns error for unknown change ID', () => {
    const result = applyReview(baseDoc, 'ct-999', 'approve', 'Missing', 'bob');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('ct-999');
      expect(result.error).toContain('not found');
    }
  });

  it('reject overrides prior accepted status', () => {
    const acceptedDoc = baseDoc.replace('| proposed', '| accepted');
    const result = applyReview(acceptedDoc, 'ct-1', 'reject', 'Changed my mind', 'carol');
    expect('error' in result && result.error).toBeFalsy();
    if ('updatedContent' in result) {
      expect(result.updatedContent).toContain('| rejected');
      expect(result.result.status_updated).toBe(true);
    }
  });

  it('auto-promotes L0 bare change before reviewing', () => {
    const bareDoc = 'Hello {++world++} more text\n';
    // The parser assigns ct-1 to the first L0 change
    const result = applyReview(bareDoc, 'ct-1', 'approve', 'Good addition', 'reviewer');
    expect('error' in result && result.error).toBeFalsy();
    if ('updatedContent' in result) {
      expect(result.updatedContent).toContain('[^ct-1]');
      expect(result.updatedContent).toContain('| accepted');
      expect(result.updatedContent).toContain('approved:');
      expect(result.result.status_updated).toBe(true);
    }
  });

  describe('cascade to children', () => {
    const parentChildDoc = [
      'Hello {++world++}[^ct-1] and {++more++}[^ct-1.1] text',
      '',
      '[^ct-1]: @alice | 2026-03-09 | ins | proposed',
      '    reason: Parent change',
      '',
      '[^ct-1.1]: @alice | 2026-03-09 | ins | proposed',
      '    reason: Child change',
      '',
    ].join('\n');

    it('cascades approve to proposed children', () => {
      const result = applyReview(parentChildDoc, 'ct-1', 'approve', 'Accept all', 'bob');
      expect('error' in result && result.error).toBeFalsy();
      if ('updatedContent' in result) {
        // Parent is accepted
        expect(result.updatedContent).toMatch(/\[.ct-1\]:.*\| accepted/);
        // Child is also accepted
        expect(result.updatedContent).toMatch(/\[.ct-1\.1\]:.*\| accepted/);
        expect(result.result.cascaded_children).toEqual(['ct-1.1']);
      }
    });

    it('cascades reject to proposed children', () => {
      const result = applyReview(parentChildDoc, 'ct-1', 'reject', 'Reject all', 'bob');
      expect('error' in result && result.error).toBeFalsy();
      if ('updatedContent' in result) {
        expect(result.updatedContent).toMatch(/\[.ct-1\]:.*\| rejected/);
        expect(result.updatedContent).toMatch(/\[.ct-1\.1\]:.*\| rejected/);
        expect(result.result.cascaded_children).toEqual(['ct-1.1']);
      }
    });

    it('does not cascade to already-accepted children', () => {
      const mixedDoc = parentChildDoc.replace(
        '[^ct-1.1]: @alice | 2026-03-09 | ins | proposed',
        '[^ct-1.1]: @alice | 2026-03-09 | ins | accepted'
      );
      const result = applyReview(mixedDoc, 'ct-1', 'reject', 'Reject parent', 'bob');
      expect('error' in result && result.error).toBeFalsy();
      if ('updatedContent' in result) {
        // Parent is rejected
        expect(result.updatedContent).toMatch(/\[.ct-1\]:.*\| rejected/);
        // Child stays accepted (not cascaded)
        expect(result.updatedContent).toMatch(/\[.ct-1\.1\]:.*\| accepted/);
        expect(result.result.cascaded_children).toBeUndefined();
      }
    });
  });
});
