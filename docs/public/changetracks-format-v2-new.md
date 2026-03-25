# ChangeTracks Format Specification

**Version:** 2.0
**Date:** 2026-03-23
**Status:** Draft

## 1. What This Is

ChangeTracks puts the reason next to the change.

A change to a file is wrapped in [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit)
(Weatherhead and Hess, 2013). A markdown footnote carries who proposed it, when,
why, and what happened next — the discussion, the pushback, the approval, the
revision history. The change and its deliberation travel together in the same
bytes. No external database. No proprietary format.

The format is a universal interchange: any system that produces changes to a
markdown file — a human typing, an AI agent calling tools, a DOCX import, a CRDT
sync layer — emits well-formed ChangeTracks and enters the same deliberation
record. The format specifies what appears on the durable side of the
**crystallization membrane**: the boundary where transient activity becomes a
well-formed footnote with identity, anchoring, and provenance. What crosses the
membrane is the format's concern. What happens upstream is not.

The format has two serializations. **L2** is the on-disk representation: inline
CriticMarkup in the body, footnote references linking to metadata. Any text editor
can read it. **L3** is the computational projection: clean body text, footnote log
with content-addressed anchors. L3 exists during editing. L2 → L3 → L2 is lossless
and deterministic.

## 2. A Change

A change starts as bare markup:

```markdown
The API should use GraphQL for the public interface.
```

That's **Level 0** — CriticMarkup, no metadata. The substrate.

Add an adjacent comment and it becomes **Level 1** — metadata without ceremony:

```markdown
GraphQL
```

The `` comment carries pipe-separated fields: `@author`, date, type,
status, free text. Same `|` separator at every level. Order is flexible. Use as
few or as many fields as needed.

Add a footnote reference and it becomes **Level 2** — full deliberation:

```markdown
The API should use GraphQL for the public interface.

[^ct-1]: @alice | 2024-01-15 | sub | proposed
    context: "The API should use {REST} for the public interface"
    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.
```

The footnote header carries identity and status. The body carries the thread.
Each level is a strict superset: Level 2 is valid Level 1 is valid Level 0.
Promotion adds a container. Compaction descends — strips footnote, strips
comment, accepts or rejects the markup — and VCS preserves the fuller version
at each step.

### The Five Types

| Type         | Syntax           | Example                   |
|--------------|------------------|---------------------------|
| Insertion    | `text`     | `added this`        |
| Deletion     | ``     | ``      |
| Substitution | `new` | `after`     |
| Highlight    | `text`     | `important`         |
| Comment      | ``     | ``            |

Highlights attach comments with no whitespace: `text`.
All types support multi-line content. Inline CriticMarkup MUST NOT nest.

### Range Changes

Block-level changes split the delimiter across lines. Opening marker: `{<delim>`
as first non-whitespace on its line, optionally followed by status, date,
footnote ref. Closing marker: `<delim>}` on its own line. Accept = keep content,
delete markers. Reject = delete everything between markers. Old content for
substitutions and deletions lives in the footnote under `original:`. Range
markers MUST NOT nest.

## 3. Identity

### Who Spoke

`@name` for humans. `@ai:model` for AI agents. The `@ai:` namespace is structural
— it tells every reader that this participant is a language model, not a person
wearing a handle. Identity is governance, not cosmetics: flattening attribution
corrupts the deliberation record.

### Change IDs

`[^ct-N]` — standard markdown footnote reference. The `ct-` prefix is mandatory.
IDs are document-unique and monotonically increasing. New changes take the next
integer after the highest existing ID, even after compaction removes earlier ones.

A footnote with only a header line and no body is valid. Definitions SHOULD appear
in `ct-N` order.

### Grouped Changes

Dotted IDs under a shared parent: `ct-17.1`, `ct-17.2`. The parent is the logical
operation; children are components. One level only — `ct-17.1.1` is never valid.
Accept the parent → resolves all children. Reject a child → carves out one exception.

A change may carry multiple refs: `slow` signals
ct-2 supersedes ct-1.

## 4. The Footnote

The footnote is the deliberation record. Everything that makes a change more than
a text diff lives here.

### Header

```
[^ct-N]: @author | date | type | status
```

Types: `ins`, `del`, `sub`, `highlight`, `comment`, `move`. The `move` type is
for the parent of a grouped move; children use `del` and `ins`.

Statuses: `proposed`, `accepted`, `rejected`. Three only. Withdrawal is
self-rejection.

### The Edit-Op Line

The anchor that locates a change in the body:

```
    LINE:HASH contextBefore{op}contextAfter
```

4-space indent. `LINE` is 1-indexed. `HASH` is 2-char lowercase hex (§5.2). The
CriticMarkup operation is embedded in surrounding body text so the string is unique
on its line.

Present in L3 for all changes. Preserved in L2 for decided changes as the
coherence verification record. Proposed changes in L2 do not carry one — inline
CriticMarkup in the body is their anchor.

### Metadata

