# ChangeTracks Practical Guide

A cookbook for agents and tool implementors. Every concept has a concrete example. Read this, then build.

---

## 1. Quick Start

### Minimal tracked file (L2)

```markdown
<!-- ctrcks.com/v2: tracked -->
# API Design

The API should use GraphQL for the public interface.

[^ct-1]: @alice | 2024-01-15 | sub | proposed
```

Three things happened:
1. The tracking header on line 1 declares this file as tracked.
2. `GraphQL` is a substitution — replace "REST" with "GraphQL".
3. `[^ct-1]` links the inline change to its footnote, which carries author, date, type, and status.

### Add your first tracked change

Insert "rate-limited " before "API":

**Before:**
```markdown
The API should use GraphQL for the public interface.
```

**After:**
```markdown
The rate-limited API should use GraphQL for the public interface.

[^ct-2]: @bob | 2024-01-16 | ins | proposed
```

### Accept or reject

**Accept:** change footnote status to `accepted`, add a review line. Body does NOT change.

**Reject:** change footnote status to `rejected`, add a review line, and reverse the operation in the body (remove the insertion, restore a deletion, revert a substitution).

See Section 3 (Operations Cookbook) for full before/after examples of both.

---

## 2. File Format Quick Reference

### The 5 CriticMarkup types

| Type | Syntax | Body before | Body after (L2) |
|------|--------|-------------|------------------|
| Insertion | `text` | `The API` | `The rate-limited API` |
| Deletion | `` | `The old API` | `The API` |
| Substitution | `new` | `use REST` | `use GraphQL` |
| Highlight | `text` | `100 req/min` | `100 req/min` |
| Comment | `` | `100 req/min` | `100 req/min` |

Highlights can attach comments with no whitespace: `100 req/min`

Comments can omit the closing `<<}`: `

[^ct-5]: @bob | 2024-01-16 | comment | proposed
```

### Add a highlight with comment

Combine highlight and comment with no whitespace between them:

```markdown
Rate limiting is set to 100 req/min.
```

### Accept a change

Footnote status changes. Body does NOT change on accept (it already reflects the change).

**Before:**
```
[^ct-4]: @alice | 2024-01-15 | sub | proposed
```

**After:**
```
[^ct-4]: @alice | 2024-01-15 | sub | accepted
    approved: @eve 2024-01-20 "Benchmarks look good"
```

### Reject a change

Footnote status changes. Body DOES change — the operation is reversed.

**Before (body):**
```markdown
The API should use GraphQL for the public interface.
```

**After (body):**
```markdown
The API should use REST for the public interface.
```

**After (footnote):**
```
[^ct-4]: @alice | 2024-01-15 | sub | rejected
    rejected: @carol 2024-01-19 "REST is simpler for this use case"
```

Rejection reversal by operation type:
| Type | Reject effect |
|------|---------------|
| Insertion `text` | Inserted text removed from body |
| Deletion `` | Deleted text restored to body |
| Substitution `new` | New text reverted to old text |
| Highlight `text` | Delimiters stripped, text unchanged |
| Comment `` | Comment removed from body |

### Request changes (with label)

Does NOT change status. Records a concern.

**Before:**
```
[^ct-4]: @alice | 2024-01-15 | sub | proposed
```

**After:**
```
[^ct-4]: @alice | 2024-01-15 | sub | proposed
    request-changes: @carol 2024-01-18 "Pick one protocol" [blocking]
```

Labels: `[suggestion]`, `[issue]`, `[security]`, `[blocking]`, `[nitpick]`, etc. The label set is open — projects can define additional labels. Label-to-enforcement mapping is project-configured.

### Supersede a change (revision or alternative)

Old change gets `superseded-by`, new change gets `supersedes`. Same mechanism for both same-author revision and different-author alternative — attribution distinguishes them.

```
[^ct-1]: @alice | 2024-01-15 | sub | proposed
    5:a3 OAuth2
    approved: @bob 2024-01-16 "Correct direction"
    superseded-by: ct-2

[^ct-2]: @alice | 2024-01-17 | sub | proposed     ← same author = revision
    supersedes: ct-1
    5:a3 OAuth2 with Authorization Code flow

[^ct-3]: @carol | 2024-01-17 | sub | proposed     ← different author = alternative
    supersedes: ct-1
    5:a3 mTLS with client certificates
```

Bob's approval stays on ct-1. Both ct-2 and ct-3 need fresh review.

### Add a discussion reply

Discussion lives in footnote body lines. Replies indent 2 extra spaces per level.

