import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changedown/core';
import { runCommand } from 'changedown/cli-runner';

function makeTrackedFile(text: string): string {
  return `${text}\n\n[^cn-1]: @ai:test | 2026-02-15 | ins | proposed\n`;
}

describe('sc review', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cli-review-'));
    const configDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\ndefault = "tracked"\n[hashline]\nenabled = false\n[settlement]\nauto_on_approve = false\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('approves a change via --reviews JSON', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('The {++quick ++}[^cn-1]brown fox'));

    const reviews = JSON.stringify([
      { change_id: 'cn-1', decision: 'approve', reason: 'Looks good' },
    ]);

    const result = await runCommand('review', [filePath, '--reviews', reviews], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(true);

    // Verify approval was recorded in the footnote
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('approved:');
  });

  it('returns error for invalid JSON in --reviews', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('The {++quick ++}[^cn-1]brown fox'));

    const result = await runCommand('review', [filePath, '--reviews', 'not-json!!!'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_JSON');
  });
});

describe('sc respond', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cli-respond-'));
    const configDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\ndefault = "tracked"\n[hashline]\nenabled = false\n',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('adds a response to a thread', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('The {++quick ++}[^cn-1]brown fox'));

    const result = await runCommand(
      'respond',
      [filePath, 'cn-1', 'This insertion improves readability'],
      {
        outputFormat: 'json',
        projectDir: tmpDir,
      },
    );

    expect(result.success).toBe(true);

    // Verify the response text appears in the file
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('This insertion improves readability');
  });

  it('supports --label flag', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('The {++quick ++}[^cn-1]brown fox'));

    const result = await runCommand(
      'respond',
      [filePath, 'cn-1', 'Consider a different word', '--label', 'suggestion'],
      {
        outputFormat: 'json',
        projectDir: tmpDir,
      },
    );

    expect(result.success).toBe(true);

    // Verify the label appears in the file
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('[suggestion]');
    expect(content).toContain('Consider a different word');
  });

  it('returns USAGE_ERROR with missing args', async () => {
    // No args at all
    const result1 = await runCommand('respond', [], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result1.success).toBe(false);
    expect(result1.error).toBe('USAGE_ERROR');

    // Missing change_id and response
    const result2 = await runCommand('respond', ['/some/file.md'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('USAGE_ERROR');
  });

  it('accepts response via --response flag instead of positional', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, makeTrackedFile('The {++quick ++}[^cn-1]brown fox'));

    const result = await runCommand(
      'respond',
      [filePath, 'cn-1', '--response', 'Response via flag'],
      {
        outputFormat: 'json',
        projectDir: tmpDir,
      },
    );

    expect(result.success).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('Response via flag');
  });
});
