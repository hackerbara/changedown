import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('read_tracked_file compact mode label', () => {
  let tmpDir: string;
  let state: SessionState;

  const compactConfig: ChangeTracksConfig = {
    tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
    author: { default: 'ai:test-agent', enforcement: 'optional' },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: true, auto_remap: false },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'compact', level: 2, reasoning: 'required', batch_reasoning: 'required' },
  };

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-read-compact-'));
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('includes compact mode indicator in output header', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'hello world');
    const resolver = await createTestResolver(tmpDir, compactConfig);

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('compact');
  });

  it('classic mode does not include compact indicator', async () => {
    const classicConfig = { ...compactConfig, protocol: { ...compactConfig.protocol, mode: 'classic' as const } };
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'hello world');
    const resolver = await createTestResolver(tmpDir, classicConfig);

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).not.toContain('compact');
  });
});
