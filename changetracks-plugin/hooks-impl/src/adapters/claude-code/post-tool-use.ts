// adapters/claude-code/post-tool-use.ts — Claude Code PostToolUse handler
//
// Thin adapter: delegates side effects and context injection to llm-jail augment().

import * as fs from 'node:fs/promises';
import { nowTimestamp } from '@changetracks/core';
import { augment } from 'llm-jail';
import type { ToolCall, ToolResult } from 'llm-jail';
import { loadConfig } from '../../config.js';
import { isFileInScope } from '../../scope.js';
import { readPendingEdits } from '../../pending.js';
import { logReadAudit } from '../../core/edit-tracker.js';
import type { HookInput } from '../shared.js';
import { buildChangeTracksRule } from '../../changetracks-rules.js';

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

  // Creation tracking: handled before augment since it modifies the file
  if (tool_name.toLowerCase() === 'write' && config.policy.creation_tracking !== 'none') {
    const filePath = (tool_input?.file_path as string) ?? '';
    if (filePath && isFileInScope(filePath, config, projectDir)) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const TRACKING_HEADER = '<!-- ctrcks.com/v1: tracked -->';
        if (!content.startsWith(TRACKING_HEADER)) {
          const author = process.env.CHANGETRACKS_AUTHOR ?? (config.author.default || 'unknown');
          const ts = nowTimestamp();
          let wrapped = TRACKING_HEADER + '\n' + content;
          const footnote = `\n\n[^ct-1]: ${author} | ${ts.date} | creation | proposed\n    ${author} ${ts.raw}: File created`;
          wrapped += footnote;
          await fs.writeFile(filePath, wrapped, 'utf-8');
        }
      } catch (err) {
        process.stderr.write(`changetracks: creation tracking failed: ${err}\n`);
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
  const rule = buildChangeTracksRule(config, projectDir, sessionId);
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
