#!/usr/bin/env bash
# Set up a repo to use ChangeDown (Cursor MCP + skill + config + demo file).
# Run from the repo you want to set up, with the install bundle path known.
#
# Usage:
#   # Bundle inside repo (e.g. my-project/changedown-install/)
#   cd /path/to/my-project
#   ./changedown-install/setup-repo.sh
#
#   # Bundle elsewhere
#   cd /path/to/my-project
#   CHANGEDOWN_INSTALL=/path/to/changedown-install /path/to/changedown-install/setup-repo.sh
#
set -e
SCRIPT_PATH="${BASH_SOURCE[0]}"
if [[ -n "$CHANGEDOWN_INSTALL" ]]; then
  INSTALL_DIR="$(cd "$CHANGEDOWN_INSTALL" && pwd)"
else
  INSTALL_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
fi
TARGET_REPO="${1:-$(pwd)}"
TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"

if [[ ! -f "$INSTALL_DIR/mcp-server/dist/index.js" ]]; then
  echo "ERROR: MCP server not found at $INSTALL_DIR/mcp-server/dist/index.js"
  echo "Run package-for-install.sh first or set CHANGEDOWN_INSTALL to a valid bundle."
  exit 1
fi

echo "ChangeDown setup"
echo "  Install bundle: $INSTALL_DIR"
echo "  Target repo:    $TARGET_REPO"
echo ""

