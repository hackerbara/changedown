import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import ChangeDownPlugin from '@changedown/opencode-plugin';

type ConfigInput = { mcp?: Record<string, unknown>; skills?: { paths?: string[] }; instructions?: string[] };

describe('ChangeDownPlugin config hook', () => {
  it('returns a config hook that adds changedown MCP server when not already configured', async () => {
    const ctx = {
      directory: '/test/project',
      worktree: '/test/project',
      project: undefined as { name: string; path: string } | undefined,
      client: undefined,
    };
    const plugin = await ChangeDownPlugin(ctx);
    expect(plugin.config).toBeDefined();

    const input: ConfigInput = {};
    await (plugin as { config: (input: ConfigInput) => Promise<void> }).config(input);

    expect(input.mcp).toBeDefined();
    expect(input.mcp!['changedown']).toBeDefined();
    const server = input.mcp!['changedown'] as Record<string, unknown>;
    expect(server.type).toBe('local');
    expect(Array.isArray(server.command)).toBe(true);
    expect((server.command as string[])[0]).toBe('node');
    expect((server.environment as Record<string, string>)?.CHANGEDOWN_PROJECT_DIR).toBe('/test/project');
  });

  it('does not register propose_change, read_tracked_file, or list_open_threads as plugin tools (tools come from MCP)', async () => {
    const ctx = {
      directory: '/test/project',
      worktree: '/test/project',
      project: undefined as { name: string; path: string } | undefined,
      client: undefined,
    };
    const plugin = await ChangeDownPlugin(ctx);
    expect(plugin.tool).toBeUndefined();
  });

  it('does not override existing changedown MCP server config', async () => {
    const ctx = {
      directory: '/test/project',
      worktree: '/test/project',
      project: undefined as { name: string; path: string } | undefined,
      client: undefined,
    };
    const plugin = await ChangeDownPlugin(ctx);
    const input: ConfigInput = {
      mcp: {
        'changedown': { type: 'remote', url: 'https://custom.example.com/mcp' },
      },
    };
    await (plugin as { config: (input: ConfigInput) => Promise<void> }).config(input);

    expect(input.mcp!['changedown']).toEqual({ type: 'remote', url: 'https://custom.example.com/mcp' });
  });

  it('adds skills path by default so agent gets ChangeDown skill', async () => {
    const ctx = {
      directory: '/test/project',
      worktree: '/test/project',
      project: undefined as { name: string; path: string } | undefined,
      client: undefined,
    };
    const plugin = await ChangeDownPlugin(ctx);
    const input: ConfigInput = {};
    await (plugin as { config: (input: ConfigInput) => Promise<void> }).config(input);

    expect(input.skills?.paths).toBeDefined();
    expect(Array.isArray(input.skills?.paths)).toBe(true);
    expect((input.skills!.paths as string[]).length).toBeGreaterThanOrEqual(1);
    const skillsDir = (input.skills!.paths as string[])[0];
    expect(skillsDir).toContain('skills');
  });

  it('does not add skills path when .opencode/changedown.json has skills.enabled: false', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-opencode-'));
    await fs.mkdir(path.join(tmpDir, '.opencode'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.opencode', 'changedown.json'),
      JSON.stringify({ skills: { enabled: false } })
    );
    try {
      const ctx = {
        directory: tmpDir,
        worktree: tmpDir,
        project: undefined as { name: string; path: string } | undefined,
        client: undefined,
      };
      const plugin = await ChangeDownPlugin(ctx);
      const input: ConfigInput = {};
      await (plugin as { config: (input: ConfigInput) => Promise<void> }).config(input);

      expect(input.skills).toBeUndefined();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
