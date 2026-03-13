import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleReviewChanges } from '@changetracks/mcp/internals';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const TODAY = new Date().toISOString().slice(0, 10);

describe('handleReviewChanges', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-review-changes-test-'));
    state = new SessionState();
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: true,
      },
      author: {
        default: 'ai:claude-opus-4.6',
        enforcement: 'optional',
      },
      hooks: {
        enforcement: 'warn',
        exclude: [],
      },
      matching: {
        mode: 'normalized',
      },
      hashline: {
        enabled: false,
        auto_remap: false,
      },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createFileWithProposedChanges(count: number): Promise<string> {
    const filePath = path.join(tmpDir, 'doc.md');
    const parts = ['The quick brown fox.', 'First part.', 'Second part.', 'Third part.'];
    const content = parts.slice(0, Math.max(1, count + 1)).join(' ');
    await fs.writeFile(filePath, content);

    const replacements: [string, string][] = [
      ['quick brown', 'slow red'],
      ['First part', 'ct-2 replacement'],
      ['Second part', 'ct-3 replacement'],
    ];
    for (let i = 0; i < count; i++) {
      const [oldText, newText] = replacements[i] ?? [`part-${i}`, `ct-${i + 1}`];
      await handleProposeChange(
        {
          file: filePath,
          old_text: oldText,
          new_text: newText,
          reason: `Change ${i + 1}`,
        },
        resolver,
        state
      );
    }
    return filePath;
  }

  it('single review (degenerate case): behaves like singular review_change', async () => {
    const filePath = await createFileWithProposedChanges(1);

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'Looks good' },
        ],
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.file).toBe(path.relative(tmpDir, filePath));
    expect(data.results).toHaveLength(1);
    expect(data.results[0].change_id).toBe('ct-1');
    expect(data.results[0].decision).toBe('approve');
    expect(data.results[0].status_updated).toBe(true);
    expect(data.document_state).toBeDefined();
    expect(data.document_state.remaining_proposed).toBe(0);
    expect(data.document_state.all_resolved).toBe(true);
    expect(data.note).toContain('No proposed changes remain');
    expect(data.settled).toEqual(['ct-1']);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('slow red');
    expect(modified).not.toContain('{~~'); // Markup removed
    // BUG-001 fix: Footnote definition preserved after settlement
    expect(modified).toContain('[^ct-1]:'); // Footnote kept for audit trail
    expect(modified).toContain('[^ct-1]'); // Inline ref kept
  });

  it('three reviews: approve 2, reject 1 — each footnote gets its own entry', async () => {
    const filePath = await createFileWithProposedChanges(3);

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'Good' },
          { change_id: 'ct-2', decision: 'reject', reason: 'Not needed' },
          { change_id: 'ct-3', decision: 'approve', reason: 'Keep' },
        ],
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results).toHaveLength(3);

    expect(data.results[0].change_id).toBe('ct-1');
    expect(data.results[0].decision).toBe('approve');
    expect(data.results[0].status_updated).toBe(true);

    expect(data.results[1].change_id).toBe('ct-2');
    expect(data.results[1].decision).toBe('reject');
    expect(data.results[1].status_updated).toBe(true);

    expect(data.results[2].change_id).toBe('ct-3');
    expect(data.results[2].decision).toBe('approve');
    expect(data.results[2].status_updated).toBe(true);
    expect(data.document_state.remaining_proposed).toBe(0);
    expect(data.settled).toContain('ct-1');
    expect(data.settled).toContain('ct-3');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('| rejected');
    expect(modified).toContain('    rejected:');
    expect(modified).toContain('slow red');
    expect(modified).toContain('ct-3 replacement');
  });

  it('invalid change_id in array: partial success, other reviews still apply', async () => {
    const filePath = await createFileWithProposedChanges(2);

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'Good' },
          { change_id: 'ct-99', decision: 'approve', reason: 'Missing' },
          { change_id: 'ct-2', decision: 'reject', reason: 'Drop' },
        ],
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results).toHaveLength(3);

    expect(data.results[0].change_id).toBe('ct-1');
    expect(data.results[0].status_updated).toBe(true);

    expect(data.results[1].change_id).toBe('ct-99');
    expect(data.results[1].error).toBeDefined();
    expect(data.results[1].status_updated).toBeUndefined();

    expect(data.results[2].change_id).toBe('ct-2');
    expect(data.results[2].status_updated).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('[^ct-2]:');
    expect(modified).toContain('| rejected');
    expect(modified).toContain('slow red');
  });

  it('author enforcement: single author at top level used for all reviews', async () => {
    const filePath = await createFileWithProposedChanges(1);

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'OK' },
        ],
        author: 'ai:claude-sonnet-4.5',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].decision).toBe('approve');
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('slow red');
  });

  it('error when file is missing', async () => {
    const result = await handleReviewChanges(
      {
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'ok' },
        ],
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/file/i);
  });

  it('returns reason when status_updated is false (batch idempotency)', async () => {
    const filePath = await createFileWithProposedChanges(1);

    // First approval
    await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'LGTM' },
        ],
      },
      resolver,
      state,
    );

    // Approve again — should be idempotent with reason
    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'Still LGTM' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].status_updated).toBe(false);
    expect(data.results[0].reason).toBe('already_accepted');
  });

  it('returns reason "already_rejected" for re-rejection in batch', async () => {
    const filePath = await createFileWithProposedChanges(1);

    // First rejection
    await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'reject', reason: 'No' },
        ],
      },
      resolver,
      state,
    );

    // Reject again
    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'reject', reason: 'Still no' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].status_updated).toBe(false);
    expect(data.results[0].reason).toBe('already_rejected');
  });

  it('returns reason "request_changes_no_status_change" for request_changes in batch', async () => {
    const filePath = await createFileWithProposedChanges(1);

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'request_changes', reason: 'Need more context' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].status_updated).toBe(false);
    expect(data.results[0].reason).toBe('request_changes_no_status_change');
  });

  it('error when reviews array is empty', async () => {
    const filePath = await createFileWithProposedChanges(1);

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [],
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/reviews|minItems/i);
  });

  // ── affected_lines on settlement ──────────────────────────────────────

  it('returns affected_lines after auto-settlement on approve', async () => {
    // Use createFileWithProposedChanges which creates a substitution change
    // Default config has auto_on_approve: true and hashline: { enabled: false }
    const filePath = await createFileWithProposedChanges(1);

    // Approve the change — triggers auto-settlement
    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'Good change' }],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    // Settlement happened
    expect(data.settled).toContain('ct-1');

    // affected_lines present and contains post-settlement content
    expect(data.affected_lines).toBeDefined();
    expect(Array.isArray(data.affected_lines)).toBe(true);
    expect(data.affected_lines.length).toBeGreaterThan(0);

    // Find the line with the settled content (substitution: 'quick brown' → 'slow red')
    const settledLine = data.affected_lines.find(
      (entry: { content: string }) => entry.content.includes('slow red')
    );
    expect(settledLine).toBeDefined();
    expect(settledLine.line).toBeGreaterThanOrEqual(1);
    expect(settledLine.content).toContain('slow red');
    // Should NOT contain CriticMarkup for the settled change
    expect(settledLine.content).not.toContain('{~~');

    // No hashes when hashline is disabled
    expect(settledLine.hash).toBeUndefined();
  });

  it('returns affected_lines with hashes when hashline enabled', async () => {
    const hashConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: true, auto_remap: false },
      settlement: { ...config.settlement, auto_on_approve: true },
    };
    const hashResolver = await createTestResolver(tmpDir, hashConfig);
    const hashState = new SessionState();

    // Manually construct a file with CriticMarkup and footnotes
    // (bypasses propose to avoid worktree-specific module init issues)
    const filePath = path.join(tmpDir, 'hash-doc.md');
    const today = new Date().toISOString().slice(0, 10);
    const fileContent = [
      'The {~~quick brown~>slow red~~}[^ct-1] fox.',
      '',
      `[^ct-1]: @ai:claude-opus-4.6 | ${today} | sub | proposed`,
    ].join('\n');
    await fs.writeFile(filePath, fileContent);

    // Approve — triggers auto-settlement
    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'Good change' }],
      },
      hashResolver,
      hashState,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    // Settlement happened
    expect(data.settled).toContain('ct-1');

    // affected_lines present with hash values
    expect(data.affected_lines).toBeDefined();
    expect(Array.isArray(data.affected_lines)).toBe(true);
    expect(data.affected_lines.length).toBeGreaterThan(0);

    // Find the line with the settled content
    const settledLine = data.affected_lines.find(
      (entry: { content: string }) => entry.content.includes('slow red')
    );
    expect(settledLine).toBeDefined();
    expect(settledLine.hash).toBeDefined();
    expect(typeof settledLine.hash).toBe('string');
    expect(settledLine.hash).toMatch(/^[0-9a-f]{2}$/);
  });

  it('does not return affected_lines when no settlement occurs', async () => {
    const filePath = await createFileWithProposedChanges(1);

    // Only respond to thread — no accept/reject, no settlement
    const result = await handleReviewChanges(
      {
        file: filePath,
        responses: [
          { change_id: 'ct-1', response: 'Could you explain the reasoning?' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    // No settlement
    expect(data.settled).toBeUndefined();
    // No affected_lines
    expect(data.affected_lines).toBeUndefined();
  });

  // ── Auto-promotion: Level 0 → Level 2 on review ───────────────────────

  it('auto-promotes a Level 0 insertion change to Level 2 on approve', async () => {
    const filePath = path.join(tmpDir, 'bare-change.md');
    // Write a file with a bare Level 0 CriticMarkup change (no footnote, no inline ref)
    await fs.writeFile(filePath, 'Hello {++world++}');

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'looks good' }],
        author: 'ai:test-model',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].change_id).toBe('ct-1');
    expect(data.results[0].status_updated).toBe(true);

    const fileAfter = await fs.readFile(filePath, 'utf-8');
    // The inline ref must have been inserted
    expect(fileAfter).toContain('[^ct-1]');
    // The footnote definition must have been appended
    expect(fileAfter).toContain('[^ct-1]:');
    // Footnote should show accepted status (auto-settlement settles approved changes)
    expect(fileAfter).toContain('| accepted');
  });

  it('auto-promotes a Level 0 deletion change to Level 2 on reject', async () => {
    const filePath = path.join(tmpDir, 'bare-del-change.md');
    await fs.writeFile(filePath, 'Hello {--world--} there');

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [{ change_id: 'ct-1', decision: 'reject', reason: 'keep it' }],
        author: 'ai:test-model',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].change_id).toBe('ct-1');
    expect(data.results[0].status_updated).toBe(true);

    const fileAfter = await fs.readFile(filePath, 'utf-8');
    expect(fileAfter).toContain('[^ct-1]:');
    expect(fileAfter).toContain('| rejected');
  });

  it('auto-promotes a Level 0 substitution to Level 2 on approve', async () => {
    const filePath = path.join(tmpDir, 'bare-sub-change.md');
    await fs.writeFile(filePath, 'The {~~quick~>fast~~} fox');

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [{ change_id: 'ct-1', decision: 'approve', reason: 'better word' }],
        author: 'ai:test-model',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].change_id).toBe('ct-1');
    expect(data.results[0].status_updated).toBe(true);

    const fileAfter = await fs.readFile(filePath, 'utf-8');
    expect(fileAfter).toContain('[^ct-1]:');
    // The type abbreviation for substitution should be 'sub'
    expect(fileAfter).toContain('| sub |');
  });

  it('still fails with error for a genuinely unknown change_id on Level 0 file', async () => {
    const filePath = path.join(tmpDir, 'bare-unknown.md');
    await fs.writeFile(filePath, 'Hello {++world++}');

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [{ change_id: 'ct-99', decision: 'approve', reason: 'wrong id' }],
        author: 'ai:test-model',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined(); // batch never fails at top level
    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].error).toBeDefined();
    expect(data.results[0].error).toContain('ct-99');
  });
});
