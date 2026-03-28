import type { Plugin, ConfigInput } from './types/opencode-plugin.js';
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOpencodePluginConfig } from './opencode-plugin-config.js';
import { toolExecuteBeforeHook } from './hooks/tool-execute-before.js';
import { toolExecuteAfterHook } from './hooks/tool-execute-after.js';
import { stopHook } from './hooks/stop.js';

const ChangeDownPlugin: Plugin = async (ctx) => {
  const { directory, worktree, project, client } = ctx;

  const loadMessage = `ChangeDown plugin loaded (project: ${project?.name ?? 'unknown'}, directory: ${directory})`;
  if (client?.app?.log) {
    await client.app.log({
      body: { service: 'changedown', level: 'info', message: loadMessage, extra: { directory, project: project?.name } },
    });
  } else {
    console.log(`[ChangeDown] ${loadMessage}`);
  }

  return {
    // Hook: Intercept Edit/Write tools before execution
    'tool.execute.before': async (input, output) => {
      await toolExecuteBeforeHook(
        input,
        output,
        {
          directory,
          worktree,
          sessionId: '', // P1-22: OpenCode runtime does not populate this; stop hook processes all edits
          project,
        }
      );
    },

    // Hook: Log edits after execution
    'tool.execute.after': async (input) => {
      await toolExecuteAfterHook(
        input,
        {
          directory,
          worktree,
          sessionId: '', // P1-22: OpenCode runtime does not populate this; stop hook processes all edits
          project,
        }
      );
    },

    // Hook: Batch apply CriticMarkup after agent's turn
    'stop': async (input, output) => {
      await stopHook(
        input,
        output,
        {
          directory,
          worktree,
          sessionId: '', // P1-22: OpenCode runtime does not populate this; stop hook processes all edits
          project,
        }
      );
    },

    // Hook: Add ChangeDown MCP server, skills, and instructions to OpenCode config (explicit by default; opt-out via .opencode/changedown.json)
    config: async (input: ConfigInput) => {
      const pluginConfig = await loadOpencodePluginConfig(directory);
      const pluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

      if (!input.mcp) input.mcp = {};
      if (!(input.mcp as Record<string, unknown>)['changedown']) {
        const require = createRequire(import.meta.url);
        const pkgRoot = path.dirname(require.resolve('@changedown/mcp/package.json'));
        const resolvedPath = path.join(pkgRoot, 'dist', 'index.js');
        (input.mcp as Record<string, unknown>)['changedown'] = {
          type: 'local',
          command: ['node', resolvedPath],
          environment: { CHANGEDOWN_PROJECT_DIR: directory },
        };
      }

      if (pluginConfig.skills?.enabled !== false) {
        input.skills ??= {};
        (input.skills as { paths?: string[] }).paths ??= [];
        const skillsDir = path.join(pluginRoot, 'skills');
        (input.skills as { paths: string[] }).paths.push(skillsDir);
      }

      if (pluginConfig.instructions?.enabled !== false) {
        input.instructions ??= [];
        const instructionsDir = path.join(pluginRoot, 'instructions');
        try {
          const files = await readdir(instructionsDir);
          for (const file of files) {
            (input.instructions as string[]).push(path.join(instructionsDir, file));
          }
        } catch {
          // No instructions dir (e.g. we only have skills) -- skip
        }
      }
    },
  };
};

export default ChangeDownPlugin;
export { ChangeDownPlugin };

// Re-export types for consumers
export type { Plugin, HookContext } from './types/opencode-plugin.js';
