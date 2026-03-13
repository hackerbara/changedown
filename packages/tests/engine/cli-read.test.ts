import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changetracks/core';
import { runCommand } from 'changetracks/cli-runner';

describe('sc read', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-read-'));
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n[hashline]\nenabled = true\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads a file and returns content', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'hello world\nsecond line');
    const result = await runCommand('read', [filePath], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    expect(result.rawText).toBeDefined();
    expect(result.rawText).toContain('hello world');
  });

  it('supports --offset and --limit flags', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'line one\nline two\nline three');
    const result = await runCommand('read', [filePath, '--offset', '2', '--limit', '1', '--view', 'raw'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    expect(result.rawText).toContain('line two');
    expect(result.rawText).not.toContain('line one');
  });

  it('supports --view settled flag', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The {++quick ++}brown fox');
    const result = await runCommand('read', [filePath, '--view', 'settled'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    expect(result.rawText).toBeDefined();
  });

  it('returns error for missing file', async () => {
    const result = await runCommand('read', [path.join(tmpDir, 'nope.md')], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(false);
  });
});

describe('runCommand', () => {
  it('returns UNKNOWN_COMMAND for unregistered commands', async () => {
    const result = await runCommand('foobar', [], {
      outputFormat: 'json',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('UNKNOWN_COMMAND');
  });
});
