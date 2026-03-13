import { describe, it, expect } from 'vitest';
import { computeSupersedeResult } from '@changetracks/core';

describe('computeSupersedeResult', () => {
  const baseDoc = [
    'Hello {~~old~>new~~}[^ct-1] more text',
    '',
    '[^ct-1]: @alice | 2026-03-09 | sub | proposed',
    '    reason: Initial change',
    '',
  ].join('\n');

  it('rejects original and creates replacement with cross-links', () => {
    const result = computeSupersedeResult(baseDoc, 'ct-1', {
      newText: 'better',
      oldText: 'new',
      reason: 'Improved wording',
      author: '@bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      // Original is rejected
      expect(result.text).toMatch(/ct-1\]:.*\| rejected/);
      // New change exists with new ID
      expect(result.newChangeId).toMatch(/^ct-\d+$/);
      // Cross-references
      expect(result.text).toContain('supersedes: ct-1');
      expect(result.text).toContain(`superseded-by: ${result.newChangeId}`);
      // New change has proposed status
      expect(result.text).toMatch(new RegExp(`\\[\\^${result.newChangeId}\\]:.*\\| proposed`));
      // New change has correct author
      expect(result.text).toMatch(new RegExp(`\\[\\^${result.newChangeId}\\]:.*@bob`));
      // Original change ID is preserved in result
      expect(result.originalChangeId).toBe('ct-1');
    }
  });

  it('allows supersede by same author (no different-author enforcement)', () => {
    const result = computeSupersedeResult(baseDoc, 'ct-1', {
      newText: 'better',
      oldText: 'new',
      reason: 'Fix',
      author: '@alice',
    });
    // Same-author supersede is allowed — use amend_change for same-author edits
    // is a UI guidance concern, not a core validation rule
    expect(result.isError).toBe(false);
  });

  it('rejects supersede of accepted change', () => {
    const acceptedDoc = baseDoc.replace('| proposed', '| accepted');
    const result = computeSupersedeResult(acceptedDoc, 'ct-1', {
      newText: 'better',
      oldText: 'new',
      reason: 'Fix',
      author: '@bob',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('already accepted');
    }
  });

  it('rejects supersede of rejected change', () => {
    const rejectedDoc = baseDoc.replace('| proposed', '| rejected');
    const result = computeSupersedeResult(rejectedDoc, 'ct-1', {
      newText: 'better',
      oldText: 'new',
      reason: 'Fix',
      author: '@bob',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('already rejected');
    }
  });

  it('returns error for nonexistent change ID', () => {
    const result = computeSupersedeResult(baseDoc, 'ct-999', {
      newText: 'better',
      oldText: 'new',
      reason: 'Fix',
      author: '@bob',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('ct-999');
      expect(result.error).toContain('not found');
    }
  });

  it('allocates correct next ID when multiple changes exist', () => {
    const multiDoc = [
      'Hello {++world++}[^ct-1] and {--removed--}[^ct-2] and {~~old~>new~~}[^ct-3] more text',
      '',
      '[^ct-1]: @alice | 2026-03-09 | ins | accepted',
      '',
      '[^ct-2]: @alice | 2026-03-09 | del | accepted',
      '',
      '[^ct-3]: @alice | 2026-03-09 | sub | proposed',
      '    reason: Third change',
      '',
    ].join('\n');

    const result = computeSupersedeResult(multiDoc, 'ct-3', {
      newText: 'better',
      oldText: 'new',
      reason: 'Better wording',
      author: '@bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.newChangeId).toBe('ct-4');
    }
  });

  it('handles insertion as the new change (empty oldText with insertAfter)', () => {
    // After rejection, the original substitution markup is still present (unsettled).
    // The caller provides insertAfter to place the new insertion.
    const insertDoc = [
      'Hello world more text',
      '',
      // Use an insertion-type change that is proposed
      '',
    ].join('\n');
    const insertDocWithChange = [
      'Hello {++extra++}[^ct-1] more text',
      '',
      '[^ct-1]: @alice | 2026-03-09 | ins | proposed',
      '    reason: Added extra',
      '',
    ].join('\n');

    const result = computeSupersedeResult(insertDocWithChange, 'ct-1', {
      newText: 'better extra',
      oldText: '',
      reason: 'Better placement',
      author: '@bob',
      insertAfter: 'Hello',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('supersedes: ct-1');
      expect(result.text).toContain(`superseded-by: ${result.newChangeId}`);
      expect(result.text).toContain('{++better extra++}');
    }
  });

  it('includes rejection reason in the original footnote', () => {
    const result = computeSupersedeResult(baseDoc, 'ct-1', {
      newText: 'better',
      oldText: 'new',
      reason: 'Improved wording',
      author: '@bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      // The rejection line from applyReview should contain the reason
      expect(result.text).toContain('rejected:');
      expect(result.text).toContain('"Improved wording"');
    }
  });

  it('uses default reason when none provided', () => {
    const result = computeSupersedeResult(baseDoc, 'ct-1', {
      newText: 'better',
      oldText: 'new',
      author: '@bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('Superseded by new change');
    }
  });

  it('returns error for malformed footnote header', () => {
    const malformedDoc = [
      'Hello {~~old~>new~~}[^ct-1] more text',
      '',
      '[^ct-1]: malformed header no pipes',
      '',
    ].join('\n');
    const result = computeSupersedeResult(malformedDoc, 'ct-1', {
      newText: 'better',
      oldText: 'new',
      reason: 'Fix',
      author: '@bob',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('Malformed metadata');
    }
  });
});
