import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

/**
 * O8: Batch Operations
 *
 * Tests the `changes` array parameter on `propose_change` for making
 * multiple changes in one call, producing grouped (dotted) IDs.
 *
 * Batch flow:
 *   1. propose_change with `changes` array (2+ items) delegates to handleProposeBatch
 *   2. state.beginGroup() reserves parent ID (ct-N), children get ct-N.1, ct-N.2, ...
 *   3. applySingleOperation applies each change with coordinate adjustment
 *   4. Group footnote [^ct-N] written with type "group"
 *   5. Response returns { group_id, changes: [{change_id, type, index}] }
 */

const MULTI_PARA = `# Specification

The system uses alpha encoding for data.
The interface supports beta mode by default.
All outputs pass through gamma filtering.`;

describe('O8: Batch operations', () => {
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

  // ─── Scenario 1: Batch produces grouped IDs ─────────────────────────

  it('Scenario: Batch propose creates grouped changes with dotted IDs', async () => {
    const filePath = await ctx.createFile('spec.md', MULTI_PARA);

    const result = await ctx.propose(filePath, {
      changes: [
        { old_text: 'alpha', new_text: 'ALPHA', reason: 'capitalize 1' },
        { old_text: 'beta', new_text: 'BETA', reason: 'capitalize 2' },
        { old_text: 'gamma', new_text: 'GAMMA', reason: 'capitalize 3' },
      ],
      reason: 'batch capitalize',
    });

    expect(result.isError).toBeUndefined();
    const data = ctx.parseResult(result);

    // Response contains grouped IDs under the group parent
    expect(data.group_id).toBe('ct-1');
    const changes = data.applied as Array<{ change_id: string; type: string; index: number }>;
    expect(changes).toHaveLength(3);
    expect(changes[0].change_id).toBe('ct-1.1');
    expect(changes[1].change_id).toBe('ct-1.2');
    expect(changes[2].change_id).toBe('ct-1.3');

    // All three child footnotes exist on disk with the group prefix
    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('[^ct-1.1]:');
    expect(disk).toContain('[^ct-1.2]:');
    expect(disk).toContain('[^ct-1.3]:');
    // Group footnote also exists
    expect(disk).toContain('[^ct-1]:');

    // Inline markup is present for each change
    expect(disk).toContain('{~~alpha~>ALPHA~~}');
    expect(disk).toContain('{~~beta~>BETA~~}');
    expect(disk).toContain('{~~gamma~>GAMMA~~}');
  });

  // ─── Scenario 2: Per-change reasoning ────────────────────────────────

  it('Scenario: Batch with reasoning per change', async () => {
    const filePath = await ctx.createFile('spec.md', MULTI_PARA);

    await ctx.propose(filePath, {
      changes: [
        { old_text: 'alpha', new_text: 'ALPHA', reason: 'reason-for-alpha' },
        { old_text: 'beta', new_text: 'BETA', reason: 'reason-for-beta' },
      ],
      reason: 'batch edit',
    });

    const disk = await ctx.readDisk(filePath);

    // Each child footnote contains its own reasoning
    // Find the footnote blocks for each child
    const sc11Section = extractFootnoteSection(disk, 'ct-1.1');
    const sc12Section = extractFootnoteSection(disk, 'ct-1.2');

    expect(sc11Section).toContain('reason-for-alpha');
    expect(sc12Section).toContain('reason-for-beta');

    // Cross-check: each footnote does NOT contain the other's reasoning
    expect(sc11Section).not.toContain('reason-for-beta');
    expect(sc12Section).not.toContain('reason-for-alpha');
  });

  // ─── Scenario 3: Shared batch reasoning ──────────────────────────────

  it('Scenario: Batch with shared reasoning', async () => {
    const filePath = await ctx.createFile('spec.md', MULTI_PARA);

    await ctx.propose(filePath, {
      changes: [
        { old_text: 'alpha', new_text: 'ALPHA' },
        { old_text: 'beta', new_text: 'BETA' },
      ],
      reason: 'capitalize for emphasis',
    });

    const disk = await ctx.readDisk(filePath);

    // The shared reasoning goes into the group footnote [^ct-1]
    const groupSection = extractFootnoteSection(disk, 'ct-1');
    expect(groupSection).toContain('capitalize for emphasis');
    // Group footnote has type "group"
    expect(groupSection).toContain('group');
  });

  // ─── Scenario 4: Coordinate adjustment ───────────────────────────────

  it('Scenario: Batch auto-adjusts coordinates for cascading changes', async () => {
    // Use content where the first change adds lines, shifting subsequent content
    const content = `# Doc

First paragraph here.

Second paragraph here.

Third paragraph here.`;

    const filePath = await ctx.createFile('spec.md', content);

    // Batch: first change is an insertion (adds text), second and third are subs
    // The insertion shifts line numbers for the subsequent operations
    const result = await ctx.propose(filePath, {
      changes: [
        { old_text: 'First paragraph here.', new_text: 'First paragraph revised.\nWith an extra line.', reason: 'expand first' },
        { old_text: 'Second paragraph here.', new_text: 'Second paragraph revised.', reason: 'update second' },
        { old_text: 'Third paragraph here.', new_text: 'Third paragraph revised.', reason: 'update third' },
      ],
      reason: 'multi-paragraph edit',
    });

    expect(result.isError).toBeUndefined();
    const data = ctx.parseResult(result);
    const changes = data.applied as Array<{ change_id: string; type: string }>;
    expect(changes).toHaveLength(3);

    // All three changes applied correctly despite coordinate shifts
    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('{~~First paragraph here.~>First paragraph revised.\nWith an extra line.~~}');
    expect(disk).toContain('{~~Second paragraph here.~>Second paragraph revised.~~}');
    expect(disk).toContain('{~~Third paragraph here.~>Third paragraph revised.~~}');
  });

  // ─── Scenario 5: Batch review (approve all) ─────────────────────────

  it('Scenario: Batch review approves entire group', async () => {
    const filePath = await ctx.createFile('spec.md', MULTI_PARA);

    // First, create the batch
    const proposeResult = await ctx.propose(filePath, {
      changes: [
        { old_text: 'alpha', new_text: 'ALPHA', reason: 'cap 1' },
        { old_text: 'beta', new_text: 'BETA', reason: 'cap 2' },
        { old_text: 'gamma', new_text: 'GAMMA', reason: 'cap 3' },
      ],
      reason: 'batch capitalize',
    });
    expect(proposeResult.isError).toBeUndefined();

    // All three should be proposed
    await ctx.assertFootnoteStatus(filePath, 'ct-1.1', 'proposed');
    await ctx.assertFootnoteStatus(filePath, 'ct-1.2', 'proposed');
    await ctx.assertFootnoteStatus(filePath, 'ct-1.3', 'proposed');

    // Approve all three in one review call
    const reviewResult = await ctx.review(filePath, {
      reviews: [
        { change_id: 'ct-1.1', decision: 'approve', reason: 'looks good' },
        { change_id: 'ct-1.2', decision: 'approve', reason: 'looks good' },
        { change_id: 'ct-1.3', decision: 'approve', reason: 'looks good' },
      ],
    });
    expect(reviewResult.isError).toBeUndefined();

    // All three footnotes show "accepted"
    await ctx.assertFootnoteStatus(filePath, 'ct-1.1', 'accepted');
    await ctx.assertFootnoteStatus(filePath, 'ct-1.2', 'accepted');
    await ctx.assertFootnoteStatus(filePath, 'ct-1.3', 'accepted');
  });

  // ─── Scenario 7: Batch affected_lines returns bounded window ────────

  it('Scenario: Batch affected_lines returns bounded window, not entire file', async () => {
    // Create a 55-line file (well above the 50+ line threshold)
    const lines = ['<!-- ctrcks.com/v1: tracked -->', '# Large Document', ''];
    for (let i = 1; i <= 52; i++) {
      lines.push(`Line ${i} of the specification document.`);
    }
    const bigContent = lines.join('\n');

    // Use classic mode (hashlines disabled) — this exercises the fallback path
    const classicCtx = new ScenarioContext({
      settlement: { auto_on_approve: false, auto_on_reject: false },
      hashline: { enabled: false, auto_remap: false },
      response: { affected_lines: true },
    });
    await classicCtx.setup();

    try {
      const filePath = await classicCtx.createFile('large.md', bigContent);

      // Batch propose: two substitutions on lines ~10 and ~12 (middle of file)
      const result = await classicCtx.propose(filePath, {
        changes: [
          { old_text: 'Line 10 of the specification document.', new_text: 'Line 10 REVISED.' },
          { old_text: 'Line 12 of the specification document.', new_text: 'Line 12 REVISED.' },
        ],
        reason: 'batch windowing test',
      });

      expect(result.isError).toBeUndefined();
      const data = classicCtx.parseResult(result);

      // affected_lines should exist and be bounded
      const affectedLines = data.affected_lines as Array<{ line: number; content: string }>;
      expect(affectedLines).toBeDefined();
      expect(Array.isArray(affectedLines)).toBe(true);

      // Must be fewer than 20 entries (not the entire 55+ line file)
      expect(affectedLines.length).toBeLessThan(20);

      // Must include the edit region (lines containing the changes)
      const lineNums = affectedLines.map(l => l.line);
      const hasEditRegion = affectedLines.some(l => l.content.includes('REVISED'));
      expect(hasEditRegion).toBe(true);

      // Must NOT contain the entire file
      const totalFileLines = (await classicCtx.readDisk(filePath)).split('\n').length;
      expect(affectedLines.length).toBeLessThan(totalFileLines);

      // Specifically, should not include lines far from the edit (e.g. line 50+)
      expect(lineNums.every(n => n < 50)).toBe(true);
    } finally {
      await classicCtx.teardown();
    }
  });

  // ─── Scenario 6: Partial batch review ────────────────────────────────

  it('Scenario: Partial batch review (approve some, reject others)', async () => {
    const filePath = await ctx.createFile('spec.md', MULTI_PARA);

    // Create the batch
    await ctx.propose(filePath, {
      changes: [
        { old_text: 'alpha', new_text: 'ALPHA', reason: 'cap 1' },
        { old_text: 'beta', new_text: 'BETA', reason: 'cap 2' },
        { old_text: 'gamma', new_text: 'GAMMA', reason: 'cap 3' },
      ],
      reason: 'batch capitalize',
    });

    // Mixed decisions: approve first, reject second, request_changes on third
    const reviewResult = await ctx.review(filePath, {
      reviews: [
        { change_id: 'ct-1.1', decision: 'approve', reason: 'alpha change is correct' },
        { change_id: 'ct-1.2', decision: 'reject', reason: 'beta should stay lowercase' },
        { change_id: 'ct-1.3', decision: 'request_changes', reason: 'gamma needs different casing' },
      ],
    });
    expect(reviewResult.isError).toBeUndefined();

    // Each footnote reflects its individual decision
    await ctx.assertFootnoteStatus(filePath, 'ct-1.1', 'accepted');
    await ctx.assertFootnoteStatus(filePath, 'ct-1.2', 'rejected');
    // request_changes does not change status from proposed
    await ctx.assertFootnoteStatus(filePath, 'ct-1.3', 'proposed');

    // Verify the review decisions are recorded in the footnotes
    const disk = await ctx.readDisk(filePath);
    expect(disk).toContain('approved:');
    expect(disk).toContain('rejected:');
    expect(disk).toContain('request-changes:');
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts the footnote section for a given change ID from file content.
 * Returns the footnote header line plus any indented continuation lines.
 */
function extractFootnoteSection(content: string, changeId: string): string {
  const lines = content.split('\n');
  // Use regex with exact match to avoid substring matches (e.g. [^ct-1]: matching [^ct-1.1]:)
  const escapedId = changeId.replace('.', '\\.');
  const headerRegex = new RegExp(`^\\[\\^${escapedId}\\]:`);
  const startIdx = lines.findIndex(l => headerRegex.test(l));
  if (startIdx === -1) return '';

  const result = [lines[startIdx]];
  for (let i = startIdx + 1; i < lines.length; i++) {
    // Continuation lines are indented (4 spaces) or blank
    if (lines[i].startsWith('    ') || lines[i].trim() === '') {
      result.push(lines[i]);
    } else {
      break;
    }
  }
  return result.join('\n');
}
