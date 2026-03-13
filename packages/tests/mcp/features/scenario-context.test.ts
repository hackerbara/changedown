import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from './scenario-context.js';

describe('ScenarioContext helper', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext();
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it('creates temp directory and config', async () => {
    expect(ctx.tmpDir).toBeDefined();
    expect(ctx.state).toBeDefined();
    expect(ctx.resolver).toBeDefined();
  });

  it('creates files and reads them back', async () => {
    const filePath = await ctx.createFile('test.md', '# Hello');
    const content = await ctx.readDisk(filePath);
    expect(content).toBe('# Hello');
  });

  it('runs a basic propose -> read cycle', async () => {
    const filePath = await ctx.createFile('doc.md', 'hello world');
    const proposeResult = await ctx.propose(filePath, {
      old_text: 'hello',
      new_text: 'goodbye',
      reason: 'test change',
    });
    expect(proposeResult.isError).toBeUndefined();
    const data = ctx.parseResult(proposeResult);
    expect(data.change_id).toBe('ct-1');

    const diskContent = await ctx.readDisk(filePath);
    expect(diskContent).toContain('{~~hello~>goodbye~~}');
  });

  it('assertFootnoteStatus works for proposed change', async () => {
    const filePath = await ctx.createFile('doc.md', 'hello world');
    await ctx.propose(filePath, {
      old_text: 'hello',
      new_text: 'goodbye',
      reason: 'test',
    });
    await ctx.assertFootnoteStatus(filePath, 'ct-1', 'proposed');
  });

  it('assertNoMarkupInBody detects delimiters', async () => {
    const filePath = await ctx.createFile('doc.md', '{++hello++} world');
    await expect(ctx.assertNoMarkupInBody(filePath)).rejects.toThrow('CriticMarkup delimiter');
  });
});
