---
name: changetracks
description: Durable change tracking with annotations for AI agents
---

# ChangeTracks — Change Tracking for AI Agents

## Session Start

Declare your identity using the `author` parameter on every `propose_change` and `review_changes` call.

## Rules

1. **Use `propose_change` for ALL edits to tracked files.** Never use Edit/Write directly. If you do, hooks auto-wrap your edit in CriticMarkup — but with worse formatting and no annotations.

2. **Read before you write.** Call `read_tracked_file` first. It gives you the content, change status, and (when hashlines are enabled) LINE:HASH coordinates for precise addressing.

3. **Use `review_changes` to approve, reject, or discuss.** One call handles one or many reviews. Include a reason for every decision.

## Reading Surfaces

- **review** (alias: `all`) - Full annotations at point of contact. Default for most projects.
- **changes** (alias: `simple`) - Committed text with P/A flags in margin. Clean prose, change awareness.
- **settled** (alias: `final`) - Accept-all preview. Clean text for coherence checking.
- **raw** - Literal file bytes. For debugging only.

Default view is project-configured. Omit the `view` parameter to use the project default.

All views are writable projection surfaces. You can propose changes from any view using hash-addressed coordinates from that view's output.[^sc-18.1]

## The Six Tools

> **Tool naming:** This document uses short names (e.g., `read_tracked_file`). Your MCP client registers them with a prefix — look for tools ending in these suffixes in your available tool list.

| # | Tool | What it does |
|---|------|-------------|
| 1 | `read_tracked_file` | See what's there. Default: review view (three-zone format). |
| 2 | `propose_change` | Make changes. Hash-addressed ops (compact) or old_text/new_text (classic). |
| 3 | `review_changes` | Decide on changes. Accept/reject with `reviews`. Reply to threads with `responses`. |
| 4 | `amend_change` | Fix YOUR OWN proposals. Same-author enforcement. |
| 5 | `list_changes` | Change inventory with detail levels. `detail=summary` for overview, `detail=context` for surrounding lines, `detail=full` for threads and revision history. Use `change_id` or `change_ids` to fetch specific changes. Filter by status. **Prefer using `propose_change` response data** (contains change IDs, `affected_lines`, and per-change `preview`)[^sc-21.1] over calling this — saves a round trip. |
| 6 | `supersede_change` | Replace someone else's proposal. Atomically rejects old + proposes new. |

## Reading the Three-Zone Format

Every line in the review view has three zones:

```
MARGIN | CONTENT | METADATA
```

- **Zone 1 (Margin)**: `LINE:HASH FLAG|` — coordinates for targeting. `P` = pending proposal, `A` = accepted change.
- **Zone 2 (Content)**: Committed text with CriticMarkup inline. `[sc-N]` anchors link to Zone 3.
- **Zone 3 (Metadata)**: `{>>sc-N @author: reason | K replies<<}` at end of line. WHO proposed and WHY.

Example:
```
 3:3f P| The service should use {~~REST~>GraphQL~~}[sc-4] for the external interface. {>>sc-4 @claude: paradigm shift | 2 replies<<}
 4:b2  | Rate limiting should be set to 1000 requests per minute.
```

## Deletion Semantics

In review view, `{--text--}` means *proposed for deletion* — the text is still present in the committed document. When targeting text with `old_text` (classic) or `op` (compact), the deleted text is part of the committed content until the deletion is accepted.

## Tool Routing

- To propose a new change: `propose_change`
- To approve/reject existing proposals: `review_changes` with `reviews` array
- To reply to a discussion thread: `review_changes` with `responses` array
- To revise YOUR OWN proposal: `amend_change` (same-author enforcement)
- To replace someone else's proposal: `supersede_change` (rejects old, proposes new)
- To get full thread/history context: `list_changes` with `change_id` + `detail=full`
- To see all changes at a glance: `list_changes`

## Workflow

