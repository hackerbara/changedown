import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

describe('O3: Review changes via Surface B (classic MCP)', () => {
  let ctx: ScenarioContext;
  let filePath: string;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      settlement: { auto_on_approve: false, auto_on_reject: false },
    });
    await ctx.setup();

    // Create file with two proposed changes
    filePath = await ctx.createFile('doc.md', 'The API uses REST.\nAdd caching layer.');
    await ctx.propose(filePath, { old_text: 'REST', new_text: 'GraphQL', reason: 'flexibility' });
    await ctx.propose(filePath, { old_text: '', new_text: 'Enable caching.', insert_after: 'Add caching layer.', reason: 'performance' });
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it('Scenario: Approve a change records decision in footnote', async () => {
    const result = await ctx.review(filePath, {
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'verified' }],
    });
    expect(result.isError).toBeUndefined();

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('approved:');
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');
    // Markup still present (no settlement)
    expect(disk).toContain('{~~');
  });

  it('Scenario: Reject a change records decision in footnote', async () => {
    const result = await ctx.review(filePath, {
      reviews: [{ change_id: 'cn-2', decision: 'reject', reason: 'not needed' }],
    });
    expect(result.isError).toBeUndefined();

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('rejected:');
    await ctx.assertFootnoteStatus(filePath, 'cn-2', 'rejected');
  });

  it('Scenario: Request changes records without changing status', async () => {
    const result = await ctx.review(filePath, {
      reviews: [{ change_id: 'cn-1', decision: 'request_changes', reason: 'needs benchmark data' }],
    });
    expect(result.isError).toBeUndefined();

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('request-changes:');
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'proposed');
  });

  it('Scenario: Review multiple changes atomically', async () => {
    const result = await ctx.review(filePath, {
      reviews: [
        { change_id: 'cn-1', decision: 'approve', reason: 'good' },
        { change_id: 'cn-2', decision: 'reject', reason: 'unnecessary' },
      ],
    });
    expect(result.isError).toBeUndefined();

    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');
    await ctx.assertFootnoteStatus(filePath, 'cn-2', 'rejected');
  });

  it('Scenario: Respond to a change thread', async () => {
    const result = await ctx.review(filePath, {
      responses: [{ change_id: 'cn-1', response: 'Have you benchmarked this?', label: 'question' }],
    });
    expect(result.isError).toBeUndefined();

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('Have you benchmarked this?');
    expect(disk).toContain('question');
  });

  it('Scenario: Mixed reviews and responses in one call', async () => {
    const result = await ctx.review(filePath, {
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'lgtm' }],
      responses: [{ change_id: 'cn-2', response: 'Needs more detail', label: 'suggestion' }],
    });
    expect(result.isError).toBeUndefined();

    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');
    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('Needs more detail');
  });

  it('Scenario: Review nonexistent change_id returns per-change error', async () => {
    const result = await ctx.review(filePath, {
      reviews: [
        { change_id: 'cn-999', decision: 'approve', reason: 'test' },
        { change_id: 'cn-1', decision: 'approve', reason: 'valid' },
      ],
    });
    // Partial success: cn-1 should succeed, cn-999 should error
    const text = ctx.resultText(result);
    expect(text).toContain('cn-999');
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');
  });
});
