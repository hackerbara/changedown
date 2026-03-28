/**
 * Command runner for the `sc` CLI.
 *
 * Bootstraps shared infrastructure (hashline WASM, config resolver, session
 * state) and dispatches to the appropriate command via the declarative
 * registry. Each command receives the same resolver + state that the MCP
 * server would provide, ensuring identical behavior between `sc` CLI and
 * MCP tool calls.
 */

import { initHashline } from '@changedown/core';
import { ConfigResolver, SessionState } from './engine/index.js';
import type { CliResult } from './cli-output.js';
import type { OutputFormat } from './cli-parse.js';
import { COMMANDS } from './agent-command-registry.js';
import { executeCommand } from './schema-executor.js';

export interface RunContext {
  outputFormat: OutputFormat;
  projectDir?: string;
}

let hashlineReady = false;

export async function runCommand(
  command: string,
  subArgs: string[],
  context: RunContext,
): Promise<CliResult> {
  if (!hashlineReady) {
    await initHashline();
    hashlineReady = true;
  }

  const projectDir = context.projectDir ?? process.cwd();
  const resolver = new ConfigResolver(projectDir);
  const state = new SessionState();
  state.enableGuide();

  const def = COMMANDS[command];
  if (!def) {
    return {
      success: false,
      data: {},
      message: `Unknown command: ${command}`,
      error: 'UNKNOWN_COMMAND',
    };
  }

  try {
    return await executeCommand(def, subArgs, resolver, state);
  } catch (err) {
    return {
      success: false,
      data: {},
      message: err instanceof Error ? err.message : String(err),
      error: 'INTERNAL_ERROR',
    };
  } finally {
    resolver.dispose();
  }
}
