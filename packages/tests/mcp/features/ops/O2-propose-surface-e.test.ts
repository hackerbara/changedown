import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

const SPEC_DOC = `# Spec

timeout = 30
retry = false`;

describe('O2: Propose changes via Surface E (committed view)', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      hashline: { enabled: true, auto_remap: false },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it('Scenario: Read committed view then propose with line:hash', async () => {
    const filePath = await ctx.createFile('spec.md', SPEC_DOC);

    // Read committed view
    const readResult = await ctx.read(filePath, { view: 'committed' });
    expect(readResult.isError).toBeUndefined();
    const readText = ctx.resultText(readResult);

    // Extract line:hash for "timeout = 30"
    const lh = ctx.extractLineHash(readText, 'timeout = 30');
    expect(lh).not.toBeNull();

    // Propose with coordinates
    const proposeResult = await ctx.propose(filePath, {
      start_line: lh!.line,
      start_hash: lh!.hash,
      old_text: 'timeout = 30',
      new_text: 'timeout = 60',
      reason: 'Increase for slow networks',
    });
    expect(proposeResult.isError).toBeUndefined();
    const data = ctx.parseResult(proposeResult);
    expect(data.change_id).toBe('ct-1');

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('{~~timeout = 30~>timeout = 60~~}');
  });

  it('Scenario: Propose insertion after a hash-addressed line', async () => {
    const filePath = await ctx.createFile('spec.md', SPEC_DOC);

    const readResult = await ctx.read(filePath, { view: 'committed' });
    const readText = ctx.resultText(readResult);

    const lh = ctx.extractLineHash(readText, 'retry = false');
    expect(lh).not.toBeNull();

    const proposeResult = await ctx.propose(filePath, {
      after_line: lh!.line,
      after_hash: lh!.hash,
      old_text: '',
      new_text: 'max_retries = 3',
      reason: 'Add retry limit',
    });

    expect(proposeResult.isError).toBeUndefined();
    const data = ctx.parseResult(proposeResult);
    expect(data.type).toBe('ins');

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('{++max_retries = 3++}');
  });

  it('Scenario: Completely wrong hash returns error', async () => {
    const filePath = await ctx.createFile('spec.md', SPEC_DOC);

    // Must read committed view first to record hashes in session state
    await ctx.read(filePath, { view: 'committed' });

    const proposeResult = await ctx.propose(filePath, {
      start_line: 3,
      start_hash: 'zz',
      old_text: 'timeout = 30',
      new_text: 'timeout = 60',
      reason: 'test',
    });

    expect(proposeResult.isError).toBe(true);
    expect(ctx.resultText(proposeResult).toLowerCase()).toMatch(/hash|mismatch/);
  });

  it('Scenario: Chained edits update hash state', async () => {
    const filePath = await ctx.createFile('spec.md', SPEC_DOC);

    // First read + propose
    const read1 = await ctx.read(filePath, { view: 'committed' });
    const text1 = ctx.resultText(read1);
    const lh1 = ctx.extractLineHash(text1, 'timeout = 30');
    expect(lh1).not.toBeNull();

    await ctx.propose(filePath, {
      start_line: lh1!.line,
      start_hash: lh1!.hash,
      old_text: 'timeout = 30',
      new_text: 'timeout = 60',
      reason: 'change 1',
    });

    // Second read + propose on different line
    const read2 = await ctx.read(filePath, { view: 'committed' });
    const text2 = ctx.resultText(read2);
    const lh2 = ctx.extractLineHash(text2, 'retry = false');
    expect(lh2).not.toBeNull();

    const r2 = await ctx.propose(filePath, {
      start_line: lh2!.line,
      start_hash: lh2!.hash,
      old_text: 'retry = false',
      new_text: 'retry = true',
      reason: 'change 2',
    });
    expect(r2.isError).toBeUndefined();

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('[^ct-1]');
    expect(disk).toContain('[^ct-2]');
  });

  it('Scenario: Committed view hides pending changes', async () => {
    const filePath = await ctx.createFile('spec.md', SPEC_DOC);

    // Create a pending change
    await ctx.propose(filePath, {
      old_text: 'timeout = 30',
      new_text: 'timeout = 60',
      reason: 'test',
    });

    // Read committed view — pending should be reverted
    const readResult = await ctx.read(filePath, { view: 'committed' });
    const text = ctx.resultText(readResult);

    // Committed view shows original text (pending substitution reverted to old text)
    expect(text).toContain('timeout = 30');
    // Should have a P flag on the line with the pending change
    expect(text).toMatch(/P\|/);
  });
});