**Before:**
```
[^ct-4]: @alice | 2024-01-15 | sub | proposed
    @dave 2024-01-16: GraphQL increases client complexity.
```

**After:**
```
[^ct-4]: @alice | 2024-01-15 | sub | proposed
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
```

### Resolve a thread

Add `resolved @who date` to close a thread. Reopen with `open -- reason`.

```
    resolved @dave 2024-01-17
    open -- awaiting load test results from @dave
```

### Group changes (move operation)

Multi-change operations use dotted IDs under a shared parent:

```
[^ct-17]: @alice | 2024-02-10 | move | proposed
[^ct-17.1]: @alice | 2024-02-10 | del | proposed    ←  at source
[^ct-17.2]: @alice | 2024-02-10 | ins | proposed    ← moved text at destination
```

Accept ct-17 cascades to all proposed children. Reject ct-17.2 carves out one child. Already-decided children are unaffected by parent cascades.

---

## 4. Decision Tree

### What do you want to do?

| Goal | Operation | Changes body? |
|------|-----------|---------------|
| Add new text | Insertion `text` | Yes |
| Remove existing text | Deletion `` | Yes |
| Replace text with different text | Substitution `new` | Yes |
| Annotate text without changing it | Comment `` | Yes (adds annotation) |
| Mark text for discussion | Highlight `text` | Yes (adds delimiters) |
| Approve a proposed change | Accept (review line + status change) | No |
| Reject a proposed change | Reject (review line + status change + body revert) | Yes |
| Raise a concern without deciding | Request-changes (review line only) | No |
| Revise your own proposal | Supersede (same author) | Yes |
| Offer alternative to someone else's proposal | Supersede (different author) | Yes |
| Relocate text | Grouped move (parent + del child + ins child) | Yes |
| Remove decided footnotes | Compact | No (footnotes pruned, body unchanged) |

### Agent decision tree: which MCP tool?

```
Start
  |
  ├─ Need to read the file? ──────── read_tracked_file
  |
  ├─ Need to see what changes exist? ── list_changes
  |
  ├─ Need to propose new change(s)?
  |    ├─ Single change ──────────── propose_change (at + op, or old_text + new_text)
  |    └─ Multiple atomic changes ── propose_change (changes array)
  |
  ├─ Need to accept/reject?
  |    ├─ Accept or reject ───────── review_changes (reviews array)
  |    └─ Reply to thread ────────── review_changes (responses array)
  |
  ├─ Need to revise your own proposal? ── amend_change
  |
  └─ Need to replace someone's proposal with a new one? ── supersede_change
```

### Agent: did the user provide exact text?

| User instruction | Classification | Tool approach |
|-----------------|----------------|---------------|
| "Change REST to GraphQL" | Exact text provided | `old_text: "REST"`, `new_text: "GraphQL"` |
| "Make the API more secure" | Vague instruction | Read file first, identify target text, then propose |
| "Accept change ct-3" | Review action | `review_changes` with `reviews: [{change_id: "ct-3", decision: "approve"}]` |
| "Fix the typo on line 5" | Positional reference | Read file, identify the text at line 5, propose substitution |

---

## 5. Projections Quick Reference

Three canonical projections of the same document.

### Source (L2 file on disk)

```markdown
<!-- ctrcks.com/v2: tracked -->
# API Design

The production-ready API should use GraphQL for
the interface.

[^ct-1]: @bob | 2024-01-16 | ins | proposed
[^ct-2]: @alice | 2024-01-15 | sub | accepted
    approved: @eve 2024-01-20 "Correct choice"
[^ct-3]: @alice | 2024-01-17 | del | rejected
    rejected: @bob 2024-01-18 "Public is accurate"
```

### Current projection (the on-disk body)

The body after resolving all CriticMarkup semantics. Proposed and accepted operations are present in the text. Rejected operations have their effect reversed (rejected deletions restored, rejected insertions removed). In L2, the raw file contains CriticMarkup delimiters — the Current projection is what you get after processing them.

```
The production-ready API should use GraphQL for the public interface.
```

- ct-1 (proposed insertion): "production-ready " is present
- ct-2 (accepted substitution): "GraphQL" is present, "REST" is gone
- ct-3 (rejected deletion): "public " is restored (rejection reverses the deletion)

### Decided projection

Only finalized decisions. Proposed changes excluded (unapplied).

```
The API should use GraphQL for the public interface.
```

