---
name: testing
description: How to write and run tests in the ChangeDown monorepo. Use before writing any test code.
---

# ChangeDown Testing Guide

## Two-Tier Testing Model

This project follows Paul Duvall's ATDD two-tier model:

**Tier 1 — Gherkin (behaviors):** Every user-facing capability has a `.feature` file. Write the feature file FIRST, then implement. This is the behavioral contract.

**Tier 2 — Native (edge cases):** Parser permutations, data-driven matrices, and internal function tests use `.test.ts` files with Mocha or Vitest. These cover exhaustive edge cases that don't need Gherkin ceremony.

**Rule:** No implementation without a corresponding behavioral spec. Write the `.feature` file first.

## Decision Tree

```
Is this a user-facing behavior, capability, or flow?
  YES → Write a .feature file FIRST
    VS Code extension behavior? → @slow tag, packages/tests/vscode/features/
    Core/engine/hooks/mcp behavior? → packages/tests/features/
  NO → Edge-case matrix or internal function test?
    YES → .test.ts file (Mocha for core/lsp, Vitest for engine/mcp/hooks)
    NO → Does this test need to exist?
```

## Directory Map

| What | Where | Runner |
|------|-------|--------|
| Core behavioral features | `packages/tests/features/core/*.feature` | cucumber-js |
| Engine behavioral features | `packages/tests/features/engine/*.feature` | cucumber-js |
| Hooks behavioral features | `packages/tests/features/hooks/*.feature` | cucumber-js |
| MCP journey features | `packages/tests/features/journeys/*.feature` | cucumber-js |
| MCP operation features | `packages/tests/features/ops/*.feature` | cucumber-js |
| VS Code extension features | `packages/tests/vscode/features/*.feature` | cucumber-js + Playwright |
| Core unit tests | `packages/tests/core/*.test.ts` | Mocha |
| Engine unit tests | `packages/tests/engine/*.test.ts` | Vitest |
| LSP unit tests | `packages/tests/lsp/*.test.ts` | Mocha |
| MCP unit tests | `packages/tests/mcp/*.test.ts` | Vitest |
| Hooks unit tests | `packages/tests/hooks/*.test.ts` | Vitest |
| Step definitions (core) | `packages/tests/features/steps/` | — |
| Step definitions (vscode) | `packages/tests/vscode/features/steps/` | — |

## Search Before You Create

Before writing a new step definition → grep existing `steps/` directories for similar patterns.
Before creating a helper function → check `packages/tests/vscode/journeys/playwrightHarness.ts`.
Before adding a bridge command → check `packages/vscode-extension/src/commands/test-commands.ts`.

## VS Code Extension Testing

VS Code extension tests use Playwright to control an Electron instance. The harness has specific patterns that MUST be followed:

**Bridge commands (use these, not command palette):**
- `executeCommandViaBridge(page, 'changedown.commandName')` — reliable command execution
- `updateSettingDirect(page, key, value)` — write to settings.json directly
- `getDocumentText(page, { instanceId })` — reads temp file IPC, not Monaco DOM
- `queryPanelState(page)` — reads panel state via bridge (local helper in panel.steps.ts)

**NEVER do these:**
- NEVER use `executeCommand()` via command palette (MRU fuzzy-match breaks)
- NEVER use command palette for settings changes
- NEVER read Monaco DOM directly for document text
- NEVER probe webview iframe DOM for panel state

**Polling pattern:** 200ms intervals, 3s timeout, timestamp validation for stale reads.

**Instance batching:** VS Code instances are shared per fixture file across scenarios. Use `@destructive` tag for scenarios that modify fixture files.

**Existing bridge commands in test-commands.ts:**
`_testQueryPanelState`, `_testGetDocumentText`, `_testResetDocument`, `_testExecuteCommand`, `_testPasteClipboard`, `_testUpdateSetting`, `_testWaitForChanges`, `_testGetCursorPosition`

## Test Output Persistence

ALWAYS capture test output to a dated file in `docs/findings/`:

```bash
# Correct — output is saved for other agents to analyze
npm run test:slow 2>&1 | tee docs/findings/YYYY-MM-DD-slow-suite-run.txt

# WRONG — output lost, forces expensive re-run
npm run test:slow
npm run test:slow | tail -5
npm run test:slow > /tmp/results.txt
```

Other agents need to read results without re-running a 5-minute suite. Never pipe to `/tmp/` (cleared on reboot) or discard output.

## Cross-Package Verification

When a change touches shared code, verify across surfaces:

| Changed | Also run |
|---------|----------|
| Core parser | MCP journey features + VS Code `@fast` + `@slow` decoration scenarios |
| Footnote format | Core features + MCP propose/review journeys + VS Code accept/reject |
| Decoration logic | VS Code `@slow` D1-D9 + visual regression |
| Hook behavior | Hooks features H1-H5 + VS Code tracking scenarios |
| Status/metadata chain | Review panel scenarios + hover scenarios + MCP read features |

Run the affected cross-package scenarios, not just the unit tests in the package you changed.

## Run Commands

```bash
# Build everything first (always)
npm run build

# Core/engine/hooks/mcp cucumber features
cd packages/tests && /usr/bin/env npx cucumber-js --config features/cucumber.mjs

# VS Code @fast (parser, in-process, <1s)
cd packages/tests/vscode && npm run test:fast

# VS Code @slow (Playwright + VS Code, 3-5 min)
cd packages/tests/vscode && npm run test:slow

# Single scenario by tag
cd packages/tests/vscode && npm run test:slow -- --tags '@J5'

# Single scenario by name
cd packages/tests/vscode && /usr/bin/env npx cucumber-js --config features/cucumber.mjs --name 'tracks insertion'

# Unit tests
cd packages/tests && npm run test:vitest   # engine/mcp/hooks
cd packages/tests && npm run test:mocha    # core/lsp

# ALWAYS tee output for other agents
npm run test:slow 2>&1 | tee docs/findings/YYYY-MM-DD-description.txt
```
