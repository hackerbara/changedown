# ChangeTracks Format Specification

**Version:** 2.0
**Date:** 2026-03-23
**Status:** Draft

## 1. Overview

ChangeTracks is an interchange format for encoding change tracking and deliberation
directly into text files. Changes, discussion, approvals, and revision history live in
the file itself — readable by any text editor, parseable by any tool, consumable by any
LLM. No external database. No proprietary binary format.

The inline change syntax is [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit),
created by Gabe Weatherhead and Erik Hess in 2013. ChangeTracks extends CriticMarkup with
identity, lifecycle metadata, and threaded deliberation using standard markdown footnotes.

The format has two serializations of the same artifact:

- **L2** is the canonical on-disk representation. The body carries inline CriticMarkup with
  footnote references linking to metadata. Human-readable in any text editor without tooling.
- **L3** is the computational projection. The body is clean text with no delimiters. The
  footnote log carries content-addressed anchors (`LINE:HASH`) and contextual edit-ops.
  Exists during editing sessions. L2 → L3 → L2 round-trip is lossless and deterministic.

ChangeTracks is designed as a universal interchange format: any system that produces changes
into a markdown file — a human with a text editor, an AI agent via tool calls, a DOCX import
pipeline, a CRDT sync layer — can emit well-formed ChangeTracks and have its contributions
enter the same deliberation record. The format draws on the insight that the harness between
an editor and a file is the critical bottleneck (Bölük 2026), and that content-addressed
line coordinates eliminate the mechanical failures that plague text-matching approaches.

The boundary between a producing system (keystrokes, agent tool calls, programmatic edits)
and the durable editorial record is the **crystallization membrane**. Whatever crosses
the membrane becomes a well-formed footnote with identity, anchoring, and provenance.
The format specifies what appears on the durable side of the membrane; how a producing
system arrives at that output is not the format's concern.

## 2. File Header

An HTML comment on the first line declares tracking status:

```
<!-- ctrcks.com/v2: tracked -->
```

Or explicitly opted out:

```
<!-- ctrcks.com/v2: untracked -->
```

If the file has YAML frontmatter (`---`), the header goes on the first line after
the closing `---`.

**Precedence** (highest wins):

1. **File header** — `<!-- ctrcks.com/v2: tracked|untracked -->` in the file itself
2. **Project config** — `.changetracks/config.toml`
3. **Global default** — `tracked` for files matching include globs, `untracked` otherwise

The file header is authoritative. Tools auto-insert it on the first tracked edit.

## 3. Change Syntax

### 3.1 Inline Changes

Five change types using CriticMarkup delimiters:

| Type         | Syntax            | Example                        |
|--------------|-------------------|--------------------------------|
| Insertion    | `text`      | `added this`             |
| Deletion     | ``      | ``           |
| Substitution | `new`  | `after`          |
| Highlight    | `text`      | `important`              |
| Comment      | ``      | ``                 |

Highlights can attach comments with no whitespace: `text`.

All types support multi-line content. Substitutions use `~>` to separate old text
from new. Inline CriticMarkup MUST NOT nest — `text with {--other--} inside`
is malformed. CriticMarkup appearing in footnote discussion text is literal content,
not parsed as markup.

### 3.2 Range Changes

CriticMarkup delimiters can split across lines to bracket a block of content:

**Opening marker** on its own line:

```
{<delimiter> [status] [date] [footnote-ref]
```

**Closing marker** on its own line:

```
<delimiter>}
```

Where `<delimiter>` is `++`, `~~`, or `--`. All fields after the delimiter are optional.

**Disambiguation rule:** An opening delimiter is a range marker if and only if it
appears as the first non-whitespace content on its line. Same rule for closing
delimiters. Everything else is inline.

Example — insertion range:

```markdown
 proposed 2026-02-10 [^ct-1]

## New Section

This entire section is proposed as one unit.

```

