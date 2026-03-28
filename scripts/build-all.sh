#!/usr/bin/env bash
# Build all packages, package .vsix, then install into editors + configure agents.
# Use --old to run the legacy bash build instead of build.mjs + install.mjs.
#
# Usage:
#   ./scripts/build-all.sh          # build.mjs → install.mjs (full pipeline)
#   ./scripts/build-all.sh --old    # legacy bash build pipeline

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" != "--old" ]]; then
  node "$ROOT/scripts/build.mjs" "$@" && node "$ROOT/scripts/install.mjs"
  exit $?
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
TOTAL_PKGS=7

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

# Clean stale .tsbuildinfo files that cause incremental builds to skip output
# generation when dist/ was deleted. This is cheap (~2ms) and prevents the
# "dist exists in tsbuildinfo but not on disk" class of silent build failures.
find "$ROOT" -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete 2>/dev/null || true

build_pkg "@changedown/core"        "packages/core"                    "npm run build"
build_pkg "@changedown/docx"        "packages/docx"                    "npx tsc"
build_pkg "changedown"              "packages/cli"                     "npx tsc"
build_pkg "@changedown/lsp-server"  "packages/lsp-server"              "npm run build"
build_pkg "changedown-vscode"       "packages/vscode-extension"        "npm run compile && npm run esbuild"
build_pkg "@changedown/mcp"          "changedown-plugin/mcp-server"   "node esbuild.mjs"
build_pkg "hooks-impl (plugin)"       "changedown-plugin/hooks-impl"   "node esbuild.mjs"

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

  # Sync built artifacts to Cursor's plugin cache
  PLUGIN_VERSION=$(node -p "require('$ROOT/changedown-plugin/mcp-server/package.json').version" 2>/dev/null || echo '0.1.0')
  PLUGIN_CACHE="$HOME/.claude/plugins/cache/local/changedown/$PLUGIN_VERSION"
  if [ -d "$PLUGIN_CACHE" ]; then
    printf "${BOLD}Syncing to plugin cache...${RESET} "
    rsync -a --delete "$ROOT/changedown-plugin/mcp-server/dist/" "$PLUGIN_CACHE/mcp-server/dist/"
    rsync -a --delete "$ROOT/changedown-plugin/hooks-impl/dist/"  "$PLUGIN_CACHE/hooks-impl/dist/"
    rsync -a "$ROOT/changedown-plugin/hooks/"                     "$PLUGIN_CACHE/hooks/"
    rsync -a "$ROOT/changedown-plugin/skills/"                    "$PLUGIN_CACHE/skills/"
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
    printf "${GREEN}ok${RESET}\n"
    echo "${DIM}Restart Cursor/Claude Code to pick up MCP server + hook changes.${RESET}"
  else
    echo "${DIM}No plugin cache found at $PLUGIN_CACHE — skipping sync.${RESET}"
    echo "${DIM}Restart Claude Code to pick up MCP server + hook changes.${RESET}"
  fi
else
  echo "${RED}${BOLD}$failed package(s) failed to build.${RESET}"
  exit 1
fi
