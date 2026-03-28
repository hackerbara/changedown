import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { ScenarioContext } from '../scenario-context.js';
import {
  CriticMarkupParser,
  computeAccept,
  computeFootnoteStatusEdits,
  ChangeType,
  ChangeStatus,
  type TextEdit,
} from '@changedown/core';

/**
 * Apply an array of TextEdits to a string. Edits are applied in reverse offset
 * order so earlier offsets remain valid after later edits are applied.
 */
function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const edit of sorted) {
    result = result.slice(0, edit.offset) + edit.newText + result.slice(edit.offset + edit.length);
  }
  return result;
}

const SHARED_DOC = `# Shared Document

The deployment uses manual processes.
Monitoring is done via server logs.`;

describe('AJ5: Agent-human collaboration across surfaces', () => {
  let ctx: ScenarioContext;

  beforeEach(async () => {
    ctx = new ScenarioContext({
      settlement: { auto_on_approve: false, auto_on_reject: false },
      author: { default: 'ai:assistant', enforcement: 'optional' },
    });
    await ctx.setup();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 1: Agent proposes via MCP -> Human reviews in VS Code
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 1: Agent proposes via MCP -> Human accepts via core parser', async () => {
    const filePath = await ctx.createFile('shared.md', SHARED_DOC);

    // ── Agent side: propose substitution via MCP handler ─────────────
    const proposeResult = await ctx.propose(filePath, {
      old_text: 'manual processes',
      new_text: 'CI/CD pipeline',
      reason: 'Automate deployments',
      author: 'ai:assistant',
    });
    expect(proposeResult.isError).toBeUndefined();
    const proposeData = ctx.parseResult(proposeResult);
    expect(proposeData.change_id).toBe('cn-1');
    expect(proposeData.type).toBe('sub');

    // Verify disk: substitution markup + footnote present
    const disk1 = await ctx.readDisk(filePath);
    expect(disk1).toContain('{~~manual processes~>CI/CD pipeline~~}');
    expect(disk1).toContain('[^cn-1]');
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'proposed');

    // ── Human side: parse with @changedown/core CriticMarkupParser ─
    const parser = new CriticMarkupParser();
    const doc = parser.parse(disk1);
    const changes = doc.getChanges();

    // Parser finds exactly 1 substitution
    const substitutions = changes.filter(c => c.type === ChangeType.Substitution);
    expect(substitutions).toHaveLength(1);

    const change = substitutions[0];
    expect(change.id).toBe('cn-1');
    expect(change.originalText).toBe('manual processes');
    expect(change.modifiedText).toBe('CI/CD pipeline');

    // ── Human accepts via core computeAccept ─────────────────────────
    const acceptEdit = computeAccept(change);
    const statusEdits = computeFootnoteStatusEdits(disk1, ['cn-1'], 'accepted');
    const allEdits = [acceptEdit, ...statusEdits];
    const acceptedContent = applyEdits(disk1, allEdits);

    // Write accepted file back to disk
    await fs.writeFile(filePath, acceptedContent, 'utf-8');

    // Verify: file contains "CI/CD pipeline" without CriticMarkup delimiters
    const disk2 = await ctx.readDisk(filePath);
    expect(disk2).toContain('CI/CD pipeline');
    expect(disk2).not.toContain('{~~');
    expect(disk2).not.toContain('~>');
    expect(disk2).not.toContain('~~}');

    // Footnote status is "accepted"
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');

    // ── Agent verifies the result via MCP read ───────────────────────
    const readResult = await ctx.read(filePath, { view: 'meta' });
    expect(readResult.isError).toBeUndefined();
    const metaText = ctx.resultText(readResult);

    // Meta view reflects 0 proposed (the change was accepted by the human)
    expect(metaText).not.toMatch(/\d+ proposed/);
    // The accepted footnote is visible
    expect(metaText).toMatch(/accepted/);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 2: Human tracks changes -> Agent reads and reviews
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 2: Human-authored markup -> Agent reads and reviews via MCP', async () => {
    // Create file with human-authored CriticMarkup (as if VS Code tracking mode)
    const humanMarkup = `# Shared Document

The deployment uses {~~manual processes~>automated deployment~~}[^cn-1].
{++Alerts are sent via PagerDuty.++}[^cn-2]
Monitoring is done via server logs.

[^cn-1]: @human-editor | 2026-02-20 | sub | proposed
    reason: Manual deploys are error-prone
[^cn-2]: @human-editor | 2026-02-20 | ins | proposed
    reason: Need alerting beyond logs`;

    const filePath = await ctx.createFile('shared.md', humanMarkup);

    // ── Agent reads with meta view ───────────────────────────────────
    const readResult = await ctx.read(filePath, { view: 'meta' });
    expect(readResult.isError).toBeUndefined();
    const metaText = ctx.resultText(readResult);

    // Meta view shows proposed changes by @human-editor
    expect(metaText).toMatch(/proposed/);
    expect(metaText).toContain('cn-1');
    expect(metaText).toContain('cn-2');

    // ── Agent calls get_change for cn-1 ──────────────────────────────
    const getResult = await ctx.getChange(filePath, 'cn-1');
    expect(getResult.isError).toBeUndefined();
    const changeData = ctx.parseResult(getResult);
    expect(changeData.type).toBe('sub');
    expect(changeData.status).toBe('proposed');
    // Reasoning from the footnote is visible to the agent
    expect(changeData.footnote).toBeDefined();
    const footnote = changeData.footnote as Record<string, unknown>;
    expect(footnote.reasoning).toContain('Manual deploys are error-prone');

    // ── Agent approves cn-1 ──────────────────────────────────────────
    const approveResult = await ctx.review(filePath, {
      reviews: [{
        change_id: 'cn-1',
        decision: 'approve',
        reason: 'Good practice',
      }],
      author: 'ai:reviewer',
    });
    expect(approveResult.isError).toBeUndefined();
    await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');

    // ── Agent responds to cn-2 with suggestion ───────────────────────
    const respondResult = await ctx.review(filePath, {
      responses: [{
        change_id: 'cn-2',
        response: 'Consider also adding Datadog APM',
        label: 'suggestion',
      }],
      author: 'ai:reviewer',
    });
    expect(respondResult.isError).toBeUndefined();

    // cn-2 remains proposed (no decision made, only a comment)
    await ctx.assertFootnoteStatus(filePath, 'cn-2', 'proposed');

    // Verify agent's suggestion exists in the footnote
    const disk2 = await ctx.readDisk(filePath);
    expect(disk2).toContain('Consider also adding Datadog APM');
    expect(disk2).toContain('suggestion');
    expect(disk2).toContain('ai:reviewer');

    // ── Human side: parse the updated file with core parser ──────────
    const parser = new CriticMarkupParser();
    const doc = parser.parse(disk2);
    const changes = doc.getChanges();

    // cn-1 shows as accepted via the parser's status field (set from footnote header)
    const sc1 = changes.find(c => c.id === 'cn-1');
    expect(sc1).toBeDefined();
    expect(sc1!.status).toBe(ChangeStatus.Accepted);

    // cn-2 remains proposed; the full parser picks up the agent's discussion entry
    const sc2 = changes.find(c => c.id === 'cn-2');
    expect(sc2).toBeDefined();
    expect(sc2!.status).toBe(ChangeStatus.Proposed);
    // The full parser populates metadata.discussion for labeled replies
    expect(sc2!.metadata?.discussion).toBeDefined();
    expect(sc2!.metadata!.discussion!.length).toBeGreaterThanOrEqual(1);
    const agentReply = sc2!.metadata!.discussion!.find(d => d.author === '@ai:reviewer');
    expect(agentReply).toBeDefined();
    expect(agentReply!.text).toContain('Consider also adding Datadog APM');
    expect(agentReply!.label).toBe('suggestion');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Scenario 3: Full round-trip — agent proposes, human comments,
  //             agent reads, agent amends, human accepts
  // ──────────────────────────────────────────────────────────────────────
  it('Scenario 3: Full round-trip — agent proposes -> human comments -> agent amends -> human accepts', async () => {
    const filePath = await ctx.createFile('shared.md', SHARED_DOC);

    // ── Step 1: Agent proposes via MCP ───────────────────────────────
    const proposeResult = await ctx.propose(filePath, {
      old_text: 'manual processes',
      new_text: 'CI/CD pipeline',
      reason: 'Automate deployments',
      author: 'ai:assistant',
    });
    expect(proposeResult.isError).toBeUndefined();
    const proposeData = ctx.parseResult(proposeResult);
    expect(proposeData.change_id).toBe('cn-1');

    // ── Step 2: Human edits file directly to add a comment in the footnote ─
    // This simulates a human adding a comment via VS Code's comment UI or
    // directly editing the footnote block.
    let disk1 = await ctx.readDisk(filePath);
    expect(disk1).toContain('[^cn-1]:');

    // Human adds a reply line to the cn-1 footnote
    const humanComment = '    @human-editor 2026-02-20: We also need rollback support — CI/CD alone is not enough';
    disk1 = disk1.replace(
      /(\[\^cn-1\]:.*(?:\n    .*)*)(\n|$)/,
      (match, footnoteBlock, trailing) => `${footnoteBlock}\n${humanComment}${trailing}`
    );
    await fs.writeFile(filePath, disk1, 'utf-8');

    // Verify the comment was written
    const disk1b = await ctx.readDisk(filePath);
    expect(disk1b).toContain('We also need rollback support');
    expect(disk1b).toContain('@human-editor');

    // ── Step 3: Agent reads file and sees the human comment via get_change ─
    const getResult = await ctx.getChange(filePath, 'cn-1', { include_raw_footnote: true });
    expect(getResult.isError).toBeUndefined();
    const changeData = ctx.parseResult(getResult);

    // The raw footnote text contains the human's comment
    const footnoteData = changeData.footnote as Record<string, unknown>;
    expect(footnoteData.raw_text).toBeDefined();
    expect(footnoteData.raw_text as string).toContain('rollback support');

    // ── Step 4: Agent amends cn-1 incorporating feedback (supersede) ──
    const amendResult = await ctx.amend(filePath, 'cn-1', {
      new_text: 'CI/CD pipeline with automated rollback',
      reason: 'Incorporated human feedback about rollback support',
      author: 'ai:assistant',
    });
    expect(amendResult.isError).toBeUndefined();

    const amendData = ctx.parseResult(amendResult);
    expect(amendData.change_id).toBe('cn-1');
    expect(amendData.new_change_id).toBeDefined();
    expect(amendData.amended).toBe(true);
    const newChangeId = amendData.new_change_id as string;

    // Verify disk: new change proposes amended text, original is rejected
    const disk3 = await ctx.readDisk(filePath);
    expect(disk3).toContain('{~~manual processes~>CI/CD pipeline with automated rollback~~}');
    expect(disk3).toContain('Incorporated human feedback about rollback support');
    expect(disk3).toContain(`superseded-by: ${newChangeId}`);
    expect(disk3).toContain('supersedes: cn-1');

    // ── Step 5: Human accepts the NEW change via core accept ─────────
    const parser = new CriticMarkupParser();
    const doc = parser.parse(disk3);
    const changes = doc.getChanges();
    const sc = changes.find(c => c.id === newChangeId);
    expect(sc).toBeDefined();
    expect(sc!.type).toBe(ChangeType.Substitution);
    expect(sc!.modifiedText).toBe('CI/CD pipeline with automated rollback');

    // Apply accept + status edits
    const acceptEdit = computeAccept(sc!);
    const statusEdits = computeFootnoteStatusEdits(disk3, [newChangeId], 'accepted');
    const allEdits = [acceptEdit, ...statusEdits];
    const acceptedContent = applyEdits(disk3, allEdits);
    await fs.writeFile(filePath, acceptedContent, 'utf-8');

    // ── Step 6: Verify final state ───────────────────────────────────
    const finalDisk = await ctx.readDisk(filePath);

    // File body is clean — no CriticMarkup delimiters around the accepted change
    expect(finalDisk).toContain('CI/CD pipeline with automated rollback');

    // New change footnote status is accepted
    await ctx.assertFootnoteStatus(filePath, newChangeId, 'accepted');

    // Full deliberation trail preserved across footnotes
    expect(finalDisk).toContain('Automate deployments');                              // original reasoning (cn-1)
    expect(finalDisk).toContain('rollback support');                                  // human comment (cn-1)
    expect(finalDisk).toContain('Incorporated human feedback about rollback support'); // amendment reasoning (new change)

    // Agent can verify clean state via MCP read
    const readResult = await ctx.read(filePath, { view: 'meta' });
    expect(readResult.isError).toBeUndefined();
    const metaText = ctx.resultText(readResult);
    expect(metaText).toContain('CI/CD pipeline with automated rollback');
    expect(metaText).toMatch(/accepted/);
  });
});
