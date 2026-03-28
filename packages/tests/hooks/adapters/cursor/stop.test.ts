import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleCursorStop } from 'changedown-hooks/internals';
import type { HookInput } from 'changedown-hooks/internals';

describe('Cursor stop handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-cursor-stop-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(scDir, { recursive: true });
    // Default config: safety-net mode
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "safety-net"\n\n[author]\ndefault = "ai:claude"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty when no pending edits exist', async () => {
    const input: HookInput = {
      hook_event_name: 'stop',
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleCursorStop(input);
    expect(result).toEqual({});
  });

  it('clears pending edits without wrapping in strict mode', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n\n[author]\ndefault = "ai:claude"\n',
      'utf-8',
    );

    // Write some pending edits
    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    await fs.writeFile(
      pendingPath,
      JSON.stringify([
        {
          file: path.join(tmpDir, 'readme.md'),
          old_text: '# Hello',
          new_text: '# Updated',
          timestamp: new Date().toISOString(),
          session_id: 'cursor-session-1',
        },
      ]),
      'utf-8',
    );

    const input: HookInput = {
      hook_event_name: 'stop',
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleCursorStop(input);
    expect(result).toEqual({});

    // Verify pending.json was cleaned up
    await expect(fs.readFile(pendingPath, 'utf-8')).rejects.toThrow();
  });

  it('clears pending edits without wrapping in permissive mode', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "permissive"\n\n[author]\ndefault = "ai:claude"\n',
      'utf-8',
    );

    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    await fs.writeFile(
      pendingPath,
      JSON.stringify([
        {
          file: path.join(tmpDir, 'readme.md'),
          old_text: '',
          new_text: 'new text',
          timestamp: new Date().toISOString(),
          session_id: 'cursor-session-1',
        },
      ]),
      'utf-8',
    );

    const input: HookInput = {
      hook_event_name: 'stop',
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleCursorStop(input);
    expect(result).toEqual({});

    // Verify pending.json was cleaned up
    await expect(fs.readFile(pendingPath, 'utf-8')).rejects.toThrow();
  });

  it('applies pending edits as CriticMarkup in safety-net mode', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated', 'utf-8');

    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    await fs.writeFile(
      pendingPath,
      JSON.stringify([
        {
          file: mdPath,
          old_text: '# Hello',
          new_text: '# Updated',
          timestamp: new Date().toISOString(),
          session_id: 'cursor-session-1',
          edit_class: 'substitution',
          tool_name: 'Edit',
        },
      ]),
      'utf-8',
    );

    const input: HookInput = {
      hook_event_name: 'stop',
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    const result = await handleCursorStop(input);
    // Cursor stop hooks return empty (no systemMessage support)
    expect(result).toEqual({});

    // Verify the file was wrapped with CriticMarkup
    const content = await fs.readFile(mdPath, 'utf-8');
    expect(content).toContain('{~~');
    expect(content).toContain('# Hello');
    expect(content).toContain('# Updated');
    expect(content).toContain('[^cn-');
  });

  it('uses conversation_id for session identification', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated', 'utf-8');

    const pendingPath = path.join(tmpDir, '.changedown', 'pending.json');
    await fs.writeFile(
      pendingPath,
      JSON.stringify([
        {
          file: mdPath,
          old_text: '# Hello',
          new_text: '# Updated',
          timestamp: new Date().toISOString(),
          session_id: 'cursor-session-1',
          edit_class: 'substitution',
          tool_name: 'Edit',
        },
        {
          file: mdPath,
          old_text: 'Other',
          new_text: 'Changed',
          timestamp: new Date().toISOString(),
          session_id: 'different-session',
          edit_class: 'substitution',
          tool_name: 'Edit',
        },
      ]),
      'utf-8',
    );

    const input: HookInput = {
      hook_event_name: 'stop',
      workspace_roots: [tmpDir],
      conversation_id: 'cursor-session-1',
    };
    await handleCursorStop(input);

    // The other session's edits should remain
    const raw = await fs.readFile(pendingPath, 'utf-8');
    const remaining = JSON.parse(raw);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].session_id).toBe('different-session');
  });
});
