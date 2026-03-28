import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from './features/scenario-context.js';

describe('Batch overlap detection', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      hashline: { enabled: true, auto_remap: false },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    });
    await ctx.setup();
  });

  afterEach(async () => { await ctx.teardown(); });

  it('rejects batch with overlapping changes on same line', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nThe API uses REST for external requests from clients.\n');

    await ctx.read(filePath, { view: 'review' });

    const result = await ctx.propose(filePath, {
      reason: 'batch overlap test',
      changes: [
        { old_text: 'REST for external', new_text: 'GraphQL for internal', reason: 'paradigm' },
        { old_text: 'external requests', new_text: 'external queries', reason: 'terminology' },
      ],
    });

    expect(result.isError).toBe(true);
    expect(ctx.resultText(result).toLowerCase()).toMatch(/overlap/);
  });

  it('allows batch with non-overlapping changes on same line', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nThe API uses REST for external requests from clients.\n');

    await ctx.read(filePath, { view: 'review' });

    const result = await ctx.propose(filePath, {
      reason: 'batch non-overlap test',
      changes: [
        { old_text: 'REST', new_text: 'GraphQL', reason: 'paradigm' },
        { old_text: 'clients', new_text: 'consumers', reason: 'terminology' },
      ],
    });

    expect(result.isError).toBeUndefined();
  });

  it('allows batch with changes on different lines', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nLine one here.\nLine two here.\n');

    await ctx.read(filePath, { view: 'review' });

    const result = await ctx.propose(filePath, {
      reason: 'batch different lines test',
      changes: [
        { old_text: 'one', new_text: 'ONE', reason: 'caps' },
        { old_text: 'two', new_text: 'TWO', reason: 'caps' },
      ],
    });

    expect(result.isError).toBeUndefined();
  });

  it('detects overlap when one change is a subset of another', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nThe quick brown fox jumps over the lazy dog.\n');

    await ctx.read(filePath, { view: 'review' });

    const result = await ctx.propose(filePath, {
      reason: 'subset overlap test',
      changes: [
        { old_text: 'quick brown fox', new_text: 'slow red cat', reason: 'animal' },
        { old_text: 'brown', new_text: 'green', reason: 'color' },
      ],
    });

    expect(result.isError).toBe(true);
    expect(ctx.resultText(result).toLowerCase()).toMatch(/overlap/);
  });

  it('detects overlap when changes share boundary characters', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nfoo bar baz qux.\n');

    await ctx.read(filePath, { view: 'review' });

    // 'bar baz' and 'baz qux' overlap at 'baz'
    const result = await ctx.propose(filePath, {
      reason: 'boundary overlap test',
      changes: [
        { old_text: 'bar baz', new_text: 'BAR BAZ', reason: 'caps' },
        { old_text: 'baz qux', new_text: 'BAZ QUX', reason: 'caps' },
      ],
    });

    expect(result.isError).toBe(true);
    expect(ctx.resultText(result).toLowerCase()).toMatch(/overlap/);
  });
});