Accept = delete marker lines, content stays. Reject = delete everything between
markers inclusive. For substitution and deletion ranges, old content lives in the
footnote under `original:`. Range markers MUST NOT nest.

## 4. Participation Levels

The format is layered. The boundary between levels is structural: **what container
carries the metadata**.

### 4.1 Level 0 — Bare Markup

CriticMarkup with no metadata, no IDs, no footnotes. The common substrate.

```markdown
The API should use GraphQL for the public interface.
```

### 4.2 Level 1 — Adjacent Comment

An attached comment (``, no whitespace between change and comment) carries
metadata with pipe-separated fields. Same `|` separator as Level 2 footnote headers.
No `[^ct-N]` required.

```markdown
GraphQL
```

Conventions: `@name` or `@ai:model` for author, ISO 8601 for date,
`proposed`/`accepted`/`rejected` for status, `|` between fields. Order is flexible.
Use as few or as many fields as needed.

### 4.3 Level 2 — Footnote

`[^ct-N]` footnote reference on the change + footnote definition. Full deliberation:
threading, discussion, multiple reviewer approvals, revision history, context anchoring.

```markdown
The API should use GraphQL for the public interface.

[^ct-1]: @alice | 2024-01-15 | sub | proposed
    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.
```

### 4.4 Level Transitions

Each level is a strict superset: Level 2 is valid Level 1 is valid Level 0.
The same `|` pipe convention works at Level 1 (inside comment) and Level 2
(footnote header).

**Promotion** adds a container: L0 → L1 adds comment, L1 → L2 adds footnote.

**Compaction** descends: L2 → L1 strips footnote (keeps summary comment),
L1 → L0 strips comment, L0 → plain text accepts/rejects the markup. VCS
preserves the fuller version at each step.

## 5. Change Identity

### 5.1 Footnote References

`[^ct-N]` is a standard markdown footnote reference. The `ct-` prefix is mandatory.
IDs are document-unique and monotonically increasing — new changes always use the
next integer after the highest existing ID, even if earlier IDs were removed by
compaction. For grouped changes, the parent number determines the next available
ID: if `ct-17.2` is the highest, the next standalone ID is `ct-18`.

Footnote definitions SHOULD appear in `ct-N` order. A footnote with only a header
line and no body lines is valid (minimal metadata, no discussion).

### 5.2 Grouped Changes

Multi-change operations use dotted IDs under a shared parent:

```markdown

...
moved text
```

Parent `ct-17` is the logical operation. Children `ct-17.1`, `ct-17.2` are its
components. One level of nesting only — `ct-17.1.1` is never valid.

Accept `ct-17` resolves all children. Reject `ct-17.2` carves out one exception.

A change may carry multiple footnote references when alternatives exist:
`slow` signals that ct-2 is an alternative to ct-1
(see `superseded-by:` in §6.3).

## 6. Footnote Format

### 6.1 Header Line

```
[^ct-N]: @author | date | type | status
```

| Field     | Values                                         | Notes                                 |
|-----------|-------------------------------------------------|---------------------------------------|
| `@author` | `@alice`, `@ai:claude-opus-4.6`                 | `@name` for humans, `@ai:model` for AI |
| `date`    | `2024-01-15`                                    | ISO 8601, always YYYY-MM-DD in header |
| `type`    | `ins`, `del`, `sub`, `highlight`, `comment`, `move` | Change type (see below)          |
| `status`  | `proposed`, `accepted`, `rejected`              | Three statuses only                   |

The `move` type is used on the parent footnote of a grouped move operation (§5.2);
the component children use `del` and `ins`. Withdrawal is self-rejection — the
original author rejecting their own change.

### 6.2 The Edit-Op Line

The universal record format for anchoring a change to the body:

```
    LINE:HASH contextBefore{op}contextAfter
```

4-space indent. `LINE` is a 1-indexed line number. `HASH` is a 2-character lowercase
hex string (see §7.2). A single space separates `LINE:HASH` from the rest. The
CriticMarkup operation is embedded within surrounding body text to create an
unambiguous anchor.

