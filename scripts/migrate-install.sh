#!/usr/bin/env bash
set -euo pipefail

# ChangeDown Installation Migration
# Uninstalls old ChangeTracks artifacts and installs new ChangeDown equivalents
#
# Usage:
#   ./migrate-install.sh
#   ./migrate-install.sh --dry-run

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

echo "=== ChangeDown Install Migration ==="
echo "Mode: $($DRY_RUN && echo 'DRY RUN' || echo 'LIVE')"
echo ""

HOME_DIR="$HOME"

# 1. Remove old MCP server entries
echo "--- MCP Server Entries ---"
for config in \
  "$HOME_DIR/.cursor/mcp.json" \
  "$HOME_DIR/.claude/settings.json" \
  "opencode.json" \
  ".opencode/opencode.json"; do
  if [ -f "$config" ] && grep -q '"changetracks"' "$config" 2>/dev/null; then
    echo "  Found changetracks MCP entry in: $config"
    if ! $DRY_RUN; then
      # Remove the changetracks key from mcpServers (basic jq approach)
      if command -v jq &>/dev/null; then
        tmp=$(mktemp)
        jq 'if .mcpServers then .mcpServers |= del(.changetracks) else . end' "$config" > "$tmp" && mv "$tmp" "$config"
        echo "  ✓ Removed"
      else
        echo "  ⚠ jq not found — please manually remove 'changetracks' from $config"
      fi
    fi
  fi
done

# 2. Remove old hook entries
echo ""
echo "--- Hook Entries ---"
for hookfile in "$HOME_DIR/.cursor/hooks.json" ".cursor/hooks.json"; do
  if [ -f "$hookfile" ] && grep -q 'changetracks-plugin' "$hookfile" 2>/dev/null; then
    echo "  Found changetracks hooks in: $hookfile"
    if ! $DRY_RUN; then
      echo "  ⚠ Hook configs need manual update — replace 'changetracks-plugin' with 'changedown-plugin' in $hookfile"
    fi
  fi
done

# 3. Remove old npm global installs
echo ""
echo "--- npm Global Installs ---"
if command -v changetracks &>/dev/null; then
  echo "  Found global 'changetracks' binary"
  if ! $DRY_RUN; then
    npm uninstall -g changetracks 2>/dev/null || true
    echo "  ✓ Uninstalled"
  fi
fi
if command -v ctrk &>/dev/null; then
  echo "  Found global 'ctrk' binary"
  if ! $DRY_RUN; then
    npm uninstall -g changetracks 2>/dev/null || true
    echo "  ✓ Uninstalled"
  fi
fi

# 4. Remove old VS Code extension
echo ""
echo "--- VS Code Extension ---"
for editor in code cursor; do
  if command -v "$editor" &>/dev/null; then
    if "$editor" --list-extensions 2>/dev/null | grep -qi changetracks; then
      echo "  Found changetracks extension in $editor"
      if ! $DRY_RUN; then
        "$editor" --uninstall-extension changetracks.changetracks-vscode 2>/dev/null || true
        echo "  ✓ Uninstalled from $editor"
      fi
    fi
  fi
done

# 5. Install new (delegates to install.mjs)
echo ""
echo "--- Install ChangeDown ---"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/install.mjs" ]; then
  if ! $DRY_RUN; then
    echo "Running install.mjs..."
    node "$SCRIPT_DIR/install.mjs"
  else
    echo "Would run: node $SCRIPT_DIR/install.mjs"
  fi
else
  echo "⚠ install.mjs not found at $SCRIPT_DIR/install.mjs"
fi

echo ""
echo "=== Migration complete ==="
