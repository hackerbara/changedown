// core/creation-tracking.test.ts — File creation tracking via hooks (Phase 4)
// Tests policy engine file-existence bypass and PostToolUse creation wrapping.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { evaluateRawEdit, handlePostToolUse, DEFAULT_CONFIG } from 'changedown-hooks/internals';
import type { ChangeDownConfig } from 'changedown-hooks/internals';

function makeConfig(overrides: Partial<ChangeDownConfig> = {}): ChangeDownConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides };
}

describe('File creation tracking — policy engine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-creation-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allows Write to non-existent file in strict mode', () => {
    const config = makeConfig({ policy: { mode: 'strict', creation_tracking: 'footnote' } });
    const nonExistentFile = path.join(tmpDir, 'new-doc.md');

    const result = evaluateRawEdit(nonExistentFile, config, tmpDir, { checkFileExists: true });
    expect(result.action).toBe('allow');
    expect(result.reason).toContain('creation');
  });

  it('still blocks Write to existing file in strict mode', () => {
    const config = makeConfig({ policy: { mode: 'strict', creation_tracking: 'footnote' } });
    const existingFile = path.join(tmpDir, 'existing.md');
    fs.writeFileSync(existingFile, '# Existing');

    const result = evaluateRawEdit(existingFile, config, tmpDir, { checkFileExists: true });
    expect(result.action).toBe('deny');
  });

  it('allows Write to non-existent file in safety-net mode', () => {
    const config = makeConfig({ policy: { mode: 'safety-net', creation_tracking: 'footnote' } });
    const nonExistentFile = path.join(tmpDir, 'brand-new.md');

    const result = evaluateRawEdit(nonExistentFile, config, tmpDir, { checkFileExists: true });
    expect(result.action).toBe('allow');
    expect(result.reason).toContain('creation');
  });

  it('does not bypass for out-of-scope files', () => {
    const config = makeConfig({ policy: { mode: 'strict', creation_tracking: 'footnote' } });
    const jsFile = path.join(tmpDir, 'app.js'); // .js not in scope

    const result = evaluateRawEdit(jsFile, config, tmpDir, { checkFileExists: true });
    expect(result.action).toBe('allow');
    expect(result.reason).toContain('not in tracking scope');
  });

  it('does not bypass when creation_tracking is none', () => {
    const config = makeConfig({ policy: { mode: 'strict', creation_tracking: 'none' } });
    const nonExistentFile = path.join(tmpDir, 'new-doc.md');

    const result = evaluateRawEdit(nonExistentFile, config, tmpDir, { checkFileExists: true });
    expect(result.action).toBe('deny');
  });

  it('does not bypass without checkFileExists option', () => {
    const config = makeConfig({ policy: { mode: 'strict', creation_tracking: 'footnote' } });
    const nonExistentFile = path.join(tmpDir, 'new-doc.md');

    // Without checkFileExists, the creation bypass should NOT activate
    const result = evaluateRawEdit(nonExistentFile, config, tmpDir);
    expect(result.action).toBe('deny');
  });
});

describe('File creation tracking — PostToolUse wrapping', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-creation-post-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fsp.mkdir(scDir, { recursive: true });
    // Strict config with creation tracking enabled
    await fsp.writeFile(
      path.join(scDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[policy]\nmode = "strict"\ncreation_tracking = "footnote"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('adds tracking header and creation footnote to newly created file', async () => {
    const mdPath = path.join(tmpDir, 'new-doc.md');
    // Simulate that the Write tool already created the file
    await fsp.writeFile(mdPath, '# New Document\n\nSome content here.\n', 'utf-8');

    await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: mdPath, content: '# New Document\n\nSome content here.\n' },
      session_id: 'ses_creation',
      cwd: tmpDir,
    });

    const result = await fsp.readFile(mdPath, 'utf-8');
    const TRACKING_HEADER = '<!-- changedown.com/v1: tracked -->';
    expect(result.startsWith(TRACKING_HEADER)).toBe(true);
    expect(result).toContain('[^cn-1]:');
    expect(result).toContain('creation');
    expect(result).toContain('proposed');
    expect(result).toContain('ai:claude-opus-4.6');
  });

  it('does not double-wrap files that already have tracking header', async () => {
    const TRACKING_HEADER = '<!-- changedown.com/v1: tracked -->';
    const mdPath = path.join(tmpDir, 'already-tracked.md');
    const content = `${TRACKING_HEADER}\n# Already Tracked\n`;
    await fsp.writeFile(mdPath, content, 'utf-8');

    await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: mdPath, content },
      session_id: 'ses_creation',
      cwd: tmpDir,
    });

    const result = await fsp.readFile(mdPath, 'utf-8');
    // Should NOT have been modified — already has header
    expect(result).toBe(content);
  });

  it('does not wrap non-markdown files', async () => {
    const jsPath = path.join(tmpDir, 'index.js');
    const content = 'const x = 1;';
    await fsp.writeFile(jsPath, content, 'utf-8');

    await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: jsPath, content },
      session_id: 'ses_creation',
      cwd: tmpDir,
    });

    const result = await fsp.readFile(jsPath, 'utf-8');
    expect(result).toBe(content);
  });

  it('does not wrap when creation_tracking is none', async () => {
    // Override config to disable creation tracking
    await fsp.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\nexclude = ["node_modules/**"]\n\n[author]\ndefault = "ai:claude-opus-4.6"\n\n[policy]\nmode = "strict"\ncreation_tracking = "none"\n',
      'utf-8',
    );

    const mdPath = path.join(tmpDir, 'new-doc.md');
    const content = '# New Doc\n';
    await fsp.writeFile(mdPath, content, 'utf-8');

    await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: mdPath, content },
      session_id: 'ses_creation',
      cwd: tmpDir,
    });

    const result = await fsp.readFile(mdPath, 'utf-8');
    expect(result).toBe(content);
  });

  it('uses CHANGEDOWN_AUTHOR env var when available', async () => {
    const mdPath = path.join(tmpDir, 'env-author.md');
    await fsp.writeFile(mdPath, '# Content\n', 'utf-8');

    const originalEnv = process.env.CHANGEDOWN_AUTHOR;
    process.env.CHANGEDOWN_AUTHOR = 'ai:test-agent';

    try {
      await handlePostToolUse({
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: { file_path: mdPath, content: '# Content\n' },
        session_id: 'ses_creation',
        cwd: tmpDir,
      });

      const result = await fsp.readFile(mdPath, 'utf-8');
      expect(result).toContain('ai:test-agent');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.CHANGEDOWN_AUTHOR;
      } else {
        process.env.CHANGEDOWN_AUTHOR = originalEnv;
      }
    }
  });

  it('only wraps Write tool, not Edit tool', async () => {
    const mdPath = path.join(tmpDir, 'edit-only.md');
    const content = '# Edited Content\n';
    await fsp.writeFile(mdPath, content, 'utf-8');

    await handlePostToolUse({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: mdPath, old_string: 'Old', new_string: 'Edited Content' },
      session_id: 'ses_creation',
      cwd: tmpDir,
    });

    const result = await fsp.readFile(mdPath, 'utf-8');
    // Edit tool should NOT add creation tracking — only Write
    const TRACKING_HEADER = '<!-- changedown.com/v1: tracked -->';
    expect(result.startsWith(TRACKING_HEADER)).toBe(false);
  });
});
