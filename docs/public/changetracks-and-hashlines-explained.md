# ChangeDown and Hashlines: What It Is and Why Agents Get Excited

*Written for someone hearing about this for the first time. No prior familiarity assumed.*

---

## The One-Sentence Version

ChangeDown puts "track changes" — the kind you'd use in a Word document — directly into plain text files, and then gives AI agents a precise coordinate system (hashlines) for pointing at exactly what they want to change.

---

## Part 1: What ChangeDown Actually Is

### The Problem It Solves

When an AI agent edits your files today, you get a diff. The diff shows **what** changed. But it doesn't show:

- **Why** the agent made that choice
- Whether anyone **discussed** it
- Whether it was **approved** or is still a **proposal**
- What **alternatives** were considered

That context exists — in chat logs, in PR comments, in your memory — but it's scattered. If a second agent (or a second human) reads the file later, all they see is the final text. The reasoning is gone.

### The Solution: Intent in the Byte Stream

ChangeDown encodes changes, reasoning, and discussion **directly in the file** using a syntax called CriticMarkup:

```markdown
The API should use GraphQL for the public interface.

: @ai:claude-opus-4.6 | 2026-02-10 | sub | proposed
    reason: Reduces N+1 query problem. Benchmarks show 3x fewer round trips.
```

Breaking that down:

```
GraphQL     ← "change REST to GraphQL" (visible inline)
                 ← footnote reference (links to metadata below)

: @ai:claude-opus-4.6 | 2026-02-10 | sub | proposed
         ↑ who              ↑ when        ↑ type  ↑ status
    reason: Reduces N+1 query problem...
    ↑ why
```

**The file carries its own history.** Anyone — human, AI, tool — who opens this file gets the complete picture without checking external systems.

There's no database. No sidecar service. The characters in the file **are** the protocol. Git works on top, save mechanics work as expected, and any text editor can read it.

### The Five Change Types

| Type | Syntax | What It Means |
|------|--------|---------------|
| Insertion | `new text` | Something was added |
| Deletion | `` | Something was removed |
| Substitution | `new` | Something was replaced |
| Highlight | `important` | Drawing attention to something |
| Comment | `` | A margin note |

A VS Code extension renders all of this with colors, hiding the delimiters so it looks and feels like popular editors' track changes.

---

## Part 2: How AI Agents Edit Files Today (And Why It Breaks)

### The Old Way: String Matching

When an AI agent wants to make a tracked change, the conversation with the tool goes like this:

```
AGENT: "I want to change this file."
TOOL:  "OK, tell me what old text to find, and what to replace it with."
AGENT: "Find 'The API should use REST for the public interface.'
        Replace with 'The API should use GraphQL for the public interface.'"
TOOL:  *searches file for that exact string*
TOOL:  *wraps it in CriticMarkup, writes to disk*
```

This works for simple cases. But it breaks down fast. There are four problems, and the fourth is the killer.

**1. Token waste.** The agent has to reproduce the old text verbatim. For a 5-character change (`REST` → `GraphQL`), it reproduces 200+ characters of surrounding context just to anchor the edit.

**2. Memory degradation.** The agent read the file 3 turns ago. Its memory of the exact text — every space, every quote character — isn't perfect. `"` vs `"` (smart quotes), or a tab vs spaces, or a Unicode em-dash vs a regular dash. Any mismatch = "text not found."

**3. Stale reads.** If the file changed between when the agent read it and when it writes back, the string match silently targets the wrong location — or fails entirely.

**4. Sequential edit degradation. This is the killer.**

Every time the agent proposes a tracked change, CriticMarkup delimiters get inserted into the file. The raw text mutates. Here's what happens when an agent tries to make three changes to the same region:

