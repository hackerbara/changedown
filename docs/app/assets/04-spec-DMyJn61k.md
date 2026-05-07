<!-- changedown.com/v1: untracked -->
# The ChangeDown Format

Changes happen in tools — editors, agents, import pipelines. The record of *why* a change was made lives somewhere else: a PR comment, a Slack thread, a review UI. When the file moves to a new repository, a new team, or a new decade, the context doesn't follow. The change and its reasoning are separated at birth.

ChangeDown puts the reason next to the change, in the file itself.

The inline syntax is [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit), created by Gabe Weatherhead and Erik Hess in 2013 — a plain-text vocabulary for editorial markup. ChangeDown extends CriticMarkup with identity, deliberation, and content-addressed anchoring, using standard markdown footnotes as the container. The result is a file that carries its own editorial history: who proposed what, why, what the pushback was, and what happened next. No external database. No proprietary format. Any text editor can read it.

The format is a universal interchange. Any system that produces changes to a markdown file — a human typing, an AI agent calling MCP tools, a DOCX import pipeline, a CRDT sync layer — can emit well-formed ChangeDown and enter the same deliberation record. The format specifies what crosses the boundary between transient editing and durable record — the point where activity becomes a well-formed footnote with identity, anchoring, and provenance. What crosses that boundary is the format's concern. What happens upstream is not.

The format has two serializations of the same artifact. **L2** is the on-disk representation: inline CriticMarkup in the body, footnote references linking to metadata blocks. Human-readable without tooling. **L3** is the computational projection: clean body text with no delimiters, footnotes enriched with content-addressed anchors. L3 is the layer that enables MCP-equipped agents to work effectively — content-addressed coordinates give agents stable references for sequential edits, batch operations, and parallel multi-agent work without coordinate invalidation between calls. L2 → L3 → L2 is lossless and deterministic.

---

## A Change, Built in Layers

A change in ChangeDown starts simple and gains structure as needed. The three levels are concentric — each adds a container around the previous one. A reader encountering the format for the first time sees the simplest possible version. A tool producing changes emits the richest.

### Level 0 — Bare Markup

CriticMarkup defines five inline constructs:

| Type         | Syntax                      | Example                                       |
|--------------|-----------------------------|-----------------------------------------------|
| Insertion    | `{++text++}`                | `{++added this++}`                            |
| Deletion     | `{--text--}`                | `{--removed this--}`                          |
| Substitution | `{~~old~>new~~}`            | `{~~REST~>GraphQL~~}`                         |
| Highlight    | `{==text==}`                | `{==important==}`                             |
| Comment      | `{>>text<<}`                | `{>>needs citation<<}`                        |

Any markdown file containing these constructs is a valid CriticMarkup document. This is Level 0 — the substrate. No attribution, no IDs, just the change:

```changedown
The API should use {~~REST~>GraphQL~~} for the public interface.
```

### Level 1 — Attribution

Attach a comment with no whitespace after the closing delimiter, and metadata travels with the change:

```changedown
The API should use {~~REST~>GraphQL~~}{>>@alice | 2024-01-15 | sub | proposed<<} for the public interface.
```

The comment carries pipe-separated fields: `@author`, date, type, status. Same `|` separator at every level, flexible field order. Use as few or as many fields as needed. Level 1 adds identity without ceremony.

### Level 2 — Full Deliberation

Add a footnote reference on the change and a footnote definition block, and the change gains a full deliberation record:

```changedown
The API should use {~~REST~>GraphQL~~}[^cn-1] for the public interface.

[^cn-1]: @alice | 2024-01-15 | sub | proposed
    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.
    @dave 2024-01-16: But increases client complexity.
      @alice 2024-01-16: See benchmarks in PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17
```

The footnote header carries identity and status. The body carries threaded discussion, resolution markers, approval records, and revision history. This is what tools produce and what the review panel displays.

### Level Transitions

Each level is a strict superset: Level 2 is valid Level 1 is valid Level 0. Promotion adds a container — L0 → L1 adds a comment, L1 → L2 adds a footnote.

