#!/usr/bin/env node
// ChangeDown — Install everything
// Usage: node scripts/install.mjs [--editors=code,cursor] [--dry-run]
//
// Full parity with the install section of build-all.sh:
//   1. Detect editors (Cursor, VS Code)
//   2. Uninstall + reinstall .vsix extension
//   3. Install CLI globally (cdown, changedown binaries)
//   4. Detect agents (Claude Code, Codex, OpenCode)
//   5. Claude Code: marketplace add (local) + plugin install via CLI
//   6. Cursor: MCP config, hooks, skill
//   7. Claude plugin cache sync (overwrite dist/ so rebuilds take effect)
//   8. Codex plugin cache sync
//   9. CD Viewer (ChangeDown.app → cdviewer)
//   10. OpenCode guidance

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, cpSync, lstatSync, rmSync, symlinkSync, readdirSync } from 'fs';
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
  ${bold('ChangeDown Installer')}

  Usage: node scripts/install.mjs [options]

  Options:
    --editors=code,cursor   Override editor auto-detection
    --dry-run               Preview without installing
    -h, --help              Show this help

  Installs:
    - VS Code / Cursor extension (.vsix)
    - Cursor MCP config, hooks, and skill
    - Claude Code plugin (marketplace add + install via CLI)
    - Claude/Codex plugin cache sync (dist/ refresh after rebuild)
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
    const stderr = (e.stderr || '').toString().trim();
    const stdout = (e.stdout || '').toString().trim();
    const detail = stderr || stdout || e.message;
    if (detail) {
      for (const line of detail.split('\n')) {
        console.log(`    ${dim('>')} ${line}`);
      }
    }
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

const SRC_DIRS = {
  'mcp-server': 'packages/mcp',
  'hooks-impl': 'changedown-plugin/hooks-impl',
};

function syncPluginPackageArtifacts(pluginCache, manifestKind) {
  const manifestDir = manifestKind === 'codex' ? '.codex-plugin' : '.claude-plugin';
  const manifestSrc = join(SC_ROOT, 'changedown-plugin', manifestDir);
  if (existsSync(manifestSrc)) {
    process.stdout.write(`    ${manifestDir}/... `);
    syncDir(manifestSrc, join(pluginCache, manifestDir));
    console.log(`${green('ok')}`);
  }

  const mcpConfigName = manifestKind === 'codex' ? 'codex.mcp.json' : '.mcp.json';
  process.stdout.write(`    ${mcpConfigName}... `);
  if (manifestKind === 'codex') {
    writeCodexDevMcpConfig(pluginCache);
  } else {
    const mcpJsonSrc = join(SC_ROOT, 'changedown-plugin', mcpConfigName);
    if (existsSync(mcpJsonSrc) && !dryRun) {
      copyFileSync(mcpJsonSrc, join(pluginCache, mcpConfigName));
    }
  }
  console.log(`${green('ok')}`);

  for (const sub of ['mcp-server', 'hooks-impl']) {
    process.stdout.write(`    ${sub}/dist... `);
    syncDir(
      join(SC_ROOT, SRC_DIRS[sub], 'dist'),
      join(pluginCache, sub, 'dist')
    );
    console.log(`${green('ok')}`);
  }

  process.stdout.write('    skills/... ');
  syncDir(join(SC_ROOT, 'changedown-plugin', 'skills'), join(pluginCache, 'skills'));
  console.log(`${green('ok')}`);

  for (const pkg of ['core', 'cli']) {
    const pkgSrc = join(SC_ROOT, 'packages', pkg);
    if (!existsSync(pkgSrc)) continue;

    for (const subDir of ['mcp-server', 'hooks-impl']) {
      const dest = pkg === 'cli'
        ? join(pluginCache, subDir, 'node_modules', 'changedown')
        : join(pluginCache, subDir, 'node_modules', '@changedown', pkg);

      if (existsSync(dest) && lstatSync(dest).isSymbolicLink()) {
        if (!dryRun) rmSync(dest);
      }
      if (!dryRun) {
        mkdirSync(dest, { recursive: true });
        if (existsSync(join(pkgSrc, 'package.json'))) {
          copyFileSync(join(pkgSrc, 'package.json'), join(dest, 'package.json'));
        }
        if (existsSync(join(pkgSrc, 'dist'))) {
          syncDir(join(pkgSrc, 'dist'), join(dest, 'dist'));
        }
        if (existsSync(join(pkgSrc, 'dist-esm'))) {
          syncDir(join(pkgSrc, 'dist-esm'), join(dest, 'dist-esm'));
        }
      }
    }
    const displayName = pkg === 'cli' ? 'changedown' : `@changedown/${pkg}`;
    process.stdout.write(`    ${displayName}... `);
    console.log(`${green('ok')}`);
  }
}

