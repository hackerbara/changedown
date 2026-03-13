import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changetracks/core';
import { runCommand } from 'changetracks/cli-runner';

describe('sc list', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cli-list-'));
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

  it('lists open threads in a file with CriticMarkup', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      '<!-- ctrcks.com/v1: tracked -->\nThe {++quick++}[^ct-1] brown fox\n\n[^ct-1]: @alice | 2026-02-15 | ins | proposed\n    reason: test change\n',
    );
    const result = await runCommand('list', [filePath], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    // handlerToCliResult wraps the JSON array from the handler as { items: [] }
    const items = result.data.items as Record<string, unknown>[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]).toHaveProperty('change_id', 'ct-1');
    expect(items[0]).toHaveProperty('type', 'ins');
    expect(items[0]).toHaveProperty('status', 'proposed');
  });

  it('supports --author filter', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      '<!-- ctrcks.com/v1: tracked -->\n' +
        'The {++quick++}[^ct-1] {++slow++}[^ct-2] fox\n\n' +
        '[^ct-1]: @alice | 2026-02-15 | ins | proposed\n' +
        '[^ct-2]: @bob | 2026-02-15 | ins | proposed\n',
    );
    const result = await runCommand('list', [filePath, '--author', '@alice'], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(true);
    const items = result.data.items as Record<string, unknown>[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(1);
    expect(items[0]).toHaveProperty('change_id', 'ct-1');
    expect(items[0]).toHaveProperty('author', '@alice');
  });

  it('supports --status filter (comma-separated)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      '<!-- ctrcks.com/v1: tracked -->\n' +
        'The {++quick++}[^ct-1] {--slow--}[^ct-2] fox\n\n' +
        '[^ct-1]: @alice | 2026-02-15 | ins | proposed\n' +
        '[^ct-2]: @alice | 2026-02-15 | del | accepted\n',
    );
    const result = await runCommand(
      'list',
      [filePath, '--status', 'proposed,accepted'],
      {
        outputFormat: 'json',
        projectDir: tmpDir,
      },
    );
    expect(result.success).toBe(true);
    const items = result.data.items as Record<string, unknown>[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(2);
    const ids = items.map((i: Record<string, unknown>) => i.change_id);
    expect(ids).toContain('ct-1');
    expect(ids).toContain('ct-2');
  });

  it('returns USAGE_ERROR with no path argument', async () => {
    const result = await runCommand('list', [], {
      outputFormat: 'json',
      projectDir: tmpDir,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('USAGE_ERROR');
    expect(result.message).toContain('Usage');
  });
});
