import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';
import { createTestResolver } from '../../test-resolver.js';

/**
 * AJ6: Settlement Lifecycle
 *
 * Journey test covering the full settlement lifecycle: progressive settlement,
 * batch settlement, structure preservation, and mixed auto/manual settlement.
 *
 * Key implementation details:
 * - `auto_on_approve: true` settles accepted changes immediately on approve
 * - `auto_on_reject: true` settles rejected changes immediately on reject
 * - `settle: true` flag only compacts **accepted** changes (not rejected)
 * - Layer 1 settlement removes inline CriticMarkup but keeps footnote refs and definitions
 */

const DOC_5_CHANGES = `# Architecture Overview

The system uses a monolithic architecture for all services.

Error handling relies on global try-catch blocks throughout the codebase.

The database layer uses raw SQL queries for all operations.

Logging is done via console.log statements scattered across modules.

The deployment process requires manual server restarts for every release.`;

describe('AJ6: Settlement lifecycle', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 1: Progressive settlement — approve changes one at a time
  // ──────────────────────────────────────────────────────────────────────────
  describe('Progressive settlement — approve changes one at a time', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: true, auto_on_reject: true },
      });
      await ctx.setup();

      filePath = await ctx.createFile('lifecycle.md', DOC_5_CHANGES);

      // Create 5 proposed changes (cn-1 through cn-5)
      const p1 = await ctx.propose(filePath, {
        old_text: 'monolithic architecture',
        new_text: 'microservices architecture',
        reason: 'scalability',
      });
      expect(p1.isError).toBeUndefined();
      const p2 = await ctx.propose(filePath, {
        old_text: 'global try-catch blocks',
        new_text: 'structured error boundaries',
        reason: 'reliability',
      });
      expect(p2.isError).toBeUndefined();
      const p3 = await ctx.propose(filePath, {
        old_text: 'raw SQL queries',
        new_text: 'parameterized queries via ORM',
        reason: 'security and maintainability',
      });
      expect(p3.isError).toBeUndefined();
      const p4 = await ctx.propose(filePath, {
        old_text: '',
        new_text: ' Alerts are routed to PagerDuty.',
        insert_after: 'Logging is done via console.log statements scattered across modules.',
        reason: 'observability',
      });
      expect(p4.isError).toBeUndefined();
      const p5 = await ctx.propose(filePath, {
        old_text: 'manual server restarts',
        new_text: 'automated CI/CD pipelines',
        reason: 'deployment reliability',
      });
      expect(p5.isError).toBeUndefined();

      // Verify all 5 proposed footnotes exist
      for (let i = 1; i <= 5; i++) {
        await ctx.assertFootnoteStatus(filePath, `cn-${i}`, 'proposed');
      }
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('approves and settles changes one-by-one, verifying intermediate states', async () => {
      // ── Step 1: Approve cn-1 ──────────────────────────────────────────
      const r1 = await ctx.review(filePath, {
        reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'good' }],
      });
      expect(r1.isError).toBeUndefined();

      const d1 = ctx.parseResult(r1);
      expect(d1.settled).toBeDefined();
      expect(d1.settled).toContain('cn-1');

      // cn-1 settled: new text present, no markup for it
      const disk1 = await ctx.readDisk(filePath);
      expect(disk1).toContain('microservices architecture');
      await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');

      // cn-2 through cn-5 still have inline markup
      expect(disk1).toContain('{~~global try-catch blocks~>structured error boundaries~~}');
      expect(disk1).toContain('{~~raw SQL queries~>parameterized queries via ORM~~}');
      expect(disk1).toContain('{++ Alerts are routed to PagerDuty.++}');
      expect(disk1).toContain('{~~manual server restarts~>automated CI/CD pipelines~~}');

      for (let i = 2; i <= 5; i++) {
        await ctx.assertFootnoteStatus(filePath, `cn-${i}`, 'proposed');
      }

      // ── Step 2: Approve cn-2 and cn-3 ─────────────────────────────────
      const r2 = await ctx.review(filePath, {
        reviews: [
          { change_id: 'cn-2', decision: 'approve', reason: 'agreed' },
          { change_id: 'cn-3', decision: 'approve', reason: 'agreed' },
        ],
      });
      expect(r2.isError).toBeUndefined();

      const d2 = ctx.parseResult(r2);
      expect(d2.settled).toBeDefined();
      expect(d2.settled).toContain('cn-2');
      expect(d2.settled).toContain('cn-3');

      const disk2 = await ctx.readDisk(filePath);
      expect(disk2).toContain('structured error boundaries');
      expect(disk2).toContain('parameterized queries via ORM');
      await ctx.assertFootnoteStatus(filePath, 'cn-2', 'accepted');
      await ctx.assertFootnoteStatus(filePath, 'cn-3', 'accepted');

      // cn-4 and cn-5 still proposed
      expect(disk2).toContain('{++');
      expect(disk2).toContain('{~~manual server restarts~>automated CI/CD pipelines~~}');
      await ctx.assertFootnoteStatus(filePath, 'cn-4', 'proposed');
      await ctx.assertFootnoteStatus(filePath, 'cn-5', 'proposed');

      // ── Step 3: Reject cn-4 (insertion) ───────────────────────────────
      const r3 = await ctx.review(filePath, {
        reviews: [{ change_id: 'cn-4', decision: 'reject', reason: 'not needed yet' }],
      });
      expect(r3.isError).toBeUndefined();

      const d3 = ctx.parseResult(r3);
      expect(d3.settled).toBeDefined();
      expect(d3.settled).toContain('cn-4');

      // Rejected insertion: inserted text removed from body
      const disk3 = await ctx.readDisk(filePath);
      const fn3 = disk3.indexOf('\n[^cn-');
      const body3 = fn3 >= 0 ? disk3.slice(0, fn3) : disk3;
      expect(body3).not.toContain('Alerts are routed to PagerDuty.');
      await ctx.assertFootnoteStatus(filePath, 'cn-4', 'rejected');

      // cn-5 still proposed
      expect(disk3).toContain('{~~manual server restarts~>automated CI/CD pipelines~~}');
      await ctx.assertFootnoteStatus(filePath, 'cn-5', 'proposed');

      // ── Step 4: Approve cn-5 (final change) ───────────────────────────
      const r4 = await ctx.review(filePath, {
        reviews: [{ change_id: 'cn-5', decision: 'approve', reason: 'yes' }],
      });
      expect(r4.isError).toBeUndefined();

      const d4 = ctx.parseResult(r4);
      expect(d4.settled).toBeDefined();
      expect(d4.settled).toContain('cn-5');

      // All changes settled: body is clean
      await ctx.assertNoMarkupInBody(filePath);

      const disk4 = await ctx.readDisk(filePath);
      expect(disk4).toContain('microservices architecture');
      expect(disk4).toContain('structured error boundaries');
      expect(disk4).toContain('parameterized queries via ORM');
      expect(disk4).toContain('automated CI/CD pipelines');

      // Each footnote reflects final status
      await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');
      await ctx.assertFootnoteStatus(filePath, 'cn-2', 'accepted');
      await ctx.assertFootnoteStatus(filePath, 'cn-3', 'accepted');
      await ctx.assertFootnoteStatus(filePath, 'cn-4', 'rejected');
      await ctx.assertFootnoteStatus(filePath, 'cn-5', 'accepted');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 2: Batch settle via explicit settle flag
  // ──────────────────────────────────────────────────────────────────────────
  describe('Batch settle via explicit settle flag', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: false, auto_on_reject: false },
      });
      await ctx.setup();

      filePath = await ctx.createFile('batch.md', DOC_5_CHANGES);

      // Create 5 proposed changes
      await ctx.propose(filePath, {
        old_text: 'monolithic architecture',
        new_text: 'microservices architecture',
        reason: 'scalability',
      });
      await ctx.propose(filePath, {
        old_text: 'global try-catch blocks',
        new_text: 'structured error boundaries',
        reason: 'reliability',
      });
      await ctx.propose(filePath, {
        old_text: 'raw SQL queries',
        new_text: 'parameterized queries via ORM',
        reason: 'security',
      });
      await ctx.propose(filePath, {
        old_text: 'console.log statements',
        new_text: 'structured logging via Winston',
        reason: 'observability',
      });
      await ctx.propose(filePath, {
        old_text: 'manual server restarts',
        new_text: 'automated CI/CD pipelines',
        reason: 'deployment reliability',
      });
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('approves all, then batch settles via settle:true, verifying markup persists until settle', async () => {
      // ── Phase 1: Approve cn-1..cn-3, reject cn-4..cn-5 (no auto-settle) ──
      const reviewResult = await ctx.review(filePath, {
        reviews: [
          { change_id: 'cn-1', decision: 'approve', reason: 'good' },
          { change_id: 'cn-2', decision: 'approve', reason: 'good' },
          { change_id: 'cn-3', decision: 'approve', reason: 'good' },
          { change_id: 'cn-4', decision: 'reject', reason: 'keep current logging' },
          { change_id: 'cn-5', decision: 'reject', reason: 'not ready for CI/CD' },
        ],
      });
      expect(reviewResult.isError).toBeUndefined();

      // Decisions recorded but no settlement (auto disabled)
      const reviewData = ctx.parseResult(reviewResult);
      expect(reviewData.settled).toBeUndefined();

      // All 5 markup blocks still present in file
      const diskBefore = await ctx.readDisk(filePath);
      expect(diskBefore).toContain('{~~monolithic architecture~>microservices architecture~~}');
      expect(diskBefore).toContain('{~~global try-catch blocks~>structured error boundaries~~}');
      expect(diskBefore).toContain('{~~raw SQL queries~>parameterized queries via ORM~~}');
      expect(diskBefore).toContain('{~~console.log statements~>structured logging via Winston~~}');
      expect(diskBefore).toContain('{~~manual server restarts~>automated CI/CD pipelines~~}');

      // Footnote statuses updated
      await ctx.assertFootnoteStatus(filePath, 'cn-1', 'accepted');
      await ctx.assertFootnoteStatus(filePath, 'cn-2', 'accepted');
      await ctx.assertFootnoteStatus(filePath, 'cn-3', 'accepted');
      await ctx.assertFootnoteStatus(filePath, 'cn-4', 'rejected');
      await ctx.assertFootnoteStatus(filePath, 'cn-5', 'rejected');

      // ── Phase 2: Batch settle via settle:true ─────────────────────────
      // Note: settle:true compacts accepted changes only
      const settleResult = await ctx.review(filePath, { settle: true });
      expect(settleResult.isError).toBeUndefined();

      const settleData = ctx.parseResult(settleResult);
      expect(settleData.settled).toBeDefined();
      const settledIds = settleData.settled as string[];
      expect(settledIds).toContain('cn-1');
      expect(settledIds).toContain('cn-2');
      expect(settledIds).toContain('cn-3');

      // Accepted changes compacted: new text in body, no substitution markup for them
      const diskAfter = await ctx.readDisk(filePath);
      expect(diskAfter).toContain('microservices architecture');
      expect(diskAfter).toContain('structured error boundaries');
      expect(diskAfter).toContain('parameterized queries via ORM');
      expect(diskAfter).not.toContain('{~~monolithic architecture~>');
      expect(diskAfter).not.toContain('{~~global try-catch blocks~>');
      expect(diskAfter).not.toContain('{~~raw SQL queries~>');

      // Rejected changes still have markup (settle:true only compacts accepted)
      expect(diskAfter).toContain('{~~console.log statements~>structured logging via Winston~~}');
      expect(diskAfter).toContain('{~~manual server restarts~>automated CI/CD pipelines~~}');

      // All 5 footnotes persist
      for (let i = 1; i <= 5; i++) {
        expect(diskAfter).toContain(`[^cn-${i}]:`);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 3: Settlement preserves document structure
  // ──────────────────────────────────────────────────────────────────────────
  describe('Settlement preserves document structure', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    const STRUCTURED_DOC = `# Project Plan

## Goals

The project aims to deliver a basic MVP.

## Requirements

- User authentication via passwords
- Data export in CSV format

## Implementation

The backend uses Express.js for routing.

\`\`\`js
app.get('/api', handler);
\`\`\`

## Timeline

Development starts in Q1 with a phased rollout.`;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: true, auto_on_reject: true },
      });
      await ctx.setup();

      filePath = await ctx.createFile('structured.md', STRUCTURED_DOC);

      // cn-1: insertion after Goals heading content
      await ctx.propose(filePath, {
        old_text: '',
        new_text: ' We target 1000 users by launch.',
        insert_after: 'The project aims to deliver a basic MVP.',
        reason: 'add target metric',
      });

      // cn-2: deletion of a list item
      await ctx.propose(filePath, {
        old_text: '- Data export in CSV format\n',
        new_text: '',
        reason: 'CSV export deferred to v2',
      });

      // cn-3: substitution in Implementation section
      await ctx.propose(filePath, {
        old_text: 'Express.js',
        new_text: 'Fastify',
        reason: 'better performance',
      });

      // cn-4: insertion in code block area
      await ctx.propose(filePath, {
        old_text: '',
        new_text: '\napp.post(\'/api\', postHandler);',
        insert_after: 'app.get(\'/api\', handler);',
        reason: 'add POST endpoint',
      });

      // cn-5: substitution in timeline
      await ctx.propose(filePath, {
        old_text: 'Q1',
        new_text: 'Q2',
        reason: 'schedule shift',
      });
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('after settling all changes, document structure is intact', async () => {
      // Approve all 5 changes (auto-settle fires for each)
      const result = await ctx.review(filePath, {
        reviews: [
          { change_id: 'cn-1', decision: 'approve', reason: 'good' },
          { change_id: 'cn-2', decision: 'approve', reason: 'agreed' },
          { change_id: 'cn-3', decision: 'approve', reason: 'faster' },
          { change_id: 'cn-4', decision: 'approve', reason: 'needed' },
          { change_id: 'cn-5', decision: 'approve', reason: 'realistic' },
        ],
      });
      expect(result.isError).toBeUndefined();

      const data = ctx.parseResult(result);
      expect(data.settled).toBeDefined();
      expect((data.settled as string[]).length).toBe(5);

      // No CriticMarkup in body
      await ctx.assertNoMarkupInBody(filePath);

      const disk = await ctx.readDisk(filePath);
      // Find footnote definitions (start of line [^cn-N]:) to split body from footnotes.
      // Cannot use simple indexOf('\n[^cn-') because inline footnote refs from settled
      // deletions can appear at start of line (e.g. [^cn-2] after a deleted list item).
      const fnDefMatch = disk.match(/^(\[\^cn-\d+(?:\.\d+)?\]:)/m);
      const fnDefStart = fnDefMatch ? disk.indexOf(fnDefMatch[0]) : -1;
      const body = fnDefStart >= 0 ? disk.slice(0, fnDefStart) : disk;

      // Headings preserved
      expect(body).toContain('# Project Plan');
      expect(body).toContain('## Goals');
      expect(body).toContain('## Requirements');
      expect(body).toContain('## Implementation');
      expect(body).toContain('## Timeline');

      // Settled content correct
      expect(body).toContain('We target 1000 users by launch.');  // cn-1 insertion
      expect(body).not.toContain('Data export in CSV format');     // cn-2 deletion
      expect(body).toContain('Fastify');                           // cn-3 substitution
      expect(body).not.toContain('Express.js');
      expect(body).toContain('postHandler');                       // cn-4 insertion
      expect(body).toContain('Q2');                                // cn-5 substitution
      expect(body).not.toMatch(/\bQ1\b/);

      // List still has remaining item
      expect(body).toContain('- User authentication via passwords');

      // Footnotes at the end of the file
      expect(disk).toContain('[^cn-1]:');
      expect(disk).toContain('[^cn-2]:');
      expect(disk).toContain('[^cn-3]:');
      expect(disk).toContain('[^cn-4]:');
      expect(disk).toContain('[^cn-5]:');

      // All footnote definitions are after the body content
      expect(fnDefStart).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 4: Mixed auto-settle and manual settle
  // ──────────────────────────────────────────────────────────────────────────
  describe('Mixed auto-settle and manual settle', () => {
    let filePath: string;
    let ctx1: ScenarioContext;

    afterEach(async () => {
      // ctx1 owns the tmpDir -- clean up via it
      if (ctx1) await ctx1.teardown();
    });

    it('auto-settles first changes, then manual-settles remaining after config switch', async () => {
      // ── Phase 1: Create context with auto_on_approve = true ───────────
      ctx1 = new ScenarioContext({
        settlement: { auto_on_approve: true, auto_on_reject: false },
      });
      await ctx1.setup();

      filePath = await ctx1.createFile('mixed.md', [
        '# Config',
        '',
        'The timeout is 30 seconds.',
        '',
        'The retry count is three attempts.',
        '',
        'The batch size is one hundred items.',
      ].join('\n'));

      // Propose 3 changes
      await ctx1.propose(filePath, {
        old_text: '30 seconds',
        new_text: '60 seconds',
        reason: 'increase timeout',
      });
      await ctx1.propose(filePath, {
        old_text: 'three attempts',
        new_text: 'five attempts',
        reason: 'more retries',
      });
      await ctx1.propose(filePath, {
        old_text: 'one hundred items',
        new_text: 'five hundred items',
        reason: 'larger batches',
      });

      // Verify all 3 proposed
      await ctx1.assertFootnoteStatus(filePath, 'cn-1', 'proposed');
      await ctx1.assertFootnoteStatus(filePath, 'cn-2', 'proposed');
      await ctx1.assertFootnoteStatus(filePath, 'cn-3', 'proposed');

      // ── Phase 2: Approve cn-1 and cn-2 (auto-settled) ────────────────
      const r1 = await ctx1.review(filePath, {
        reviews: [
          { change_id: 'cn-1', decision: 'approve', reason: 'good' },
          { change_id: 'cn-2', decision: 'approve', reason: 'good' },
        ],
      });
      expect(r1.isError).toBeUndefined();

      const d1 = ctx1.parseResult(r1);
      expect(d1.settled).toBeDefined();
      expect(d1.settled).toContain('cn-1');
      expect(d1.settled).toContain('cn-2');

      // cn-1 and cn-2 are settled
      await ctx1.assertFootnoteStatus(filePath, 'cn-1', 'accepted');
      await ctx1.assertFootnoteStatus(filePath, 'cn-2', 'accepted');

      // cn-3 still has markup
      const diskMid = await ctx1.readDisk(filePath);
      expect(diskMid).toContain('60 seconds');  // cn-1 settled
      expect(diskMid).not.toContain('{~~30 seconds~>');
      expect(diskMid).toContain('{~~one hundred items~>five hundred items~~}');  // cn-3 still has markup
      await ctx1.assertFootnoteStatus(filePath, 'cn-3', 'proposed');

      // ── Phase 3: Switch to auto_on_approve = false, approve cn-3 ─────
      // Create a new ScenarioContext with auto_on_approve = false pointing
      // at the same tmpDir. We do this by creating a second context and
      // swapping its tmpDir to match ctx1's.
      const ctx2 = new ScenarioContext({
        settlement: { auto_on_approve: false, auto_on_reject: false },
      });
      await ctx2.setup();
      // Swap tmpDir to point at ctx1's directory
      const originalTmpDir = ctx2.tmpDir;
      ctx2.tmpDir = ctx1.tmpDir;

      // Re-create the resolver with the new config for ctx1's tmpDir
      ctx2.resolver = await createTestResolver(ctx1.tmpDir, {
        tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
        author: { default: 'ai:test-agent', enforcement: 'optional' },
        hooks: { enforcement: 'warn', exclude: [] },
        matching: { mode: 'normalized' },
        hashline: { enabled: true, auto_remap: false },
        settlement: { auto_on_approve: false, auto_on_reject: false },
        policy: { mode: 'safety-net', creation_tracking: 'footnote' },
        protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
      });

      // Approve cn-3 with auto_on_approve = false -> no settlement
      const r2 = await ctx2.review(filePath, {
        reviews: [{ change_id: 'cn-3', decision: 'approve', reason: 'good' }],
      });
      expect(r2.isError).toBeUndefined();

      const d2 = ctx2.parseResult(r2);
      // No settlement because auto_on_approve is now false
      expect(d2.settled).toBeUndefined();

      // cn-3 is approved but markup still present
      await ctx2.assertFootnoteStatus(filePath, 'cn-3', 'accepted');
      const diskAfterApprove = await ctx2.readDisk(filePath);
      expect(diskAfterApprove).toContain('{~~one hundred items~>five hundred items~~}');

      // ── Phase 4: Explicit settle ──────────────────────────────────────
      const r3 = await ctx2.review(filePath, { settle: true });
      expect(r3.isError).toBeUndefined();

      const d3 = ctx2.parseResult(r3);
      expect(d3.settled).toBeDefined();
      expect(d3.settled).toContain('cn-3');

      // cn-3 is now settled
      await ctx2.assertNoMarkupInBody(filePath);
      const diskFinal = await ctx2.readDisk(filePath);
      expect(diskFinal).toContain('five hundred items');
      expect(diskFinal).not.toContain('{~~one hundred items~>five hundred items~~}');

      // All 3 footnotes present
      expect(diskFinal).toContain('[^cn-1]:');
      expect(diskFinal).toContain('[^cn-2]:');
      expect(diskFinal).toContain('[^cn-3]:');

      // Clean up ctx2's original tmpDir
      await fs.rm(originalTmpDir, { recursive: true, force: true });
    });
  });
});
