# ChangeTracks Format Specification

ChangeTracks encodes change tracking and deliberation directly into text files. Changes, discussion, approvals, and revision history live in the file itself — readable by any text editor, parseable by any tool. No external database. No proprietary format.

The inline change syntax is [CriticMarkup](http://criticmarkup.com), created by Gabe Weatherhead and Erik Hess in 2013. ChangeTracks extends it with identity, lifecycle metadata, and threaded deliberation using standard markdown footnotes.

## Inline Change Syntax

Five change types:

| Type | Syntax | Example |
|------|--------|---------|
| Insertion | `text` | `added this` |
| Deletion | `` | `` |
| Substitution | `new` | `after` |
| Highlight | `text` | `important` |
| Comment | `` | `` |

Highlights can have attached comments with no whitespace between:

```
Rate limiting is set to 100 req/min
```

All types support multi-line content. Substitutions use `~>` to separate old text from new.

## Change IDs and Footnotes

Each change has a footnote reference linking it to structured metadata:

```markdown
The API should use GraphQL for the public interface.
```

`[^ct-1]` is a standard markdown footnote reference. All IDs use the `ct-` prefix. IDs are document-unique and monotonically increasing — new changes always use the next integer after the highest existing ID, even if earlier IDs have been removed by compaction.

The footnote definition carries author, date, type, and status:

```
[^ct-1]: @alice | 2024-01-15 | sub | proposed
```

| Field | Values | Notes |
|-------|--------|-------|
| Author | `@alice`, `@ai:claude-opus-4.6` | `@name` for humans, `@ai:model` for AI |
| Date | `2024-01-15` | ISO 8601 date |
| Type | `ins`, `del`, `sub`, `highlight`, `comment`, `move` | Change type (`move` for grouped operations) |
| Status | `proposed`, `accepted`, `rejected` | Three statuses only |

Withdrawal is self-rejection — the original author rejecting their own change.

## Discussion and Resolution

Discussion lives in the footnote body as indented lines.

Comments start with `@author date:` and replies indent 2 spaces deeper than their parent:

```
[^ct-1]: @alice | 2024-01-15 | sub | proposed
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
```

Approvals, rejections, and change requests are one per line with an optional quoted reason:

```
    approved: @eve 2024-01-20 "Benchmarks look good"
    rejected: @carol 2024-01-19 "Needs more benchmarking"
    request-changes: @eve 2024-01-18 "Pick one protocol"
```

Resolution markers close or reopen a thread:

```
    resolved @dave 2024-01-17
    open -- awaiting load test results from @dave
```

Context anchors the change to surrounding text, with braces marking the changed span:

```
    context: "The API should use {REST} for the public interface"
```

## Grouped Changes

Multi-change operations use dotted IDs under a shared parent:

```markdown

...
moved text
```

```
[^ct-17]: @alice | 2024-02-10 | move | proposed
[^ct-17.1]: @alice | 2024-02-10 | del | proposed
[^ct-17.2]: @alice | 2024-02-10 | ins | proposed
```

Parent `ct-17` is the logical operation. Children `ct-17.1` and `ct-17.2` are its components. One level of nesting only — `ct-17.1.1` is never valid.

Use cases: move operations, find-and-replace, any multi-site edit that's logically one change.

Accept/reject works at both levels: accept `ct-17` resolves all children; reject `ct-17.2` carves out one exception.

## Amendments and Alternatives

**Amend.** The original author updates their proposal. Inline markup shows the latest text. Revision history is preserved in the footnote:

```
[^ct-3]: @alice | 2024-01-15 | ins | proposed
    revisions:
      r1 @alice 2024-01-16: "OAuth 2.0"
      r2 @alice 2024-01-18: "OAuth 2.0 with JWT tokens"
```

**Supersede.** A different author proposes an alternative to an existing change. The original is rejected and a new change is created with a cross-reference:

```
[^ct-1]: @alice | 2024-01-15 | sub | rejected
    superseded-by: ct-4

[^ct-4]: @bob | 2024-01-17 | sub | proposed
    supersedes: ct-1
    @bob 2024-01-17: gRPC is better suited for internal services.
```

The cross-references (`supersedes:` / `superseded-by:`) link the two changes so tools and readers can follow the chain.

## File Tracking Header

An HTML comment on the first line declares tracking status:

```
<!-- ctrcks.com/v1: tracked -->
```

Tools auto-insert this on the first tracked edit. If the file has YAML frontmatter, the header goes after the closing `---`.

## How Concurrent Edits Work

ChangeTracks is designed for asynchronous collaboration, not real-time co-editing.

**What merges cleanly without coordination:**

- Discussion. Comments are append-only — two people commenting on the same change never conflicts. Merge is set union, ordered by timestamp.
- Non-overlapping proposals. Changes to different parts of the file can be applied in any order. Duplicate IDs from parallel branches are renumbered during merge.

**What requires a reviewer:**

- Overlapping proposals. Two changes to the same text are both kept visible. The reviewer decides which wins.
- Accept/reject decisions. Accepting one change can shift the text that adjacent changes reference. A human decides the order.

The file is the single source of truth. No external database, no separate review system. The deliberation record travels with the document.

## Compaction

Resolved changes can be trimmed from the file. Accepted insertions become plain text. Rejected changes are removed. Old footnotes are deleted.

Git preserves everything removed. Reconstruction is standard VCS archaeology:

```bash
git log -p --all -S '[^ct-' -- document.md
```

No special archive syntax. Compaction is just editing — a tool can offer "clean up changes older than 30 days" as a convenience, but it generates a normal edit for the user to review and commit.

## Example

```markdown
# API Design Document

The API should use GraphQL for the public interface
and gRPC for internal service communication.

Authentication uses OAuth 2.0 with JWT tokens for
all endpoints. {==Rate limiting is set to 100 req/min==}{>>seems low<<}[^ct-3].

[^ct-1]: @alice | 2024-01-15 | sub | accepted
    approved: @eve 2024-01-20
    approved: @bob 2024-01-21
    context: "The API should use {REST} for the public interface"
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42 — 3x fewer round trips.
      @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17

[^ct-2]: @alice | 2024-01-15 | ins | accepted
    approved: @eve 2024-01-20
    @bob 2024-01-16: What about latency for gRPC?
      @alice 2024-01-17: Sub-millisecond on our test cluster.
    resolved @bob 2024-01-18

[^ct-3]: @carol | 2024-01-17 | highlight | proposed
    @carol 2024-01-17: 100/min is low. Our traffic averages 80/min with spikes to 200.
      @alice 2024-01-18: Depends on infrastructure costs. @dave can you model this?
      @dave 2024-01-19: I can run load tests next week.
    open -- awaiting load test results from @dave
```
