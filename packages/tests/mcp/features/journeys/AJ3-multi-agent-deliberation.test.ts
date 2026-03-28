import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

const ARCHITECTURE_DOC = `# Architecture

The system uses PostgreSQL for persistence.
Authentication is handled via JWT tokens.
The API is a monolith deployed on a single server.`;

describe('AJ3: Multi-agent deliberation', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      settlement: { auto_on_approve: true, auto_on_reject: true },
      author: { default: 'ai:architect', enforcement: 'optional' },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 1: Three agents propose and cross-review
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 1: Three agents propose and cross-review', async () => {
    const filePath = await ctx.createFile('architecture.md', ARCHITECTURE_DOC);

    // ── Phase 1: Agent A (ai:architect) proposes a substitution ──────
    const propose1 = await ctx.propose(filePath, {
      old_text: 'PostgreSQL',
      new_text: 'CockroachDB',
      reason: 'Need horizontal scaling',
      author: 'ai:architect',
    });
    expect(propose1.isError).toBeUndefined();
    const proposeData = ctx.parseResult(propose1);
    expect(proposeData.change_id).toBe('cn-1');
    expect(proposeData.type).toBe('sub');

    // Verify cn-1 on disk with architect as author
    const disk1 = await ctx.readDisk(filePath);
    expect(disk1).toContain('{~~PostgreSQL~>CockroachDB~~}');
    expect(disk1).toContain('@ai:architect');
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'proposed');

    // ── Phase 2: Agent B (ai:security) responds with concern ─────────
    const response1 = await ctx.review(filePath, {
      responses: [{
        change_id: 'cn-1',
        response: 'CockroachDB has different encryption-at-rest defaults. Verify compliance.',
        label: 'issue',
      }],
      author: 'ai:security',
    });
    expect(response1.isError).toBeUndefined();

    const disk2 = await ctx.readDisk(filePath);
    expect(disk2).toContain('CockroachDB has different encryption-at-rest defaults');
    expect(disk2).toContain('@ai:security');
    expect(disk2).toContain('issue');

    // ── Phase 3: Agent C (ai:performance) responds with data ─────────
    const response2 = await ctx.review(filePath, {
      responses: [{
        change_id: 'cn-1',
        response: 'Benchmarks show 2x latency for cross-region queries. Consider the trade-off.',
        label: 'thought',
      }],
      author: 'ai:performance',
    });
    expect(response2.isError).toBeUndefined();

    const disk3 = await ctx.readDisk(filePath);
    expect(disk3).toContain('Benchmarks show 2x latency');
    expect(disk3).toContain('@ai:performance');
    expect(disk3).toContain('thought');

    // Footnote has 3 entries: original reasoning + 2 responses
    // All three agent identities present in file
    expect(disk3).toContain('@ai:architect');
    expect(disk3).toContain('@ai:security');
    expect(disk3).toContain('@ai:performance');

    // ── Phase 4: Cross-author amendment blocked ──────────────────────
    // Agent B (ai:security) cannot amend Agent A's proposal
    const badAmend = await ctx.amend(filePath, 'cn-1', {
      new_text: 'MySQL',
      reason: 'I prefer MySQL',
      author: 'ai:security',
    });
    expect(badAmend.isError).toBe(true);
    const errorText = ctx.resultText(badAmend);
    expect(errorText).toContain('not the original author');
    expect(errorText).toContain('ai:security');

    // File unchanged after failed amend
    const disk4 = await ctx.readDisk(filePath);
    expect(disk4).toContain('{~~PostgreSQL~>CockroachDB~~}');
    expect(disk4).not.toContain('MySQL');

    // ── Phase 5: Original author amends based on feedback (supersede) ─
    const amendResult = await ctx.amend(filePath, 'cn-1', {
      new_text: 'CockroachDB with encryption-at-rest enabled',
      reason: 'Addressed security concern: enable encryption-at-rest',
      author: 'ai:architect',
    });
    expect(amendResult.isError).toBeUndefined();

    const amendData = ctx.parseResult(amendResult);
    expect(amendData.change_id).toBe('cn-1');
    expect(amendData.new_change_id).toBeDefined();
    expect(amendData.amended).toBe(true);
    const newChangeId = amendData.new_change_id as string;

    const disk5 = await ctx.readDisk(filePath);
    expect(disk5).toContain('{~~PostgreSQL~>CockroachDB with encryption-at-rest enabled~~}');
    // Original cn-1 rejected with superseded-by cross-reference
    expect(disk5).toContain(`superseded-by: ${newChangeId}`);
    expect(disk5).toContain('supersedes: cn-1');

    // ── Phase 6: get_change on the NEW change to verify it exists ────
    // (Must check before approval triggers auto-settlement which removes inline markup)
    // The original cn-1 footnote preserves the discussion thread from all agents
    const getResultOrig = await ctx.getChange(filePath, 'cn-1');
    expect(getResultOrig.isError).toBeUndefined();
    const origData = ctx.parseResult(getResultOrig);
    const origParticipants = origData.participants as string[];
    expect(origParticipants).toContain('@ai:architect');
    expect(origParticipants).toContain('@ai:security');
    expect(origParticipants).toContain('@ai:performance');

    // ── Phase 7: Agent B approves, Agent C approves the NEW change ───
    const approve1 = await ctx.review(filePath, {
      reviews: [{ change_id: newChangeId, decision: 'approve', reason: 'Encryption concern addressed' }],
      author: 'ai:security',
    });
    expect(approve1.isError).toBeUndefined();

    // Auto-settlement fires on first approve; second approve targets already-accepted footnote
    const approve2 = await ctx.review(filePath, {
      reviews: [{ change_id: newChangeId, decision: 'approve', reason: 'Latency acceptable with encryption trade-off' }],
      author: 'ai:performance',
    });
    // Second approve on an already-accepted change: check that the call itself
    // does not crash (it records the approval in footnote regardless)
    expect(approve2.isError).toBeUndefined();

    // Verify final state: new change accepted, inline markup settled
    await ctx.assertFootnoteStatus(filePath, newChangeId, 'accepted');

    // Body contains the amended text with no markup delimiters
    await ctx.assertNoMarkupInBody(filePath);
    const disk6 = await ctx.readDisk(filePath);
    expect(disk6).toContain('CockroachDB with encryption-at-rest enabled');

    // Original cn-1 footnote preserves all three agent identities in the thread
    expect(disk6).toContain('@ai:architect');
    expect(disk6).toContain('@ai:security');
    expect(disk6).toContain('@ai:performance');
    // New change footnote contains approval entries
    expect(disk6).toContain('approved:');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 2: Competing proposals -- one accepted, one rejected
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 2: Competing proposals on different text regions', async () => {
    const filePath = await ctx.createFile('architecture.md', ARCHITECTURE_DOC);

    // Agent A proposes cn-1: substitute "PostgreSQL" -> "CockroachDB"
    const propose1 = await ctx.propose(filePath, {
      old_text: 'PostgreSQL',
      new_text: 'CockroachDB',
      reason: 'Need horizontal scaling',
      author: 'ai:architect',
    });
    expect(propose1.isError).toBeUndefined();
    const data1 = ctx.parseResult(propose1);
    expect(data1.change_id).toBe('cn-1');

    // Agent B proposes cn-2: substitute "JWT tokens" -> "OAuth2 + OIDC"
    const propose2 = await ctx.propose(filePath, {
      old_text: 'JWT tokens',
      new_text: 'OAuth2 + OIDC',
      reason: 'Better security posture with federated identity',
      author: 'ai:security',
    });
    expect(propose2.isError).toBeUndefined();
    const data2 = ctx.parseResult(propose2);
    expect(data2.change_id).toBe('cn-2');

    // Both changes coexist on disk
    const disk1 = await ctx.readDisk(filePath);
    expect(disk1).toContain('{~~PostgreSQL~>CockroachDB~~}');
    expect(disk1).toContain('{~~JWT tokens~>OAuth2 + OIDC~~}');
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'proposed');
    await ctx.assertFootnoteStatus(filePath, 'cn-2', 'proposed');

    // Agent C (ai:performance) reviews both: rejects cn-1, approves cn-2
    const reviewResult = await ctx.review(filePath, {
      reviews: [
        { change_id: 'cn-1', decision: 'reject', reason: 'CockroachDB too slow for our use case' },
        { change_id: 'cn-2', decision: 'approve', reason: 'OAuth2 is industry standard' },
      ],
      author: 'ai:performance',
    });
    expect(reviewResult.isError).toBeUndefined();

    // With auto_on_approve and auto_on_reject, both settle
    const reviewData = ctx.parseResult(reviewResult);
    expect(reviewData.settled).toBeDefined();
    const settledIds = reviewData.settled as string[];
    expect(settledIds).toContain('cn-1');
    expect(settledIds).toContain('cn-2');

    // Statuses
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'rejected');
    await ctx.assertFootnoteStatus(filePath, 'cn-2', 'accepted');

    // Body settled -- no markup delimiters remain
    await ctx.assertNoMarkupInBody(filePath);

    const disk2 = await ctx.readDisk(filePath);

    // Extract document body (before footnotes) for content assertions
    const footnoteStart = disk2.indexOf('\n[^cn-');
    const body = footnoteStart >= 0 ? disk2.slice(0, footnoteStart) : disk2;

    // Rejected change: body has original text restored, no substitution target
    expect(body).toContain('PostgreSQL');
    expect(body).not.toContain('CockroachDB');
    // Accepted change: body has new text applied
    expect(body).toContain('OAuth2 + OIDC');
    expect(body).not.toContain('JWT tokens');

    // Both footnotes preserve their deliberation history (full file)
    expect(disk2).toContain('[^cn-1]:');
    expect(disk2).toContain('[^cn-2]:');
    expect(disk2).toContain('CockroachDB too slow');
    expect(disk2).toContain('OAuth2 is industry standard');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 3: Deep discussion thread (5+ responses)
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 3: Deep discussion thread with 5+ responses', async () => {
    const filePath = await ctx.createFile('architecture.md', ARCHITECTURE_DOC);

    // Agent A proposes a change
    const propose = await ctx.propose(filePath, {
      old_text: 'a monolith deployed on a single server',
      new_text: 'microservices deployed on Kubernetes',
      reason: 'Improve scalability and deployment flexibility',
      author: 'ai:architect',
    });
    expect(propose.isError).toBeUndefined();
    const proposeData = ctx.parseResult(propose);
    expect(proposeData.change_id).toBe('cn-1');

    // Build a deep discussion: 5 responses from alternating agents
    // Labels must be from valid enum: suggestion, issue, question, praise, todo, thought, nitpick
    const threadResponses = [
      { author: 'ai:security', response: 'Microservices increase attack surface. Need service mesh.', label: 'issue' as const },
      { author: 'ai:performance', response: 'Network overhead between services adds 10ms per hop.', label: 'thought' as const },
      { author: 'ai:architect', response: 'Service mesh with mTLS addresses security. Acceptable latency.', label: 'suggestion' as const },
      { author: 'ai:security', response: 'mTLS is good. What about secrets management across services?', label: 'question' as const },
      { author: 'ai:performance', response: 'With connection pooling, latency drops to 2ms per hop. Acceptable.', label: 'thought' as const },
    ];

    for (const entry of threadResponses) {
      const result = await ctx.review(filePath, {
        responses: [{
          change_id: 'cn-1',
          response: entry.response,
          label: entry.label,
        }],
        author: entry.author,
      });
      expect(result.isError).toBeUndefined();
    }

    // ── Verify footnote contains all 5 responses ─────────────────────
    const disk = await ctx.readDisk(filePath);

    // All response texts present in footnote
    expect(disk).toContain('Microservices increase attack surface');
    expect(disk).toContain('Network overhead between services');
    expect(disk).toContain('Service mesh with mTLS addresses security');
    expect(disk).toContain('mTLS is good. What about secrets management');
    expect(disk).toContain('connection pooling, latency drops to 2ms');

    // All agent identities present
    expect(disk).toContain('@ai:architect');
    expect(disk).toContain('@ai:security');
    expect(disk).toContain('@ai:performance');

    // Labels preserved
    expect(disk).toContain('issue');
    expect(disk).toContain('thought');
    expect(disk).toContain('question');
    expect(disk).toContain('suggestion');

    // ── Verify get_change returns correct discussion_count ───────────
    // discussion_count includes the original reasoning + 5 responses = 6
    const getResult = await ctx.getChange(filePath, 'cn-1');
    expect(getResult.isError).toBeUndefined();
    const changeData = ctx.parseResult(getResult);
    expect(changeData.footnote).toBeDefined();
    const footnote = changeData.footnote as { discussion_count: number; approvals: string[] };
    expect(footnote.discussion_count).toBe(6); // 1 reasoning + 5 responses

    // Participants includes all 3 agents (with @ prefix from footnote metadata)
    const participants = changeData.participants as string[];
    expect(participants).toContain('@ai:architect');
    expect(participants).toContain('@ai:security');
    expect(participants).toContain('@ai:performance');
    expect(participants).toHaveLength(3);

    // ── Verify threading indentation in raw footnote ─────────────────
    const getRaw = await ctx.getChange(filePath, 'cn-1', { include_raw_footnote: true });
    expect(getRaw.isError).toBeUndefined();
    const rawData = ctx.parseResult(getRaw);
    const rawFootnote = (rawData.footnote as { raw_text: string }).raw_text;
    // Discussion entries use 4-space indentation for top-level responses
    expect(rawFootnote).toMatch(/^ {4}@ai:(security|performance|architect)/m);
  });
});
