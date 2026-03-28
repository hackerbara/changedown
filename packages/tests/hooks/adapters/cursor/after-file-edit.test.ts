import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleAfterFileEdit } from 'changedown-hooks/internals';
import type { HookInput } from 'changedown-hooks/internals';

describe('Cursor afterFileEdit handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cursor-edit-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(scDir, { recursive: true });
    // Default config: safety-net mode
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[policy]\nmode = "safety-net"\n\n[author]\ndefault = "ai:claude"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty when no edits provided', async () => {
    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      file_path: path.join(tmpDir, 'readme.md'),
      edits: [],
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleAfterFileEdit(input);
    expect(result).toEqual({});
  });

  it('returns empty when file_path is missing', async () => {
    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      edits: [{ old_string: 'old', new_string: 'new' }],
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleAfterFileEdit(input);
    expect(result).toEqual({});
  });

  it('logs edit for in-scope markdown file in safety-net mode', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      file_path: mdPath,
      edits: [{ old_string: '# Hello', new_string: '# Updated' }],
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleAfterFileEdit(input);
    expect(result).toEqual({});

    // Verify pending.json was written
    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    const raw = await fs.readFile(pendingPath, 'utf-8');
    const pending = JSON.parse(raw);
    expect(pending).toHaveLength(1);
    expect(pending[0].file).toBe(mdPath);
    expect(pending[0].old_text).toBe('# Hello');
    expect(pending[0].new_text).toBe('# Updated');
    expect(pending[0].session_id).toBe('cursor-session-1');
  });

  it('skips logging in strict mode', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n',
      'utf-8',
    );

    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      file_path: mdPath,
      edits: [{ old_string: '# Hello', new_string: '# Updated' }],
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleAfterFileEdit(input);
    expect(result).toEqual({});

    // Verify no pending.json was written
    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    await expect(fs.readFile(pendingPath, 'utf-8')).rejects.toThrow();
  });

  it('skips logging for out-of-scope files', async () => {
    const jsPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(jsPath, 'const x = 2;', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      file_path: jsPath,
      edits: [{ old_string: 'const x = 1;', new_string: 'const x = 2;' }],
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleAfterFileEdit(input);
    expect(result).toEqual({});

    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    await expect(fs.readFile(pendingPath, 'utf-8')).rejects.toThrow();
  });

  it('logs multiple edits from a single hook call', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated\n\nNew paragraph', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      file_path: mdPath,
      edits: [
        { old_string: '# Hello', new_string: '# Updated' },
        { old_string: '', new_string: 'New paragraph' },
      ],
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleAfterFileEdit(input);
    expect(result).toEqual({});

    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    const raw = await fs.readFile(pendingPath, 'utf-8');
    const pending = JSON.parse(raw);
    expect(pending).toHaveLength(2);
  });

  it('uses conversation_id as session identifier', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      file_path: mdPath,
      edits: [{ old_string: '# Hello', new_string: '# Updated' }],
      workspace_roots: [tmpDir],
      conversation_id: 'my-cursor-conversation',
    };
    await handleAfterFileEdit(input);

    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    const raw = await fs.readFile(pendingPath, 'utf-8');
    const pending = JSON.parse(raw);
    expect(pending[0].session_id).toBe('my-cursor-conversation');
  });

  it('skips files excluded from hooks', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[hooks]\nexclude = ["llm-garden/**"]\n\n[policy]\nmode = "safety-net"\n',
      'utf-8',
    );

    const gardenDir = path.join(tmpDir, 'llm-garden');
    await fs.mkdir(gardenDir, { recursive: true });
    const mdPath = path.join(gardenDir, 'poem.md');
    await fs.writeFile(mdPath, '# Updated poem', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'afterFileEdit',
      file_path: mdPath,
      edits: [{ old_string: '# Poem', new_string: '# Updated poem' }],
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleAfterFileEdit(input);
    expect(result).toEqual({});

    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    await expect(fs.readFile(pendingPath, 'utf-8')).rejects.toThrow();
  });
});
