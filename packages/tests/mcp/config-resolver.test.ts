import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigResolver } from '@changedown/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/** Helper: write a minimal config.toml with a given protocol mode */
async function writeConfig(tmpDir: string, mode: 'classic' | 'compact' = 'classic'): Promise<void> {
  const configDir = path.join(tmpDir, '.changedown');
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

async function withEnv<T>(
  updates: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function makeProject(prefix: string, mode: 'classic' | 'compact' = 'classic'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await writeConfig(dir, mode);
  await fs.writeFile(path.join(dir, 'doc.md'), 'Hello from project.\n', 'utf8');
  return dir;
}

describe('ConfigResolver file watching', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-resolver-'));
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
    await fs.rm(path.join(tmpDir, '.changedown', 'config.toml'));
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

describe('ConfigResolver project-root inference', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    for (const dir of cleanup.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('resolves an absolute file by walking up from the file when fallback cwd and PWD are unrelated', async () => {
    const project = await makeProject('cn-absolute-project-');
    const unrelated = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-plugin-cache-'));
    cleanup.push(project, unrelated);

    const filePath = path.join(project, 'doc.md');
    const resolved = await withEnv({ PWD: unrelated, CHANGEDOWN_PROJECT_DIR: undefined, CODEX_WORKSPACE_ROOT: undefined }, () => {
      const resolver = new ConfigResolver(unrelated);
      try {
        return resolver.resolveFilePath(filePath);
      } finally {
        resolver.dispose();
      }
    });

    expect(resolved).toBe(await fs.realpath(filePath));
  });

  it('does not let lastProjectDir poison an absolute path in another project', async () => {
    const projectA = await makeProject('cn-project-a-', 'classic');
    const projectB = await makeProject('cn-project-b-', 'compact');
    const unrelated = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-plugin-cache-'));
    cleanup.push(projectA, projectB, unrelated);

    await withEnv({ PWD: unrelated, CHANGEDOWN_PROJECT_DIR: undefined, CODEX_WORKSPACE_ROOT: undefined }, async () => {
      const resolver = new ConfigResolver(unrelated);
      try {
        await resolver.forFile(path.join(projectA, 'doc.md'));
        const resolvedB = resolver.resolveFilePath(path.join(projectB, 'doc.md'));
        expect(resolvedB).toBe(await fs.realpath(path.join(projectB, 'doc.md')));
        const { projectDir, config } = await resolver.forFile(resolvedB);
        expect(projectDir).toBe(await fs.realpath(projectB));
        expect(config.protocol.mode).toBe('compact');
      } finally {
        resolver.dispose();
      }
    });
  });

  it('uses the deepest containing session root for absolute path boundary checks', async () => {
    const outer = await makeProject('cn-outer-project-', 'classic');
    const inner = path.join(outer, 'nested');
    await writeConfig(inner, 'compact');
    await fs.mkdir(path.join(inner, 'links'), { recursive: true });
    await fs.writeFile(path.join(outer, 'outer-only.md'), 'Outer project file.\n', 'utf8');
    await fs.symlink(path.join(outer, 'outer-only.md'), path.join(inner, 'links', 'escape.md'));
    const unrelated = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-plugin-cache-'));
    cleanup.push(outer, unrelated);

    const resolver = new ConfigResolver(unrelated);
    resolver.setSessionRoots([outer, inner]);
    try {
      expect(() => resolver.resolveFilePath(path.join(inner, 'links', 'escape.md')))
        .toThrow(/outside the project root/);
    } finally {
      resolver.dispose();
    }
  });

  it('does not let a rejected absolute path seed relative path resolution', async () => {
    const project = await makeProject('cn-boundary-project-', 'classic');
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-boundary-outside-'));
    const unrelated = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-plugin-cache-'));
    cleanup.push(project, outside, unrelated);

    await fs.writeFile(path.join(outside, 'outside.md'), 'Outside project file.\n', 'utf8');
    await fs.symlink(path.join(outside, 'outside.md'), path.join(project, 'escape.md'));

    await withEnv({ PWD: unrelated, CHANGEDOWN_PROJECT_DIR: undefined, CODEX_WORKSPACE_ROOT: undefined }, () => {
      const resolver = new ConfigResolver(unrelated);
      try {
        expect(() => resolver.resolveFilePath(path.join(project, 'escape.md')))
          .toThrow(/outside the project root/);
        expect(() => resolver.resolveFilePath('doc.md'))
          .toThrow(/Cannot resolve relative path/);
      } finally {
        resolver.dispose();
      }
    });
  });

  it('fails relative paths clearly when no project root is known', async () => {
    const unrelated = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-plugin-cache-'));
    cleanup.push(unrelated);

    await withEnv({ PWD: unrelated, CHANGEDOWN_PROJECT_DIR: undefined, CODEX_WORKSPACE_ROOT: undefined }, () => {
      const resolver = new ConfigResolver(unrelated);
      try {
        expect(() => resolver.resolveFilePath('website-v2/public/content/02-editing-example.md'))
          .toThrow(/Cannot resolve relative path/);
      } finally {
        resolver.dispose();
      }
    });
  });
});
