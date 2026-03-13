import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changetracks/core';
import { runCommand } from 'changetracks/cli-runner';

describe('sc group', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-group-'));
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\ndefault = "tracked"\n[hashline]\nenabled = true\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('begins a group successfully', async () => {
    const beginResult = await runCommand(
      'group',
      ['begin', '--description', 'refactor X'],
      { outputFormat: 'json', projectDir: tmpDir },
    );
    expect(beginResult.success).toBe(true);
    expect(beginResult.data).toHaveProperty('group_id');
    const groupId = beginResult.data.group_id as string;
    expect(groupId).toMatch(/^ct-\d+$/);
  });

  it('end without active group returns error', async () => {
    // Each CLI invocation creates a fresh SessionState, so there's no
    // active group. File-based group persistence is a future concern.
    const endResult = await runCommand(
      'group',
      ['end', '--summary', 'done'],
      { outputFormat: 'json', projectDir: tmpDir },
    );
    expect(endResult.success).toBe(false);
  });

  it('returns error for unknown subcommand', async () => {
    const result = await runCommand(
      'group',
      ['explode'],
      { outputFormat: 'json', projectDir: tmpDir },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toContain('Usage');
  });
});

describe('sc raw-edit', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-raw-'));
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\ndefault = "tracked"\n[hashline]\nenabled = true\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('performs untracked edit', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'broken {++markup\n');

    const result = await runCommand(
      'raw-edit',
      [filePath, '--old', 'broken {++markup', '--new', 'fixed text', '--reason', 'fix corruption'],
      { outputFormat: 'json', projectDir: tmpDir },
    );
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('raw_edit', true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('fixed text\n');
  });

  it('returns error when --reason is missing', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'some text\n');

    const result = await runCommand(
      'raw-edit',
      [filePath, '--old', 'some', '--new', 'other'],
      { outputFormat: 'json', projectDir: tmpDir },
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('reason');
  });
});
