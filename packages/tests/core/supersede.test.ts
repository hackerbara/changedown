import { describe, it, expect, beforeAll } from 'vitest';
import { computeSupersedeResult, initHashline } from '@changedown/core';

beforeAll(async () => { await initHashline(); });

describe('computeSupersedeResult', () => {
  const baseDoc = [
    'Hello {~~old~>new~~}[^cn-1] more text',
    '',
    '[^cn-1]: @alice | 2026-03-09 | sub | proposed',
    '    reason: Initial change',
    '',
  ].join('\n');

  it('rejects original and creates replacement with cross-links', async () => {
    const result = await computeSupersedeResult(baseDoc, 'cn-1', {
      newText: 'better',
      oldText: 'old',  // body is reverted after rejection, so target original text
      reason: 'Improved wording',
      author: '@bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      // Original is rejected
      expect(result.text).toMatch(/cn-1\]:.*\| rejected/);
      // New change exists with new ID
      expect(result.newChangeId).toMatch(/^cn-\d+$/);
      // Cross-references
      expect(result.text).toContain('supersedes: cn-1');
      expect(result.text).toContain(`superseded-by: ${result.newChangeId}`);
      // New change has proposed status
      expect(result.text).toMatch(new RegExp(`\\[\\^${result.newChangeId}\\]:.*\\| proposed`));
      // New change has correct author
      expect(result.text).toMatch(new RegExp(`\\[\\^${result.newChangeId}\\]:.*@bob`));
      // Original change ID is preserved in result
      expect(result.originalChangeId).toBe('cn-1');
    }
  });

  it('allows same-author supersede (revision)', async () => {
    const result = await computeSupersedeResult(baseDoc, 'cn-1', {
      newText: 'revised',
      oldText: 'old',
      reason: 'Self-revision',
      author: '@alice',  // same as cn-1 author
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('supersedes: cn-1');
    }
  });

  it('rejects supersede of accepted change', async () => {
    const acceptedDoc = baseDoc.replace('| proposed', '| accepted');
    const result = await computeSupersedeResult(acceptedDoc, 'cn-1', {
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

  it('rejects supersede of rejected change', async () => {
    const rejectedDoc = baseDoc.replace('| proposed', '| rejected');
    const result = await computeSupersedeResult(rejectedDoc, 'cn-1', {
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

  it('returns error for nonexistent change ID', async () => {
    const result = await computeSupersedeResult(baseDoc, 'cn-999', {
      newText: 'better',
      oldText: 'new',
      reason: 'Fix',
      author: '@bob',
    });
    expect(result.isError).toBe(true);
    if (result.isError) {
      expect(result.error).toContain('cn-999');
      expect(result.error).toContain('not found');
    }
  });

  it('allocates correct next ID when multiple changes exist', async () => {
    const multiDoc = [
      'Hello {++world++}[^cn-1] and {--removed--}[^cn-2] and {~~old~>new~~}[^cn-3] more text',
      '',
      '[^cn-1]: @alice | 2026-03-09 | ins | accepted',
      '',
      '[^cn-2]: @alice | 2026-03-09 | del | accepted',
      '',
      '[^cn-3]: @alice | 2026-03-09 | sub | proposed',
      '    reason: Third change',
      '',
    ].join('\n');

    const result = await computeSupersedeResult(multiDoc, 'cn-3', {
      newText: 'better',
      oldText: 'old',  // body is reverted after rejection, so target original text
      reason: 'Better wording',
      author: '@bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.newChangeId).toBe('cn-4');
    }
  });

  it('handles insertion as the new change (empty oldText with insertAfter)', async () => {
    // After rejection, the original substitution markup is still present (unsettled).
    // The caller provides insertAfter to place the new insertion.
    const insertDocWithChange = [
      'Hello {++extra++}[^cn-1] more text',
      '',
      '[^cn-1]: @alice | 2026-03-09 | ins | proposed',
      '    reason: Added extra',
      '',
    ].join('\n');

    const result = await computeSupersedeResult(insertDocWithChange, 'cn-1', {
      newText: 'better extra',
      oldText: '',
      reason: 'Better placement',
      author: '@bob',
      insertAfter: 'Hello',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('supersedes: cn-1');
      expect(result.text).toContain(`superseded-by: ${result.newChangeId}`);
      expect(result.text).toContain('{++better extra++}');
    }
  });

  it('includes rejection reason in the original footnote', async () => {
    const result = await computeSupersedeResult(baseDoc, 'cn-1', {
      newText: 'better',
      oldText: 'old',  // body is reverted after rejection, so target original text
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

  it('uses default reason when none provided', async () => {
    const result = await computeSupersedeResult(baseDoc, 'cn-1', {
      newText: 'better',
      oldText: 'old',  // body is reverted after rejection, so target original text
      author: '@bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      expect(result.text).toContain('Superseded by new change');
    }
  });

  it('returns error for malformed footnote header', async () => {
    const malformedDoc = [
      'Hello {~~old~>new~~}[^cn-1] more text',
      '',
      '[^cn-1]: malformed header no pipes',
      '',
    ].join('\n');
    const result = await computeSupersedeResult(malformedDoc, 'cn-1', {
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

  const l3Doc = [
    'The system uses OAuth2 for authentication.',
    '',
    '[^cn-1]: @alice | 2026-03-15 | sub | proposed',
    '    1:a1 uses {~~basic auth~>OAuth2 for~~}',
    '    @alice 2026-03-15: Modern auth',
  ].join('\n');

  it('supersedes on L3 text with body reversion and L3 propose', async () => {
    const result = await computeSupersedeResult(l3Doc, 'cn-1', {
      newText: 'mTLS',
      oldText: 'basic auth',
      reason: 'Service auth',
      author: '@bob',
    });
    expect(result.isError).toBe(false);
    if (!result.isError) {
      // Body should have the proposed new text (mTLS), not the old substituted text (OAuth2 for)
      const bodyLine = result.text.split('\n')[0];
      expect(bodyLine).toContain('uses mTLS');
      expect(bodyLine).not.toContain('OAuth2 for');
      // The new change's footnote should contain an L3 edit-op with the new substitution
      expect(result.text).toMatch(/^ {4}\d+:[0-9a-f]{2,} .*\{~~basic auth~>mTLS~~\}/m);
      // Cross-references
      expect(result.text).toContain('supersedes: cn-1');
      expect(result.text).toContain(`superseded-by: ${result.newChangeId}`);
    }
  });
});
