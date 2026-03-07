#!/usr/bin/env node

/**
 * Legacy CLI entry point — delegates to changetracks.
 *
 * The canonical CLI binary now lives in packages/cli/dist/index.js.
 * This file exists only for backward compatibility with npm link / bin
 * references that point to the MCP server's dist/cli.js.
 */

import { parseGlobalArgs } from './cli-parse.js';
import { runCommand } from './cli-runner.js';
import { formatResult } from './cli-output.js';

const HELP_TEXT = `Usage: sc [global-flags] <command> [args...]

Note: This is the legacy entry point. The canonical CLI is at packages/cli.

Global flags:
  --json            JSON output (default)
  --pretty          Human-readable output
  --quiet           Suppress output, exit code only
  --project-dir DIR Set project root directory
  --help, -h        Show this help message

Commands:
  read       Read a tracked file with hashline coordinates
  status     Check tracking status of a file or project
  get        Get full details of a tracked change
  list       List open threads and proposed changes
  files      List tracked files in a directory (alias: ls)
  propose    Propose a tracked change to a file
  batch      Propose a batch of changes atomically
  amend      Amend a previously proposed change
  review     Accept, reject, or request changes on a change
  respond    Add a response to a change discussion thread
  group      Begin or end a change group
  raw-edit   Edit a tracked file without CriticMarkup wrapping

Run 'sc <command> --help' for command-specific usage.
`;

async function main(): Promise<void> {
  const args = parseGlobalArgs(process.argv.slice(2));

  if (args.command === 'help') {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  const result = await runCommand(args.command, args.subArgs, {
    outputFormat: args.outputFormat,
    projectDir: args.projectDir,
  });

  process.stdout.write(formatResult(result, args.outputFormat));
  process.exit(result.success ? 0 : result.error === 'USAGE_ERROR' ? 2 : 1);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
