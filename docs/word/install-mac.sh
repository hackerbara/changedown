#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${CHANGEDOWN_WORD_BASE_URL:-https://changedown.com/word}"
BASE_URL="${BASE_URL%/}"
ADDIN_ID="a3f7c142-84b2-4e9d-b031-cd2e7f85a301"
LOCAL_DEV_ADDIN_ID="d3b6b0d7-c5e8-4a81-8d9f-9d8cf7e6d051"
KNOWN_ADDIN_IDS=("$ADDIN_ID" "$LOCAL_DEV_ADDIN_ID")
STATE_DIR="${CHANGEDOWN_WORD_STATE_DIR:-$HOME/.changedown/word}"
WEF_DIR="$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
MANIFEST_PATH="$STATE_DIR/manifest.remote.xml"
LAUNCH_PATH="$STATE_DIR/ChangeDown-Launch.docx"
WEF_MANIFEST_PATH="$WEF_DIR/$ADDIN_ID.manifest.remote.xml"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer is for macOS. Use install-windows.ps1 on Windows." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

mkdir -p "$STATE_DIR" "$WEF_DIR"

download() {
  local url="$1"
  local target="$2"
  local tmp="$target.tmp.$$"
  curl -fsSL "$url" -o "$tmp"
  mv "$tmp" "$target"
}

cleanup_existing_manifests() {
  local ids_pattern
  ids_pattern="$(IFS='|'; echo "${KNOWN_ADDIN_IDS[*]}")"

  rm -f "$WEF_MANIFEST_PATH"

  local manifest
  for manifest in "$WEF_DIR"/*.xml; do
    [[ -e "$manifest" ]] || continue
    if grep -Eql "$ids_pattern" "$manifest" 2>/dev/null; then
      printf 'Removing old ChangeDown sideload manifest: %s\n' "$manifest"
      rm -f "$manifest"
    fi
  done
}

echo "Installing ChangeDown remote Word pane..."
cleanup_existing_manifests
download "$BASE_URL/manifest.remote.xml" "$MANIFEST_PATH"
download "$BASE_URL/ChangeDown-Launch.docx" "$LAUNCH_PATH"

if ! ln "$MANIFEST_PATH" "$WEF_MANIFEST_PATH" 2>/dev/null; then
  cp "$MANIFEST_PATH" "$WEF_MANIFEST_PATH"
fi

printf 'Registered manifest: %s\n' "$WEF_MANIFEST_PATH"
printf 'Opening launcher document: %s\n' "$LAUNCH_PATH"
open "$LAUNCH_PATH"
