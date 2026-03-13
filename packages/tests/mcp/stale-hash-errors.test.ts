import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline, computeLineHash } from '@changetracks/core';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { resolveAt } from '@changetracks/mcp/internals';

describe('stale hash error messages', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-stale-hash-'));
    state = new SessionState();
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: false,
      },
      author: {
        default: 'ai:test',
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
        enabled: true,
        auto_remap: false,
      },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('at-resolver hash mismatch includes current hash and recovery hint', () => {
    // Create file content where line 2 has a known hash
    const fileLines = ['Line one', 'Line two', 'Line three'];
    const actualHash = computeLineHash(1, 'Line two', fileLines);
    // Use a valid hex hash that doesn't match
    const wrongHash = 'ff';

    // Attempt to resolve with wrong hash
    let caughtError: Error | undefined;
    try {
      resolveAt(`2:${wrongHash}`, fileLines);
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).toBeDefined();
    // Error should contain the current/actual hash
    expect(caughtError!.message).toContain(actualHash);
    // Error should contain recovery hint
    expect(caughtError!.message).toContain('read_tracked_file');
  });

  it('propose_change with stale start_hash includes current hash in error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = 'Line one\nLine two\nLine three\n';
    await fs.writeFile(filePath, content);

    const contentLines = content.split('\n');
    const actualHash = computeLineHash(1, 'Line two', contentLines);
    // Use a valid hex hash that doesn't match the actual hash
    const wrongHash = 'ff';
    const resolver = await createTestResolver(tmpDir, config);

    const result = await handleProposeChange(
      {
        file: filePath,
        old_text: 'Line two',
        new_text: 'Line TWO',
        start_line: 2,
        start_hash: wrongHash,
      },
      resolver,
      state,
    );

    // The result should be an error
    expect(result.isError).toBe(true);
    const errorText = result.content.map(c => c.text).join('');

    // Error should include the current/actual hash
    expect(errorText).toContain(actualHash);
    // Error should include recovery hint about re-reading
    expect(errorText).toContain('read_tracked_file');
  });

  it('propose_change compact mode hash mismatch includes current hash and recovery hint', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = 'Line one\nLine two\nLine three\n';
    await fs.writeFile(filePath, content);

    const contentLines = content.split('\n');
    const actualHash = computeLineHash(1, 'Line two', contentLines);
    // Use a valid hex hash that doesn't match the actual hash
    const wrongHash = 'ff';

    const compactConfig = {
      ...config,
      protocol: { mode: 'compact' as const, level: 2 as const, reasoning: 'optional' as const, batch_reasoning: 'optional' as const },
    };
    const resolver = await createTestResolver(tmpDir, compactConfig);

    const result = await handleProposeChange(
      {
        file: filePath,
        at: `2:${wrongHash}`,
        op: `{~~Line two~>Line TWO~~}`,
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    const errorText = result.content.map(c => c.text).join('');

    // Error should include the current hash
    expect(errorText).toContain(actualHash);
    // Error should include recovery hint
    expect(errorText).toContain('read_tracked_file');
  });
});
