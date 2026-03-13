import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changetracks/core';
import { runCommand } from 'changetracks/cli-runner';

describe('sc batch --from and stdin support', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-batch-input-'));
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n[author]\ndefault = "ai:test"\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads changes from --from file', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world. Goodbye moon.');

    const changesFile = path.join(tmpDir, 'changes.json');
    await fs.writeFile(changesFile, JSON.stringify([
      { old_text: 'Hello', new_text: 'Hi', reason: 'informal' },
      { old_text: 'Goodbye', new_text: 'Bye', reason: 'short' },
    ]));

    const result = await runCommand(
      'batch',
      [filePath, '--from', changesFile, '--reason', 'batch test'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    expect(result.data.group_id).toBeDefined();

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{~~Hello~>Hi~~}');
    expect(content).toContain('{~~Goodbye~>Bye~~}');
  });

  it('--from file error when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await runCommand(
      'batch',
      [filePath, '--from', path.join(tmpDir, 'nonexistent.json'), '--reason', 'test'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('--from');
  });

  it('--from file error on invalid JSON', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const changesFile = path.join(tmpDir, 'bad.json');
    await fs.writeFile(changesFile, 'not valid json');

    const result = await runCommand(
      'batch',
      [filePath, '--from', changesFile, '--reason', 'test'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('--from');
  });

  it('--changes flag still works (backwards compatible)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Alpha beta gamma.');

    const changes = JSON.stringify([
      { old_text: 'Alpha', new_text: 'One', reason: 'rename' },
    ]);

    const result = await runCommand(
      'batch',
      [filePath, '--changes', changes, '--reason', 'compat test'],
      { outputFormat: 'json', projectDir: tmpDir },
    );

    expect(result.success).toBe(true);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{~~Alpha~>One~~}');
  });
});
