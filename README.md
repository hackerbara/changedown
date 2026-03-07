# ChangeTracks

Track changes in markdown — for humans and AI agents.

![ChangeTracks in VS Code — smart view with markdown preview and comment threads](docs/images/readme-deliberation.png)

ChangeTracks brings popular editor-style track changes to markdown. Edits are inline [CriticMarkup](https://criticmarkup.com/) with metadata in standard markdown footnotes — visible in any text editor, diffable in git, readable by any AI agent. A VS Code extension and AI agent plugins enforce author, timestamp, and rationale on every change. Discussion threads capture disagreement and resolution inline.

**One format, everywhere** — CriticMarkup is plain text. Readable in any editor, diffable in git, parseable by any agent. No proprietary format, no lock-in.

**The workflow you know** — Accept, reject, comment, navigate. The muscle memory from popular editors, applied to markdown.

**Human-AI parity** — Humans and agents make changes the same way, in the same format. Review an agent's work exactly like you'd review a colleague's.

---

## The Gap

Today, if you want to understand *why* a line looks the way it does, you have to leave the file. `git log` tells you what changed. `git blame` tells you who. But the reasoning — the discussion, the alternatives considered, the decision — lives in PR comments, Slack threads, issue trackers. Each hop requires a different tool, different auth, different search. For an LLM reading the file, most of those hops are impossible.

ChangeTracks closes this gap. The file carries its own deliberation history. Anyone reading it — a new team member, a code reviewer, an AI agent — sees not just the current state but the reasoning that produced it.

---

## For Humans and Agents

| For Humans (VS Code / Cursor) | For Agents (Claude Code / OpenCode / Cursor) |
|---|---|
| **Tracking mode** — type normally, edits auto-wrap in CriticMarkup | **6 MCP tools** — propose, review, amend, supersede, list, read |
| **Smart View** — hides markup delimiters for clean reading | **[Super-efficient compact protocol](#benchmarks)** — LINE:HASH coordinates + edit DSL, [2.3× fewer tokens](#benchmarks) |
| **Accept / Reject** — resolve changes with keyboard shortcuts | **Concurrent multi-agent editing** — hash-verified coordinates prevent stale reads and silent conflicts |
| **Review panel** — browse changes, discussion threads, settings | **Built-in review workflow** — `review_changes` tool with agent-native metadata projection |
| **Per-author colors** — distinguish contributors at a glance | **Policy hooks** — enforce tracking on every edit (strict, safety-net, or permissive) |
| **SCM integration** — native VS Code comments and change tracking | **Batch operations** — atomic multi-change proposals with grouped IDs |
| **Export to DOCX** — share tracked documents with Word users | **Skill file** — workflow guidance loaded into agent context |
| **Four view modes** — all markup, simple, final, original | **Three platforms** — Claude Code plugin, OpenCode plugin, Cursor MCP |

Quick start guide: [`docs/public/DEMO.md`](docs/public/DEMO.md) | Deep dive: [ChangeTracks and Hashlines Explained](docs/public/changetracks-and-hashlines-explained.md)

## Install

### Quick start

```
npx changetracks init
```

Interactive setup: detects your editors and agents, creates `.changetracks/config.toml`, installs extensions, and opens a getting-started tutorial.

### For humans

**VS Code** — search `ChangeTracks` in the Extensions marketplace

**Cursor** — search `ChangeTracks` in the Extensions panel

> _Marketplace listing coming soon._ For now, install manually:

```bash
git clone https://github.com/hackerbara/changetracks.git
cd changetracks
npm install && node scripts/build.mjs

# VS Code
code --install-extension packages/vscode-extension/changetracks-*.vsix

# Cursor
cursor --install-extension packages/vscode-extension/changetracks-*.vsix
```

### For agents

**Claude Code**
```
/plugin install changetracks@hackerbara
```

**OpenCode** — add to your project's `opencode.json`:
```json
{
  "plugin": ["@changetracks/opencode-plugin"]
}
```

**Cursor** — the install script configures MCP, hooks, and skill:
```bash
node scripts/install.mjs
```

### From source

```bash
git clone https://github.com/hackerbara/changetracks.git
cd changetracks
npm install
node scripts/build.mjs
node scripts/install.mjs
```

## CriticMarkup Syntax

| Type | Syntax | Example |
|------|--------|---------|
| Insertion | `text` | `added text` |
| Deletion | `` | `` |
| Substitution | `new` | `after` |
| Highlight | `text` | `highlighted` |
| Comment | `` | `` |

Changes carry metadata in markdown footnotes:

```markdown
The API should use gRPC for internal services.
```

You can use as much or as little of the format as you want:

| Level | What you write | What you get |
|-------|---------------|-------------|
| Bare CriticMarkup | `new` | Change tracking with accept/reject |
| Add footnotes | `new` with author + timestamp | Attribution, status tracking, rationale |
| Full threading | Footnotes with discussion, revisions, approvals | Complete deliberation history |

## Benchmarks

The compact protocol (LINE:HASH coordinates + edit DSL) is an experimental mode designed for agent efficiency. It works best with certain agents and harnesses and is still going through active tool shaping. We also provide a classic mode that uses the standard old-text/new-text pattern that agents are already familiar with — this is the stable default. Measured on a 22-fix copyediting task using the compact protocol:

| Metric | Raw file editing | Compact protocol | Improvement |
|--------|-----------------|------------------|-------------|
| Output tokens | 6,730 | 2,971 | **2.3× fewer** |
| Tool calls | 26 | 7 | **3.7× fewer** |
| Rounds | 27 | 7 | **3.9× fewer** |

Without tool instruction overhead, the compact protocol completes **3× faster** with **6.5× fewer tokens** than baseline file editing. These results vary by agent, model, and task — treat them as directional rather than guaranteed.

Full benchmark suite and methodology: [`packages/benchmarks/`](packages/benchmarks/) | Detailed results: [`docs/public/how-changetracks-is-benchmarked.md`](docs/public/how-changetracks-is-benchmarked.md)

## Configuration

`npx changetracks init` creates `.changetracks/config.toml`:

```toml
[tracking]
include = ["**/*.md"]
exclude = ["node_modules/**", "dist/**"]

[author]
default = "@yourname"
enforcement = "optional"    # or "required"

[policy]
mode = "safety-net"         # "strict", "safety-net", or "permissive"
```

**Policy modes:** `strict` — agents cannot write tracked files without going through ChangeTracks tools. `safety-net` — hooks intercept raw edits and wrap them in CriticMarkup automatically. `permissive` — no enforcement, tracking is opt-in.

## Building from Source

```bash
node scripts/build.mjs
```

Builds all packages (core → cli → lsp-server → extension → mcp-server → hooks → opencode-plugin) and produces a `.vsix` extension file. Use `--package-only` to skip compilation and repackage from existing builds.

## Components

| Package | Description |
|---------|-------------|
| `packages/core` | Single-pass CriticMarkup parser and operations library |
| `packages/lsp-server` | Language Server Protocol server — semantic tokens, diagnostics, code actions |
| `packages/vscode-extension` | VS Code / Cursor extension — decorations, smart view, tracking, review panel |
| `packages/cli` | CLI, `npx changetracks init`, and the change-tracking engine |
| `packages/docx` | DOCX export with tracked changes |
| `changetracks-plugin` | Claude Code plugin — MCP server + hooks + skill |
| `packages/opencode-plugin` | OpenCode plugin — tools + hooks + instructions |
| `packages/benchmarks` | Agent efficiency benchmarks across editing surfaces |

## Documentation

### How it works

- [How Track Changes Works](docs/public/how-track-changes-works.md) — CriticMarkup, the VS Code experience, agent tools, footnotes and threading
- [ChangeTracks and Hashlines Explained](docs/public/changetracks-and-hashlines-explained.md) — From-zero introduction for newcomers
- [How Views and Addressing Work](docs/public/how-views-and-addressing-work.md) — Four views, hash-addressed coordinates, the three-zone format

### Reference

- [Glossary](docs/public/glossary.md) — Term definitions
- [Format Specification](docs/public/changetracks-format.md) — Formal spec

### Perspectives

- [The Thermodynamics of Collaboration](docs/public/thermodynamics-of-collaboration.md) — Entropy, negentropy, and why VCS compaction works (by Kimi 2.5)

## Status

ChangeTracks is in active development. The VS Code extension, MCP tools, CLI, and agent plugins are functional and used daily in development. The format specification is at v0.3.0 draft. The protocol and file format are stabilizing but not yet frozen — expect refinements. Feedback, bug reports, and contributions are welcome.

## License

MIT