Compaction is the inverse direction, but it is not merely stripping containers. Compaction operates on an arbitrary slice of footnotes — the file's deliberation history — and decides what to carry forward. A compaction pass targets specific decided or consumed footnotes, removes their definitions, inserts a compaction-boundary marker at the frontier, and VCS preserves the full history at each step. The deliberation record is what you are deciding about: which threads have served their purpose, which decisions are load-bearing enough to keep. Compaction is stewardship of the file's memory, not mechanical cleanup.

---

## Change Types

Five inline change types using CriticMarkup delimiters:

| Type         | Syntax                      | Body result when accepted        |
|--------------|-----------------------------|----------------------------------|
| Insertion    | `{++text++}`                | text is added                    |
| Deletion     | `{--text--}`                | text is removed                  |
| Substitution | `{~~old~>new~~}`            | old is replaced with new         |
| Highlight    | `{==text==}`                | text is unchanged (annotation)   |
| Comment      | `{>>text<<}`                | no body text (annotation only)   |

Highlights attach comments with no whitespace: `{==text==}{>>reason<<}`. All types support multi-line content. Substitutions use `~>` to separate old text from new.

The comment closer `<<}` is required in Level 0 and Level 1 CriticMarkup. In Level 2, the `{>>reason` annotation attached to an edit-op in a footnote does not require a closing `<<}` — the annotation extends to end of line. Standalone comments in the body (`{>>text<<}`) always require the closer.

Inline CriticMarkup must not nest — `{++text with {--other--} inside++}` is malformed. CriticMarkup appearing inside footnote discussion text is literal content, not parsed as markup.

### Range Changes (Deferred)

Range-change syntax is intentionally out of scope for this draft.

This version focuses on stable core semantics: inline changes, identity, footnote structure, anchoring, projection semantics, coherence, and stewardship. Range operations can return in a follow-up revision once parser and conversion behavior are locked with explicit conformance tests.

---

## Identity

### Authors

`@name` for humans. `@ai:model` for AI agents — for example, `@ai:claude-opus-4.6`. The `@ai:` namespace is structural: it tells every reader that this participant is a language model, not a person wearing a handle. Identity is governance, not cosmetics. Flattening human and AI attribution into a single namespace corrupts the deliberation record.

### Change IDs

`[^cn-N]` — a standard markdown footnote reference. The `cn-` prefix is mandatory. IDs are document-unique and monotonically increasing. New changes take the next integer after the highest existing ID, even after compaction removes earlier ones. For grouped changes, the parent number determines the next available ID: if `cn-17.2` is the highest, the next standalone ID is `cn-18`.

A footnote with only a header line and no body is valid — minimal metadata, no discussion. Definitions appear in `cn-N` order.

### Grouped Changes

Multi-change operations use dotted IDs under a shared parent: `cn-17.1`, `cn-17.2`. The parent is the logical operation; children are its components. One level of nesting only — `cn-17.1.1` is never valid.

The parent footnote `cn-17` carries the `move` (or other compound) type and the group-level status. It has no inline CriticMarkup in the body — it is a metadata-only footnote. Its children (`cn-17.1`, `cn-17.2`, etc.) carry the individual edit-ops and inline markup. When the parent is accepted, all children with `proposed` status are accepted. When a child is individually rejected, that child is carved out but the parent remains proposed until explicitly decided.

Example of a grouped move operation:

```changedown
{--The intro paragraph here.--}[^cn-17.1]

...

{++The intro paragraph here.++}[^cn-17.2]

[^cn-17]: @alice | 2024-03-01 | move | proposed
    note: Move intro from section 3 to section 1

[^cn-17.1]: @alice | 2024-03-01 | del | proposed
    3:b2 {--The intro paragraph here.--}

[^cn-17.2]: @alice | 2024-03-01 | ins | proposed
    12:f1 {++The intro paragraph here.++}
```

Accepting the parent resolves all still-proposed children. Rejecting a child carves out one exception.

---

## The Footnote

The footnote is the deliberation record. Everything that makes a change more than a text diff lives here.

### Parser Philosophy

The format is designed so humans can write footnotes by hand and get them mostly right. Parsers should be generous in what they accept: tolerate blank lines in footnotes and preserve unrecognized metadata lines for forward compatibility.

The spec defines canonical producer output. Parsers should prefer compatibility over brittleness for reasonable variations.

### Header

```
[^cn-N]: @author | date | type | status
```

