import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changedown/core';
import { runCommand } from 'changedown/cli-runner';

describe('sc propose', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cli-propose-'));
    const configDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n[author]\ndefault = "ai:test"\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('substitution via --old and --new', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    const result = await runCommand(
      'propose',
      [filePath, '--old', 'quick brown', '--new', 'slow red', '--reason', 'test'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    expect(result.data.change_id).toBe('cn-1');
    expect(result.data.type).toBe('sub');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{~~quick brown~>slow red~~}');
  });

  it('insertion via --new and --insert-after', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox jumps.');

    const result = await runCommand(
      'propose',
      [filePath, '--new', ' brown', '--insert-after', 'quick', '--reason', 'test'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    expect(result.data.change_id).toBe('cn-1');
    expect(result.data.type).toBe('ins');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('quick{++ brown++}');
  });

  it('deletion via --old with empty --new', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    const result = await runCommand(
      'propose',
      [filePath, '--old', ' brown', '--new', '', '--reason', 'test'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    expect(result.data.change_id).toBe('cn-1');
    expect(result.data.type).toBe('del');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{-- brown--}');
  });

  it('supports --reason flag', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await runCommand(
      'propose',
      [filePath, '--old', 'world', '--new', 'earth', '--reason', 'prefer earth'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    expect(result.data.change_id).toBe('cn-1');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('prefer earth');
  });

  it('supports --author flag', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await runCommand(
      'propose',
      [filePath, '--old', 'world', '--new', 'earth', '--author', 'ai:custom-agent', '--reason', 'test'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    expect(result.data.change_id).toBe('cn-1');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('@ai:custom-agent');
  });

  it('returns error when --old text not found', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await runCommand(
      'propose',
      [filePath, '--old', 'nonexistent text', '--new', 'replacement'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(false);
  });

  it('returns USAGE_ERROR when no file given', async () => {
    const result = await runCommand(
      'propose',
      ['--old', 'text', '--new', 'replacement'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toContain('Usage');
  });
});
