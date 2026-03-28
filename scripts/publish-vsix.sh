#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "=== Publishing VS Code extension ==="
echo ""

# Build and package
npm run build

VSIX="packages/vscode-extension/changedown-vscode-$(node -p "require('./packages/vscode-extension/package.json').version").vsix"
if [[ ! -f "$VSIX" ]]; then
  echo "ERROR: .vsix not found at $VSIX"
  exit 1
fi
echo "Package: $VSIX"
echo ""

# VS Code Marketplace
read -p "Publish to VS Code Marketplace? (y/N) " confirm
if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
  cd packages/vscode-extension
  npx @vscode/vsce publish --no-dependencies --allow-missing-repository
  cd ../..
  echo "Published to VS Code Marketplace!"
else
  echo "Skipped VS Code Marketplace."
fi
echo ""

# Open VSX
read -p "Publish to Open VSX (for Cursor)? (y/N) " confirm
if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
  cd packages/vscode-extension
  npx ovsx publish --no-dependencies
  cd ../..
  echo "Published to Open VSX!"
else
  echo "Skipped Open VSX."
fi
