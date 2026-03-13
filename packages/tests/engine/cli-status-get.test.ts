import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changetracks/core';
import { runCommand } from 'changetracks/cli-runner';

describe('sc status', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-status-'));
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

  it('returns project config summary when no file given', async () => {
    const result = await runCommand('status', [], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('tracking_default');
    expect(result.data).toHaveProperty('hashline_enabled');
  });

  it('returns file tracking status when file given', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# Hello\n');
    const result = await runCommand('status', [filePath], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('status');
    expect(result.data.status).toBe('tracked');
  });

  it('returns usage error with extra unknown flags gracefully', async () => {
    // status command accepts an optional positional — no required args, so
    // a random flag should still work (parseArgs with allowPositionals).
    // This test simply ensures the command does not crash.
    const result = await runCommand('status', ['--bogus-flag'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    // parseArgs will throw on unknown flags — command should catch and return error
    expect(result.success).toBe(false);
  });
});

describe('sc get', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-get-'));
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

  it('returns usage error when file is missing', async () => {
    const result = await runCommand('get', [], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toContain('Usage');
  });

  it('returns usage error when change_id is missing', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# Hello\n');
    const result = await runCommand('get', [filePath], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toContain('Usage');
  });

  it('returns change details for a valid change', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      'The {++quick++}[^ct-1] brown fox\n\n[^ct-1]: @alice | 2026-02-15 | ins | proposed\n    reason: test change\n',
    );
    const result = await runCommand('get', [filePath, 'ct-1'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('change_id', 'ct-1');
    expect(result.data).toHaveProperty('type', 'ins');
  });

  it('supports --context flag', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      'line1\nline2\nThe {++quick++}[^ct-1] brown fox\nline4\nline5\n\n[^ct-1]: @alice | 2026-02-15 | ins | proposed\n',
    );
    const result = await runCommand('get', [filePath, 'ct-1', '--context', '1'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    const inline = result.data.inline as Record<string, unknown>;
    expect(inline).toBeDefined();
    const ctxBefore = inline.context_before as string[];
    const ctxAfter = inline.context_after as string[];
    // With --context 1, we get at most 1 line before and 1 line after
    expect(ctxBefore.length).toBeLessThanOrEqual(1);
    expect(ctxAfter.length).toBeLessThanOrEqual(1);
  });

  it('returns error for nonexistent change', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# No changes here\n');
    const result = await runCommand('get', [filePath, 'ct-99'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
});
