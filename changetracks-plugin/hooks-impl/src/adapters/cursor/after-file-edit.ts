#!/usr/bin/env node
// adapters/cursor/after-file-edit.ts — Cursor afterFileEdit hook handler
//
// Logs file edits to pending.json for later batch-wrapping by the stop hook.
// Checks scope, exclusions, and policy mode before logging.

import { loadConfig } from '../../config.js';
import { isFileInScope, isFileExcludedFromHooks } from '../../scope.js';
import { shouldLogEdit, logEdit } from '../../core/edit-tracker.js';
import { deriveProjectDir, deriveSessionId, readStdin, writeStdout, type HookInput } from '../shared.js';

export async function handleAfterFileEdit(input: HookInput): Promise<Record<string, unknown>> {
  const filePath = input.file_path ?? '';
  const projectDir = deriveProjectDir(input);
  const sessionId = deriveSessionId(input);
  const edits = input.edits ?? [];

  if (!filePath || edits.length === 0) return {};

  const config = await loadConfig(projectDir);

  if (!shouldLogEdit(config.policy.mode)) return {};
  if (!isFileInScope(filePath, config, projectDir)) return {};
  if (isFileExcludedFromHooks(filePath, config, projectDir)) return {};

  for (const edit of edits) {
    const oldText = edit.old_string ?? '';
    const newText = edit.new_string ?? '';
    await logEdit(projectDir, sessionId, filePath, oldText, newText, 'Edit');
  }

  return {};
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const result = await handleAfterFileEdit(input);
    writeStdout(result);
  } catch {
    writeStdout({}); // fail-open for Cursor
  }
}

main();
