import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { cursorPreToolUse as handlePreToolUse } from 'changedown-hooks/internals';
import type { HookInput } from 'changedown-hooks/internals';

describe('Cursor preToolUse handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cursor-pretool-'));
    await fs.mkdir(path.join(tmpDir, '.changedown'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[policy]\nmode = "strict"\n\n[author]\ndefault = "ai:claude"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('allows non-write tools', async () => {
    const input: HookInput = {
      hook_event_name: 'preToolUse',
      tool_name: 'Read',
      tool_input: { file_path: path.join(tmpDir, 'readme.md') },
      workspace_roots: [tmpDir],
    };
    const result = await handlePreToolUse(input);
    expect(result.decision).toBe('allow');
  });

  it('denies edit on tracked markdown in strict mode', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'preToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: mdPath,
        old_string: '# Hello',
        new_string: '# Updated',
      },
      workspace_roots: [tmpDir],
    };
    const result = await handlePreToolUse(input);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('tracked by ChangeDown');
  });

  it('allows edit on non-tracked file type in strict mode', async () => {
    const jsPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(jsPath, 'const x = 1;', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'preToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: jsPath,
        old_string: 'const x = 1;',
        new_string: 'const x = 2;',
      },
      workspace_roots: [tmpDir],
    };
    const result = await handlePreToolUse(input);
    expect(result.decision).toBe('allow');
  });

  it('allows write to non-existent tracked file when creation tracking enabled', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\ncreation_tracking = "footnote"\n',
      'utf-8',
    );

    const mdPath = path.join(tmpDir, 'new-file.md');
    const input: HookInput = {
      hook_event_name: 'preToolUse',
      tool_name: 'Write',
      tool_input: {
        file_path: mdPath,
        content: '# New',
      },
      workspace_roots: [tmpDir],
    };
    const result = await handlePreToolUse(input);
    expect(result.decision).toBe('allow');
  });
});
