#!/usr/bin/env bash
#
# First-release publish script for ChangeDown npm packages.
# Uses pack-then-publish: rewrites file: deps → semver, packs a tarball,
# restores package.json immediately, then publishes the tarball.
#
# Usage:
#   bash scripts/publish-npm.sh             # interactive publish
#   bash scripts/publish-npm.sh --dry-run   # pack only, don't publish
#
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; }
info() { echo -e "  ${DIM}$1${RESET}"; }

# ── Packages in dependency order ────────────────────────────────────────────
PACKAGES=(
  "packages/core"
  "packages/docx"
  "packages/cli"
  "packages/lsp-server"
)

# ── Preflight checks ───────────────────────────────────────────────────────
echo -e "\n${BOLD}═══ ChangeDown npm Publish ═══${RESET}"
$DRY_RUN && echo -e "${YELLOW}MODE: DRY RUN (pack only, no publish)${RESET}"
echo ""

echo -e "${BOLD}[1/4] Preflight checks${RESET}"

# npm auth
NPM_USER=$(npm whoami 2>/dev/null || true)
if [[ -z "$NPM_USER" ]]; then
  fail "Not logged into npm. Run: npm login"
  exit 1
fi
ok "npm authenticated as ${BOLD}$NPM_USER${RESET}"

# Check org access
if ! npm org ls changedown "$NPM_USER" &>/dev/null; then
  fail "User '$NPM_USER' is not a member of @changedown org"
  info "Create org at https://www.npmjs.com/org/create or run: npm org add changedown $NPM_USER"
  exit 1
fi
ok "@changedown org access confirmed"

# Check packages are built
for pkg in "${PACKAGES[@]}"; do
  if [[ ! -d "$pkg/dist" ]]; then
    fail "$pkg/dist not found. Run: node scripts/build.mjs"
    exit 1
  fi
done
ok "All packages built"

# Check LICENSE and README exist
for pkg in "${PACKAGES[@]}"; do
  if [[ ! -f "$pkg/LICENSE" ]]; then
    fail "$pkg/LICENSE missing"
    exit 1
  fi
  if [[ ! -f "$pkg/README.md" ]]; then
    fail "$pkg/README.md missing"
    exit 1
  fi
done
ok "LICENSE and README present in all packages"

# Check git is clean (package.json files specifically)
DIRTY=$(git diff --name-only -- 'packages/*/package.json' 2>/dev/null || true)
if [[ -n "$DIRTY" ]]; then
  fail "Uncommitted changes in package.json files:"
  echo "$DIRTY" | while read f; do info "  $f"; done
  fail "Commit or stash before publishing"
  exit 1
fi
ok "package.json files are clean in git"

# ── Read versions ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[2/4] Package versions${RESET}"

for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$pkg/package.json').name")
  version=$(node -p "require('./$pkg/package.json').version")
  echo -e "  ${BOLD}$name${RESET}@$version"
done

# ── Pack and publish ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[3/4] Pack and publish${RESET}"

TARBALLS=()

for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$pkg/package.json').name")
  version=$(node -p "require('./$pkg/package.json').version")
  echo ""
  echo -e "  ${BOLD}── $name@$version ──${RESET}"

  # Step A: Rewrite file: deps to semver versions (preserve original formatting)
  cp "$pkg/package.json" "$pkg/package.json.bak"
  REWRITTEN=$(node -e "
    const fs = require('fs');
    const path = require('path');
    const pkg = JSON.parse(fs.readFileSync('$pkg/package.json', 'utf8'));
    const deps = pkg.dependencies || {};
    let changed = false;
    for (const [dep, ver] of Object.entries(deps)) {
      if (ver.startsWith('file:')) {
        const relPath = ver.replace('file:', '');
        const refPkgPath = path.resolve('$pkg', relPath, 'package.json');
        try {
          const refPkg = JSON.parse(fs.readFileSync(refPkgPath, 'utf8'));
          deps[dep] = refPkg.version;
          changed = true;
        } catch (e) {
          console.error('Failed to resolve ' + dep + ' from ' + refPkgPath);
          process.exit(1);
        }
      }
    }
    if (changed) pkg.dependencies = deps;
    console.log(JSON.stringify(pkg, null, 2));
  ")
  echo "$REWRITTEN" > "$pkg/package.json"

  # Show what changed
  DIFF=$(diff "$pkg/package.json.bak" <(echo "$REWRITTEN") || true)
  if [[ -n "$DIFF" ]]; then
    info "Rewrote dependencies:"
    echo "$DIFF" | grep '^[<>]' | head -10 | while read line; do info "  $line"; done
  fi

  # Step B: Pack tarball
  TARBALL=$(cd "$pkg" && npm pack --pack-destination /tmp 2>/dev/null | tail -1)
  TARBALL="/tmp/$TARBALL"
  TARBALLS+=("$TARBALL")
  ok "Packed → $(basename "$TARBALL")"

  # Step C: Restore package.json immediately from backup
  mv "$pkg/package.json.bak" "$pkg/package.json"
  ok "Restored package.json"

  # Step D: Show tarball contents
  info "Contents: $(tar tzf "$TARBALL" | wc -l | tr -d ' ') files, $(du -h "$TARBALL" | cut -f1 | tr -d ' ')"

  # Step E: Verify deps in tarball
  TARBALL_DEPS=$(tar xzf "$TARBALL" -O package/package.json | node -p "
    const deps = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).dependencies || {};
    const bad = Object.entries(deps).filter(([,v]) => v.startsWith('file:'));
    bad.length ? 'BROKEN: ' + bad.map(([k,v]) => k+'='+v).join(', ') : 'OK (no file: refs)'
  ")
  if [[ "$TARBALL_DEPS" == BROKEN* ]]; then
    fail "Tarball has file: dependencies: $TARBALL_DEPS"
    exit 1
  fi
  ok "Dependencies verified: $TARBALL_DEPS"

  # Step F: Publish
  if $DRY_RUN; then
    info "DRY RUN — skipping publish"
  else
    echo ""
    read -p "  Publish $name@$version to npm? (y/N) " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      info "Skipped $name@$version"
      continue
    fi
    npm publish "$TARBALL" --access public
    ok "Published $name@$version"

    # Step G: Verify on registry
    sleep 3
    if npm view "$name@$version" version &>/dev/null; then
      ok "Verified on registry"
    else
      info "Registry propagation may take a moment — verify manually: npm view $name"
    fi
  fi
done

# ── Cleanup ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[4/4] Cleanup${RESET}"
for tb in "${TARBALLS[@]}"; do
  rm -f "$tb"
done
ok "Removed tarball files"

# Verify git is still clean
DIRTY_AFTER=$(git diff --name-only -- 'packages/*/package.json' 2>/dev/null || true)
if [[ -n "$DIRTY_AFTER" ]]; then
  fail "package.json files were not fully restored!"
  echo "$DIRTY_AFTER"
  info "Run: git checkout -- packages/*/package.json"
else
  ok "package.json files unchanged"
fi

echo ""
if $DRY_RUN; then
  echo -e "${BOLD}Dry run complete.${RESET} Run without --dry-run to publish."
else
  echo -e "${GREEN}${BOLD}All packages published!${RESET}"
  echo ""
  echo -e "  Verify:"
  for pkg in "${PACKAGES[@]}"; do
    pname=$(node -p "require('./$pkg/package.json').name")
    pver=$(node -p "require('./$pkg/package.json').version")
    echo -e "    npm view $pname@$pver"
  done
  echo ""
  echo -e "  Test install:"
  echo -e "    ${BOLD}npx changedown init${RESET}"
fi
