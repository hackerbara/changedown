#!/usr/bin/env bash
# Build the ChangeDown monorepo and produce a self-contained install bundle
# for Cursor, VS Code, and Claude Code. Output: dist/changedown-install/
#
# Bundle contains:
#   - Cursor/VS Code: .vsix, mcp-server/, skills/, .changedown/, setup-repo.sh, DEMO.md
#   - Claude Code: .claude-plugin/marketplace.json + plugin/ (full plugin with MCP, hooks, skills)
#
# Usage: from repo root: ./scripts/package-for-install.sh
set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
BUNDLE_NAME="changedown-install"
BUNDLE_DIR="${REPO_ROOT}/dist/${BUNDLE_NAME}"
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

echo "=== Building ChangeDown for install bundle ==="

# 1. Core, MCP server, hooks-impl (needed for Cursor and Claude Code)
echo "Building @changedown/core..."
(cd packages/core && npm run build)
echo "Building MCP server..."
(cd packages/mcp && npm ci && npm run build)
echo "Building hooks-impl (Claude Code)..."
(cd changedown-plugin/hooks-impl && npm ci && npm run build)

# 2. VS Code extension (.vsix)
echo "Building VS Code extension..."
npm run build:lsp
(cd packages/vscode-extension && npm run compile && npm run esbuild -- --production)
(cd packages/vscode-extension && npx @vscode/vsce package --no-dependencies --allow-missing-repository)
VSIX_VERSION=$(node -p "require('./packages/vscode-extension/package.json').version")
VSIX_SRC="packages/vscode-extension/changedown-vscode-${VSIX_VERSION}.vsix"
if [[ ! -f "$VSIX_SRC" ]]; then
  echo "ERROR: .vsix not found at $VSIX_SRC"
  exit 1
fi
cp "$VSIX_SRC" "$BUNDLE_DIR/"

# 3. Bundle core + cli for MCP server (so bundle is self-contained)
echo "Bundling core, cli, and MCP server..."
mkdir -p "$BUNDLE_DIR/core"
cp packages/core/package.json "$BUNDLE_DIR/core/"
cp -R packages/core/dist "$BUNDLE_DIR/core/" 2>/dev/null || true
if [[ -d packages/core/dist-esm ]]; then
  cp -R packages/core/dist-esm "$BUNDLE_DIR/core/"
fi
mkdir -p "$BUNDLE_DIR/cli"
cp packages/cli/package.json "$BUNDLE_DIR/cli/"
cp -R packages/cli/dist "$BUNDLE_DIR/cli/" 2>/dev/null || true
mkdir -p "$BUNDLE_DIR/mcp-server"
cp packages/mcp/package.json "$BUNDLE_DIR/mcp-server/"
cp -R packages/mcp/dist "$BUNDLE_DIR/mcp-server/"
# Point to local core + cli in bundle
PKG_JSON="$BUNDLE_DIR/mcp-server/package.json" node -e "
const fs = require('fs');
const pPath = process.env.PKG_JSON;
const p = JSON.parse(fs.readFileSync(pPath, 'utf8'));
p.dependencies['@changedown/core'] = 'file:../core';
p.dependencies['@changedown/cli'] = 'file:../cli';
delete p.dependencies['changedown'];
fs.writeFileSync(pPath, JSON.stringify(p, null, 2));
"
(cd "$BUNDLE_DIR/mcp-server" && npm install --omit=dev --no-package-lock)
echo "MCP server bundle ready"

# 4. Cursor skill and config
mkdir -p "$BUNDLE_DIR/skills"
cp -R changedown-plugin/skills/changedown "$BUNDLE_DIR/skills/"
mkdir -p "$BUNDLE_DIR/.changedown"
cat > "$BUNDLE_DIR/.changedown/config.toml" << 'TOML'
[tracking]
include = ["**/*.md"]
exclude = ["node_modules/**", "dist/**", ".git/**"]

[author]
default = "ai:composer"
enforcement = "optional"

[hashline]
enabled = true

[settlement]
auto_on_approve = true
TOML

# 5. Setup script, demo doc, optional .cursorrules
cp "$REPO_ROOT/scripts/setup-repo.sh" "$BUNDLE_DIR/"
cp "$REPO_ROOT/docs/DEMO.md" "$BUNDLE_DIR/"
cp "$REPO_ROOT/scripts/bundle-cursorrules.template" "$BUNDLE_DIR/.cursorrules.template"
chmod +x "$BUNDLE_DIR/setup-repo.sh"

