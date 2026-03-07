import type { HookContext } from '../types/opencode-plugin.js';
import { loadConfig, isFileInScope } from '../config.js';
import { appendPendingEdit, PendingEdit } from '../pending.js';
import { parseUnifiedPatchToPendingEdits } from './patch-parser.js';

interface ToolExecuteAfterInput {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  error?: Error;
}

function readNestedString(obj: unknown, path: string[]): string | undefined {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

export async function toolExecuteAfterHook(
  input: ToolExecuteAfterInput,
  ctx: HookContext
): Promise<void> {
  if (!input?.args) return;
  const { tool, args } = input;
  const projectDir = ctx.directory;

  // Handle read_tracked_file as audit entry
  if (tool === 'read_tracked_file') {
    // This is logged by the MCP tool itself, no additional action needed here
    return;
  }

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

  const config = await loadConfig(projectDir);

  // Check if file is in scope
  if (!isFileInScope(filePath, config, projectDir)) {
    return;
  }

  const sessionId = ctx.sessionId || 'global';

  const isPatchTool = tool === 'patch' || tool === 'apply_patch';
  if (isPatchTool && config.hooks.patch_wrap_experimental) {
    // apply_patch uses args.patchText; docs also mention patch, diff, patch_text, content
    const patchTextCandidates = [
      args.patchText,
      args.patch,
      args.diff,
      args.patch_text,
      args.content,
      readNestedString(input.result, ['metadata', 'diff']),
      readNestedString(input.result, ['diff']),
    ];
    const patchText = patchTextCandidates.find((value) => typeof value === 'string') as string | undefined;

    if (!patchText) {
      console.warn(`[ChangeTracks] Patch wrap enabled but no patch text found for ${filePath}.`);
      return;
    }

    const parsed = parseUnifiedPatchToPendingEdits(filePath, patchText, sessionId);
    for (const edit of parsed.edits) {
      await appendPendingEdit(projectDir, edit);
    }

    if (parsed.warnings.length > 0) {
      for (const warning of parsed.warnings) {
        console.warn(`[ChangeTracks] Patch wrap warning (${filePath}): ${warning}`);
      }
    }

    if (parsed.edits.length > 0) {
      console.log(`[ChangeTracks] Logged ${parsed.edits.length} patch-derived edits to ${filePath} in pending queue`);
    }
    return;
  }

  // Get the edit details
  const oldText = (args.old_text as string) ?? '';
  const newText = (args.new_text as string) ?? '';

  // Extract context if available
  const contextBefore = (args.context_before as string) ?? undefined;
  const contextAfter = (args.context_after as string) ?? undefined;

  // Create pending edit entry
  const pendingEdit: PendingEdit = {
    file: filePath,
    old_text: oldText,
    new_text: newText,
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    context_before: contextBefore,
    context_after: contextAfter,
  };

  // Append to pending queue
  await appendPendingEdit(projectDir, pendingEdit);

  console.log(`[ChangeTracks] Logged edit to ${filePath} in pending queue`);
}