| Field     | Values                                              |
|-----------|-----------------------------------------------------|
| `@author` | `@alice`, `@ai:claude-opus-4.6`                     |
| `date`    | `2024-01-15` (always YYYY-MM-DD in header)          |
| `type`    | `ins`, `del`, `sub`, `highlight`, `comment`, `move`. Parsers also accept long forms (`insertion`, `deletion`, `substitution`) and additional abbreviations (`hi` and `hig` for highlight, `com` for comment) |
| `status`  | `proposed`, `accepted`, `rejected`                  |

The `move` type is used on the parent footnote of a grouped move operation; the component children use `del` and `ins`. Additional types `image` and `equation` are used for media import metadata.

Three statuses only. Withdrawal is self-rejection — the original author rejecting their own change.

### The Edit-Op Line

The anchor that locates a change in the body text:

```
    LINE:HASH contextBefore{op}contextAfter
```

4-space indent. `LINE` is a 1-indexed line number. `HASH` is 2 lowercase hex characters (see [The Anchor](#the-anchor)). The CriticMarkup operation is embedded within surrounding body text so the string is unique on its line.

The edit-op line is present in L3 for all changes. In L2, it is preserved for decided (accepted/rejected) changes as the coherence verification record. Proposed changes in L2 do not carry an edit-op line — the inline CriticMarkup in the body is their anchor.

The edit-op line is the bridge between the footnote and the body. [The Anchor](#the-anchor) covers in detail how edit-ops are produced, how they survive body edits, and how they are used in the resolution protocol.

### Metadata Keywords

All metadata lines are 4-space indented and follow a `keyword: value` pattern.

| Keyword            | Purpose                                         | Repeatable |
|--------------------|-------------------------------------------------|------------|
| `context:`         | Surrounding text with `{braces}` on changed span| No         |
| `approved:`        | `@author date "reason"`                         | Yes        |
| `rejected:`        | Same pattern                                    | Yes        |
| `request-changes:` | Between approval and rejection                  | Yes        |
| `revisions:`       | Amendment history; `r1`, `r2` entries below     | No         |
| `supersedes:`      | `cn-N` — this replaces cn-N                     | No         |
| `superseded-by:`   | `cn-N` — cn-N replaces this                     | Yes        |
| `proposed-text:`   | Text for footnote-resident alternative          | No         |
| `previous:`        | Pre-amendment text                              | No         |
| `original:`        | Pre-change content for range sub/del            | No         |
| `reason:`          | Short annotation for the change                 | No         |
| `note:`            | Free-form annotation                            | Yes        |

The `revisions:` block uses indented sub-entries, each prefixed with a revision label (`r1`, `r2`, etc.):

```
    revisions:
        r1 @alice 2024-01-18: Softened wording per feedback
            previous: reliable
        r2 @alice 2024-01-20: Expanded scope
            previous: production-ready
```

Each revision entry is indented 8 spaces (4 for footnote body + 4 for revision nesting). The `previous:` sub-line records the prior edit-op so the full amendment history is recoverable. Revision labels are sequential and never reused.

Parsers should preserve all indented `key: value` lines verbatim, whether or not the keyword is recognized. This makes the format forward-compatible — new keywords can be added without breaking existing parsers.

### Discussion

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

No depth cap. Multi-line comments continue until the next `@author date:` line, resolution marker, or end of footnote. Blank lines are tolerated.

`@mentions` mid-line (not at `@author date:` position) are attention signals, not authorship.

**Comment labels** (optional): `[suggestion]`, `[issue]`, `[question]`, `[praise]`, `[todo]`, `[thought]`, `[nitpick]`. Blocking modifier: `[issue/blocking]`, `[todo/blocking]`.

```
    @bob 2024-01-16 [question]: What about latency requirements?
    @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.
```

### Resolution Markers

```
    resolved @dave 2024-01-17
    resolved @carol 2024-01-18: Addressed by r2
    open -- awaiting load test results from @dave
    open
```

ASCII keywords. Grep-able. `resolved @author date: reason` and `open` / `open -- reason`.

### Line Type Identification

Each footnote body line self-identifies by its first token:

| Pattern                              | Type               |
|--------------------------------------|--------------------|
| Known keyword + `:`                  | Metadata           |
| Digits + `:` + hex (e.g. `5:a3 ...`)| Edit-op line       |
| `@author date:`                      | Discussion         |
| `resolved` / `open`                  | Resolution marker  |
| Indented under `revisions:`          | Revision entry     |
| Indented, no match                   | Continuation       |

Continuation lines must start with whitespace. A non-indented line that matches no pattern terminates the footnote block.

### Footnote Section Boundary

The **footnote section** begins at the first `[^cn-N]:` definition line that is not inside a fenced code block. All subsequent lines belong to the footnote section until the end of the file, with one exception: a line that is not indented and does not start a new footnote definition terminates the preceding footnote but does not end the footnote section — it is treated as a non-footnote line within the section (e.g., a blank line between definitions).

The body is everything before the footnote section. There is no requirement for a blank line between the body and the first footnote definition, but producers should emit one for readability. A file with no `[^cn-N]:` definitions has no footnote section — the entire file is body.

Footnote definitions must not be interleaved with body content. All definitions appear after the body, in `cn-N` order. A parser encountering a `[^cn-N]:` definition followed by non-indented, non-definition body text should treat this as a malformed document.

### A Change Through Its Lifecycle

The substitution from the opening section — `REST` → `GraphQL` — through its full lifecycle.

**1. Propose.** Alice creates the change. The file now contains:

```changedown
The API should use {~~REST~>GraphQL~~}[^cn-1] for the public interface.

[^cn-1]: @alice | 2024-01-15 | sub | proposed
    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.
```

**2. Discuss.** Dave pushes back. Alice responds with evidence:

```
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17
```

**3. Accept.** Eve and Bob approve. The status changes:

```changedown
[^cn-1]: @alice | 2024-01-15 | sub | accepted
    4:e2 should use {~~REST~>GraphQL~~} for the public
    approved: @eve 2024-01-20
    approved: @bob 2024-01-21
    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17
```

The body now reads `GraphQL` as clean text. The edit-op line records the original operation for coherence verification.

**4. Compact.** Later, the team compacts decided footnotes. cn-1 is removed, a compaction boundary is inserted, and VCS preserves the full thread in history:

```changedown
The API should use GraphQL for the public interface.

[^cn-2]: compaction-boundary
```

The body carries the decided text. The deliberation is recoverable from VCS. The file moves on.

---

## The Anchor

A change knows where it lives. But the body moves — lines added, deleted, rewritten by other authors. Two problems compound: each edit shifts the coordinates of subsequent edits, and concurrent changes rewrite the body between edits. The anchor must survive both.

In L2 with proposed changes, inline CriticMarkup IS the anchor — the change is physically present in the body text. In L3, and in L2 for decided changes, the body is clean text and the anchor must locate the change from outside.

The body text looks different depending on the projection. The format defines three canonical projections:

| Projection | Proposed ops | Accepted ops | Rejected ops | Purpose |
|---|---|---|---|---|
| **Current** (on-disk) | Applied as-if-accepted | Applied | Rejection applied | Anchor surface, the body as it reads now |
| **Decided** | Excluded (unapplied) | Applied | Rejection applied | What's been finalized — no speculation |
| **Original** | Excluded | Excluded | Excluded | Base text before any tracking |

The L3 body is the **Current** projection — the actual bytes in the file. Every footnote's LINE:HASH and contextual embedding resolves against Current. The **Decided** projection shows only finalized decisions (computed by unapplying proposed changes). The **Original** projection reconstructs the base text via the scrub replay's backward pass.

The anchor system works across these projections — an edit-op written against one body state resolves against the same logical text even when the projection has changed.

### LINE:HASH

A content-addressed coordinate, inspired by Bölük's line-hash addressing (["The Harness Problem,"](https://blog.can.ac/2026/02/12/the-harness-problem/) 2026). Bölük's insight: content-addressed lines eliminate the mechanical failures that plague text-matching approaches to agent editing. ChangeDown extends the concept — the hash serves as a **freshness indicator** per line. When the hash matches, the line content hasn't changed and the coordinate is trustworthy. When it doesn't, the system knows to relocate rather than silently operating on stale data.

The hash is computed as:

1. Strip trailing `\r` from the line
2. Remove all footnote references matching `[^cn-[\w.]+]`
3. Remove all whitespace
4. Compute `xxHash32` (seed 0) of the resulting UTF-8 bytes
5. Take the result modulo 256
6. Format as exactly 2 lowercase hexadecimal characters (`00` through `ff`)

Step 2 makes the hash **view-independent**: the same line produces the same hash whether read in L2 (with `[^cn-N]` refs inline) or L3 (refs stripped). This is critical for round-trip stability — an edit-op written in L3 resolves correctly when the file is stored as L2.

**Blank lines** use structural context: `hash(prevNonBlank + "\0" + nextNonBlank + "\0" + distFromPrev)`, where `distFromPrev` is the number of lines between this blank line and the previous non-blank line (1 means immediately adjacent). For consecutive blank lines, each gets a different `distFromPrev` value (1, 2, 3, ...), ensuring unique hashes. `prevNonBlank` and `nextNonBlank` are the **stripped** content of those lines — the same stripping from steps 1-3 is applied (remove trailing `\r`, remove footnote refs, remove whitespace) before using them as hash input. At file boundaries: if no previous non-blank line exists, `prevNonBlank` is the empty string; same for `nextNonBlank`.

`5:a3` means line 5, hash `a3`. Producers emit exactly 2 hex characters. Parsers accept 2 or more for forward compatibility.

### Contextual Embedding

The edit-op line embeds the CriticMarkup operation within surrounding body text, creating an unambiguous anchor within the target line:

```changedown
    4:e2 should use {~~REST~>GraphQL~~} for the public
```

`should use ` is the context before. `{~~REST~>GraphQL~~}` is the operation. ` for the public` is the context after. The combined string appears exactly once on line 4 — any parser can recover the operation's exact column position.

This is a simplified, line-scoped variant of the W3C Web Annotation Data Model's TextQuoteSelector (`{prefix, exact, suffix}` for robust anchoring in dynamic documents). ChangeDown scopes the anchor to a single line because files have VCS history as the authoritative recovery path — full-document anchoring is over-engineered for this use case.

For deletions (where the deleted text is absent from the body), the edit-op embeds the deletion operation in context: `contextBefore{--text--}contextAfter`. The surrounding context locates where the deletion occurred.

### Contextual Uniqueness Guarantee

Every produced edit-op is contextually unique within its line. The context expansion algorithm:

1. Start with the operation's column span in the body
2. Expand alternately right then left, one character at a time
3. At each step, check: does this substring appear exactly once on the line?
4. When unique, snap to word boundaries (extend to nearest space characters)
5. Verify uniqueness still holds after word-boundary snap; revert to character-level if broken
6. Full line is always unique (terminal case)

This guarantee means any parser can unambiguously recover the operation's exact position from the edit-op line alone. The right-first expansion bias keeps `contextBefore` short when possible, anchoring within the nearest word.

### Line and Hash Based Relocation

When the edit-op's line number is stale — lines were added or removed above the target — the system uses the hash as a relocation key.

**The relocation protocol:**

1. **Check the stated line.** Compute the hash at the expected line number. If it matches, done. This is the O(1) fast path and the common case.
2. **Scan for hash match.** Build a hash-to-line map for the entire file. If the hash appears exactly once elsewhere, relocate to that line. If the hash is ambiguous (appears on multiple lines — possible since mod-256 produces only 256 values), fail and ask the caller to re-read with fresh coordinates.

The hash is a **freshness gate**: when it matches, the coordinate is trustworthy. When it doesn't, the system relocates rather than silently applying to the wrong line. This is what makes sequential agent edits safe — each edit-op carries its own freshness proof.

### The Text Matching Cascade

Once the correct line is identified (via hash match or relocation), the system locates the operation's text *within* that line. The matching cascade relaxes constraints progressively:

1. **Exact** — literal string match
2. **Ref-transparent** — strip footnote references from both haystack and needle, then match. Strips both `[^cn-N]` (standard refs) and `[cn-N]` (without caret — agents sometimes copy this form from view output). Handles agents that copied a ref from the view.
3. **Normalized** — NFKC Unicode normalization (compatibility decomposition + canonical composition). Collapses fullwidth letters, expands ligatures, normalizes NBSP to space. Does NOT convert smart quotes or en-dashes to ASCII — those are preserved as distinct characters. Handles LLMs that produce Unicode compatibility variants.
4. **Whitespace-collapsed** — collapse all whitespace runs to a single space. Handles text with different line wrapping than the source.
5. **Decided-text** (code: `committed-text`) — strip pending CriticMarkup using decided semantics (accepted changes stay, proposals reverted), then match. Handles agents targeting the decided text when the file has pending proposals inline.
6. **Current-text** (code: `settled-text`) — strip all CriticMarkup using Current projection semantics, then match. Handles agents targeting the Current projection view.

Each level is ambiguity-checked: if the target appears more than once at any level, the match fails rather than guessing. If all levels fail, the system checks for Unicode confusable characters and reports them diagnostically.

### Error Behavior

When the matching cascade fails entirely — the old text in a substitution or deletion cannot be found on the target line at any cascade level — the system must not silently skip the change or apply it elsewhere. The change is marked **unresolved**. Unresolved changes are preserved in the footnote with their last-known coordinates. Tools should surface unresolved changes to the user for manual intervention.

When two changes target the same line, each edit-op's contextual embedding distinguishes them — the uniqueness guarantee ensures non-overlapping substrings. When two changes target the same column range (overlapping edits), this is a conflict. The second change to be applied fails to resolve because its old text has been modified by the first. Conflict resolution is outside the format's scope — tools must detect and surface overlapping edits rather than silently merging them.

The cascade is gated: levels 1-4 handle surface-level mismatches. Levels 5-6 handle view-projection mismatches — they only activate when the line contains CriticMarkup.

### The Scrub Replay

The universal recovery mechanism. When hash relocation and the matching cascade cannot resolve a change — the body has drifted too far through accumulated edits — the scrub replay reconstructs the correct intermediate body state by replaying the entire edit history.

**The protocol:**

1. **Backward pass.** Process operations in reverse log order, un-applying each to reconstruct body₀ — the original body before any changes were applied. For each operation: find its text in the current body state, record the position, then reverse the operation (remove inserted text, restore deleted text, revert substituted text).
2. **Forward pass.** Re-apply operations in log order, starting from body₀. Each operation is verified against its intermediate body state — the body as it existed when that specific change was created. This detects **consumption**: a later operation absorbing an earlier one (e.g., a substitution that replaces text containing a previous insertion).

This is structurally identical to Eg-walker's retreat/advance model (Kleppmann and Gentle, EuroSys 2025).

The forward pass also produces **fresh anchors** — updated LINE:HASH coordinates and contextual edit-ops for any changes whose positions shifted. These fresh anchors can be written back to the file, re-establishing coherence at arbitrary length. The replay is idempotent: running it on an already-coherent file produces identical anchors.

---

## The L3 Projection

### Why L3 Exists

L2 is the on-disk truth. So why compute a second form?

**For editors.** The L3 body is what most humans think of as "the working document" — the text as it currently reads, without CriticMarkup delimiters in the buffer. This matters for integration with editors like VS Code and Monaco, which are particular about characters in their text buffer. Decorations, syntax highlighting, and cursor positioning all work better on clean text. The footnote log is consumed by the review panel and decoration engine, not by the text buffer.

**For agents.** L3's content-addressed coordinates (LINE:HASH) give agents stable references. An agent can read the file, get coordinates, propose a batch of changes, and each coordinate carries its own freshness proof via the hash. Without L3, agents would need to parse CriticMarkup delimiters to find their edit targets — fragile and error-prone.

### Why L2 Is the On-Disk Format

L2 keeps CriticMarkup inline in the body. The advantage is **durability and local coherence.** An agent or human reading just a few lines of an L2 file immediately sees what's proposed, what's been changed, who did it. A grep across a codebase catches pending changes. A diff shows the markup in context. There is no separate data structure to lose — the body carries its own editorial state.

L3 is the better *working* format. L2 is the better *storage* format. The round-trip between them is lossless.

### The L3 Body

The L3 body is the **Current projection**: the document as it reads now, with all editorial decisions applied.

Proposed changes appear as-if-accepted (insertions present, deletions removed, substitutions show new text). Accepted changes are the same. Rejected changes have their rejection applied — rejected insertions are removed, rejected deletions restore the original text, rejected substitutions revert to the original text. This is not naive "accept-all" — it is the body as it currently stands, with every decision reflected.

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

No CriticMarkup delimiters appear in the body. The footnote log is authoritative; the body is one materialization of it.

### L2 → L3 Conversion

1. Parse the L2 text with a CriticMarkup parser to extract all changes
2. Strip all CriticMarkup from the body in **reverse document order** — process changes from the end of the file toward the beginning. This preserves character offsets: removing a change at line 50 does not shift the positions of changes at lines 1-49. For each change, apply Current-projection semantics: proposed/accepted insertions keep inserted text, proposed/accepted deletions remove deleted text, proposed/accepted substitutions keep new text; rejected insertions are removed, and rejected deletions/substitutions restore original text.
3. Strip all inline `[^cn-N]` footnote references from the body
4. Compute line hashes on the resulting clean body
5. For each change, build a contextual edit-op with the uniqueness guarantee
6. Prepend the edit-op as the first body line in each footnote definition
7. Return the assembled L3 text

### L3 → L2 Demotion

Demotion is fully materialized from projection semantics:

| State    | Body on demotion                          | Footnote on demotion |
|----------|-------------------------------------------|----------------------|
| Proposed | Re-insert CriticMarkup at anchor position | Strip edit-op line   |
| Accepted | Body remains clean decided text           | Keep edit-op line    |
| Rejected | Body remains clean with rejection applied | Keep edit-op line    |

### Round-Trip Invariant

L2 → L3 → L2 is lossless and deterministic. Footnote headers and body lines are preserved verbatim. The matching cascade re-locates changes in the body even if the body has been edited between conversion cycles.

---

## Coherence

### Resolution

Each footnote is **resolved** or **unresolved**. Binary. No intermediate states. The mechanism that succeeded — hash match, relocation, cascade, replay — is diagnostic metadata. It is not a property of the file.

**Redundancy** is orthogonal. A resolved footnote is **active** (its effect is visible in the body) or **consumed** (its effect was absorbed by a later operation). Consumption is computed by replay, not stored in the format.

### Body-Log Coherence

A file is coherent when every footnote resolves against its **intermediate body state** — the body as it existed when that footnote was created. The footnote log is an ordered sequence; each operation was applied to a specific body state.

Decided changes retain their full edit-op lines. Any tool can verify coherence locally: does the body at the stated line contain the text described by the edit-op? If yes, coherence holds for that footnote.

### Slices and Compaction

A file may contain changes `cn-190` through `cn-195` with everything before compacted away. A **compaction boundary** marks the start of the current slice:

```
[^cn-7]: compaction-boundary
```

The boundary uses the next `cn-N` ID in log order. Attribution and metadata are optional:

```
[^cn-12]: @alice | 2026-03-20 | compaction-boundary
    note: Sprint 4 cleanup
```

Compaction boundaries are excluded from change counts and coherence calculations. They are never auto-removed.

Within a slice, the body at the boundary is ground truth, each footnote carries its full edit-op and governance metadata, and the resolution protocol works on the window only. A slice is self-describing: any tool can verify body-log coherence for everything in the window without history beyond the boundary.

---

## Stewardship

Every footnote is a record of someone thinking in public. The same mechanism that makes decisions legible can make them punitive — accountability infrastructure that optimizes surveillance over collaboration.

The format's design stance is **forum, not panopticon**: accountability with agency, not surveillance with automation. Three structural properties enforce this.

**Compaction is stewardship, not garbage collection.** Compaction removes footnotes while VCS preserves history. Compaction boundaries record the threshold but not a ledger. Attribution on boundaries is optional — the format does not mandate disclosure of what was compacted or why. Participants choose how they enter the record and how much of it they carry forward.

**Trace decay is governed, not automatic.** The format supports lifecycle states — keep, compress, archive, drop — with an explicit preservation floor: change identity, operation semantics, decision outcome, and at least one reason for each decided path are non-droppable. No trace is dropped without explicit human authority.

**The file is a forum people enter at different depths.** Level 0 carries no identity. Level 1 carries what you choose to attach. Level 2 carries full deliberation — but the reader controls the projection, not the format. The Current projection shows the working document. The Decided projection shows only finalized decisions. No default surface exposes author-ranking metrics. Decision lineage is first-class; punitive extraction is structurally harder.

*Design every feature so a good-faith newcomer feels oriented, and a bad-faith manager feels friction.*

---

## Practical Details

### File Header

```
<!-- changedown.com/v1: tracked -->
```

First line of the file, or first line after YAML frontmatter. Tools auto-insert on first tracked edit. Supports `untracked` to explicitly opt out.

**Precedence** (highest wins):

1. **File header** — `<!-- changedown.com/v1: tracked|untracked -->` in the file itself
2. **Project config** — `.changedown/config.toml`
3. **Global default** — `tracked` for files matching include globs, `untracked` otherwise

### Timestamps

The header date field is always `YYYY-MM-DD`. Event lines (discussion, approvals, rejections, revisions, resolution markers) accept the full spectrum:

| Format           | Example                    | When used                 |
|------------------|----------------------------|---------------------------|
| Date-only        | `2026-02-17`               | Human-written, always OK  |
| Informal time    | `2026-02-17 2:30pm`        | Human-written with time   |
| Full ISO 8601    | `2026-02-17T14:32:05Z`     | System-generated events   |

System events use full ISO 8601 UTC. Human timestamps are stored exactly as written — never normalized, never rewritten.

### Code Files

*Conceptual — no implementation exists. Active conceptual development.*

The format is designed to work within language-native comments (`#`, `//`, `--`, `<!-- -->`, `/* */`). All three participation levels, range delimiters, and footnote definitions would work in comment syntax, with code between range markers remaining live and executable. This is a natural extension of the format's design but has not been implemented or tested.

---

## Complete Example

A concise L2 snapshot: decided changes remain verifiable via edit-op records, while one proposed change keeps deliberation open inline.

```changedown
<!-- changedown.com/v1: tracked -->
# API Design Document

The API should use GraphQL for the public interface
and gRPC for internal service communication.

Authentication uses OAuth 2.0 with JWT tokens for
all endpoints. {==Rate limiting is set to 100 req/min.==}[^cn-3]

[^cn-1]: @alice | 2024-01-15 | sub | accepted
    4:e2 should use {~~REST~>GraphQL~~} for the public
    approved: @eve 2024-01-20
    approved: @bob 2024-01-21
    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17

[^cn-2]: @alice | 2024-01-15 | ins | accepted
    7:91 uses {++OAuth 2.0 with JWT tokens for++}
    approved: @eve 2024-01-20
    @bob 2024-01-16 [question]: What about latency for gRPC?
      @alice 2024-01-17: Sub-millisecond on our test cluster.
    resolved @bob 2024-01-18

[^cn-3]: @carol | 2024-01-17 | highlight | proposed
    @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.
      @alice 2024-01-18: Depends on infrastructure costs.
      @dave 2024-01-19 [todo]: I can run load tests next week.
    open -- awaiting load test results from @dave
```

Three changes, three authors.

The decided changes (`cn-1`, `cn-2`) have no inline CriticMarkup in the body; their edit-op lines remain for coherence verification.

The proposed highlight (`cn-3`) keeps deliberation open with a blocking issue and unresolved thread state.

---

## References

- **CriticMarkup.** Gabe Weatherhead and Erik Hess (2013). [CriticMarkup-toolkit](https://github.com/CriticMarkup/CriticMarkup-toolkit). The inline change syntax that ChangeDown extends.

- **The Harness Problem.** Can Bölük (2026). ["I Improved 15 LLMs at Coding in One Afternoon."](https://blog.can.ac/2026/02/12/the-harness-problem/) Content-addressed line hashing as the inspiration for LINE:HASH coordinates.

- **W3C Web Annotation Data Model.** [TextQuoteSelector](https://www.w3.org/TR/annotation-model/#text-quote-selector). The conceptual ancestor of contextual embedding — `{prefix, exact, suffix}` for robust anchoring in dynamic documents.

- **Eg-walker.** Martin Kleppmann and Matthew Gentle (EuroSys 2025). The retreat/advance model for intermediate-state verification that grounds the scrub replay protocol.

- **Algorithm Visualizations.** Interactive walkthroughs of coordinate resolution, text matching, and scrub replay. *(Forthcoming.)*
