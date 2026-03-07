import type { HookContext } from '../types/opencode-plugin.js';
import { loadConfig, isFileInScope, isFileExcludedFromHooks } from '../config.js';
import * as path from 'node:path';

interface ToolExecuteBeforeInput {
  tool: string;
  args: Record<string, unknown>;
}

interface ToolExecuteBeforeOutput {
  // Can modify args or throw to block
}

export async function toolExecuteBeforeHook(
  input: ToolExecuteBeforeInput,
  output: ToolExecuteBeforeOutput,
  ctx: HookContext
): Promise<void> {
  if (!input?.args) return;
  const { tool, args } = input;

  // OpenCode uses lowercase tool names (edit, write, patch, apply_patch, multiedit)
  const isFileModifyingTool =
    tool === 'edit' || tool === 'write' || tool === 'patch' || tool === 'apply_patch' || tool === 'multiedit';
  if (!isFileModifyingTool) {
    return;
  }

  const filePath = (args?.file ?? args?.filePath ?? args?.path) as string | undefined;
  if (!filePath) {
    return;
  }

  const projectDir = ctx.directory;
  const config = await loadConfig(projectDir);

  // Check if file is in scope
  if (!isFileInScope(filePath, config, projectDir)) {
    return;
  }

  // Check if file is excluded from hooks
  if (isFileExcludedFromHooks(filePath, config, projectDir)) {
    return;
  }

  // When patch-wrap mode is on, force use of the patch tool: block edit/write/multiedit
  // so the agent retries with the OpenCode built-in patch tool (apply_patch or patch).
  if (config.hooks.patch_wrap_experimental) {
    if (tool !== 'patch' && tool !== 'apply_patch') {
      throw new Error(
        `[ChangeTracks] This workspace requires using the OpenCode built-in tool "apply_patch" (or "patch") for file edits. ` +
          `Do not use edit, write, or multiedit. Call apply_patch with patchText (unified diff or *** Begin Patch format). ` +
          `File: "${filePath}".`
      );
    }
    // Allow patch/apply_patch through; tool-execute-after will wrap it into CriticMarkup.
    return;
  }

  // Apply enforcement policy
  if (config.hooks.enforcement === 'block') {
    throw new Error(
      `[ChangeTracks] Direct edits to tracked files are blocked. ` +
      `File "${filePath}" is under change tracking. ` +
      `Please use the propose_change MCP tool to submit changes as CriticMarkup. ` +
      `This ensures all modifications are tracked and can be reviewed.`
    );
  } else if (config.hooks.enforcement === 'warn') {
    // Add context to the output (this will be visible to the agent)
    console.warn(
      `[ChangeTracks] Warning: Editing tracked file "${filePath}". ` +
      `Consider using propose_change MCP tool for better tracking and review.`
    );
  }
}
