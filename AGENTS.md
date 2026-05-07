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

Build order: core → docx → cli → lsp-server → vscode-extension. Always build from
root (`npm run build`) — it handles the dependency chain automatically.

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

    changedown-plugin/mcp-server   Fixed-port leader-election MCP server; serves Word pane over HTTPS
    changedown-plugin/word-add-in  Word task pane (Observer, WordBackendImpl, PaneBackendClient)

    Other packages (cursor-preview, changedown-sublime, neovim-plugin,
    opencode-plugin) exist but are less actively developed.
    They inherit from root and get their own AGENTS.md when needed.

The extension communicates with core through the LSP server — it does not
import core directly for change operations. The LSP server is the
authoritative source for parsed changes, decoration data, and edit operations.

Each main package (core, vscode-extension, lsp-server, tests, cli) has its own
AGENTS.md with package-specific build, test, and architecture guidance.

Core exports platform-agnostic interfaces from `packages/core/src/host/`. The
website-v2 package is both a product and the reference implementation of the port
architecture. The VS Code extension uses the same pattern via BaseController.

## Word Add-In Transport (post-Tranche-5)

`changedown-plugin/mcp-server` uses a fixed-port leader-election model:
- First `changedown-mcp` instance to spawn binds `127.0.0.1:39990` HTTPS (host mode), serving the dev-cert chain from `~/.office-addin-dev-certs/`.
- Later spawns detect the held port and proxy their parent harness's stdio MCP traffic to the host over HTTPS (client mode).
- Word task pane connects once to `https://127.0.0.1:39990` via `fetch` + `EventSource`.
- Pane disconnect (SSE close) clears the `RemoteBackend` from `BackendRegistry` after a 5s grace window; reconnect re-registers automatically.
- Port frees when every harness-spawned `mcp-server` instance exits — no persistent service.
- `bridge-daemon` (`changedown-plugin/bridge-daemon/`) was deleted in Tranche 5.

## Architecture (Summary)

Hexagonal ports-and-adapters pattern. Full details in ARCHITECTURE.md.

**Core (shared):** parser, decoration plan builder, edit boundary state machine,
platform-agnostic services (`TrackingService`, `ReviewService`, `NavigationService`).

**Host integration:** `EditorHost` (inbound: platform → controller),
`DecorationPort` / `PreviewPort` (outbound: controller → platform).

    VS Code:   extension.ts → controller.ts → decorator.ts (applies decoration plans)
    Website:   App.tsx → WebsiteController → WebDecorationAdapter + WebPreviewAdapter

Data flow: Parse (text → ChangeNode[]) → Coordinate (events, re-parse) → Render

## BaseController SDK

`BaseController` (`packages/core/src/host/base-controller.ts`) is the composition-based
host integration layer. Hosts instantiate it with `ControllerConfig` rather than
extending a base class.

Key design properties:
- **Composition, not inheritance** — hosts pass a `ControllerConfig` object
- **LSP is optional** — `lsp` field is optional; omitting it uses `NULL_LSP_CONNECTION` for standalone use
- **FormatAdapter is required** — must provide `convertL2ToL3` / `convertL3ToL2` implementations
- **Hooks for extensibility** — `ControllerHooks` provides lifecycle callbacks without subclassing

`ControllerConfig` fields:
- `host: EditorHost` — required; wires document lifecycle and cursor events
- `decorationPort: DecorationPort` — required; receives decoration snapshots
- `previewPort?: PreviewPort` — optional; receives preview snapshots
- `lsp?: TypedLspConnection` — optional; omit for standalone (no server) mode
- `formatAdapter: FormatAdapter` — required; pluggable L2↔L3 conversion
- `parseAdapter?: ParseAdapter` — optional; pluggable parse delegation
- `defaultFormat?: 'L2' | 'L3'` — default format for new documents
- `defaultDisplay?: DisplayOptions` — default rendering options
- `hooks?: ControllerHooks` — lifecycle callbacks

`setViewMode()` is a deprecated facade. Prefer `setProjection()` + `setDisplay()`.

## Projection Model

Projection is the organizing model for what text content a port receives.

Three projections (`packages/core/src/model/types.ts`):
- **`current`** — text as authored with tracked changes visible (accepted text in place)
- **`decided`** — accepted changes resolved, rejected changes removed
- **`original`** — strip all tracked changes, show original text

`DisplayOptions` (`packages/core/src/host/types.ts`) controls how changes are rendered
within a projection: delimiter visibility, insertion/deletion style, author colors, filters.

`ViewMode` (`review` / `changes` / `settled` / `raw`) is the display-layer vocabulary
that maps to Projection + DisplayOptions via `VIEW_MODE_PRESETS`. It remains the
vocabulary for the LSP protocol and VS Code command surface.

`ProjectionService` (`packages/core/src/host/projection-service.ts`) computes and
caches projection results per URI+version+selector+display key.

## FormatService

`FormatService` (`packages/core/src/host/format-service.ts`) tracks per-URI format
state (L2 or L3) and centralizes format detection.

- `getDetectedFormat(uri, text)` — calls `isL3Format(text)` which is O(n) regex scan;
  Centralizes format detection — use this instead of calling `isL3Format()` directly.
- `getPreferredFormat(uri)` / `setPreferredFormat(uri, format)` — user preference override
- `promoteToL3(uri, text)` / `demoteToL2(uri, text)` — delegated via `FormatAdapter`
- Events: `onDidChangePreferredFormat`, `onDidCompleteTransition`

## PendingEditManager

`PendingEditManager` is now in `packages/core/src/host/pending-edit-manager.ts`
(moved from lsp-server). Exported from `@changedown/core/host`. The lsp-server
imports it from there; its own `src/pending-edit-manager.ts` is the old local copy
that will be removed in a future cleanup.

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

## Core Protocol Model Notes

For core algorithm review, revisit the 2026-05-06 protocol model and graphic map:

- `docs/findings/2026-05-06-changedown-protocol-model.md` — durable model of the
  implemented ChangeDown protocol: body projection, footnote operation log,
  L2/L3 conversion, anchor resolution, text matching, amend, supersede, scrub
  replay, stacking, compaction, and coherence caveats.
- `docs/findings/2026-05-06-changedown-protocol-design-map.md` — compact diagram
  and profile of the same model, including the algorithm spine, scrub replay,
  supersede, amend reality check, stacking profile, compaction profile, and risk
  seams.

Load-bearing frame from those notes: ChangeDown is a Markdown document whose
body is a materialized projection of an ordered operation log. The body is not
the whole truth; footnotes are operation records; scrub replay can reconstruct
intermediate states when local anchors fail. Keep explicit `supersedes:`
provenance separate from replay-computed `consumedBy` evidence, and remember
that the current `coherenceRate` is resolved-or-consumed anchor coherence rather
than a full final-body replay equality proof.

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

[^ct-1]: @unknown | 2026-04-13 | group | proposed
[^ct-1.1]: @unknown | 2026-04-13 | sub | proposed
