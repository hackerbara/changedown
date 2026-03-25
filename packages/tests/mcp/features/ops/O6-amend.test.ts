import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

describe('O6: Amend changes', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      settlement: { auto_on_approve: false, auto_on_reject: false },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it('Scenario: Amend substitution with new text (supersede)', async () => {
    // Background: tracked file with proposed substitution ct-1
    const filePath = await ctx.createFile('doc.md', 'The API uses REST for services.');
    await ctx.propose(filePath, {
      old_text: 'REST',
      new_text: 'GraphQL',
      reason: 'flexibility for clients',
    });

    // Verify initial state
    const before = await ctx.readDisk(filePath);
    expect(before).toContain('{~~REST~>GraphQL~~}');

    // Amend with new text — supersedes ct-1
    const result = await ctx.amend(filePath, 'ct-1', {
      new_text: 'gRPC',
      reason: 'gRPC better for internal services',
    });
    expect(result.isError).toBeUndefined();

    const data = ctx.parseResult(result);
    expect(data.change_id).toBe('ct-1');
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);

    const disk = await ctx.readDisk(filePath);
    // New change proposes the amended text
    expect(disk).toContain('{~~REST~>gRPC~~}');
    // Original ct-1 is rejected with superseded-by cross-reference
    expect(disk).toContain('| rejected');
    expect(disk).toContain(`superseded-by: ${data.new_change_id}`);
    // New change has supersedes cross-reference and the reason
    expect(disk).toContain('supersedes: ct-1');
    expect(disk).toContain('gRPC better for internal services');
  });

  it('Scenario: Amend deletion (supersede creates new deletion)', async () => {
    // A proposed deletion: removing " brown"
    const filePath = await ctx.createFile('doc.md', 'The quick brown fox.');
    await ctx.propose(filePath, {
      old_text: ' brown',
      new_text: '',
      reason: 'remove extra word',
    });

    const before = await ctx.readDisk(filePath);
    expect(before).toContain('{-- brown--}');

    // Amend with empty new_text — supersedes ct-1 and creates new deletion
    const result = await ctx.amend(filePath, 'ct-1', {
      reason: 'Updated rationale: consistency across document',
    });
    expect(result.isError).toBeUndefined();

    const data = ctx.parseResult(result);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);

    const disk = await ctx.readDisk(filePath);
    // Original ct-1 rejected, new deletion proposed
    expect(disk).toContain('| rejected');
    expect(disk).toContain('supersedes: ct-1');
    expect(disk).toContain('Updated rationale: consistency across document');
  });

  it('Scenario: Cross-author amendment is rejected', async () => {
    const filePath = await ctx.createFile('doc.md', 'The API uses REST.');
    await ctx.propose(filePath, {
      old_text: 'REST',
      new_text: 'GraphQL',
      reason: 'flexibility',
    });

    // Different author tries to amend
    const result = await ctx.amend(filePath, 'ct-1', {
      new_text: 'gRPC',
      reason: 'I prefer gRPC',
      author: 'ai:other-agent',
    });

    expect(result.isError).toBe(true);
    const errorText = ctx.resultText(result);
    expect(errorText).toContain('not the original author');
    expect(errorText).toContain('ai:other-agent');

    // File unchanged — original markup preserved
    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('{~~REST~>GraphQL~~}');
  });

  it('Scenario: Amending accepted change is rejected', async () => {
    const filePath = await ctx.createFile('doc.md', 'The API uses REST.');
    await ctx.propose(filePath, {
      old_text: 'REST',
      new_text: 'GraphQL',
      reason: 'flexibility',
    });

    // Accept the change (manually update footnote status)
    const content = await ctx.readDisk(filePath);
    const accepted = content.replace('| proposed', '| accepted');
    await ctx.createFile('doc.md', accepted);

    // Try to amend accepted change
    const result = await ctx.amend(filePath, 'ct-1', {
      new_text: 'gRPC',
      reason: 'changed my mind',
    });

    expect(result.isError).toBe(true);
    const errorText = ctx.resultText(result);
    expect(errorText).toContain('already accepted');

    // File unchanged
    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('{~~REST~>GraphQL~~}');
  });

  it('Scenario: Amendment preserves original footnote and creates cross-references', async () => {
    const filePath = await ctx.createFile('doc.md', 'The API uses REST.');
    await ctx.propose(filePath, {
      old_text: 'REST',
      new_text: 'GraphQL',
      reason: 'original reasoning about flexibility',
    });

    // Add a discussion entry via review response
    await ctx.review(filePath, {
      responses: [{ change_id: 'ct-1', response: 'Have you benchmarked this?', label: 'question' }],
      author: 'ai:reviewer',
    });

    const beforeAmend = await ctx.readDisk(filePath);
    expect(beforeAmend).toContain('[^ct-1]');
    expect(beforeAmend).toContain('Have you benchmarked this?');

    // Amend the change — supersedes ct-1
    const result = await ctx.amend(filePath, 'ct-1', {
      new_text: 'gRPC',
      reason: 'benchmarks show gRPC is 3x faster',
    });
    expect(result.isError).toBeUndefined();

    const data = ctx.parseResult(result);
    expect(data.change_id).toBe('ct-1');
    expect(data.new_change_id).toBeDefined();

    const disk = await ctx.readDisk(filePath);
    // Original ct-1 footnote preserved (rejected) with discussion
    expect(disk).toContain('[^ct-1]:');
    expect(disk).toContain('Have you benchmarked this?');
    expect(disk).toContain('original reasoning about flexibility');
    // New change proposes gRPC
    expect(disk).toContain('{~~REST~>gRPC~~}');
    expect(disk).toContain(`[^${data.new_change_id}]`);
    // Cross-references link old and new
    expect(disk).toContain(`superseded-by: ${data.new_change_id}`);
    expect(disk).toContain('supersedes: ct-1');
    expect(disk).toContain('benchmarks show gRPC is 3x faster');
  });
});
