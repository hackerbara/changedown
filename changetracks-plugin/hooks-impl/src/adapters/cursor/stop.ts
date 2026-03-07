#!/usr/bin/env node
// adapters/cursor/stop.ts — Cursor stop hook handler
//
// Applies pending edits as CriticMarkup when policy mode is safety-net.
// Clears pending edits for the session in all other modes.

import { loadConfig } from '../../config.js';
import { applyPendingEdits } from '../../core/batch-wrapper.js';
import { clearSessionEdits } from '../../pending.js';
import { deriveProjectDir, deriveSessionId, readStdin, writeStdout, type HookInput } from '../shared.js';

export async function handleCursorStop(input: HookInput): Promise<Record<string, unknown>> {
  const projectDir = deriveProjectDir(input);
  const sessionId = deriveSessionId(input);
  const config = await loadConfig(projectDir);

  if (config.policy.mode !== 'safety-net') {
    await clearSessionEdits(projectDir, sessionId);
    return {};
  }

  await applyPendingEdits(projectDir, sessionId, config);
  // Cursor stop hooks don't support systemMessage
  return {};
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const result = await handleCursorStop(input);
    writeStdout(result);
  } catch {
    writeStdout({}); // fail-open for Cursor
  }
}

main();