| Keyword            | Purpose                                         | Repeatable |
|--------------------|-------------------------------------------------|------------|
| `context:`         | Surrounding text with `{braces}` on changed span| No         |
| `approved:`        | `@author date "reason"`                         | Yes        |
| `rejected:`        | Same pattern                                    | Yes        |
| `request-changes:` | Between approval and rejection                  | Yes        |
| `revisions:`       | Amendment history; `r1`, `r2` entries below     | No         |
| `supersedes:`      | `ct-N` — this replaces ct-N                     | No         |
| `superseded-by:`   | `ct-N` — ct-N replaces this                     | Yes        |
| `proposed-text:`   | Text for footnote-resident alternative          | No         |
| `previous:`        | Pre-amendment text                              | No         |
| `original:`        | Pre-change content for range sub/del            | No         |
| `note:`            | Free-form annotation                            | Yes        |

### Discussion

`@author date:` at 4-space indent. Replies indent 2 spaces deeper. No depth cap.
Multi-line comments continue until the next `@author date:`, resolution marker, or
end of footnote. Blank lines are tolerated. `@mentions` mid-line are attention
signals, not authorship.

Comment labels (optional): `[suggestion]`, `[issue]`, `[question]`, `[praise]`,
`[todo]`, `[thought]`, `[nitpick]`. Blocking: `[issue/blocking]`.

### Resolution Markers

```
    resolved @dave 2024-01-17
    open -- awaiting load test results
```

ASCII. Grep-able. `resolved @author date: reason` and `open` / `open -- reason`.

### Line Type Identification

Each footnote body line self-identifies by its first token:

| Pattern                              | Type               |
|--------------------------------------|--------------------|
| Known keyword + `:`                  | Metadata           |
| Digits + `:` + hex                   | Edit-op line       |
| `@author date:`                      | Discussion         |
| `resolved` / `open`                  | Resolution marker  |
| Indented under `revisions:`          | Revision entry     |
| Indented, no match                   | Continuation       |

Continuation lines MUST start with whitespace. A non-indented line that matches
nothing terminates the footnote block.

## 5. The Anchor

### 5.1 The Problem

A change knows where it lives. But the body moves — lines are added, deleted,
rewritten. The anchor must survive.

In L2 with proposed changes, inline CriticMarkup IS the anchor: the change is
physically present in the body text. In L3, and in L2 for decided changes, the
body is clean text — the anchor must locate the change from outside the body.

### 5.2 LINE:HASH

A content-addressed coordinate. `LINE` is 1-indexed. `HASH` is:

1. Strip trailing `\r`
2. Remove footnote references matching `\[\^ct-[\w.]+\]`
3. Remove all whitespace
4. `xxHash32` (seed 0) of the UTF-8 bytes
5. Modulo 256
6. 2 lowercase hex characters (`00`–`ff`)

Blank lines: `hash(prevNonBlank + "\0" + nextNonBlank + "\0" + str(distFromPrev))`.

`5:a3` means line 5, hash `a3`. Parsers SHOULD accept 2+ hex chars for forward
compatibility. Producers MUST emit exactly 2.

### 5.3 Contextual Embedding

The edit-op line embeds the operation in its surrounding context:

```
    3:a1 Protocol newverview
```

Context expands to word boundaries until the embedded string is unique on its
line. For deletions: `contextBeforecontextAfter` — the joined
context locates the deletion point.

## 6. The Projection

### 6.1 L3 Body

The **accepted-all projection**: every operation applied as if accepted.

| State                 | Body contains                    |
|-----------------------|----------------------------------|
| Proposed insertion    | The inserted text                |
| Proposed deletion     | Nothing                          |
| Proposed substitution | The new text                     |
| Accepted (any)        | Same as proposed                 |
| Rejected insertion    | Nothing                          |
| Rejected deletion     | The original text (restored)     |
| Rejected substitution | The original text (restored)     |
| Highlight             | The highlighted text             |
| Comment               | Nothing                          |

No CriticMarkup delimiters in the body. The footnote log is authoritative; the
body is one materialization of it.

### 6.2 Demotion (L3 → L2)

| State      | Body                                       | Footnote                 |
|------------|--------------------------------------------|--------------------------|
| Proposed   | Re-insert CriticMarkup at anchor position  | Strip edit-op line       |
| Accepted   | Body stays clean                           | Keep edit-op line        |
| Rejected   | Body stays clean                           | Keep edit-op line        |
| Unresolved | Skip body insertion                        | Preserve verbatim        |

Unresolved is a resolution state (§7.1), not a status field value.

### 6.3 Round-Trip Invariant

L2 → L3 → L2 MUST be lossless and deterministic. Footnote headers and body lines
are preserved verbatim. The matching cascade re-locates changes even if the body
was edited between cycles.

## 7. Coherence

### 7.1 Resolution

Each footnote is **resolved** or **unresolved**. Binary. No intermediate states.
The mechanism that succeeded — hash match, relocation, context match, replay — is
diagnostic metadata. It is not a property of the file.

**Redundancy** is orthogonal. A resolved footnote is **active** (effect visible)
or **consumed** (effect absorbed by a later operation). Consumption is computed by
replay, not stored.

