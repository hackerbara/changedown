#!/usr/bin/env node
// adapters/cursor/pre-tool-use.ts — Cursor preToolUse hook handler
//
// Enforces raw edit policy before generic tool execution.
// This gives Cursor parity with Claude Code's strict-mode raw edit blocking.

import { loadConfig } from '../../config.js';
import { evaluateRawEdit } from '../../core/policy-engine.js';
import { deriveProjectDir, readStdin, writeStdout, type HookInput } from '../shared.js';

interface CursorPreToolUseResponse {
  decision: 'allow' | 'deny';
  reason?: string;
  updated_input?: Record<string, unknown>;
}

function getFilePath(toolInput: Record<string, unknown>): string {
  const directPath = toolInput.file_path ?? toolInput.path ?? toolInput.file;
  return typeof directPath === 'string' ? directPath : '';
}

function getOldNewText(toolInput: Record<string, unknown>): { oldText: string; newText: string } {
  const oldText = (toolInput.old_string as string) ?? '';
  const newText = (toolInput.new_string as string) ?? (toolInput.content as string) ?? '';
  return { oldText, newText };
}

export async function handlePreToolUse(input: HookInput): Promise<CursorPreToolUseResponse> {
  const toolName = input.tool_name ?? '';
  const isWriteLike =
    toolName === 'Write' ||
    toolName === 'Edit' ||
    toolName === 'MultiEdit' ||
    toolName === 'ApplyPatch';

  if (!isWriteLike) {
    return { decision: 'allow' };
  }

  const projectDir = deriveProjectDir(input);

  let toolInput: Record<string, unknown> = {};
  if (typeof input.tool_input === 'string') {
    try {
      toolInput = JSON.parse(input.tool_input as string);
    } catch {
      return { decision: 'allow' };
    }
  } else if (input.tool_input) {
    toolInput = input.tool_input;
  }

  const filePath = getFilePath(toolInput);
  if (!filePath) {
    return { decision: 'allow' };
  }

  const config = await loadConfig(projectDir);
  const { oldText, newText } = getOldNewText(toolInput);

  const decision = evaluateRawEdit(filePath, config, projectDir, {
    checkFileExists: toolName === 'Write',
  });

  if (decision.action === 'deny') {
    return {
      decision: 'deny',
      reason: decision.agentHint ?? decision.reason,
    };
  }

  if (decision.action === 'warn') {
    return {
      decision: 'allow',
      reason: decision.agentHint ?? decision.reason,
    };
  }

  return { decision: 'allow' };
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const result = await handlePreToolUse(input);
    writeStdout(result as unknown as Record<string, unknown>);
  } catch {
    // Fail-open for now to avoid bricking tool execution on hook faults.
    writeStdout({ decision: 'allow' });
  }
}

main();
