import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('read_tracked_file committed view', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-committed-view-'));
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
        enabled: true,
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

  it('returns committed view header and content', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '# Title',
      'Clean line.',
    ].join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Unified renderer: ## {filename} | policy: ... | tracking: ...
    expect(text).toMatch(/## .*test\.md \| policy:/);
    // No separate "## view: committed" line in unified format
    expect(text).toContain('# Title');
    expect(text).toContain('Clean line.');
  });

  it('shows P flag for proposed changes', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      'Before {++added text++}[^ct-1] after',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    const text = result.content[0].text;
    // Proposed insertion should be reverted (removed), line should have P flag
    // Unified format: "N:HH P| content {>>ct-N<<}"
    expect(text).toMatch(/P\| Before  after/);
  });

  it('shows A flag for accepted changes', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      'Before {++added text++}[^ct-1] after',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | accepted',
    ].join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    const text = result.content[0].text;
    // Accepted insertion should be kept, line should have A flag
    // Unified format: "N:HH A| content {>>ct-N<<}"
    expect(text).toMatch(/A\| Before added text after/);
  });

  it('excludes footnote definitions from output', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      'Some text {++new++}[^ct-1]',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
      '    reason: clarity improvement',
    ].join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    const text = result.content[0].text;
    expect(text).not.toContain('[^ct-1]:');
    expect(text).not.toContain('reason: clarity improvement');
  });

  it('records committed hashes in session state', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '# Title',
      'Clean line.',
    ].join('\n'));

    await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    const hashes = state.getRecordedHashes(filePath);
    expect(hashes).toBeDefined();
    expect(hashes!.length).toBe(2);
    // Committed hashes should have the committed field
    expect(hashes![0].committed).toBeDefined();
    expect(hashes![0].rawLineNum).toBeDefined();
    expect(hashes![0].committed).toMatch(/^[0-9a-f]{2}$/);
  });

  it('shows change summary in header', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      'Before {++added++}[^ct-1] after',
      '{--removed--}[^ct-2]',
      'Clean line.',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
      '[^ct-2]: @alice | 2026-02-17 | del | accepted',
    ].join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    const text = result.content[0].text;
    // Unified format: "proposed: N | accepted: N | rejected: N"
    expect(text).toContain('proposed: 1');
    expect(text).toContain('accepted: 1');
  });

  it('returns error when hashline is disabled', async () => {
    const disabledConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: false, auto_remap: false },
    };
    const disabledResolver = await createTestResolver(tmpDir, disabledConfig);
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, '# Title\n');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      disabledResolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Committed view requires hashline mode');
  });

  it('shows clean summary for file without CriticMarkup', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, '# Title\nSome text.\n');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    const text = result.content[0].text;
    // Unified format always shows all three counts, even when all zero
    expect(text).toContain('proposed: 0');
    expect(text).toContain('accepted: 0');
    expect(text).toContain('rejected: 0');
  });
});
