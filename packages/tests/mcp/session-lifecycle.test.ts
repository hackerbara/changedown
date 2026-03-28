import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from './features/scenario-context.js';

describe('Session lifecycle: read records view', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      hashline: { enabled: true, auto_remap: false },
      protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it('read with view=review records lastReadView as review', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nSome content here.\n');
    await ctx.read(filePath, { view: 'review' });
    expect(ctx.state.getLastReadView(filePath)).toBe('review');
  });

  it('read with view=settled records lastReadView as settled', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nSome content here.\n');
    await ctx.read(filePath, { view: 'settled' });
    expect(ctx.state.getLastReadView(filePath)).toBe('settled');
  });

  it('read with view=changes records lastReadView as changes', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nSome content here.\n');
    await ctx.read(filePath, { view: 'changes' });
    expect(ctx.state.getLastReadView(filePath)).toBe('changes');
  });

  it('read with view=raw records lastReadView as raw', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nSome content here.\n');
    await ctx.read(filePath, { view: 'raw' });
    expect(ctx.state.getLastReadView(filePath)).toBe('raw');
  });

  it('read with default view records lastReadView as review', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nSome content here.\n');
    await ctx.read(filePath);
    expect(ctx.state.getLastReadView(filePath)).toBe('review');
  });
});

describe('Session lifecycle: review-changes rerecords', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  it('propose after approve uses fresh hashes (no staleness)', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nThe API uses REST for requests.\n');

    const read1 = await ctx.read(filePath, { view: 'review' });
    expect(read1.isError).toBeUndefined();

    const propose1 = await ctx.propose(filePath, {
      old_text: 'REST',
      new_text: 'GraphQL',
      reason: 'paradigm shift',
    });
    expect(propose1.isError).toBeUndefined();
    const data1 = ctx.parseResult(propose1);

    const review1 = await ctx.review(filePath, {
      reviews: [{ change_id: (data1.change_id ?? (data1.results as Array<{change_id: string}>)?.[0]?.change_id) as string, decision: 'approve', reason: 'ok' }],
    });
    expect(review1.isError).toBeUndefined();

    // Re-read and propose ANOTHER change — should work with fresh hashes
    const read2 = await ctx.read(filePath, { view: 'review' });
    expect(read2.isError).toBeUndefined();

    const propose2 = await ctx.propose(filePath, {
      old_text: 'requests',
      new_text: 'queries',
      reason: 'consistency',
    });
    expect(propose2.isError).toBeUndefined();
  });

  it('hashes are re-recorded after review (settled content has no markup)', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nLine one.\nLine two.\n');

    await ctx.read(filePath, { view: 'review' });

    const p1 = await ctx.propose(filePath, { old_text: 'one', new_text: 'ONE', reason: 'caps' });
    expect(p1.isError).toBeUndefined();
    const d1 = ctx.parseResult(p1);
    const changeId = (d1.change_id ?? (d1.results as Array<{change_id: string}>)?.[0]?.change_id) as string;

    const r1 = await ctx.review(filePath, {
      reviews: [{ change_id: changeId, decision: 'approve', reason: 'ok' }],
    });
    expect(r1.isError).toBeUndefined();

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('ONE'); // settled
  });

  it('content fingerprint is updated after review write (isStale returns false)', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nOriginal text.\n');

    await ctx.read(filePath, { view: 'review' });

    const p1 = await ctx.propose(filePath, { old_text: 'Original', new_text: 'Modified', reason: 'edit' });
    expect(p1.isError).toBeUndefined();
    const d1 = ctx.parseResult(p1);
    const changeId = (d1.change_id ?? (d1.results as Array<{change_id: string}>)?.[0]?.change_id) as string;

    // Approve triggers settlement (auto_on_approve = true), which writes the file
    const r1 = await ctx.review(filePath, {
      reviews: [{ change_id: changeId, decision: 'approve', reason: 'ok' }],
    });
    expect(r1.isError).toBeUndefined();

    // After review-changes writes the file, rerecordAfterWrite should update
    // the fingerprint so that isStale returns false for the current disk content
    const diskContent = await ctx.readDisk(filePath);
    expect(ctx.state.isStale(filePath, diskContent)).toBe(false);
  });

  it('ID counter cache is reset after review so next propose re-scans', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nFirst line.\nSecond line.\n');

    await ctx.read(filePath, { view: 'review' });

    // Propose first change (gets cn-1)
    const p1 = await ctx.propose(filePath, { old_text: 'First', new_text: 'FIRST', reason: 'caps' });
    expect(p1.isError).toBeUndefined();
    const d1 = ctx.parseResult(p1);
    const changeId1 = (d1.change_id ?? (d1.results as Array<{change_id: string}>)?.[0]?.change_id) as string;
    expect(changeId1).toBe('cn-1');

    // Approve and settle cn-1
    const r1 = await ctx.review(filePath, {
      reviews: [{ change_id: changeId1, decision: 'approve', reason: 'ok' }],
    });
    expect(r1.isError).toBeUndefined();

    // Re-read after settlement to get fresh hashes
    await ctx.read(filePath, { view: 'review' });

    // Propose second change — the ID counter should have been reset by rerecordAfterWrite,
    // so getNextId re-scans the file. Since cn-1 footnote still exists (Layer 1), next ID is cn-2.
    const p2 = await ctx.propose(filePath, { old_text: 'Second', new_text: 'SECOND', reason: 'caps' });
    expect(p2.isError).toBeUndefined();
    const d2 = ctx.parseResult(p2);
    const changeId2 = (d2.change_id ?? (d2.results as Array<{change_id: string}>)?.[0]?.change_id) as string;
    expect(changeId2).toBe('cn-2');
  });
});

