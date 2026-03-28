// Adapter-level tests for Claude Code Stop handler.
// Tests the I/O contract: given a HookInput, verify the return shape.
// Behavioral logic (batch wrapping, ID allocation, edit positioning)
// is tested in core/batch-wrapper.test.ts, core/id-allocator.test.ts,
// and core/edit-positioning.test.ts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleStop, appendPendingEdit, readPendingEdits } from 'changedown-hooks/internals';
import type { HookInput } from 'changedown-hooks/internals';

describe('Claude Code Stop adapter — I/O contract', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-adapter-stop-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(scDir, { recursive: true });
    // Default safety-net config
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[policy]\nmode = "safety-net"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const makeInput = (sessionId: string): HookInput => ({
    hook_event_name: 'Stop',
    session_id: sessionId,
    cwd: tmpDir,
    stop_hook_active: true,
  });

  // --- Return shape: StopResult ---

  it('returns empty object when no pending edits exist', async () => {
    const result = await handleStop(makeInput('ses_empty'));
    expect(result).toEqual({});
    expect(result.systemMessage).toBeUndefined();
  });

  it('returns StopResult with systemMessage when edits are applied', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Updated heading\n', 'utf-8');
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: '# Original heading',
      new_text: '# Updated heading',
      timestamp: new Date().toISOString(),
      session_id: 'ses_wrap',
    });

    const result = await handleStop(makeInput('ses_wrap'));
    expect(result.systemMessage).toBeDefined();
    expect(typeof result.systemMessage).toBe('string');
    expect(result.systemMessage).toContain('edit(s)');
  });

  it('returns empty object for different session edits', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated', 'utf-8');
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original',
      new_text: 'Updated',
      timestamp: new Date().toISOString(),
      session_id: 'ses_OTHER',
    });

    const result = await handleStop(makeInput('ses_mine'));
    expect(result).toEqual({});
  });

  // --- Policy mode gating (return shape) ---

  it('returns empty object in strict mode (no batch-wrapping)', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n\n[author]\ndefault = "ai:claude-opus-4.6"\n',
      'utf-8',
    );
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated', 'utf-8');
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original',
      new_text: 'Updated',
      timestamp: new Date().toISOString(),
      session_id: 'ses_strict',
    });

    const result = await handleStop(makeInput('ses_strict'));
    expect(result).toEqual({});
  });

  it('returns empty object in permissive mode (no batch-wrapping)', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "permissive"\n\n[author]\ndefault = "ai:claude-opus-4.6"\n',
      'utf-8',
    );
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated', 'utf-8');
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original',
      new_text: 'Updated',
      timestamp: new Date().toISOString(),
      session_id: 'ses_perm',
    });

    const result = await handleStop(makeInput('ses_perm'));
    expect(result).toEqual({});
  });

  // --- Pending edits cleared after processing ---

  it('clears pending edits after successful wrapping', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'ses_clear',
    });

    await handleStop(makeInput('ses_clear'));
    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toEqual([]);
  });

  it('clears pending edits in non-safety-net mode (strict)', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n\n[author]\ndefault = "ai:claude-opus-4.6"\n',
      'utf-8',
    );
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated', 'utf-8');
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original',
      new_text: 'Updated',
      timestamp: new Date().toISOString(),
      session_id: 'ses_strict_clear',
    });

    await handleStop(makeInput('ses_strict_clear'));
    const remaining = await readPendingEdits(tmpDir);
    expect(remaining).toEqual([]);
  });

  // --- Session ID fallback ---

  it('uses "unknown" as session_id when not provided in input', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');
    await appendPendingEdit(tmpDir, {
      file: mdPath,
      old_text: 'Original text',
      new_text: 'Updated text',
      timestamp: new Date().toISOString(),
      session_id: 'unknown',
    });

    const input: HookInput = {
      hook_event_name: 'Stop',
      // session_id intentionally omitted
      cwd: tmpDir,
      stop_hook_active: true,
    };

    const result = await handleStop(input);
    expect(result.systemMessage).toBeDefined();
    expect(result.systemMessage).toContain('1 edit(s)');
  });

  // --- CWD fallback ---

  it('uses process.cwd() when cwd is not in input', async () => {
    // This tests that the adapter does not crash when cwd is missing.
    // It will use process.cwd() and find no config / no pending edits.
    const input: HookInput = {
      hook_event_name: 'Stop',
      session_id: 'ses_nocwd',
    };
    const result = await handleStop(input);
    // No edits in process.cwd(), so result is empty
    expect(result).toEqual({});
  });
});
