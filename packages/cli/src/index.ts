#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CLI_VERSION: string = require('../package.json').version;
import { computeStatus } from './commands/status.js';
import { computeChangeList } from './commands/list.js';
import { isGitDiffDriverInvocation, handleGitDiffDriver, handleDiff } from './commands/diff.js';
import { computeSettlement } from './commands/settle.js';
import { publishSettled } from './commands/publish.js';
import { handleImport } from './commands/import.js';
import { handleExport } from './commands/export.js';
import type { ThreeZoneViewName } from '@changetracks/core';
import { parseGlobalArgs } from './cli-parse.js';
import { runCommand } from './cli-runner.js';
import { formatResult } from './cli-output.js';

// Git diff driver detection: git passes exactly 7 args with a 40-char hash at position 2
if (isGitDiffDriverInvocation(process.argv)) {
  handleGitDiffDriver(process.argv).then((output) => {
    process.stdout.write(output);
    process.exit(0);
  }).catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  });
} else {

// ---------------------------------------------------------------------------
// User commands — local, file-based, commander-driven
// ---------------------------------------------------------------------------

const USER_COMMANDS = new Set([
  'status', 'list', 'diff', 'settle', 'publish', 'import', 'export',
  '--help', '-h', '--version', '-V',
]);

// ---------------------------------------------------------------------------
// Route: detect user commands vs agent commands
// ---------------------------------------------------------------------------

const firstArg = process.argv[2];

if (!firstArg || USER_COMMANDS.has(firstArg)) {
  runUserCommands();
} else {
  runAgentCommands().catch((err) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  });
}

} // end of else for git diff driver detection

// ---------------------------------------------------------------------------
// User command entry point (existing commander setup)
// ---------------------------------------------------------------------------

function runUserCommands(): void {
  const program = new Command();
  program.name('sc').description('ChangeTracks CLI').version(CLI_VERSION);

  program
    .command('status <file>')
    .description('Show change status summary')
    .action((file: string) => {
      const content = fs.readFileSync(file, 'utf-8');
      const result = computeStatus(content);
      console.log(`Changes: ${result.total} total`);
      console.log(`  Proposed: ${result.proposed}`);
      console.log(`  Accepted: ${result.accepted}`);
      console.log(`  Rejected: ${result.rejected}`);
    });

  program
    .command('list <file>')
    .description('List all tracked changes')
    .option('--status <status>', 'Filter by status (proposed, accepted, rejected)')
    .action((file: string, opts: { status?: string }) => {
      const content = fs.readFileSync(file, 'utf-8');
      const changes = computeChangeList(content, opts.status);
      if (changes.length === 0) {
        console.log('No changes found.');
        return;
      }
      for (const c of changes) {
        console.log(`${c.change_id || '-'}\t${c.type}\t${c.status}\tL${c.line}\t${c.preview}`);
      }
    });

  program
    .command('diff <file>')
    .description('Show file with colored CriticMarkup')
    .option('--view <mode>', 'View mode: review, changes, settled, raw', 'review')
    .option('--show-markup', 'Show CriticMarkup delimiters ({++, --}, {~~, ~~}, etc.)')
    .option('--no-unicode-strike', 'Use ANSI strikethrough instead of Unicode fallback')
    .option('--threads', 'Expand discussion threads inline below changes')
    .action(async (file: string, opts: { view: string; showMarkup?: boolean; unicodeStrike: boolean; threads?: boolean }) => {
      const output = await handleDiff(file, { view: opts.view as ThreeZoneViewName, showMarkup: opts.showMarkup, unicodeStrike: opts.unicodeStrike, threads: opts.threads });
      process.stdout.write(output);
    });

  program
    .command('settle <file>')
    .description('Compact accepted/rejected changes')
    .option('--dry-run', 'Show what would change without writing')
    .action((file: string, opts: { dryRun?: boolean }) => {
      const content = fs.readFileSync(file, 'utf-8');
      const result = computeSettlement(content);
      if (result.settledCount === 0) {
        console.log('No changes to settle.');
        return;
      }
      if (opts.dryRun) {
        console.log(`Would settle ${result.settledCount} change(s).`);
        return;
      }
      fs.writeFileSync(file, result.settledContent);
      console.log(`Settled ${result.settledCount} change(s).`);
    });

  program
    .command('publish <file>')
    .description('Output clean text with all changes applied')
    .action((file: string) => {
      const content = fs.readFileSync(file, 'utf-8');
      process.stdout.write(publishSettled(content));
    });

  program
    .command('import <file>')
    .description('Import a DOCX file with tracked changes to CriticMarkup markdown')
    .option('-o, --output <path>', 'Output file path')
    .option('--no-comments', 'Skip importing comments')
    .action(async (file: string, opts: { output?: string; comments: boolean }) => {
      await handleImport(file, { output: opts.output, comments: opts.comments });
    });

  program
    .command('export <file>')
    .description('Export CriticMarkup markdown to DOCX with tracked changes')
    .option('-o, --output <path>', 'Output file path')
    .option('--mode <mode>', 'Export mode: tracked, settled, or clean', 'tracked')
    .option('--comments <filter>', 'Comment filter: all, none, or unresolved', 'all')
    .action(async (file: string, opts: { output?: string; mode?: string; comments?: string }) => {
      await handleExport(file, { output: opts.output, mode: opts.mode, comments: opts.comments });
    });

  program.parse();
}

// ---------------------------------------------------------------------------
// Agent command entry point (schema-executor-driven)
// ---------------------------------------------------------------------------

const AGENT_HELP_TEXT = `Usage: sc [global-flags] <command> [args...]

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
  compact    Compact decided footnotes from a tracked file

User commands:
  diff       Show file with colored CriticMarkup
  settle     Compact accepted/rejected changes
  publish    Output clean text with all changes applied

Run 'sc <command> --help' for command-specific usage.
`;

async function runAgentCommands(): Promise<void> {
  const args = parseGlobalArgs(process.argv.slice(2));

  if (args.command === 'help') {
    process.stdout.write(AGENT_HELP_TEXT);
    process.exit(0);
  }

  const result = await runCommand(args.command, args.subArgs, {
    outputFormat: args.outputFormat,
    projectDir: args.projectDir,
  });

  process.stdout.write(formatResult(result, args.outputFormat));
  process.exit(result.success ? 0 : result.error === 'USAGE_ERROR' ? 2 : 1);
}
