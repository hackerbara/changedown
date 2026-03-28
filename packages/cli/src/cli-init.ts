#!/usr/bin/env node

import { runInit, type ClackAdapter } from './init/runner.js';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'init') {
  // Lazy-load @clack/prompts only when needed
  import('@clack/prompts').then((clack) => {
    const adapter: ClackAdapter = {
      intro: (text) => clack.intro(text),
      outro: (text) => clack.outro(text),
      cancel: (text) => clack.cancel(text),
      text: (opts) => clack.text(opts),
      select: (opts) => clack.select(opts as any) as any,
      confirm: (opts) => clack.confirm(opts),
      log: {
        info: (text) => clack.log.info(text),
        success: (text) => clack.log.success(text),
        warn: (text) => clack.log.warn(text),
      },
      note: (text, title) => clack.note(text, title),
      isCancel: (value) => clack.isCancel(value),
    };
    return runInit({
      args: args.slice(1),
      projectDir: process.cwd(),
      clack: adapter,
    });
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (!command || command === '--help' || command === '-h') {
  printHelp();
} else {
  console.log(`Unknown command: ${command}`);
  console.log(`Run 'changedown --help' for usage.`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`
  changedown — durable change tracking for editors and AI agents

  Usage:
    changedown init [options]    Set up change tracking in the current project
    changedown --help            Show this help

  Init options:
    --author=NAME                  Set author identity (default: git config user.name)
    --agents=LIST                  Comma-separated: claude,cursor,opencode
    --policy=MODE                  Policy mode: safety-net (default), strict, permissive
    --reconfigure                  Re-run init on an already-configured project
    --yes                          Accept defaults, skip prompts
  `);
}
