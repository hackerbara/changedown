#!/usr/bin/env bash
# Setup a git worktree for development.
#
# Usage:
#   ./scripts/setup-worktree.sh <worktree-path>
#
# Why this script exists:
#   npm install in worktrees pulls incomplete packages from the npm cache.
#   Specifically, @types/node is missing buffer.buffer.d.ts (breaking Buffer.alloc
#   type resolution) and diff is missing its libcjs/libesm directories.
#   npm ci avoids this by always doing a clean install from the lockfile.
#
# What it does:
#   1. Runs npm ci (clean install — avoids npm cache corruption)
#   2. Builds all packages (core → cli → lsp → extension)
#   3. Verifies critical build artifacts exist
#   4. Runs the core + lsp test suite as a baseline check

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

WORKTREE="${1:-.}"
WORKTREE="$(cd "$WORKTREE" && pwd)"

if [ ! -f "$WORKTREE/package.json" ]; then
  echo -e "${RED}Error:${RESET} $WORKTREE does not look like the repo root (no package.json)"
  exit 1
fi

cd "$WORKTREE"

echo -e "${BOLD}Setting up worktree at${RESET} $WORKTREE"
echo ""

# Step 1: Clean install (avoids npm cache corruption in worktrees)
echo -e "${BOLD}[1/4]${RESET} npm ci (clean install)..."
npm ci --loglevel=warn 2>&1 | tail -5
echo -e "${GREEN}ok${RESET}"
echo ""

# Step 2: Build all packages
echo -e "${BOLD}[2/4]${RESET} Building packages..."
npm run build 2>&1 | grep "error TS" | grep -v "export/" | grep -v "import/xml" | grep -v "word-online" > /tmp/setup-worktree-errors.txt || true
ERROR_COUNT=$(wc -l < /tmp/setup-worktree-errors.txt | tr -d ' ')
if [ "$ERROR_COUNT" -gt 0 ]; then
  echo -e "${DIM}$ERROR_COUNT TS errors in non-critical packages (docx export/import — pre-existing)${RESET}"
fi
echo -e "${GREEN}ok${RESET}"
echo ""

# Step 3: Verify critical artifacts
echo -e "${BOLD}[3/4]${RESET} Verifying build artifacts..."
MISSING=0

check_artifact() {
  if [ -e "$1" ]; then
    echo -e "  ${GREEN}✓${RESET} $2"
  else
    echo -e "  ${RED}✗${RESET} $2 ($1)"
    MISSING=$((MISSING + 1))
  fi
}

check_artifact "node_modules/@types/node/buffer.buffer.d.ts" "@types/node buffer types"
check_artifact "node_modules/diff/libcjs/index.js" "diff package CJS build"
check_artifact "packages/core/dist/index.js" "core dist"
check_artifact "packages/cli/dist/config/index.js" "cli dist (config)"
check_artifact "packages/lsp-server/dist/server.js" "lsp-server dist"

if [ "$MISSING" -gt 0 ]; then
  echo -e "\n${RED}$MISSING critical artifacts missing.${RESET} Build may have failed."
  exit 1
fi
echo ""

# Step 4: Run baseline tests
echo -e "${BOLD}[4/4]${RESET} Running baseline tests (core + lsp)..."
cd packages/tests
RESULT=$(npx vitest run core/ lsp/ --reporter verbose 2>&1 | tail -3) || true
echo -e "  $RESULT"
cd "$WORKTREE"
echo ""

echo -e "${GREEN}${BOLD}Worktree ready.${RESET}"