# 6. Claude Code: local marketplace + self-contained plugin (copied to cache on install)
echo "Bundling Claude Code plugin and marketplace..."
PLUGIN_DIR="$BUNDLE_DIR/plugin"
mkdir -p "$PLUGIN_DIR/.claude-plugin"
mkdir -p "$PLUGIN_DIR/hooks"
# Plugin manifest and MCP/hooks config (use CLAUDE_PLUGIN_ROOT; Claude sets it to cached plugin dir)
cp changedown-plugin/.claude-plugin/plugin.json "$PLUGIN_DIR/.claude-plugin/"
cp changedown-plugin/.mcp.json "$PLUGIN_DIR/"
mkdir -p "$PLUGIN_DIR/.codex-plugin"
cp changedown-plugin/.codex-plugin/plugin.json "$PLUGIN_DIR/.codex-plugin/"
# Codex public plugin config intentionally uses pinned npx without cwd.
# Local development cache sync rewrites codex.mcp.json to an absolute node entrypoint.
if ! CODEX_MCP_VERSION_CHECK=$(node - <<'NODE' 2>&1
const fs = require('fs');
const plugin = JSON.parse(fs.readFileSync('changedown-plugin/.codex-plugin/plugin.json', 'utf8'));
const mcp = JSON.parse(fs.readFileSync('packages/mcp/package.json', 'utf8'));
const cfg = JSON.parse(fs.readFileSync('changedown-plugin/codex.mcp.json', 'utf8'));
const arg = cfg.mcpServers?.cd?.args?.find((value) => String(value).startsWith('@changedown/mcp@'));
if (plugin.version !== mcp.version) {
  console.error(`Codex plugin version ${plugin.version} does not match @changedown/mcp version ${mcp.version}`);
  process.exit(1);
}
if (arg !== `@changedown/mcp@${plugin.version}`) {
  console.error(`codex.mcp.json pins ${arg || '<missing>'}; expected @changedown/mcp@${plugin.version}`);
  process.exit(1);
}
console.log('ok');
NODE
); then
  echo "$CODEX_MCP_VERSION_CHECK"
  exit 1
fi
if [ "$CODEX_MCP_VERSION_CHECK" != "ok" ]; then
  echo "$CODEX_MCP_VERSION_CHECK"
  exit 1
fi
cp changedown-plugin/codex.mcp.json "$PLUGIN_DIR/"
cp changedown-plugin/hooks/hooks.json "$PLUGIN_DIR/hooks/"
cp -R changedown-plugin/skills "$PLUGIN_DIR/"
# Core + cli inside plugin (so cached copy is self-contained)
cp -R "$BUNDLE_DIR/core" "$PLUGIN_DIR/"
cp -R "$BUNDLE_DIR/cli" "$PLUGIN_DIR/"
# MCP server inside plugin
mkdir -p "$PLUGIN_DIR/mcp-server"
cp packages/mcp/package.json "$PLUGIN_DIR/mcp-server/"
cp -R packages/mcp/dist "$PLUGIN_DIR/mcp-server/"
PKG_JSON="$PLUGIN_DIR/mcp-server/package.json" node -e "
const fs = require('fs');
const pPath = process.env.PKG_JSON;
const p = JSON.parse(fs.readFileSync(pPath, 'utf8'));
p.dependencies['@changedown/core'] = 'file:../core';
p.dependencies['@changedown/cli'] = 'file:../cli';
delete p.dependencies['changedown'];
fs.writeFileSync(pPath, JSON.stringify(p, null, 2));
"
(cd "$PLUGIN_DIR/mcp-server" && npm install --omit=dev --no-package-lock)
# Hooks-impl inside plugin
mkdir -p "$PLUGIN_DIR/hooks-impl"
cp changedown-plugin/hooks-impl/package.json "$PLUGIN_DIR/hooks-impl/"
cp -R changedown-plugin/hooks-impl/dist "$PLUGIN_DIR/hooks-impl/"
PKG_JSON="$PLUGIN_DIR/hooks-impl/package.json" node -e "
const fs = require('fs');
const pPath = process.env.PKG_JSON;
const p = JSON.parse(fs.readFileSync(pPath, 'utf8'));
p.dependencies['@changedown/core'] = 'file:../core';
p.dependencies['@changedown/cli'] = 'file:../cli';
delete p.dependencies['changedown'];
fs.writeFileSync(pPath, JSON.stringify(p, null, 2));
"
(cd "$PLUGIN_DIR/hooks-impl" && npm install --omit=dev --no-package-lock)
# Marketplace at bundle root (so "add ./changedown-install" works)
mkdir -p "$BUNDLE_DIR/.claude-plugin"
cat > "$BUNDLE_DIR/.claude-plugin/marketplace.json" << 'MKT'
{
  "name": "local",
  "owner": { "name": "ChangeDown" },
  "plugins": [
    {
      "name": "changedown",
      "source": "./plugin",
      "description": "Durable change tracking with reasoning for AI agents"
    }
  ]
}
MKT
mkdir -p "$BUNDLE_DIR/.agents/plugins"
cat > "$BUNDLE_DIR/.agents/plugins/marketplace.json" << 'MKT'
{
  "name": "hackerbara",
  "interface": {
    "displayName": "hackerbara"
  },
  "plugins": [
    {
      "name": "changedown",
      "source": {
        "source": "local",
        "path": "./plugin"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
MKT
echo "Claude Code and Codex plugin marketplaces ready"

echo ""
echo "=== Bundle created at: $BUNDLE_DIR ==="
echo "Contents:"
ls -la "$BUNDLE_DIR"
echo ""
echo "Cursor/VS Code: copy $BUNDLE_NAME to a repo, run ./$BUNDLE_NAME/setup-repo.sh"
echo "  Extension: cursor --install-extension $BUNDLE_DIR/changedown-vscode-${VSIX_VERSION}.vsix"
echo "Claude Code: cd into the bundle (or your repo that contains it), then:"
echo "  /plugin marketplace add ."
echo "  /plugin install changedown@local"
echo "  (Start Claude from a git repo to avoid known hang.)"
echo "  Codex local marketplace: .agents/plugins/marketplace.json"
echo "  Codex plugin root: plugin/.codex-plugin/plugin.json"
