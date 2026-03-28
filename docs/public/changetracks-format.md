# ChangeDown Format Specification

**Version:** 0.3.0
**Date:** 2026-02-13
**Status:** Draft

ChangeDown is a format for encoding change tracking and deliberation directly into text files. Changes, discussion, approvals, and revision history live in the file itself — readable by any text editor, parseable by any tool, consumable by any LLM. No external database. No proprietary binary format. Intent in the byte stream.

## File Tracking Header

An HTML comment on the first line of the file declares whether that file is tracked by ChangeDown:

```
<!-- changedown.com/v1: tracked -->
```

or explicitly opted out:

```
<!-- changedown.com/v1: untracked -->
```

**Placement:** Line 1 of the file. If the file has YAML frontmatter (`---`), the header goes on the first line after the closing `---`.

**Three-layer precedence** (highest wins):

1. **File header** — `<!-- changedown.com/v1: tracked|untracked -->` in the file itself
2. **Project config** — `[tracking] default` in `.changedown/config.toml`
3. **Global default** — `tracked` for files matching include globs, `untracked` otherwise

The file header is the authoritative signal. Tools auto-insert it on the first tracked edit. Humans and agents can add or change it manually.

**Relationship to the legacy breadcrumb:** The informational comment `<!-- changedown: https://changedown.com/spec -->` is a spec URL breadcrumb, not a tracking directive. When both are present, the `v1` header takes precedence and the breadcrumb is purely informational.

## Inline Change Syntax

Five change types, using CriticMarkup delimiters:

| Type | Syntax | Example |
|------|--------|---------|
| Insertion | `text` | `added text` |
| Deletion | `` | `` |
| Substitution | `new` | `after` |
| Highlight | `text` | `highlighted` |
| Comment | `` | `` |

Highlights can have attached comments with no whitespace between:

```
Rate limiting is set to 100 req/min
```

## Change IDs

Each inline change can have a footnote reference linking it to structured metadata:

```markdown
The API should use GraphQL for the public interface.
```

`[^cn-N]` is a standard markdown footnote reference. IDs are document-unique and monotonically increasing.

### Grouped Changes (Dotted IDs)

Multi-change operations use dotted IDs under a shared parent:

```markdown

...
text is now here
```

Parent `ct-17` is the logical operation. Children `ct-17.1`, `ct-17.2` are component changes. Strictly one level of nesting — `ct-17.1.1` is never valid.

Use cases: move operations (linked deletion + insertion), find-and-replace (one parent, N children), any multi-site edit that's logically one change.

Accept/reject works at both levels: accept `ct-17` resolves all children; reject `ct-17.2` carves out one exception.

## Footnote Format

Each change ID maps to a footnote definition with structured metadata and optional discussion.

### Header Line

```
[^cn-N]: @author | date | type | status
```

| Field | Values | Notes |
|-------|--------|-------|
| `@author` | `@alice`, `@ai:claude-opus-4.6` | Who proposed the change |
| `date` | `2024-01-15` | ISO 8601 date (YYYY-MM-DD in header) |
| `type` | `ins`, `del`, `sub`, `highlight`, `comment`, `move` | Change type |
| `status` | `proposed`, `accepted`, `rejected` | Current status |

Human authors use `@name`. AI authors use the `@ai:` namespace prefix: `@ai:claude-opus-4.6`, `@ai:gpt-4o`.

Three statuses only. Withdrawal is modeled as self-rejection (same @author rejecting their own change).

### Timestamps

The header date field is always `YYYY-MM-DD`. Event lines (discussion comments, approvals, rejections, revisions, resolution markers) accept the full timestamp spectrum:

| Format | Example | When used |
|--------|---------|----------|
| Date-only | `2026-02-17` | Human-written, always valid |
| Informal time | `2026-02-17 2:30pm` | Human-written with time |
| Full ISO 8601 UTC | `2026-02-17T14:32:05Z` | System-generated events |

System-generated events (from tools and integrations) use full ISO 8601 UTC. Human-written timestamps in any accepted format are stored exactly as written — never normalized, never lost.

### Metadata Lines

Optional lines after the header. Each starts with a keyword:

**context:** — Surrounding text for anchoring. Changed text in braces.
```
    context: "Authentication uses {API keys} for all endpoints"
```

**approved:** — One approval per line. Optional quoted reason.
```
    approved: @eve 2024-01-20
    approved: @carol 2024-01-19 "Benchmarks look good"
```

**rejected:** — One rejection per line. Optional quoted reason.
```
    rejected: @carol 2024-01-19 "Needs more benchmarking"
```

**request-changes:** — Same pattern as rejected.
```
    request-changes: @eve 2024-01-18 "Pick one protocol"
```

**revisions:** — Amendment history. Indented entries. Inline markup always shows the latest revision.
```
    revisions:
      r1 @bob 2024-01-16: "OAuth 2.0"
      r2 @bob 2024-01-18: "OAuth 2.0 with JWT tokens"
```

Approvals are optional. Simple changes need only the header line — no approvals, no ceremony.

### Discussion