- ct-1 (proposed): "production-ready " is NOT present — still proposed
- ct-2 (accepted): "GraphQL" is present
- ct-3 (rejected): "public " is present — rejection restores it

### Original projection

Base text before any tracking.

```
The API should use REST for the public interface.
```

All operations unapplied. The starting point.

---

## 6. Status Model

### Status transitions

```
proposed ──approve──► accepted ──reject──► rejected
    │                                         │
    └──reject──► rejected ◄───────────────────┘
                     │
                     └──approve──► accepted
```

All four transitions are valid. Rejection is not terminal.

### What each transition does to the body

| Transition | Body effect |
|------------|-------------|
| proposed → accepted | None — body already shows the change |
| proposed → rejected | Body reverts the operation |
| accepted → rejected | Body reverts the operation |
| rejected → accepted | Body re-applies the operation |

### Status resolution rule

When multiple review lines exist, the **last status-changing action** wins. `request-changes` and `withdrew` do not change status. `approved` sets accepted. `rejected` sets rejected. No vote counting.

### Cascading decisions

Accept/reject on a parent cascades to all `proposed` children:

```
[^ct-17]: @alice | 2024-02-10 | move | accepted
    approved: @bob 2024-02-11 "Good restructure"
[^ct-17.1]: @alice | 2024-02-10 | del | accepted
    approved: @bob 2024-02-11 "Good restructure" (cascaded from ct-17)
[^ct-17.2]: @alice | 2024-02-10 | ins | accepted
    approved: @bob 2024-02-11 "Good restructure" (cascaded from ct-17)
```

Already-decided children are unaffected by parent cascades.

---

## 7. Error Conditions

| Error | Cause | Fix |
|-------|-------|-----|
| Anchor not found | The text you referenced does not exist in the file | Re-read the file, use exact text from the current body |
| Ambiguous anchor | The text appears more than once — cannot determine which instance | Provide more surrounding context to disambiguate |
| Hash mismatch | LINE:HASH no longer matches (body was edited) | System auto-relocates via matching cascade. If relocation fails, re-read and use fresh coordinates |
| Below coherence threshold | Many footnotes cannot be resolved — file was edited outside the membrane | Run coherence health check. Re-anchor what is possible. Manual resolution for the rest |
| Duplicate ID | Two footnotes use the same `ct-N` identifier | IDs must be document-unique. Renumber the duplicate to the next available integer |
| Dangling supersedes reference | `supersedes: ct-5` but ct-5 does not exist (compacted away) | Informational — the reference points past the compaction boundary. Not an error, but a diagnostic |
| Hash collision | Two different lines produce the same hash | Contextual embedding disambiguates. Increase hash width (12-bit or 16-bit) if collisions are frequent |
| Consumed operation reject | Rejecting a change whose text was modified by later operations | System traces dependency chain and presents options. Human must decide |

---

## 8. MCP Tool Surface

Six tools exposed via MCP `list_tools`. Two protocol modes: **classic** (old_text/new_text matching) and **compact** (LINE:HASH + CriticMarkup ops).

| Tool | Purpose | Key parameters |
|------|---------|----------------|
| `read_tracked_file` | Read file with projection | `file`, `view` (review/changes/settled/raw) |
| `propose_change` | Propose tracked changes | Classic: `file`, `old_text`, `new_text`, `reason`. Compact: `file`, `at`, `op`. Both: `changes[]` for atomic batches |
| `review_changes` | Accept/reject, thread replies | `file`, `reviews[]` (change_id + decision + reason), `responses[]` (change_id + message) |
| `amend_change` | Revise own proposed change | `file`, `change_id`, `new_text` |
| `list_changes` | List tracked changes | `file`, `status` filter, `detail` (summary/context/full) |
| `supersede_change` | Atomically reject + re-propose | `file`, `change_id`, `old_text`, `new_text`, `reason` |

Protocol mode is set in `.changetracks/config.toml`. The MCP client sees different `propose_change` schemas depending on the mode.

---

## 9. Complete Example

### Full L2 document

