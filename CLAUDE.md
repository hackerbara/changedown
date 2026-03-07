# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChangeTracks is a VS Code extension that brings track-changes functionality to markdown documents using CriticMarkup syntax. It provides inline decorations, smart view mode, change tracking, accept/reject workflows, navigation, and commenting.

## Build & Development

```bash
npm run build          # Build all packages
npm test               # Run tests
npm run lint           # Lint
npm run release        # Release orchestrator
npm run install:local  # Install extension + plugin locally
```

## Architecture

Monorepo: @changetracks/core (parser) → @changetracks/lsp-server → changetracks-vscode (VS Code extension) + changetracks-plugin/ (Claude Code MCP plugin)

See individual package README files for details.
