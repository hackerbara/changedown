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

  it('Scenario: Amend substitution with new text', async () => {
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

    // Amend with new text
    const result = await ctx.amend(filePath, 'ct-1', {
      new_text: 'gRPC',
      reason: 'gRPC better for internal services',
    });
    expect(result.isError).toBeUndefined();

    const data = ctx.parseResult(result);
    expect(data.change_id).toBe('ct-1');
    expect(data.amended).toBe(true);
    expect(data.inline_updated).toBe(true);
    expect(data.previous_text).toBe('GraphQL');

    const disk = await ctx.readDisk(filePath);
    // Inline markup updated: old side preserved, new side changed
    expect(disk).toContain('{~~REST~>gRPC~~}');
    expect(disk).not.toContain('{~~REST~>GraphQL~~}');
    // Footnote has revised entry with author
    expect(disk).toMatch(/revised @ai:test-agent/);
    expect(disk).toContain('gRPC better for internal services');
    // Footnote records the previous proposed text
    expect(disk).toContain('previous: "GraphQL"');
  });

  it('Scenario: Amend only reasoning (deletion — no inline change)', async () => {
    // A proposed deletion: removing " brown"
    const filePath = await ctx.createFile('doc.md', 'The quick brown fox.');
    await ctx.propose(filePath, {
      old_text: ' brown',
      new_text: '',
      reason: 'remove extra word',
    });

    const before = await ctx.readDisk(filePath);
    expect(before).toContain('{-- brown--}');

    // Amend reasoning only (new_text omitted → defaults to '' which is valid for deletion)
    const result = await ctx.amend(filePath, 'ct-1', {
      reason: 'Updated rationale: consistency across document',
    });
    expect(result.isError).toBeUndefined();

    const data = ctx.parseResult(result);
    expect(data.inline_updated).toBe(false);

    const disk = await ctx.readDisk(filePath);
    // Inline markup unchanged
    expect(disk).toContain('{-- brown--}');
    // Footnote has revised entry
    expect(disk).toMatch(/revised @ai:test-agent/);
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
    expect(errorText).toContain('Cannot amend a accepted change');

    // File unchanged
    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('{~~REST~>GraphQL~~}');
  });

  it('Scenario: Amendment preserves change ID and thread', async () => {
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

    // Amend the change
    const result = await ctx.amend(filePath, 'ct-1', {
      new_text: 'gRPC',
      reason: 'benchmarks show gRPC is 3x faster',
    });
    expect(result.isError).toBeUndefined();

    const data = ctx.parseResult(result);
    expect(data.change_id).toBe('ct-1');

    const disk = await ctx.readDisk(filePath);
    // Change ID preserved in inline markup
    expect(disk).toContain('[^ct-1]');
    expect(disk).toContain('{~~REST~>gRPC~~}');
    // Original discussion entry preserved
    expect(disk).toContain('Have you benchmarked this?');
    // Footnote still has original reasoning
    expect(disk).toContain('original reasoning about flexibility');
    // New revised entry added
    expect(disk).toMatch(/revised @ai:test-agent/);
    expect(disk).toContain('benchmarks show gRPC is 3x faster');
    // Previous text recorded
    expect(disk).toContain('previous: "GraphQL"');
  });
});
