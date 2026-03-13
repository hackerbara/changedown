import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigResolver } from '@changetracks/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/** Helper: write a minimal config.toml with a given protocol mode */
async function writeConfig(tmpDir: string, mode: 'classic' | 'compact' = 'classic'): Promise<void> {
  const configDir = path.join(tmpDir, '.changetracks');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, 'config.toml'),
    [
      '[tracking]',
      'include = ["**/*.md"]',
      'exclude = []',
      'default = "tracked"',
      'auto_header = false',
      '',
      '[author]',
      'default = "test"',
      'enforcement = "optional"',
      '',
      '[hooks]',
      'enforcement = "warn"',
      'exclude = []',
      '',
      '[matching]',
      'mode = "normalized"',
      '',
      '[hashline]',
      'enabled = false',
      '',
      '[settlement]',
      'auto_on_approve = true',
      '',
      '[protocol]',
      `mode = "${mode}"`,
      'level = 2',
      'reasoning = "optional"',
      'batch_reasoning = "optional"',
    ].join('\n'),
    'utf-8',
  );
}

/** Wait for a given number of ms */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ConfigResolver file watching', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-resolver-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('caches config on first forFile call', async () => {
    await writeConfig(tmpDir, 'classic');
    const resolver = new ConfigResolver(tmpDir);
    const filePath = path.join(tmpDir, 'doc.md');

    const { config: first } = await resolver.forFile(filePath);
    expect(first.protocol.mode).toBe('classic');

    // Second call returns cached result (same object reference)
    const { config: second } = await resolver.forFile(filePath);
    expect(second).toBe(first);

    resolver.dispose();
  });

  it('invalidates cache when config.toml changes on disk', async () => {
    await writeConfig(tmpDir, 'classic');
    const resolver = new ConfigResolver(tmpDir);
    const filePath = path.join(tmpDir, 'doc.md');

    const { config: before } = await resolver.forFile(filePath);
    expect(before.protocol.mode).toBe('classic');

    // Modify config on disk
    await writeConfig(tmpDir, 'compact');

    // Wait for debounce (100ms) + fs.watch propagation
    await delay(300);

    // Next forFile should re-read from disk
    const { config: after } = await resolver.forFile(filePath);
    expect(after.protocol.mode).toBe('compact');
    expect(after).not.toBe(before);

    resolver.dispose();
  });

  it('lastConfig also picks up changes after invalidation', async () => {
    await writeConfig(tmpDir, 'classic');
    const resolver = new ConfigResolver(tmpDir);
    const filePath = path.join(tmpDir, 'doc.md');

    // Prime the cache via forFile
    await resolver.forFile(filePath);
    const before = await resolver.lastConfig();
    expect(before.protocol.mode).toBe('classic');

    // Modify config
    await writeConfig(tmpDir, 'compact');
    await delay(300);

    const after = await resolver.lastConfig();
    expect(after.protocol.mode).toBe('compact');

    resolver.dispose();
  });

  it('dispose stops watchers and clears cache', async () => {
    await writeConfig(tmpDir, 'classic');
    const resolver = new ConfigResolver(tmpDir);
    const filePath = path.join(tmpDir, 'doc.md');

    await resolver.forFile(filePath);
    resolver.dispose();

    // After dispose, modify config — should NOT be picked up automatically
    // (watcher is stopped, but cache is also cleared, so next forFile re-reads anyway)
    await writeConfig(tmpDir, 'compact');

    // forFile still works after dispose (re-reads from disk, starts new watcher)
    const { config } = await resolver.forFile(filePath);
    expect(config.protocol.mode).toBe('compact');

    resolver.dispose();
  });

  it('handles config file deletion gracefully', async () => {
    await writeConfig(tmpDir, 'classic');
    const resolver = new ConfigResolver(tmpDir);
    const filePath = path.join(tmpDir, 'doc.md');

    await resolver.forFile(filePath);

    // Delete config file
    await fs.rm(path.join(tmpDir, '.changetracks', 'config.toml'));
    await delay(300);

    // No crash — dispose works cleanly
    resolver.dispose();
  });

  it('does not create duplicate watchers for same project', async () => {
    await writeConfig(tmpDir, 'classic');
    const resolver = new ConfigResolver(tmpDir);
    const file1 = path.join(tmpDir, 'a.md');
    const file2 = path.join(tmpDir, 'b.md');

    // Multiple forFile calls for different files in same project
    await resolver.forFile(file1);
    await resolver.forFile(file2);

    // Modify config — should only invalidate once
    await writeConfig(tmpDir, 'compact');
    await delay(300);

    const { config } = await resolver.forFile(file1);
    expect(config.protocol.mode).toBe('compact');

    resolver.dispose();
  });
});
