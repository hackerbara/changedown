import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changedown/core';
import { runCommand } from 'changedown/cli-runner';

describe('sc batch', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cli-batch-'));
    const configDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\ndefault = "tracked"\nauto_header = true\n[author]\ndefault = "ai:test"\nenforcement = "optional"\n[hooks]\nenforcement = "warn"\nexclude = []\n[matching]\nmode = "normalized"\n[hashline]\nenabled = false\n[settlement]\nauto_on_approve = true\n[protocol]\nmode = "classic"\nlevel = 2\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('applies batch of changes from --changes JSON', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- changedown.com/v1: tracked -->\nThe quick brown fox jumps over the lazy dog.\n');

    const changes = JSON.stringify([
      { old_text: 'quick', new_text: 'slow', reason: 'speed change' },
      { old_text: 'lazy', new_text: 'eager', reason: 'motivation change' },
    ]);

    const result = await runCommand('batch', [
      filePath,
      '--reason', 'batch edit test',
      '--changes', changes,
    ], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('group_id');
    expect(result.data.group_id).toMatch(/^cn-\d+$/);
    expect(result.data).toHaveProperty('applied');
    const changesResult = result.data.applied as Array<Record<string, unknown>>;
    expect(changesResult.length).toBe(2);

    // Verify CriticMarkup was written to file
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{~~quick~>slow~~}');
    expect(content).toContain('{~~lazy~>eager~~}');
  });

  it('returns error when --changes is invalid JSON', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- changedown.com/v1: tracked -->\nHello world.\n');

    const result = await runCommand('batch', [
      filePath,
      '--reason', 'test',
      '--changes', 'not-valid-json{{{',
    ], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid JSON');
  });

  it('returns USAGE_ERROR with no file argument', async () => {
    const result = await runCommand('batch', [
      '--reason', 'test',
      '--changes', '[]',
    ], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toContain('Usage');
  });
});

describe('sc amend', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cli-amend-'));
    const configDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\ndefault = "tracked"\nauto_header = true\n[author]\ndefault = "ai:test"\nenforcement = "optional"\n[hooks]\nenforcement = "warn"\nexclude = []\n[matching]\nmode = "normalized"\n[hashline]\nenabled = false\n[settlement]\nauto_on_approve = true\n[protocol]\nmode = "classic"\nlevel = 2\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('amends an existing proposed change', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- changedown.com/v1: tracked -->\nThe quick brown fox.\n');

    // First, propose a change using the propose command (via the handler directly)
    // We use runCommand for propose if it exists, otherwise set up the file manually.
    // Since propose is not a CLI command yet, set up the file with CriticMarkup manually.
    await fs.writeFile(
      filePath,
      '<!-- changedown.com/v1: tracked -->\nThe {~~quick~>slow~~}[^cn-1] brown fox.\n\n[^cn-1]: @ai:test | 2026-02-15 | sub | proposed\n    reason: initial proposal\n',
    );

    const result = await runCommand('amend', [
      filePath,
      'cn-1',
      '--new-text', 'fast',
      '--reason', 'better word choice',
    ], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('change_id', 'cn-1');
    expect(result.data).toHaveProperty('amended', true);
    expect(result.data).toHaveProperty('new_text', 'fast');
    expect(result.data).toHaveProperty('new_change_id');

    // Verify file was updated — amend now routes through supersede:
    // original change rejected, new substitution proposed
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{~~quick~>fast~~}');
    expect(content).not.toContain('{~~quick~>slow~~}');
    expect(content).toContain('supersedes: cn-1');
    expect(content).toContain('better word choice');
  });

  it('returns USAGE_ERROR with missing file', async () => {
    const result = await runCommand('amend', [], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toContain('Usage');
  });

  it('returns USAGE_ERROR with missing change-id', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# Hello\n');

    const result = await runCommand('amend', [filePath], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toContain('Usage');
  });
});
