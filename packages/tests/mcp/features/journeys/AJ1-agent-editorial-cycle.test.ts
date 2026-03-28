import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

const ARTICLE = `# Caching Strategy

The system uses no caching. All requests hit the database directly.
Response times average 500ms under load.
The API has no rate limiting.`;

describe('AJ1: Agent editorial cycle', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      settlement: { auto_on_approve: true, auto_on_reject: true },
      hashline: { enabled: true, auto_remap: false },
      author: { default: 'ai:editor', enforcement: 'optional' },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 1: Full editorial pass — read, batch propose, self-review, settle
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 1: Full editorial pass — read, batch propose, self-review, settle', async () => {
    const filePath = await ctx.createFile('article.md', ARTICLE);

    // ── Phase 1: Orient ────────────────────────────────────────────────
    const read1 = await ctx.read(filePath, { view: 'meta' });
    expect(read1.isError).toBeUndefined();
    const metaText1 = ctx.resultText(read1);

    // Meta header should show no proposed changes (empty status line or 0)
    expect(metaText1).not.toMatch(/\d+ proposed/);
    // Document content is present
    expect(metaText1).toContain('Caching Strategy');
    expect(metaText1).toContain('no caching');

    // ── Phase 2: Batch propose 3 substitutions ─────────────────────────
    const proposeResult = await ctx.propose(filePath, {
      reason: 'Improve caching architecture',
      changes: [
        { old_text: 'no caching', new_text: 'Redis caching with 5-minute TTL', reason: 'Reduce DB load' },
        { old_text: '500ms', new_text: '50ms', reason: 'Caching brings p99 under 100ms' },
        { old_text: 'no rate limiting', new_text: 'rate limiting at 1000 req/min', reason: 'Prevent abuse' },
      ],
    });
    expect(proposeResult.isError).toBeUndefined();

    // Batch returns grouped dotted IDs under a parent group
    const proposeData = ctx.parseResult(proposeResult);
    expect(proposeData.group_id).toBe('cn-1');
    expect(proposeData.applied).toHaveLength(3);
    const changeIds = (proposeData.applied as Array<{ change_id: string }>).map(c => c.change_id);
    expect(changeIds).toEqual(['cn-1.1', 'cn-1.2', 'cn-1.3']);

    // Verify disk state: 3 substitution markups + 3 proposed footnotes
    const disk1 = await ctx.readDisk(filePath);
    expect(disk1).toContain('{~~no caching~>Redis caching with 5-minute TTL~~}');
    expect(disk1).toContain('{~~500ms~>50ms~~}');
    expect(disk1).toContain('{~~no rate limiting~>rate limiting at 1000 req/min~~}');
    await ctx.assertFootnoteStatus(filePath, 'cn-1.1', 'proposed');
    await ctx.assertFootnoteStatus(filePath, 'cn-1.2', 'proposed');
    await ctx.assertFootnoteStatus(filePath, 'cn-1.3', 'proposed');

    // ── Phase 3: Re-read meta view to verify proposed count ────────────
    const read2 = await ctx.read(filePath, { view: 'meta' });
    expect(read2.isError).toBeUndefined();
    const metaText2 = ctx.resultText(read2);

    // Meta header should show proposed changes (at least the child footnotes)
    // The meta renderer counts footnotes by status. Group footnote (cn-1) is type 'group',
    // child footnotes (cn-1.1, cn-1.2, cn-1.3) are type 'sub' with status 'proposed'.
    expect(metaText2).toMatch(/proposed/);
    // Inline annotations should appear at change locations
    expect(metaText2).toContain('cn-1.1');
    expect(metaText2).toContain('cn-1.2');
    expect(metaText2).toContain('cn-1.3');

    // ── Phase 4: Self-review — approve all 3 changes ───────────────────
    const reviewResult = await ctx.review(filePath, {
      reviews: [
        { change_id: 'cn-1.1', decision: 'approve', reason: 'Good improvement' },
        { change_id: 'cn-1.2', decision: 'approve', reason: 'Confirmed latency improvement' },
        { change_id: 'cn-1.3', decision: 'approve', reason: 'Security best practice' },
      ],
    });
    expect(reviewResult.isError).toBeUndefined();

    const reviewData = ctx.parseResult(reviewResult);
    // Auto-settlement should fire (config: auto_on_approve = true)
    expect(reviewData.settled).toBeDefined();
    const settledIds = reviewData.settled as string[];
    expect(settledIds).toHaveLength(3);
    expect(settledIds).toContain('cn-1.1');
    expect(settledIds).toContain('cn-1.2');
    expect(settledIds).toContain('cn-1.3');

    // ── Phase 5: Verify clean state ────────────────────────────────────
    // No CriticMarkup delimiters in body
    await ctx.assertNoMarkupInBody(filePath);

    // Body contains the new text
    const disk2 = await ctx.readDisk(filePath);
    expect(disk2).toContain('Redis caching with 5-minute TTL');
    expect(disk2).toContain('50ms');
    expect(disk2).toContain('rate limiting at 1000 req/min');

    // Footnotes persist with accepted status (Layer 1 compaction keeps footnotes)
    await ctx.assertFootnoteStatus(filePath, 'cn-1.1', 'accepted');
    await ctx.assertFootnoteStatus(filePath, 'cn-1.2', 'accepted');
    await ctx.assertFootnoteStatus(filePath, 'cn-1.3', 'accepted');

    // Read content view confirms clean prose
    const read3 = await ctx.read(filePath, { view: 'content' });
    expect(read3.isError).toBeUndefined();
    const contentText = ctx.resultText(read3);
    expect(contentText).toContain('Redis caching with 5-minute TTL');
    expect(contentText).toContain('50ms');
    expect(contentText).toContain('rate limiting at 1000 req/min');
    // No CriticMarkup delimiters in content view
    expect(contentText).not.toContain('{~~');
    expect(contentText).not.toContain('~>');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 2: Editorial pass on committed view (Surface E)
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 2: Editorial pass on committed view (Surface E)', async () => {
    const filePath = await ctx.createFile('article.md', ARTICLE);

    // ── Phase 1: Orient via committed view ─────────────────────────────
    const read1 = await ctx.read(filePath, { view: 'committed' });
    expect(read1.isError).toBeUndefined();
    const committedText1 = ctx.resultText(read1);

    // Committed view has LINE:HASH format
    expect(committedText1).toMatch(/\d+:[0-9a-f]{2}/);
    // No CriticMarkup delimiters in committed view
    expect(committedText1).not.toContain('{~~');
    expect(committedText1).not.toContain('{++');
    expect(committedText1).not.toContain('{--');

    // ── Phase 2: Propose using hash coordinates ────────────────────────
    const lh = ctx.extractLineHash(committedText1, 'no caching');
    expect(lh).not.toBeNull();

    const proposeResult = await ctx.propose(filePath, {
      start_line: lh!.line,
      start_hash: lh!.hash,
      old_text: 'no caching',
      new_text: 'Redis caching',
      reason: 'Add caching layer',
    });
    expect(proposeResult.isError).toBeUndefined();
    const proposeData = ctx.parseResult(proposeResult);
    expect(proposeData.change_id).toBe('cn-1');

    // Verify markup on disk
    const disk1 = await ctx.readDisk(filePath);
    expect(disk1).toContain('{~~no caching~>Redis caching~~}');

    // ── Phase 3: Re-read committed view ────────────────────────────────
    const read2 = await ctx.read(filePath, { view: 'committed' });
    expect(read2.isError).toBeUndefined();
    const committedText2 = ctx.resultText(read2);

    // Pending change shows P flag
    expect(committedText2).toMatch(/P\|/);
    // Committed view shows original text (pending substitution reverted)
    expect(committedText2).toContain('no caching');
    // Header indicates 1 pending change (unified format: "proposed: N")
    expect(committedText2).toContain('proposed: 1');

    // ── Phase 4: Approve and auto-settle ───────────────────────────────
    const reviewResult = await ctx.review(filePath, {
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'Looks good' }],
    });
    expect(reviewResult.isError).toBeUndefined();

    // Auto-settlement fires
    const reviewData = ctx.parseResult(reviewResult);
    expect(reviewData.settled).toBeDefined();

    // ── Phase 5: Verify committed view is clean ────────────────────────
    const read3 = await ctx.read(filePath, { view: 'committed' });
    expect(read3.isError).toBeUndefined();
    const committedText3 = ctx.resultText(read3);

    // New text visible
    expect(committedText3).toContain('Redis caching');
    // No P flags remain
    expect(committedText3).not.toMatch(/P\|/);
    // Footnote persists (Layer 1 compaction): accepted: 1 in summary
    expect(committedText3).toContain('accepted: 1');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 3: Sequential single changes across full cycle
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 3: Sequential single changes (non-batch) across full cycle', async () => {
    const filePath = await ctx.createFile('article.md', ARTICLE);

    // ── Step 1: Propose change 1 (substitution) ────────────────────────
    const propose1 = await ctx.propose(filePath, {
      old_text: 'no caching',
      new_text: 'Redis caching',
      reason: 'Add caching',
    });
    expect(propose1.isError).toBeUndefined();
    const data1 = ctx.parseResult(propose1);
    expect(data1.change_id).toBe('cn-1');
    expect(data1.type).toBe('sub');

    // ── Step 2: Read to verify markup ──────────────────────────────────
    const read1 = await ctx.read(filePath, { view: 'meta' });
    expect(read1.isError).toBeUndefined();
    const metaText1 = ctx.resultText(read1);
    expect(metaText1).toContain('cn-1');
    expect(metaText1).toMatch(/proposed/);

    // ── Step 3: Propose change 2 (substitution) ────────────────────────
    const propose2 = await ctx.propose(filePath, {
      old_text: 'no rate limiting',
      new_text: 'rate limiting at 1000 req/min',
      reason: 'Prevent abuse',
    });
    expect(propose2.isError).toBeUndefined();
    const data2 = ctx.parseResult(propose2);
    expect(data2.change_id).toBe('cn-2');
    expect(data2.type).toBe('sub');

    // ── Step 4: Read to verify both changes ────────────────────────────
    const read2 = await ctx.read(filePath, { view: 'meta' });
    expect(read2.isError).toBeUndefined();
    const metaText2 = ctx.resultText(read2);
    expect(metaText2).toContain('cn-1');
    expect(metaText2).toContain('cn-2');

    // ── Step 5: Approve both changes ───────────────────────────────────
    const reviewResult = await ctx.review(filePath, {
      reviews: [
        { change_id: 'cn-1', decision: 'approve', reason: 'Good' },
        { change_id: 'cn-2', decision: 'approve', reason: 'Good' },
      ],
    });
    expect(reviewResult.isError).toBeUndefined();

    const reviewData = ctx.parseResult(reviewResult);
    // Auto-settlement should fire
    expect(reviewData.settled).toBeDefined();
    const settledIds = reviewData.settled as string[];
    expect(settledIds).toContain('cn-1');
    expect(settledIds).toContain('cn-2');

    // ── Step 6: Verify final state ─────────────────────────────────────
    await ctx.assertNoMarkupInBody(filePath);

    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('Redis caching');
    expect(disk).toContain('rate limiting at 1000 req/min');

    // Both footnotes accepted
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');
    await ctx.assertFootnoteStatus(filePath, 'cn-2', 'accepted');
  });
});
