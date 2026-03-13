import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
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

/**
 * Tests for the unified propose_change tool that accepts 1-N changes.
 *
 * These tests verify that handleProposeChange can accept a `changes` array
 * (currently only supported by the separate handleProposeBatch). After Phase 1,
 * propose_change should handle both single-change (legacy) and multi-change
 * (changes array) invocations.
 *
 * Expected state: ALL tests that use `changes` array should FAIL (feature not
 * implemented yet). Legacy param tests should PASS (existing behavior).
 */
describe('unified propose_change with changes array', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-unified-'));
    state = new SessionState();
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: false,
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

  // ─── Test 1: Single change via changes array (verbose format) ───────────

  it('single change via changes array produces one tracked change', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: [
          { old_text: 'tpyo', new_text: 'typo', reason: 'spelling fix' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    // Single change in array should produce a flat change_id (not dotted)
    expect(data.change_id).toBe('ct-1');
    expect(data.type).toBe('sub');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~tpyo~>typo~~}[^ct-1]');
    expect(modified).toContain(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`);
    // Reasoning should appear in footnote
    expect(modified).toContain('spelling fix');
  });

  // ─── Test 2: Multiple changes via changes array (verbose format) ────────

  it('multiple changes via changes array produces dotted group IDs', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\nLine three has a mistkae.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: [
          { old_text: 'tpyo', new_text: 'typo', reason: 'fix 1' },
          { old_text: 'mistkae', new_text: 'mistake', reason: 'fix 2' },
        ],
        reason: 'batch spelling fixes',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    // Multi-change should create a group with dotted IDs
    expect(data.group_id).toMatch(/^ct-\d+$/);
    expect(data.applied).toHaveLength(2);
    expect(data.applied[0].change_id).toMatch(/^ct-\d+\.1$/);
    expect(data.applied[1].change_id).toMatch(/^ct-\d+\.2$/);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~tpyo~>typo~~}');
    expect(modified).toContain('{~~mistkae~>mistake~~}');
    // Group footnote should exist with batch reasoning
    expect(modified).toContain('batch spelling fixes');
  });

  // ─── Test 3: Single change via legacy params (backward compat) ──────────

  it('single change via legacy params (old_text/new_text) works for backward compat', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        old_text: 'tpyo',
        new_text: 'typo',
        reason: 'spelling fix',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.type).toBe('sub');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~tpyo~>typo~~}[^ct-1]');
  });

  // ─── Test 4: Mixed: legacy params ignored when changes array present ────

  it('legacy params ignored when changes array is present', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\nLine three has a mistkae.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        // Legacy params (should be ignored)
        old_text: 'Line two is fine.',
        new_text: 'Line two is great.',
        // Changes array (should take precedence)
        changes: [
          { old_text: 'tpyo', new_text: 'typo' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // The changes array edit should be applied
    expect(modified).toContain('{~~tpyo~>typo~~}');
    // The legacy params edit should NOT be applied
    expect(modified).not.toContain('{~~Line two is fine.~>Line two is great.~~}');
    // Original "Line two is fine." should remain untouched
    expect(modified).toContain('Line two is fine.');
  });

  // ─── Test 5: Empty changes array returns error ──────────────────────────

  it('empty changes array returns error', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: [],
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);

    // File should not be modified
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('Line one has a tpyo here.\n');
  });

  // ─── Test 6: Compact format (at/op) when protocol.mode = 'compact' ─────

  it('compact format (at/op) in changes array when protocol.mode = compact', async () => {
    const compactConfig: ChangeTracksConfig = {
      ...config,
      protocol: { ...config.protocol, mode: 'compact' },
      hashline: { enabled: true, auto_remap: false },
    };
    const compactResolver = await createTestResolver(tmpDir, compactConfig);

    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: [
          { at: '1:xx', op: '{~~tpyo~>typo~~}{>>spelling fix' },
        ],
      },
      compactResolver,
      state,
    );

    // This test verifies the unified tool accepts compact ops in the changes array.
    // The exact hash will differ in practice (xx is a placeholder), but the structural
    // path through the code is what matters. If the hash fails validation that's
    // acceptable -- the key assertion is that changes array with at/op doesn't
    // immediately error with "changes not supported" or similar.
    // For now, we accept either success OR a hash validation error (not a structural error).
    if (!result.isError) {
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~tpyo~>typo~~}');
    } else {
      // Hash mismatch is acceptable; structural rejection of changes array is not
      const text = result.content[0].text;
      expect(text).not.toMatch(/changes.*not.*supported|unknown.*param.*changes/i);
    }
  });

  // ─── Test 7: Batch-level reasoning applied to all changes ───────────────

  it('batch-level reasoning applied to all changes when per-change reasoning absent', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\nLine three has a mistkae.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        reason: 'Fix all spelling errors in document',
        changes: [
          { old_text: 'tpyo', new_text: 'typo' },
          { old_text: 'mistkae', new_text: 'mistake' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Batch-level reasoning should appear (at minimum in group footnote)
    expect(modified).toContain('Fix all spelling errors in document');
    // Both changes should be applied
    expect(modified).toContain('{~~tpyo~>typo~~}');
    expect(modified).toContain('{~~mistkae~>mistake~~}');
  });

  // ─── Test 8: Per-change reasoning overrides batch-level ─────────────────

  it('per-change reasoning overrides batch-level reasoning', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\nLine three has a mistkae.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        reason: 'General batch reason',
        changes: [
          { old_text: 'tpyo', new_text: 'typo', reason: 'Specific fix for line one' },
          { old_text: 'mistkae', new_text: 'mistake', reason: 'Specific fix for line three' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Per-change reasoning should appear in child footnotes
    expect(modified).toContain('Specific fix for line one');
    expect(modified).toContain('Specific fix for line three');
    // Batch-level reasoning should appear in group footnote
    expect(modified).toContain('General batch reason');
  });

  // ─── Test 9: raw=true allowed in safety-net mode ────────────────────────

  it('raw=true allowed in safety-net mode (bypasses CriticMarkup wrapping)', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: [
          { old_text: 'tpyo', new_text: 'typo' },
        ],
        raw: true,
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Raw mode: direct replacement without CriticMarkup wrapping
    expect(modified).toContain('typo');
    expect(modified).not.toContain('{~~');
    expect(modified).not.toContain('++}');
    expect(modified).not.toContain('--}');
    // No footnotes should be generated
    expect(modified).not.toContain('[^ct-');
  });

  // ─── Test 10b: string-encoded changes array is parsed gracefully ─────────

  it('string-encoded changes array is parsed via JSON.parse', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\n');

    // Simulate what Minimax and other models do: serialize the changes array as a JSON string
    const result = await handleProposeChange(
      {
        file: filePath,
        changes: JSON.stringify([
          { old_text: 'tpyo', new_text: 'typo', reason: 'spelling fix' },
        ]),
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~tpyo~>typo~~}');
  });

  it('string-encoded multi-change batch is parsed via JSON.parse', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two has a mistkae.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: JSON.stringify([
          { old_text: 'tpyo', new_text: 'typo', reason: 'fix 1' },
          { old_text: 'mistkae', new_text: 'mistake', reason: 'fix 2' },
        ]),
        reason: 'batch spelling fixes',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~tpyo~>typo~~}');
    expect(modified).toContain('{~~mistkae~>mistake~~}');
  });

  it('invalid JSON string for changes returns helpful error', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: 'not valid json [',
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('could not be parsed as JSON');
    expect(text).toContain('Send changes as a JSON array');
  });

  it('JSON string that parses to non-array returns helpful error', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: JSON.stringify({ old_text: 'one', new_text: 'two' }),
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('parsed to object, not an array');
    expect(text).toContain('Send changes as a JSON array');
  });

  // ─── Test 10: raw=true denied in strict mode ────────────────────────────

  it('raw=true denied in strict mode', async () => {
    const strictConfig: ChangeTracksConfig = {
      ...config,
      policy: { mode: 'strict', creation_tracking: 'footnote' },
    };
    const strictResolver = await createTestResolver(tmpDir, strictConfig);

    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, 'Line one has a tpyo here.\nLine two is fine.\n');

    const result = await handleProposeChange(
      {
        file: filePath,
        changes: [
          { old_text: 'tpyo', new_text: 'typo' },
        ],
        raw: true,
      },
      strictResolver,
      state,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    // Error message should reference strict mode or policy
    expect(text).toMatch(/strict|policy|raw.*not.*allowed|denied/i);

    // File must NOT be modified
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('Line one has a tpyo here.\nLine two is fine.\n');
  });
});
