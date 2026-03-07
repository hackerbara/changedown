#!/usr/bin/env node
// adapters/cursor/before-mcp-execution.ts — Cursor beforeMCPExecution hook handler
//
// Validates ChangeTracks MCP tool calls before execution. Checks author
// identity and policy constraints. Non-SC tools pass through untouched.

import { loadConfig } from '../../config.js';
import { evaluateMcpCall } from '../../core/policy-engine.js';
import { deriveProjectDir, readStdin, writeStdout, type HookInput } from '../shared.js';

const CHANGETRACKS_TOOLS = [
  'read_tracked_file', 'propose_change', 'review_changes',
  'get_change', 'amend_change',
];

interface CursorMcpResponse {
  continue: boolean;
  permission?: 'allow' | 'deny';
  agentMessage?: string;
}

export async function handleBeforeMcpExecution(input: HookInput): Promise<CursorMcpResponse> {
  const toolName = input.tool_name ?? '';

  // Only validate ChangeTracks MCP tools -- pass through everything else
  if (!CHANGETRACKS_TOOLS.includes(toolName)) {
    return { continue: true };
  }

  const projectDir = deriveProjectDir(input);
  const config = await loadConfig(projectDir);

  // Cursor sends tool_input as a JSON string or object
  let toolInput: Record<string, unknown> = {};
  if (typeof input.tool_input === 'string') {
    try {
      toolInput = JSON.parse(input.tool_input as string);
    } catch {
      return { continue: false, permission: 'deny', agentMessage: 'Invalid tool_input JSON' };
    }
  } else if (input.tool_input) {
    toolInput = input.tool_input;
  }

  const decision = evaluateMcpCall(toolName, toolInput, config);

  if (decision.action === 'deny') {
    return { continue: false, permission: 'deny', agentMessage: decision.agentHint ?? decision.reason };
  }

  return { continue: true, permission: 'allow' };
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const result = await handleBeforeMcpExecution(input);
    writeStdout(result as unknown as Record<string, unknown>);
  } catch {
    writeStdout({ continue: true }); // fail-open for Cursor
  }
}

main();