Example:

```
[^ct-1]: @alice | 2026-03-15 | sub | accepted
    5:a3 Protocol newverview
    approved: @bob 2026-03-16 "Correct terminology"
```

The edit-op line is present in L3 for all changes. In L2, it is preserved for
decided (accepted/rejected) changes as the coherence verification record.
Proposed changes in L2 do not carry an edit-op line — the inline CriticMarkup
in the body is their anchor.

### 6.3 Metadata Lines

Each starts with a keyword. All are optional.

**`context:`** — Surrounding text with braces marking the changed span.
```
    context: "Authentication uses {API keys} for all endpoints"
```

**`approved:`** — One approval per line. Optional quoted reason.
```
    approved: @eve 2024-01-20
    approved: @carol 2024-01-19 "Benchmarks look good"
```

**`rejected:`** — One rejection per line. Same pattern.
```
    rejected: @carol 2024-01-19 "Needs more benchmarking"
```

**`request-changes:`** — Between approval and rejection.
```
    request-changes: @eve 2024-01-18 "Pick one protocol"
```

**`revisions:`** — Amendment history. Indented entries.
```
    revisions:
      r1 @bob 2024-01-16: "OAuth 2.0"
      r2 @bob 2024-01-18: "OAuth 2.0 with JWT tokens"
```

**`supersedes: ct-N`** — This change replaces ct-N.

**`superseded-by: ct-N`** — ct-N replaces this change. Repeatable (multiple
alternatives may exist).

**`proposed-text:`** — Proposed text for a footnote-resident alternative.

**`previous:`** — Pre-amendment text (audit trail).

**`original:`** — Pre-change content for range substitutions and deletions.

### 6.4 Discussion

Comments start with `@author date:` at 4-space indent:

```
    @carol 2024-01-17: Why robust? Simple was intentional.
```

Replies indent 2 spaces deeper than the parent:

```
    @carol 2024-01-17: Why robust? Simple was intentional.
      @alice 2024-01-17: Simple undersells our capabilities.
        @dave 2024-01-18: Agreed with Alice.
```

No depth cap. Multi-line comments continue until the next `@author date:` line,
resolution marker, or end of footnote. Blank lines are tolerated anywhere.

`@mentions` mid-line (not at `@author date:` position) are attention signals,
not authorship.

**Comment labels** (optional): `[suggestion]`, `[issue]`, `[question]`, `[praise]`,
`[todo]`, `[thought]`, `[nitpick]`. Blocking modifier: `[issue/blocking]`,
`[todo/blocking]`.

```
    @bob 2024-01-16 [question]: What about latency requirements?
    @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.
```

### 6.5 Resolution Markers

```
    resolved @dave 2024-01-17
    resolved @carol 2024-01-18: Addressed by r2
    open -- awaiting load test results from @dave
    open
```

ASCII keywords. `resolved @author date: reason` and `open` / `open -- reason`.

### 6.6 Compaction Boundaries

A compaction boundary is a footnote marking where the current slice begins:

```
[^ct-7]: compaction-boundary
```

Uses the next `ct-N` ID in log order. Attribution and metadata are optional:

```
[^ct-12]: @alice | 2026-03-20 | compaction-boundary
    note: Sprint 4 cleanup
```

Compaction boundaries are excluded from change counts and coherence calculations.
They are never auto-removed and never themselves compacted.

### 6.7 Line Type Disambiguation

No separator between metadata and discussion. Each line self-identifies:

| First token                                | Line type            |
|--------------------------------------------|----------------------|
| Known keyword + `:` (`context:`, `approved:`, `rejected:`, `request-changes:`, `revisions:`, `supersedes:`, `superseded-by:`, `proposed-text:`, `previous:`, `original:`, `note:`) | Metadata |
| Digits + `:` + hex (e.g. `5:a3 ...`)      | Edit-op line (§6.2)  |
| `@author date:`                            | Discussion comment   |
| `resolved`                                 | Resolution marker    |
| `open`                                     | Open marker          |
| Indented under `revisions:`                | Revision entry       |
| Indented, no keyword match                 | Continuation of previous line |

