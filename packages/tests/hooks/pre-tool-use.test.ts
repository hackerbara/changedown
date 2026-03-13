import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handlePreToolUse } from 'changetracks-hooks/internals';
import type { HookInput } from 'changetracks-hooks/internals';

describe('PreToolUse handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-pre-'));
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

  it('returns empty object for non-Edit/Write tools', async () => {
    const input: HookInput = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: path.join(tmpDir, 'readme.md') },
      cwd: tmpDir,
    };
    const result = await handlePreToolUse(input);
    expect(result).toEqual({});
  });

  it('returns coaching message for in-scope markdown file (allows edit)', async () => {
    // Create the target file
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: mdPath,
        old_string: '# Hello',
        new_string: '# Updated',
      },
      cwd: tmpDir,
    };
    const result = await handlePreToolUse(input);
    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput!.hookEventName).toBe('PreToolUse');
    expect(result.hookSpecificOutput!.permissionDecision).toBe('allow');
    expect(result.hookSpecificOutput!.additionalContext).toContain('tracked by ChangeTracks');
  });

  it('returns empty object for out-of-scope file (allows — hooks fail-open)', async () => {
    const jsPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(jsPath, 'const x = 1;', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: jsPath,
        old_string: 'const x = 1;',
        new_string: 'const x = 2;',
      },
      cwd: tmpDir,
    };
    const result = await handlePreToolUse(input);
    expect(result).toEqual({});
  });

  // --- read_tracked_file passthrough ---

  it('returns empty object for read_tracked_file (read-only, always pass through)', async () => {
    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_tracked_file',
      tool_input: { file: mdPath },
      cwd: tmpDir,
    };
    const result = await handlePreToolUse(input);
    expect(result).toEqual({});
  });

  it('returns empty object for read_tracked_file even with enforcement=block', async () => {
    const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
    await fs.writeFile(
      configPath,
      `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[hooks]\nenforcement = "block"\n`,
      'utf-8',
    );

    const mdPath = path.join(tmpDir, 'readme.md');
    await fs.writeFile(mdPath, '# Hello', 'utf-8');

    const input: HookInput = {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_tracked_file',
      tool_input: { file: mdPath },
      cwd: tmpDir,
    };
    const result = await handlePreToolUse(input);
    expect(result).toEqual({});
  });

  // --- Hashline tip tests ---

  describe('hashline tip', () => {
    it('includes hashline tip in warn message when hashline enabled', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(
        configPath,
        `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[hashline]\nenabled = true\n`,
        'utf-8',
      );

      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');

      const input: HookInput = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: mdPath,
          old_string: '# Hello',
          new_string: '# Updated',
        },
        cwd: tmpDir,
      };
      const result = await handlePreToolUse(input);
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('allow');
      expect(result.hookSpecificOutput!.additionalContext).toContain('read_tracked_file');
      expect(result.hookSpecificOutput!.additionalContext).toContain('LINE:HASH');
    });

    it('does NOT include hashline tip when hashline disabled (default)', async () => {
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');

      const input: HookInput = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: mdPath,
          old_string: '# Hello',
          new_string: '# Updated',
        },
        cwd: tmpDir,
      };
      const result = await handlePreToolUse(input);
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('allow');
      expect(result.hookSpecificOutput!.additionalContext).not.toContain('LINE:HASH');
    });

    it('includes hashline tip in block message when hashline enabled', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(
        configPath,
        `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[hooks]\nenforcement = "block"\n\n[hashline]\nenabled = true\n`,
        'utf-8',
      );

      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');

      const input: HookInput = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: mdPath,
          old_string: '# Hello',
          new_string: '# Updated',
        },
        cwd: tmpDir,
      };
      const result = await handlePreToolUse(input);
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
      // Warm redirect replaces generic hint — still contains propose_change
      expect(result.hookSpecificOutput!.permissionDecisionReason).toContain('propose_change');
      // With hashline enabled but protocol=classic (default), redirect uses old_text/new_text
      expect(result.hookSpecificOutput!.permissionDecisionReason).toContain('old_text');
    });

    it('does NOT include hashline tip in block message when hashline disabled', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(
        configPath,
        `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[hooks]\nenforcement = "block"\n`,
        'utf-8',
      );

      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');

      const input: HookInput = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: mdPath,
          old_string: '# Hello',
          new_string: '# Updated',
        },
        cwd: tmpDir,
      };
      const result = await handlePreToolUse(input);
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
      expect(result.hookSpecificOutput!.permissionDecisionReason).not.toContain('LINE:HASH');
    });
  });

  // --- Enforcement mode tests ---

  describe('enforcement mode', () => {
    it('enforcement=block returns permissionDecision=deny with propose_change instructions', async () => {
      // Write config with enforcement=block
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(
        configPath,
        `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[hooks]\nenforcement = "block"\n`,
        'utf-8',
      );

      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');

      const input: HookInput = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: mdPath,
          old_string: '# Hello',
          new_string: '# Updated',
        },
        cwd: tmpDir,
      };
      const result = await handlePreToolUse(input);
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
      // Warm redirect contains the actual propose_change call with old_text/new_text
      expect(result.hookSpecificOutput!.permissionDecisionReason).toContain('propose_change');
      expect(result.hookSpecificOutput!.permissionDecisionReason).toContain('old_text="# Hello"');
      expect(result.hookSpecificOutput!.permissionDecisionReason).toContain('new_text="# Updated"');
    });

    it('enforcement=warn returns permissionDecision=allow (current behavior)', async () => {
      // Config already has enforcement=warn (default from beforeEach)
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');

      const input: HookInput = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: mdPath,
          old_string: '# Hello',
          new_string: '# Updated',
        },
        cwd: tmpDir,
      };
      const result = await handlePreToolUse(input);
      expect(result.hookSpecificOutput).toBeDefined();
      expect(result.hookSpecificOutput!.permissionDecision).toBe('allow');
    });

    it('enforcement=block + file not in scope returns empty (allows)', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(
        configPath,
        `[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[hooks]\nenforcement = "block"\n`,
        'utf-8',
      );

      const jsPath = path.join(tmpDir, 'index.js');
      await fs.writeFile(jsPath, 'const x = 1;', 'utf-8');

      const input: HookInput = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: {
          file_path: jsPath,
          old_string: 'const x = 1;',
          new_string: 'const x = 2;',
        },
        cwd: tmpDir,
      };
      const result = await handlePreToolUse(input);
      expect(result).toEqual({});
    });

  });

  // --- policy.mode tests ---

  describe('policy.mode = permissive', () => {
    it('passes through Edit on tracked files without warning', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "permissive"\n', 'utf-8');
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
  });

  describe('policy.mode = strict', () => {
    it('blocks Edit on tracked files with warm redirect', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "strict"\n', 'utf-8');
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: '# Hello', new_string: '# Updated' },
        cwd: tmpDir,
      });
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
      // Warm redirect contains a pre-formatted propose_change call
      expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('propose_change');
      expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('strict mode');
    });
  });

  describe('policy.mode = safety-net', () => {
    it('allows Edit with advisory on tracked files', async () => {
      const configPath = path.join(tmpDir, '.changetracks', 'config.toml');
      await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n\n[policy]\nmode = "safety-net"\n', 'utf-8');
      const mdPath = path.join(tmpDir, 'readme.md');
      await fs.writeFile(mdPath, '# Hello', 'utf-8');
      const result = await handlePreToolUse({
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: mdPath, old_string: '# Hello', new_string: '# Updated' },
        cwd: tmpDir,
      });
      expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
      expect(result.hookSpecificOutput?.additionalContext).toContain('policy: safety-net');
    });
  });
});
