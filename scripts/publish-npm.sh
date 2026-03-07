#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "=== Publishing changetracks to npm ==="
echo ""

# Build first
npm run build

# Publish
cd packages/cli
echo "Package: $(node -p "require('./package.json').name")@$(node -p "require('./package.json').version")"
echo ""
read -p "Publish to npm? (y/N) " confirm
if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
  npm publish --access public
  echo "Published!"
else
  echo "Skipped."
fi