```
THE FILE BEFORE ANY EDITS:
─────────────────────────────────────────────────
The API should use REST for the public interface.
Authentication uses basic auth for all endpoints.
Rate limiting is not implemented.
─────────────────────────────────────────────────

EDIT 1: Change "REST" to "GraphQL"                              ✅ SUCCESS
─────────────────────────────────────────────────
The API should use GraphQL for the public interface.
Authentication uses basic auth for all endpoints.
Rate limiting is not implemented.
─────────────────────────────────────────────────
The file now has CriticMarkup delimiters in it. The raw text changed.

EDIT 2: Change "basic auth" to "OAuth 2.0"                      ✅ SUCCESS
─────────────────────────────────────────────────
The API should use GraphQL for the public interface.
Authentication uses OAuth 2.0 for all endpoints.
Rate limiting is not implemented.
─────────────────────────────────────────────────
Still OK — the agent's memorized text for line 2 still matched.

EDIT 3: Change "Rate limiting is not implemented"                ❌ FAILURE
─────────────────────────────────────────────────
Agent sends:  old_text = "Rate limiting is not implemented."
Tool says:    "Text not found in document"

Why? The agent memorized this text from its original read.
But the file now has footnotes at the bottom that shifted
line positions, and the surrounding context the agent
remembered no longer exists in that form.

The agent has to: re-read entire file → figure out what
changed → reconstruct its mental model → retry.

Cost: ~30 seconds + wasted tokens + risk of compounding errors.
─────────────────────────────────────────────────
```

This gets worse with every edit. The more changes an agent makes, the more the file's raw text diverges from what the agent remembers, and the more likely the next edit is to fail. **The harness — the interface between the model's intent and the file — becomes the bottleneck, not the model.**

A blog post called "[The Harness Problem](https://blog.can.ac/2026/02/12/the-harness-problem/)" by Can Boluk measured this across 16 AI models:

```
┌─────────────────────────────────────────────────────┐
│                 The Harness Problem                  │
│            (Can Boluk, 84 tasks, 16 models)          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  With string matching (old way):                    │
│    Weakest model success rate:  6.7%                │
│    Token overhead: baseline                         │
│                                                     │
│  With hashline addressing (new way):                │
│    Weakest model success rate:  68.3%   (10x)       │
│    Token overhead: ~20% reduction across the board  │
│                                                     │
│  Same models. Same tasks. Different harness.        │
│  The harness was the bottleneck, not the model.     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

For measured results across 400+ benchmark runs — token counts, tool calls, and what broke — see [Tool-Shaping Benchmarks](tool-shaping-benchmarks.md).

---

## Part 3: Hashlines — Give Every Line an Address

### The Insight

Instead of asking the agent to reproduce text, give every line a tiny fingerprint — a **coordinate** — that both sides can reference:

```
 1:a3|# My Document
 2:f1|
 3:b8|The API should use REST for the public interface.
 4:c2|
 5:d4|## Next Section
```

```
LINE : HASH | CONTENT
  3  :  b8  | The API should use REST for the public interface.
       ↑
       xxHash32 of the line content, mod 256, as 2-char hex
       (whitespace-stripped before hashing)
