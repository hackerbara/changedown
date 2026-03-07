# ChangeTracks Demo

Track changes in markdown — for humans and AI agents. This page shows what ChangeTracks looks like in practice.

## The Syntax

ChangeTracks uses [CriticMarkup](https://criticmarkup.com/) — plain text markup that works in any editor:

| Type | You write | Meaning |
|------|-----------|---------|
| Insertion | `new text` | Added text |
| Deletion | `` | Removed text |
| Substitution | `new` | Replaced text |
| Highlight | `text` | Highlighted text |
| Comment | `` | Inline comment |

Every change can carry a footnote with author, timestamp, status, and reasoning:

```markdown
The API should use gRPC for internal services.
```

You can use as much or as little of the format as you want — bare CriticMarkup with no footnotes works fine for simple tracking. Footnotes add attribution, rationale, and discussion.

## A Real Example

Here's an excerpt from a real ChangeTracks deliberation — an API caching strategy document where humans and AI agents collaborated ([full document](../../examples/api-caching-deliberation.md)):

**The AI proposes removing Redis.** An agent analyzed the caching architecture and proposed deleting the Redis layer, arguing that PostgreSQL's built-in caching plus the application LRU cache already achieved a 94% hit rate. The operational complexity wasn't worth the marginal benefit.

**A human pushes back.** @sarah points out they had a P1 incident when the in-process cache was the only layer and a deploy wiped it across all pods simultaneously.

**Another human rejects with reasoning.** @james explains: "Redis is the shared layer that survives deploys." The rejection and its rationale stay in the file — future readers understand not just what was kept, but *why* the alternative was considered and declined.

**Meanwhile, another proposal succeeds.** The AI proposed changing "REST" to "GraphQL." @james corrected it to gRPC (per a recent architecture decision), the AI revised its proposal with detailed technical reasoning, and @james approved. The full revision chain — original proposal, pushback, revision, approval — lives in the footnote thread.

This is what ChangeTracks is for: the file carries its own deliberation history. Anyone reading it — a new team member, a code reviewer, an AI agent — sees not just the current state but the reasoning that produced it.

## Install

### Quick start

```
npx changetracks init
```

Interactive setup: detects your editors and agents, creates `.changetracks/config.toml`, and installs everything.

### VS Code / Cursor

Search "ChangeTracks" in the Extensions marketplace.

### Claude Code

```
/plugin marketplace add hackerbara/changetracks
/plugin install changetracks@hackerbara
```

### OpenCode

Add to your project's `opencode.json`:

```json
{ "plugin": ["@changetracks/opencode-plugin"] }
```

## Your First 5 Minutes

1. **Open a markdown file** — ChangeTracks activates automatically on `.md` files.

2. **Turn on tracking** (`Alt+Cmd+T` / `Ctrl+Alt+T`) — your edits are now auto-wrapped in CriticMarkup. Type normally; insertions appear in green.

3. **Toggle Smart View** (eye icon in title bar) — hides the CriticMarkup delimiters for clean reading. The colors and decorations remain.

4. **Accept or reject** (`Alt+Cmd+Y` / `Alt+Cmd+N`) — place your cursor on a change and accept (keeps the content) or reject (reverts it).

5. **Add a comment** (`Alt+Cmd+/`) — attach a note to any change. Comments appear in the sidebar and inline.

6. **Use the sidebar** — the ChangeTracks Activity Bar icon opens the Review panel with navigable change cards, bulk accept/reject, and project settings.

### Keyboard shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Toggle tracking | Alt+Cmd+T | Ctrl+Alt+T |
| Accept change | Alt+Cmd+Y | Ctrl+Alt+Y |
| Reject change | Alt+Cmd+N | Ctrl+Alt+N |
| Next change | Alt+Cmd+] | Ctrl+Alt+] |
| Previous change | Alt+Cmd+[ | Ctrl+Alt+[ |
| Add comment | Alt+Cmd+/ | Ctrl+Alt+/ |
| Show diff | Alt+Cmd+D | Ctrl+Alt+D |

## For AI Agents

Agents interact via **6 MCP tools** — the same operations available in the editor:

| Tool | Purpose |
|------|---------|
| `read_tracked_file` | Read with LINE:HASH coordinates and change metadata |
| `propose_change` | Propose insertions, deletions, substitutions with reasoning |
| `review_changes` | Accept or reject changes with rationale |
| `amend_change` | Revise a proposed change in place (keeps thread history) |
| `supersede_change` | Replace one change with a new one |
| `list_changes` | List changes by status, author, or file |

Agents see a structured view with hash-verified line addressing. Their changes appear in the editor in real time — humans review agent work exactly like reviewing a colleague's edits.

**Concurrent editing is safe.** LINE:HASH coordinates include a content hash that detects stale reads. If two agents target the same line and one modifies it first, the second agent's operation fails with a hash mismatch rather than silently corrupting the document.

**Policy hooks** ensure agents go through ChangeTracks tools rather than raw file editing. In strict mode, direct `Edit`/`Write` calls on tracked files are blocked. In safety-net mode, raw edits are automatically wrapped in CriticMarkup.

## Go Deeper

- [How Track Changes Works](how-track-changes-works.md) — CriticMarkup, the VS Code experience, agent tools, footnotes and threading
- [ChangeTracks and Hashlines Explained](changetracks-and-hashlines-explained.md) — From-zero introduction for newcomers
- [How Views and Addressing Work](how-views-and-addressing-work.md) — Four views, hash-addressed coordinates, the three-zone format
- [How ChangeTracks Is Benchmarked](how-changetracks-is-benchmarked.md) — Agent efficiency benchmarks and methodology
- [Format Specification](changetracks-format.md) — Formal spec
- [Glossary](glossary.md) — Term definitions