A continuation line MUST start with whitespace. A non-indented line that does not
match any keyword terminates the footnote block.

## 7. The L3 Projection

### 7.1 Body Semantics

The L3 body is the **accepted-all projection**: every change applied as if accepted.
No CriticMarkup delimiters appear in the body. The footnote log is authoritative;
the body is one materialization of it.

Specifically:

| Change state          | Body contains                     |
|-----------------------|-----------------------------------|
| Proposed insertion    | The inserted text                 |
| Proposed deletion     | Nothing (deleted text absent)     |
| Proposed substitution | The new text                      |
| Accepted (any)        | Same as proposed                  |
| Rejected insertion    | Nothing (insertion removed)       |
| Rejected deletion     | The original text (restored)      |
| Rejected substitution | The original text (restored)      |
| Highlight             | The highlighted text (unchanged)  |
| Comment               | Nothing (no body text)            |

### 7.2 LINE:HASH Coordinates

`LINE` is a 1-indexed line number. `HASH` is computed as:

1. Strip trailing `\r` from the line
2. Remove all footnote references matching the pattern `\[\^ct-[\w.]+\]`
3. Remove all whitespace
4. Compute `xxHash32` (seed 0) of the resulting UTF-8 bytes
5. Take the result modulo 256
6. Format as exactly 2 lowercase hexadecimal characters (`00` through `ff`)

Blank lines use structural context: `hash(prevNonBlank + "\0" + nextNonBlank + "\0" + str(distFromPrev))`
where `distFromPrev` is the decimal string of the distance to the previous non-blank line.

Example: line 5 with hash `a3` is written `5:a3`. Parsers SHOULD accept hashes
of 2 or more hex characters for forward compatibility, but MUST produce exactly 2.

### 7.3 Contextual Embedding

The edit-op line embeds the CriticMarkup operation within surrounding body text:

```
    3:a1 Protocol newverview
```

`contextBefore` is `"Protocol "`. The operation is `new`. `contextAfter`
is `"verview"`. The context expands to word boundaries until the embedded string
is unique on the target line. This is the format's anchor — it locates the change
unambiguously.

For deletions (where the deleted text is absent from the body), the context is the
text surrounding the deletion point: `contextBeforecontextAfter`.
The joined context (`contextBefore` + `contextAfter`) locates the deletion point.

### 7.4 Status-Aware Demotion (L3 → L2)

| State          | Body treatment on demotion              | Footnote treatment on demotion   |
|----------------|-----------------------------------------|----------------------------------|
| Proposed       | Re-insert CriticMarkup at anchor position | Strip edit-op line             |
| Accepted       | Body stays clean (text already settled) | Keep edit-op line                |
| Rejected       | Body stays clean (rejection applied)    | Keep edit-op line                |
| Unresolved (*) | Skip body insertion                     | Preserve footnote verbatim       |

(*) Unresolved is a resolution state (§8.1), not a status field value.

L2 with a decided change and preserved edit-op:

```markdown
The document uses OAuth2 with PKCE flow for authentication.

[^ct-1]: @alice | 2026-03-15 | ins | accepted
    5:a3 uses OAuth2 with PKCE flow for authentication
    approved: @bob 2026-03-16 "Correct approach"
```

No CriticMarkup in the body. The edit-op line is the coherence verification record.

### 7.5 Round-Trip Invariant

L2 → L3 → L2 MUST be lossless and deterministic. This is guaranteed by:

- All metadata lives in footnote headers and body lines (preserved verbatim)
- Discussion threads are continuation lines (preserved verbatim)
- The matching cascade re-locates changes in the body even if the body has been edited
- Status determines body text state (§7.1 table)
- Same L2 input always produces the same L3 output

## 8. Coherence

### 8.1 Binary Resolution

