#!/usr/bin/env node
// pre-tool-use.ts — backward compat entrypoint
//
// Handler logic lives in adapters/claude-code/pre-tool-use.ts.
// This file re-exports the handler and provides the main() entrypoint
// so hooks.json paths (dist/pre-tool-use.js) continue to work.

import { readStdin, writeStdout } from './adapters/shared.js';

export { handlePreToolUse } from './adapters/claude-code/pre-tool-use.js';
export type { PreToolUseResult } from './adapters/claude-code/pre-tool-use.js';

import { handlePreToolUse } from './adapters/claude-code/pre-tool-use.js';

async function main(): Promise<void> {
  const input = await readStdin();
  const result = await handlePreToolUse(input);
  writeStdout(result as Record<string, unknown>);
}

main().catch((err) => {
  // On error, allow the edit (fail-open for hooks)
  process.stderr.write(`changedown PreToolUse hook error: ${err}\n`);
  writeStdout({});
});
