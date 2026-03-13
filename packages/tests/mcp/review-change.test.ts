import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleReviewChange } from '@changetracks/mcp/internals';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const TODAY = new Date().toISOString().slice(0, 10);
const TS_RE = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z';

describe('handleReviewChange', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-review-test-'));
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
        enforcement: 'warn', exclude: [],
      },
      matching: {
        mode: 'normalized',
      },
      hashline: {
        enabled: false,
        auto_remap: false,
      },
      settlement: { auto_on_approve: false, auto_on_reject: false },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── Helper: create a file with a proposed change ─────────────────────

  async function createFileWithProposedChange(filename = 'doc.md'): Promise<string> {
    const filePath = path.join(tmpDir, filename);
    await fs.writeFile(filePath, 'The quick brown fox jumps over the lazy dog.');

    await handleProposeChange(
      { file: filePath, old_text: 'quick brown', new_text: 'slow red', reason: 'Better color' },
      resolver,
      state
    );

    return filePath;
  }

  // ─── 1. Approve updates status and appends line ─────────────────────

  it('approve updates status to "accepted" and appends approved: line', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Looks good' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.decision).toBe('approve');
    expect(data.status_updated).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');

    // Header status changed from proposed to accepted
    expect(modified).toContain(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | accepted`);
    expect(modified).not.toContain('| proposed');

    // Approved line added with correct format
    expect(modified).toMatch(new RegExp(`    approved: @ai:claude-opus-4.6 ${TS_RE} "Looks good"`));
  });

  // ─── 2. Reject updates status ────────────────────────────────────────

  it('reject updates status to "rejected" and appends rejected: line', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'reject', reason: 'Not needed' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.decision).toBe('reject');
    expect(data.status_updated).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');

    // Header status changed from proposed to rejected
    expect(modified).toContain(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | rejected`);
    expect(modified).not.toContain('| proposed');

    // Rejected line added
    expect(modified).toMatch(new RegExp(`    rejected: @ai:claude-opus-4.6 ${TS_RE} "Not needed"`));
  });

  // ─── 3. request_changes does NOT change status ───────────────────────

  it('request_changes does NOT change status but adds request-changes: line', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'request_changes', reason: 'Need more context' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.decision).toBe('request_changes');
    expect(data.status_updated).toBe(false);

    const modified = await fs.readFile(filePath, 'utf-8');

    // Status stays proposed
    expect(modified).toContain('| proposed');
    expect(modified).not.toContain('| accepted');
    expect(modified).not.toContain('| rejected');

    // Request-changes line added (hyphenated keyword, not underscore)
    expect(modified).toMatch(new RegExp(`    request-changes: @ai:claude-opus-4.6 ${TS_RE} "Need more context"`));
  });

  // ─── 4. Reasoning is quoted in the review line ───────────────────────

  it('reasoning text appears quoted in the review line', async () => {
    const filePath = await createFileWithProposedChange();

    await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Improved clarity and tone' },
      resolver,
      state
    );

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('"Improved clarity and tone"');
  });

  // ─── 5. Error: missing required args ─────────────────────────────────

  it('error when file is missing', async () => {
    const result = await handleReviewChange(
      { change_id: 'ct-1', decision: 'approve', reason: 'ok' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/file/i);
  });

  it('error when change_id is missing', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, decision: 'approve', reason: 'ok' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/change_id/i);
  });

  it('error when decision is missing', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', reason: 'ok' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/decision/i);
  });

  it('error when reasoning is missing', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/reason/i);
  });

  // ─── 6. Error: change_id not found ───────────────────────────────────

  it('error when change_id footnote not found in file', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-99', decision: 'approve', reason: 'ok' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/ct-99|not found/i);
  });

  // ─── 7. Error: file not in scope ─────────────────────────────────────

  it('error when file is not in scope', async () => {
    const filePath = path.join(tmpDir, 'code.ts');
    await fs.writeFile(filePath, 'const x = 1;');

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'ok' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not in scope/i);
  });

  // ─── 8. Error: file not found ────────────────────────────────────────

  it('error when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'ok' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|ENOENT/i);
  });

  // ─── 9. Multiple reviews on same change ──────────────────────────────

  it('multiple reviews on same change: both lines present', async () => {
    const filePath = await createFileWithProposedChange();

    // First review: approve
    await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Looks good' },
      resolver,
      state
    );

    // Second review: request_changes
    await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'request_changes', reason: 'Actually needs work' },
      resolver,
      state
    );

    const modified = await fs.readFile(filePath, 'utf-8');

    // Both review lines present
    expect(modified).toMatch(new RegExp(`    approved: @ai:claude-opus-4.6 ${TS_RE} "Looks good"`));
    expect(modified).toMatch(new RegExp(`    request-changes: @ai:claude-opus-4.6 ${TS_RE} "Actually needs work"`));
  });

  // ─── 10. Review with existing discussion lines ───────────────────────

  it('review inserted at correct position when footnote has existing discussion', async () => {
    const filePath = path.join(tmpDir, 'doc.md');

    // Manually create a file with a footnote that already has discussion content
    const content = [
      'The {~~quick brown~>slow red~~}[^ct-1] fox.',
      '',
      `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Better color`,
      '    @human:alice 2026-02-10: I think this is good',
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Agreed with Alice' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');

    // Status updated
    expect(modified).toContain('| accepted');

    // Review line inserted after existing discussion content
    expect(modified).toMatch(new RegExp(`    approved: @ai:claude-opus-4.6 ${TS_RE} "Agreed with Alice"`));

    // Original discussion line still present
    expect(modified).toContain('    @human:alice 2026-02-10: I think this is good');
    expect(modified).toContain(`    @ai:claude-opus-4.6 ${TODAY}: Better color`);
  });

  // ─── 11. Relative file path resolution ───────────────────────────────

  it('resolves relative file path against projectDir', async () => {
    const subDir = path.join(tmpDir, 'docs');
    await fs.mkdir(subDir);
    const filePath = path.join(subDir, 'notes.md');

    // Create a file with a proposed change manually
    const content = [
      'Hello {~~world~>earth~~}[^ct-1] end.',
      '',
      `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: More specific term`,
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleReviewChange(
      { file: 'docs/notes.md', change_id: 'ct-1', decision: 'approve', reason: 'Good change' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('| accepted');
    expect(modified).toMatch(new RegExp(`    approved: @ai:claude-opus-4.6 ${TS_RE} "Good change"`));
  });

  // ─── 12. Review preserves inline content and other footnotes ─────────

  it('review does not corrupt inline content or other footnotes', async () => {
    const filePath = path.join(tmpDir, 'multi.md');

    const content = [
      'First {~~old~>new~~}[^ct-1] sentence.',
      'Second {--removed--}[^ct-2] sentence.',
      '',
      `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improvement`,
      '',
      `[^ct-2]: @ai:claude-opus-4.6 | ${TODAY} | del | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Cleanup`,
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Good' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');

    // ct-1 updated
    expect(modified).toContain(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | accepted`);
    expect(modified).toMatch(new RegExp(`    approved: @ai:claude-opus-4.6 ${TS_RE} "Good"`));

    // ct-2 untouched
    expect(modified).toContain(`[^ct-2]: @ai:claude-opus-4.6 | ${TODAY} | del | proposed`);

    // Inline content preserved
    expect(modified).toContain('First {~~old~>new~~}[^ct-1] sentence.');
    expect(modified).toContain('Second {--removed--}[^ct-2] sentence.');
  });

  // ─── 13. Review line inserted before resolved/open lines ─────────────

  it('review line inserted before resolved line in footnote', async () => {
    const filePath = path.join(tmpDir, 'doc.md');

    const content = [
      'The {~~quick~>slow~~}[^ct-1] fox.',
      '',
      `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Slower is better`,
      '    resolved @human:alice 2026-02-10: Done',
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Agreed' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    // Find positions
    const approvedIdx = lines.findIndex(l => l.includes('approved:'));
    const resolvedIdx = lines.findIndex(l => l.includes('resolved'));

    // Approved line appears before resolved line
    expect(approvedIdx).toBeGreaterThan(-1);
    expect(resolvedIdx).toBeGreaterThan(-1);
    expect(approvedIdx).toBeLessThan(resolvedIdx);
  });

  // ─── 13b. Review line inserted before bare "open" resolution ────────

  it('review line inserted before bare "open" resolution (no reason)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');

    const content = [
      'The {~~quick~>slow~~}[^ct-1] fox.',
      '',
      `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Slower is better`,
      '    open',
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Agreed' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    const approvedIdx = lines.findIndex(l => l.includes('approved:'));
    const openIdx = lines.findIndex(l => l.trim() === 'open');

    expect(approvedIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(-1);
    expect(approvedIdx).toBeLessThan(openIdx);
  });

  // ─── 14. Error: malformed footnote header ───────────────────────────

  it('error when footnote header is malformed (fewer than 4 pipe-separated parts)', async () => {
    const filePath = path.join(tmpDir, 'bad.md');
    await fs.writeFile(filePath, [
      'The {~~quick~>slow~~}[^ct-1] fox.',
      '',
      '[^ct-1]: just some text without pipes',
      `    @ai:claude-opus-4.6 ${TODAY}: Malformed header`,
    ].join('\n'));

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'ok' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/malformed metadata for change/i);
  });

  // ─── 15. Explicit author parameter ──────────────────────────────────

  it('uses explicit author parameter when provided', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Looks good', author: 'ai:claude-sonnet-4.5' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Should use the explicit author, not the config default
    expect(modified).toMatch(new RegExp(`    approved: @ai:claude-sonnet-4.5 ${TS_RE} "Looks good"`));
    // The original footnote header will still have the default author from propose_change
    // but the review line should use the explicit author
    const lines = modified.split('\n');
    const approvedLine = lines.find(l => l.includes('approved:'));
    expect(approvedLine).toContain('@ai:claude-sonnet-4.5');
  });

  // ─── 16. Author enforcement ────────────────────────────────────────

  it('enforcement=required without author returns error', async () => {
    const filePath = await createFileWithProposedChange();

    const requiredConfig: ChangeTracksConfig = {
      ...config,
      author: { default: 'ai:claude-opus-4.6', enforcement: 'required' },
    };
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Looks good' },
      requiredResolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires an author parameter');

    // File must NOT have a review line added
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).not.toContain('approved:');
  });

  it('enforcement=required with author succeeds', async () => {
    const filePath = await createFileWithProposedChange();

    const requiredConfig: ChangeTracksConfig = {
      ...config,
      author: { default: 'ai:claude-opus-4.6', enforcement: 'required' },
    };
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Looks good', author: 'ai:claude-sonnet-4.5' },
      requiredResolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`    approved: @ai:claude-sonnet-4.5 ${TS_RE} "Looks good"`));
  });

  it('uses config default author when author parameter is omitted', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Looks good' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Should use the config default
    expect(modified).toMatch(new RegExp(`    approved: @ai:claude-opus-4.6 ${TS_RE} "Looks good"`));
  });

  // ─── Idempotency: re-approving / re-rejecting (Bug 5) ───────────────

  it('re-approving an already-accepted change is a no-op (no duplicate approval)', async () => {
    const filePath = await createFileWithProposedChange();

    // First approval
    await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Looks good', author: 'ai:test' },
      resolver,
      state,
    );

    // Second approval — should be idempotent
    const statBefore = (await fs.stat(filePath)).mtimeMs;

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Already accepted', author: 'ai:test' },
      resolver,
      state,
    );

    const statAfter = (await fs.stat(filePath)).mtimeMs;
    expect(statAfter).toBe(statBefore);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status_updated).toBe(false);

    const content = await fs.readFile(filePath, 'utf-8');
    const approvalCount = (content.match(/approved:/g) || []).length;
    expect(approvalCount).toBe(1);
  });

  it('re-approving returns reason "already_accepted"', async () => {
    const filePath = await createFileWithProposedChange();

    // First approval
    await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'LGTM', author: 'ai:test' },
      resolver,
      state,
    );

    // Second approval — should be idempotent with reason
    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Still LGTM', author: 'ai:test' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status_updated).toBe(false);
    expect(data.reason).toBe('already_accepted');
  });

  it('re-rejecting an already-rejected change is a no-op', async () => {
    const filePath = await createFileWithProposedChange();

    await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'reject', reason: 'No', author: 'ai:test' },
      resolver,
      state,
    );

    const statBefore = (await fs.stat(filePath)).mtimeMs;

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'reject', reason: 'Still no', author: 'ai:test' },
      resolver,
      state,
    );

    const statAfter = (await fs.stat(filePath)).mtimeMs;
    expect(statAfter).toBe(statBefore);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status_updated).toBe(false);

    const content = await fs.readFile(filePath, 'utf-8');
    const rejectionCount = (content.match(/rejected:/g) || []).length;
    expect(rejectionCount).toBe(1);
  });

  it('re-rejecting returns reason "already_rejected"', async () => {
    const filePath = await createFileWithProposedChange();

    // First rejection
    await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'reject', reason: 'No', author: 'ai:test' },
      resolver,
      state,
    );

    // Second rejection — should be idempotent with reason
    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'reject', reason: 'Still no', author: 'ai:test' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status_updated).toBe(false);
    expect(data.reason).toBe('already_rejected');
  });

  it('request_changes returns reason "request_changes_no_status_change"', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'request_changes', reason: 'Need more context', author: 'ai:test' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status_updated).toBe(false);
    expect(data.reason).toBe('request_changes_no_status_change');
  });

  // ─── Settlement: auto_on_approve preserves footnotes (BUG-001) ───────

  it('auto_on_approve removes inline markup but preserves footnote definition and reference', async () => {
    // Create a new resolver with auto_on_approve enabled
    const settlementConfig: ChangeTracksConfig = {
      ...config,
      settlement: { auto_on_approve: true, auto_on_reject: true },
    };
    const settlementResolver = await createTestResolver(tmpDir, settlementConfig);

    const filePath = path.join(tmpDir, 'settlement-test.md');
    await fs.writeFile(filePath, 'The quick brown fox jumps over the lazy dog.');

    // Create a proposed change
    await handleProposeChange(
      { file: filePath, old_text: 'quick brown', new_text: 'slow red', reason: 'Better color', author: 'ai:test-author' },
      settlementResolver,
      state
    );

    let content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{~~quick brown~>slow red~~}[^ct-1]');
    expect(content).toContain(`[^ct-1]: @ai:test-author | ${TODAY} | sub | proposed`);

    // Approve the change with settlement enabled
    const result = await handleReviewChange(
      { file: filePath, change_id: 'ct-1', decision: 'approve', reason: 'Good change', author: 'ai:reviewer' },
      settlementResolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.settled).toEqual(['ct-1']);

    content = await fs.readFile(filePath, 'utf-8');

    // BUG-001 FIX: Inline markup should be removed but footnote ref and definition should remain
    expect(content).not.toContain('{~~');  // Markup removed
    expect(content).not.toContain('~~}');
    expect(content).toContain('slow red[^ct-1]');  // Content + footnote ref preserved
    expect(content).toContain(`[^ct-1]: @ai:test-author | ${TODAY} | sub | accepted`);  // Footnote definition preserved with accepted status
    expect(content).toMatch(new RegExp(`    approved: @ai:reviewer ${TS_RE} "Good change"`));  // Review line preserved
  });
});
