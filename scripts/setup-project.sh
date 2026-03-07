#!/usr/bin/env bash
# @deprecated — Use `npx changetracks init` instead. This script will be removed in a future release.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/setup-project.mjs" "$@"
