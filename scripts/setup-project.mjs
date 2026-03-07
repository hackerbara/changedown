#!/usr/bin/env node

// @deprecated — Use `npx changetracks init` or the shared changetracks/init module.
// This file will be removed in a future release.

// ChangeTracks — Per-project setup (DEPRECATED)
// Usage: node scripts/setup-project.mjs [target-dir] [--author=@name] [--no-examples]
//
// Prefer: npx changetracks init

console.warn('');
console.warn('  \x1b[33m⚠  DEPRECATED: setup-project.mjs is deprecated.\x1b[0m');
console.warn('  \x1b[33m⚠  Use instead: npx changetracks init\x1b[0m');
console.warn('  \x1b[2m   This script will be removed in a future release.\x1b[0m');
console.warn('');

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SC_ROOT = resolve(__dirname, '..');

// --- Colors ---
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

// --- Args ---
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    author: { type: 'string', default: '' },
    'no-examples': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`
  ${bold('ChangeTracks — Project Setup')}

  Usage: node scripts/setup-project.mjs [target-dir] [options]

  Options:
    --author=@name     Pre-set author identity in config
    --no-examples      Skip copying demo files
    -h, --help         Show this help

  If target-dir is omitted, uses the current directory.
`);
  process.exit(0);
}

const targetRepo = resolve(positionals[0] || process.cwd());

console.log(`
  ${bold('ChangeTracks — Project Setup')}
  ${'─'.repeat(30)}

  Project: ${targetRepo}
`);

// --- 1. .changetracks/config.toml ---
const scDir = join(targetRepo, '.changetracks');
const configPath = join(scDir, 'config.toml');
mkdirSync(scDir, { recursive: true });

if (!existsSync(configPath)) {
  const authorLine = values.author
    ? `default = "${values.author}"`
    : 'default = "ai:your-model"';

  const config = `[tracking]
include = ["**/*.md"]
exclude = ["node_modules/**", "dist/**", ".git/**"]

[author]
${authorLine}
enforcement = "optional"

[hashline]
enabled = true

[settlement]
auto_on_approve = true
`;
  writeFileSync(configPath, config, 'utf8');
  console.log(`  ${green('✓')} Wrote .changetracks/config.toml`);
  console.log(`    Track: ${dim('**/*.md')}  Exclude: ${dim('node_modules, dist, .git')}`);
  console.log(`    Hashlines: ${dim('enabled')}  Auto-settle: ${dim('yes')}`);
  if (values.author) {
    console.log(`    Author: ${dim(values.author)}`);
  } else {
    console.log(`    Author: ${yellow('not set')} ${dim('— edit .changetracks/config.toml to set')}`);
  }
} else {
  console.log(`  ${dim('⊘')} .changetracks/config.toml already exists (unchanged)`);
}

// --- 2. Demo files ---
if (!values['no-examples']) {
  const examplesDir = join(targetRepo, 'examples');
  mkdirSync(examplesDir, { recursive: true });

  const demos = [
    { src: 'getting-started.md', desc: 'tutorial' },
    { src: 'api-caching-deliberation.md', desc: 'real-world example' },
  ];

  console.log('');
  for (const demo of demos) {
    const dest = join(examplesDir, demo.src);
    const srcPath = join(SC_ROOT, 'examples', demo.src);
    if (!existsSync(dest)) {
      if (existsSync(srcPath)) {
        copyFileSync(srcPath, dest);
        console.log(`  ${green('✓')} Created examples/${demo.src} (${demo.desc})`);
      } else {
        console.log(`  ${yellow('!')} examples/${demo.src} not found in ChangeTracks repo (skipped)`);
      }
    } else {
      console.log(`  ${dim('⊘')} examples/${demo.src} already exists (unchanged)`);
    }
  }
}

console.log(`
  ${green('Done!')} Open ${bold('examples/getting-started.md')} in your editor to try it out.
`);
