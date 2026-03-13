import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handlePostToolUse, readPendingEdits } from 'changetracks-hooks/internals';
import type { HookInput } from 'changetracks-hooks/internals';

describe('PostToolUse handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-post-'));
    // Create .changetracks dir with config
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('logs an Edit to pending.json for an in-scope markdown file', async () => {
    // Create the target file (already edited — post-tool-use fires AFTER)
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, 'Some prefix text. Updated content here. Some suffix text.', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: mdPath,
        old_string: 'Original content here',
        new_string: 'Updated content here',
      },
      session_id: 'ses_test1',
      cwd: tmpDir,
    };

    const result = await handlePostToolUse(input);
    expect(result.logged).toBe(true);

    const edits = await readPendingEdits(tmpDir);
    expect(edits).toHaveLength(1);
    expect(edits[0].file).toBe(mdPath);
    expect(edits[0].old_text).toBe('Original content here');
    expect(edits[0].new_text).toBe('Updated content here');
    expect(edits[0].session_id).toBe('ses_test1');
  });

  it('skips out-of-scope files (non-markdown)', async () => {
    const jsPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(jsPath, 'const x = 2;', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: jsPath,
        old_string: 'const x = 1;',
        new_string: 'const x = 2;',
      },
      session_id: 'ses_test1',
      cwd: tmpDir,
    };

    const result = await handlePostToolUse(input);
    expect(result.logged).toBe(false);

    const edits = await readPendingEdits(tmpDir);
    expect(edits).toHaveLength(0);
  });

  it('skips non-Edit/Write/Read tools', async () => {
    const input: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      session_id: 'ses_test1',
      cwd: tmpDir,
    };

    const result = await handlePostToolUse(input);
    expect(result.logged).toBe(false);
  });

  // --- read_tracked_file logging ---

  it('logs read_tracked_file calls as informational audit entries', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello\nSome content', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: 'read_tracked_file',
      tool_input: { file: mdPath },
      session_id: 'ses_read1',
      cwd: tmpDir,
    };

    const result = await handlePostToolUse(input);
    expect(result.logged).toBe(true);

    const edits = await readPendingEdits(tmpDir);
    expect(edits).toHaveLength(1);
    expect(edits[0].file).toBe(mdPath);
    expect(edits[0].old_text).toBe('');
    expect(edits[0].new_text).toBe('');
    expect(edits[0].session_id).toBe('ses_read1');
    expect(edits[0].context_before).toBe('read_tracked_file');
  });

  it('does not log read_tracked_file when file param is missing', async () => {
    const input: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: 'read_tracked_file',
      tool_input: {},
      session_id: 'ses_read2',
      cwd: tmpDir,
    };

    const result = await handlePostToolUse(input);
    expect(result.logged).toBe(false);
  });

  it('captures context_before and context_after from the post-edit file', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(
      mdPath,
      'AAAA BBBB CCCC new_stuff DDDD EEEE FFFF',
      'utf-8',
    );

    const input: HookInput = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: mdPath,
        old_string: 'old_stuff',
        new_string: 'new_stuff',
      },
      session_id: 'ses_test1',
      cwd: tmpDir,
    };

    await handlePostToolUse(input);

    const edits = await readPendingEdits(tmpDir);
    expect(edits).toHaveLength(1);
    expect(edits[0].context_before).toBe('AAAA BBBB CCCC ');
    expect(edits[0].context_after).toBe(' DDDD EEEE FFFF');
  });

  // --- policy.mode gating ---

  describe('policy.mode gating', () => {
    it('skips logging in strict mode', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n', 'utf-8');
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Updated', 'utf-8');
      const result = await handlePostToolUse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: '# Hello', new_string: '# Updated' },
        session_id: 'test-session',
        cwd: tmpDir,
      });
      expect(result.logged).toBe(false);
    });

    it('skips logging in permissive mode', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "permissive"\n', 'utf-8');
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Updated', 'utf-8');
      const result = await handlePostToolUse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: '# Hello', new_string: '# Updated' },
        session_id: 'test-session',
        cwd: tmpDir,
      });
      expect(result.logged).toBe(false);
    });

    it('logs in safety-net mode', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "safety-net"\n', 'utf-8');
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, 'Some prefix. Updated content. Some suffix.', 'utf-8');
      const result = await handlePostToolUse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: 'Original content', new_string: 'Updated content' },
        session_id: 'test-session',
        cwd: tmpDir,
      });
      expect(result.logged).toBe(true);
    });
  });

  describe('edit classification', () => {
    // All tests need safety-net mode to log edits
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tmpDir, '.changetracks', 'config.toml'),
        '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "safety-net"\n\n[author]\ndefault = "test-agent"\n',
        'utf-8',
      );
    });

    it('classifies Write tool as creation with tool_name=Write', async () => {
      const mdPath = path.join(tmpDir, 'new-file.md');
      await fs.writeFile(mdPath, '# New File\n\nContent here.\n', 'utf-8');

      const result = await handlePostToolUse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: mdPath, content: '# New File\n\nContent here.\n' },
        session_id: 'ses_class',
        cwd: tmpDir,
      });

      expect(result.logged).toBe(true);
      const edits = await readPendingEdits(tmpDir);
      expect(edits[0].tool_name).toBe('Write');
      expect(edits[0].edit_class).toBe('creation');
    });

    it('classifies Edit with empty old_string as insertion', async () => {
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello\n\nNew paragraph.\n\nOld content.\n', 'utf-8');

      const result = await handlePostToolUse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: '', new_string: 'New paragraph.\n\n' },
        session_id: 'ses_class',
        cwd: tmpDir,
      });

      expect(result.logged).toBe(true);
      const edits = await readPendingEdits(tmpDir);
      expect(edits[0].tool_name).toBe('Edit');
      expect(edits[0].edit_class).toBe('insertion');
    });

    it('classifies Edit with empty new_string as deletion', async () => {
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello\n', 'utf-8');

      const result = await handlePostToolUse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: 'Removed text.', new_string: '' },
        session_id: 'ses_class',
        cwd: tmpDir,
      });

      expect(result.logged).toBe(true);
      const edits = await readPendingEdits(tmpDir);
      expect(edits[0].tool_name).toBe('Edit');
      expect(edits[0].edit_class).toBe('deletion');
    });

    it('classifies Edit with both old and new as substitution', async () => {
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, 'New heading.\n', 'utf-8');

      const result = await handlePostToolUse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: 'Old heading.', new_string: 'New heading.' },
        session_id: 'ses_class',
        cwd: tmpDir,
      });

      expect(result.logged).toBe(true);
      const edits = await readPendingEdits(tmpDir);
      expect(edits[0].tool_name).toBe('Edit');
      expect(edits[0].edit_class).toBe('substitution');
    });
  });
});
