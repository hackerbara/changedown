import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleBeforeMcpExecution } from 'changetracks-hooks/internals';
import type { HookInput } from 'changetracks-hooks/internals';

describe('Cursor beforeMCPExecution handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-cursor-mcp-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    // Default config: author enforcement optional
    await fs.writeFile(
      path.join(scDir, 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[author]\ndefault = "ai:claude"\nenforcement = "optional"\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('passes through non-ChangeTracks tools', async () => {
    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'some_other_tool',
      tool_input: { foo: 'bar' },
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBeUndefined();
  });

  it('allows read_tracked_file (read-only tool)', async () => {
    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'read_tracked_file',
      tool_input: { file: 'readme.md' },
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('allows propose_change when author enforcement is optional', async () => {
    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'propose_change',
      tool_input: { file: 'readme.md', old_text: 'old', new_text: 'new' },
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('blocks propose_change without author when enforcement is required', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changetracks', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[author]\ndefault = "ai:claude"\nenforcement = "required"\n',
      'utf-8',
    );

    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'propose_change',
      tool_input: { file: 'readme.md', old_text: 'old', new_text: 'new' },
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(false);
    expect(result.permission).toBe('deny');
    expect(result.agentMessage).toContain('author');
  });

  it('allows propose_change with author when enforcement is required', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changetracks', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[author]\ndefault = "ai:claude"\nenforcement = "required"\n',
      'utf-8',
    );

    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'propose_change',
      tool_input: { file: 'readme.md', old_text: 'old', new_text: 'new', author: 'ai:claude-opus-4.6' },
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('parses JSON string tool_input from Cursor', async () => {
    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'propose_change',
      tool_input: JSON.stringify({ file: 'readme.md', old_text: 'old', new_text: 'new' }) as unknown as Record<string, unknown>,
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('denies on invalid JSON string tool_input', async () => {
    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'propose_change',
      tool_input: 'not-valid-json{' as unknown as Record<string, unknown>,
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(false);
    expect(result.permission).toBe('deny');
    expect(result.agentMessage).toBe('Invalid tool_input JSON');
  });

  it('allows get_change (read-only tool)', async () => {
    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'get_change',
      tool_input: { file: 'readme.md', change_id: 'ct-1' },
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(true);
    expect(result.permission).toBe('allow');
  });

  it('validates review_changes for author when enforcement required', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changetracks', 'config.toml'),
      '[tracking]\ninclude = ["**/*.md"]\n\n[author]\nenforcement = "required"\n',
      'utf-8',
    );

    const input: HookInput = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'review_changes',
      tool_input: { file: 'readme.md', reviews: [] },
      workspace_roots: [tmpDir],
    };
    const result = await handleBeforeMcpExecution(input);
    expect(result.continue).toBe(false);
    expect(result.permission).toBe('deny');
    expect(result.agentMessage).toContain('author');
  });
});
