#!/usr/bin/env bash
# Build all packages, package .vsix, then install into editors + configure agents.
#
# Default (no --old):
#   node scripts/build.mjs   — full monorepo build including native SPA → mac-wrapper Swift →
#                             node scripts/package-app.mjs → packages/mac-wrapper/ChangeDown.app
#   node scripts/install.mjs — VSIX, MCP, global CLI, cdviewer → ChangeDown.app/Contents/MacOS/…
#
# Legacy (--old): same compile steps in bash; on macOS also runs package-app.mjs after Swift
# so ChangeDown.app exists (parity with build.mjs). Use --old only if you cannot use Node here.
#
# Usage:
#   ./scripts/build-all.sh          # build.mjs → install.mjs (recommended)
#   ./scripts/build-all.sh --old    # legacy bash build pipeline

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" != "--old" ]]; then
  node "$ROOT/scripts/build.mjs" "$@" && node "$ROOT/scripts/install.mjs"
  BUILD_EXIT=$?
  echo "Restoring local MCP config..."
  changedown-plugin/scripts/use-mcp.sh local
  exit $BUILD_EXIT
fi

# --- Legacy build pipeline (--old) ---

shift  # consume --old

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
RESET='\033[0m'
BOLD='\033[1m'

failed=0
total=0
TOTAL_PKGS=10
[[ "$(uname -s)" == "Darwin" ]] && TOTAL_PKGS=11

build_pkg() {
  local name="$1"
  local dir="$2"
  local cmd="${3:-tsc}"
  total=$((total + 1))

  printf "${BOLD}[%d/%d]${RESET} %-24s" "$total" "$TOTAL_PKGS" "$name"

  if (cd "$ROOT/$dir" && bash -c "$cmd") >/tmp/sc-build-err-$total.log 2>&1; then
    printf "${GREEN}ok${RESET}\n"
  else
    printf "${RED}FAIL${RESET}\n"
    cat /tmp/sc-build-err-$total.log | head -20
    failed=$((failed + 1))
  fi
}

echo "${BOLD}Building ChangeDown (all packages) [legacy]${RESET}"
echo ""

# Full clean: remove all build artifacts to guarantee a fresh build.
# Cleans dist/, out/, .tsbuildinfo, and .vsix files.
printf "${BOLD}Cleaning build artifacts...${RESET} "
find "$ROOT" -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete 2>/dev/null || true
for clean_dir in packages/core/dist packages/core/dist-esm packages/docx/dist packages/cli/dist \
                 packages/lsp-server/dist packages/vscode-extension/out \
                 packages/mcp/dist changedown-plugin/hooks-impl/dist; do
  rm -rf "$ROOT/$clean_dir" 2>/dev/null || true