Discussion comments follow the metadata lines. No separator needed — line content self-identifies.

**Comment:** `@author date:` at the start of a line (with indentation).

```
    @carol 2024-01-17: Why robust? Simple was intentional.
```

**Reply:** Indented 2 spaces deeper than the parent comment.

```
    @carol 2024-01-17: Why robust? Simple was intentional.
      @alice 2024-01-17: Simple undersells our capabilities.
        @dave 2024-01-18: Agreed with Alice on this.
```

No depth cap. In practice, threads rarely go deeper than 3-4 levels.

**Multi-line comments:** A comment continues until the next `@author date:` line, resolution marker, or end of the footnote. No special continuation indentation required.

```
    @carol 2024-01-17: This needs more thought. The current rate limit
    is based on our staging environment, not production. We need to
    model this against actual traffic patterns before committing.
```

**@mentions:** Any `@name` that appears mid-line (not at the start in `@author date:` position) is a mention — a signal for attention, not authorship.

```
    @alice 2024-01-18: @robert what do you think about the benchmark methodology?
```

**Comment labels (optional):** Parsers recognize optional labels between the date and colon. Labels categorize feedback. Humans rarely write them; tools and LLMs produce them.

Labels: `[suggestion]`, `[issue]`, `[question]`, `[praise]`, `[todo]`, `[thought]`, `[nitpick]`

Blocking modifier: `[issue/blocking]`, `[todo/blocking]`

```
    @bob 2024-01-16 [question]: What about latency requirements for gRPC?
    @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.
```

**Resolution markers:** Special lines that signal whether a thread is settled.

```
    resolved @dave 2024-01-17
    resolved @carol 2024-01-18: Addressed by r2
    open -- awaiting load test results from @dave
    open
```

`resolved @author date:` and `open` / `open -- reason`. ASCII, grep-able, unambiguous.

**Blank lines:** Tolerated anywhere in the discussion. Parsers ignore them. Humans use them for visual breathing room.

### How Line Types Are Distinguished

No explicit separator between metadata and discussion. Each line self-identifies by its first token:

| First token | Line type |
|-------------|-----------|
| Known keyword + `:` (`context:`, `approved:`, `rejected:`, `request-changes:`, `revisions:`) | Metadata |
| `@author date:` | Discussion comment |
| `resolved` | Resolution marker |
| `open` | Open marker |
| Indented under `revisions:` | Revision entry |
| Anything else (not starting with keyword or `@`) | Continuation of previous line |

## Levels of Adoption

The format is layered. Use as much or as little as you want. The boundary between levels is structural: **what container carries the metadata** (none, comment, or footnote).

**Level 0 — CriticMarkup (substrate).** No IDs, no footnotes, no metadata. Write `some text` and you're using ChangeDown. Not "participation" in the metadata sense — just the markup.

```markdown
The API should use GraphQL for the public interface.
```

**Level 1 — Adjacent comment with metadata.** An attached comment (``, no whitespace between change and comment) carries metadata with pipe-separated fields. Same `|` separator as the Level 2 footnote header. Use as few or as many fields as needed. No `[^cn-N]` required.

```markdown
The API should use GraphQL for the public interface.
```

```markdown
The API should use GraphQL for the public interface.
```

Conventions inside the comment: `@name` or `@ai:model` for author, ISO 8601 for date, `proposed`/`accepted`/`rejected` for status, `|` between fields. Order is flexible; whitespace around `|` is tolerated.

**Level 2 — Footnote (full deliberation).** `[^cn-N]` footnote ref + footnote definition. When you need threading, discussion, multiple reviewer approvals, revision history, or context anchoring — anything that doesn't fit in one inline comment.

```markdown
The API should use GraphQL for the public interface.

: @alice | 2024-01-15 | sub | accepted
    approved: @eve 2024-01-20
    context: "The API should use {REST} for the public interface"
    @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
    resolved @dave 2024-01-17
```

Each level is a strict superset. A Level 2 file is valid Level 1 is valid Level 0. The same `|` pipe convention works at Level 1 (inside comment) and Level 2 (footnote header). Transition between levels is moving data between containers, not changing the grammar.

**Compaction as level descent:** Level 2 → Level 1 (strip footnote, keep inline comment with summary metadata). Level 1 → Level 0 (strip comment). Level 0 → plain text (accept/reject markup). Git preserves the fuller version at each step.

## Code File Format

For non-markdown files, ChangeDown uses CriticMarkup syntax within language-native comments, with optional footnotes for full deliberation. This mirrors the markdown format structure while respecting code file constraints.

### The Core Pattern

Code files follow the same three-layer structure as markdown:

1. **Physical change record:** CriticMarkup delimiters wrapping the actual content that changed
2. **Optional inline comment:** Immediate context using `` syntax
3. **Optional footnote:** Full deliberation with author, date, status, threading

```python
# Layer 0: Physical change record only
results = {}  # {}

# Layer 0.5: Change record + inline comment (with optional metadata)
results = {}  # {}

# Layer 1: Change record + footnote (full deliberation)
results = {}  # {}
# : @alice | 2026-02-10 | sub | proposed
#     @alice 2026-02-10: Changed for O(1) lookup by user_id
```

