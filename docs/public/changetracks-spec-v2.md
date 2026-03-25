# ChangeTracks Specification v2

## §1 Introduction

ChangeTracks encodes change tracking and deliberation directly into text files. Changes, discussion, approvals, and revision history live in the file itself — readable by any text editor, parseable by any tool. No external database. No proprietary format. No server state.

### The durable object

> A reviewed text artifact composed of a readable body plus crystallized editorial operations and their governance trace.

Everything in this specification is evaluated against that sentence. Character-level keystrokes are transient. The durable collaboration state is the file: its body, its operations, and the evidence of the process that produced them.

### Scope

ChangeTracks is designed for reviewed text workflows:

- Tracked prose and documentation
- Review-heavy collaboration
- Audit and deliberation
- Human-and-agent workflows over durable files

It is explicitly not a real-time character-level co-editing system. Real-time coordination is a runtime concern upstream of this specification (§2).

### CriticMarkup

The inline change syntax is [CriticMarkup](http://criticmarkup.com), created by Gabe Weatherhead and Erik Hess in 2013. ChangeTracks extends CriticMarkup with identity, lifecycle metadata, threaded deliberation, and an operational semantics that treats the markup as an edit-op DSL — a language for expressing logical editorial operations, not merely visual formatting.

### Reading guide

- **Format-only readers**: §3 (The File Format) is self-contained for parsing and serialization.
- **Architecture-first readers**: start at §2, read through sequentially.
- **Governance and participation readers**: §6 (The Participation Contract) covers roles, workflows, identity, and trust.
- **Principles**: Appendix A collects the twelve constitutional laws referenced throughout.

### Design principles

**The file is self-sufficient.** A ChangeTracks file never depends on an external system for correctness. Email it, attach it to a pull request, open it in any text editor. It works. No binary sidecars, no external databases, no server state that outlives the process.

**Structural rigidity and policy flexibility are distinct.** Parser constraints — valid syntax, valid nesting, honest resolution state — are structural and non-negotiable. Governance choices — who may approve, when to compact, whether reasoning is required — are policy and configurable per project.

**The system always reports honestly.** If a change cannot be located, the system does not pretend otherwise. Unresolvable state fails loudly. Silent false certainty is a specification violation (Law 7).

**The tool must fit in the hand.** The system succeeds only if it preserves craft-feel in use. The common path should feel like editing, not like filing paperwork. Durable reasoning must not become clerical burden.

### Quick start

A minimal ChangeTracks file with one tracked change (L2):

```markdown
<!-- ctrcks.com/v2: tracked -->
# API Design

The API should use GraphQL for the public interface.

[^ct-1]: @alice | 2024-01-15 | sub | proposed
    @alice 2024-01-15: GraphQL reduces over-fetching. See PR #42.
```

To accept the change, a reviewer adds an `approved:` line and the status changes:

```markdown
[^ct-1]: @alice | 2024-01-15 | sub | accepted
    @alice 2024-01-15: GraphQL reduces over-fetching. See PR #42.
    approved: @bob 2024-01-20 "Benchmarks look good"
```

To propose a new change, add CriticMarkup in the body and a new footnote:

```markdown
The API should use GraphQL for the public interface
and gRPC for internal service communication.

[^ct-2]: @alice | 2024-01-15 | ins | proposed
```

That's it. The file is the entire collaboration surface — no server, no database.

---

## §2 System Architecture

ChangeTracks is a four-layer system. Each layer has clear responsibilities and boundaries. New features must not silently shift responsibilities across layers.

### The four layers

```
┌─────────────────────────────────────────────┐
│  1. Runtime                                  │
│  Character-level editing, session state,     │
│  cursor, pending buffers, real-time coord    │
├─────────────────────────────────────────────┤
│  2. Crystallization Membrane                 │
│  Transient keystrokes → durable edit ops     │
│  Policy enforcement, anchor computation      │
├─────────────────────────────────────────────┤
│  3. The File                                 │
│  Body + footnote log                         │
│  The self-describing editorial artifact      │
├─────────────────────────────────────────────┤
│  4. External History / Recovery              │
│  VCS snapshots, geological recovery,         │
│  compaction backstop                         │
└─────────────────────────────────────────────┘
```

**Layer 1: Runtime.** Character-level editing, session state, cursor position, pending buffers, real-time multi-writer coordination. The runtime can be CRDT-based, authority-based, or a simple single-writer text buffer — anything. It is fully replaceable without touching the file format or the membrane contract. The file never sees character-level events.

**Layer 2: Crystallization Membrane.** The boundary between transient character activity and durable editorial intent. Not one piece of code — a responsibility boundary that multiple systems implement. Multiple entry paths (keyboard, MCP tool calls, .docx import, direct edit), one output format: an anchored edit-op in CriticMarkup vocabulary.

The membrane guarantees to the file:
- A well-formed CriticMarkup operation (insert, delete, substitute, highlight, comment)
- An anchor that resolves against the current body at crystallization time
- Provenance: author identity and timestamp

The membrane enforces project policy at the boundary. Required fields — author, reasoning, whatever the project demands — are validated structurally. Enforcement is identical across all entry paths.

The membrane does NOT define: how keystrokes become operations internally, what the pending UI looks like, or how real-time multi-writer coordination works.

**Layer 3: The File.** Body plus footnote log. The self-describing editorial interchange artifact. This is the protagonist of the system. Detailed format in §3, editorial semantics in §4, integrity model in §5.

**Layer 4: External History / Recovery.** Any mechanism that preserves file snapshots over time — git, jj, manual backups, cloud sync. This specification does not name a specific tool. The outer layer provides geological recovery, compaction backstop, and character-level forensics (`git log -S` or equivalent). It does NOT provide current editorial state, review governance, anchor resolution, or the trust surface — those are the file's responsibility.

### Tooling obligations

Any tool that writes a ChangeTracks file — editor, CLI, MCP handler, import/export pipeline, merge tool — has obligations to the file format. These apply in order of priority:

1. **Never silently lose editorial state.** A tool crash, a failed write, an interrupted operation — none of these should silently drop footnotes, strip references, or flatten attribution.
2. **Keep the log honest.** The footnote log must reflect what actually happened, not what the tool wished had happened.
3. **Maintain anchors when you can; surface degradation when you can't.** Perfect anchor maintenance is ideal. Honest degradation reporting is acceptable. Silent degradation is a specification violation.
4. **Be forgiving on input; be precise on output.** Accept messy human edits gracefully. Produce clean, well-formed output.

The parser must be forgiving — humans edit body and footnotes directly, make formatting mistakes, leave messy metadata. The parser should recover what it can and flag what it cannot. But the surface must be honest — never present unresolvable state as resolved (Law 7), and never silently flatten information (Law 10).

Tools MUST preserve unrecognized `key: value` body lines in footnotes through all operations (§3: metadata extension surface). A tool that does not understand a metadata key must carry it forward unchanged.

### L2 and L3: dual serializations, one editorial state

L2 and L3 are not different formats. They are two serializations of the same editorial state.

**L2** (default on-disk representation) shows edits inline with CriticMarkup delimiters: `The team new prototype`. Any markdown reader can see what changed. The intent lives in the byte stream. Anchoring is positional — operations live directly in the body text at their location. L2 is the default because it is more instantly readable and more resistant to silent ignoring of editorial state by tooling that does not understand CriticMarkup — such tooling will still show the delimiters rather than presenting clean text as if no changes exist.

**L3** (editor projection) presents a clean body with anchored edit-ops in the footnote log: `The team new prototype` with `1:a3 new ` in the footnote. Editors work without cursor corruption, selection errors, or line-wrapping artifacts. Anchoring is content-addressed — LINE:HASH plus contextual embedding. L3 is the working format for editors that understand ChangeTracks. A tool that opens an L3 file without understanding the footnote section sees clean text but misses the editorial state — this is why L2 is the default for interchange.

The conversion between them is lossless. L2 → L3 → L2 round-trips preserve all editorial state. The laws governing editorial state apply to both serializations because they ARE the same state. All editorial operations, projections, review decisions, and compaction apply regardless of serialization. The anchoring mechanisms differ (L2 positional, L3 content-addressed), and L3's maintenance cascade (§5) is specific to content-addressed anchoring, but the editorial semantics are identical.

**L2 and L3 are serialization choices, not capability tiers.** Neither serialization may silently gain or lose capabilities relative to the other (Law 4). Implementation may use transparent promotion (L2 → L3 internally for scrubbing or projection computation, L3 → L2 on persist) but that is mechanism, not architecture.

The machinery that keeps L2 and L3 in sync — lossless bidirectional conversion, shared editorial semantics, the append-only footnote log, content-addressed anchoring, contextual embedding — is a core architectural contribution of ChangeTracks. L2 and L3 are two views of this machinery. The machinery is what this specification defines.

### Three projections

The body text is not "the text." It is a projection — a materialized view of the footnote log. Three canonical projections are defined. All surfaces — MCP tools, editors, CLI — use the same vocabulary.

| Projection | Proposed ops | Accepted ops | Rejected ops | Purpose |
|---|---|---|---|---|
| **Current** (on-disk body) | Effect shown | Effect shown | Rejection's effect shown | Anchor surface, decoration base |
| **Decided** | Excluded (unapplied) | Applied | Rejection applied | What's been finalized — no speculation |
| **Original** | Excluded | Excluded | Excluded | Base text before any tracking |

**Current** is the on-disk body — the actual bytes in the file. Every footnote's anchor resolves against Current.

**Decided** shows only finalized decisions. It is computed by unapplying all proposed operations from Current. It is what you send to a stakeholder who does not need to see open proposals. (The codebase currently uses "settled" for this projection; this specification renames it to "Decided" to avoid overloading the term "settlement," which has accumulated multiple meanings across the project's history.)

**Original** shows the base text before any tracking. It is computed by unapplying all operations from Current via the scrubbing backward pass (§5). This requires reconstructing intermediate body states because naive reverse-order unapplication produces incorrect results when later operations have consumed earlier ones.

### The matching cascade

`findUniqueMatch` is the shared resolution primitive. It takes a contextual embedding (a CriticMarkup operation with surrounding body text) and locates the precise byte range in Current where the operation applies.

The cascade proceeds through progressively fuzzier matching. The level numbering follows the implementation (code is the source of truth for cascade order):

1. **Exact** — byte-for-byte match with uniqueness check
1.5. **Ref-transparent** — strips `[^ct-N]` footnote references from both sides (promoted early because refs are common in tracked files)
2. **NFKC** — Unicode normalization
3. **Whitespace-collapsed** — all whitespace runs collapsed to single space
5. **Committed-text** — strips proposed and rejected CriticMarkup, matches against text with only accepted changes visible
6. **Decided-text** — strips all CriticMarkup, matches against decided-state text (called "settled-text" in the current codebase; renamed here to align with the Decided projection vocabulary)

Each level is tried only if the previous fails. The cascade returns the match position, the matched text, and which level succeeded. The cascade is diagnostic — it tells you which level matched. It never silently transforms input. Confusable characters (smart quotes, en dashes) are detected and reported in error messages but never silently normalized.

The same cascade serves four purposes:
1. MCP coordinate resolution — agent sends an operation, server resolves against Current
2. L3 footnote parsing — parser reads an anchored edit-op and resolves against Current
3. Anchor re-validation — after body mutation, the maintenance cascade re-resolves each footnote
4. Re-anchoring suggestions — when resolution fails, the cascade suggests possible locations

### Self-sufficiency

The file never depends on an external system for correctness. The outer history layer is optional — it provides geological recovery and compaction backstop, but the file works without it. A file emailed without git history is a valid, assessable editorial artifact. You can read it, review its proposals, accept or reject changes, and continue editing. You cannot rewind past what the file carries — that requires the outer layer.

### VCS citizenship

The file format is VCS-agnostic:

- **Plain text** — any VCS that handles text files handles ChangeTracks files
- **Merge-friendly** — the append-only footnote log means body changes and footnote additions are in separate regions
- **Footnote ID renumbering** — when two branches both add footnotes, duplicate `ct-N` numbering is resolved by mechanical renumbering (IDs are document-unique integers)
- **Conflict model compatibility** — the editorial model (proposals, supersede, accept/reject) is designed to be mappable onto VCS-native conflict models without specifying the mapping

---

## §3 The File Format

### Inline change syntax

Five change types expressed in CriticMarkup:

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

In L2, all five types are inline in the body text. Highlights wrap existing body text in `...` delimiters. Comments insert `` at their anchor point. Insertions, deletions, and substitutions modify body text directly. In L3, all five types are expressed as anchored edit-ops in footnotes, and the body is clean.

### Change IDs and footnote references

Each change has a footnote reference linking it to structured metadata:

```markdown
The API should use GraphQL for the public interface.
```

`[^ct-1]` is a standard markdown footnote reference. All IDs use the `ct-` prefix. IDs are document-unique and monotonically increasing — new changes always use the next integer after the highest existing ID, even if earlier IDs have been removed by compaction.

### Footnote header

The footnote definition carries author, date, type, and status:

```
[^ct-1]: @alice | 2024-01-15 | sub | proposed
```

| Field | Values | Notes |
|-------|--------|-------|
| Author | `@alice`, `@ai:claude-opus-4.6` | Opaque string; convention composition via `:` (see §6) |
| Date | `2024-01-15` | ISO 8601 date |
| Type | `ins`, `del`, `sub`, `highlight`, `comment`, `move` | Change type (`move` for grouped operations) |
| Status | `proposed`, `accepted`, `rejected` | Three statuses only |

### Footnote body

The footnote body consists of indented continuation lines. Each line type serves a specific purpose:

**Edit-op line (L3).** The anchored editorial operation, expressed as a contextual embedding:

```
    15:c1 surrounding text new more context
```

`15` is the 1-indexed line number. `c1` is the xxhash of the clean body line content (8-bit by default, configurable to 12-bit or 16-bit). The surrounding text is expanded with word-boundary snapping until the match is unique on the target line. The edit-op line is immutable once crystallized — the editorial content of a footnote is write-once.

**Review lines.** Each review action is a separate line with author, timestamp, and optional quoted reasoning:

```
    approved: @eve 2024-01-20 "Benchmarks look good"
    rejected: @carol 2024-01-19 "Needs more benchmarking"
    request-changes: @eve 2024-01-18 "Pick one protocol" [blocking]
    withdrew: @carol 2024-01-20 "Issue addressed in separate change ct-5"
```

`request-changes` supports optional labels in brackets: `[suggestion]`, `[issue]`, `[security]`, `[blocking]`, `[nitpick]`, etc. Label-to-enforcement mapping is project-configured policy (§6).

When an approval overrides a blocking request-changes, the system adds a structural annotation:

```
    approved: @bob 2024-01-20 "Acceptable risk" (override: request-changes @carol [blocking])
```

**Discussion threads.** Comments start with `@author date:` and replies indent 2 spaces deeper than their parent:

```
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
```

**Resolution markers.** Close or reopen a discussion thread:

```
    resolved @dave 2024-01-17
    open -- awaiting load test results from @dave
```

**Cross-references.** Link operations in a supersede chain:

```
    supersedes: ct-1
    superseded-by: ct-4
```

`supersedes:` on the new operation declares it replaces an existing one. `superseded-by:` on the consumed operation is the back-reference.

**Context line (L2 only).** In L2 footnotes, an optional line anchors the change to surrounding text, with braces marking the changed span:

```
    context: "The API should use {REST} for the public interface"
```

In L3, the contextual embedding in the edit-op line serves the same purpose — the surrounding text in `15:c1 The API should use GraphQL for the public` IS the context. The `context:` line is the L2 equivalent. Both carry enough surrounding text to make the operation uniquely locatable.

**Revision chain.** When an operation is superseded, its revision chain is traceable via `supersedes:` / `superseded-by:` references across footnotes. Each revision is a separate footnote with its own governance record (§4). The older in-place `revisions:` / `revised` / `previous:` mechanism is deprecated and replaced by the supersede model. New implementations MUST use `supersedes:` references. Parsers SHOULD accept the older mechanism for backward compatibility but MUST NOT produce it.

**Metadata extension surface.** Unrecognized `key: value` lines in footnotes constitute the metadata extension surface. Tools MUST preserve unrecognized body lines through all operations: read, write, L2↔L3 conversion, settlement, and compaction of the containing footnote. A tool that encounters `basis: suggested` or `reviewed: @bob skimmed 2024-01-20` and does not understand these keys must carry them forward unchanged.

This mechanism supports future conventions without format versioning. New coordination metadata — provenance context, review depth, generation method, source attribution — rides as `key: value` body lines that existing parsers ignore and existing round-trips preserve. Well-known keys may be promoted to parser-recognized fields in future revisions, but the preservation guarantee means they work before that promotion happens.

### Grouped changes

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

Accept/reject works at both levels: accept `ct-17` cascades to all proposed children; reject `ct-17.2` carves out one exception. Already-decided children are unaffected by parent cascades.

### Supersede references

Supersede is the single primitive for creating a new operation that replaces an existing one (§4). The relationship is declared with cross-references:

```
[^ct-1]: @alice | 2024-01-15 | sub | proposed
    superseded-by: ct-4

[^ct-4]: @bob | 2024-01-17 | sub | proposed
    supersedes: ct-1
    @bob 2024-01-17: gRPC is better suited for internal services.
```

The consumed operation (`ct-1`) stays in the log with its full governance record. Only the `superseded-by:` reference is added. The new operation (`ct-4`) carries `supersedes:` to declare the relationship.

### File tracking header

An HTML comment on the first line declares tracking status:

```
<!-- ctrcks.com/v2: tracked -->
```

The version number (`v2`) indicates conformance with this specification. Files created under the v1 specification use `<!-- ctrcks.com/v1: tracked -->` and remain valid — v2 is a superset. Tools auto-insert this header on the first tracked edit. If the file has YAML frontmatter, the header goes after the closing `---`.

### Compaction boundary marker

A compaction boundary is a footnote marking where the current slice begins:

```
[^ct-compact]: @alice | 2024-03-20 | compaction-boundary
    compacted-by: changetracks v0.1.0
```

Attribution and timestamp in the header are required. Additional metadata — a boundary hash, a count of prior changes, a note — is the compactor's choice. The format supports arbitrary continuation lines via the metadata extension surface.

The boundary says when the slice began and who compacted. It does not mandate disclosure of how many changes existed before, what their resolution state was, or why compaction happened. The compactor chooses how much history enters the artifact (§6: anti-surveillance principle).

### L2 serialization

In L2, operations are inline in the body text with `[^ct-N]` references linking to the footnote section:

```markdown
The API should use GraphQL for the public interface
and gRPC for internal service communication.

Authentication uses OAuth 2.0 with JWT tokens for
all endpoints.

[^ct-1]: @alice | 2024-01-15 | sub | proposed
    context: "The API should use {REST} for the public interface"
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching.

[^ct-2]: @alice | 2024-01-15 | ins | proposed
```

The `[^ct-N]` references are connective tissue — ligaments between body text and its deliberation history. When body text survives an operation (accepted insertion stays, rejected deletion is restored), the footnote reference survives with it. When body text is removed (accepted deletion, rejected insertion), the reference goes with it, but the footnote definition persists in the log.

### L3 serialization

In L3, the body is clean — no CriticMarkup delimiters, no footnote references. Each footnote carries an anchored edit-op line:

```markdown
The API should use GraphQL for the public interface
and gRPC for internal service communication.

Authentication uses OAuth 2.0 with JWT tokens for
all endpoints.

[^ct-1]: @alice | 2024-01-15 | sub | proposed
    1:a3 The API should use GraphQL for the public
    context: "The API should use {REST} for the public interface"
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching.

[^ct-2]: @alice | 2024-01-15 | ins | proposed
    3:b7 Authentication uses OAuth 2.0 with JWT tokens for
```

The edit-op line format is `LINE:HASH contextBefore{operation}contextAfter`. The matching cascade (`findUniqueMatch`) re-locates changes during L3→L2 conversion even if the body has been edited since the anchor was computed.

---

## §4 The Editorial Operation Model

### The log

The footnote section is an ordered, replayable sequence of editorial operations. Each entry carries:

- **An operation** expressed in CriticMarkup: `text`, ``, `new`, `text`, ``
- **An anchor** — in L3, a LINE:HASH plus contextual embedding; in L2, inline position plus footnote reference
- **Governance metadata** — author, date, type, status, review decisions with reasoning, discussion threads

The log is append-only during normal editing. New entries arrive from the crystallization membrane. Review decisions update existing entries' status and add review lines but do not remove or reorder entries. The edit-op content of each entry is immutable once crystallized — status transitions and review line additions are the only defined mutation points.

Each entry carries enough information to both **apply** and **unapply** its operation:

| Operation | Apply | Unapply |
|---|---|---|
| Insertion `text` | Add text at anchor location | Remove text from anchor location |
| Deletion `` | Remove text at anchor location | Restore text at anchor location |
| Substitution `new` | Replace old with new | Replace new with old |
| Highlight `text` | Mark text (L2: wrap in delimiters; L3: footnote decoration) | Unmark text |
| Comment `` | Attach comment (L2: insert at anchor; L3: footnote only) | Remove comment |

This bidirectional capability makes the log replayable in both directions — forward to compute projections, backward to reconstruct earlier states. This is structurally identical to Eg-walker's retreat/advance operations (Gentle & Kleppmann, EuroSys 2025), operating on editorial operations with string splicing rather than character-level CRDT state.

### Body as projection

The on-disk body is the **Current** projection. Proposed and accepted operations show their effect: insertions present, deletions absent, substitutions showing new text. Rejected operations show the rejection's effect: rejected insertions absent, rejected deletions restored, rejected substitutions showing original text. Highlights are unwrapped; comments are stripped.

Current is the anchor surface: every footnote's LINE:HASH and contextual embedding resolves against Current. It is the actual bytes in the file.

The **Decided** and **Original** projections are computed from Current by selectively unapplying operations via the replay mechanism (§2). They are never stored separately — they are derived on demand.

**The body is a configurable projection of the log.** Current is the default because it makes anchor resolution easiest — proposed text is already present and directly findable. But the architecture does not require a specific projection. A Decided-body L3 file (where proposed changes exist only in footnotes) is coherent and reconstructable from the log.

### Body mutations

The body (Current) changes on exactly two triggers:

1. **Crystallization** — a new operation arrives from the membrane. The body text changes (text inserted, deleted, or substituted). A new footnote is appended. The maintenance cascade runs.

2. **Reject decision** — an operation's effect is reversed in the body (rejected insertion removed, rejected deletion restored, rejected substitution reverted). The footnote's status updates. The maintenance cascade runs.

**Accept decisions do NOT mutate the body.** Current already shows the accepted state. Only the footnote status changes. No maintenance cascade needed.

### The maintenance cascade

When the body mutates (crystallization or reject), the file must return to a coherent state. The maintenance cascade is one mechanism — identical for both triggers:

1. **Apply the body mutation** — insert, delete, substitute, or revert text in Current
2. **Append or update the footnote** — new entry on crystallization, status change on reject
3. **Recompute line hashes** for affected lines and their neighbors
4. **For each existing footnote**, verify anchor coherence:
   - LINE:HASH matches at expected line → verify contextual embedding → **done** (fast path)
   - Hash mismatch → scan for the line with that hash elsewhere → if found, update line number, re-verify embedding
   - Hash not found → fall back to `findUniqueMatch` on contextual text alone
   - Context match found at new location → rewrite footnote anchor with fresh LINE:HASH + embedding
   - No match found → mark unresolved, surface diagnostic
5. **Coherence check** — if unresolved count exceeds threshold on this mutation, warn

**Optimization:** If a footnote's LINE:HASH still matches and the contextual embedding resolves via exact match, no work is needed. Most footnotes are unaffected by any single mutation. The cascade is O(affected), not O(total).

### Supersede: the single revision primitive

Supersede replaces the older amend/supersede split. It is the single primitive for creating a new operation that replaces an existing one.

**Same-author supersede is revision:**
```
[^ct-1]: @alice | 2024-01-15 | sub | proposed
    superseded-by: ct-2
    5:a3 OAuth2
    approved: @bob 2024-01-16 "Correct direction"
    request-changes: @carol 2024-01-16 "Specify grant type"

[^ct-2]: @alice | 2024-01-17 | sub | proposed
    supersedes: ct-1
    5:a3 OAuth2 with Authorization Code flow
    @alice 2024-01-17: Incorporated Carol's feedback on grant type
```

**Different-author supersede is offering an alternative:**
```
[^ct-3]: @carol | 2024-01-17 | sub | proposed
    supersedes: ct-1
    5:a3 mTLS with client certificates
    @carol 2024-01-17: OAuth2 is wrong for service-to-service auth
```

Same mechanism. Attribution tells you whether it is a revision or an alternative.

**Why supersede replaces in-place amendment.** When an author amends in place, existing approvals become ambiguous — what exactly was the reviewer approving? With supersede, ct-1 and ct-2 are separate operations. Bob's approval lives unambiguously on ct-1. ct-2 has no approvals and needs fresh review. Each operation's governance record is complete and self-contained. This is the Gerrit patch-set model applied to editorial operations: each revision is a separate version with its own review state (Google Gerrit).

The append-only log property is preserved: no operation modifies an existing footnote's editorial content. Amendment creates a new operation that consumes the old one. This aligns with Stewen & Kleppmann's model of undo as a `RestoreOp` — a new immutable operation, not a mutation of the original (PaPoC 2024).

### Consumed operations

When a later operation modifies text created by an earlier operation, the earlier operation is **consumed** — its visible effect in Current has been absorbed or replaced.

**Formal definition.** An operation is redundant when removing it from the log does not change the body (ReDunT, Borrego et al., PaPoC 2025). In practice, detection may use cheaper heuristics (checking whether the operation's anchor text still exists in Current) with full replay as confirmation.

**Treatment.** Consumed operations are NOT removed from the log. They retain their full governance metadata — who proposed, when, why, review decisions, discussion. They remain in the footnote section. Decorations may render them differently (dimmed, "consumed by ct-N" indicator).

**Rejecting a consumed operation.** When a user rejects an operation that has been consumed by later operations, the system traces the full dependency chain via replay:

1. The scrubbing backward pass (§5) unapplies operations in reverse order to reach the body state before the rejected operation
2. Replay forward skipping the rejected operation — each subsequent operation re-resolved against the evolving body state
3. Dependency failures collected — operations whose anchors cannot resolve without the rejected operation
4. The system presents the chain with actionable options: which operations would break, where their text could be re-anchored, and what the human needs to decide
5. The system never auto-resolves consumed-op conflicts — human escalation

This is the human escalation strategy, validated by the literature: Dolan (PODC 2020) proved that no replicated data type beyond simple counters can support general-purpose undo satisfying both commutativity and inverse properties. Yu et al. (DAIS 2015) identified "undesirable undo effects" when undoing operations whose text has been modified. ChangeTracks sidesteps the impossibility by delegating consumed-op conflicts to human judgment.

### Highlights and comments

Highlights mark existing body text. Comments attach annotation at an anchor point.

In L2, both are inline CriticMarkup in the body. Highlights wrap text in `...` delimiters — the underlying text is unchanged but the delimiters are present in the byte stream and must be hidden or rendered by tooling. Comments insert `` at their anchor point, adding text to the body that exists only as annotation.

In L3, both are expressed as anchored edit-ops in footnotes, same as other operation types. The body is clean.

In settlement, highlight delimiters are stripped and comment text is removed, leaving the underlying body text intact.

The matching cascade, anchoring, maintenance cascade, and all editorial operations apply uniformly to all five operation types. There is no special case for highlights or comments in the resolution or integrity model.

---

## §5 Anchor Integrity

### The correctness model

Each footnote's anchor is valid in the body state at the time the footnote was created — its **intermediate body state**, not the final body. The log is an ordered sequence of operations; each operation was applied to a specific body state. The system verifies correctness by reconstructing that state.

This is the same structural operation as Eg-walker's retreat/advance (Gentle & Kleppmann, EuroSys 2025, Section 3.2): the backward pass un-applies operations to reconstruct earlier body states; the forward pass re-applies them with fresh anchors. The key difference: Eg-walker operates on character-level CRDT state; ChangeTracks operates on the body text directly with string splicing. This works because ChangeTracks' log is linear (single-writer sessions produce strictly ordered operations), so there is no interleaving to resolve.

### The resolution protocol

Resolution is a single algorithm with fast-path exits. These are implementation tiers, not different resolution "levels" or "states":

1. **Hash match**: LINE:HASH matches at the expected line AND the contextual embedding resolves via exact `findUniqueMatch` → **resolved**. No replay needed. This is the common case — most footnotes are unaffected by any single edit.

2. **Hash relocation**: LINE:HASH mismatches but the hash is found at another line → update line number, re-verify contextual embedding → **resolved**. Handles line insertions and deletions above the anchor.

3. **Context match**: hash not found anywhere, but `findUniqueMatch` on the contextual embedding alone locates the text at a new position → rewrite anchor with fresh LINE:HASH → **resolved**. Handles content changes on the anchor's original line.

4. **Intermediate-state replay**: none of the above succeed. The scrubbing backward pass un-applies operations in reverse log order to reconstruct intermediate body states. Each footnote is resolved against its proper intermediate state. The forward pass replays operations computing fresh anchors → **resolved** if the text is findable in its intermediate state.

5. **Unresolved**: no mechanism finds the anchor text in any body state. The footnote persists with diagnostic context. Human escalation.

### Binary resolution

A footnote is **resolved** or **unresolved**. There are no intermediate states like "relocated," "fuzzy-matched," or "scrub-resolved." The mechanism by which resolution succeeded is diagnostic metadata — useful for tooling and debugging, but not a property of the footnote or the file.

### Redundancy is orthogonal

Redundancy (active vs consumed) is a separate property, also computed by replay. A footnote can be:

- **Resolved + active**: the normal case. The change is findable and its effect is visible in Current.
- **Resolved + consumed**: edit-over-edit case. Findable in its intermediate state but its visible effect was absorbed by a later operation.
- **Unresolved**: the anchor text cannot be found in any body state. Governance metadata preserved.

### Body-log coherence

In L3, the body is the Current projection of the log. The log is authoritative; the body is one materialization of it.

**Decided changes MUST retain full edit-op lines.** When a change is accepted or rejected, its edit-op line is preserved in the footnote. Only the status field in the header changes. The edit-op line is how any tool verifies that the body correctly projects the log. A decided footnote without its edit-op line is unverifiable — stripping it is a specification violation.

A decided footnote with its full edit-op:
```
[^ct-3]: @alice | 2024-03-15 | sub | accepted
    5:a3 Protocol newverview
    approved: @bob 2024-03-16 "Correct terminology"
```

Any tool can verify: does the body at line 5 contain "Protocol newverview"? If yes, body-log coherence holds for this footnote.

### Coherence health check

On file open, the system runs the full resolution protocol — every footnote anchor against Current.

**Resolution rate as health metric:**

- **100% resolved**: fully coherent, normal operation
- **Above threshold** (configurable, default ≥ 98%): minor drift from small manual edits. Unresolved footnotes surfaced as diagnostics. The file is usable but flagged.
- **Below threshold**: degraded state. The file was likely edited substantially outside the membrane. Surfaced honestly — the system does not silently treat the file as conflict-free.

The threshold is configurable per project (policy), but the requirement to check and surface is structural (non-negotiable). The system never silently presents unresolved anchors as resolved.

### Scrubbing: the two-pass algorithm

**Backward pass.** Un-apply operations in reverse log order, reconstructing intermediate body states. Each footnote is resolved against its proper intermediate state. The backward pass produces body_0 (the Original projection) and resolution data for each footnote.

**Forward pass.** Replay operations from body_0, computing fresh anchors (LINE:HASH + contextual embedding) against each successive body state. Re-expand contextual embeddings to maintain uniqueness against the new body state. The final positions after all operations are the Current positions — the output that consumers (decorators, review panels, MCP tools) receive.

**Scope.** Decided changes form natural coherence boundaries. Scrubbing only processes proposed changes sitting on top of the decided base. For a document with 50 decided changes and 5 proposed changes, a crystallization scrubs through at most 5 footnotes. This is Eg-walker's critical version optimization: replay only from the last critical version. Performance is O(active-proposed-changes) per crystallization, not O(total-footnotes).

**Uniqueness preservation.** The forward pass recomputes contextual embeddings for each footnote, re-expanding until unique against the new body state. A previously-unique context may need to grow if similar text appeared nearby, or shrink if disambiguating text was removed.

### Coherent slices and compaction

A coherent slice is:
- A **base body** — the body at the start of the slice, serving as ground truth
- A **footnote window** — a contiguous subset of the log (e.g., ct-190 through ct-195)
- Each footnote carrying its full edit-op line, governance metadata, and discussion threads

Within a slice, the resolution protocol works on the footnote window only. Scrubbing backward reaches the base body. Scrubbing forward replays with fresh anchors. The slice is self-describing: any tool can verify body-log coherence for everything in the window without history beyond the slice boundary.

**Compaction is footnote pruning.** In L3, decided footnotes are removed from the log. The body does not change — it already has the effects of decided changes. L2 compaction is: promote to L3, compact (prune footnotes), demote to L2.

**Compaction is a governance action, never silent.** The ideal compaction boundary has all prior footnotes decided and resolved. But the system does not block compaction past undecided or unresolved state — it surfaces the conditions, records the choice, and proceeds. The compactor sees what they are compacting and chooses the depth (§6).

**Boundary guard.** Post-compaction references to pre-boundary footnote IDs (e.g., `supersedes: ct-5` when ct-5 has been compacted out) produce an explicit diagnostic, not a silent no-op. A `supersedes:` reference pointing past the compaction boundary is informational — it says "this operation replaced something from before the slice."

**Self-sufficiency test.** A compacted file must be parseable, all LINE:HASH anchors must resolve, and no dangling footnote references may exist within the slice. This follows Loro's pattern of verifying that shallow snapshots can bootstrap a new peer from scratch.

### External edits and decoherence

The intermediate-state correctness model assumes the log is a faithful record of all body mutations. When someone edits the body outside the membrane (plain text editor, no crystallization, no footnote), the body becomes inconsistent with the log.

The coherence health check catches this on next open. The system surfaces the decoherence honestly:

- **Above threshold**: "Minor drift detected. N footnotes relocated, M unresolved." The file is usable with diagnostics.
- **Below threshold**: "Substantial decoherence. Recovery options: re-anchor via matching cascade, inspect VCS history, manual resolution."

**Recovery protocol:**
1. Automatic re-anchoring — the resolution protocol (including scrubbing) resolves what it can
2. Assisted re-anchoring — for unresolved footnotes, `findUniqueMatch` suggests possible locations where text fragments survive
3. Manual resolution — for footnotes that cannot be automatically resolved, preserved with diagnostic context for human judgment
4. Geological recovery — VCS history provides the backstop

### Known limits

**Anchor uniqueness ceiling.** Identical text appearing twice on the same line with identical surrounding context is a hard floor on deterministic resolution. `findUniqueMatch` reports ambiguity, and the coherence health check surfaces it. This limit is shared with W3C TextQuoteSelector and Hypothes.is fuzzy anchoring. Possible mitigations (character offset tiebreaker, cross-line context expansion) are deferred.

**Hash collision rate.** The 8-bit hash (xxHash32 mod 256) has a ~0.4% collision rate per line. At 100 lines, approximately 33% chance of at least one collision somewhere. The contextual embedding disambiguates in practice, but the hash-gate optimization may miss stale anchors. Hash width is configurable: 12-bit (3 hex chars, ~0.02% collision rate) or 16-bit (4 hex chars, ~0.002%) are available. The default balances compactness against collision tolerance.

---

## §6 The Participation Contract

### The file as reduced interface

The file is where different kinds of mind meet. Humans project into it through keystrokes. Agents project into it through MCP tool calls. Importers project into it through format conversion. The membrane is agnostic about HOW proposals arrive. The participation contract specifies what happens AFTER the operation lands in the file.

### Five participant roles

These are relationships with the file, not user accounts. A single person may act in multiple roles.

**Author.** Creates proposals via keyboard, MCP, or import. Can supersede their own proposals (revision). Leaves reasoning when policy requires.

System promises:
- Your work is attributed. The `@author` field in each footnote header carries your identity.
- Your reasoning is preserved. Reasoning fields and discussion entries persist through the footnote's lifetime.
- Your identity is not flattened. Different authors produce different footnote headers. The system never silently merges two authors into one.
- You can revise via supersede. Each revision is a new operation with its own governance record. The full chain is traceable via `supersedes:` references.

**Reviewer.** Accepts, rejects, requests changes, participates in discussion threads, resolves threads.

System promises:
- Your decisions are recorded with reasoning. Review lines carry author, timestamp, and reasoning.
- You can see full deliberation before deciding. The review surface shows inline metadata at point of contact.
- Your approval is for the specific operation you reviewed. If the author supersedes, your approval stays on the original. The new operation needs its own review.
- Nobody silently overrides your decision. But another reviewer may subsequently accept what you rejected, or vice versa. Opinions accumulate; they do not overwrite.

**Reader.** Encounters the file cold — as a slice, after compaction, in a tool that may not understand ChangeTracks.

System promises:
- What you see is honest within the slice. Body-log coherence (§5) ensures the body correctly projects the log.
- The governance record is assessable. Who proposed what, who reviewed it, what discussion occurred, what the decision was.
- After compaction: the boundary tells you where the slice begins and who compacted. The slice is self-describing within its window.

**Compactor.** Makes governance decisions about what history to carry forward.

System promises:
- You choose the depth. The system surfaces what you are compacting but does not block you.
- Your choice is recorded. The compaction boundary carries attribution and timestamp.
- The boundary is a threshold, not a ledger. You are not required to justify or disclose what was removed.

**Agent.** Participates through MCP with no persistent identity across sessions.

System promises:
- The read surface carries deliberation context. Inline metadata annotations mean you can participate without re-discovering the editorial state.
- The tools match your cognitive units. Batch operations, LINE:HASH coordinates, contextual embeddings.
- Your contributions are treated the same as human contributions. The footnote format is identical. The governance record is identical. Attribution distinguishes; treatment is uniform.
- All editorial actions available to humans are available to agents. Propose, supersede, review, request-changes, thread replies, thread resolution — the full participation surface.

### Editorial choreography

**Workflow 1: Propose → Review.** A proposal is reviewable immediately on crystallization. No draft state. `proposed` means present and decidable. Multiple reviewers review independently and concurrently. Their opinions accumulate as separate review lines.

**Workflow 2: Supersede.** The single primitive for revision and alternatives. The old operation is consumed — stays in the log with its full governance record. The new operation needs fresh review. Consuming ct-1 means rejecting ct-2 may need to "un-consume" ct-1 — this is handled by the dependency chain tracing in §4.

**Workflow 3: Request-changes.** A review action that records a concern. Does NOT change the proposal's status. Blocking behavior is configurable per project via labels:
- None (default): purely informational
- Soft block: system warns on acceptance but allows it; override recorded
- Hard block: system prevents acceptance until resolved

Resolution paths for blocks: supersede (new operation, old block consumed), reviewer approves (later action resolves block), reviewer withdraws (explicit withdrawal without approval).

**Workflow 4: Competing proposals.** When multiple proposals target the same text, the system does not auto-resolve. Each proposal is independent. Accepting one does not auto-reject others. The system may surface "another proposal targets this text" as a warning — warning is assistance; auto-rejection would seize moral authority over the reviewer's editorial process.

**Workflow 5: Discuss → Decide.** Open discussion threads do not block acceptance unless the project configures blocking labels on request-changes. Threads are conversations, not checklists. Post-decision discussion is supported. Thread resolution (`open` → `resolved` → can be unresolve'd) is a governance action available to all participants.

**Workflow 6: Accept → Compact.** Acceptance changes the footnote header status. Applying the decided change (configurable, automatic or manual) incorporates its effect into clean body text — stripping CriticMarkup delimiters in L2, removing edit-op annotations in L3. The footnote is NOT removed by this step — it retains its full edit-op line and governance record (§5: body-log coherence). Compaction (footnote pruning) is a separate governance action. The system never autonomously decides to compact — a configured automation is the project making a governance choice, not the tool.

### Status model

Three states: `proposed`, `accepted`, `rejected`.

**Transitions:**
```
proposed → accepted  (approve)
proposed → rejected  (reject)
accepted → rejected  (reject — explicit override)
rejected → accepted  (approve — rejection is not terminal)
```

**Status resolution rule.** When a footnote has multiple review lines, the last status-changing review action determines the current status. `request_changes` and `withdrew` do not change status. `approve` sets `accepted`. `reject` sets `rejected`. Temporal ordering of review lines is the resolution mechanism — no vote counting, no quorum logic in the structural model. Policy extensions (approval quorums, role-based veto) layer additional rules on top of this base.

**Cascading decisions.** When a parent change is accepted or rejected, its children (dot-notation IDs: `ct-N.M`) cascade:
- Only children with status `proposed` cascade
- Already-decided children are unaffected
- The cascade review line carries attribution: `approved: @reviewer date "reasoning" (cascaded from ct-N)`
- Explicit rejection of a child overrides a prior cascade

**Self-acceptance** is the structural default. Any participant can accept any change, including their own. Cross-review requirements are a policy extension point, configurable per project.

### Identity model

**Format level: identity is an opaque string.** The parser treats `@author` as everything between `@` and `|` in the footnote header. No internal structure is enforced. No parsability limits imposed. The format never becomes a bottleneck for identity granularity.

**Convention level: composition via `:` delimiter.** Documented, not enforced by parser:

```
@alice                              — human, no role
@alice:security-reviewer            — human with role
@ai:claude-opus-4.6                 — agent, model-level
@ai:claude-opus-4.6:code-reviewer   — agent, model + role
@ci:changetracks-lint               — automated system
```

**Principle:** identity must be granular enough that review attribution is meaningful. If two participants are doing different work, they must be distinguishable. Beyond that, granularity is the project's choice.

**Tooling obligation:** the tooling must not silently flatten identity. If two distinct participants produce proposals, the tooling preserves their distinct attribution. This is constitutional.

### Provenance beyond identity

Identity answers WHO. The footnote format carries HOW and WHY through the metadata extension surface (§3).

A footnote's `reason:` field and discussion lines carry free-text context. For tooling that needs structured provenance — generation method, review depth, source attribution — the convention is `key: value` body lines:

```
[^ct-5]: @ai:claude-opus-4.6 | 2024-03-20 | ins | proposed
    12:a3 optimized query
    reason: Reduces N+1 query pattern
    basis: suggested
    source: codebase analysis of db/queries.ts
```

The format preserves `basis:` and `source:` through all operations without understanding them. Whether a project uses these keys, what values are valid, and what tooling does with them is convention, not format. Different provenance contexts may require different review postures — an agent change with `basis: suggested` warrants more scrutiny than `basis: described` — but the system carries the metadata honestly and lets reviewers and policy make the judgment. The principle: inform the reviewer, do not gate the process.

### Governance: structural vs policy

**Structural (in the format, not configurable):**
- Every operation has an author and timestamp in the footnote header
- The log is append-only — no operation modifies an existing footnote's editorial content
- `supersedes:` references are explicit and bidirectional
- Consumed operations retain their full governance metadata
- The body is a projection of the log
- Compaction boundaries carry attribution
- Unrecognized metadata extension lines are preserved through all operations

**Policy (configurable per project):**
- Whether reasoning is required on proposals
- Whether request-changes labels trigger soft or hard blocking
- Whether self-acceptance is allowed
- Whether specific roles are required for specific actions
- Compaction timing and automation
- Which labels are recognized and at what enforcement level
- Approval quorum numbers
- Identity granularity requirements

### The anti-surveillance principle

Participants choose how they enter the forum through compaction boundaries. The boundary is a threshold, not a ledger. The compactor is not required to justify compaction or disclose what was removed.

**Compaction can intentionally lose authorship.** When a footnote is pruned, its `@author` attribution goes with it. The body text persists but nobody can tell who wrote it without the footnote. This is deliberate. The same mechanism that prevents a manager from auditing every edit also prevents an author from being permanently tethered to early draft text. The compactor chooses what history to carry. That choice is governance, and the system records that the choice was made without recording its content.

**What resists abuse:**
- VCS preserves the geological record beyond the file's slice
- The compaction boundary carries the compactor's identity and timestamp
- Suspicious patterns (very early compaction, compaction immediately after controversial decisions) are assessable by any reader
- The system provides the evidence without enforcing the verdict

Projects that need durable authorship attribution — regulatory compliance, academic credit, contractual obligation — configure compaction policy to preserve authorship-carrying footnotes. The format supports both preservation and loss. The choice is governance.

> Design every feature so a good-faith newcomer feels oriented, and a bad-faith manager feels friction.

This sentence, drawn from the project's design principles, is the test applied to every governance decision in this specification. The panopticon (Foucault, 1975) is the anti-pattern. The public sphere (Arendt, 1958) — where participants appear through their actions, not through surveillance — is the aspiration. The tool must serve its users, not create dependency (Illich, 1973).

### The trust surface

The file is a trust architecture. A footnote is evidence of process:

1. **What was proposed** — the CriticMarkup operation
2. **Why it was proposed** — the reasoning field
3. **How it was revised** — the `supersedes:` chain, each revision a separate operation with its own governance record
4. **Who decided and why** — review lines with reasoning
5. **Whether the decision was contested** — multiple review lines, request-changes entries, soft-block overrides
6. **What concerns were raised and how they were resolved** — request-changes with labels, withdrew actions, supersede as resolution

The supersede model makes the trust surface stronger than in-place amendment: each operation's governance record is complete and immutable. A reader never needs to cross-reference `revised`/`previous` lines to understand what was approved — the approval lives on the operation it was made for, and that operation never changes.

The trace substitutes for channels that agents do not have — tone, body language, persistent identity, reputation. When different kinds of mind meet in one file, the governance trace is what makes collaboration assessable rather than opaque. Each layer of deliberation makes the trace richer, which makes the next participant's trust judgment better-informed. Anchored feedback produces greater perceived agency and more targeted revisions than detached commentary (AnchoredAI, 2025).

---

## §7 Open Design Questions

These are identified areas requiring further design work. They do not block the architectural commitments in this specification.

1. **Footnote order as causal semantics.** Is footnote order (ct-1 before ct-2) sufficient causal information, or do some multi-writer scenarios require explicit dependency metadata? The current model assumes linear ordering; fork-and-merge scenarios may need richer causal structure.

2. **Multi-line operation encoding.** How does the L3 footnote format encode operations spanning multiple lines? The MCP surface supports hash ranges (`at:"5:a1-8:b3"`); the L3 format may need an equivalent encoding for anchored edit-ops that cross line boundaries.

3. **Hash collision handling within a line.** When two different lines produce the same hash, the contextual embedding disambiguates in practice. Edge cases where hash collisions coincide with similar context need analysis.

4. **Stacked edits and multi-author dependencies.** The append-only log carries implicit causal ordering. Supersede/amend chains create explicit relationships. Multi-author scenarios where agents and humans propose simultaneously may need the shape of dependency tracking revisited.

5. **Withdraw semantics.** Is `withdrew:` the right term for a reviewer retracting a `request-changes`? Alternatives: `dismissed` (GitHub's term), `retracted`. The semantics are clear — the action exists; the name is open.

6. **Soft-block override format.** The `(override: request-changes @carol [blocking])` annotation on approval lines is structural (system-added, not reviewer-authored). The exact format needs to be parseable for governance assessment. The format is open.

7. **Status of consumed operations.** When ct-2 supersedes ct-1, ct-1's status stays as-is (e.g., `accepted`) but it is consumed. A reader seeing `accepted` on a consumed operation may be confused. Whether consumed operations gain a visual indicator, a separate status, or remain status-unchanged with consumption as an orthogonal computed property needs resolution.

8. **Incremental maintenance under rapid editing.** Post-crystallization scrubbing is O(active-proposed-changes) per crystallization. With many proposed changes and rapid typing, the performance envelope needs empirical validation.

---

## §8 Complete Example

### L2 (on-disk default)

A document with five tracked changes demonstrating proposals, acceptance, rejection, supersede, discussion, grouped changes, and a compaction boundary.

```markdown
<!-- ctrcks.com/v2: tracked -->
# API Design Document

The API should use GraphQL for the public interface
and gRPC for internal service communication.

Authentication uses OAuth 2.0 with PKCE flow for
all endpoints. Rate limiting is set to 100 req/min.

[^ct-compact]: @alice | 2024-01-20 | compaction-boundary
    compacted-by: changetracks v0.1.0

[^ct-3]: @alice | 2024-01-15 | sub | accepted
    context: "The API should use {REST} for the public interface"
    @alice 2024-01-15: GraphQL reduces over-fetching. See PR #42 — 3x fewer round trips.
    approved: @bob 2024-01-20 "Benchmarks are convincing"
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17

[^ct-4]: @alice | 2024-01-15 | ins | accepted
    approved: @bob 2024-01-20

[^ct-5]: @carol | 2024-01-17 | highlight | proposed
    @carol 2024-01-17: 100/min is low. Our traffic averages 80/min with spikes to 200.
      @alice 2024-01-18: Depends on infrastructure costs. @dave can you model this?
      @dave 2024-01-19: I can run load tests next week.
    open -- awaiting load test results from @dave

[^ct-6]: @bob | 2024-01-18 | del | rejected
    @bob 2024-01-18: Legacy XML endpoint is unused — telemetry shows 0 calls in 30 days.
    rejected: @alice 2024-01-19 "Partner integration still depends on it — check with @carol"

[^ct-7]: @alice | 2024-02-01 | sub | proposed
    supersedes: ct-7-original
    context: "Authentication uses {API keys} for all endpoints"
    @alice 2024-02-01: Switched from OAuth2 to PKCE flow per Carol's security review.
    reason: Incorporated feedback from security review on grant type
    request-changes: @carol 2024-02-02 "Add token rotation schedule" [security]
```

This file demonstrates:
- **ct-3**: accepted substitution with discussion thread and resolution
- **ct-4**: accepted insertion (simple)
- **ct-5**: proposed highlight with attached comment and open discussion
- **ct-6**: rejected deletion with reasoning on both sides
- **ct-7**: proposed substitution that supersedes an earlier change, with a blocking request-changes
- **ct-compact**: compaction boundary showing 2 prior changes were pruned

### L3 (editor projection)

The same editorial state in L3. The body is clean — no CriticMarkup delimiters, no footnote references:

```markdown
<!-- ctrcks.com/v2: tracked -->
# API Design Document

The API should use GraphQL for the public interface
and gRPC for internal service communication.

Authentication uses OAuth 2.0 with PKCE flow for
all endpoints. Rate limiting is set to 100 req/min.

[^ct-compact]: @alice | 2024-01-20 | compaction-boundary
    compacted-by: changetracks v0.1.0

[^ct-3]: @alice | 2024-01-15 | sub | accepted
    3:a7 The API should use GraphQL for the public
    @alice 2024-01-15: GraphQL reduces over-fetching. See PR #42 — 3x fewer round trips.
    approved: @bob 2024-01-20 "Benchmarks are convincing"
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17

[^ct-4]: @alice | 2024-01-15 | ins | accepted
    4:c2 and gRPC for internal service communication.
    approved: @bob 2024-01-20

[^ct-5]: @carol | 2024-01-17 | highlight | proposed
    6:e1 Rate limiting is set to 100 req/min
    @carol 2024-01-17: 100/min is low. Our traffic averages 80/min with spikes to 200.
      @alice 2024-01-18: Depends on infrastructure costs. @dave can you model this?
      @dave 2024-01-19: I can run load tests next week.
    open -- awaiting load test results from @dave

[^ct-6]: @bob | 2024-01-18 | del | rejected
    6:e1 
    @bob 2024-01-18: Legacy XML endpoint is unused — telemetry shows 0 calls in 30 days.
    rejected: @alice 2024-01-19 "Partner integration still depends on it — check with @carol"

[^ct-7]: @alice | 2024-02-01 | sub | proposed
    supersedes: ct-7-original
    6:b3 Authentication uses OAuth 2.0 with PKCE flow for
    @alice 2024-02-01: Switched from OAuth2 to PKCE flow per Carol's security review.
    reason: Incorporated feedback from security review on grant type
    request-changes: @carol 2024-02-02 "Add token rotation schedule" [security]
```

Note: the L3 body shows the Current projection — proposed and accepted changes show their effect, rejected changes show the rejection's effect. The rejected deletion (ct-6) has its text restored in the body because the deletion was rejected. The footnote log carries the full editorial history including the edit-op lines that make body-log coherence verifiable.

### Three projections of this document

| Projection | Body text (paragraph 1) |
|---|---|
| **Current** | The API should use GraphQL for the public interface and gRPC for internal service communication. |
| **Decided** | The API should use GraphQL for the public interface and gRPC for internal service communication. |
| **Original** | The API should use REST for the public interface. |

Current and Decided are identical here because the only proposed changes (ct-5, ct-7) don't affect paragraph 1. For paragraph 2, Decided would show "Authentication uses API keys" (ct-7 is proposed, so its effect is excluded from Decided).

---

## Appendix A: The Laws

Twelve constitutional principles that this specification operationalizes.

**Law 1: Crystallization Is The Membrane.** Character-level editing is transient runtime behavior. Only crystallized editorial operations are durable collaboration state. CRDT, OT, or authority-based rebasing may vary at runtime. Keystrokes are not the canonical object. Durability begins when the system recognizes and records a logical editorial operation. → §2 (Crystallization Membrane)

**Law 2: CriticMarkup Is The Edit-Op DSL.** CriticMarkup is the language for expressing logical editorial operations — insertion, deletion, substitution, highlight, comment — not merely visual markup. The operation language must remain faithful to editorial intent. Alternative tool payloads may exist but must reduce to the same semantic operation model. → §3 (Inline Change Syntax), §4 (The Log)

**Law 3: The File Carries The Durable Artifact.** The file is the canonical durable collaboration artifact for reviewed text workflows. It must carry the readable body, crystallized editorial operations, proposal/review status, authorship and provenance, and governance trace. Runtime systems may maintain additional transient state, but the file is the long-lived shared object. → §2 (The File), §3 (entire section)

**Law 4: Projections Must Not Become Split Brain.** Views may differ. The canonical object may not. Inline CriticMarkup (L2), footnote-native (L3), decided view, original view, and agent-facing views may all differ, but they must remain projections over one coherent artifact. No view may silently invent semantics unavailable to the canonical artifact. Neither serialization may silently gain or lose capabilities relative to the other. → §2 (L2/L3 Duality)

**Law 5: Structural Rigidity And Policy Flexibility Must Stay Distinct.** Parser constraints are structural. Governance choices are policy. No invalid syntax, no impossible nesting, no silent unresolved placement presented as valid — these are structural. Who may amend whom, when compaction occurs, which accountability fields are mandatory — these are policy. Structural rigidity belongs in the parser and invariants. Policy flexibility belongs in configuration and explicit governance. → §6 (Governance Framework)

**Law 6: Reasons Must Ride With Edits.** Execution and accountability must be able to travel together. The system must support deterministic coupling between the change, the actor, the reason, and the review state when the project asks for it. This does not mean every project needs maximal metadata for every change. → §3 (Footnote Body), §6 (Reasoning Enforcement)

**Law 7: No Silent Certainty.** The system must distinguish between "resolved enough to act" and "not resolved enough to act." If a change cannot be located honestly, the system must not pretend otherwise. Unresolvable state must fail loudly, not render as false precision. → §5 (Binary Resolution, Coherence Health Check)

**Law 8: Parser, Save, Review, And Render Must Share Semantics.** No major path is allowed to operate on a different underlying model of the document. Parsing, L3→L2 conversion, save-time maintenance, review actions, and decoration rendering must agree on what a change is and where it lives. If intermediate-state replay is required for correctness, it cannot remain optional in one path and absent in another. → §4 (Body as Projection), §5 (Intermediate-State Verification)

**Law 9: Compaction Is Stewardship, Not Garbage Collection.** Compaction policy is governance, not optimization. The policy must answer what must never be dropped, what may be compressed, when compression is appropriate, and who may override. Without this, the system becomes personality-dependent. → §5 (Compaction), §6 (Compaction Governance)

**Law 10: Participants Must Not Be Silently Erased.** Humans and agents are participants in the same collaboration environment. The system must not silently flatten meaningful participant identity where the workflow depends on it. This applies to author attribution, proposal ownership, review actions, and revision lineage. Identity flattening is not a cosmetic bug — it is corruption of the governance layer. → §6 (Identity Model)

**Law 11: Human Override Must Remain Real.** Automation may assist. It may not quietly seize moral authority. Humans must be able to override compaction, review, and resolution outcomes. The system must not silently convert accountability into instrumentation. When the system makes a meaningful choice on behalf of participants, that choice must be visible and reviewable. → §6 (Competing Proposals, Accept → Compact)

**Law 12: The Tool Must Fit In The Hand.** The artifact can be philosophically correct and still fail. The system succeeds only if it preserves craft-feel in use. The user should not experience durable reasoning as clerical burden. The common path should feel like editing, not like filing paperwork. The protocol should support experts with existing editorial muscle memory. → §6 (Structural vs Policy Defaults)

---

## Appendix B: Academic References

This specification draws on and credits the following research:

**Gentle, M. & Kleppmann, M.** "Eg-walker: Efficient Replay-Based CRDTs for Collaborative Text Editing." EuroSys 2025. — Critical versions, event graph replay, retreat/advance operations. The intermediate-state verification model (§5) is structurally identical to Eg-walker's retreat/advance. Every single-writer crystallization is a critical version.

**Borrego, A. et al.** "ReDunT: Redundancy in Replicated Data Types." PaPoC 2025. — Formal definition of redundancy: an operation is redundant when removing it from the log does not change the eval result. Applied to consumed operations (§4) and compaction (§5).

**Stewen, F. & Kleppmann, M.** "Undo and Redo Support for Replicated Registers." PaPoC 2024. — Undo as RestoreOp (a new immutable operation, not mutation of the original). Validates the append-only log model and the supersede primitive (§4).

**Dolan, S.** "Impossibility of Undo." PODC 2020. — No replicated data type beyond simple counters can support general-purpose undo satisfying both commutativity and inverse properties. Justifies human escalation for consumed-op conflicts (§4).

**Weidner, M.** "Text Without CRDTs." 2025. — Insert-after-ID as structural analogue to LINE:HASH. Server reconciliation as analogue to tool-enforced anchor maintenance. Validates that tooling-enforced stability is a serious persistence strategy.

**Yu, W. et al.** "Undo in Collaborative Text Editing." DAIS 2015. — Identified "undesirable undo effects" when undoing operations whose text has been modified by subsequent operations. The dependency chain tracing in §4 detects exactly these effects.

**AnchoredAI.** "Anchored Feedback." 2025. — Anchoring Context Window validates contextual embedding approach. User study finding: anchored feedback produces greater perceived agency and more targeted revisions than detached commentary.

**Moment.dev.** "Lies I Was Told About Collaborative Editing." 2024–2026. — Collaborative editing is a UI/UX problem where algorithms assist. ChangeTracks arrived at the same conclusion: crystallize character activity into reviewable editorial operations rather than auto-merging.

**Loro.** Shallow snapshots. — Production implementation of self-describing document slices with truncated history. Validates the coherent slice model (§5) and the self-sufficiency test for compacted files.

**ProseMirror.** Position mapping. — Established model for mapping positions through change sequences. Analogous to the forward replay phase of scrubbing (§5), where positions are projected through successive operations.

**W3C.** "Web Annotation Data Model: TextQuoteSelector." — The contextual embedding format (§3, §4) is a dynamic version of the standardized prefix/exact/suffix pattern.

**Google.** "Gerrit Code Review." — The patch-set model validates amendment-as-new-version (§4). Review scores reset on new patch set. The Change-Id tracks logical identity across versions, analogous to `supersedes:` references.

**Weatherhead, G. & Hess, E.** "CriticMarkup." 2013. — The inline change syntax that ChangeTracks builds upon.

**Foucault, M.** *Discipline and Punish.* 1975. — The panopticon as anti-pattern for governance design (§6).

**Arendt, H.** *The Human Condition.* 1958. — The public sphere as space of appearance where participants appear through their actions, not through surveillance (§6).

**Illich, I.** *Tools for Conviviality.* 1973. — Tools that serve users vs tools that create dependency. The tool must fit in the hand (Law 12).