done
rm -f "$ROOT"/packages/vscode-extension/*.vsix 2>/dev/null || true
printf "${GREEN}ok${RESET}\n"

build_pkg "@changedown/core"        "packages/core"                    "npm run build"
build_pkg "@changedown/docx"        "packages/docx"                    "npx tsc"
build_pkg "changedown"              "packages/cli"                     "npx tsc"
build_pkg "@changedown/lsp-server"  "packages/lsp-server"              "npm run build"
build_pkg "changedown-vscode"       "packages/vscode-extension"        "npm run compile && npm run esbuild"
build_pkg "@changedown/mcp"          "packages/mcp"                   "node esbuild.mjs"
build_pkg "hooks-impl (plugin)"       "changedown-plugin/hooks-impl"   "node esbuild.mjs"
build_pkg "@changedown/website-v2"    "website-v2"                     "npm run build"
build_pkg "native SPA bundle"         "website-v2"                     "npx vite build --config vite.config.native.ts"
build_pkg "mac-wrapper (Swift)"       "packages/mac-wrapper"           "swift build -c release"

# Same as scripts/build.mjs: assemble ChangeDown.app when Swift produced a binary (single bundle lifecycle).
if [[ $failed -eq 0 ]] && [[ "$(uname -s)" == "Darwin" ]] && [[ -f "$ROOT/packages/mac-wrapper/.build/release/ChangeDown" ]]; then
  total=$((total + 1))
  printf "${BOLD}[${total}/${TOTAL_PKGS}]${RESET} %-24s" "Package ChangeDown.app"
  if (cd "$ROOT" && node scripts/package-app.mjs) >/tmp/sc-package-app.log 2>&1; then
    printf "${GREEN}ok${RESET}\n"
  else
    printf "${RED}FAIL${RESET}\n"
    cat /tmp/sc-package-app.log | head -20
    failed=$((failed + 1))
  fi
fi

echo ""
if [ $failed -eq 0 ]; then
  echo "${GREEN}${BOLD}All $TOTAL_PKGS packages built successfully.${RESET}"

  # Package the VS Code extension, uninstall from all editors, then install fresh.
  EXT_DIR="$ROOT/packages/vscode-extension"
  VSIX_VERSION=$(node -p "require('$EXT_DIR/package.json').version")
  VSIX_NAME="changedown-vscode-${VSIX_VERSION}.vsix"
  EDITORS=(cursor code)

  printf "${BOLD}Packaging VS Code extension...${RESET} "
  if (cd "$EXT_DIR" && npx @vscode/vsce package --no-dependencies --allow-missing-repository) 2>/tmp/sc-vsce.log; then
    printf "${GREEN}ok${RESET}\n"

    # Pass 1: Uninstall from all available editors
    for editor_cmd in "${EDITORS[@]}"; do
      editor_label="$(echo "$editor_cmd" | sed 's/cursor/Cursor/;s/code/VS Code/')"
      if command -v "$editor_cmd" >/dev/null 2>&1; then
        printf "${BOLD}Uninstalling from ${editor_label}...${RESET} "
        if "$editor_cmd" --uninstall-extension hackerbara.changedown-vscode 2>/dev/null; then
          printf "${GREEN}ok${RESET}\n"
        else
          printf "${DIM}not installed${RESET}\n"
        fi
      fi
    done

    # Pass 2: Install into all available editors
    for editor_cmd in "${EDITORS[@]}"; do
      editor_label="$(echo "$editor_cmd" | sed 's/cursor/Cursor/;s/code/VS Code/')"
      printf "${BOLD}Installing into ${editor_label}...${RESET} "
      if command -v "$editor_cmd" >/dev/null 2>&1; then
        if "$editor_cmd" --install-extension "$EXT_DIR/$VSIX_NAME" 2>/tmp/sc-${editor_cmd}-install.log; then
          printf "${GREEN}ok${RESET}\n"
          echo "${DIM}Reload the ${editor_label} window to use the updated ChangeDown extension.${RESET}"
        else
          printf "${RED}FAIL${RESET}\n"
          cat /tmp/sc-${editor_cmd}-install.log | head -10
        fi
      else
        printf "${DIM}skipped (${editor_cmd} not in PATH)${RESET}\n"
      fi
    done
  else
    printf "${RED}FAIL${RESET}\n"
    cat /tmp/sc-vsce.log | head -15
  fi

  # Install CLI globally (provides cdown and changedown binaries on PATH).
  #
  # Two cleanup steps before installing:
  #   1. Uninstall any legacy unscoped `changedown` global install (this is
  #      what shipped before the rename to @changedown/cli; npm install -g
  #      was failing with EEXIST because that older alias still owned the
  #      cdown/changedown bin symlinks).
  #   2. Uninstall the scoped @changedown/cli too so npm doesn't choke on a
  #      partial state from a previous failed install.
  # Both `|| true` to avoid failing when neither was previously installed.
  printf "${BOLD}Installing CLI globally...${RESET} "
  npm uninstall -g changedown @changedown/cli >/dev/null 2>&1 || true
  if npm install -g "$ROOT/packages/cli" >/tmp/sc-cli-install.log 2>&1; then
    printf "${GREEN}ok${RESET} (cdown, changedown)\n"
  else
    printf "${RED}FAIL${RESET}\n"
    cat /tmp/sc-cli-install.log | head -10
  fi

  # Install Cursor MCP config so the ChangeDown server appears in Cursor's MCP tool list.
  printf "${BOLD}Installing Cursor MCP config...${RESET} "
  if [ -f "$ROOT/changedown-plugin/cursor/install-mcp.sh" ]; then
    if (cd "$ROOT" && bash "$ROOT/changedown-plugin/cursor/install-mcp.sh") 2>/tmp/sc-mcp-install.log; then
      printf "${GREEN}ok${RESET}\n"
      echo "${DIM}Enable in Cursor: Settings → Features → MCP → ensure \"changedown\" is on. Reload window if needed.${RESET}"
    else
      printf "${RED}FAIL${RESET}\n"
      cat /tmp/sc-mcp-install.log | head -5
    fi
  else
    printf "${DIM}skipped (install-mcp.sh not found)${RESET}\n"
  fi

  # Install Cursor hooks and skill
  printf "${BOLD}Installing Cursor hooks...${RESET} "
  if [ -f "$ROOT/changedown-plugin/cursor/install-hooks.sh" ]; then
    if (cd "$ROOT" && bash "$ROOT/changedown-plugin/cursor/install-hooks.sh") 2>/tmp/sc-hooks-install.log; then
      printf "${GREEN}ok${RESET}\n"
    else
      printf "${RED}FAIL${RESET}\n"
      cat /tmp/sc-hooks-install.log | head -5
    fi
  else
    printf "${DIM}skipped (install-hooks.sh not found)${RESET}\n"
  fi
  printf "${BOLD}Installing Cursor skill...${RESET} "
  if [ -f "$ROOT/changedown-plugin/cursor/install-skill.sh" ]; then
    if (cd "$ROOT" && bash "$ROOT/changedown-plugin/cursor/install-skill.sh") 2>/tmp/sc-skill-install.log; then
      printf "${GREEN}ok${RESET}\n"
      echo "${DIM}Skill copied to .cursor/skills/changedown/ — required for strict mode redirect guidance.${RESET}"
    else
      printf "${RED}FAIL${RESET}\n"
      cat /tmp/sc-skill-install.log | head -5
    fi
  else
    printf "${DIM}skipped (install-skill.sh not found)${RESET}\n"
  fi

  # Sync built artifacts to the Claude Code plugin cache so the freshly-built
  # dist/ takes effect on the next session reload — without requiring a
  # plugin.json version bump (which would force end users through `/plugin update`).
  #
  # Per Anthropic's plugin model, marketplace plugins (including local
  # "directory" marketplaces) are COPIED to ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/.
  # ${CLAUDE_PLUGIN_ROOT} resolves to that cache path. Editing workspace src
  # alone does NOT propagate. /plugin update no-ops when the version string
  # is unchanged. So for prod-fidelity dev iteration, we sync the just-built
  # contents directly into whatever installPath Claude Code currently knows.
  PLUGIN_INSTALL_PATHS=$(node -e "
    const fs = require('fs');
    const path = require('os').homedir() + '/.claude/plugins/installed_plugins.json';
    if (!fs.existsSync(path)) process.exit(0);
    const j = JSON.parse(fs.readFileSync(path, 'utf8'));
    const plugins = j.plugins || {};
    for (const key of Object.keys(plugins)) {
      // Match any installed 'changedown@*' entry across marketplaces (hackerbara,
      // local, future-renames). Multiple entries possible (e.g. dev + cached).
      if (!key.startsWith('changedown@')) continue;
      for (const inst of plugins[key]) {
        if (inst.installPath && fs.existsSync(inst.installPath)) {
          console.log(inst.installPath);
        }
      }
    }
  " 2>/dev/null)
  if [ -n "$PLUGIN_INSTALL_PATHS" ]; then
    while IFS= read -r PLUGIN_CACHE; do
      [ -z "$PLUGIN_CACHE" ] && continue
      printf "${BOLD}Syncing to plugin cache${RESET} ${DIM}($PLUGIN_CACHE)...${RESET} "
      rsync -a --delete "$ROOT/packages/mcp/dist/" "$PLUGIN_CACHE/mcp-server/dist/"
      rsync -a --delete "$ROOT/changedown-plugin/hooks-impl/dist/" "$PLUGIN_CACHE/hooks-impl/dist/"
      rsync -a "$ROOT/changedown-plugin/hooks/"                    "$PLUGIN_CACHE/hooks/"
      rsync -a "$ROOT/changedown-plugin/skills/"                   "$PLUGIN_CACHE/skills/"
      rsync -a "$ROOT/changedown-plugin/.mcp.json"                 "$PLUGIN_CACHE/.mcp.json"
      rsync -a "$ROOT/changedown-plugin/.claude-plugin/"           "$PLUGIN_CACHE/.claude-plugin/"
      printf "${GREEN}ok${RESET}\n"
    done <<< "$PLUGIN_INSTALL_PATHS"
    PLUGIN_CACHE=$(echo "$PLUGIN_INSTALL_PATHS" | head -1)
    for pkg in core cli; do
      SRC="$ROOT/packages/$pkg"
      if [ -d "$SRC" ]; then
        for sub_dir in mcp-server hooks-impl; do
          if [ "$pkg" = "cli" ]; then
            DEST="$PLUGIN_CACHE/$sub_dir/node_modules/changedown"
          else
            DEST="$PLUGIN_CACHE/$sub_dir/node_modules/@changedown/$pkg"
          fi
          [ -L "$DEST" ] && rm "$DEST"
          mkdir -p "$DEST"
          cp -f "$SRC/package.json" "$DEST/"
          [ -d "$SRC/dist" ] && rsync -a "$SRC/dist/" "$DEST/dist/"
          [ -d "$SRC/dist-esm" ] && rsync -a "$SRC/dist-esm/" "$DEST/dist-esm/"
        done
      fi
    done
    echo "${DIM}Restart Cursor/Claude Code to pick up MCP server + hook changes.${RESET}"
  else
    echo "${DIM}No installed changedown plugin found in installed_plugins.json — skipping cache sync.${RESET}"
    echo "${DIM}If you intended to test cached install, run \`claude plugin install changedown@<marketplace>\` first.${RESET}"
  fi

  echo "Restoring local MCP config..."
  changedown-plugin/scripts/use-mcp.sh local
else
  echo "${RED}${BOLD}$failed package(s) failed to build.${RESET}"
  exit 1
fi
