#!/usr/bin/env node
// stop.ts — backward compat entrypoint
//
// Handler logic lives in adapters/claude-code/stop.ts.
// This file re-exports the handler and provides the main() entrypoint
// so hooks.json paths (dist/stop.js) continue to work.

import { readStdin, writeStdout } from './adapters/shared.js';

export { handleStop } from './adapters/claude-code/stop.js';
export type { StopResult } from './adapters/claude-code/stop.js';

// Re-export the core functions that tests import from stop.ts
// (backward compatibility during refactor — tests will be migrated later)
export { findEditPosition } from './core/edit-positioning.js';
export { findDeletionInsertionPoint } from './core/edit-positioning.js';

import { handleStop } from './adapters/claude-code/stop.js';

async function main(): Promise<void> {
  const input = await readStdin();
  const result = await handleStop(input);
  writeStdout(result as Record<string, unknown>);
}

main().catch((err) => {
  process.stderr.write(`changetracks Stop hook error: ${err}\n`);
  writeStdout({});
});