### Inline Metadata Convention

In inline comments (``), everything **left of the colon** is metadata (date, author), everything **right** is the comment body:

```python
# With metadata (recommended for rot detection):
results = {}  # {}
                      # ^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^
                      #     metadata      comment body

# Without metadata (still valid):
results = {}  # {}
```

Metadata is optional but strongly suggested. Editors should gray out undated inline comments older than N months.

### Change Types in Code

**Insertion:**
```python
results = []  # []
```

**Deletion:**
```python
# 
```

**Substitution:**
```python
results = {}  # {}
```

**Highlight:**
```python
rate_limit = 100  # 100
```

### Language-Specific Comment Syntax

Use the language's native comment syntax:

| Languages | Comment prefix | Example |
|-----------|---------------|---------|
| Python, Ruby, Shell, YAML | `#` | `# {}` |
| JavaScript, TypeScript, Java, Go, Rust, C, C++, Swift, Kotlin | `//` | `// {}` |
| Lua, SQL, Haskell | `--` | `-- {}` |
| HTML, XML | `<!-- ... -->` | `<!-- {} -->` |
| CSS | `/* ... */` | `/* {} */` |

### Multi-Line Changes

For changes spanning multiple lines, use range delimiters (see **Range Delimiters** section above):

```python
# new` | In the `~>` separator |
| Multi-line | Range: `{~~ ... ~~}` | In footnote `original:` field |
| Section/block | Range: ` ... ` | N/A (insertion) or footnote |

### Constraints

- Range markers do **not** nest. Modifications to proposed code happen via footnote discussion (see "Revise, Don't Nest" in ADR-017).
- Recommended soft limit: ~100 lines per range. Use dotted IDs to break larger changes into reviewable sections.

## Cross-File References (Reserved)

The syntax `filename[^cn-N]` is reserved for referencing changes in other files:

```
see api.md
```

This is reserved for future use. Parsers are not required to resolve cross-file references.

## VCS Compaction

The file is the living surface of deliberation. VCS commits are the geological record.

Resolved threads stay in the file — they carry valuable deliberation context. Old revision history and fully settled footnotes are compactable: trim them from the file, commit, and VCS preserves the removed content in previous commits.

Compaction is just editing. The format has no special compaction syntax or archive mechanism. A tool can offer "clean up accepted changes older than N days" as a convenience, but it's just generating an edit for the user to review and commit.

Reconstruction uses standard VCS archaeology:

```bash
git log -p --all -S '' -- document.md
```

## Complete Example

```markdown
# API Design Document

The API should use GraphQL for the public interface
and gRPC for internal service communication.

Authentication uses OAuth 2.0 with JWT tokens for
all endpoints. Rate limiting is set to 100 req/min.

: @alice | 2024-01-15 | sub | accepted
    approved: @eve 2024-01-20
    approved: @bob 2024-01-21
    context: "The API should use {REST} for the public interface"
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42 — 3x fewer round trips.
      @dave 2024-01-17: Fair point. Benchmarks are convincing.
    resolved @dave 2024-01-17

: @alice | 2024-01-15 | ins | accepted
    approved: @eve 2024-01-20
    @bob 2024-01-16 [question]: What about latency requirements for gRPC?
      @alice 2024-01-17: Sub-millisecond on our test cluster.
    resolved @bob 2024-01-18

: @bob | 2024-01-16 | sub | accepted
    approved: @eve 2024-01-20
    approved: @carol 2024-01-19
    context: "Authentication uses {API keys} for all endpoints"
    @bob 2024-01-16: Upgraded from API keys to OAuth for security.
    revisions:
      r1 @bob 2024-01-16: "OAuth 2.0"
      r2 @bob 2024-01-18: "OAuth 2.0 with JWT tokens"
    @carol 2024-01-17 [suggestion]: Just OAuth or specifically with JWTs?
      @bob 2024-01-18: Good point, amended to specify JWT.
    resolved @carol 2024-01-18: Addressed by r2

: @carol | 2024-01-17 | highlight | proposed
    @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.
    Our current traffic is 80/min average with spikes to 200/min.
      @alice 2024-01-18: Depends on infrastructure costs. @dave can you model this?
      @dave 2024-01-19 [todo]: I can run load tests next week.
    open -- awaiting load test results from @dave

: @alice | 2024-01-18 | del | proposed
    @alice 2024-01-18: Legacy XML format is no longer needed.
    @dave 2024-01-19 [issue]: Some enterprise clients still use XML parsing.
      @alice 2024-01-19: They've had 2 years to migrate.
      @eve 2024-01-20 [issue/blocking]: Check with sales team first. @robert can you confirm?
    open -- pending sales team input
```

This document has 5 changes by 3 authors: 3 accepted, 2 under discussion. 2 resolved threads, 2 open threads. 1 blocking issue. 1 change with revision history. One reader — human or machine — can understand the full state of deliberation from the file alone.