# MCP config
CURSOR_DIR="$TARGET_REPO/.cursor"
mkdir -p "$CURSOR_DIR"
if [[ "$INSTALL_DIR" == "$TARGET_REPO"/* ]] || [[ "$INSTALL_DIR" == "$TARGET_REPO"* ]]; then
  REL_PATH="$([[ "$INSTALL_DIR" == "$TARGET_REPO"/* ]] && echo "${INSTALL_DIR#$TARGET_REPO/}" || echo "${INSTALL_DIR#$TARGET_REPO}")"
  REL_PATH="${REL_PATH#/}"
  MCP_ARGS="[\"\${workspaceFolder}/$REL_PATH/mcp-server/dist/index.js\"]"
else
  MCP_ARGS="[\"$INSTALL_DIR/mcp-server/dist/index.js\"]"
fi
# Cursor mcp.json — merge into existing config to preserve other MCP servers
MCP_ENTRY="{\"mcpServers\":{\"changedown\":{\"command\":\"node\",\"args\":$MCP_ARGS}}}"
if [[ -f "$CURSOR_DIR/mcp.json" ]]; then
  node -e "
    const fs = require('fs');
    const existing = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const incoming = JSON.parse(process.argv[2]);
    if (!existing.mcpServers) existing.mcpServers = {};
    Object.assign(existing.mcpServers, incoming.mcpServers);
    fs.writeFileSync(process.argv[1], JSON.stringify(existing, null, 2) + '\n');
  " "$CURSOR_DIR/mcp.json" "$MCP_ENTRY"
else
  echo "$MCP_ENTRY" | node -e "
    const fs = require('fs'); let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>fs.writeFileSync(process.argv[1],JSON.stringify(JSON.parse(d),null,2)+'\n'));
  " "$CURSOR_DIR/mcp.json"
fi
echo "  Wrote .cursor/mcp.json (merged)"

# Skill
SKILL_DEST="$CURSOR_DIR/skills/changedown"
mkdir -p "$(dirname "$SKILL_DEST")"
rm -rf "$SKILL_DEST"
cp -R "$INSTALL_DIR/skills/changedown" "$SKILL_DEST"
echo "  Installed .cursor/skills/changedown"

# .changedown/config.toml (only if missing)
CHANGEDOWN_DIR="$TARGET_REPO/.changedown"
CONFIG="$CHANGEDOWN_DIR/config.toml"
mkdir -p "$CHANGEDOWN_DIR"
if [[ ! -f "$CONFIG" ]]; then
  cp "$INSTALL_DIR/.changedown/config.toml" "$CONFIG"
  echo "  Wrote .changedown/config.toml (defaults)"
else
  echo "  .changedown/config.toml already exists (unchanged)"
fi

# Optional .cursorrules (only if repo has none)
if [[ ! -f "$TARGET_REPO/.cursorrules" ]] && [[ -f "$INSTALL_DIR/.cursorrules.template" ]]; then
  cp "$INSTALL_DIR/.cursorrules.template" "$TARGET_REPO/.cursorrules"
  echo "  Wrote .cursorrules (ChangeDown reminder)"
fi

# Claude Code: local marketplace at repo root (only when bundle is inside repo and has plugin/)
if [[ -d "$INSTALL_DIR/plugin" ]] && [[ "$INSTALL_DIR" == "$TARGET_REPO"/* ]]; then
  REL_PATH="$([[ "$INSTALL_DIR" == "$TARGET_REPO"/* ]] && echo "${INSTALL_DIR#$TARGET_REPO/}" || echo "${INSTALL_DIR#$TARGET_REPO}"); REL_PATH="${REL_PATH#/}"
  CLAUDE_MKT_DIR="$TARGET_REPO/.claude-plugin"
  mkdir -p "$CLAUDE_MKT_DIR"
  if [[ ! -f "$CLAUDE_MKT_DIR/marketplace.json" ]]; then
    cat > "$CLAUDE_MKT_DIR/marketplace.json" << MKT
{
  "name": "local",
  "owner": { "name": "ChangeDown" },
  "plugins": [
    {
      "name": "changedown",
      "source": "./$REL_PATH/plugin",
      "description": "Durable change tracking with reasoning for AI agents"
    }
  ]
}
MKT
    echo "  Wrote .claude-plugin/marketplace.json (Claude Code local marketplace)"
  fi
  # Optional: prompt to install when opening project in Claude Code — merge to preserve existing settings
  CLAUDE_SETTINGS="$TARGET_REPO/.claude/settings.json"
  CLAUDE_MERGE='{"extraKnownMarketplaces":{"local":{"source":{"source":"directory","path":"."}}},"enabledPlugins":{"changedown@local":true}}'
  mkdir -p "$TARGET_REPO/.claude"
  if [[ -f "$CLAUDE_SETTINGS" ]]; then
    node -e "
      const fs = require('fs');
      const existing = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      const incoming = JSON.parse(process.argv[2]);
      for (const key of Object.keys(incoming)) {
        if (typeof incoming[key] === 'object' && typeof existing[key] === 'object') {
          existing[key] = { ...existing[key], ...incoming[key] };
        } else if (!(key in existing)) {
          existing[key] = incoming[key];
        }
      }
      fs.writeFileSync(process.argv[1], JSON.stringify(existing, null, 2) + '\n');
    " "$CLAUDE_SETTINGS" "$CLAUDE_MERGE"
    echo "  Merged changedown settings into .claude/settings.json"
  else
    echo "$CLAUDE_MERGE" | node -e "
      const fs = require('fs'); let d='';
      process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>fs.writeFileSync(process.argv[1],JSON.stringify(JSON.parse(d),null,2)+'\n'));
    " "$CLAUDE_SETTINGS"
    echo "  Wrote .claude/settings.json (Claude Code: changedown@local enabled)"
  fi
fi

# Demo file (tracked) so they can try immediately
DEMO_FILE="$TARGET_REPO/changedown-demo.md"
if [[ ! -f "$DEMO_FILE" ]]; then
  cat > "$DEMO_FILE" << 'DEMO'
<!-- changedown.com/v1: tracked -->

# ChangeDown demo

This file is **tracked**. You can:

1. **Editor:** Turn on **Tracking** (dot icon in the title bar) and type — your text is wrapped as insertions. Use Accept/Reject in the margin or **Shift+Cmd+A** / **Shift+Cmd+R**.
2. **Smart View:** Toggle the eye icon to hide or show the `{++` `++}` delimiters.
3. **AI:** In Cursor chat, ask the model to edit this file. It will use `propose_change` and related MCP tools; you’ll see footnotes and markup. Accept or reject from the CHANGEDOWN view or the margin.

## Sample section

The quick brown fox jumps over the lazy dog. Try replacing this sentence with tracking on, or ask your AI to propose a change.

DEMO
  echo "  Created changedown-demo.md"
else
  echo "  changedown-demo.md already exists (unchanged)"
fi

echo ""
echo "Done. Next:"
echo "  Cursor: Reload, enable MCP (Settings → Features → MCP → changedown), open changedown-demo.md."
echo "  Claude Code: Start Claude from this repo (cd here, then run 'claude'). If .claude/settings.json was added,"
echo "    trust the project when prompted; otherwise run: /plugin marketplace add .  then /plugin install changedown@local"
