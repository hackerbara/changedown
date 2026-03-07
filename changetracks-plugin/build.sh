#!/usr/bin/env bash
# Build hooks-impl and mcp-server (esbuild bundles with all deps inlined).
# Claude Code's plugin cache only needs the bundled dist/ — no node_modules sync required.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
echo "Building hooks-impl..."
(cd hooks-impl && node esbuild.mjs)
echo "Building mcp-server..."
(cd mcp-server && node esbuild.mjs)
echo "Done. Restart Claude Code (or reinstall changetracks@local) to use latest."
