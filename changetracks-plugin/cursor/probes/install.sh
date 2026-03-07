#!/usr/bin/env bash
# Install ChangeTracks hook probes into Cursor for experimental validation.
#
# Run from the project root:
#   ./changetracks-plugin/cursor/probes/install.sh
#
# After installing, open this project in Cursor and:
#   1. Open a .md file (triggers beforeReadFile)
#   2. Ask the agent to edit the .md file (triggers afterFileEdit)
#   3. Use a ChangeTracks MCP tool (triggers beforeMCPExecution)
#   4. Run a terminal command (triggers beforeShellExecution)
#   5. Let the agent finish (triggers stop)
#
# Then check the logs:
#   cat /tmp/sc-probe-before-read-file.jsonl
#   cat /tmp/sc-probe-before-mcp-execution.jsonl
#   cat /tmp/sc-probe-before-shell-execution.jsonl
#   cat /tmp/sc-probe-after-file-edit.jsonl
#   cat /tmp/sc-probe-stop.jsonl
#
# To uninstall: ./changetracks-plugin/cursor/probes/uninstall.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CURSOR_DIR="$PROJECT_ROOT/.cursor"
DEST="$CURSOR_DIR/hooks.json"

# Back up existing hooks.json if present
if [[ -f "$DEST" ]]; then
  BACKUP="$DEST.backup.$(date +%s)"
  cp "$DEST" "$BACKUP"
  echo "Backed up existing hooks.json to $BACKUP"
fi

mkdir -p "$CURSOR_DIR"
cp "$SCRIPT_DIR/hooks.json" "$DEST"

# Clear previous probe logs
rm -f /tmp/sc-probe-*.jsonl

echo ""
echo "Installed probe hooks to $DEST"
echo ""
echo "Log files will appear at:"
echo "  /tmp/sc-probe-before-read-file.jsonl"
echo "  /tmp/sc-probe-before-mcp-execution.jsonl"
echo "  /tmp/sc-probe-before-shell-execution.jsonl"
echo "  /tmp/sc-probe-after-file-edit.jsonl"
echo "  /tmp/sc-probe-stop.jsonl"
echo ""
echo "Test plan:"
echo "  1. Open this project in Cursor"
echo "  2. Open a tracked .md file (e.g. foobar.md)"
echo "  3. Ask the agent: 'Add a line to foobar.md'"
echo "  4. If MCP is configured, ask: 'Use propose_change to add a line to foobar.md'"
echo "  5. Let the agent finish its response"
echo "  6. Check logs: cat /tmp/sc-probe-*.jsonl | python3 -m json.tool"
echo ""
echo "To uninstall: ./changetracks-plugin/cursor/probes/uninstall.sh"
