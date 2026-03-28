#!/usr/bin/env node
// post-tool-use.ts — backward compat entrypoint
//
// Handler logic lives in adapters/claude-code/post-tool-use.ts.
// This file re-exports the handler and provides the main() entrypoint
// so hooks.json paths (dist/post-tool-use.js) continue to work.

import { readStdin, writeStdout } from './adapters/shared.js';

export { handlePostToolUse } from './adapters/claude-code/post-tool-use.js';
export type { PostToolUseResult } from './adapters/claude-code/post-tool-use.js';

import { handlePostToolUse } from './adapters/claude-code/post-tool-use.js';

async function main(): Promise<void> {
  const input = await readStdin();
  const result = await handlePostToolUse(input);
  writeStdout(result as Record<string, unknown>);
}

main().catch((err) => {
  process.stderr.write(`changedown PostToolUse hook error: ${err}\n`);
  writeStdout({});
});
