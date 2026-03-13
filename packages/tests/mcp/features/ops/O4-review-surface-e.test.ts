import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

describe('O4: Review changes via Surface E (committed view)', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: false, auto_on_reject: false },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it('Scenario: Committed view shows pending markers', async () => {
    const filePath = await ctx.createFile('doc.md', 'hello world\ngoodbye moon');

    // Create a pending change (substitution)
    await ctx.propose(filePath, {
      old_text: 'hello',
      new_text: 'hi',
      reason: 'informal',
    });

    // Read committed view
    const readResult = await ctx.read(filePath, { view: 'committed' });
    expect(readResult.isError).toBeUndefined();
    const text = ctx.resultText(readResult);

    // Header should indicate 1 pending change
    expect(text).toContain('proposed: 1');

    // Committed view shows original text (pending substitution reverted to old text)
    expect(text).toContain('hello world');
    // Should NOT show the proposed new text in committed view
    expect(text).not.toMatch(/\bhi\b.*world/);
    // Should have a P flag on the line with the pending change (format: N:HHF|content)
    expect(text).toMatch(/P\|/);
  });

  it('Scenario: Identify change from committed view then approve', async () => {
    const filePath = await ctx.createFile('doc.md', 'timeout = 30\nretry = false');

    // Create a pending change
    await ctx.propose(filePath, {
      old_text: 'timeout = 30',
      new_text: 'timeout = 60',
      reason: 'increase for slow networks',
    });

    // Read committed view to see pending change with P flag
    const readResult = await ctx.read(filePath, { view: 'committed' });
    const text = ctx.resultText(readResult);
    expect(text).toMatch(/P\|/);
    // The committed view reverts pending, so we see the original text
    expect(text).toContain('timeout = 30');

    // Use get_change to inspect ct-1 before approving
    const getResult = await ctx.getChange(filePath, 'ct-1');
    expect(getResult.isError).toBeUndefined();
    const changeDetail = ctx.resultText(getResult);
    expect(changeDetail).toContain('ct-1');

    // Approve the identified change
    const reviewResult = await ctx.review(filePath, {
      reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'verified' }],
    });
    expect(reviewResult.isError).toBeUndefined();
    await ctx.assertFootnoteStatus(filePath, 'ct-1', 'accepted');

    // Subsequent committed view should show accepted text with A flag (not P)
    const readAfter = await ctx.read(filePath, { view: 'committed' });
    const textAfter = ctx.resultText(readAfter);
    // Now shows the accepted new text
    expect(textAfter).toContain('timeout = 60');
    // P flag should be gone for the accepted change
    expect(textAfter).toMatch(/A\|/);
    expect(textAfter).toContain('accepted: 1');
  });

  it('Scenario: Auto-settlement fires after approval in committed view flow', async () => {
    // Use auto-settle context
    const ctxAutoSettle = new ScenarioContext({
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: false },
    });
    await ctxAutoSettle.setup();
    try {
      const filePath = await ctxAutoSettle.createFile('doc.md', 'alpha beta gamma');

      await ctxAutoSettle.propose(filePath, {
        old_text: 'beta',
        new_text: 'BETA',
        reason: 'capitalize',
      });

      // Verify markup exists before approval
      const diskBefore = await ctxAutoSettle.readDisk(filePath);
      expect(diskBefore).toContain('{~~');

      // Approve -- auto-settlement should fire
      const reviewResult = await ctxAutoSettle.review(filePath, {
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'good' }],
      });
      expect(reviewResult.isError).toBeUndefined();

      // After auto-settlement: inline markup removed, accepted text applied
      const disk = await ctxAutoSettle.readDisk(filePath);
      expect(disk).toContain('BETA');
      expect(disk).not.toContain('{~~');
      expect(disk).not.toContain('~>');

      // Footnote persists (Layer 1 only -- footnotes not removed)
      expect(disk).toContain('[^ct-1]');
      expect(disk).toContain('accepted');

      // Subsequent reads show clean text at that location
      const readAfter = await ctxAutoSettle.read(filePath, { view: 'committed' });
      const textAfter = ctxAutoSettle.resultText(readAfter);
      expect(textAfter).toContain('BETA');
      // No P flags -- inline markup is settled. Summary still shows 1A because
      // footnote persists (Layer 1 compaction keeps footnotes; only Layer 2 removes them).
      expect(textAfter).not.toMatch(/P\|/);
      expect(textAfter).toContain('accepted: 1');
    } finally {
      await ctxAutoSettle.teardown();
    }
  });
});
