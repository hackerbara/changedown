// core/mcp-validation.ts — Legacy policy functions (extracted from policy-engine.ts)
// TODO: migrate Cursor adapters to llm-jail (evaluate/augment replaces these)
//
// Claude Code adapters now use llm-jail evaluate()/augment() directly.
// These functions remain for Cursor adapter backward compatibility:
//   - evaluateMcpCall → adapters/cursor/before-mcp-execution.ts
//   - evaluateRawEdit → adapters/cursor/pre-tool-use.ts
//   - evaluateRawRead → adapters/cursor/before-read-file.ts

import * as fs from 'node:fs';
import type { PolicyDecision } from './types.js';
import type { ChangeDownConfig } from '../config.js';
import { isFileInScope, isFileExcludedFromHooks } from '../scope.js';
import { parseTrackingHeader } from '@changedown/core';

export interface RawEditOptions {
  /** When true, check if the file exists on disk. Non-existent files with
   *  creation_tracking enabled are allowed through for PostToolUse wrapping. */
  checkFileExists?: boolean;
}

/**
 * Evaluate whether a raw Edit/Write to a file should be allowed.
 * Used by: Cursor preToolUse (Claude Code now uses llm-jail evaluate())
 */
export function evaluateRawEdit(
  filePath: string,
  config: ChangeDownConfig,
  projectDir: string,
  options?: RawEditOptions,
): PolicyDecision {
  const inScope = isFileInScope(filePath, config, projectDir);

  // Check per-file header override (if file exists)
  let headerStatus: 'tracked' | 'untracked' | null = null;
  if (fs.existsSync(filePath)) {
    try {
      const head = fs.readFileSync(filePath, 'utf-8').slice(0, 500);
      const header = parseTrackingHeader(head);
      if (header) headerStatus = header.status;
    } catch {
      // Can't read file — no override
    }
  }

  // Per-file header overrides scope decision
  if (headerStatus === 'untracked') {
    return { action: 'allow', reason: 'File header declares untracked' };
  }
  if (!inScope && headerStatus !== 'tracked') {
    return { action: 'allow', reason: 'File not in tracking scope' };
  }

  // Hook-excluded → allow silently
  if (isFileExcludedFromHooks(filePath, config, projectDir)) {
    return { action: 'allow', reason: 'File excluded from hook enforcement' };
  }

  // Non-existent file with creation tracking enabled → allow (file creation)
  if (
    options?.checkFileExists &&
    config.policy.creation_tracking !== 'none' &&
    !fs.existsSync(filePath)
  ) {
    return {
      action: 'allow',
      reason: 'File does not exist — creation allowed. PostToolUse hook will add tracking.',
      agentHint: 'New file will be created with ChangeDown tracking header and creation footnote.',
    };
  }

  const mode = config.policy.mode;

  if (mode === 'permissive') {
    return { action: 'allow', reason: 'Permissive mode — no interference' };
  }

  // Hashline tip appended when hashline is enabled
  const hashlineTip = config.hashline.enabled
    ? '\nTip: Use read_tracked_file first for LINE:HASH coordinates.'
    : '';

  if (mode === 'strict') {
    return {
      action: 'deny',
      reason: 'This file is tracked by ChangeDown. Use propose_change MCP tool instead of raw Edit/Write.',
      agentHint: `BLOCKED: This file is tracked by ChangeDown (policy: strict).
Use propose_change instead of Edit/Write:
- Substitution: propose_change(file, old_text, new_text, reasoning="...")
- Insertion: propose_change(file, "", new_text, insert_after="anchor")
- Deletion: propose_change(file, old_text, "")
- Batch (multiple edits): propose_change(file, reasoning="...", changes=[{old_text, new_text}, ...])${hashlineTip}`,
      userMessage: 'ChangeDown blocked a raw edit on a tracked file.',
    };
  }

  // safety-net: allow with advisory
  return {
    action: 'warn',
    reason: 'File is tracked — edit will be auto-wrapped in CriticMarkup at session end.',
    agentHint: `This file is tracked by ChangeDown (policy: safety-net). Edit will be auto-wrapped but reasoning is lost. Use propose_change for tracked edits with context.${hashlineTip}`,
  };
}

/**
 * Evaluate whether a raw file read should be allowed.
 * Used by: Cursor beforeReadFile (Claude Code now uses llm-jail evaluate())
 */
export function evaluateRawRead(
  filePath: string,
  config: ChangeDownConfig,
  projectDir: string,
): PolicyDecision {
  if (!isFileInScope(filePath, config, projectDir)) {
    return { action: 'allow', reason: 'File not in tracking scope' };
  }

  if (isFileExcludedFromHooks(filePath, config, projectDir)) {
    return { action: 'allow', reason: 'File excluded from hook enforcement' };
  }

  if (config.policy.mode === 'strict') {
    return {
      action: 'deny',
      reason: 'This file is tracked by ChangeDown. Use read_tracked_file MCP tool for tracked content.',
      agentHint: 'Use the read_tracked_file MCP tool to read this file. It provides deliberation context, hashline coordinates, and change metadata.',
      userMessage: 'ChangeDown blocked a raw read on a tracked file.',
    };
  }

  // safety-net and permissive: allow reads (only writes are wrapped)
  return { action: 'allow', reason: 'Reads allowed in non-strict mode' };
}

/**
 * Evaluate whether an MCP tool call should proceed.
 * Used by: Cursor beforeMCPExecution (Claude Code validates server-side)
 *
 * Read-only tools always allowed. Write tools validated for:
 * - Author presence (when enforcement = "required")
 */
export function evaluateMcpCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  config: ChangeDownConfig,
): PolicyDecision {
  // Read-only tools: always allow
  const readOnlyTools = ['read_tracked_file', 'get_change'];
  if (readOnlyTools.includes(toolName)) {
    return { action: 'allow', reason: `${toolName} is read-only` };
  }

  // Write tools: validate author if enforcement required
  const writeTools = ['propose_change', 'review_changes', 'amend_change'];
  if (writeTools.includes(toolName) && config.author.enforcement === 'required') {
    if (!toolInput.author) {
      return {
        action: 'deny',
        reason: `Author is required for ${toolName}. Add author parameter (e.g., author: "ai:claude-opus-4.6").`,
        agentHint: `This project requires author identity. Add "author": "ai:your-model-name" to your ${toolName} call.`,
      };
    }
  }

  return { action: 'allow', reason: 'MCP call validated' };
}
