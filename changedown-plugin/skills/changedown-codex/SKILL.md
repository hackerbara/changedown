---
name: changedown-codex
description: Use ChangeDown from Codex via MCP to read tracked Markdown, propose durable CriticMarkup changes, review changes, and work with active Word sessions. Use before editing Markdown in a ChangeDown-tracked project or when the user mentions ChangeDown, tracked changes, CriticMarkup, review changes, or word:// sessions.
---

# ChangeDown for Codex

ChangeDown brings track-changes workflows to Markdown and Word-backed review sessions. In Codex, ChangeDown is available through MCP tools, not through raw file edits.

## Core rule

When working on tracked Markdown, read and edit through ChangeDown tools:

1. Use `read_tracked_file` before editing.
2. Use `propose_change` for tracked edits.
3. Use `list_changes` to inspect existing proposals.
4. Use `review_changes` to approve, reject, request changes, or respond to threads.

If hooks are not active, this is still a collaboration protocol. Do not treat raw edits as safe just because they are technically possible.

## Reading

Use:

```text
read_tracked_file(file="path/to/file.md", view="working")
```

The working view includes coordinates such as `LINE:HASH`. Use those coordinates in `propose_change`.

For long files, paginate with `offset` and `limit`.

## Proposing edits

Use compact operations when coordinates are available:

```text
propose_change(
  file="path/to/file.md",
  author="ai:codex",
  at="12:ab",
  op="{~~old text~>new text~~}{>>why this change is needed<<}"
)
```

Use explicit `author` values. Prefer `ai:codex` unless a more specific agent identity is requested. Do not impersonate a human reviewer.

For multiple related edits, use the tool's `changes` array so the server can apply them atomically against the same pre-change state.

**Chaining:** No re-read is needed when follow-up edits use fresh response coordinates or semantically anchored text/context. If you are targeting blank/structural lines or coordinate-only range replacements after prior writes, re-read or use context-bearing range replacement.

## Reviewing

Use:

```text
list_changes(file="path/to/file.md", detail="context")
```

Then review with:

```text
review_changes(
  file="path/to/file.md",
  author="ai:codex",
  reviews=[
    {
      "change_id": "cn-1",
      "decision": "approve",
      "reason": "The change matches the requested behavior."
    }
  ]
)
```

## Word sessions

Use MCP resources to discover active Word sessions. Word session URIs look like `word://sess-...`. Read with `read_tracked_file(file="word://sess-...")` and propose/review through ChangeDown tools.

## If something fails

- If a coordinate fails, re-run `read_tracked_file` and use fresh coordinates.
- If MCP is unavailable, say that ChangeDown MCP is not connected and avoid pretending tracked edits were proposed.
- If a test or raw diff passes but ChangeDown state was not updated, report that separately.
