// Adapter-level tests for Claude Code PreToolUse handler.
// Tests the I/O contract: given a HookInput, verify the output shape.
// Behavioral logic (policy evaluation) is tested in core/policy-engine.test.ts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handlePreToolUse } from 'changetracks-hooks/internals';
import type { HookInput } from 'changetracks-hooks/internals';

describe('Claude Code PreToolUse adapter — I/O contract', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-adapter-pre-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    // Default safety-net config
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --- Output shape: empty object for passthrough ---

  it('returns empty object for non-Edit/Write tools (Bash)', async () => {
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      cwd: tmpDir,
    });
    expect(result).toEqual({});
  });

  it('returns empty object for non-Edit/Write tools (Glob)', async () => {
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Glob',
      cwd: tmpDir,
    });
    expect(result).toEqual({});
  });

  it('returns empty object for read_tracked_file', async () => {
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'read_tracked_file',
      tool_input: { file: path.join(tmpDir, 'readme.md') },
      cwd: tmpDir,
    });
    expect(result).toEqual({});
  });

  it('returns empty object when cwd is missing', async () => {
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/some/file.md', old_string: 'a', new_string: 'b' },
    });
    expect(result).toEqual({});
  });

  it('returns empty object when tool_input is missing', async () => {
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      cwd: tmpDir,
    });
    expect(result).toEqual({});
  });

  it('returns empty object when file_path is empty', async () => {
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '', old_string: 'a', new_string: 'b' },
      cwd: tmpDir,
    });
    expect(result).toEqual({});
  });

  it('returns empty object for out-of-scope file', async () => {
    const jsPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(jsPath, 'const x = 1;', 'utf-8');
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: jsPath, old_string: 'x', new_string: 'y' },
      cwd: tmpDir,
    });
    expect(result).toEqual({});
  });

  // --- Output shape: hookSpecificOutput with allow ---

  it('returns hookSpecificOutput with permissionDecision=allow in safety-net mode', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: mdPath, old_string: '# Hello', new_string: '# Updated' },
      cwd: tmpDir,
    });
    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput!.hookEventName).toBe('PreToolUse');
    expect(result.hookSpecificOutput!.permissionDecision).toBe('allow');
    expect(typeof result.hookSpecificOutput!.additionalContext).toBe('string');
  });

  // --- Output shape: hookSpecificOutput with deny ---

  it('returns hookSpecificOutput with permissionDecision=deny in strict mode', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changetracks', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n',
      'utf-8',
    );
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: mdPath, old_string: '# Hello', new_string: '# Updated' },
      cwd: tmpDir,
    });
    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput!.hookEventName).toBe('PreToolUse');
    expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
    expect(typeof result.hookSpecificOutput!.permissionDecisionReason).toBe('string');
  });

  // --- Output shape: empty for permissive mode ---

  it('returns empty object in permissive mode (no interference)', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changetracks', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "permissive"\n',
      'utf-8',
    );
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: mdPath, old_string: '# Hello', new_string: '# Updated' },
      cwd: tmpDir,
    });
    expect(result).toEqual({});
  });

  // --- Write tool also triggers ---

  it('returns hookSpecificOutput for Write tool on in-scope file', async () => {
    const mdPath = path.join(tmpDir, 'new.md');
    const result = await handlePreToolUse({
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: mdPath, content: '# New file' },
      cwd: tmpDir,
    });
    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput!.hookEventName).toBe('PreToolUse');
  });

  // --- Warm redirect in strict mode ---

  describe('warm redirect in strict mode', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tmpDir, '.changetracks', 'config.toml'),
        '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n\n[protocol]\nmode = "classic"\n',
        'utf-8',
      );
    });

    it('deny reason contains propose_change call for Edit', async () => {
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello\n\nSome content here.', 'utf-8');
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: '# Hello', new_string: '# Updated' },
        cwd: tmpDir,
      });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
      const reason = result.hookSpecificOutput!.permissionDecisionReason!;
      expect(reason).toContain('propose_change');
      expect(reason).toContain('old_text="# Hello"');
      expect(reason).toContain('new_text="# Updated"');
    });

    it('deny reason contains propose_change call for Write', async () => {
      const mdPath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(mdPath, 'Line one\nLine two', 'utf-8');
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: mdPath, content: 'Line one\nLine two\nLine three' },
        cwd: tmpDir,
      });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
      const reason = result.hookSpecificOutput!.permissionDecisionReason!;
      expect(reason).toContain('propose_change');
    });

    it('falls back to generic agentHint when file read fails', async () => {
      // File does not exist on disk — but evaluateRawEdit sees scope match + strict
      // Because tool_name is Edit (not Write), checkFileExists is false, so it still denies.
      const mdPath = path.join(tmpDir, 'nonexistent.md');
      // Create the file so it passes scope check, then delete it to make the redirect fail
      await fs.writeFile(mdPath, 'temp', 'utf-8');
      // Now remove it — the file won't be readable for redirect
      await fs.rm(mdPath);
      // Re-create to ensure evaluateRawEdit doesn't hit the "file does not exist" creation bypass
      // Actually for Edit, checkFileExists is false, so we need the file to exist for scope.
      // Let's just use an approach where we break the file read differently.
      // The simplest approach: create file, let scope check pass, everything works.
      // Instead, test the fallback by checking the generic hint is still valid.
      // Use a file that exists but triggers an error in formatRedirect.
      // Actually the cleanest test: verify that when there IS no file, the generic hint appears.
      // For Edit tool, checkFileExists is false so evaluateRawEdit won't bypass.
      // But fs.readFile in pre-tool-use.ts will fail on a nonexistent file.
      // The catch block should fall back to the generic agentHint.
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: 'a', new_string: 'b' },
        cwd: tmpDir,
      });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
      const reason = result.hookSpecificOutput!.permissionDecisionReason!;
      // Falls back to generic hint from policy engine
      expect(reason).toContain('BLOCKED');
      expect(reason).toContain('propose_change');
    });

    it('deny reason uses compact at+op syntax when protocol is compact and hashline is enabled', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.changetracks', 'config.toml'),
        '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n\n[protocol]\nmode = "compact"\n\n[hashline]\nenabled = true\n',
        'utf-8',
      );
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, 'Line one\nLine two\nLine three', 'utf-8');
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: 'Line two', new_string: 'Line TWO' },
        cwd: tmpDir,
      });
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
      const reason = result.hookSpecificOutput!.permissionDecisionReason!;
      expect(reason).toContain('propose_change');
      expect(reason).toContain('at=');
      expect(reason).toContain('op=');
    });

    it('uses relative file path in the redirect', async () => {
      const mdPath = path.join(tmpDir, 'docs', 'readme.md');
      await fs.mkdir(path.join(tmpDir, 'docs'), { recursive: true });
      await fs.writeFile(mdPath, '# Title\n\nBody text.', 'utf-8');
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: '# Title', new_string: '# New Title' },
        cwd: tmpDir,
      });
      expect(result.hookSpecificOutput).toBeDefined();
      const reason = result.hookSpecificOutput!.permissionDecisionReason!;
      expect(reason).toContain('docs/readme.md');
      // Should NOT contain the full absolute path
      expect(reason).not.toContain(tmpDir);
    });
  });

  // --- Read tool interception ---

  describe('Read tool interception', () => {
    it('returns empty object for Read on non-tracked file', async () => {
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: path.join(tmpDir, 'src', 'app.ts') },
        cwd: tmpDir,
      });
      expect(result).toEqual({});
    });

    it('returns empty object for Read in safety-net mode', async () => {
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: mdPath },
        cwd: tmpDir,
      });
      expect(result).toEqual({});
    });

    it('denies Read in strict mode on tracked file with warm redirect', async () => {
      await fs.writeFile(
        path.join(tmpDir, '.changetracks', 'config.toml'),
        '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n\n[author]\ndefault = "ai:test"\n',
        'utf-8',
      );
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');

      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: mdPath },
        cwd: tmpDir,
      });

      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
      expect(result.hookSpecificOutput!.permissionDecisionReason).toContain('read_tracked_file');
      expect(result.hookSpecificOutput!.permissionDecisionReason).toContain('readme.md');
    });

    it('returns empty object for Read without file_path', async () => {
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: {},
        cwd: tmpDir,
      });
      expect(result).toEqual({});
    });
  });
});
