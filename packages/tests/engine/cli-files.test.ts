import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changetracks/core';
import { runCommand } from 'changetracks/cli-runner';

describe('sc files / sc ls', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-files-'));
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n[author]\ndefault = "ai:test"\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lists markdown files in directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Hello');
    await fs.writeFile(path.join(tmpDir, 'notes.md'), '# Notes');
    await fs.writeFile(path.join(tmpDir, 'code.ts'), 'const x = 1;');

    const result = await runCommand(
      'files',
      [tmpDir],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    // Raw text should list the tracked files
    const text = result.rawText ?? '';
    expect(text).toContain('README.md');
    expect(text).toContain('notes.md');
    expect(text).not.toContain('code.ts');
  });

  it('ls alias works same as files', async () => {
    await fs.writeFile(path.join(tmpDir, 'doc.md'), '# Doc');

    const result = await runCommand(
      'ls',
      [tmpDir],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    const text = result.rawText ?? '';
    expect(text).toContain('doc.md');
  });

  it('excludes node_modules', async () => {
    await fs.writeFile(path.join(tmpDir, 'doc.md'), '# Doc');
    const nmDir = path.join(tmpDir, 'node_modules', 'pkg');
    await fs.mkdir(nmDir, { recursive: true });
    await fs.writeFile(path.join(nmDir, 'readme.md'), '# Pkg');

    const result = await runCommand(
      'files',
      [tmpDir],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    const text = result.rawText ?? '';
    expect(text).toContain('doc.md');
    expect(text).not.toContain('node_modules');
  });

  it('lists files in subdirectories', async () => {
    const subDir = path.join(tmpDir, 'docs');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, 'guide.md'), '# Guide');

    const result = await runCommand(
      'files',
      [tmpDir],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    const text = result.rawText ?? '';
    expect(text).toContain('guide.md');
  });

  it('returns empty list when no tracked files', async () => {
    await fs.writeFile(path.join(tmpDir, 'code.ts'), 'const x = 1;');

    const result = await runCommand(
      'files',
      [tmpDir],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    const text = result.rawText ?? '';
    expect(text.trim()).toBe('');
  });

  it('defaults to project dir when no path given', async () => {
    await fs.writeFile(path.join(tmpDir, 'doc.md'), '# Doc');

    const result = await runCommand(
      'files',
      [],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    const text = result.rawText ?? '';
    expect(text).toContain('doc.md');
  });
});
