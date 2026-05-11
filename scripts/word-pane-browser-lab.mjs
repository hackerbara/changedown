#!/usr/bin/env node
import { main } from './word-pane-browser-lab/cli.mjs';

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
