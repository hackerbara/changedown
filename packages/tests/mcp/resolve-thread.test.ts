import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Dynamically import since we'll add the export in step 3
const { handleResolveThread } = await import('changetracks/engine');

const TODAY = new Date().toISOString().slice(0, 10);
const TS_RE = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z';

describe('handleResolveThread', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-resolve-thread-test-'));
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
        enforcement: 'warn', exclude: [], intercept_tools: true, intercept_bash: false,
      },
      matching: {
        mode: 'normalized',
      },
      hashline: {
        enabled: false,
        auto_remap: false,
      },
      settlement: { auto_on_approve: false, auto_on_reject: false },
      coherence: { threshold: 98 },
      review: {
        may_review: { human: true, agent: true },
        self_acceptance: { human: true, agent: true },
        cross_withdrawal: { human: false, agent: false },
        blocking_labels: {},
      },
      reasoning: {
        propose: { human: false, agent: true },
        review: { human: false, agent: true },
      },
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

  // ─── 1. Resolve action appends resolved: line ─────────────────────────

  it('resolve action appends resolved: line', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-1', action: 'resolve' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.action).toBe('resolve');
    expect(data.success).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`    resolved: @ai:claude-opus-4.6 ${TS_RE}`));
  });

  // ─── 2. Unresolve action removes resolved: line ───────────────────────

  it('unresolve action removes resolved: line', async () => {
    const filePath = path.join(tmpDir, 'doc.md');

    // Create a file with a resolved change
    const content = [
      'The {~~quick brown~>slow red~~}[^ct-1] fox.',
      '',
      `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Better color`,
      `    resolved: @ai:claude-opus-4.6 2026-03-22T10:00:00Z`,
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-1', action: 'unresolve' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.action).toBe('unresolve');
    expect(data.success).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).not.toContain('resolved:');
  });

  // ─── 3. Defaults action to resolve when not specified ─────────────────

  it('defaults action to resolve when not specified', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-1' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.action).toBe('resolve');
    expect(data.success).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`    resolved: @ai:claude-opus-4.6 ${TS_RE}`));
  });

  // ─── 4. Error: missing required args ──────────────────────────────────

  it('error when file is missing', async () => {
    const result = await handleResolveThread(
      { change_id: 'ct-1', action: 'resolve' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/file/i);
  });

  it('error when change_id is missing', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleResolveThread(
      { file: filePath, action: 'resolve' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/change_id/i);
  });

  // ─── 5. Error: change_id not found ────────────────────────────────────

  it('error when change_id footnote not found in file', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-99', action: 'resolve' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/ct-99|not found/i);
  });

  // ─── 6. Error: file not in scope ──────────────────────────────────────

  it('error when file is not in scope', async () => {
    const filePath = path.join(tmpDir, 'code.ts');
    await fs.writeFile(filePath, 'const x = 1;');

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-1', action: 'resolve' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not in scope/i);
  });

  // ─── 7. Error: file not found ─────────────────────────────────────────

  it('error when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-1', action: 'resolve' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|ENOENT/i);
  });

  // ─── 8. Error: invalid action ─────────────────────────────────────────

  it('error when action is invalid', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-1', action: 'destroy' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/invalid action/i);
  });

  // ─── 9. Unresolve on non-resolved change is a no-op ───────────────────

  it('unresolve on change without resolved line returns no-op', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-1', action: 'unresolve' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(false);
    expect(data.reason).toMatch(/no resolved/i);
  });

  // ─── 10. Explicit author parameter ────────────────────────────────────

  it('uses explicit author parameter when provided', async () => {
    const filePath = await createFileWithProposedChange();

    const result = await handleResolveThread(
      { file: filePath, change_id: 'ct-1', action: 'resolve', author: 'human:alice' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`    resolved: @human:alice ${TS_RE}`));
    // The footnote header still has the original author from propose, but the resolved line uses alice
    const lines = modified.split('\n');
    const resolvedLine = lines.find(l => l.includes('resolved:'));
    expect(resolvedLine).toContain('@human:alice');
    expect(resolvedLine).not.toContain('@ai:claude-opus-4.6');
  });
});
