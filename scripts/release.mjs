#!/usr/bin/env node

/**
 * Release orchestrator for changedown monorepo.
 * Bumps versions, builds, tests, packages, and publishes with confirmation at each step.
 *
 * Usage: node scripts/release.mjs --version=1.0.0
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const args = process.argv.slice(2);
const versionArg = args.find(a => a.startsWith('--version='));

if (!versionArg) {
  console.log('Usage: node scripts/release.mjs --version=X.Y.Z');
  process.exit(1);
}

const version = versionArg.split('=')[1];

// Validate semver format
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.log(`ERROR: "${version}" is not a valid semver version (expected X.Y.Z or X.Y.Z-tag)`);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function run(cmd, opts = {}) {
  console.log(`  > ${cmd}`);
  return execSync(cmd, { encoding: 'utf8', cwd: repoRoot, stdio: 'inherit', ...opts });
}

async function confirm(msg) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${msg} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

const PACKAGES = [
  'packages/core',
  'packages/cli',
  'packages/lsp-server',
  'packages/vscode-extension',
  'packages/opencode-plugin',
  'changedown-plugin/mcp-server',
  'changedown-plugin/hooks-impl',
];

/** Map of package name to version for updating cross-package dependency refs */
function buildNameVersionMap() {
  const map = {};
  for (const pkg of PACKAGES) {
    const pkgJsonPath = path.join(repoRoot, pkg, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    map[pkgJson.name] = version;
  }
  return map;
}

/** Update dependency versions for sibling packages (including file: refs for publish) */
function updateCrossPackageDeps(pkgJson, nameVersionMap) {
  for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkgJson[depField];
    if (!deps) continue;
    for (const [name, current] of Object.entries(deps)) {
      if (nameVersionMap[name]) {
        deps[name] = nameVersionMap[name];
      }
    }
  }
}

async function main() {
  console.log(`\n=== ChangeDown Release v${version} ===\n`);

  // 1. Bump versions + cross-package deps
  console.log('Step 1: Bumping versions...');
  const nameVersionMap = buildNameVersionMap();
  const bumpedFiles = [];
  for (const pkg of PACKAGES) {
    const pkgJsonPath = path.join(repoRoot, pkg, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    pkgJson.version = version;
    updateCrossPackageDeps(pkgJson, nameVersionMap);
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
    bumpedFiles.push(pkgJsonPath);
    console.log(`  ${pkgJson.name} → ${version}`);
  }

  // 2. Build
  console.log('\nStep 2: Building all packages...');
  run('node scripts/build.mjs');

  // 3. Tests
  console.log('\nStep 3: Running tests...');
  try {
    run('npm test');
  } catch {
    console.log('  Tests failed. Fix before releasing.');
    process.exit(1);
  }

  // 4. npm publish (scoped — needs --access public on first publish)
  if (await confirm('\nStep 4: Publish changedown to npm?')) {
    run('npm publish --access public', { cwd: path.join(repoRoot, 'packages/cli') });
  }

  // 5. VS Code Marketplace
  if (await confirm('\nStep 5: Publish to VS Code Marketplace?')) {
    run('npx @vscode/vsce publish --no-dependencies --allow-missing-repository', {
      cwd: path.join(repoRoot, 'packages/vscode-extension'),
    });
  }

  // 6. Open VSX
  if (await confirm('\nStep 6: Publish to Open VSX?')) {
    run('npx ovsx publish --no-dependencies', { cwd: path.join(repoRoot, 'packages/vscode-extension') });
  }

  // 7. Git tag — stage only bumped package.json files
  if (await confirm(`\nStep 7: Create git tag v${version}?`)) {
    for (const f of bumpedFiles) {
      run(`git add "${f}"`);
    }
    run(`git commit -m "release: v${version}"`);
    run(`git tag v${version}`);
    console.log(`  Tagged v${version}`);
    console.log('  Run: git push origin main && git push origin --tags');
  }

  // 8. Post-release checklist
  console.log(`
=== Post-Release Checklist ===
  [ ] Push: git push origin main && git push origin v${version}
  [ ] GitHub Release: create at github.com/hackerbara/changedown/releases/new
      Attach: packages/vscode-extension/changedown-vscode-${version}.vsix
  [ ] Verify: npx changedown init (in a fresh directory)
  [ ] Verify: /plugin marketplace add hackerbara/changedown (Claude Code)
`);
}

main().catch(console.error);
