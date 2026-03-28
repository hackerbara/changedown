# AGENTS.md — ChangeDown

## What This Is

ChangeDown brings track-changes to markdown using CriticMarkup syntax.
A VS Code extension with inline decorations, accept/reject workflows,
navigation, commenting, and smart view mode. Activates on markdown files.

## Quick Start

    npm run build              # Full build (all packages, in dependency order)
    npm run compile            # TypeScript only (fast, ~2s)
    npm run lint               # ESLint on core and vscode-extension
    npm test                   # Full test suite (~25s, launches VS Code)
    npm run test:fast          # Parser tests only (<1s, no VS Code)

## Package Layout

Packages consume each other in a strict dependency chain:

    ┌─────────────────────┐
    │  vscode-extension   │  UI: decorations, commands, panels, git integration
    └────────┬────────────┘
             │ LSP protocol (vscode-languageclient ↔ vscode-languageserver)
    ┌────────▼────────────┐
    │    lsp-server        │  CodeLens, diagnostics, hover, semantic tokens, change ops
    └────────┬────────────┘
             │ direct import
    ┌────────▼────────────┐
    │      core            │  Parser, operations, L2↔L3 conversion, matching cascade
    └─────────────────────┘

    config-types    Shared TypeScript types (consumed by all packages)
    docx            DOCX import/export (consumes core)
    cli             `cdown` bin + `changedown init` wizard; exports shared engine layer (consumes core + docx)
    tests           Cross-package integration tests (Playwright, Gherkin, Vitest)

    benchmarks      LLM quality harness — tests AI agents against MCP surface via OpenCode

    Other packages (cursor-preview, changedown-sublime, neovim-plugin,
    opencode-plugin) exist but are less actively developed.
    They inherit from root and get their own AGENTS.md when needed.

The extension communicates with core through the LSP server — it does not
import core directly for change operations. The LSP server is the
authoritative source for parsed changes, decoration data, and edit operations.

Each main package (core, vscode-extension, lsp-server, tests, cli) has its own
AGENTS.md with package-specific build, test, and architecture guidance.

## Architecture (Summary)

MVC with four layers. Full details in ARCHITECTURE.md.

    extension.ts                          → Entry point, registers commands
      └─ controller/ExtensionController   → State machine: tracking, view mode, events
           ├─ adapter/CriticMarkupAdapter → Single-pass O(n) tokenizer → ChangeNode[]
           ├─ model/VirtualDocument       → Data structures: ChangeNode, ChangeType, Range
           └─ view/EditorDecorator        → Decorations, delimiter hiding, cursor unfolding

Data flow: Parse (text → ChangeNode[]) → Coordinate (events, re-parse) → Render

## Documentation Map

| Location | Contents |
|----------|----------|
| ARCHITECTURE.md | System structure, package deps, data formats (L2/L3), matching cascade |
| docs/decisions/ | Architecture Decision Records (63 numbered ADRs) |
| docs/plans/ | Implementation plans (active and completed) |
| docs/superpowers/specs/ | Technical design specifications |
| docs/superpowers/plans/ | Implementation plans for superpowers features |
| docs/public/ | Public-facing docs, glossary, how-tos |
| docs/findings/ | Bug investigations, test results, research reports |

## Worktree Setup

`npm install` in git worktrees produces incomplete packages from npm's cache
(missing `@types/node/buffer.buffer.d.ts`, empty `diff/libcjs/`). This breaks
TypeScript compilation and test imports. Use `npm ci` instead, or run:

    ./scripts/setup-worktree.sh <worktree-path>

This runs `npm ci`, builds all packages, verifies artifacts, and runs baseline
tests. Agents creating worktrees should run this script after `git worktree add`.

## Contributing Conventions

- Build order is enforced: core → docx → cli → lsp-server → vscode-extension.
  Always `npm run build` from root before testing.
- Status fallback chain: `node.metadata?.status ?? node.inlineMetadata?.status ?? node.status`
  Three tiers, always. Using only `metadata?.status` is a recurring bug source.
- Never silently normalize unicode confusables (ADR-022/061). Diagnostic detection only.
- Single-pass parser invariant — do not introduce multiple passes in the tokenizer.
- Test output goes to `docs/findings/YYYY-MM-DD-description.txt`, never `/tmp/`.
  Other agents need to read results without re-running expensive suites.

## Skills

- `changedown-testing` — Activate before writing any test code. Covers the
  two-tier testing model, directory map, bridge commands, and run commands.
- `code-based-research` — Activate for deep research tasks. Guides progressive
  documentation checking, verification, and knowledge preservation.

## Commands & Keybindings

Alt+Cmd+T tracking, Alt+Cmd+Y accept, Alt+Cmd+N reject,
Alt+Cmd+] next, Alt+Cmd+[ previous, Alt+Cmd+/ comment.
Windows/Linux: Ctrl+Alt+ equivalents. All scoped to markdown.