function removeKnownDeletedPluginArtifacts(pluginCache) {
  const staleDirs = ['bridge-daemon'];
  for (const stale of staleDirs) {
    const target = join(pluginCache, stale);
    if (existsSync(target)) {
      process.stdout.write(`    removing stale ${stale}/... `);
      if (!dryRun) rmSync(target, { recursive: true, force: true });
      console.log(`${green('ok')}`);
    }
  }
}

function readJsonIfExists(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readdirSafe(dir) {
  try {
    return existsSync(dir) ? readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name) : [];
  } catch {
    return [];
  }
}

function discoverCodexPluginCaches() {
  const cacheRoot = join(home, '.codex', 'plugins', 'cache');
  const manifest = readJsonIfExists(join(SC_ROOT, 'changedown-plugin', '.codex-plugin', 'plugin.json'));
  const expectedVersion = manifest?.version;
  if (!existsSync(cacheRoot)) return [];

  const candidates = [];
  for (const marketplace of readdirSafe(cacheRoot)) {
    const pluginRoot = join(cacheRoot, marketplace, 'changedown');
    if (!existsSync(pluginRoot)) continue;
    for (const version of readdirSafe(pluginRoot)) {
      const candidate = join(pluginRoot, version);
      const candidateManifest = readJsonIfExists(join(candidate, '.codex-plugin', 'plugin.json'));
      if (candidateManifest?.name !== 'changedown') continue;
      candidates.push({ marketplace, version, path: candidate, matchesVersion: expectedVersion === version });
    }
  }

  const versionMatches = candidates.filter((candidate) => candidate.matchesVersion);
  if (versionMatches.length > 0) return versionMatches;
  if (candidates.length > 0) {
    const found = candidates.map((candidate) => `${candidate.marketplace}/changedown/${candidate.version}`).join(', ');
    throw new Error(`Found Codex changedown plugin cache(s), but none match source version ${expectedVersion}: ${found}`);
  }
  return [];
}

