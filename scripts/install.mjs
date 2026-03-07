#!/usr/bin/env node
// ChangeTracks — Install everything
// Usage: node scripts/install.mjs [--editors=code,cursor] [--dry-run]
//
// Full parity with the install section of build-all.sh:
//   1. Detect editors (Cursor, VS Code)
//   2. Uninstall + reinstall .vsix extension
//   3. Detect agents (Claude Code, OpenCode)
//   4. Claude Code: register marketplace + enable plugin
//   5. Cursor: MCP config, hooks, skill
//   6. Plugin cache sync (dev workflow — only if cache dir exists)
//   7. OpenCode guidance

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, cpSync, readdirSync, lstatSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { parseArgs } from 'util';
import { homedir, platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SC_ROOT = resolve(__dirname, '..');

// --- Colors ---
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

// --- Args ---
const { values } = parseArgs({
  options: {
    editors: { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`
  ${bold('ChangeTracks Installer')}

  Usage: node scripts/install.mjs [options]

  Options:
    --editors=code,cursor   Override editor auto-detection
    --dry-run               Preview without installing
    -h, --help              Show this help

  Installs:
    - VS Code / Cursor extension (.vsix)
    - Cursor MCP config, hooks, and skill
    - Claude Code marketplace + plugin registration
    - Plugin cache sync (dev workflow, conditional)
`);
  process.exit(0);
}

const dryRun = values['dry-run'];
const isWindows = platform() === 'win32';
const home = homedir();

// --- Utilities ---
function which(cmd) {
  try {
    const whereCmd = isWindows ? 'where' : 'which';
    const result = execSync(`${whereCmd} ${cmd}`, { stdio: 'pipe', encoding: 'utf8' });
    return result.trim().split('\n')[0].trim();
  } catch {
    return null;
  }
}

function run(cmd, opts = {}) {
  if (dryRun) {
    console.log(`    ${dim('[dry-run]')} ${cmd}`);
    return true;
  }
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
    return true;
  } catch (e) {
    return false;
  }
}

function mergeJsonFile(filePath, mergeObj, label) {
  if (dryRun) {
    console.log(`    ${dim('[dry-run]')} merge into ${filePath}`);
    return;
  }
  let existing = {};
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch { /* start fresh */ }
  }
  const merged = deepMerge(existing, mergeObj);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`    ${green('✓')} ${label}`);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/** Recursive copy, replacing symlinks with real directories (mirrors rsync -aL --delete). */
function syncDir(src, dest) {
  if (dryRun) {
    console.log(`    ${dim('[dry-run]')} sync ${src} → ${dest}`);
    return;
  }
  if (!existsSync(src)) return;
  // Remove dest if it's a symlink (workspace links from npm install)
  if (existsSync(dest) && lstatSync(dest).isSymbolicLink()) {
    rmSync(dest);
  }
  mkdirSync(dest, { recursive: true });
  // Use rsync if available (faster, handles --delete), fall back to cpSync
  if (!isWindows && which('rsync')) {
    execSync(`rsync -a --delete "${src}/" "${dest}/"`, { stdio: 'pipe' });
  } else {
    // Clean dest and copy fresh
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }
}

// --- Start ---
console.log(`
  ${bold('ChangeTracks Installer')}
  ${'─'.repeat(25)}
${dryRun ? `  ${yellow('[DRY RUN]')} — no changes will be made\n` : ''}
`);

// --- 1. Detect editors ---
console.log('  Detecting editors...');

const editors = [];
const requestedEditors = values.editors ? values.editors.split(',').map(s => s.trim()) : [];

const editorDefs = [
  { name: 'VS Code', cmd: 'code' },
  { name: 'Cursor', cmd: 'cursor' },
];

for (const ed of editorDefs) {
  if (requestedEditors.length > 0 && !requestedEditors.includes(ed.cmd)) continue;
  const path = which(ed.cmd);
  if (path) {
    editors.push(ed);
    console.log(`    ${green('✓')} ${ed.name} (${ed.cmd})`);
  } else {
    console.log(`    ${dim('✗')} ${ed.name} — not found on PATH`);
  }
}

// --- 2. Uninstall + install .vsix ---
const extPkgJson = JSON.parse(readFileSync(join(SC_ROOT, 'packages', 'vscode-extension', 'package.json'), 'utf8'));
const vsixPath = join(SC_ROOT, 'packages', 'vscode-extension', `changetracks-vscode-${extPkgJson.version}.vsix`);
if (editors.length > 0 && existsSync(vsixPath)) {
  // Pass 1: Uninstall from all editors (clean slate)
  console.log('\n  Uninstalling old extension...');
  for (const ed of editors) {
    process.stdout.write(`    ${ed.name}... `);
    if (run(`${ed.cmd} --uninstall-extension hackerbara.changetracks-vscode`)) {
      process.stdout.write(`${green('ok')}\n`);
    } else {
      process.stdout.write(`${dim('not installed')}\n`);
    }
  }

  // Pass 2: Install fresh
  console.log('\n  Installing extension...');
  for (const ed of editors) {
    process.stdout.write(`    ${ed.name}... `);
    if (run(`${ed.cmd} --install-extension "${vsixPath}"`)) {
      console.log(`${green('ok')}`);
      console.log(`    ${dim(`Reload the ${ed.name} window to use the updated ChangeTracks extension.`)}`);
    } else {
      console.log(`${red('FAIL')}`);
    }
  }
} else if (editors.length > 0) {
  console.log(`\n  ${yellow('!')} .vsix not found at ${vsixPath}`);
  console.log(`    Run ${bold('node scripts/build.mjs')} first to build from source.`);
}

// --- 3. Detect agents ---
console.log('\n  Detecting AI agents...');

const claudePath = which('claude');
const opencodePath = which('opencode');

if (claudePath) console.log(`    ${green('✓')} Claude Code (claude)`);
else console.log(`    ${dim('✗')} Claude Code — not found on PATH`);

if (opencodePath) console.log(`    ${green('✓')} OpenCode (opencode)`);
else console.log(`    ${dim('✗')} OpenCode — not found on PATH`);

// --- 4. Claude Code plugin ---
if (claudePath) {
  console.log('\n  Setting up Claude Code plugin...');

  const claudeSettingsPath = join(home, '.claude', 'settings.json');

  mergeJsonFile(claudeSettingsPath, {
    extraKnownMarketplaces: {
      'hackerbara': {
        source: { source: 'github', repo: 'hackerbara/changetracks' }
      }
    },
    enabledPlugins: { 'changetracks@hackerbara': true }
  }, 'Marketplace registered + plugin enabled in ~/.claude/settings.json');
}

// --- 5. Cursor MCP + hooks + skill ---
const hasCursor = editors.some(e => e.cmd === 'cursor');
if (hasCursor) {
  console.log('\n  Setting up Cursor MCP + hooks + skill...');

  // 5a. MCP config
  const mcpServerPath = join(SC_ROOT, 'changetracks-plugin', 'mcp-server', 'dist', 'index.js');
  const cursorMcpPath = join(home, '.cursor', 'mcp.json');

  if (existsSync(mcpServerPath)) {
    mergeJsonFile(cursorMcpPath, {
      mcpServers: {
        'changetracks': {
          command: 'node',
          args: [mcpServerPath]
        }
      }
    }, 'Wrote MCP config to ~/.cursor/mcp.json');
    console.log(`    ${dim('Enable in Cursor: Settings → Features → MCP → ensure "changetracks" is on.')}`);
  } else {
    console.log(`    ${yellow('!')} MCP server not built — run ${bold('node scripts/build.mjs')} first`);
  }

  // 5b. Hooks (mirrors install-hooks.sh)
  const hooksScript = join(SC_ROOT, 'changetracks-plugin', 'cursor', 'install-hooks.sh');
  process.stdout.write(`    Cursor hooks... `);
  if (existsSync(hooksScript)) {
    if (run(`bash "${hooksScript}"`, { cwd: SC_ROOT })) {
      console.log(`${green('ok')}`);
    } else {
      console.log(`${red('FAIL')}`);
    }
  } else {
    console.log(`${dim('skipped (install-hooks.sh not found)')}`);
  }

  // 5c. Skill (always sync, not skip-if-exists)
  const skillSrc = join(SC_ROOT, 'changetracks-plugin', 'skills', 'changetracks');
  const skillDest = join(home, '.cursor', 'skills', 'changetracks');
  process.stdout.write(`    Cursor skill... `);
  if (existsSync(skillSrc)) {
    if (!dryRun) {
      mkdirSync(dirname(skillDest), { recursive: true });
      cpSync(skillSrc, skillDest, { recursive: true, force: true });
    }
    console.log(`${green('ok')}`);
    console.log(`    ${dim('Skill synced to ~/.cursor/skills/changetracks/')}`);
  } else {
    console.log(`${dim('skipped (skills dir not found)')}`);
  }
}

// --- 6. Plugin cache sync (dev workflow) ---
// Only fires if the local plugin cache exists — the directory's existence
// is the signal that this is a developer who loaded the plugin locally.
// End users installing via marketplace won't have this directory.
const pluginVersion = (() => {
  try {
    const mcpPkg = JSON.parse(readFileSync(join(SC_ROOT, 'changetracks-plugin', 'mcp-server', 'package.json'), 'utf8'));
    return mcpPkg.version || '0.1.0';
  } catch { return '0.1.0'; }
})();
const PLUGIN_CACHE = join(home, '.claude', 'plugins', 'cache', 'local', 'changetracks', pluginVersion);
if (existsSync(PLUGIN_CACHE)) {
  console.log('\n  Syncing to plugin cache (dev workflow)...');

  // Sync compiled output
  process.stdout.write('    mcp-server/dist... ');
  syncDir(
    join(SC_ROOT, 'changetracks-plugin', 'mcp-server', 'dist'),
    join(PLUGIN_CACHE, 'mcp-server', 'dist')
  );
  console.log(`${green('ok')}`);

  process.stdout.write('    hooks-impl/dist... ');
  syncDir(
    join(SC_ROOT, 'changetracks-plugin', 'hooks-impl', 'dist'),
    join(PLUGIN_CACHE, 'hooks-impl', 'dist')
  );
  console.log(`${green('ok')}`);

  process.stdout.write('    hooks/ (matcher config)... ');
  syncDir(
    join(SC_ROOT, 'changetracks-plugin', 'hooks'),
    join(PLUGIN_CACHE, 'hooks')
  );
  console.log(`${green('ok')}`);

  process.stdout.write('    skills... ');
  syncDir(
    join(SC_ROOT, 'changetracks-plugin', 'skills'),
    join(PLUGIN_CACHE, 'skills')
  );
  console.log(`${green('ok')}`);

  // Sync workspace-linked @changetracks/* dependencies (resolving symlinks)
  // so cached node_modules stays in sync when new packages are added.
  for (const pkg of ['core', 'cli']) {
    const pkgSrc = join(SC_ROOT, 'packages', pkg);
    if (!existsSync(pkgSrc)) continue;

    for (const subDir of ['mcp-server', 'hooks-impl']) {
      const dest = pkg === 'cli'
        ? join(PLUGIN_CACHE, subDir, 'node_modules', 'changetracks')
        : join(PLUGIN_CACHE, subDir, 'node_modules', '@changetracks', pkg);

      // Replace symlinks (left by npm install) with real directories
      if (existsSync(dest) && lstatSync(dest).isSymbolicLink()) {
        if (!dryRun) rmSync(dest);
      }

      if (!dryRun) {
        mkdirSync(dest, { recursive: true });
        // Copy package.json
        if (existsSync(join(pkgSrc, 'package.json'))) {
          copyFileSync(join(pkgSrc, 'package.json'), join(dest, 'package.json'));
        }
        // Copy dist/
        if (existsSync(join(pkgSrc, 'dist'))) {
          syncDir(join(pkgSrc, 'dist'), join(dest, 'dist'));
        }
        // Copy dist-esm/ if present
        if (existsSync(join(pkgSrc, 'dist-esm'))) {
          syncDir(join(pkgSrc, 'dist-esm'), join(dest, 'dist-esm'));
        }
      }
    }
    const displayName = pkg === 'cli' ? 'changetracks' : `@changetracks/${pkg}`;
    process.stdout.write(`    ${displayName}... `);
    console.log(`${green('ok')}`);
  }

  console.log(`    ${dim('Restart Cursor/Claude Code to pick up MCP server + hook changes.')}`);
} else {
  console.log(`\n  ${dim('No plugin cache found at ' + PLUGIN_CACHE + ' — skipping sync.')}`);
  console.log(`  ${dim('Restart Claude Code to pick up MCP server + hook changes.')}`);
}

// --- 7. OpenCode ---
if (opencodePath) {
  console.log('\n  OpenCode detected.');
  console.log(`    Add to your project's opencode.json:`);
  console.log(`    ${dim('{ "plugin": ["@changetracks/opencode-plugin"] }')}`);
  console.log(`    Or load from: ${dim(join(SC_ROOT, 'packages', 'opencode-plugin'))}`);
}

// --- Summary ---
console.log(`
  ${green(bold('Done!'))}

  Next step — set up a project:
    ${bold('cd /path/to/your/project')}
    ${bold('npx changetracks init')}
`);
