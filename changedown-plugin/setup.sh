#!/usr/bin/env bash
# Unified ChangeDown plugin setup for Claude Code and Cursor
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
  echo "Usage: $0 [--cursor|--claude|--codex|--both]"
  echo ""
  echo "  --cursor   Install Cursor MCP config, hooks, and skill"
  echo "  --claude   Verify Claude Code plugin structure"
  echo "  --codex    Verify Codex plugin structure"
  echo "  --both     Do Cursor setup and verify Claude + Codex plugin structure"
  exit 1
}

setup_cursor() {
  echo "=== Setting up ChangeDown for Cursor ==="
  echo ""

  # Build check
  if [ ! -d "$SCRIPT_DIR/hooks-impl/dist" ]; then
    echo "Building hooks-impl..."
    (cd "$SCRIPT_DIR/hooks-impl" && npm run build)
  fi

  if [ ! -d "$SCRIPT_DIR/../packages/mcp/dist" ]; then
    echo "Building MCP server..."
    (cd "$SCRIPT_DIR/../packages/mcp" && npm run build)
  fi

  # Install hooks
  "$SCRIPT_DIR/cursor/install-hooks.sh"

  # Install skill
  "$SCRIPT_DIR/cursor/install-skill.sh"

  echo ""
  echo "=== Cursor setup complete ==="
  echo "Restart Cursor to activate hooks."
}

verify_claude() {
  echo "=== Verifying Claude Code plugin structure ==="
  echo ""

  local ok=true

  [ -f "$SCRIPT_DIR/.claude-plugin/plugin.json" ] && echo "  [OK] plugin.json" || { echo "  [MISSING] plugin.json"; ok=false; }
  [ -f "$SCRIPT_DIR/hooks/hooks.json" ] && echo "  [OK] hooks.json" || { echo "  [MISSING] hooks.json"; ok=false; }
  [ -d "$SCRIPT_DIR/../packages/mcp/dist" ] && echo "  [OK] mcp-server built" || { echo "  [MISSING] packages/mcp/dist"; ok=false; }
  [ -d "$SCRIPT_DIR/hooks-impl/dist" ] && echo "  [OK] hooks-impl built" || { echo "  [MISSING] hooks-impl/dist"; ok=false; }
  [ -f "$SCRIPT_DIR/skills/changedown/SKILL.md" ] && echo "  [OK] SKILL.md" || { echo "  [MISSING] SKILL.md"; ok=false; }
  [ -f "$SCRIPT_DIR/.mcp.local.json" ] && echo "  [OK] .mcp.local.json" || { echo "  [MISSING] .mcp.local.json"; ok=false; }
  [ -f "$SCRIPT_DIR/.mcp.shipped.json" ] && echo "  [OK] .mcp.shipped.json" || { echo "  [MISSING] .mcp.shipped.json"; ok=false; }

  echo ""
  if $ok; then
    echo "=== Claude Code plugin structure verified ==="
  else
    echo "=== Some components missing. Run builds first. ==="
  fi
}

verify_codex() {
  echo "=== Verifying Codex plugin structure ==="
  local ok=true
  [ -f "$SCRIPT_DIR/.codex-plugin/plugin.json" ] && echo "  [OK] .codex-plugin/plugin.json" || { echo "  [MISSING] .codex-plugin/plugin.json"; ok=false; }
  [ -f "$SCRIPT_DIR/codex.mcp.local.json" ] && echo "  [OK] codex.mcp.local.json" || { echo "  [MISSING] codex.mcp.local.json"; ok=false; }
  [ -f "$SCRIPT_DIR/codex.mcp.shipped.json" ] && echo "  [OK] codex.mcp.shipped.json" || { echo "  [MISSING] codex.mcp.shipped.json"; ok=false; }
  [ -d "$SCRIPT_DIR/../packages/mcp/dist" ] && echo "  [OK] mcp-server built" || { echo "  [MISSING] packages/mcp/dist"; ok=false; }
  [ -d "$SCRIPT_DIR/skills/changedown-codex" ] && echo "  [OK] Codex skill" || { echo "  [MISSING] skills/changedown-codex"; ok=false; }
  # Guard both source variants — generated codex.mcp.json reflects only one at a time.
  if grep -R '\${CLAUDE_PLUGIN_ROOT}' \
       "$SCRIPT_DIR/.codex-plugin" \
       "$SCRIPT_DIR/codex.mcp.local.json" \
       "$SCRIPT_DIR/codex.mcp.shipped.json" >/dev/null 2>&1; then
    echo "  [FAIL] Codex plugin files contain Claude plugin placeholder"
    ok=false
  else
    echo "  [OK] no Claude plugin placeholder in Codex files"
  fi
  # Validate the SHIPPED variant (what users get from npm) — the generated
  # codex.mcp.json may be in local mode during dev, which is normal.
  if node - "$SCRIPT_DIR/codex.mcp.shipped.json" <<'NODE' >/dev/null 2>&1
const fs = require('fs');
const path = require('path');
const scriptDir = path.dirname(process.argv[2]);
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const plugin = JSON.parse(fs.readFileSync(path.join(scriptDir, '.codex-plugin', 'plugin.json'), 'utf8'));
const mcp = JSON.parse(fs.readFileSync(path.join(scriptDir, '..', 'packages', 'mcp', 'package.json'), 'utf8'));
const server = cfg.mcpServers && cfg.mcpServers.cd;
if (!server) process.exit(1);
if (server.command !== 'npx') process.exit(3);
if (!Array.isArray(server.args) || !server.args.includes('-y')) process.exit(4);
// Shipped form: ["-y", "--package", "@changedown/mcp@VERSION", "changedown-mcp"]
// Pin must match plugin.version (and plugin.version must match mcp/package.json).
const pkgIdx = server.args.indexOf('--package');
if (pkgIdx === -1) process.exit(6);
const pkgArg = server.args[pkgIdx + 1];
if (pkgArg !== `@changedown/mcp@${plugin.version}`) process.exit(7);
if (!server.args.includes('changedown-mcp')) process.exit(8);
if (plugin.version !== mcp.version) process.exit(5);
NODE
  then
    echo "  [OK] Codex shipped config uses pinned --package @changedown/mcp@VERSION changedown-mcp form"
  else
    echo "  [FAIL] codex.mcp.shipped.json must use 'npx -y --package @changedown/mcp@VERSION changedown-mcp' form where VERSION matches plugin.json and mcp/package.json"
    ok=false
  fi
  if $ok; then
    echo "=== Codex plugin structure verified ==="
  else
    echo "=== Codex plugin structure incomplete ==="
    return 1
  fi
}

# Parse arguments
case "${1:-}" in
  --cursor) setup_cursor ;;
  --claude) verify_claude ;;
  --codex)  verify_codex ;;
  --both)   setup_cursor; echo ""; verify_claude; echo ""; verify_codex ;;
  ""|*) usage; exit 1 ;;
esac