### 7.2 Body-Log Coherence

A file is coherent when every footnote resolves against its **intermediate body
state** — the body as it existed when that footnote was created. The log is an
ordered sequence; each operation was applied to a specific body state. The model
is structurally identical to Eg-walker's retreat/advance (Kleppmann and Gentle
2025).

Decided changes MUST retain full edit-op lines. Any tool can check: does line 5
contain the text described by the edit-op? If yes, coherence holds.

### 7.3 Slices

A file may show changes `ct-190` through `ct-195` with everything before
compacted away. A **compaction boundary** marks the start:

```
[^ct-7]: compaction-boundary
```

Next `ct-N` ID in log order. Attribution optional. Excluded from change counts
and coherence calculations. Never auto-removed.

Within a slice, the body at the boundary is ground truth, each footnote carries
its edit-op and governance metadata, and the resolution protocol works on the
window only. A slice is self-describing.

## 8. Stewardship

The format carries deliberation. The same mechanism that makes decisions legible
can make them punitive. This is the panopticon risk — accountability infrastructure
that optimizes surveillance over collaboration.

The format's design stance is **forum, not panopticon**: accountability with agency,
not surveillance with automation. Three structural properties enforce this:

**Compaction is stewardship, not garbage collection.** Compaction descends through
participation levels (§2), removing containers while VCS preserves history.
Compaction boundaries record the threshold but not a ledger. Attribution on
boundaries is optional — the format does not mandate disclosure of what was
compacted or why. Participants choose how they enter the record and how much
of it they carry forward.

**Trace decay is governed, not automatic.** The format supports four lifecycle
states — keep, compress, archive, drop — with an explicit preservation floor:
change identity, operation semantics, decision outcome, and at least one reason
for each settled path are non-droppable. No trace is dropped without explicit
human authority.

**The file is a forum people enter at different depths.** Level 0 carries no
identity. Level 1 carries what you choose to attach. Level 2 carries full
deliberation — but the reader controls the view, not the format. The settled
view shows clean prose. The review view shows the full thread. No default
surface exposes author-ranking metrics. Decision lineage is first-class;
punitive extraction is structurally harder.

The constitutional sentence: *Design every feature so a good-faith newcomer
feels oriented, and a bad-faith manager feels friction.*

## 9. Timestamps

Header date: `YYYY-MM-DD`. Event lines accept date-only (`2026-02-17`), informal
time (`2026-02-17 2:30pm`), or full ISO 8601 (`2026-02-17T14:32:05Z`). System
events use ISO 8601 UTC. Human timestamps are stored exactly as written — never
normalized.

## 10. Code Files

Same format within language-native comments (`#`, `//`, `--`, `<!-- -->`, `/* */`).
All three levels, range delimiters, and footnotes work in comment syntax. Code
between range markers is live and executable.

## 11. File Header

```
<!-- ctrcks.com/v2: tracked -->
```

First line (or first line after YAML frontmatter). Tools auto-insert on first
tracked edit. Precedence: file header > project config > global default.

## 12. Example

An L2 document. Two decided changes with clean body text and edit-op lines in
footnotes. One proposed change with inline CriticMarkup.

```markdown
<!-- ctrcks.com/v2: tracked -->
# API Design Document

The API should use GraphQL for the public interface
and gRPC for internal service communication.

Authentication uses OAuth 2.0 with JWT tokens for
all endpoints. Rate limiting is set to 100 req/min.

[^ct-1]: @alice | 2024-01-15 | sub | accepted
    4:e2 should use GraphQL for the public
    approved: @eve 2024-01-20
    approved: @bob 2024-01-21
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
      @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17

[^ct-2]: @alice | 2024-01-15 | ins | accepted
    7:91 uses OAuth 2.0 with JWT tokens for
    approved: @eve 2024-01-20
    @bob 2024-01-16 [question]: What about latency for gRPC?
      @alice 2024-01-17: Sub-millisecond on our test cluster.
    resolved @bob 2024-01-18

[^ct-3]: @carol | 2024-01-17 | highlight | proposed
    @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.
      @alice 2024-01-18: Depends on infrastructure costs.
      @dave 2024-01-19 [todo]: I can run load tests next week.
    open -- awaiting load test results from @dave
```

Three changes, three authors. Two accepted with clean prose and edit-op
verification records. One proposed, still inline, still open. Two resolved
threads. One blocking issue waiting on load tests.

One reader can follow the full state of deliberation from the file alone.

## References

- **CriticMarkup.** Gabe Weatherhead and Erik Hess (2013).
  [CriticMarkup-toolkit](https://github.com/CriticMarkup/CriticMarkup-toolkit).

- **The Harness Problem.** Can Bölük (2026).
  ["I Improved 15 LLMs at Coding in One Afternoon."](https://blog.can.ac/2026/02/12/the-harness-problem/)

- **Eg-walker.** Martin Kleppmann and Matthew Gentle (EuroSys 2025).
  Retreat/advance model for intermediate-state verification.
