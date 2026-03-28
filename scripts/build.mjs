#!/usr/bin/env node
// ChangeDown — Build all packages from source
// Usage: node scripts/build.mjs [--package-only]
//
// Matches the build order and commands from scripts/build-all.sh in the dev repo:
// core → cli → lsp-server → vscode-extension → mcp-server → hooks-impl → opencode-plugin
// Then packages .vsix.

import { existsSync, readdirSync, readFileSync, unlinkSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { parseArgs } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// --- Colors ---
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// --- Args ---
const { values } = parseArgs({
  options: {
    'package-only': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`
  ${bold('ChangeDown — Build')}

  Usage: node scripts/build.mjs [options]

  Options:
    --package-only   Skip builds, just package .vsix from existing dist/
    -h, --help       Show this help
`);
  process.exit(0);
}

// --- Clean stale .tsbuildinfo files ---
// Prevents incremental builds from skipping output generation when dist/ was
// deleted. Mirrors the find+delete in build-all.sh.
function cleanTsBuildInfo(dir) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        cleanTsBuildInfo(full);
      } else if (entry.name.endsWith('.tsbuildinfo')) {
        unlinkSync(full);
      }
    }
  } catch { /* ignore permission errors */ }
}

// --- Build steps (order matches build-all.sh) ---
const steps = [
  { name: '@changedown/core', dir: 'packages/core', cmd: 'npm run build' },
  { name: '@changedown/docx', dir: 'packages/docx', cmd: 'npx tsc' },
  { name: 'changedown', dir: 'packages/cli', cmd: 'npx tsc' },
  { name: '@changedown/lsp-server', dir: 'packages/lsp-server', cmd: 'npm run build' },
  { name: 'changedown-vscode', dir: 'packages/vscode-extension', cmd: 'npm run compile && npm run esbuild' },
  { name: '@changedown/mcp', dir: 'changedown-plugin/mcp-server', cmd: 'node esbuild.mjs' },
  { name: 'hooks-impl (plugin)', dir: 'changedown-plugin/hooks-impl', cmd: 'node esbuild.mjs' },
  { name: '@changedown/opencode-plugin', dir: 'packages/opencode-plugin', cmd: 'npm run build' },
];

const TOTAL = steps.length + 1; // +1 for vsix packaging
let failed = 0;
let step = 0;

console.log(`\n  ${bold('Building ChangeDown (all packages)')}\n`);

if (!values['package-only']) {
  // Clean stale .tsbuildinfo before building
  process.stdout.write(`  ${dim('Cleaning stale .tsbuildinfo files...')}`);
  cleanTsBuildInfo(ROOT);
  process.stdout.write(` ${green('ok')}\n\n`);

  for (const s of steps) {
    step++;
    const dir = join(ROOT, s.dir);
    const label = `  ${bold(`[${step}/${TOTAL}]`)} ${s.name.padEnd(28)}`;

    if (!existsSync(dir)) {
      process.stdout.write(`${label}${dim('skipped (not found)')}\n`);
      continue;
    }

    process.stdout.write(label);
    try {
      execSync(s.cmd, { cwd: dir, stdio: 'pipe', shell: true });
      process.stdout.write(`${green('ok')}\n`);
    } catch (e) {
      process.stdout.write(`${red('FAIL')}\n`);
      const stderr = e.stderr?.toString() || e.stdout?.toString() || '';
      const lines = stderr.split('\n').slice(0, 15);
      for (const line of lines) {
        console.log(`    ${dim(line)}`);
      }
      failed++;
    }
  }
} else {
  step = steps.length;
  console.log(`  ${dim('Skipping builds (--package-only)')}\n`);
}

// Package .vsix
if (failed === 0) {
  step++;
  const extDir = join(ROOT, 'packages', 'vscode-extension');
  const label = `  ${bold(`[${step}/${TOTAL}]`)} ${'Packaging .vsix'.padEnd(28)}`;
  process.stdout.write(label);
  try {
    execSync('npx @vscode/vsce package --no-dependencies --allow-missing-repository', {
      cwd: extDir,
      stdio: 'pipe',
      shell: true,
    });
    process.stdout.write(`${green('ok')}\n`);
    console.log(`\n  ${green(bold('All packages built successfully.'))}`);
    const extVersion = JSON.parse(readFileSync(join(extDir, 'package.json'), 'utf8')).version;
    console.log(`  Extension: ${dim(join(extDir, `changedown-vscode-${extVersion}.vsix`))}`);
  } catch (e) {
    process.stdout.write(`${red('FAIL')}\n`);
    const stderr = e.stderr?.toString() || e.stdout?.toString() || '';
    console.log(`    ${dim(stderr.split('\n').slice(0, 10).join('\n    '))}`);
    failed++;
  }
} else {
  console.log(`\n  ${red(bold(`${failed} package(s) failed to build.`))}`);
  process.exit(1);
}

console.log('');
