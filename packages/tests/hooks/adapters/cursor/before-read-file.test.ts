import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleBeforeReadFile } from 'changedown-hooks/internals';
import type { HookInput } from 'changedown-hooks/internals';

describe('Cursor beforeReadFile handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cursor-read-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(scDir, { recursive: true });
    // Default config: safety-net mode, tracking *.md
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[policy]\nmode = "safety-net"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('allows .cursor/ internal files unconditionally', async () => {
    const input: HookInput = {
      hook_event_name: 'beforeReadFile',
      file_path: path.join(tmpDir, '.cursor', 'settings.json'),
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeReadFile(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBeUndefined();
  });

  it('allows files outside workspace unconditionally', async () => {
    const input: HookInput = {
      hook_event_name: 'beforeReadFile',
      file_path: '/some/other/project/readme.md',
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeReadFile(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBeUndefined();
  });

  it('allows tracked .md files in safety-net mode', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'beforeReadFile',
      file_path: mdPath,
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeReadFile(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('blocks tracked .md files in strict mode', async () => {
    // Overwrite config with strict mode
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[policy]\nmode = "strict"\n',
      'utf-8',
    );

    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'beforeReadFile',
      file_path: mdPath,
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeReadFile(input);
    expect(result.continue).toBe(false);
    expect(result.permission).toBe('deny');
  });

  it('allows non-tracked file types regardless of mode', async () => {
    // Strict mode config
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[policy]\nmode = "strict"\n',
      'utf-8',
    );

    const jsPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(jsPath, 'const x = 1;', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'beforeReadFile',
      file_path: jsPath,
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeReadFile(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('allows tracked .md files in permissive mode', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "permissive"\n',
      'utf-8',
    );

    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'beforeReadFile',
      file_path: mdPath,
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeReadFile(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('uses workspace_roots[0] as projectDir when cwd is absent', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'beforeReadFile',
      file_path: mdPath,
      workspace_roots: [tmpDir],
      // no cwd field
    };
    const result = await handleBeforeReadFile(input);
    // Should find config in tmpDir/.changedown/ and evaluate properly
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });
});
