// Adapter-level tests for Claude Code PostToolUse handler.
// Tests the I/O contract: given a HookInput, verify the return shape.
// Behavioral logic (edit tracking, scope) is tested in core/edit-tracker.test.ts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handlePostToolUse, readPendingEdits } from 'changedown-hooks/internals';
import type { HookInput } from 'changedown-hooks/internals';

describe('Claude Code PostToolUse adapter — I/O contract', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-adapter-post-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(scDir, { recursive: true });
    // Default safety-net config (logs edits)
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[policy]\nmode = "safety-net"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --- Return shape ---

  it('returns { logged: true } for in-scope Edit on markdown file', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated content here.', 'utf-8');
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: mdPath, old_string: 'Old content', new_string: 'Updated content here.' },
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: true });
  });

  it('returns { logged: false } for non-Edit/Write tools', async () => {
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: false });
  });

  it('returns { logged: false } for out-of-scope file', async () => {
    const jsPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(jsPath, 'const x = 2;', 'utf-8');
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: jsPath, old_string: 'const x = 1;', new_string: 'const x = 2;' },
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: false });
  });

  it('returns { logged: false } when cwd is missing', async () => {
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/some/file.md', old_string: 'a', new_string: 'b' },
      session_id: 'ses_adapter',
    });
    expect(result).toEqual({ logged: false });
  });

  it('returns { logged: false } when tool_input is missing', async () => {
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: false });
  });

  it('returns { logged: false } when file_path is empty', async () => {
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '', old_string: 'a', new_string: 'b' },
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: false });
  });

  // --- read_tracked_file audit logging ---

  it('returns { logged: true } for read_tracked_file with file param', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'read_tracked_file',
      tool_input: { file: mdPath },
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: true });
  });

  it('returns { logged: false } for read_tracked_file without file param', async () => {
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'read_tracked_file',
      tool_input: {},
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: false });
  });

  // --- Write tool ---

  it('returns { logged: true } for Write tool on in-scope file', async () => {
    const mdPath = path.join(tmpDir, 'new.md');
    await fs.writeFile(mdPath, '# New File\nContent.\n', 'utf-8');
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: mdPath, content: '# New File\nContent.\n' },
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: true });
  });

  // --- Pending edits are written ---

  it('writes pending edit to .changedown/pending.json', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated text', 'utf-8');
    await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: mdPath, old_string: 'Original text', new_string: 'Updated text' },
      session_id: 'ses_adapter',
      cwd: tmpDir,
    });
    const edits = await readPendingEdits(tmpDir);
    expect(edits).toHaveLength(1);
    expect(edits[0].file).toBe(mdPath);
    expect(edits[0].session_id).toBe('ses_adapter');
    expect(edits[0].old_text).toBe('Original text');
    expect(edits[0].new_text).toBe('Updated text');
  });

  // --- Session ID fallback ---

  it('uses "unknown" as session_id when not provided', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Updated', 'utf-8');
    await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: mdPath, old_string: 'Original', new_string: 'Updated' },
      cwd: tmpDir,
    });
    const edits = await readPendingEdits(tmpDir);
    expect(edits).toHaveLength(1);
    expect(edits[0].session_id).toBe('unknown');
  });

  // --- Raw Read audit logging ---

  it('logs raw Read on tracked file as audit entry', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: mdPath },
      session_id: 'ses_read',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: true });
  });

  it('returns logged: false for Read on non-tracked file', async () => {
    const tsPath = path.join(tmpDir, 'app.ts');
    await fs.writeFile(tsPath, 'const x = 1;', 'utf-8');
    const result = await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: tsPath },
      session_id: 'ses_read',
      cwd: tmpDir,
    });
    expect(result).toEqual({ logged: false });
  });
});
