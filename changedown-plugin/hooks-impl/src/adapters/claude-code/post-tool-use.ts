// adapters/claude-code/post-tool-use.ts — Claude Code PostToolUse handler
//
// Thin adapter: delegates side effects and context injection to llm-jail augment().

import * as fs from 'node:fs/promises';
import { nowTimestamp } from '@changedown/core';
import { augment } from 'llm-jail';
import type { ToolCall, ToolResult } from 'llm-jail';
import { loadConfig } from '../../config.js';
import { isFileInScope } from '../../scope.js';
import { readPendingEdits } from '../../pending.js';
import { logReadAudit } from '../../core/edit-tracker.js';
import type { HookInput } from '../shared.js';
import { buildChangeDownRule } from '../../changedown-rules.js';

export interface PostToolUseResult {
  logged?: boolean;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
  };
}

export async function handlePostToolUse(
  input: HookInput,
): Promise<PostToolUseResult> {
  const { tool_name, tool_input, session_id, cwd } = input;
  if (!tool_name || !cwd) return { logged: false };

  const projectDir = cwd;
  const sessionId = session_id ?? 'unknown';
  const config = await loadConfig(projectDir);

  const tool = tool_name.toLowerCase();

  // Skip interception based on config toggles
  const isBuiltInTool = tool === 'edit' || tool === 'write' || tool === 'read';
  const isBashTool = tool === 'bash';
  if (isBuiltInTool && !config.hooks.intercept_tools) return { logged: false };
  if (isBashTool && !config.hooks.intercept_bash) return { logged: false };

  const toolCall: ToolCall = {
    tool,
    input: tool_input ?? {},
    cwd: projectDir,
  };

  const toolResult: ToolResult = {
    tool_response: (input as unknown as Record<string, unknown>).tool_response,
  };

  // Creation tracking: handled before augment since it modifies the file.
  // Uses tool_input.content (the authoritative agent-written content) instead of
  // reading back from disk, which races with filesystem flush and can return empty.
  if (tool_name.toLowerCase() === 'write' && config.policy.creation_tracking !== 'none') {
    const filePath = (tool_input?.file_path as string) ?? '';
    const agentContent = (tool_input?.content as string) ?? '';
    if (filePath && agentContent && isFileInScope(filePath, config, projectDir)) {
      try {
        const TRACKING_HEADER = '<!-- changedown.com/v1: tracked -->';
        if (!agentContent.startsWith(TRACKING_HEADER)) {
          const author = process.env.CHANGEDOWN_AUTHOR ?? (config.author.default || 'unknown');
          const ts = nowTimestamp();
          const wrapped = TRACKING_HEADER + '\n' + agentContent
            + `\n\n[^cn-1]: ${author} | ${ts.date} | creation | proposed\n    ${author} ${ts.raw}: File created`;
          await fs.writeFile(filePath, wrapped, 'utf-8');
        }
      } catch (err) {
        process.stderr.write(`changedown: creation tracking failed: ${err}\n`);
      }
    }
  }

  // Audit logging for read_tracked_file MCP tool (not recognized by llm-jail analyzer)
  if (tool === 'read_tracked_file') {
    const filePath = (tool_input?.file as string) ?? '';
    if (filePath && isFileInScope(filePath, config, projectDir)) {
      await logReadAudit(projectDir, sessionId, filePath);
      return { logged: true };
    }
    return { logged: false };
  }

  // Snapshot pending edit count before augment to detect logging
  const editsBefore = await readPendingEdits(projectDir);
  const countBefore = editsBefore.length;

  // Run augment phase (side effects + optional additionalContext)
  const rule = buildChangeDownRule(config, projectDir, sessionId);
  const additionalContext = await augment(toolCall, toolResult, [rule]);

  const editsAfter = await readPendingEdits(projectDir);
  const logged = editsAfter.length > countBefore;

  if (additionalContext) {
    return {
      logged,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext,
      },
    };
  }

  return { logged };
}