```markdown
<!-- ctrcks.com/v2: tracked -->
# Authentication Design

The service uses OAuth2 with Authorization Code flow for
all external API endpoints. Rate limiting is set to
100 req/min.

Internal services use mTLS with client certificates for
mutual authentication.

[^ct-compact]: @alice | 2024-03-01 | compaction-boundary
    compacted-by: changetracks v0.1.0

[^ct-1]: @alice | 2024-01-15 | sub | proposed
    context: "uses {basic auth} for all"
    superseded-by: ct-2
    approved: @bob 2024-01-16 "Correct direction"
    request-changes: @carol 2024-01-16 "Specify grant type" [blocking]

[^ct-2]: @alice | 2024-01-17 | sub | accepted
    supersedes: ct-1
    context: "uses {basic auth} for all"
    approved: @eve 2024-01-20 "Grant type specified, looks good"
    @alice 2024-01-17: Incorporated Carol's feedback on grant type.
      @carol 2024-01-18: Thanks, Authorization Code is the right choice here.
    resolved @carol 2024-01-18

[^ct-3]: @bob | 2024-01-18 | ins | proposed
    @dave 2024-01-19: Do we need this distinction?
      @bob 2024-01-19: Yes, internal services use mTLS (see ct-7).

[^ct-5]: @bob | 2024-01-16 | highlight | proposed

[^ct-7]: @alice | 2024-02-01 | move | proposed
[^ct-7.1]: @alice | 2024-02-01 | del | proposed
[^ct-7.2]: @alice | 2024-02-01 | ins | proposed

```

### What this document contains

| Feature | Where |
|---------|-------|
| Accepted substitution | ct-2 (OAuth2 with Authorization Code flow) |
| Proposed insertion | ct-3 ("external ") |
| Superseded proposal | ct-1 (superseded by ct-2, still `proposed`) |
| Supersede chain | ct-1 → ct-2 |
| Discussion thread with replies | ct-2 (Alice + Carol), ct-3 (Dave + Bob) |
| Thread resolution | ct-2 (resolved by Carol) |
| Review with reasoning | ct-2 (approved by Eve with reason) |
| Request-changes with label | ct-1 (Carol, [blocking]) |
| Highlight with comment | ct-5 (rate limiting concern) |
| Grouped change (move) | ct-7 parent with ct-7.1 (del) + ct-7.2 (ins) |
| Compaction boundary | ct-compact (everything before ct-1 was compacted) |

### Key differences in L3

The L3 version of this document has a clean body (no delimiters, no `[^ct-N]` references). Each footnote gains a `LINE:HASH {op}` edit-op line anchoring the change to the body. For example:

```
[^ct-2]: @alice | 2024-01-17 | sub | accepted
    supersedes: ct-1
    3:b7 uses OAuth2 with Authorization Code flow for
    approved: @eve 2024-01-20 "Grant type specified, looks good"
    ...

[^ct-3]: @bob | 2024-01-18 | ins | proposed
    4:c2 all external API endpoints
    ...
```

Conversion is lossless: L2 → L3 → L2 round-trips preserve all editorial state. See Section 2 for the full L2/L3 side-by-side comparison.

---

## 10. Troubleshooting

### My proposed text does not match the file

Re-read the file with `read_tracked_file`. The body may contain CriticMarkup delimiters from other changes. The matching cascade handles this (it tries committed-text and decided-text matching as fallbacks), but exact text from the current body is always safest.

### Accept did not change the body text

Correct behavior. Accept only changes the footnote status. The body already reflects the proposed change. To produce clean text without delimiters, use compaction after accepting.

### Reject did not remove the deleted text

Rejection of a deletion **restores** the deleted text. `` becomes `removed text` again after rejection.

### Footnote IDs are not sequential

IDs are monotonically increasing but not gap-free. Compaction removes footnotes but does not renumber survivors. If ct-1 through ct-10 exist and ct-3 through ct-8 are compacted, the file has ct-1, ct-2, ct-9, ct-10. New changes start at ct-11.

### My change coordinates are stale after editing

The body changed since you read it. LINE:HASH coordinates reference the body at read time. Re-read the file to get fresh coordinates.

### Superseded change still shows in the file

Superseded changes stay in the log with their full governance record. Only the `superseded-by:` back-reference is added. The old change is not deleted — it is part of the revision history.

### File was edited outside ChangeTracks

The coherence health check runs on file open and reports resolution rate. If above threshold (default 98%), minor drift is handled automatically via the matching cascade. Below threshold, the system reports degraded state and offers recovery options: automatic re-anchoring, assisted re-anchoring via matching cascade suggestions, and manual resolution.

### Hash in LINE:HASH does not match the line content

The hash is an xxhash of the clean body line content. If the line was edited, the hash is stale. The resolution protocol relocates the anchor: first by scanning for the hash at other lines, then by matching the contextual embedding text alone.

### Grouped change accepted but one child was already rejected

Parent cascades only affect children with status `proposed`. Already-decided children (accepted or rejected) are unaffected. This is correct — explicit child decisions take precedence over parent cascades.
