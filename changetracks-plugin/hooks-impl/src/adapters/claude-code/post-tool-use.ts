// adapters/claude-code/post-tool-use.ts — Claude Code PostToolUse handler
//
// Contains the handler logic for Claude Code's PostToolUse hook event.
// Logs edits to pending.json for later batch processing by the Stop hook.
// The root-level post-tool-use.ts remains the entrypoint (main + stdin/stdout).

import * as fs from 'node:fs/promises';
import { nowTimestamp } from '@changetracks/core';
import { loadConfig } from '../../config.js';
import { isFileInScope, isFileExcludedFromHooks } from '../../scope.js';
import type { HookInput } from '../shared.js';
import { shouldLogEdit, logEdit, logReadAudit } from '../../core/edit-tracker.js';

export interface PostToolUseResult {
  /** PostToolUse always returns empty — no blocking capability. */
}

/**
 * Core logic for the PostToolUse handler.
 * Logs the edit to `.changetracks/pending.json` for later batch processing
 * by the Stop hook. Does NOT modify the edited file itself.
 *
 * Returns `{ logged: true }` when an edit was recorded, `{ logged: false }` otherwise.
 * (The actual hook output is always `{}`; the return value is for testing.)
 */
export async function handlePostToolUse(
  input: HookInput,
): Promise<{ logged: boolean }> {
  const { tool_name, tool_input, session_id, cwd } = input;

  if (!cwd || !tool_input) {
    return { logged: false };
  }

  const projectDir = cwd;

  // Log read_tracked_file as informational audit entry (no wrapping needed)
  if (tool_name === 'read_tracked_file') {
    const filePath = (tool_input.file as string) ?? '';
    if (!filePath) {
      return { logged: false };
    }
    await logReadAudit(projectDir, session_id ?? 'unknown', filePath);
    return { logged: true };
  }

  // Log raw Read calls on tracked files as audit entries
  if (tool_name === 'Read') {
    const filePath = (tool_input.file_path as string) ?? '';
    if (!filePath) {
      return { logged: false };
    }
    const config = await loadConfig(projectDir);
    if (!isFileInScope(filePath, config, projectDir)) {
      return { logged: false };
    }
    if (isFileExcludedFromHooks(filePath, config, projectDir)) {
      return { logged: false };
    }
    await logReadAudit(projectDir, session_id ?? 'unknown', filePath);
    return { logged: true };
  }

  // Only handle Edit and Write tools
  if (tool_name !== 'Edit' && tool_name !== 'Write') {
    return { logged: false };
  }

  const filePath = (tool_input.file_path as string) ?? '';

  if (!filePath) {
    return { logged: false };
  }

  const config = await loadConfig(projectDir);

  // Check scope
  if (!isFileInScope(filePath, config, projectDir)) {
    return { logged: false };
  }

  // Check if file is excluded from hook enforcement (e.g. llm-garden)
  if (isFileExcludedFromHooks(filePath, config, projectDir)) {
    return { logged: false };
  }

  // File creation tracking: Write tool on in-scope files without tracking header.
  // Wraps the file with tracking header + creation footnote as a side effect,
  // then continues to the normal edit-logging path (safety-net batch processing).
  let creationWrapped = false;
  if (tool_name === 'Write' && config.policy.creation_tracking !== 'none') {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const TRACKING_HEADER = '<!-- ctrcks.com/v1: tracked -->';

      if (!content.startsWith(TRACKING_HEADER)) {
        const author = process.env.CHANGETRACKS_AUTHOR ?? (config.author.default || 'unknown');
        const ts = nowTimestamp();
        const date = ts.date;

        let wrapped = TRACKING_HEADER + '\n' + content;
        const footnote = `\n\n[^ct-1]: ${author} | ${date} | creation | proposed\n    ${author} ${ts.raw}: File created`;
        wrapped += footnote;

        await fs.writeFile(filePath, wrapped, 'utf-8');
        creationWrapped = true;
      }
    } catch {
      // File read/write failure — proceed to normal logging
    }
  }

  // Determine old_text and new_text based on tool type
  const oldText = (tool_input.old_string as string) ?? '';
  const newText = (tool_input.new_string as string) ?? (tool_input.content as string) ?? '';

  // Only safety-net mode logs edits for batch wrapping
  if (!shouldLogEdit(config.policy.mode)) {
    return { logged: creationWrapped };
  }

  // Capture context around the edit by reading the post-edit file
  let contextBefore: string | undefined;
  let contextAfter: string | undefined;

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    if (newText) {
      const editPos = fileContent.indexOf(newText);
      if (editPos > 0) {
        contextBefore = fileContent.slice(Math.max(0, editPos - 50), editPos);
      }
      if (editPos >= 0) {
        contextAfter = fileContent.slice(
          editPos + newText.length,
          editPos + newText.length + 50,
        );
      }
    }
  } catch {
    // File read failure — proceed without context
  }

  await logEdit(
    projectDir,
    session_id ?? 'unknown',
    filePath,
    oldText,
    newText,
    tool_name!,
    contextBefore,
    contextAfter,
  );

  return { logged: true };
}
