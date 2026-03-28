# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChangeDown is a VS Code extension that brings track-changes functionality to markdown documents using CriticMarkup syntax. It provides inline decorations, smart view mode, change tracking, accept/reject workflows, navigation, and commenting.

## Build & Development

```bash
npm run build          # Build all packages
npm test               # Run tests
npm run lint           # Lint
npm run release        # Release orchestrator
npm run install:local  # Install extension + plugin locally
```

## Architecture

Monorepo: @changedown/core (parser) → @changedown/lsp-server → changedown-vscode (VS Code extension) + changedown-plugin/ (Claude Code MCP plugin)

See individual package README files for details.

## Testing

Three test tiers with Cucumber BDD:

| Tier | Tag | What it tests | Speed |
|------|-----|--------------|-------|
| @fast | Parser, core logic | In-process, no VS Code | <5s |
| @slow | UI, decorations, panels | Playwright + VS Code Electron | ~4-10s/scenario |
| @visual | Screenshot regression | Pixel comparison vs golden baselines | ~5-15s/scenario |

```bash
npm test                # All non-@wip tests
npm run test:core       # Core unit tests (vitest + mocha)
npm run test:ext        # Extension Cucumber features

# From packages/tests/vscode/:
npm run test:fast       # @fast tier only
npm run test:slow       # @slow tier (Playwright)
npm run test:visual     # Visual regression
npm run test:gaps       # @coverage-gap RED phase witnesses

# Filter by tag or name:
npm run test -w @changedown/tests-vscode -- --tags '@D1'
npm run test -w @changedown/tests-vscode -- --name 'First impressions'
```

Test fixtures in `packages/tests/vscode/fixtures/`. Feature files in `packages/tests/vscode/features/`.
