import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

const DESIGN_DOC = `# Auth Design

The API uses basic authentication for all endpoints.`;

describe('AJ2: Amendment negotiation cycle', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      settlement: { auto_on_approve: false, auto_on_reject: false },
      author: { default: 'ai:proposer', enforcement: 'optional' },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 1: Propose -> feedback -> amend -> approve -> settle
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 1: Full negotiation — propose → feedback → amend → approve → settle', async () => {
    const filePath = await ctx.createFile('design.md', DESIGN_DOC);

    // ── Step 1: Agent proposes substitution ───────────────────────────
    const proposeResult = await ctx.propose(filePath, {
      old_text: 'basic authentication',
      new_text: 'OAuth2',
      reason: 'Modern auth standard',
      author: 'ai:proposer',
    });
    expect(proposeResult.isError).toBeUndefined();
    const proposeData = ctx.parseResult(proposeResult);
    expect(proposeData.change_id).toBe('cn-1');
    expect(proposeData.type).toBe('sub');

    // Verify disk: substitution markup present
    const disk1 = await ctx.readDisk(filePath);
    expect(disk1).toContain('{~~basic authentication~>OAuth2~~}');
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'proposed');

    // ── Step 2: Reviewer gives feedback via thread response ──────────
    const feedbackResult = await ctx.review(filePath, {
      responses: [{
        change_id: 'cn-1',
        response: 'OAuth2 is good but we need to specify the grant type. Consider Authorization Code flow.',
        label: 'suggestion',
      }],
      author: 'ai:reviewer',
    });
    expect(feedbackResult.isError).toBeUndefined();

    // Verify footnote has the discussion entry
    const disk2 = await ctx.readDisk(filePath);
    expect(disk2).toContain('OAuth2 is good but we need to specify the grant type');
    expect(disk2).toContain('suggestion');
    expect(disk2).toContain('ai:reviewer');

    // ── Step 3: Original author amends based on feedback (supersede) ──
    const amendResult = await ctx.amend(filePath, 'cn-1', {
      new_text: 'OAuth2 with Authorization Code flow',
      reason: 'Incorporated reviewer suggestion',
      author: 'ai:proposer',
    });
    expect(amendResult.isError).toBeUndefined();

    const amendData = ctx.parseResult(amendResult);
    expect(amendData.change_id).toBe('cn-1');
    expect(amendData.new_change_id).toBeDefined();
    expect(amendData.amended).toBe(true);
    const newChangeId = amendData.new_change_id as string;

    // Verify inline markup updated via supersede
    const disk3 = await ctx.readDisk(filePath);
    expect(disk3).toContain('{~~basic authentication~>OAuth2 with Authorization Code flow~~}');
    // Original cn-1 is rejected, new change proposes the amended text
    expect(disk3).toContain(`superseded-by: ${newChangeId}`);
    expect(disk3).toContain('supersedes: cn-1');
    expect(disk3).toContain('Incorporated reviewer suggestion');
    // New change has its own footnote
    expect(disk3).toContain(`[^${newChangeId}]:`);

    // ── Step 4: Reviewer approves the NEW change (not cn-1) ──────────
    const approveResult = await ctx.review(filePath, {
      reviews: [{
        change_id: newChangeId,
        decision: 'approve',
        reason: 'Looks good with grant type specified',
      }],
      author: 'ai:reviewer',
    });
    expect(approveResult.isError).toBeUndefined();

    // New change status is now accepted
    await ctx.assertFootnoteStatus(filePath, newChangeId, 'accepted');
    const disk4 = await ctx.readDisk(filePath);
    expect(disk4).toContain('approved:');
    expect(disk4).toContain('ai:reviewer');
    expect(disk4).toContain('Looks good with grant type specified');

    // Inline markup still present (no auto-settlement configured)
    expect(disk4).toContain('{~~');

    // ── Step 5: Explicit settle ──────────────────────────────────────
    const settleResult = await ctx.review(filePath, {
      settle: true,
    });
    expect(settleResult.isError).toBeUndefined();

    const settleData = ctx.parseResult(settleResult);
    expect(settleData.settled).toBeDefined();
    const settledIds = settleData.settled as string[];
    expect(settledIds).toContain(newChangeId);

    // Verify clean state
    await ctx.assertNoMarkupInBody(filePath);
    const disk5 = await ctx.readDisk(filePath);
    expect(disk5).toContain('OAuth2 with Authorization Code flow');
    expect(disk5).not.toContain('basic authentication');

    // Original cn-1 footnote preserves deliberation history
    expect(disk5).toContain('[^cn-1]:');
    expect(disk5).toContain('Modern auth standard');                  // original reasoning
    expect(disk5).toContain('OAuth2 is good but we need to specify'); // reviewer feedback
    // New change footnote has amendment reasoning and approval
    expect(disk5).toContain('Incorporated reviewer suggestion');      // amendment reasoning
    expect(disk5).toContain('Looks good with grant type specified');  // approval reasoning
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 2: Multiple amendment rounds before acceptance
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 2: Multiple amendment rounds (2 request_changes + 2 amends)', async () => {
    const filePath = await ctx.createFile('design.md', DESIGN_DOC);

    // ── Propose ──────────────────────────────────────────────────────
    const proposeResult = await ctx.propose(filePath, {
      old_text: 'basic authentication',
      new_text: 'token auth',
      reason: 'Replace basic auth',
      author: 'ai:proposer',
    });
    expect(proposeResult.isError).toBeUndefined();
    const proposeData = ctx.parseResult(proposeResult);
    expect(proposeData.change_id).toBe('cn-1');

    // ── Round 1: Reviewer requests changes ───────────────────────────
    const rc1 = await ctx.review(filePath, {
      reviews: [{
        change_id: 'cn-1',
        decision: 'request_changes',
        reason: 'Token auth is too vague. Specify JWT or opaque tokens.',
      }],
      author: 'ai:reviewer',
    });
    expect(rc1.isError).toBeUndefined();
    // Status stays proposed after request_changes
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'proposed');

    // ── Round 1: Proposer amends (supersede cn-1) ────────────────────
    const amend1 = await ctx.amend(filePath, 'cn-1', {
      new_text: 'JWT authentication',
      reason: 'Specified JWT per reviewer request',
      author: 'ai:proposer',
    });
    expect(amend1.isError).toBeUndefined();
    const amend1Data = ctx.parseResult(amend1);
    expect(amend1Data.new_change_id).toBeDefined();
    expect(amend1Data.amended).toBe(true);
    const round1Id = amend1Data.new_change_id as string;

    const diskR1 = await ctx.readDisk(filePath);
    expect(diskR1).toContain('{~~basic authentication~>JWT authentication~~}');

    // ── Round 2: Reviewer requests changes on the NEW change ─────────
    const rc2 = await ctx.review(filePath, {
      reviews: [{
        change_id: round1Id,
        decision: 'request_changes',
        reason: 'JWT is good but add RS256 signing requirement.',
      }],
      author: 'ai:reviewer',
    });
    expect(rc2.isError).toBeUndefined();
    await ctx.assertFootnoteStatus(filePath, round1Id, 'proposed');

    // ── Round 2: Proposer amends (supersede round1Id) ────────────────
    const amend2 = await ctx.amend(filePath, round1Id, {
      new_text: 'JWT with RS256 signing',
      reason: 'Added RS256 requirement',
      author: 'ai:proposer',
    });
    expect(amend2.isError).toBeUndefined();
    const amend2Data = ctx.parseResult(amend2);
    expect(amend2Data.new_change_id).toBeDefined();
    expect(amend2Data.amended).toBe(true);
    const round2Id = amend2Data.new_change_id as string;

    const diskR2 = await ctx.readDisk(filePath);
    expect(diskR2).toContain('{~~basic authentication~>JWT with RS256 signing~~}');

    // ── Reviewer approves the final change ───────────────────────────
    const approveResult = await ctx.review(filePath, {
      reviews: [{
        change_id: round2Id,
        decision: 'approve',
        reason: 'RS256 requirement is exactly what we need',
      }],
      author: 'ai:reviewer',
    });
    expect(approveResult.isError).toBeUndefined();
    await ctx.assertFootnoteStatus(filePath, round2Id, 'accepted');

    // ── Verify full deliberation history ─────────────────────────────
    const finalDisk = await ctx.readDisk(filePath);

    // Supersede cross-references form a chain: cn-1 -> round1Id -> round2Id
    expect(finalDisk).toContain(`superseded-by: ${round1Id}`);
    expect(finalDisk).toContain(`supersedes: cn-1`);
    expect(finalDisk).toContain(`superseded-by: ${round2Id}`);
    expect(finalDisk).toContain(`supersedes: ${round1Id}`);

    // 2 request-changes entries (on cn-1 and round1Id)
    const rcMatches = finalDisk.match(/request-changes:/g);
    expect(rcMatches).not.toBeNull();
    expect(rcMatches!.length).toBe(2);

    // Final inline text reflects round 2 amendment
    expect(finalDisk).toContain('{~~basic authentication~>JWT with RS256 signing~~}');

    // Approval recorded on the final change
    expect(finalDisk).toContain('approved:');
    expect(finalDisk).toContain('RS256 requirement is exactly what we need');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 3: Rejection then new independent proposal
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 3: Amendment rejected — original author proposes new change instead', async () => {
    const filePath = await ctx.createFile('design.md', DESIGN_DOC);

    // ── Agent A proposes cn-1 ────────────────────────────────────────
    const propose1 = await ctx.propose(filePath, {
      old_text: 'basic authentication',
      new_text: 'API keys',
      reason: 'Simpler than basic auth',
      author: 'ai:proposer',
    });
    expect(propose1.isError).toBeUndefined();
    const data1 = ctx.parseResult(propose1);
    expect(data1.change_id).toBe('cn-1');

    // ── Agent B rejects cn-1 ─────────────────────────────────────────
    const rejectResult = await ctx.review(filePath, {
      reviews: [{
        change_id: 'cn-1',
        decision: 'reject',
        reason: 'Wrong approach entirely — API keys are not secure enough',
      }],
      author: 'ai:reviewer',
    });
    expect(rejectResult.isError).toBeUndefined();
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'rejected');

    // Rejection markup still present (no auto_on_reject)
    const diskAfterReject = await ctx.readDisk(filePath);
    expect(diskAfterReject).toContain('{~~basic authentication~>API keys~~}');
    expect(diskAfterReject).toContain('rejected:');
    expect(diskAfterReject).toContain('Wrong approach entirely');

    // ── Settle rejected change so inline markup is removed ───────────
    // We need to enable auto_on_reject or settle manually.
    // Use settle flag to remove rejected markup so new proposal can target the text.
    // Actually, settleAcceptedChanges only handles accepted changes.
    // For rejected changes, we need to use settleRejectedChanges.
    // The settle flag in review_changes only calls settleAcceptedChanges.
    // So we need auto_on_reject or handle this differently.
    //
    // Since auto_on_reject is false, the rejected markup stays. The proposer
    // proposes a NEW change on DIFFERENT text (since cn-1 markup still wraps "basic authentication").
    // Let's propose on a different part of the same sentence.

    // ── Agent A proposes cn-2 on different text ──────────────────────
    const propose2 = await ctx.propose(filePath, {
      old_text: 'all endpoints',
      new_text: 'all public endpoints with OAuth2 scopes',
      reason: 'Better security model with OAuth2',
      author: 'ai:proposer',
    });
    expect(propose2.isError).toBeUndefined();
    const data2 = ctx.parseResult(propose2);
    expect(data2.change_id).toBe('cn-2');

    // ── Agent B approves cn-2 ────────────────────────────────────────
    const approve2 = await ctx.review(filePath, {
      reviews: [{
        change_id: 'cn-2',
        decision: 'approve',
        reason: 'OAuth2 scopes is the right approach',
      }],
      author: 'ai:reviewer',
    });
    expect(approve2.isError).toBeUndefined();
    await ctx.assertFootnoteStatus(filePath, 'cn-2', 'accepted');

    // ── Verify both footnotes exist with correct statuses ────────────
    const finalDisk = await ctx.readDisk(filePath);

    // cn-1: rejected
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'rejected');
    expect(finalDisk).toContain('[^cn-1]');
    expect(finalDisk).toContain('Wrong approach entirely');

    // cn-2: accepted (independent from cn-1)
    await ctx.assertFootnoteStatus(filePath, 'cn-2', 'accepted');
    expect(finalDisk).toContain('[^cn-2]');
    expect(finalDisk).toContain('OAuth2 scopes is the right approach');

    // Both footnotes coexist in the file
    expect(finalDisk).toContain('[^cn-1]:');
    expect(finalDisk).toContain('[^cn-2]:');
    const footnoteCount = (finalDisk.match(/\[\^cn-\d+\]:/g) ?? []).length;
    expect(footnoteCount).toBe(2);
  });
});