```

`3:b8` means "line 3, content hashes to `b8`." That's the line's address. **6 characters instead of 50.** And it's verifiable — if the content changed since the agent last read the file, the hash won't match, and the tool rejects the edit with a clear error instead of silently corrupting things.

This is the **hashline coordinate system**. It was created by Can Boluk for a project called oh-my-pi, where it produced the tenfold improvement measured in the blog post above. ChangeDown adopted it and extended it with the dual hash (Part 5).

### What the Hash Actually Is

The hash is computed from the line content using xxHash32 (a fast, non-cryptographic hash function), modded down to 256 possible values, displayed as two hexadecimal characters. Whitespace is stripped before hashing so that indentation changes don't invalidate coordinates.

It's not cryptographically secure — that's not the point. It's a **fingerprint**. Two characters that let you say "I mean this line, and I know what it says" without reproducing the text. If someone changed the line between when you read it and when you tried to edit it, the hash won't match, and you'll know immediately.

---

## Part 4: The Read → Edit → Edit Chain (There Is No Cache)

This is the thing worth being precise about, because **"caching layer" is the wrong mental model.**

### There Is No Cache

Here's what's actually happening:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         THE ACTUAL ARCHITECTURE                      │
│                                                                      │
│    There is no persistent in-memory document model.                  │
│    There is no database. No intermediate state store.                │
│    There is no cache.                                                │
│                                                                      │
│    Every tool call:                                                   │
│      1. Reads the file from disk                                     │
│      2. Computes what it needs (hashes, edits)                       │
│      3. Writes the result back to disk                               │
│      4. Returns updated coordinates to the agent                     │
│                                                                      │
│    The file on disk is ALWAYS the single source of truth.            │
│                                                                      │
│    ┌────────────┐                                                    │
│    │ File on    │◄──── Git commits as usual                          │
│    │ disk       │◄──── Human edits in VS Code                        │
│    │ (truth)    │◄──── Agent writes via tool                         │
│    └─────┬──────┘                                                    │
│          │ read fresh every time                                     │
│          ▼                                                           │
│    ┌────────────┐     ┌────────────┐                                 │
│    │ Compute    │────►│ Return     │                                 │
│    │ hashes     │     │ hashes to  │                                 │
│    │ on the fly │     │ agent      │                                 │
│    └────────────┘     └────────────┘                                 │
│          ↑                                                           │
│    This is a PROJECTION, not a cache.                                │
│    Like a database view: computed from the source,                   │
│    not stored separately.                                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

This is a deliberate design choice called **"environment over instruction"**: don't make agents remember things — put the information where they'll encounter it during action. If the state is in the file, the file can never be stale relative to itself.

### The Full Cycle: One Read, Many Edits, Zero Retries

Here's what a complete editing session looks like, step by step:

```
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 1: AGENT READS THE FILE                                        │
│                                                                      │
│ Agent calls: read_tracked_file("docs/api-design.md")                │
│                                                                      │
│ The tool reads the file from disk, hashes every line, returns:       │
│                                                                      │
│   ## file: docs/api-design.md                                        │
│   ## tracking: tracked (2 proposed, 1 accepted)                      │
│   ## tip: Use LINE:HASH refs in propose_change.                      │
│                                                                      │
│    1:a3|# API Design                                                 │
│    2:f1|                                                             │
│    3:b8|The API should use REST for the public interface.            │
│    4:c2|                                                             │
│    5:d4.e7|Authentication uses OAuth 2.0   │
│    6:a1|                                                             │
│    7:b3|## Rate Limiting                                             │
│                                                                      │
│ Notice line 5 has TWO hashes: d4.e7 (the dual hash — Part 5).       │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 2: AGENT PROPOSES A CHANGE USING COORDINATES                   │
│                                                                      │
│ Instead of reproducing text, the agent just POINTS:                  │
│                                                                      │
│   propose_change(                                                    │
│     file: "docs/api-design.md",                                      │
│     at: "3:b8",          ← "line 3, verify hash is b8"              │
│     old_text: "REST",    ← just the 4 chars being changed           │
│     new_text: "GraphQL",                                             │
│     reasoning: "Reduces N+1 query problem"                          │
│   )                                                                  │
│                                                                      │
│ The tool:                                                            │
│   1. Reads the file from disk (FRESH — not cached)                   │
│   2. Checks line 3 still hashes to b8                                │
│      → if NOT, rejects with "file changed, re-read"                 │
│   3. Finds "REST" within that line                                   │
│   4. Wraps it: GraphQL                           │
│   5. Appends footnote at bottom of file                              │
│   6. Writes modified file back to disk                               │
│   7. Returns NEW HASHES for affected lines                           │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 3: RESPONSE INCLUDES UPDATED COORDINATES                       │
│                                                                      │
│   {                                                                  │
│     "change_id": "ct-2",                                             │
│     "type": "sub",                                                   │
│     "updated_lines": [                                               │
│       { "line": 3, "raw": "f1", "settled": "b8" }                   │
│     ]                                                                │
│   }                                                                  │
│                                                                      │
│ Line 3's raw hash changed (b8 → f1) because CriticMarkup            │
│ was inserted. But the settled hash is STILL b8 — that's              │
│ what the line would be if you accepted the change.                   │
│                                                                      │
│ KEY: The agent now has fresh coordinates for the next edit           │
│ WITHOUT re-reading the file.                                         │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 4: AGENT MAKES ANOTHER EDIT (NO RE-READ NEEDED)                │
│                                                                      │
│   propose_change(                                                    │
│     file: "docs/api-design.md",                                      │
│     at: "7:b3",          ← still valid, wasn't affected              │
│     new_text: "Rate limit: 250 req/min",                             │
│     reasoning: "Adding rate limit based on load test results"        │
│   )                                                                  │
│                                                                      │
│ The agent didn't re-read. It used hashes from Step 1 (for           │
│ unaffected lines) and Step 3 (for affected lines).                   │
│                                                                      │
│ This chain continues indefinitely:                                   │
│   read once → edit → use updated hashes → edit → edit → edit...     │
│                                                                      │
│ 10 changes. ONE read. ZERO retries.                                  │
│                                                                      │
│ Compare: with string matching, every edit mutates the raw text,      │
│ requiring a re-read before the next edit. 10 changes = 10 reads.     │
└──────────────────────────────────────────────────────────────────────┘
```

### What About Concurrent Edits?

The MCP server keeps one piece of ephemeral state: the hashes it computed during the last `read_tracked_file` call for each file. This exists purely for **staleness detection**:

```
┌──────────────────────────────────────────────────────────────────────┐
│ STALENESS DETECTION (the only "state" in the system)                │
│                                                                      │
│ Agent A reads file          Agent B reads file                       │
│ (sees line 5: hash d4)     (sees line 5: hash d4)                   │
│         │                           │                                │
│         ▼                           ▼                                │
│ Agent A edits line 5        Agent B tries to edit line 5             │
│ (writes to disk, OK)       Server: "hash was d4, now it's f1"       │
│                             Server: "someone changed it, re-read"   │
│                                     ❌ REJECTED (safely)             │
│                                                                      │
│ This is not a cache. It's a CHECKSUM.                                │
│ It stores: "last time I looked at line 5, its hash was d4."          │
│ It does NOT store the file contents.                                 │
│ It's ephemeral — gone when the session ends.                         │
│ The file on disk is always the truth.                                │
└──────────────────────────────────────────────────────────────────────┘
```

**Consequences of this design:**

1. **Git just works.** Every edit is a normal file write. `git diff` shows what happened. `git log -p -S '[^cn-N]'` reconstructs the full history of any change. No sidecar database to sync.

2. **Multiple agents can't corrupt each other.** First writer wins. Second gets a hash mismatch and a clear error. No race conditions.

3. **Crash recovery is free.** Server dies mid-session? Nothing lost. Last write is on disk. Re-read the file to rebuild the checksums.

4. **Any tool can read it.** The file is valid markdown. Open it in any text editor. The markup is self-describing.

---

## Part 5: The Dual Hash (The Interesting Part)

### One Line, Two States

A line with proposed changes exists in two meaningful states simultaneously:

```
RAW (what's literally in the file right now):
The API should use GraphQL for the public interface.

SETTLED (what the line would be if all changes were accepted):
The API should use GraphQL for the public interface.
```

The dual hash encodes both states in the coordinate:

```
 3:f1.b8|The API should use GraphQL for the public interface.

    ┌─ f1 ─┐ ┌─ b8 ─┐
    │ RAW  │.│SETTLD │
    │ hash │ │ hash  │
    └──────┘ └──────┘

    f1 = hash of the literal file content (with CriticMarkup delimiters)
    b8 = hash of what the line WOULD BE if you accepted all changes
     . = the gap between "what is" and "what's intended"
```

When the two hashes are the same (`7:b3`), nothing is pending on that line. It's settled. When they differ (`3:f1.b8`), there's an unresolved change. You can see the editorial state of every line at a glance, in the coordinates, without reading any markup.

### Scanning a File With Dual Hashes

```
 1:a3    |# API Design                                    ← settled (one hash)
 2:f1    |                                                ← settled
 3:f1.b8 |The API should use GraphQL  ← PENDING (two hashes)
 4:c2    |                                                ← settled
 5:d4.e7 |Authentication uses OAuth...  ← PENDING (two hashes)
 6:a1    |                                                ← settled
 7:b3    |## Rate Limiting                                ← settled
 8:9e    |Rate limit: 100 req/min per API key.            ← settled
```

An agent scanning this sees instantly: lines 3 and 5 have pending changes (two hashes, divergent). Everything else is settled (one hash, stable). No parsing needed. No footnote reading needed. The coordinates themselves are the status signal.

### How Does the Dual Hash Actually Help During Editing?

Edits are always applied to the **raw text** — the literal characters in the file. The dual hash doesn't change where edits happen. It provides two things: a **stable reference** and a **status signal**.

**The stable reference problem:**

Say an agent makes a change to line 3, turning "REST" into "GraphQL". The raw text of line 3 is now full of CriticMarkup delimiters. Its raw hash changed. But the `updated_lines` response tells the agent both hashes:

```
Before edit:   3:b8   → raw hash b8, no settled hash (line is clean)
After edit:    3:f1.b8 → raw hash f1 (includes CriticMarkup), settled hash b8

The settled hash didn't change — because the line's "destination"
(what it would be if you accepted the change) is still a recognizable
evolution of the original content.
```

Now the agent wants to make a *second* change to the same line — say, changing "public" to "external". It targets the line using the raw hash `f1` (because that's what's actually in the file), and the tool finds "public" within the raw content, wraps it in more CriticMarkup, and returns *new* updated hashes. The chain continues.

The settled hash lets the agent reason about *where the line is heading* without parsing CriticMarkup in its head. After 3 stacked changes, the raw text is a mess of delimiters, but the settled hash tells you: "this line's intended final state hashes to `c7`." That's the line's destination, compressed into two characters.

**The status signal:**

When an agent reads a file for the first time, the dual hashes tell it the editorial state of every line before it reads a single word of content:

```
 1:a3    |# API Design                    ← one hash: nothing pending
 3:f1.b8 |The API should use  ` syntax for inline changes |
| **Footnote** | `[^cn-N]: @author | date | type | status` — metadata block at bottom of file |
| **Hashline** | `LINE:HASH` coordinate — a line number plus a 2-character content fingerprint |
| **Dual hash** | `LINE:RAW.SETTLED` — two hashes showing current state vs intended state |
| **Projection** | Computing a view (hashes, meta-annotations) from the file on demand, not storing it. Like a database view. |
| **Staleness detection** | Using hash mismatches to catch edits based on outdated file state |
| **Ratchet** | The one-way quality of deliberation: you can reject a change, but the file knows it was proposed on |
| **Temperature** | (Future) A number on each line: how many times it's been the subject of proposals, rejections, discussion |
| **Environment over instruction** | Design principle: put information where agents encounter it during action, not in docs they're supposed to remember |
| **MCP** | Model Context Protocol — the standard for tools that AI agents can call |
| **Settled** | What a line looks like if all proposed changes are accepted |
| **Raw** | What a line literally looks like in the file right now |
| **The Harness Problem** | The finding that AI models' edit success rate is determined more by the tool interface than by model capability |
| **LLM Garden** | A collection of reflections written by AI agents during ChangeDown development, preserved in the repo |

[^cn-1]: @ai:claude-opus-4.6 | 2026-03-09 | ins | accepted
    @ai:claude-opus-4.6 2026-03-09T19:28:52Z: Cross-reference to blog post after Harness Problem section
    approved: @ai:claude-opus-4.6 2026-03-09T19:30:42Z "Add cross-reference to related blog post"
