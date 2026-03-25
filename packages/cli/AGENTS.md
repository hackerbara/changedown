# AGENTS.md — packages/cli

## What This Package Is

`packages/cli` is the `changetracks` npm package — the central agent-facing and
user-facing CLI. It exposes two bin entries and a shared engine layer that the
MCP server and LSP server consume.

## Bin Entries

| Command | Entry | Purpose |
|---------|-------|---------|
| `ctrk` | `dist/index.js` | Main CLI: agent commands, user commands, git diff driver |
| `changetracks` | `dist/cli-init.js` | Setup wizard only (`changetracks init`) |

The `ctrk` entry routes at startup:
1. **Git diff driver** — 7-arg invocation with 40-char hash at position 2; renders colored diff for `git diff --ext-diff`
2. **User commands** — first arg is one of `status | list | diff | settle | publish | import | export | --help | --version`; human-facing, prints to stdout
3. **Agent commands** — all other first args; routes through `runAgentCommands()` → `runCommand()` in `cli-runner.ts`

## Engine Layer (`src/engine/`)

Exported as `changetracks/engine`. Consumed by: MCP server (`changetracks-plugin/mcp-server/`), LSP server (config only via `changetracks/config`).

### Key components

**`ConfigResolver`** (`engine/config-resolver.ts`) — Session-scoped, lazy per-file config loader. Walks up from each file path to find `.changetracks/config.toml`, caches by project root, file-watches for live reload. In MCP: one instance per stdio session. In `ctrk` CLI: one instance per command invocation, disposed after via `resolver.dispose()`.

**`SessionState`** (`engine/state.ts`) — Per-session ID counter and hash registry. Tracks `ct-N` ID allocation per file, manages change groups (`ct-N.M`), records per-line hashes for staleness detection, tracks last-read view for coordinate validation. Note: a stripped-down fork lives at `packages/opencode-plugin/src/state.ts`; a comment in `state.ts` explains the divergence.

**Handlers** (`engine/handlers/`) — 16 exported `handleXxx` functions plus 4 utility files. All handlers share the signature:

```typescript
(args: Record<string, unknown>, resolver: ConfigResolver, state: SessionState)
  => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
```

This is the MCP tool result format. The CLI wraps results via `handlerToCliResult()` in `cli-output.ts`.

**Tool schemas** (`engine/tool-schemas.ts`) — Two `propose_change` schemas, selected based on protocol mode from `.changetracks/config.toml`:
- `classicProposeChangeSchema` — `old_text`/`new_text` text matching
- `compactProposeChangeSchema` — `at` (LINE:HASH coordinate) + `op` (CriticMarkup expression)

## The 6-Tool MCP Surface

`getListedTools()` / `getListedToolsWithConfig()` in `engine/listed-tools.ts`:

1. `read_tracked_file` — Read with hashline coordinates and view projection
2. `propose_change` — Propose 1-N tracked changes (schema selected by protocol mode)
3. `review_changes` — Accept/reject, batch reviews, thread responses, settle
4. `amend_change` — Revise own proposed change
5. `list_changes` — Change inventory with detail levels + batch ID lookup
6. `supersede_change` — Atomically reject + re-propose a change

Additional handlers exist for backward compatibility but are not in the listed surface: `raw_edit`, `get_tracking_status`, `propose_batch`, `respond_to_thread`, `list_open_threads`, `begin/end_change_group`, `review_change` (singular).

## Adding a New Operation (4 Steps)

1. Write handler in `src/engine/handlers/my-operation.ts` with the signature above
2. Export from `src/engine/index.ts`
3. Add entry in `src/agent-command-registry.ts` to expose via `ctrk my-operation`
4. Add to `CallToolRequestSchema` handler in `changetracks-plugin/mcp-server/src/index.ts`

The `schema-executor.ts` layer builds Commander commands at runtime from declarative `CommandDef` objects — use it rather than writing Commander boilerplate directly.

## Key Files

| File | Role |
|------|------|
| `src/index.ts` | `ctrk` bin entry; 3-path routing |
| `src/cli-init.ts` | `changetracks` bin entry; init-only |
| `src/cli-runner.ts` | Agent command bootstrap: ConfigResolver + SessionState setup |
| `src/agent-command-registry.ts` | Maps `ctrk <cmd>` names to handlers |
| `src/schema-executor.ts` | Generic Commander-based execution layer |
| `src/engine/index.ts` | Engine barrel export |
| `src/engine/config-resolver.ts` | ConfigResolver |
| `src/engine/state.ts` | SessionState |
| `src/engine/listed-tools.ts` | 6-tool MCP surface; protocol-mode schema selection |
| `src/engine/tool-schemas.ts` | classic + compact propose_change schemas |
| `src/engine/handlers/` | 16 handler functions + 4 utilities |
| `src/config/` | Config TOML parsing (`changetracks/config` export) |
| `src/init/` | Setup wizard logic (`changetracks init`) |

## Config System (`src/config/`)

Reads `.changetracks/config.toml`. Exported as `changetracks/config`. The LSP server imports only `parseConfigToml` and `DEFAULT_CONFIG` from this path — it does not use the engine handlers.

## Init System (`src/init/`)

`init/runner.ts` implements `runInit()`:
- **Non-interactive** (`--yes`): reads `--author`, `--agents`, `--policy` flags, generates config, copies examples, configures detected agents
- **Interactive** (`@clack/prompts`): 7-step wizard (author, tracking scope, policy mode, author enforcement, reasoning requirement, agent detection, advanced settings)

Auto-detects Claude Code, Cursor, OpenCode and writes appropriate MCP config files.

## Build

```bash
npm run build        # From repo root — builds all packages in dependency order
tsc -p tsconfig.json # From packages/cli — TypeScript only
```

Build order: `core → docx → cli → lsp-server → vscode-extension`

## Dependencies

- `@changetracks/core` — parser, operations, matching cascade
- `@changetracks/docx` — DOCX import/export
- `commander` — CLI argument parsing
- `@clack/prompts` — interactive init wizard UI
