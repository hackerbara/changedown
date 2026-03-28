#!/usr/bin/env bash
# Install ChangeDown as a Cursor skill (project-level).
# Run from your project root (the repo that contains changedown-plugin):
#   ./changedown-plugin/cursor/install-skill.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEST_DIR="$PROJECT_ROOT/.cursor/skills/changedown"
SRC="changedown-plugin/skills/changedown/SKILL.md"

mkdir -p "$DEST_DIR"
# Symlink to canonical source — stays in sync without rebuilds
ln -sf "../../../$SRC" "$DEST_DIR/SKILL.md"
echo "Installed SKILL.md symlink to .cursor/skills/changedown/"
echo ""
echo "Next steps:"
echo "  1. Ensure MCP and hooks are configured (see cursor/README.md)"
echo "  2. SKILL.md is REQUIRED for strict mode — it provides redirect guidance"
echo "     when beforeReadFile blocks raw reads on tracked files."
