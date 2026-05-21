#!/usr/bin/env bash
#
# First-release publish script for ChangeDown npm packages.
# Uses pack-then-publish: rewrites file: deps → semver, packs a tarball,
# restores package.json immediately, then publishes the tarball.
#
# Usage:
#   bash scripts/publish-npm.sh             # interactive publish (includes @changedown/mcp)
#   bash scripts/publish-npm.sh --dry-run   # pack only, don't publish
#   bash scripts/publish-npm.sh --allow-dirty-package-json
#   bash scripts/publish-npm.sh --no-mcp    # skip @changedown/mcp this run
#   bash scripts/publish-npm.sh --include-mcp  # legacy no-op (mcp now publishes by default)
#
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=false
ALLOW_DIRTY_PACKAGE_JSON=false
INCLUDE_MCP=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --allow-dirty-package-json) ALLOW_DIRTY_PACKAGE_JSON=true; shift ;;
    --include-mcp) INCLUDE_MCP=true; shift ;;  # no-op kept for back-compat (default true)
    --no-mcp) INCLUDE_MCP=false; shift ;;
    --help|-h) head -13 "$0" | tail -9; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Switch to shipped MCP config (npx form) for the duration of this script.
# Restore local mode on exit so dev workflow isn't broken if this script fails mid-run.
changedown-plugin/scripts/use-mcp.sh shipped
trap 'changedown-plugin/scripts/use-mcp.sh local' EXIT

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
if $INCLUDE_MCP; then
  PACKAGES+=("packages/mcp")
fi

# ── Preflight checks ───────────────────────────────────────────────────────
echo -e "\n${BOLD}═══ ChangeDown npm Publish ═══${RESET}"
$DRY_RUN && echo -e "${YELLOW}MODE: DRY RUN (pack only, no publish)${RESET}"
echo ""

echo -e "${BOLD}[1/4] Preflight checks${RESET}"

# npm auth (publish only; dry-run still packs/verifies tarballs offline)
if $DRY_RUN; then
  info "Skipping npm auth/org checks in dry-run mode"
else
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
fi

# Check packages are built
for pkg in "${PACKAGES[@]}"; do
  if [[ ! -d "$pkg/dist" ]]; then
    fail "$pkg/dist not found. Run: node scripts/build.mjs"
    exit 1
  fi
done
ok "All packages built"

if [[ " ${PACKAGES[*]} " == *" packages/cli "* && ! -f "packages/cli/word-pane/manifest.xml" ]]; then
  fail "packages/cli/word-pane/manifest.xml not found. Run: node scripts/build.mjs"
  exit 1
fi
if [[ " ${PACKAGES[*]} " == *" packages/cli "* ]]; then
  ok "CLI Word pane assets present"
fi

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

# Check git is clean (package.json files specifically). Release automation
# intentionally bumps package.json before publishing and passes
# --allow-dirty-package-json; direct ad-hoc publishes stay strict.
PACKAGE_JSON_PATHS=()
for pkg in "${PACKAGES[@]}"; do
  PACKAGE_JSON_PATHS+=("$pkg/package.json")
done
PACKAGE_JSON_BASELINE=$(mktemp -t changedown-publish-package-json.XXXXXX)
# Replace the early MCP-restore trap (line 34) with a combined trap that ALSO
# cleans up the package.json baseline tempfile. Bash trap overwrites, doesn't
# stack, so both actions must be in this single trap to keep both behaviors.
trap 'rm -f "$PACKAGE_JSON_BASELINE"; changedown-plugin/scripts/use-mcp.sh local' EXIT
for file in "${PACKAGE_JSON_PATHS[@]}"; do
  shasum -a 256 "$file" >> "$PACKAGE_JSON_BASELINE"
done

DIRTY=$(git diff --name-only -- "${PACKAGE_JSON_PATHS[@]}" 2>/dev/null || true)
if [[ -n "$DIRTY" ]]; then
  if $ALLOW_DIRTY_PACKAGE_JSON; then
    info "Continuing with dirty package.json files because --allow-dirty-package-json was passed:"
    echo "$DIRTY" | while read f; do info "  $f"; done
  else
    fail "Uncommitted changes in package.json files:"
    echo "$DIRTY" | while read f; do info "  $f"; done
    fail "Commit or stash before publishing, or pass --allow-dirty-package-json from release automation"
    exit 1
  fi
fi
if [[ -z "$DIRTY" ]]; then ok "package.json files are clean in git"; fi

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
    let changed = false;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = pkg[field] || {};
      for (const [dep, ver] of Object.entries(deps)) {
        if (typeof ver !== 'string' || !ver.startsWith('file:')) continue;
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
      if (Object.keys(deps).length > 0) pkg[field] = deps;
    }
    console.log(JSON.stringify(pkg, null, 2));
  ")
  echo "$REWRITTEN" > "$pkg/package.json"

  # Show dependency rewrites only. The temporary package.json is pretty-printed
  # for packing, so a raw diff would include unrelated formatting noise.
  REWRITE_SUMMARY=$(node -e "
    const fs = require('fs');
    const before = JSON.parse(fs.readFileSync('$pkg/package.json.bak', 'utf8'));
    const after = JSON.parse(fs.readFileSync('$pkg/package.json', 'utf8'));
    const lines = [];
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const b = before[field] || {};
      const a = after[field] || {};
      for (const [dep, oldValue] of Object.entries(b)) {
        const newValue = a[dep];
        if (typeof oldValue === 'string' && oldValue.startsWith('file:') && oldValue !== newValue) {
          lines.push(field + '.' + dep + ': ' + oldValue + ' -> ' + newValue);
        }
      }
    }
    console.log(lines.join('\\n'));
  ")
  if [[ -n "$REWRITE_SUMMARY" ]]; then
    info "Rewrote dependencies:"
    echo "$REWRITE_SUMMARY" | while read line; do info "  $line"; done
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
    const pkg = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const bad = [];
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [k,v] of Object.entries(pkg[field] || {})) {
        if (typeof v === 'string' && v.startsWith('file:')) bad.push([field + ':' + k, v]);
      }
    }
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
    if npm view "$name@$version" version &>/dev/null; then
      info "$name@$version is already on npm — skipping (npm versions are immutable)"
      continue
    fi

    echo ""
    read -p "  Publish $name@$version to npm? (y/N) " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      info "Skipped $name@$version"
      continue
    fi
    CHANGEDOWN_PUBLISH_OK=1 npm publish "$TARBALL" --access public
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

# Verify package.json files returned to their exact pre-pack bytes. They may
# have been dirty before this script (release version bumps), so a git-clean
# check would be a false failure under --allow-dirty-package-json.
if ! shasum -a 256 -c "$PACKAGE_JSON_BASELINE" --status; then
  fail "package.json files were not fully restored to their pre-pack contents!"
  info "Inspect: ${PACKAGE_JSON_PATHS[*]}"
else
  ok "package.json files unchanged by publish script"
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
  echo -e "    ${BOLD}npx @changedown/cli init${RESET}"
fi
