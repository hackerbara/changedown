#!/usr/bin/env bash
set -euo pipefail

# ChangeDown Migration Script — per-project file migration
# Migrates ChangeTracks tracked files to ChangeDown format
#
# Usage:
#   ./migrate-project.sh /path/to/project
#   ./migrate-project.sh /path/to/project --dry-run

PROJECT_DIR="${1:-.}"
DRY_RUN=false
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: $PROJECT_DIR is not a directory"
  exit 1
fi

echo "=== ChangeDown Migration ==="
echo "Project: $PROJECT_DIR"
echo "Mode: $($DRY_RUN && echo 'DRY RUN' || echo 'LIVE')"
echo ""

# 1. Find tracked .md files
TRACKED_FILES=$(find "$PROJECT_DIR" -name '*.md' -not -path '*/node_modules/*' -not -path '*/.git/*' \
  -exec grep -l '<!-- ctrcks\.com/v1:' {} + 2>/dev/null || true)

if [ -z "$TRACKED_FILES" ]; then
  echo "No tracked files found (no ctrcks.com/v1 headers)."
else
  COUNT=$(echo "$TRACKED_FILES" | wc -l | tr -d ' ')
  echo "Found $COUNT tracked file(s):"
  echo "$TRACKED_FILES" | sed 's/^/  /'
  echo ""

  if ! $DRY_RUN; then
    echo "$TRACKED_FILES" | xargs sed -i '' \
      -e 's/<!-- ctrcks\.com\/v1: tracked -->/<!-- changedown.com\/v1: tracked -->/g' \
      -e 's/<!-- ctrcks\.com\/v1: untracked -->/<!-- changedown.com\/v1: untracked -->/g'
    echo "✓ Tracking headers updated"
  fi
fi

# 2. Footnote prefix ct- → cn-
FN_FILES=$(find "$PROJECT_DIR" -name '*.md' -not -path '*/node_modules/*' -not -path '*/.git/*' \
  -exec grep -l '\[\^ct-' {} + 2>/dev/null || true)

if [ -z "$FN_FILES" ]; then
  echo "No footnote references found."
else
  FN_COUNT=$(echo "$FN_FILES" | wc -l | tr -d ' ')
  echo "Found $FN_COUNT file(s) with ct- footnotes:"
  echo "$FN_FILES" | sed 's/^/  /'
  echo ""

  if ! $DRY_RUN; then
    echo "$FN_FILES" | xargs sed -i '' 's/\[\^ct-/[^cn-/g'
    echo "✓ Footnote prefixes updated (ct- → cn-)"
  fi
fi

# 3. Rename .changetracks/ → .changedown/
if [ -d "$PROJECT_DIR/.changetracks" ]; then
  echo "Found .changetracks/ config directory"
  if ! $DRY_RUN; then
    mv "$PROJECT_DIR/.changetracks" "$PROJECT_DIR/.changedown"
    # Update config.toml if present
    [ -f "$PROJECT_DIR/.changedown/config.toml" ] && \
      sed -i '' 's/changetracks/changedown/g' "$PROJECT_DIR/.changedown/config.toml"
    echo "✓ Config directory renamed to .changedown/"
  fi
else
  echo "No .changetracks/ directory found."
fi

echo ""
echo "=== Migration complete ==="
