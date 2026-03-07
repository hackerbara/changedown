# @changetracks/opencode-plugin

An OpenCode plugin that provides durable change tracking with CriticMarkup support for AI agents.

## Features

- **Change Tracking**: Track changes in markdown documents using CriticMarkup syntax
- **Review Workflow**: Propose, review, accept, and reject changes with full deliberation history
- **Smart Hooks**: Automatic interception of Edit/Write tools on tracked files
- **Change Groups**: Group related changes for batch acceptance/rejection
- **Threaded Discussions**: Comment on changes with nested discussion threads
- **Hashline Support**: Line-addressed editing with staleness detection
- **Plugin tools**: `propose_change`, `read_tracked_file`, `list_open_threads` (registered via OpenCode plugin API, not MCP)

## Installation

OpenCode loads plugins in two ways ([official docs](https://open-code.ai/en/docs/plugins)):

1. **From npm** — add the package name to the `plugin` array in your OpenCode config.
2. **From local files** — place a plugin file in `.opencode/plugins/` or `~/.config/opencode/plugins/`; OpenCode loads it at startup.

### Option A: From npm (when published)

1. Add the plugin to your OpenCode config. In **project** `opencode.json` (project root) or **global** `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@changetracks/opencode-plugin"]
}
```

2. OpenCode installs npm plugins with **Bun** at startup (cached in `~/.cache/opencode/node_modules/`). No separate `npm install` needed for the plugin itself.

### Option B: From source (monorepo)

1. Build the plugin and ensure the project has a **local plugin loader** so OpenCode can load it:

```bash
cd changetracks
npm install
npm run build:plugin-opencode
```

2. This repo includes **`opencode.json`** (project root), **`.opencode/plugins/changetracks.mjs`**, and **`.opencode/package.json`** with a `file:` dependency on `packages/opencode-plugin`. So OpenCode treats this repo as a project and loads `.opencode/plugins/`. OpenCode runs `bun install` in `.opencode/` at startup; to avoid first-run resolution errors, install once from project root: **`cd .opencode && bun install`**. Then **run OpenCode from the changetracks project root** (e.g. `opencode` or `opencode run "test"`). Plugins load when a **session** starts, not when you run `opencode --print-logs` (that only loads config and exits).

3. If you added `.opencode/` yourself: create `.opencode/plugins/changetracks.mjs` that exports the plugin (see that file in the repo), and in `.opencode/package.json` add `"@changetracks/opencode-plugin": "file:../packages/opencode-plugin"` (path relative to `.opencode/`).

## Configuration

Create `.changetracks/config.toml` in your project root:

```toml
[tracking]
enabled = true
default_track_new_files = false

[author]
enforcement = "optional"  # or "required"
default = "ai:your-model"

[hashline]
enabled = true
dual_hash = true

[globs]
track = ["docs/**/*.md", "README.md"]
ignore = ["**/node_modules/**", "**/.git/**"]
```

### Configuration Options

| Section | Option | Description |
|---------|--------|-------------|
| `tracking` | `enabled` | Master switch for change tracking |
| `tracking` | `default_track_new_files` | Auto-enable tracking for new files |
| `author` | `enforcement` | Whether author attribution is required |
| `author` | `default` | Default author identifier (used when agent omits `author` on tool calls) |
| `hashline` | `enabled` | Enable line-addressed editing |
| `hashline` | `dual_hash` | Show settled hash when CriticMarkup present |
| `globs` | `track` | Glob patterns for files to track |
| `globs` | `ignore` | Glob patterns for files to ignore |

## Verifying the plugin in OpenCode

The plugin adds the ChangeTracks MCP server via its **config** hook at runtime. The OpenCode TUI may show **MCPs as blank** if it only displays config from the config file (before plugin merge). To make the ChangeTracks MCP server appear in the TUI and in `opencode mcp list`, add it explicitly to your project’s **`opencode.json`** (see the repo root `opencode.json` for an example). The plugin will not override an existing `changetracks` entry. Verification is also done via **logs** and a **practical test**.

### 1. Confirm the plugin is in your config

- **npm**: You have `"plugin": ["@changetracks/opencode-plugin"]` in `opencode.json` (project or global).
- **From source**: You have `.opencode/opencode.json`, `.opencode/plugins/changetracks.js` (or `.mjs`), and `.opencode/package.json` with the local `file:../packages/opencode-plugin` dependency; run `cd .opencode && bun install` once so the plugin resolves.

### 2. Check that the plugin loaded (logs)

On startup the plugin logs that it loaded. OpenCode writes logs to **timestamped files** (not a single `opencode.log`):

- **macOS/Linux**: `~/.local/share/opencode/log/` — files like `2025-01-09T123456.log` (most recent 10 kept)
- **Windows**: `%USERPROFILE%\.local\share\opencode\log`

To view logs:

- **Easiest:** run a short session with logs in the terminal:  
  `opencode run "say hi" --print-logs`  
  Then look for `service=changetracks` or "ChangeTracks plugin loaded" in the output.

- **From the log directory:** OpenCode uses timestamped files (e.g. `2026-02-13T014615.log`). List the dir, then tail the newest file by name:
  ```bash
  ls -t ~/.local/share/opencode/log/
  tail -100 ~/.local/share/opencode/log/2026-02-13T014615.log   # use the newest filename from the list
  ```
  (Avoid storing `ls` output in a variable and passing it to `tail`/`grep` — some shells or aliases can inject extra text and break the path.)

Look for a line like **"ChangeTracks plugin loaded"** or a structured log entry with `service: "changetracks"`. If you see that, the plugin is loaded. **Plugins are only loaded when a session starts** (e.g. you run `opencode` or `opencode run "..."`), not when you run `opencode --print-logs` (that only loads config and exits). If you never see the message: (1) ensure you have **`opencode.json`** in the project root so OpenCode treats the repo as a project and loads `.opencode/`; (2) run **`cd .opencode && bun install`** once so the plugin dependency resolves; (3) start a real session from the project root and check the latest log file in `~/.local/share/opencode/log/`.

### 3. Practical check with a markdown file

1. Ensure `.changetracks/config.toml` exists and its `tracking.include` (or equivalent) includes some `.md` path (e.g. `["**/*.md"]`).
2. Create or open a tracked `.md` file (or add the tracking header `<!-- ctrcks.com/v1: tracked -->`).
3. In the chat, ask the agent to **edit** that file. If the file is tracked, the plugin’s `tool.execute.before` hook should trigger: you should get a **warning or block** about tracked files (depending on `hooks.enforcement` in config).
4. Ask the agent to **use propose_change** on that file. If the plugin is loaded, the agent can call the tool and the file will get CriticMarkup.

If the agent could edit tracked files with no warning, the plugin was not intercepting. The plugin intercepts OpenCode’s **lowercase** tool names (`edit`, `write`, `patch`, `multiedit`); earlier versions incorrectly checked for `Edit`/`Write` and never matched.

### 4. If something fails

Restart OpenCode and check the log directory (or run `opencode run "test" --print-logs`) for errors mentioning the plugin or `ChangeTracks`. See [OpenCode Troubleshooting](https://open-code.ai/en/docs/troubleshooting#logs) for log and storage paths.

### References (verified setup)

- [OpenCode Plugins](https://open-code.ai/en/docs/plugins) — official plugin docs (local `.opencode/plugins/` and npm `plugin` array).
- [OpenCode Troubleshooting — Logs](https://open-code.ai/en/docs/troubleshooting#logs) — log directory: `~/.local/share/opencode/log/` (timestamped files).
- [OpenCode Ecosystem — Plugins](https://open-code.ai/en/docs/ecosystem#plugins) — community plugin list and examples.

## Usage

### Basic Workflow

1. **Track a file** (adds tracking header):
   ```
   <!-- ctrcks.com/v1: tracked -->
   ```

2. **Read tracked file** with hashlines:
   ```
   read_tracked_file(file="docs/guide.md")
   ```
   Returns: `1:a3b|# Guide\n2:c4d|Content here...`

3. **Propose a change**:
   ```
   propose_change(
     file="docs/guide.md",
     old_text="Content here",
     new_text="Updated content",
     author="ai:your-model",
     reasoning="Clarified the explanation"
   )
   ```

4. **List open threads**:
   ```
   list_open_threads(file="docs/guide.md")
   ```

5. **Review and accept/reject**:
   ```
   review_change(file="docs/guide.md", change_id="ct-1", decision="accept")
   ```

### CriticMarkup Syntax

ChangeTracks uses CriticMarkup syntax for inline changes:

| Type | Syntax | Example |
|------|--------|---------|
| Insertion | `text` | `added text` |
| Deletion | `` | `` |
| Substitution | `new` | `after` |
| Highlight | `text` | `highlighted` |
| Comment | `` | `` |

Each change gets a footnote reference: `added`

### Hooks Behavior

The plugin registers four hooks with OpenCode:

1. **`tool.execute.before`**: Intercepts Edit/Write calls on tracked files
   - Wraps edits in CriticMarkup automatically
   - Prevents untracked modifications

2. **`tool.execute.after`**: Logs all edits for audit trail
   - Records what was changed and when

3. **`stop`**: Batch applies pending CriticMarkup at end of turn
   - Consolidates multiple changes
   - Updates footnotes and references

4. **`experimental.chat.system.transform`**: Auto-injects ChangeTracks rules
   - Adds skill context to system prompt
   - Ensures agents follow best practices

### MCP Tools

The plugin exposes three MCP tools:

#### `propose_change`

Propose a change to a tracked file.

```typescript
{
  file: string;           // Path to file
  old_text?: string;      // Text to replace (omit for insertion)
  new_text?: string;      // New text (omit for deletion)
  author?: string;        // Author identifier
  reasoning?: string;     // Explanation for the change
  insert_after?: string;  // Anchor for insertions
}
```

#### `read_tracked_file`

Read a file with hashline information.

```typescript
{
  file: string;           // Path to file
  show_hashlines?: boolean;  // Include hashline format
}
```

Returns content with line hashes for precise editing:
```
1:a3b|# Title
2:c4d|Paragraph text
```

#### `list_open_threads`

List all pending changes in a file.

```typescript
{
  file: string;  // Path to file
}
```

Returns array of open threads with metadata, status, and discussion.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Runtime                          │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  tool.execute │    │     stop      │    │system.transform│
│ before/after  │    │    (batch)    │    │  (rules injection)
└───────┬───────┘    └───────┬───────┘    └───────────────┘
        │                    │
        ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│              ChangeTracksPlugin (index.ts)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Hooks     │  │ MCP Tools   │  │   Config Manager    │  │
│  │  (4 hooks)  │  │(3 tools)    │  │  (.changetracks/)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   File Ops    │    │    State      │    │   Deduplication│
│  (track, read,│    │  (pending,    │    │   (change IDs) │
│   propose)    │    │   groups)     │    │                │
└───────────────┘    └───────────────┘    └───────────────┘
```

### Data Flow

1. **File Read**: `read_tracked_file` → parse hashlines → return with coordinates
2. **Change Proposal**: `propose_change` → validate → create CriticMarkup → stage
3. **Batch Apply**: `stop` hook → consolidate pending → write to file
4. **Discussion**: `list_open_threads` → parse footnotes → return thread metadata

## Development

### Setup

```bash
cd packages/opencode-plugin
npm install
```

### Build

```bash
# Build once
npm run build

# Watch mode
npm run watch
```

### Test

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Project Structure

```
packages/opencode-plugin/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── config.ts             # Configuration management
│   ├── state.ts              # Pending changes & groups state
│   ├── pending.ts            # Pending change operations
│   ├── dedup.ts              # Change ID deduplication
│   ├── file-ops.ts           # File I/O operations
│   ├── hooks/
│   │   ├── tool-execute-before.ts   # Intercept Edit/Write
│   │   ├── tool-execute-after.ts    # Log edits
│   │   ├── stop.ts                  # Batch apply changes
│   │   └── system-transform.ts      # Inject rules
│   ├── mcp/
│   │   ├── index.ts          # MCP tool exports
│   │   ├── propose-change.ts # propose_change tool
│   │   ├── read-tracked-file.ts # read_tracked_file tool
│   │   └── list-open-threads.ts # list_open_threads tool
│   ├── types/
│   │   └── opencode-plugin.ts # Type definitions
│   └── test/
│       ├── config.test.ts
│       ├── state.test.ts
│       ├── pending.test.ts
│       ├── dedup.test.ts
│       └── file-ops.test.ts
├── skills/
│   └── changetracks/
│       └── SKILL.md          # Agent instructions
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Integration with ChangeTracks Ecosystem

This plugin is part of the ChangeTracks monorepo:

- **`@changetracks/core`**: Core CriticMarkup parser and utilities
- **`@changetracks/lsp-server`**: Language server for editor integration
- **`@changetracks/vscode-extension`**: VS Code extension
- **`@changetracks/opencode-plugin`**: This OpenCode plugin

## License

MIT

## Contributing

Contributions welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/hackerbara/changetracks/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hackerbara/changetracks/discussions)