Each footnote is **resolved** or **unresolved**. No intermediate states. The
mechanism by which resolution succeeded — hash match, hash relocation, context
match, intermediate-state replay — is diagnostic metadata, not a property of the
footnote or the file.

**Redundancy** is orthogonal. A resolved footnote may be **active** (its effect is
visible in the body) or **consumed** (its effect was absorbed by a later operation).
Consumption is computed by replay, not stored in the format.

### 8.2 Body-Log Coherence

The file is coherent when every footnote resolves against its **intermediate body
state** — the body as it existed when that footnote was created, not the final body.
The footnote log is an ordered sequence of operations; each was applied to a specific
body state.

Decided changes MUST retain full edit-op lines. This is how any tool verifies that
the body correctly reflects the log without replaying the entire history. A tool can
check: does the body at line 5 contain the text described by the edit-op? If yes,
coherence holds for that footnote.

### 8.3 Self-Describing Slices

A file may contain changes `ct-190` through `ct-195` with everything before compacted
away. A compaction boundary (§6.6) marks the start of the slice. Within a slice:

- The body at the slice boundary is ground truth
- Each footnote in the window carries its full edit-op line and governance metadata
- The resolution protocol works on the footnote window only
- Remaining footnotes form a complete, self-consistent editorial conversation

A slice is self-describing: any tool can verify body-log coherence for everything in
the window without history beyond the boundary.

## 9. Timestamps

The header date field is always `YYYY-MM-DD`. Event lines (discussion comments,
approvals, rejections, revisions, resolution markers) accept the full spectrum:

| Format           | Example                    | When used                 |
|------------------|----------------------------|---------------------------|
| Date-only        | `2026-02-17`               | Human-written, always valid |
| Informal time    | `2026-02-17 2:30pm`        | Human-written with time   |
| Full ISO 8601    | `2026-02-17T14:32:05Z`     | System-generated events   |

System-generated events use full ISO 8601 UTC. Human-written timestamps are stored
exactly as written — never normalized, never rewritten.

## 10. Code Files

For non-markdown files, the same format applies within language-native comments:

| Languages                          | Comment prefix   |
|------------------------------------|------------------|
| Python, Ruby, Shell, YAML          | `#`              |
| JavaScript, TypeScript, Java, Go, Rust, C, C++ | `//`  |
| Lua, SQL, Haskell                  | `--`             |
| HTML, XML                          | `<!-- ... -->`   |
| CSS                                | `/* ... */`      |

All three participation levels, range delimiters, and footnote definitions work
within comment syntax. Code between range markers is live and executable; the
markers themselves are comment lines only.

## 11. Complete Example

An L2 document with two decided changes and one proposed change. Decided changes
have clean body text with edit-op lines in their footnotes. The proposed change
has inline CriticMarkup in the body.

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
    context: "The API should use {REST} for the public interface"
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

This document has 3 changes by 3 authors: 2 accepted, 1 under discussion.
The accepted changes (ct-1, ct-2) have no inline CriticMarkup — the body reads
as clean text with their effects applied. Their edit-op lines serve as coherence
verification records. The proposed highlight (ct-3) has inline CriticMarkup. One
reader — human or machine — can understand the full state of deliberation from
the file alone.

## References

- **CriticMarkup**: Gabe Weatherhead and Erik Hess (2013).
  [CriticMarkup-toolkit](https://github.com/CriticMarkup/CriticMarkup-toolkit).
  The inline change syntax that ChangeTracks extends.

- **The Harness Problem**: Can Bölük (2026).
  ["I Improved 15 LLMs at Coding in One Afternoon. Only the Harness Changed."](https://blog.can.ac/2026/02/12/the-harness-problem/)
  The insight that content-addressed line coordinates eliminate mechanical failures
  in text-matching approaches.

- **Eg-walker**: Martin Kleppmann and Matthew Gentle (EuroSys 2025).
  The retreat/advance model for intermediate-state verification that grounds
  the resolution protocol.
