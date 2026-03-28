import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGetTrackingStatus } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';

describe('handleGetTrackingStatus', () => {
  let tmpDir: string;
  let config: ChangeDownConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-tracking-status-'));
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
        enforcement: 'warn', exclude: ['llm-garden/**'],
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

  const state = new SessionState();

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('with file arg: returns tracked status for file with tracking header', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- changedown.com/v1: tracked -->\n# Hello\n');

    const result = await handleGetTrackingStatus(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('tracked');
    expect(data.source).toBe('file_header');
    expect(data.header_present).toBe(true);
    expect(data.hook_excluded).toBe(false);
    expect(data.hooks_exclude).toEqual(['llm-garden/**']);
  });

  it('with file arg: returns untracked status for file with untracked header', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- changedown.com/v1: untracked -->\n# Hello\n');

    const result = await handleGetTrackingStatus(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('untracked');
    expect(data.source).toBe('file_header');
    expect(data.header_present).toBe(true);
  });

  it('with file arg: returns config-based status for file without header but in scope', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# Hello\nNo header here.\n');

    const result = await handleGetTrackingStatus(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('tracked');
    expect(data.source).toBe('project_config');
    expect(data.header_present).toBe(false);
  });

  it('with file arg: returns untracked for out-of-scope file with no header', async () => {
    const filePath = path.join(tmpDir, 'code.ts');
    await fs.writeFile(filePath, 'const x = 1;');

    const result = await handleGetTrackingStatus(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('untracked');
    expect(data.source).toBe('global_default');
    expect(data.header_present).toBe(false);
    expect(data.hook_excluded).toBe(false);
  });

  it('with nonexistent file: returns config-based status (no header)', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleGetTrackingStatus(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    // File doesn't exist, but path matches *.md include glob -> project_config
    expect(data.status).toBe('tracked');
    expect(data.source).toBe('project_config');
    expect(data.header_present).toBe(false);
  });

  it('without file arg: returns project config summary', async () => {
    const result = await handleGetTrackingStatus(
      {},
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.tracking_default).toBe('tracked');
    expect(data.auto_header).toBe(true);
    expect(data.include).toEqual(['**/*.md']);
    expect(data.exclude).toEqual(['node_modules/**', 'dist/**']);
    expect(data.hooks_enforcement).toBe('warn');
    expect(data.hooks_exclude).toEqual(['llm-garden/**']);
    expect(data.matching_mode).toBe('normalized');
    expect(data.hashline_enabled).toBe(false);
    expect(data.author_default).toBe('ai:claude-opus-4.6');
    expect(data.author_enforcement).toBe('optional');
  });

  it('without file arg: includes policy_mode in project summary', async () => {
    const result = await handleGetTrackingStatus({}, resolver, state);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.policy_mode).toBe('safety-net');
  });

  it('with file arg: reports hook_excluded=true when file matches hooks.exclude', async () => {
    const filePath = path.join(tmpDir, 'llm-garden', 'notes.md');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '# Garden note\n');

    const result = await handleGetTrackingStatus(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.hook_excluded).toBe(true);
    expect(data.hooks_exclude).toEqual(['llm-garden/**']);
  });

  it('when file is tracked and has accepted changes: includes accepted_unsettled_count', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      '<!-- changedown.com/v1: tracked -->\n# Doc\n\nText {++added++}[^cn-1] end.\n\n[^cn-1]: @a | 2026-02-11 | ins | accepted'
    );

    const result = await handleGetTrackingStatus(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('tracked');
    expect(data.accepted_unsettled_count).toBe(1);
  });

  it('when settle_accepted is true and file has accepted changes: settles file and returns settled, settled_ids', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      '<!-- changedown.com/v1: tracked -->\n# Doc\n\nText {++added++}[^cn-1] end.\n\n[^cn-1]: @a | 2026-02-11 | ins | accepted'
    );

    const result = await handleGetTrackingStatus(
      { file: filePath, settle_accepted: true },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.settled).toBe(true);
    expect(data.settled_ids).toEqual(['cn-1']);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('<!-- changedown.com/v1: tracked -->');
    // BUG-001 fix: Settlement preserves footnote refs and definitions
    expect(content).toContain('Text added[^cn-1] end.');
    expect(content).toContain('[^cn-1]:'); // Footnote definition preserved
    expect(content).not.toContain('{++'); // Markup removed
  });

  it('without file arg: reflects custom config values', async () => {
    const customConfig: ChangeDownConfig = {
      ...config,
      tracking: {
        ...config.tracking,
        default: 'untracked',
        auto_header: false,
      },
      hooks: { enforcement: 'block', exclude: [] },
      matching: { mode: 'strict' },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
    };
    const customResolver = await createTestResolver(tmpDir, customConfig);

    const result = await handleGetTrackingStatus(
      {},
      customResolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.tracking_default).toBe('untracked');
    expect(data.auto_header).toBe(false);
    expect(data.hooks_enforcement).toBe('block');
    expect(data.matching_mode).toBe('strict');
    expect(data.hashline_enabled).toBe(true);
  });

});
