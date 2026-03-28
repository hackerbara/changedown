#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-website.sh — Build and deploy website-v2 to the release repo
#
# Builds website-v2, clones the public release repo, copies the built
# site into docs/, shows a diff for review, and optionally commits + pushes.
# The release repo serves docs/ via GitHub Pages at changedown.com.
#
# Usage:
#   ./scripts/deploy-website.sh                  # Full interactive run
#   ./scripts/deploy-website.sh --dry-run         # Preview without pushing
#   ./scripts/deploy-website.sh --skip-build      # Skip build (use existing dist/)
#   ./scripts/deploy-website.sh --message "..."   # Custom commit message
#
# Prerequisites:
#   - gh CLI authenticated
#   - Node.js + npm installed
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
RELEASE_REPO="hackerbara/changedown"
RELEASE_URL="https://github.com/${RELEASE_REPO}.git"
DEV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBSITE_DIR="$DEV_ROOT/website-v2"
WORK_DIR="${TMPDIR:-/tmp}/changedown-website-deploy-$$"
DRY_RUN=false
SKIP_BUILD=false
COMMIT_MSG=""

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Parse args ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)    DRY_RUN=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --message)    COMMIT_MSG="$2"; shift 2 ;;
    --help|-h)
      head -16 "$0" | tail -11
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

step=0
total=7

banner() {
  step=$((step + 1))
  echo ""
  echo -e "${BOLD}[$step/$total] $1${RESET}"
  echo -e "${DIM}$(printf '%.0s─' {1..60})${RESET}"
}

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}!${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; }
info() { echo -e "  ${DIM}$1${RESET}"; }

