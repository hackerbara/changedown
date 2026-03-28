// adapters/claude-code/pre-tool-use.ts — Claude Code PreToolUse handler
//
// Thin adapter: delegates all policy decisions to llm-jail evaluate().

import { evaluate } from 'llm-jail';
import type { ToolCall, Verdict } from 'llm-jail';
import { loadConfig } from '../../config.js';
import type { HookInput } from '../shared.js';
import { buildChangeDownRule } from '../../changedown-rules.js';

export interface PreToolUseResult {
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision: 'deny' | 'allow' | 'ask';
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

export async function handlePreToolUse(input: HookInput): Promise<PreToolUseResult> {
  if (!input.tool_name || !input.cwd) return {};

  const projectDir = input.cwd;
  const sessionId = input.session_id ?? 'unknown';
  const config = await loadConfig(projectDir);

  const tool = input.tool_name.toLowerCase();

  // Skip interception based on config toggles
  const isBuiltInTool = tool === 'edit' || tool === 'write' || tool === 'read';
  const isBashTool = tool === 'bash';
  if (isBuiltInTool && !config.hooks.intercept_tools) return {};
  if (isBashTool && !config.hooks.intercept_bash) return {};

  const toolCall: ToolCall = {
    tool,
    input: input.tool_input ?? {},
    cwd: projectDir,
  };

  const rule = buildChangeDownRule(config, projectDir, sessionId);
  const verdict = await evaluate(toolCall, [rule]);

  return verdictToHookResult(verdict);
}

function verdictToHookResult(verdict: Verdict): PreToolUseResult {
  if (verdict.action === 'deny') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: verdict.reason ?? verdict.agentHint ?? 'Blocked by LLM Jail',
      },
    };
  }

  if (verdict.action === 'warn' || verdict.agentHint) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: verdict.agentHint,
      },
    };
  }

  return {};
}