```
1. read_tracked_file(file)               — get content + coordinates
2. propose_change(file, ...)             — make edits (use hashes from step 1)
3. Fire more propose_change calls        — server auto-relocates shifted lines
4. review_changes(file, reviews=[...])   — approve/reject when done
```

Your first `read_tracked_file` call includes an edit guide tailored to this project's configuration — protocol syntax, identity rules, and view semantics.

**Subagents:** When spawning subagents (e.g., via Claude Code's Task tool), include `include_guide: true` in the subagent's first `read_tracked_file` call. All subagents share one MCP session, so only the first agent gets the guide automatically — subsequent agents must request it explicitly.[^sc-19]

**Check rejection history before proposing.** If you're modifying a section that others have reviewed, read it in `review` view first. Rejected proposals leave orphaned footnote refs (`[^sc-N]` with `rejected` status) visible in review mode. These tell you what was tried and why it was rejected, preventing wasted proposals.

**No re-reads needed between edits.** Each `propose_change` response includes `affected_lines` (neighboring lines with content and coordinates) and per-change `preview` in the `applied` array. Use those for your next edit.[^sc-21.2] Re-read only after review (accept/reject) or when relocation is ambiguous.

**UX:** After applying changes, mention the modified file path in your reply so the user can click to open it.

---

## propose_change

**Annotations:** Skip for obvious edits (typos, formatting). Include when the "why" isn't clear from the "what."

When proposing changes to a file with existing proposals, batch all your changes in one `propose_change` call. The overlap guard will reject changes that conflict with existing proposals — use `amend_change` (for your own proposals) or `supersede_change` (for others' proposals) to modify existing work.

---

## review_changes

Review one or more changes in a single call:

```
review_changes(file, reviews=[
  {change_id: "sc-1", decision: "approve", reason: "Correct fix for the timeout issue"},
  {change_id: "sc-2", decision: "reject", reason: "This breaks backward compatibility"},
], author="ai:claude-opus-4.6")
```

Reasoning is required for every review decision.

**Thread responses:** To respond without approving/rejecting, use the `responses` array:

```
review_changes(file, responses=[
  {change_id: "sc-1", response: "Good point, will revise", label: "thought"},
], author="ai:claude-opus-4.6")
```

**Settlement:** Handled by the server. When you approve a change, the project's config controls whether accepted markup is compacted immediately (common default). No separate settle step — approve is done.

**Group cascade:** Approving a group parent (e.g., `sc-1`) cascades to all children still at `proposed` status. Children with existing individual decisions (already accepted/rejected) are preserved.[^sc-18.2]

---

## list_changes — detail levels

```
list_changes(file, change_id="sc-7", detail="full")    — full thread + context for one change
list_changes(file, change_ids=["sc-5","sc-7"])          — batch lookup (defaults to detail=full)
list_changes(file, detail="context", context_lines=2)   — all changes with surrounding lines
list_changes(file, status="proposed")                   — filter by status (summary detail)
```

Detail levels: `summary` (default for lists), `context` (adds markup + surrounding lines), `full` (adds footnote, discussion threads, participants, group info).

---

## amend_change

Revise your own proposal without losing the discussion thread:

```
amend_change(file, "sc-7", new_text="better text", reason="fixed the edge case", author="ai:claude-opus-4.6")
```

- Same-author only. Preserves change ID, discussion thread, and footnote reference.
- Adds `revised:` + `previous:` entries to footnote history.
- Do not reject-and-re-propose — that severs the deliberation history.

---

## read_tracked_file

```
read_tracked_file(file="path/to/file.md")
```

**Views (canonical names):**
- `review` (aliases: `all`, `meta`) — full annotations at point of contact, deliberation summary header. Hashline includes P/A flags. CriticMarkup overlays show what's proposed. Best for evaluating and triaging proposals.
- `changes` (aliases: `simple`, `committed`) — committed text with P/A flags in the margin. No inline CriticMarkup. Clean prose with "fresh eyes." Best for copy-editing and independent judgment.
- `settled` (aliases: `final`) — document as if all proposals were accepted. Clean text. Best for coherence checks before approving.
- `raw` (aliases: `content`, `full`) — literal file bytes with all CriticMarkup markup and footnotes visible. Diagnostic/debugging only. Not a writable surface.

**P/A flags in hashline:**
```
 4:b2  | The API should use REST for the external interface.
 5:6f P| Rate limiting should be set to 1000 requests per minute.
 6:e1 A| Error responses include a human-readable message in the body.
```
- `P` = pending proposal(s) on this line
- `A` = accepted change(s) settled on this line (recent activity)
- *(blank)* = no change activity

**Options:** `offset` / `limit` for pagination (default: 500 lines, max: 2000), `include_meta` for change levels in header, `include_guide: true` to re-deliver the editing guide (for subagents sharing an MCP session).[^sc-20]

**Hashline output:** When hashlines are enabled (in project config), output includes `LINE:HASH|content` per line. **Use the hash from your current view in `propose_change` calls** — the server resolves each view's hash space back to raw file positions.

**Always use `read_tracked_file`** for tracked files, not the built-in `read` tool. `read_tracked_file` provides hash coordinates, change awareness, and session binding. The built-in `read` returns raw bytes without any of these features.

---

## File Tracking

Tracked files have `<!-- ctrcks.com/v1: tracked -->` at the top. The tooling manages this automatically.

- Tracked file: use `propose_change` (never Edit/Write)
- Untracked file: use normal Edit/Write

If `propose_change` fails with "file not tracked," the response includes diagnostic info.

---

## Troubleshooting

| Situation | Action |
|-----------|--------|
| propose_change fails with "file not tracked" | Check response diagnostic; file needs tracking header |
| File has accepted-but-unsettled markup | Re-read; compaction is automatic on approve. If markup persists, re-read the file — the settled view (`read_tracked_file(file, view="settled")`) confirms what the final text looks like |
| Text matching fails | Use LINE:HASH addressing or re-read for current content |
| Batch fails with hash mismatch | Re-read file, then apply edits one at a time with re-reads between |
| Editing non-tracked files (.ts, .json) | Normal Edit/Write — hooks do not intercept |
| Re-proposing rejected ideas | Before proposing changes to a section, read in `review` view to check for rejection history. Orphaned `[^sc-N]` anchors with `rejected` status in Zone 3 metadata indicate prior deliberation — read the rejection reason before proposing similar changes. |

---

## The Format (Read-Only Understanding)

You do not write CriticMarkup manually — the tools handle it. But you read and understand it when opening files with existing markup.

### Inline Changes

```
The API uses {~~REST~>GraphQL~~}[^sc-1] for the public interface.
We {--removed this--}[^sc-2] and {++added this++}[^sc-3] instead.
{==Rate limiting is set to 100 req/min==}{>>needs load testing<<}
```

| Type | Syntax |
|------|--------|
| Substitution | `{~~old~>new~~}[^sc-N]` |
| Deletion | `{--text--}[^sc-N]` |
| Insertion | `{++text++}[^sc-N]` |
| Highlight | `{==text==}` |
| Comment | `{>>text<<}` |

Grouped changes use dotted IDs: `[^sc-17.1]`, `[^sc-17.2]`.

### Footnote Definitions

```
[^sc-1]: @ai:claude-opus-4.6 | 2026-02-10 | sub | proposed
    context: "Authentication uses {API keys} for all endpoints"
    @ai:claude-opus-4.6 2026-02-10T14:32:05Z: GraphQL gives clients query flexibility
    approved: @carol 2026-02-11T09:15:22Z "Benchmarks look good"
```

**Header:** `[^sc-N]: @author | date | type | status`
- Status: `proposed`, `accepted`, `rejected`
- Types: `ins`, `del`, `sub`, `highlight`, `comment`, `group`

**Timestamps:** System-generated events use full ISO 8601 UTC (2026-02-10T14:32:05Z). Human-written timestamps accept date-only (2026-02-10), informal time (2026-02-10 2:30pm), or full ISO. The system stores exactly what was written.

## Hooks

ChangeTracks uses platform hooks to enforce tracking discipline:

**Claude Code:** PreToolUse blocks raw Edit/Write before execution (strict mode) or logs for batch-wrapping (safety-net mode).

**Cursor:** beforeReadFile blocks raw reads on tracked files (strict mode), beforeMCPExecution validates tool inputs, afterFileEdit + stop log and batch-wrap raw edits (safety-net mode).

**Both platforms guarantee the same final state** — tracked files end up with CriticMarkup. The difference is timing: Claude Code prevents; Cursor catches and wraps.

**If a raw read is blocked:** Use `read_tracked_file` instead. It provides deliberation context, LINE:HASH coordinates, and change metadata.

**Safety-net wrapping** produces worse formatting than `propose_change` — no annotations, no grouping, substitution markup instead of clean insertions/deletions. Always prefer `propose_change`.

---

## Multi-file editing

When editing multiple tracked files, batch by phase — not by file:

```
1. read_tracked_file(file_A)
2. read_tracked_file(file_B)
3. propose_change(file_A, changes=[...])     — batch all edits per file
4. propose_change(file_B, changes=[...])
5. review_changes(file_A, reviews=[...])     — group-level: approve sc-1 to cascade
6. review_changes(file_B, reviews=[...])
```

**Why:** Reading all files first gives you the full picture before making changes. Proposing all before reviewing avoids interleaving that triggers unnecessary re-reads.

**Group-level review is the key efficiency lever.** When your batch creates `sc-1.1` through `sc-1.15`, approve just `sc-1` — it cascades to all children at `proposed` status.


[^sc-18.1]: @ai:claude-opus-4.6 | 2026-02-25 | sub | accepted
    @ai:claude-opus-4.6 2026-02-25: consolidate view descriptions, add raw, remove token count details
    approved: @ai:claude-opus-4.6 2026-02-25 "Cleaner view descriptions with raw view added"

[^sc-18.2]: @ai:claude-opus-4.6 | 2026-02-25 | ins | accepted
    @ai:claude-opus-4.6 2026-02-25: document new group cascade behavior
    approved: @ai:claude-opus-4.6 2026-02-25 "Documents new group cascade behavior"

[^sc-18]: @ai:claude-opus-4.6 | 2026-02-25 | group | accepted
    @ai:claude-opus-4.6 2026-02-25: propose_batch
    approved: @ai:claude-opus-4.6 2026-02-25 "Concise view descriptions and group cascade documentation — addresses benchmark ergonomics findings"

[^sc-19]: @ai:claude-opus-4.6 | 2026-02-26 | sub | accepted
    @ai:claude-opus-4.6 2026-02-26: document include_guide parameter for multi-agent sessions
    approved: @ai:claude-opus-4.6 2026-02-26 "Documents include_guide for subagent guide re-delivery"

[^sc-20]: @ai:claude-opus-4.6 | 2026-02-26 | sub | accepted
    @ai:claude-opus-4.6 2026-02-26: add include_guide to options list
    approved: @ai:claude-opus-4.6 2026-02-26 "Adds include_guide to options list"

[^sc-21.1]: @ai:claude-opus-4.6 | 2026-02-27 | sub | accepted
    approved: @ai:claude-opus-4.6 2026-02-27 "Update SKILL.md to reference affected_lines and per-change preview instead of deprecated updated_lines" (cascaded from sc-21)

[^sc-21.2]: @ai:claude-opus-4.6 | 2026-02-27 | sub | accepted
    approved: @ai:claude-opus-4.6 2026-02-27 "Update SKILL.md to reference affected_lines and per-change preview instead of deprecated updated_lines" (cascaded from sc-21)

[^sc-21]: @ai:claude-opus-4.6 | 2026-02-27 | group | accepted
    @ai:claude-opus-4.6 2026-02-27: propose_batch
    approved: @ai:claude-opus-4.6 2026-02-27 "Update SKILL.md to reference affected_lines and per-change preview instead of deprecated updated_lines"

