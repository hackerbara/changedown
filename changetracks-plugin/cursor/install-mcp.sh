#!/usr/bin/env bash
# Install ChangeTracks MCP config for Cursor (project-level).
# Run from your project root (the repo that contains changetracks-plugin):
#   ./changetracks-plugin/cursor/install-mcp.sh
#
# Prerequisite: build the MCP server first:
#   cd changetracks-plugin/mcp-server && npm ci && npm run build
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CURSOR_DIR="$PROJECT_ROOT/.cursor"
DEST="$CURSOR_DIR/mcp.json"
SRC="$SCRIPT_DIR/mcp.json"
mkdir -p "$CURSOR_DIR"
cp "$SRC" "$DEST"
echo "Installed MCP config to $DEST"
echo "Enable the server in Cursor: Settings → Features → MCP (ensure \"changetracks\" is on)."
if [[ ! -f "$PROJECT_ROOT/changetracks-plugin/mcp-server/dist/index.js" ]]; then
  echo "Note: MCP server not built yet. Run: cd changetracks-plugin/mcp-server && npm ci && npm run build"
fi
