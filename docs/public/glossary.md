# ChangeDown Glossary

ChangeDown is a change-tracking protocol for text files. It works like track changes in popular editors — insertions, deletions, comments, accept/reject — but designed for AI agents and humans working together. Changes carry not just *what* changed but *why*, through inline markup and attached discussion threads. It runs as a VS Code extension, a CLI, and a set of tools that AI agents call directly.

## CriticMarkup Syntax

| Type | Syntax | Example |
|------|--------|---------|
| Insertion | `text` | `added paragraph` |
| Deletion | `` | `` |
| Substitution | `new` | `final` |
| Highlight | `text` | `important section` |
| Comment | `` | `` |

## Key Terms

**Tracked file** — A file with a `<!-- changedown.com/v1: tracked -->` header on line 1. When a file is tracked, all changes go through the propose/review cycle instead of being written directly.

**Propose/review cycle** — The core workflow. Someone (human or agent) proposes a change with a reason. Others review it: approve, reject, or discuss. The proposal and all discussion stay attached to the change as a permanent record.

**Footnote** — The deliberation record attached to a change. Contains who proposed it, when, why, and any discussion thread. Lives at the bottom of the file as a standard markdown footnote.

**Settlement** — Resolving a change by removing its inline markup and updating the footnote status. Accepted text stays; rejected text is removed. The footnote remains as a historical record.

**Surface** — A way of interacting with ChangeDown. The VS Code extension is one surface. The CLI is another. An AI agent calling MCP tools is a third. Each surface provides different tools but follows the same protocol.

**Classic protocol** — One of two ways agents propose changes. The agent specifies the old text to replace and the new text to insert. Works like find-and-replace with a reason attached.

**Compact protocol** — The other way agents propose changes. The agent points at a specific line using a hash-verified address (`LINE:HASH`) and specifies an operation. More precise, requires reading the file first.

**MCP (Model Context Protocol)** — The [standard](https://modelcontextprotocol.io/) way AI agents call structured tools. ChangeDown exposes its propose/review workflow as MCP tools that any compatible agent can use.

**Hook** — An automatic redirect that catches an agent's raw file edits and routes them through ChangeDown instead. The agent doesn't need to know about the protocol — the hook handles it.

**Config** — Project settings in `.changedown/config.toml` that control tracking scope, author requirements, enforcement level, and protocol preferences.

**View** — A projected reading of a tracked file. ChangeDown provides four views: `review` (all markup with author reasoning), `changes` (clean prose with margin flags), `settled` (accept-all preview), and `raw` (literal file bytes). The same file on disk produces different output depending on which view is requested. Views are projections computed on read -- the file is always the source of truth.

**Hash addressing** — A content-verified coordinate system for targeting lines. Each line gets a 2-character hash (xxHash32 of its content, mod 256). An agent addresses a line as `LINE:HASH` (e.g., `47:a3`). The server validates the hash before applying an edit -- if the content has changed since the agent last read the file, the hash will not match and the edit is rejected with a clear error. This prevents stale edits in multi-author workflows.

**Three-zone format** — The line structure used across all views: Margin (`LINE:HASH FLAG|`) + Content (text with optional CriticMarkup) + Metadata (``). The density of each zone varies by view -- `review` shows all three zones fully populated, `changes` shows margin and clean content only, `settled` shows margin and accept-all content only.
