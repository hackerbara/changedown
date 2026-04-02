<!-- changedown.com/v1: untracked -->
# Install

## Paste this first (any agent)

Copy everything in the box below into your coding agent. It should **ask you what you use** before installing anything — then follow only the sections that match.

```
You are helping me install Changedown (markdown track changes with CriticMarkup).

First, ask me to confirm my environments:
- Editors: e.g. VS Code, Cursor, JetBrains, Neovim, other, or none (agents only).
- AI / agent surfaces: e.g. Claude Code, OpenCode, Cursor’s agent, a generic MCP client (Claude Desktop, another IDE), or none.

Rules:
- If I use Claude Code, follow the page section: run `/plugin marketplace add hackerbara/changedown` first, then `/plugin install changedown@hackerbara`. Do not add a separate MCP server for Claude Code unless I explicitly want a duplicate or custom setup — the plugin already bundles MCP.
- If I use OpenCode, install the Changedown OpenCode plugin (npm package in opencode.json). Do not add a separate MCP entry for the same project unless I already have one and know why — the plugin wires the Changedown MCP server for me.
- If I use an editor with a Changedown extension (VS Code marketplace: changedown.changedown-vscode), install that for the human editing experience. Cursor and other VS Code–compatible editors use the same marketplace entry where available.
- If I rely on a generic MCP host only (no Changedown plugin), use the standalone MCP block from the page: package @changedown/mcp, binary changedown-mcp (npx). Do not invent package names.

Ask me which repositories I want to track markdown in, then run: npx changedown init (project config) in those repositories. That is separate from editor and agent install steps.

Work through the page sections in a sensible order for my answers; skip what does not apply.
```

---

## Plugins vs standalone MCP

| You install | What you get | Also install MCP separately? |
|-------------|----------------|-----------------------------|
| **Changedown plugin for Claude Code** | MCP tools, hooks, and skill as shipped by the plugin | **No** — duplicate MCP is unnecessary unless you have a special case. |
| **`@changedown/opencode-plugin` in OpenCode** | Plugin hooks plus the Changedown MCP server wired in OpenCode | **No** for normal use — the plugin registers MCP. |
| **VS Code / Cursor extension** | Editor UI, LSP client to **`@changedown/lsp-server`** | **No MCP in the editor** for the same job — agents use MCP or plugins separately. |
| **Neither plugin — only an MCP-capable app** | — | **Yes** — use the **Standalone MCP** section. |

---

## Project setup (run in every repo)

Changedown’s project config lives next to your markdown. **Run this in each repository** where you want tracking:

```bash
npx changedown init
```

This creates `.changedown/config.toml`, examples, and gitignore updates. It does **not** install editors, plugins, or MCP — those are global or per-tool steps above.

---

## VS Code family (VS Code, Cursor, and compatible editors)

**Marketplace:** Extensions panel → search **Changedown** → install **Changedown** by **changedown**.

**Direct link:** [Visual Studio Marketplace — Changedown](https://marketplace.visualstudio.com/items?itemName=changedown.changedown-vscode)

**CLI install (VS Code):**

```bash
code --install-extension changedown.changedown-vscode
```

You get tracking mode, smart view, accept/reject, comments, review panel, and the language server driving the Markdown workflow. **Cursor** and other editors that use the Open VSX / VS Code marketplace can install the same listing when it is available there.

---

## Claude Code

Install the **Changedown plugin** — it includes MCP, hooks, and the Changedown skill; **you do not need a separate MCP install** for Claude Code for the default setup.

In Claude Code, **register the marketplace first**, then **install the plugin** (order matters):

```
/plugin marketplace add hackerbara/changedown
```

```
/plugin install changedown@hackerbara
```

Restart Claude Code if it asks you to, then run **`npx changedown init`** in each repo you work in (see **Project setup**).

---

## OpenCode

Install the **npm plugin** — it registers hooks and **wires the Changedown MCP server** for you. **Do not duplicate** a raw `changedown` MCP block unless you are debugging or overriding — the plugin merges MCP from **`@changedown/mcp`**.

Add the plugin to **project** `opencode.json` (repository root) **or** **global** `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@changedown/opencode-plugin"]
}
```

OpenCode loads npm plugins per [OpenCode’s plugin docs](https://open-code.ai/en/docs/plugins) (typically Bun-cached from npm — no separate `npm install` of the plugin in your project). Use the **project** config when this repo should always load Changedown; use **global** config when you want Changedown in every OpenCode project.

Some OpenCode UIs only show MCP entries that appear in the static config file. If **Changedown** does not appear under MCP until you add it, the plugin README in the repo describes merging an explicit `mcp.changedown` entry — follow that if your OpenCode version needs it.

Then run **`npx changedown init`** in each repo (see **Project setup**).

---

## Standalone MCP (generic host)

Use this when **no** Changedown plugin applies (e.g. Claude Desktop, another MCP-capable IDE, or a custom integration) **or** when your host only speaks MCP over stdio.

Package **`@changedown/mcp`**, binary **`changedown-mcp`**:

```text
npx -y --package @changedown/mcp changedown-mcp
```

Example host config (field names vary by app):

```json
{
  "mcpServers": {
    "changedown": {
      "command": "npx",
      "args": ["-y", "--package", "@changedown/mcp", "changedown-mcp"]
    }
  }
}
```

If the client supports MCP **roots**, the server uses them for paths. Otherwise set **`CHANGEDOWN_PROJECT_DIR`** to your project root, or rely on **`PWD`** / cwd.

**Tools** (seven): `read_tracked_file`, `propose_change`, `review_changes`, `amend_change`, `list_changes`, `supersede_change`, `resolve_thread`.

---

## Developing Changedown from a git clone

This path is for **contributors** and people running unreleased bits — not for normal npm/marketplace installs.

1. Clone the repo and install dependencies per the repository `README`.
2. Build: `node scripts/build.mjs` (or the repo’s documented build).
3. Optional full dev install: `node scripts/install.mjs` — installs the local VSIX, global CLI from the repo, Cursor MCP pointing at **built files under the clone**, Claude plugin registration, hooks, and skills. Details live in `scripts/install.mjs` and the repo docs.

End users should prefer marketplace, `npx changedown init`, plugins, or standalone MCP — not this flow.

---

## Core library and LSP

**Parser and engine** (build your own tools on top of the format):

```bash
npm install @changedown/core
```

**Language server** — the **most direct server-shaped consumer** of core for editor integrations (diagnostics, code actions, custom protocol). The VS Code extension talks to this server; other editors can spawn it the same way:

```bash
npm install @changedown/lsp-server
```

Binary: **`changedown-lsp`** (stdio LSP). Wire it in your editor’s LSP settings for Markdown when you are **not** using the Changedown extension but want server features.

For most people, **install the Changedown extension** instead of hand-wiring the LSP.
