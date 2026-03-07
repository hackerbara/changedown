#!/usr/bin/env bash
# Remove probe hooks from Cursor.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CURSOR_DIR="$PROJECT_ROOT/.cursor"
DEST="$CURSOR_DIR/hooks.json"

# Restore backup if one exists
LATEST_BACKUP=$(ls -t "$DEST".backup.* 2>/dev/null | head -1)
if [[ -n "$LATEST_BACKUP" ]]; then
  mv "$LATEST_BACKUP" "$DEST"
  echo "Restored hooks.json from backup: $LATEST_BACKUP"
else
  rm -f "$DEST"
  echo "Removed $DEST (no backup to restore)"
fi

echo ""
echo "Probe logs remain at /tmp/sc-probe-*.jsonl"
echo "To view:  cat /tmp/sc-probe-*.jsonl | python3 -m json.tool"
echo "To clean: rm /tmp/sc-probe-*.jsonl"