describe('Session lifecycle: propose rerecords', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      hashline: { enabled: true, auto_remap: false },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    });
    await ctx.setup();
  });

  afterEach(async () => { await ctx.teardown(); });

  it('second propose after first propose uses fresh hashes', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nLine one content.\nLine two content.\nLine three content.\n');

    await ctx.read(filePath, { view: 'review' });

    // First propose
    const p1 = await ctx.propose(filePath, {
      old_text: 'one content',
      new_text: 'ONE',
      reason: 'caps',
    });
    expect(p1.isError).toBeUndefined();

    // Re-read for new coordinates then second propose
    await ctx.read(filePath, { view: 'review' });

    const p2 = await ctx.propose(filePath, {
      old_text: 'two content',
      new_text: 'TWO',
      reason: 'caps',
    });
    expect(p2.isError).toBeUndefined();
  });

  it('content fingerprint is updated after propose', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nOriginal text here.\n');

    await ctx.read(filePath, { view: 'review' });

    const p1 = await ctx.propose(filePath, {
      old_text: 'Original',
      new_text: 'Updated',
      reason: 'testing',
    });
    expect(p1.isError).toBeUndefined();

    // Read the modified file from disk
    const diskContent = await ctx.readDisk(filePath);
    // State should NOT be stale (fingerprint was updated by rerecordAfterWrite)
    expect(ctx.state.isStale(filePath, diskContent)).toBe(false);
  });
});

describe('Session lifecycle: amend rerecords', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      hashline: { enabled: true, auto_remap: false },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    });
    await ctx.setup();
  });

  afterEach(async () => { await ctx.teardown(); });

  it('propose after amend uses fresh hashes', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nThe API uses REST for requests.\nAnother line here.\n');

    await ctx.read(filePath, { view: 'review' });

    const p1 = await ctx.propose(filePath, {
      old_text: 'REST',
      new_text: 'GraphQL',
      reason: 'paradigm',
    });
    expect(p1.isError).toBeUndefined();
    const d1 = ctx.parseResult(p1);
    const changeId = (d1.change_id ?? (d1.results as Array<{change_id: string}>)?.[0]?.change_id) as string;

    const a1 = await ctx.amend(filePath, changeId, {
      new_text: 'gRPC',
      reason: 'changed mind',
    });
    expect(a1.isError).toBeUndefined();

    // Re-read and propose on a different line
    await ctx.read(filePath, { view: 'review' });
    const p2 = await ctx.propose(filePath, {
      old_text: 'Another line here',
      new_text: 'A different line here',
      reason: 'clarity',
    });
    expect(p2.isError).toBeUndefined();
  });

  it('content fingerprint is updated after amend write', async () => {
    const filePath = await ctx.createFile('doc.md',
      '<!-- changedown.com/v1: tracked -->\n# Test\nOriginal text.\n');

    await ctx.read(filePath, { view: 'review' });

    const p1 = await ctx.propose(filePath, { old_text: 'Original', new_text: 'Modified', reason: 'edit' });
    expect(p1.isError).toBeUndefined();
    const d1 = ctx.parseResult(p1);
    const changeId = (d1.change_id ?? (d1.results as Array<{change_id: string}>)?.[0]?.change_id) as string;

    const a1 = await ctx.amend(filePath, changeId, {
      new_text: 'Revised',
      reason: 'better wording',
    });
    expect(a1.isError).toBeUndefined();

    // After amend writes the file, rerecordAfterWrite should update
    // the fingerprint so that isStale returns false for the current disk content
    const diskContent = await ctx.readDisk(filePath);
    expect(ctx.state.isStale(filePath, diskContent)).toBe(false);
  });
});