confirm() {
  if $DRY_RUN; then
    info "DRY RUN — auto-yes: $1"
    return 0
  fi
  echo ""
  read -p "  $1 (y/N) " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  if [[ -d "$WORK_DIR" ]]; then
    info "Cleaning up $WORK_DIR"
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

echo ""
echo -e "${BOLD}═══ ChangeDown Website Deploy ═══${RESET}"
echo -e "${DIM}Source:   $WEBSITE_DIR${RESET}"
echo -e "${DIM}Target:   $RELEASE_REPO (docs/)${RESET}"
echo -e "${DIM}Live URL: https://changedown.com${RESET}"
if $DRY_RUN; then
  echo -e "${YELLOW}MODE: DRY RUN (no changes will be pushed)${RESET}"
fi

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1: Prerequisites
# ═════════════════════════════════════════════════════════════════════════════
banner "Checking prerequisites"

if ! command -v gh &>/dev/null; then
  fail "gh CLI not found — install from https://cli.github.com"
  exit 1
fi
if ! gh auth status &>/dev/null; then
  fail "gh CLI not authenticated — run: gh auth login"
  exit 1
fi
ok "gh CLI authenticated"

if ! command -v node &>/dev/null; then
  fail "node not found"
  exit 1
fi
ok "node $(node --version)"

if [[ ! -d "$WEBSITE_DIR" ]]; then
  fail "website-v2 directory not found at $WEBSITE_DIR"
  exit 1
fi
ok "website-v2 directory exists"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2: Build website-v2
# ═════════════════════════════════════════════════════════════════════════════
banner "Build website-v2"

if $SKIP_BUILD; then
  warn "Skipping build (--skip-build)"
  if [[ ! -d "$WEBSITE_DIR/dist" ]]; then
    fail "No dist/ directory found — run without --skip-build first"
    exit 1
  fi
else
  # Step 1: Build Preact app bundle (outputs to public/app/)
  info "Building Preact app bundle..."
  if (cd "$WEBSITE_DIR" && npx vite build); then
    ok "Vite build succeeded"
  else
    fail "Vite build failed"
    exit 1
  fi

  # Step 2: Build LSP worker (adds to public/app/)
  info "Building LSP worker..."
  if (cd "$WEBSITE_DIR" && node build-lsp-worker.mjs); then
    ok "LSP worker built"
  else
    fail "LSP worker build failed"
    exit 1
  fi

  # Step 3: Build Astro site (generates static HTML pages with SEO metadata)
  info "Building Astro site..."
  if (cd "$WEBSITE_DIR" && npx astro build); then
    ok "Astro build succeeded"
  else
    fail "Astro build failed"
    exit 1
  fi
fi

DIST_DIR="$WEBSITE_DIR/dist"
DIST_FILES=$(find "$DIST_DIR" -type f | wc -l | tr -d ' ')
DIST_SIZE=$(du -sh "$DIST_DIR" | cut -f1)
ok "dist/ ready: $DIST_FILES files, $DIST_SIZE"

# Ensure CNAME is in the build output (GitHub Pages needs this)
if [[ ! -f "$DIST_DIR/CNAME" ]]; then
  echo "changedown.com" > "$DIST_DIR/CNAME"
  ok "Added CNAME (changedown.com)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3: Clone release repo
# ═════════════════════════════════════════════════════════════════════════════
banner "Clone release repo"

mkdir -p "$WORK_DIR"
info "Cloning $RELEASE_URL → $WORK_DIR/release"
gh repo clone "$RELEASE_REPO" "$WORK_DIR/release" -- --depth=1
ok "Cloned ($(cd "$WORK_DIR/release" && git log --oneline -1))"

RELEASE_DIR="$WORK_DIR/release"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4: Replace docs/ with new website build
# ═════════════════════════════════════════════════════════════════════════════
banner "Update docs/ with new website build"

DOCS_DIR="$RELEASE_DIR/docs"
mkdir -p "$DOCS_DIR"

# Remove ONLY website build artifacts — preserve repo docs (public/, images/, v1/)
# These are the directories/files that the website build produces:
WEBSITE_ARTIFACTS=(
  "app"
  "content"
  "og-images"
  "index.html"
  "CNAME"
  "robots.txt"
  "sitemap-0.xml"
  "sitemap-index.xml"
  "favicon.svg"
  ".nojekyll"
)

for artifact in "${WEBSITE_ARTIFACTS[@]}"; do
  target="$DOCS_DIR/$artifact"
  if [[ -d "$target" ]]; then
    rm -rf "$target"
  elif [[ -f "$target" ]]; then
    rm -f "$target"
  fi
done

# Also clean up old v1 website assets (flat assets/ dir from before Astro restructure)
if [[ -d "$DOCS_DIR/assets" ]]; then
  rm -rf "$DOCS_DIR/assets"
fi

# Clean up old lsp-worker files from pre-Astro flat layout
rm -f "$DOCS_DIR/lsp-worker.js" "$DOCS_DIR/lsp-worker.js.map"

info "Cleaned old website artifacts from docs/ (preserved public/, images/, v1/)"

# Copy new build
rsync -a "$DIST_DIR/" "$DOCS_DIR/"
ok "Copied $DIST_FILES files to docs/"

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5: Verify no private content in deploy
# ═════════════════════════════════════════════════════════════════════════════
banner "Verify no private content in deploy"

LEAK_COUNT=0

# Check for old brand references in deployed files
OLD_REFS=$(grep -rl "super-critic\|SuperCritic\|super_critic" "$DOCS_DIR" \
  --include="*.js" --include="*.html" --include="*.css" --include="*.md" \
  2>/dev/null || true)
if [[ -n "$OLD_REFS" ]]; then
  fail "Old 'super-critic' references found in website build:"
  echo "$OLD_REFS" | while read f; do info "  ${f#$RELEASE_DIR/}"; done
  LEAK_COUNT=$((LEAK_COUNT + 1))
fi

# Check for personal identity leaks (Alex/Bernson/Abernson)
IDENTITY_LEAKS=$(grep -rli "Bernson\|Abernson\|alex\.c\.bernson\|alex@" "$DOCS_DIR" \
  --include="*.js" --include="*.html" --include="*.css" --include="*.md" \
  --include="*.json" \
  2>/dev/null || true)
if [[ -n "$IDENTITY_LEAKS" ]]; then
  fail "Personal identity leaked in website build:"
  echo "$IDENTITY_LEAKS" | while read f; do info "  ${f#$RELEASE_DIR/}"; done
  LEAK_COUNT=$((LEAK_COUNT + 1))
fi

# PII blocklist content scan
BLOCKLIST="$DEV_ROOT/.pii-blocklist"
if [[ -f "$BLOCKLIST" ]]; then
  info "Scanning website build against PII blocklist..."
  while IFS= read -r term || [[ -n "$term" ]]; do
    [[ "$term" =~ ^#.*$ || -z "$term" ]] && continue
    hits=$(grep -rli "$term" "$DOCS_DIR" \
      --include="*.js" --include="*.html" --include="*.css" --include="*.md" \
      --include="*.json" \
      2>/dev/null || true)
    if [[ -n "$hits" ]]; then
      fail "PII term '$term' found in website build:"
      echo "$hits" | while read f; do info "  ${f#$RELEASE_DIR/}"; done
      LEAK_COUNT=$((LEAK_COUNT + 1))
    fi
  done < "$BLOCKLIST"
  ok "PII blocklist scan complete"
else
  info "No .pii-blocklist found — skipping content scan"
fi

# Unexpected author pattern scan
ALLOWED_AUTHORS="@alice|@bob|@carol|@eve|@dave|@robert|@copy-editor|@tech-reviewer|@ai:claude"
AUTHOR_HITS=$(grep -rPo '@[a-z]+(-[a-z]+)*(?=[ |])' "$DOCS_DIR" \
  --include="*.md" --include="*.js" --include="*.html" \
  2>/dev/null \
  | grep -vE "$ALLOWED_AUTHORS" || true)
if [[ -n "$AUTHOR_HITS" ]]; then
  warn "Unexpected author patterns in website build (review for PII):"
  echo "$AUTHOR_HITS" | sort -u | while read f; do info "  $f"; done
fi

if [[ $LEAK_COUNT -eq 0 ]]; then
  ok "No private content leaked"
else
  fail "$LEAK_COUNT leak(s) detected — aborting"
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
# STEP 6: Show diff and commit
# ═════════════════════════════════════════════════════════════════════════════
banner "Review changes"

cd "$RELEASE_DIR"
git add -A -- docs/

STAT=$(git diff --cached --stat -- docs/)
if [[ -z "$STAT" ]]; then
  ok "No changes — website is already up to date"
  echo ""
  echo -e "${GREEN}${BOLD}Nothing to do!${RESET}"
  exit 0
fi

echo "$STAT"
echo ""

ADDED=$(git diff --cached --name-only --diff-filter=A -- docs/ | wc -l | tr -d ' ')
MODIFIED=$(git diff --cached --name-only --diff-filter=M -- docs/ | wc -l | tr -d ' ')
DELETED=$(git diff --cached --name-only --diff-filter=D -- docs/ | wc -l | tr -d ' ')

echo -e "  ${GREEN}+$ADDED added${RESET}  ${DIM}~$MODIFIED modified${RESET}  ${RED}-$DELETED deleted${RESET}"

if [[ -z "$COMMIT_MSG" ]]; then
  DEV_SHA=$(cd "$DEV_ROOT" && git rev-parse --short HEAD)
  COMMIT_MSG="deploy: website-v2 (${DEV_SHA})"
  info "Default commit message: $COMMIT_MSG"
  if ! $DRY_RUN; then
    echo ""
    read -p "  Custom message (Enter to use default): " CUSTOM_MSG
    if [[ -n "$CUSTOM_MSG" ]]; then
      COMMIT_MSG="$CUSTOM_MSG"
    fi
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# STEP 7: Commit and push
# ═════════════════════════════════════════════════════════════════════════════
banner "Deploy"

if ! confirm "Commit and push to $RELEASE_REPO?"; then
  warn "Aborted. Release clone at: $WORK_DIR/release"
  trap - EXIT
  exit 0
fi

cd "$RELEASE_DIR"
git config user.name "hackerbara"
git config user.email "hackerbara@users.noreply.github.com"
git commit -m "$COMMIT_MSG"
ok "Committed"

if $DRY_RUN; then
  warn "DRY RUN — not pushing"
  info "Release clone at: $WORK_DIR/release"
  trap - EXIT
  exit 0
fi

git push origin main
ok "Pushed to $RELEASE_REPO"

echo ""
echo -e "${GREEN}${BOLD}═══ Website deployed! ═══${RESET}"
echo ""
echo -e "  ${DIM}Live at: https://changedown.com${RESET}"
echo -e "  ${DIM}GitHub Pages may take 1-2 minutes to update${RESET}"
echo ""
