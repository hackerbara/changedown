#!/usr/bin/env bash
# Install ChangeTracks hooks for Cursor
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$PLUGIN_DIR")"

# Validate hooks-impl is built
if [ ! -f "$PLUGIN_DIR/hooks-impl/dist/adapters/cursor/before-read-file.js" ] || [ ! -f "$PLUGIN_DIR/hooks-impl/dist/adapters/cursor/pre-tool-use.js" ]; then
  echo "Error: hooks-impl not built. Run 'cd $PLUGIN_DIR/hooks-impl && npm run build' first."
  exit 1
fi

# Create .cursor directory if needed
mkdir -p "$PROJECT_DIR/.cursor"

# Backup existing hooks.json if present
if [ -f "$PROJECT_DIR/.cursor/hooks.json" ]; then
  BACKUP="$PROJECT_DIR/.cursor/hooks.json.backup.$(date +%s)"
  cp "$PROJECT_DIR/.cursor/hooks.json" "$BACKUP"
  echo "Backed up existing hooks.json to $BACKUP"
fi

# Copy hooks config, rewriting relative paths to absolute for robustness
# Template uses portable relative paths (changetracks-plugin/...);
# installed copy gets absolute paths so hooks work regardless of cwd.
sed "s|changetracks-plugin/|${PLUGIN_DIR}/|g" "$SCRIPT_DIR/hooks.json" > "$PROJECT_DIR/.cursor/hooks.json"
echo "Installed Cursor hooks config to .cursor/hooks.json (paths rewritten to absolute)"

echo ""
echo "Next steps:"
echo "  1. Restart Cursor to pick up new hooks"
echo "  2. Verify hooks are enabled: Cursor Settings > Hooks"
echo "  3. Install SKILL.md if not done: ./changetracks-plugin/cursor/install-skill.sh"
echo "     (REQUIRED for strict mode — provides redirect guidance when reads are blocked)"
