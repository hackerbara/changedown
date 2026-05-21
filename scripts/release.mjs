#!/usr/bin/env node

/**
 * Release orchestrator for changedown monorepo.
 * Bumps versions, builds, tests, packages, and publishes with confirmation at each step.
 *
 * Usage: node scripts/release.mjs --version=1.0.0 [--bump-only] [--include-internal]
 *
 *   --bump-only         Perform Step 1 (versions + lockfile regen) then exit. No build,
 *                       no tests, no publish prompts. Prints the list of written files.
 *   --include-internal  Also bump internal/non-shipping packages (Group B) and the root
 *                       package.json. Default: only the shipping PACKAGES set is bumped.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const args = process.argv.slice(2);
const versionArg = args.find(a => a.startsWith('--version='));
const bumpOnly = args.includes('--bump-only');
const includeInternal = args.includes('--include-internal');

if (!versionArg) {
  console.log('Usage: node scripts/release.mjs --version=X.Y.Z [--bump-only] [--include-internal]');
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
  'packages/docx',
  'packages/cli',
  'packages/lsp-server',
  'packages/vscode-extension',
  'packages/opencode-plugin',
  'packages/mcp',
  'changedown-plugin/hooks-impl',
];

const INTERNAL_PACKAGES = [
  'packages/preview',
  'packages/cursor-preview',
  'packages/benchmarks',
  'packages/tests',
  'packages/tests/vscode',
  'packages/tests/word-addin',
  'packages/vienna-plugin',
  'packages/word-add-in',
  'changedown-plugin/llm-jail',
  'changedown-plugin/remote-worker',
  'viewer',
  'website-v2',
  'word-marketing',
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

/** Update dependency versions for sibling packages.
 *
 * Keep local file: workspace refs intact in the repository. npm publishing goes
 * through scripts/publish-npm.sh, which temporarily rewrites file: refs inside
 * packed tarballs only. This keeps the dev workspace easy to use while making
 * the published artifacts registry-safe.
 */