function writeCodexDevMcpConfig(pluginCache) {
  const entrypoint = join(SC_ROOT, 'packages', 'mcp', 'dist', 'index.js');
  if (!existsSync(entrypoint) && !dryRun) {
    throw new Error(`Cannot write Codex dev MCP config; missing built entrypoint: ${entrypoint}`);
  }
  if (!existsSync(entrypoint) && dryRun) {
    console.log(`    ${dim('[dry-run]')} would require built MCP entrypoint at ${entrypoint}`);
  }

  const config = {
    mcpServers: {
      cd: {
        type: 'stdio',
        command: 'node',
        args: [entrypoint],
      },
    },
  };

  const configPath = join(pluginCache, 'codex.mcp.json');
  if (!dryRun) {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  verifyCodexDevMcpConfig(configPath, entrypoint);
}

function verifyCodexDevMcpConfig(configPath, expectedEntrypoint) {
  if (dryRun) return;
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const server = config.mcpServers?.cd;
  if (!server) throw new Error(`Generated Codex config missing mcpServers.cd: ${configPath}`);
  if ('cwd' in server) throw new Error(`Generated Codex config must not contain cwd: ${configPath}`);
  if (server.command !== 'node') throw new Error(`Generated Codex config expected command=node: ${configPath}`);
  if (server.args?.[0] !== expectedEntrypoint) throw new Error(`Generated Codex config expected args[0]=${expectedEntrypoint}: ${configPath}`);
  if (!existsSync(server.args[0])) throw new Error(`Generated Codex config points at missing entrypoint: ${server.args[0]}`);
}

// --- Start ---
console.log(`
  ${bold('ChangeDown Installer')}
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
const vsixPath = join(SC_ROOT, 'packages', 'vscode-extension', `changedown-vscode-${extPkgJson.version}.vsix`);
const localExtId = `${extPkgJson.publisher}.${extPkgJson.name}`;
const publishedExtId = 'hackerbara.changedown-vscode';
const extIds = localExtId === publishedExtId ? [publishedExtId] : [localExtId, publishedExtId];
if (editors.length > 0 && existsSync(vsixPath)) {
  // Pass 1: Uninstall from all editors (clean slate — both local dev and published versions)
  console.log('\n  Uninstalling old extension...');
  for (const ed of editors) {
    const removed = [];
    for (const id of extIds) {
      if (run(`${ed.cmd} --uninstall-extension ${id}`)) removed.push(id);
    }
    process.stdout.write(`    ${ed.name}... `);
    if (removed.length > 0) {
      process.stdout.write(`${green('ok')} (${removed.join(', ')})\n`);
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
      console.log(`    ${dim(`Reload the ${ed.name} window to use the updated ChangeDown extension.`)}`);
    } else {
      console.log(`${red('FAIL')}`);
    }
  }
} else if (editors.length > 0) {
  console.log(`\n  ${yellow('!')} .vsix not found at ${vsixPath}`);
  console.log(`    Run ${bold('node scripts/build.mjs')} first to build from source.`);
}

// --- 3. Install CLI globally ---
console.log('\n  Installing CLI globally...');
const cliDir = join(SC_ROOT, 'packages', 'cli');
process.stdout.write('    npm install -g (changedown, cdown)... ');
if (run(`npm install -g "${cliDir}"`)) {
  console.log(`${green('ok')}`);
} else {
  console.log(`${red('FAIL')} — run manually: npm install -g "${cliDir}"`);
}

// --- 4. Detect agents ---
console.log('\n  Detecting AI agents...');

const claudePath = which('claude');
const codexPath = which('codex');
const opencodePath = which('opencode');

if (claudePath) console.log(`    ${green('✓')} Claude Code (claude)`);
else console.log(`    ${dim('✗')} Claude Code — not found on PATH`);

if (codexPath) console.log(`    ${green('✓')} Codex (codex)`);
else console.log(`    ${dim('✗')} Codex — not found on PATH`);

if (opencodePath) console.log(`    ${green('✓')} OpenCode (opencode)`);
else console.log(`    ${dim('✗')} OpenCode — not found on PATH`);

// --- 5. Claude Code plugin ---
// Uses `claude plugin` CLI for proper marketplace registration and plugin install.
// The marketplace source is the local dev repo so the plugin loads from local builds.
// On subsequent runs (after rebuild), step 6 syncs fresh artifacts to the cache
// without needing `claude plugin update`.
if (claudePath) {
  console.log('\n  Setting up Claude Code plugin...');

  // 5a. Register marketplace from local dev repo
  process.stdout.write('    Marketplace... ');
  if (run(`claude plugin marketplace add "${SC_ROOT}"`)) {
    console.log(`${green('ok')} (hackerbara → ${SC_ROOT})`);
  } else {
    console.log(`${red('FAIL')} — run manually: claude plugin marketplace add "${SC_ROOT}"`);
  }

  // 5b. Install plugin (idempotent — reinstalls if already present)
  process.stdout.write('    Plugin install... ');
  if (run(`claude plugin install changedown@hackerbara`)) {
    console.log(`${green('ok')} (changedown@hackerbara)`);
  } else {
    console.log(`${red('FAIL')} — run manually: claude plugin install changedown@hackerbara`);
  }
}

// --- 6. Cursor MCP + hooks + skill ---
const hasCursor = editors.some(e => e.cmd === 'cursor');
if (hasCursor) {
  console.log('\n  Setting up Cursor MCP + hooks + skill...');

  // 6a. MCP config
  const mcpServerPath = join(SC_ROOT, 'packages', 'mcp', 'dist', 'index.js');
  const cursorMcpPath = join(home, '.cursor', 'mcp.json');

  if (existsSync(mcpServerPath)) {
    mergeJsonFile(cursorMcpPath, {
      mcpServers: {
        'changedown': {
          command: 'node',
          args: [mcpServerPath]
        }
      }
    }, 'Wrote MCP config to ~/.cursor/mcp.json');
    console.log(`    ${dim('Enable in Cursor: Settings → Features → MCP → ensure "changedown" is on.')}`);
  } else {
    console.log(`    ${yellow('!')} MCP server not built — run ${bold('node scripts/build.mjs')} first`);
  }

  // 6b. Hooks (mirrors install-hooks.sh)
  const hooksScript = join(SC_ROOT, 'changedown-plugin', 'cursor', 'install-hooks.sh');
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

  // 6c. Skill (always sync, not skip-if-exists)
  const skillSrc = join(SC_ROOT, 'changedown-plugin', 'skills', 'changedown');
  const skillDest = join(home, '.cursor', 'skills', 'changedown');
  process.stdout.write(`    Cursor skill... `);
  if (existsSync(skillSrc)) {
    if (!dryRun) {
      mkdirSync(dirname(skillDest), { recursive: true });
      cpSync(skillSrc, skillDest, { recursive: true, force: true });
    }
    console.log(`${green('ok')}`);
    console.log(`    ${dim('Skill synced to ~/.cursor/skills/changedown/')}`);
  } else {
    console.log(`${dim('skipped (skills dir not found)')}`);
  }
}

// --- 7. Plugin cache sync (dev rebuild) ---
// After `claude plugin install` (step 5), the plugin lives in a cache directory.
// On subsequent builds we sync fresh dist/ artifacts into that cache so changes
// take effect on next Claude Code restart — without needing `claude plugin update`.
// The cache path is read from installed_plugins.json (set by step 5).
if (claudePath) {
  const installedPluginsPath = join(home, '.claude', 'plugins', 'installed_plugins.json');
  let pluginCache = null;
  try {
    const installed = JSON.parse(readFileSync(installedPluginsPath, 'utf8'));
    const entry = installed.plugins?.['changedown@hackerbara']?.[0];
    if (entry?.installPath && existsSync(entry.installPath)) {
      pluginCache = entry.installPath;
    }
  } catch { /* not installed yet — step 5 may have been skipped or failed */ }

  if (pluginCache) {
    console.log('\n  Syncing build artifacts to plugin cache...');
    console.log(`    ${dim(pluginCache)}`);

    removeKnownDeletedPluginArtifacts(pluginCache);
    syncPluginPackageArtifacts(pluginCache, 'claude');
    // Hook matcher config is Claude-specific.
    process.stdout.write('    hooks/... ');
    syncDir(join(SC_ROOT, 'changedown-plugin', 'hooks'), join(pluginCache, 'hooks'));
    console.log(`${green('ok')}`);

    console.log(`    ${dim('Restart Claude Code to pick up changes.')}`);
  } else {
    console.log(`\n  ${dim('No plugin cache found — run step 5 first (claude plugin install).')}`);
  }
}


// --- 8. Codex plugin cache sync (dev rebuild) ---
if (codexPath) {
  const codexPluginCaches = discoverCodexPluginCaches();
  if (codexPluginCaches.length === 1) {
    const codexPluginCache = codexPluginCaches[0].path;
    console.log('\n  Syncing build artifacts to Codex plugin cache...');
    console.log(`    ${dim(codexPluginCache)}`);
    removeKnownDeletedPluginArtifacts(codexPluginCache);
    syncPluginPackageArtifacts(codexPluginCache, 'codex');
    console.log(`    ${dim('Restart Codex CLI/Desktop to pick up changes.')}`);
  } else if (codexPluginCaches.length > 1) {
    console.log(`\n  ${yellow('!')} Multiple Codex changedown plugin caches found; not syncing automatically.`);
    for (const candidate of codexPluginCaches) {
      console.log(`    ${dim(candidate.path)}`);
    }
    console.log(`    ${dim('Remove stale caches or install one matching the source plugin version, then rerun this installer.')}`);
  } else {
    console.log(`\n  ${dim('No Codex changedown plugin cache found under ~/.codex/plugins/cache/*/changedown/*.')}`);
    console.log(`    ${dim('Install changedown@hackerbara in Codex first, then rerun this installer to sync build artifacts.')}`);
  }
}

// --- 9. CD Viewer (symlink to packaged .app binary only; no bare .build/release link) ---
const appBundleBinary = join(
  SC_ROOT,
  'packages',
  'mac-wrapper',
  'ChangeDown.app',
  'Contents',
  'MacOS',
  'ChangeDown',
);
if (platform() === 'darwin') {
  console.log('\n  Installing CD Viewer (cdviewer)...');
  const binDir = join(home, '.local', 'bin');
  const linkPath = join(binDir, 'cdviewer');
  const legacyLink = join(binDir, 'changedown-app');

  if (!existsSync(appBundleBinary)) {
    console.log(`\n  ${red('CD Viewer bundle not found.')}`);
    console.log(`    Expected: ${appBundleBinary}`);
    console.log(`    ${dim('Run from repo root: node scripts/build.mjs')}`);
  } else {
    if (!dryRun) mkdirSync(binDir, { recursive: true });

    process.stdout.write(`    ${linkPath} → ChangeDown.app/Contents/MacOS/ChangeDown... `);
    if (!dryRun) {
      try {
        if (existsSync(linkPath) || lstatSync(linkPath).isSymbolicLink()) {
          rmSync(linkPath);
        }
      } catch {
        /* doesn't exist yet */
      }
      try {
        if (existsSync(legacyLink) || lstatSync(legacyLink).isSymbolicLink()) {
          rmSync(legacyLink);
        }
      } catch {
        /* ignore */
      }
      symlinkSync(appBundleBinary, linkPath);
    }
    console.log(`${green('ok')}`);
    console.log(`    ${dim('Run: cdviewer [file.md]')}`);
  }
}

// --- 10. OpenCode ---
if (opencodePath) {
  console.log('\n  OpenCode detected.');
  console.log(`    Add to your project's opencode.json:`);
  console.log(`    ${dim('{ "plugin": ["@changedown/opencode-plugin"] }')}`);
  console.log(`    Or load from: ${dim(join(SC_ROOT, 'packages', 'opencode-plugin'))}`);
}

// --- Summary ---
console.log(`
  ${green(bold('Done!'))}

  Next step — set up a project:
    ${bold('cd /path/to/your/project')}
    ${bold('changedown init')}
`);
