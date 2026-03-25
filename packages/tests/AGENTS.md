# Tests Package — @changetracks/tests

Unified test harness for all packages. Two tiers: Gherkin behavioral specs
and native unit tests. See the `changetracks-testing` skill for full guide.

## Build & Test

    npm run build                    # Build everything first (required)
    npm test -w @changetracks/tests  # Full suite (Vitest + Cucumber)

    # By runner
    cd packages/tests && npx vitest run           # Unit tests (core, lsp, engine, hooks, mcp)
    cd packages/tests && npx cucumber-js --config features/cucumber.mjs  # Behavioral features

    # VS Code extension tests
    cd packages/tests/vscode && npm run test:fast  # @fast (parser, <1s)
    cd packages/tests/vscode && npm run test:slow  # @slow (Playwright, ~30s)
    cd packages/tests/vscode && npm run test:gaps  # @coverage-gap witnesses

    # Single scenario
    cd packages/tests/vscode && npm run test:slow -- --tags '@J5'
    cd packages/tests/vscode && npm run test:slow -- --name 'tracks insertion'

## Directory Layout

    packages/tests/
    ├── core/       Vitest — parser, operations, utilities
    ├── engine/     Vitest — CLI engine tests
    ├── hooks/      Vitest — hook tests
    ├── lsp/        Vitest — LSP capability tests
    ├── mcp/        Vitest — MCP plugin tests
    ├── features/   Cucumber-js — core/engine/hooks/mcp behavioral specs (70 .feature files)
    │   └── steps/  Step definitions (52 files)
    └── vscode/     VS Code extension tests
        ├── features/   Cucumber-js — 111 .feature files (@fast, @slow, @visual, @wip)
        ├── fixtures/   Markdown test documents
        ├── journeys/   playwrightHarness.ts and multi-document workflows
        └── visual/     Golden baselines, actual screenshots, diff images

## Harness Patterns

- Use bridge commands (`executeCommandViaBridge`, `updateSettingDirect`, `getDocumentText`)
  instead of command palette — MRU fuzzy-match breaks command palette reliability
- `getDocumentText()` reads temp file IPC, not Monaco DOM
- `setCursorPosition()` uses `Control+G` (Go to Line), NOT `Meta+G` (that's Find Next)
- Polling: 200ms intervals, 3s timeout, timestamp validation for stale reads
- VS Code instances are shared per fixture file. Use `@destructive` tag for mutations.

## Test Output

Always capture output to `docs/findings/YYYY-MM-DD-description.txt`:
    npm run test:slow 2>&1 | tee docs/findings/YYYY-MM-DD-slow-suite-run.txt
Never pipe to `/tmp/` or discard — other agents need to read results.