function updateCrossPackageDeps(pkgJson, nameVersionMap) {
  for (const depField of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkgJson[depField];
    if (!deps) continue;
    for (const [name, current] of Object.entries(deps)) {
      if (nameVersionMap[name] && typeof current === 'string' && !current.startsWith('file:')) {
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

    if (pkg === 'packages/mcp') {
      const versionTsPath = path.join(repoRoot, pkg, 'src/version.ts');
      if (fs.existsSync(versionTsPath)) {
        const original = fs.readFileSync(versionTsPath, 'utf8');
        const versionLiteralRe = /version\s*=\s*['"][^'"]+['"]/;
        if (!versionLiteralRe.test(original)) {
          // The regex didn't match anything — the file's format has drifted
          // from the expected `export const version = '...'` shape. That IS a
          // real error worth halting on (silent miss would leave version.ts
          // stale forever).
          console.error(`  ERROR: failed to find version literal in ${versionTsPath}`);
          process.exit(1);
        }
        const updated = original.replace(versionLiteralRe, `version = '${version}'`);
        // Idempotent: if updated === original it just means the file was
        // already at the target version (e.g. re-running the same release).
        // Write unconditionally and stage; no need to error on no-op.
        fs.writeFileSync(versionTsPath, updated);
        bumpedFiles.push(versionTsPath);
        console.log(`  ${pkg}/src/version.ts → ${version}`);
      }
    }
  }

  if (includeInternal) {
    console.log('  Bumping internal packages...');
    for (const pkg of INTERNAL_PACKAGES) {
      const pkgJsonPath = path.join(repoRoot, pkg, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

      if (pkg === 'changedown-plugin/remote-worker') {
        // remote-worker has no `version` field today. Reconstruct the object
        // so `version` lands right after `name` in the diff (matching every
        // other package.json) rather than appended at the end.
        const out = { name: pkgJson.name, version };
        for (const [k, v] of Object.entries(pkgJson)) {
          if (k !== 'name' && k !== 'version') out[k] = v;
        }
        updateCrossPackageDeps(out, nameVersionMap);
        fs.writeFileSync(pkgJsonPath, JSON.stringify(out, null, 2) + '\n');
        bumpedFiles.push(pkgJsonPath);
        console.log(`  ${out.name || pkg} → ${version}`);
      } else {
        pkgJson.version = version;
        updateCrossPackageDeps(pkgJson, nameVersionMap);
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
        bumpedFiles.push(pkgJsonPath);
        console.log(`  ${pkgJson.name || pkg} → ${version}`);
      }
    }

    // Also bump the root package.json (changedown-monorepo).
    const rootPkgJsonPath = repoRoot + '/package.json';
    const rootPkgJson = JSON.parse(fs.readFileSync(rootPkgJsonPath, 'utf8'));
    rootPkgJson.version = version;
    fs.writeFileSync(rootPkgJsonPath, JSON.stringify(rootPkgJson, null, 2) + '\n');
    bumpedFiles.push(rootPkgJsonPath);
    console.log(`  ${rootPkgJson.name || 'root'} → ${version}`);
  }

  // Bump agent plugin manifests too — plugin runtimes use `version` as an
  // install/update cache key. Without bumping, end-user installs of the new
  // release can keep running the previous build.
  const pluginManifestPaths = [
    ['Claude Code plugin manifest', 'changedown-plugin/.claude-plugin/plugin.json'],
    ['Codex plugin manifest', 'changedown-plugin/.codex-plugin/plugin.json'],
  ];
  for (const [label, relativeManifestPath] of pluginManifestPaths) {
    const pluginManifestPath = path.join(repoRoot, relativeManifestPath);
    if (!fs.existsSync(pluginManifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(pluginManifestPath, 'utf8'));
    manifest.version = version;
    fs.writeFileSync(pluginManifestPath, JSON.stringify(manifest, null, 2) + '\n');
    bumpedFiles.push(pluginManifestPath);
    console.log(`  changedown-plugin (${label}) → ${version}`);
  }

  // Bump the @changedown/mcp@ version pin in the shipped MCP config files.
  // Three guards (setup.sh, package-for-install.sh, smoke-codex-mcp.mjs) enforce
  // that the pin equals @changedown/mcp@${plugin.version}. Without this fix any
  // release.mjs run at version > 0.4.6 would trip those guards.
  const mcpShippedPaths = [
    'changedown-plugin/.mcp.shipped.json',
    'changedown-plugin/codex.mcp.shipped.json',
  ];
  for (const relPath of mcpShippedPaths) {
    const fullPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const raw = fs.readFileSync(fullPath, 'utf8');
    const pinRe = /@changedown\/mcp@[\w.\-]+/;
    if (!pinRe.test(raw)) {
      console.error(`  ERROR: failed to find @changedown/mcp@ pin in ${relPath}`);
      process.exit(1);
    }
    const updated = raw.replace(pinRe, `@changedown/mcp@${version}`);
    fs.writeFileSync(fullPath, updated);
    bumpedFiles.push(fullPath);
    console.log(`  ${relPath} pin → @changedown/mcp@${version}`);
  }

  console.log('  Updating package-lock.json...');
  run('npm install --package-lock-only --ignore-scripts');
  bumpedFiles.push(path.join(repoRoot, 'package-lock.json'));

  if (bumpOnly) {
    console.log('\n--bump-only: stopping after version bumps + lockfile regen.');
    console.log('Files written (stage these):');
    for (const f of bumpedFiles) console.log(`  ${f}`);
    return;
  }

  // 2. Build
  console.log('\nStep 2: Building all packages...');
  run('node scripts/build.mjs');

  // 2a. Hosted Word pane assets
  console.log('\nStep 2a: Building hosted Word pane assets...');
  run('node scripts/build-word-pane-for-website.mjs');

  // 2b. Package .app bundle (build.mjs also attempts this; keep this explicit
  // legacy release artifact step so the release checklist remains populated).
  console.log('\nStep 2b: Packaging .app bundle...');
  run('node scripts/package-app.mjs --version=' + version);

  // 2c. Lint
  console.log('\nStep 2c: Linting...');
  try {
    run('npm run lint');
  } catch {
    console.log('  Lint failed. Fix before releasing.');
    process.exit(1);
  }

  // 3. Tests
  console.log('\nStep 3: Running tests...');
  try {
    run('npm test');
  } catch {
    console.log('  Tests failed. Fix before releasing.');
    process.exit(1);
  }

  // 4. npm publish. Use the pack/rewrite script so file: workspace deps are
  // rewritten to semver in tarballs before publishing.
  if (await confirm('\nStep 4: Publish npm packages?')) {
    run('bash scripts/publish-npm.sh --allow-dirty-package-json');
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
      Attach: packages/mac-wrapper/ChangeDown-arm64.zip
      Attach: packages/mac-wrapper/ChangeDown-arm64.zip.sha256
  [ ] Verify: npx @changedown/cli init (in a fresh directory)
  [ ] Verify: /plugin marketplace add hackerbara/changedown (Claude Code)
  [ ] Verify: curl -fsSL .../install-viewer.sh | sh (from a clean machine)
`);
}

main().catch(console.error);
