import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScenarioContext } from '../scenario-context.js';

/**
 * O7: Settlement (Layer 1 compaction)
 *
 * Tests that accepted/rejected changes are compacted back to clean prose
 * while footnotes persist for the audit trail. Layer 1 settlement removes
 * inline CriticMarkup delimiters but keeps footnote refs and definitions.
 */
describe('O7: Settlement (Layer 1 compaction)', () => {

  // ── Scenario: Auto-settle on approve removes inline markup ──────────

  describe('Auto-settle on approve removes inline markup', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: true, auto_on_reject: false },
      });
      await ctx.setup();

      filePath = await ctx.createFile('doc.md', 'The API uses REST for queries.');
      await ctx.propose(filePath, {
        old_text: 'REST',
        new_text: 'GraphQL',
        reason: 'better for flexible queries',
      });
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('approving with auto_on_approve removes inline markup and keeps footnote', async () => {
      // Verify markup exists before approval
      const before = await ctx.readDisk(filePath);
      expect(before).toContain('{~~');

      const result = await ctx.review(filePath, {
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'verified' }],
      });
      expect(result.isError).toBeUndefined();

      // After auto-settlement: inline markup removed, footnote persists
      await ctx.assertNoMarkupInBody(filePath);
      await ctx.assertFootnoteStatus(filePath, 'ct-1', 'accepted');

      // The accepted text (GraphQL) is present in the body
      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('GraphQL');

      // TODO: Layer 1 settlement keeps inline footnote refs (e.g. [^ct-1]) in the body.
      // This is the current behavior — only CriticMarkup delimiters are removed,
      // footnote refs are preserved for the audit trail. Consider whether Layer 2
      // compaction should strip these.
      const footnoteStart = disk.indexOf('\n[^ct-');
      const body = footnoteStart >= 0 ? disk.slice(0, footnoteStart) : disk;
      expect(body).toContain('[^ct-1]');

      // The response indicates settlement occurred
      const parsed = ctx.parseResult(result);
      expect(parsed.settled).toBeDefined();
      expect(parsed.settled).toContain('ct-1');
    });
  });

  // ── Scenario: Auto-settle on reject removes change entirely ─────────

  describe('Auto-settle on reject removes change entirely', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: false, auto_on_reject: true },
      });
      await ctx.setup();

      filePath = await ctx.createFile('doc.md', 'The API uses REST.');
      // Insert new text
      await ctx.propose(filePath, {
        old_text: '',
        new_text: ' It supports caching.',
        insert_after: 'The API uses REST.',
        reason: 'add caching note',
      });
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('rejecting an insertion with auto_on_reject removes inserted text and delimiters', async () => {
      // Verify insertion markup exists before rejection
      const before = await ctx.readDisk(filePath);
      expect(before).toContain('{++');
      expect(before).toContain('It supports caching.');

      const result = await ctx.review(filePath, {
        reviews: [{ change_id: 'ct-1', decision: 'reject', reason: 'not needed' }],
      });
      expect(result.isError).toBeUndefined();

      // After auto-settlement of rejected insertion: inserted text is gone
      const disk = await ctx.readDisk(filePath);
      const footnoteStart = disk.indexOf('\n[^ct-');
      const body = footnoteStart >= 0 ? disk.slice(0, footnoteStart) : disk;
      expect(body).not.toContain('It supports caching.');

      // TODO: Layer 1 settlement keeps inline footnote refs in the body (see above).
      expect(body).toContain('[^ct-1]');

      // Inline markup gone
      await ctx.assertNoMarkupInBody(filePath);

      // Footnote persists with rejected status
      await ctx.assertFootnoteStatus(filePath, 'ct-1', 'rejected');
    });
  });

  // ── Scenario: Manual settle via review_changes settle flag ──────────

  describe('Manual settle via review_changes settle flag', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: false, auto_on_reject: false },
      });
      await ctx.setup();

      filePath = await ctx.createFile('doc.md', 'Enable caching layer.');
      await ctx.propose(filePath, {
        old_text: 'caching',
        new_text: 'Redis caching',
        reason: 'specificity',
      });
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('approving without auto-settle keeps markup, then settle flag compacts', async () => {
      // Step 1: Approve (markup persists because auto_on_approve = false)
      await ctx.review(filePath, {
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'good call' }],
      });

      const afterApprove = await ctx.readDisk(filePath);
      expect(afterApprove).toContain('{~~');  // Markup still present
      await ctx.assertFootnoteStatus(filePath, 'ct-1', 'accepted');

      // Step 2: Call review_changes with settle = true
      const settleResult = await ctx.review(filePath, { settle: true });
      expect(settleResult.isError).toBeUndefined();

      // After explicit settle: markup removed, footnote persists
      await ctx.assertNoMarkupInBody(filePath);
      await ctx.assertFootnoteStatus(filePath, 'ct-1', 'accepted');

      const disk = await ctx.readDisk(filePath);
      expect(disk).toContain('Redis caching');
      expect(disk).toContain('[^ct-1]:');

      // TODO: Layer 1 settlement keeps inline footnote refs in the body (see above).
      const footnoteStart2 = disk.indexOf('\n[^ct-');
      const body2 = footnoteStart2 >= 0 ? disk.slice(0, footnoteStart2) : disk;
      expect(body2).toContain('[^ct-1]');
    });
  });

  // ── Scenario: Settlement of substitution keeps new text ─────────────

  describe('Settlement of substitution keeps new text', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: true, auto_on_reject: false },
      });
      await ctx.setup();

      filePath = await ctx.createFile('doc.md', 'The API uses REST for data fetching.');
      await ctx.propose(filePath, {
        old_text: 'REST',
        new_text: 'GraphQL',
        reason: 'flexibility',
      });
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('after settling a substitution, new text remains and old text is gone from body', async () => {
      const result = await ctx.review(filePath, {
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'verified' }],
      });
      expect(result.isError).toBeUndefined();

      await ctx.assertNoMarkupInBody(filePath);

      const disk = await ctx.readDisk(filePath);
      const footnoteStart = disk.indexOf('\n[^ct-');
      const body = footnoteStart >= 0 ? disk.slice(0, footnoteStart) : disk;

      // New text present
      expect(body).toContain('GraphQL');
      // Old text gone from body
      expect(body).not.toContain('REST');
      // TODO: Layer 1 settlement keeps inline footnote refs in the body (see above).
      expect(body).toContain('[^ct-1]');
      // Footnote persists
      expect(disk).toContain('[^ct-1]:');
    });
  });

  // ── Scenario: Settlement of deletion removes text ───────────────────

  describe('Settlement of deletion removes text', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: true, auto_on_reject: false },
      });
      await ctx.setup();

      filePath = await ctx.createFile('doc.md', 'Keep this. Remove this. And keep this too.');
      await ctx.propose(filePath, {
        old_text: 'Remove this. ',
        new_text: '',
        reason: 'unnecessary content',
      });
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('after settling a deletion approval, deleted text is gone from body', async () => {
      const result = await ctx.review(filePath, {
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'agreed' }],
      });
      expect(result.isError).toBeUndefined();

      await ctx.assertNoMarkupInBody(filePath);

      const disk = await ctx.readDisk(filePath);
      const footnoteStart = disk.indexOf('\n[^ct-');
      const body = footnoteStart >= 0 ? disk.slice(0, footnoteStart) : disk;

      // Deleted text gone
      expect(body).not.toContain('Remove this.');
      // Surrounding text preserved
      expect(body).toContain('Keep this.');
      expect(body).toContain('And keep this too.');
      // TODO: Layer 1 settlement keeps inline footnote refs in the body (see above).
      expect(body).toContain('[^ct-1]');
      // Footnote persists
      expect(disk).toContain('[^ct-1]:');
      await ctx.assertFootnoteStatus(filePath, 'ct-1', 'accepted');
    });
  });

  // ── Scenario: Footnotes persist after Layer 1 settlement ────────────

  describe('Footnotes persist after Layer 1 settlement', () => {
    let ctx: ScenarioContext;
    let filePath: string;

    beforeEach(async () => {
      ctx = new ScenarioContext({
        settlement: { auto_on_approve: true, auto_on_reject: true },
      });
      await ctx.setup();

      filePath = await ctx.createFile('doc.md', 'First sentence. Second sentence. Third sentence.');
      // Create two changes: one to accept, one to reject
      await ctx.propose(filePath, {
        old_text: 'First',
        new_text: 'Opening',
        reason: 'clarity',
      });
      await ctx.propose(filePath, {
        old_text: '',
        new_text: ' Extra detail.',
        insert_after: 'Third sentence.',
        reason: 'completeness',
      });
    });

    afterEach(async () => {
      await ctx.teardown();
    });

    it('after settling both accepted and rejected changes, all footnotes persist', async () => {
      // Accept ct-1 (substitution), reject ct-2 (insertion)
      const result = await ctx.review(filePath, {
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'good rename' },
          { change_id: 'ct-2', decision: 'reject', reason: 'too verbose' },
        ],
      });
      expect(result.isError).toBeUndefined();

      // No inline markup in body
      await ctx.assertNoMarkupInBody(filePath);

      const disk = await ctx.readDisk(filePath);

      // Both footnotes persist (Layer 1 keeps footnotes)
      expect(disk).toContain('[^ct-1]:');
      expect(disk).toContain('[^ct-2]:');

      // Each has correct status
      await ctx.assertFootnoteStatus(filePath, 'ct-1', 'accepted');
      await ctx.assertFootnoteStatus(filePath, 'ct-2', 'rejected');

      // Accepted substitution: new text present
      const footnoteStart = disk.indexOf('\n[^ct-');
      const body = footnoteStart >= 0 ? disk.slice(0, footnoteStart) : disk;
      expect(body).toContain('Opening');
      expect(body).not.toContain('{~~');

      // TODO: Layer 1 settlement keeps inline footnote refs in the body (see above).
      expect(body).toContain('[^ct-1]');
      expect(body).toContain('[^ct-2]');

      // Rejected insertion: inserted text removed
      expect(body).not.toContain('Extra detail.');
    });
  });
});
