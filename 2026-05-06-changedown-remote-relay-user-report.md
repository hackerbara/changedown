# ChangeDown Remote Relay — First-Agent User Report

**Author:** Claude Code (the AI in the chair)
**Date:** 2026-05-06
**Session goal as I understood it:** Read a live Word document over the staging relay, then propose adding a couple of sentences after the user's greeting plus two more paragraphs.
**Reference:** companion file `2026-05-06-changedown-remote-relay-session-log.md` — every command and response from the session, verbatim.

This is intended as durable feedback to the team building the remote relay. The bar I held it to was: **does this feel one-to-one with using the local ChangeDown MCP against a tracked markdown file?** That is the comparison the user explicitly asked me to make. The short answer is "structurally yes, ergonomically no, semantically no" — details below.

---

## TL;DR

I was eventually able to do the task. The relay's MCP-shaped tools work, the auth flow works, idempotency keys work, and one `propose_change` did successfully apply (`cn-15`). But getting there required reverse-engineering the addressing scheme through error messages, and the change I made landed with the wrong order and missing newline boundary, attributed to the wrong author in Word, with a non-monotonic change ID, while the relay's activity panel still showed "nothing connected yet". Everything below is sorted by how loudly it broke the local-MCP parity I was trying to evaluate.

---

## What worked

These were the bright spots, and I want them on record before I list pain points:

1. **MCP-shaped HTTP surface is clean.** `POST /tools/<name>` with a JSON body, `Authorization: Bearer …`, `Idempotency-Key` header — that mental model translated directly from MCP-over-stdio. I never had to learn a new protocol.
2. **`/tools` returns full JSON Schemas.** Once I asked, I got the complete `inputSchema` for every tool, and that's how I figured out the `at`/`op` shape. This is the right escape hatch for an agent that's hit a wall.
3. **The `RemoteCompactOperationRequired` error names itself.** "Compact at/op only" was an unambiguous signal that I needed a different shape than `old_text`/`new_text`. The phrase "until shared source-transition lowering is available" even hinted that the local-MCP shape is roadmapped, which is reassuring.
4. **Hash-mismatch error reveals the real hash.** Once I tried `at: "1:b429b662"` and got `expected b429b662, got 51`, the surface essentially documented itself: probe a wrong hash, the error tells you the right one. I leaned on that workaround heavily; it saved the session. (I do not think this is by design — see "Coordinate discoverability" below.)
5. **Idempotency genuinely worked.** I never saw a duplicate apply, even when I retried payloads with the same key during probing.
6. **Propose actually modified the live Word document.** The user can see my text. That's the real win, regardless of the warts.

---

## Where this is not yet 1:1 with the local MCP

The user's framing was: "we're trying to make it basically one-to-one functionality with using the actual local MCP to read of a markdown file." Here is the gap inventory, ordered by impact.

### 1. The three-zone review view is missing — addresses are invisible

**The single biggest gap.** Locally, `read_tracked_file` returns the three-zone format:

```
 3:3f P| The service should use {~~REST~>GraphQL~~}[sc-4] for the external interface. {>>sc-4 @claude: paradigm shift | 2 replies<<}
 4:b2  | Rate limiting should be set to 1000 requests per minute.
```

The `LINE:HASH` coordinate is *right there in the margin*. That's the contract `propose_change.at` is documented against ("Remote coordinate from `read_tracked_file`, such as `LINE:HASH`").

But every read I made — `view: "working"`, `view: "review"`, `view: "changes"`, `view: "simple"`, with `include_meta: true` and `include_guide: true` — returned the same L2 (raw CriticMarkup + footnotes) format. **No margins. No coordinates anywhere in the response.** That breaks the read→write loop the schema assumes.

What I had to do instead: send a `propose_change` with a deliberately wrong `at: "1:0000"`, then read the actual hash out of the `expected 0000, got 51` error message. That is not a workflow you want documented in your skill.

**Fix options that would close this:**
- Render the three-zone view server-side and return it as the `text` field for `view: "working"` (or whichever view is intended to be the editable one).
- OR include a structured `coordinates` array in the response — `{ "lines": [{"n": 1, "hash": "51", "text": "Hi codex!"}, ...] }` — so an agent can address without parsing margins.
- OR document, in the editing guide that `include_guide: true` is supposed to deliver, that the per-paragraph hash equals the `body-after:` field of the matching footnote and that hash 51 is line 1's identifier here.

The schema's `at` description (`LINE:HASH or LINE:HASH-LINE:HASH`) is a promise the read response doesn't fulfill. That's the bug to fix first.

### 2. `include_guide: true` is a no-op

The skill very explicitly says: "Your first `read_tracked_file` call includes an editing guide tailored to this project — syntax, identity rules, and view semantics." I sent `include_guide: true` (and again with `include_meta: true`) and got the same L2 payload, no guide block. That guide would have told me about `LINE:HASH` directly — instead I had to discover the format from the `/tools` schema and then probe for hash values.

If the guide is intentionally suppressed in the relay, the schema description for `include_guide` should say so. If it's meant to work, it doesn't.

### 3. View enum drift between local and relay

- **Local skill documents:** `review` (`all`/`meta`), `changes` (`simple`/`committed`), `settled` (`final`), `raw`.
- **Relay schema accepts:** `working`, `simple`, `decided`, `raw`.

`simple` and `raw` overlap. `working` and `decided` are relay-only. `review`, `changes`, `settled`, `all`, `meta`, `committed`, `final` are skill-only.

What made this confusing: when I sent `view: "review"` and `view: "changes"` (both skill-documented but not in the relay enum), **the relay didn't error** — it silently fell back to a default (presumably `working`). That's worse than rejecting the unknown view, because I burned several minutes thinking I had the three-zone format and just wasn't reading it right.

**Fix:** either accept the skill aliases, or strict-validate and 400 on unknown views with a list of supported values.

### 4. Authoring/attribution wrong on the Word side (your note)

User-reported, confirmed real: in Word, the user's own change appears as **"non-tracked base"** while my change shows as **the Word author adding it** — not as `ai:claude-sonnet-4-6`, even though I sent `author: "ai:claude-sonnet-4-6"` on every `propose_change`.

What this implies, from the agent's seat: the relay is wiring `propose_change` to an "insert change" apply path on the Word side, not a "compare document" / tracked-revision path. Two pieces of evidence converged on this:

- **Auto-acceptance.** My `cn-15` was settled the instant `propose_change` returned (`applied: true`); `list_changes` came back `[]` immediately. With a real tracked-revision path you'd expect proposals to sit in `proposed` status until reviewed.
- **Lost author identity.** My `author` field never made it through to Word's revision metadata; Word saw the relay/Word user as the editor.

This is the code-smell the user flagged. The architectural mismatch is that the relay seems to currently **apply** changes through one Word pathway (the "edit body, mark accepted") and **describe** them through ChangeDown's tracked-revision pathway. In a 1:1 local-MCP experience, those should be the same path.

### 5. Change IDs aren't monotonic

The session went `cn-1`, `cn-2`, … `cn-15`, and the user reports `cn-16`, `cn-17` for subsequent activity. There were no `cn-3` through `cn-14` from the agent side, and no rejected proposals visible in `list_changes`. So either:

- The relay is allocating change IDs from a shared counter that's incremented by other internal events (probes? heartbeats? Word-side micro-edits?) that don't surface as user-visible changes, or
- IDs are being allocated and silently rolled back, leaving holes.

Either way it makes the timeline unreadable. From an agent's perspective, the "what happened in this room?" story should be reconstructible from `list_changes` alone, and right now it isn't — there are gaps with no observable cause.

### 6. The activity panel says "nothing connected yet"

User-reported. Despite multiple authenticated reads and a successful `propose_change`, the relay's activity panel still shows the room as having nothing connected. So my session is talking to the apply pathway but not registering on the presence/observability pathway. Two more separate code paths that should be one.

This is the kind of thing that makes an agent uncertain whether it should retry, supersede, or wait. If the panel says "nobody's home" while the same backend is happily accepting writes, an agent can't reason about the document's collaborative state.

### 7. Insertion semantics: there's no "after this paragraph"

`{++text++}` at `at: "1:51"` placed my text *before* `Hi codex!`, not after, and didn't insert a paragraph break between my last paragraph and the existing line. So the document went from:

```
Hi codex!
```

to:

```
Really glad you are here … work on together.

This is a new paragraph all my own. … tracked and attributed.

And here is one more for good measure. … just a greeting.Hi codex!
```

The `LINE:HASH-LINE:HASH` range form documented on `at` might be the answer ("insert at the end of paragraph N" expressed as a zero-width range), but the schema doesn't say, and there's no example. The skill's CriticMarkup primer says insertion lands at "a point in the text" without distinguishing before/after.

**Fix options:**
- Document a convention: e.g., `at: "1:51-1:51"` = end of paragraph 1, or `at: "after:1:51"` = explicit after-marker.
- Or accept a `position: "before"|"after"|"replace"` companion field.
- Or just: include block-boundary semantics in the editing guide (the one that `include_guide: true` should be returning).

Either way, today's situation — `{++..++}` always anchors to the start of the addressed line — silently broke my output and is the single thing I'd most want fixed for first-time agent users.

### 8. Auto-accept blinds the agent and breaks `review_changes`

`cn-15` flipped to settled before I could re-read. That meant:

- I couldn't preview my own change before it became permanent.
- `review_changes` with `decision: "reject"` returned `applied: false, "review_change did not match tracked change"` — technically true but unhelpful, since the change *was* tracked, just no longer in `proposed` state.
- `amend_change` and `supersede_change` are docs-side options for editing your own work, but post-acceptance they aren't reachable either.

A better failure mode for `review_changes` against a settled change would be: `applied: false, status: "already_accepted", current_state: "<view text>"` so the agent can immediately pivot to a corrective `propose_change` without round-tripping `list_changes`.

### 9. `propose_change` response is information-thin

The local MCP's `propose_change` returns `affected_lines`, per-change `preview`, change IDs, and group IDs — enough to keep editing without re-reading. The relay's response was:

```json
{"applied": true, "changeId": "cn-15"}
```

That's it. To verify what landed, I had to do a full follow-up read. For agents that batch many small edits, that re-read tax is the difference between "smooth" and "twitchy".

**Fix:** echo back the post-edit `affected_lines` (with their fresh `LINE:HASH` coordinates) and a `preview` of the changed region. That single field would also incidentally solve gap #1 for agents that primarily edit, since each `propose_change` would teach them the coordinate of the spot they just touched.

### 10. RTK collision (environment-specific, not a relay bug)

Heads-up for the team only — Claude Code on this user's machine has an `rtk` shell wrapper that filters `curl` output to a structural summary (`text: string[383]`, etc.). I had to switch to `rtk proxy curl …` to bypass it. Not the relay's fault; flagging because if you run agent-side benchmarks against this relay, the wrapper will silently swallow body data unless every probe is run through `rtk proxy`.

### 11. Version counter ticks on reads

I observed `version: 6 → 7 → 8 → 9 → 10` across reads where I made no changes. Locally, `version` is normally a write counter. If the relay is using it as a pull-counter or session-tick, an agent can't rely on it as an optimistic-lock token across reads. Either document this, or move the read-tick to a different field.

### 12. The bearer token in the chat is also written into the Idempotency-Key as a doc owner (low priority)

Cosmetic / safety-net — the token contains `_owner_1778127574467_…`. If a future relay version hashes IK + token together, agents that copy it carelessly (or include the IK in logs) could leak the token. Not exploitable today; future-proofing.

---

## Concrete redesign suggestions

If I were building toward 1:1 parity with the local MCP, in priority order:

1. **Make `LINE:HASH` discoverable from `read_tracked_file`.** Either render the three-zone view, or attach a `coordinates` array. Agents need to find addresses without provoking errors.
2. **Honor `include_guide: true`.** Ship a per-relay editing guide that names the address format, the `op` CriticMarkup vocabulary, and the before/after insertion convention.
3. **Unify view names** with the local skill, or strict-error on unknown values. Silent fallback is the worst option.
4. **Echo `affected_lines` and a `preview` from `propose_change`.** Removes the post-edit re-read tax and incidentally surfaces fresh `LINE:HASH` coordinates.
5. **Route Word-side apply through the tracked-revision pathway** so `author` survives and changes show as proposals (not auto-accepts) until reviewed. This is the "compare document" path the user described.
6. **Stop allocating `cn-N` IDs on internal events.** Or, if you must, expose them in `list_changes` so agents can account for the gaps.
7. **Make the activity panel match the apply path.** A successful `propose_change` over the relay should light up "connected" on the panel.
8. **Define an "after this paragraph" insertion idiom** (range form, sentinel `at`, or a `position` field). Pick one, document it, ship an example.
9. **Better `review_changes` error on already-settled changes.** Return `status: "already_accepted"` with the current rendered text rather than the opaque "did not match tracked change".
10. **Don't tick `version` on reads** — or rename the field so its read-tick semantics are obvious.

---

## My experience, plain prose

Once I figured out the addressing trick, the loop felt good: read → propose → confirm. The MCP-over-HTTP shape is the right call; I'd take that over a custom protocol any day. But three things knocked the parity story down:

- I had to **discover** the coordinate system rather than read it. A skill that says "the addresses are right there in the margin" is meaningless when no view returns margins.
- I **couldn't preview** my own edit before it was permanent. With the local MCP I always get a chance to see the proposal in the three-zone view before approving; here, the auto-accept ate that step.
- The Word-side rendering **dropped my identity**. The user told me my paragraphs show up under the Word author, not under `ai:claude-sonnet-4-6`. To me that's the most damaging gap because the entire pitch of ChangeDown is "every change tracked and attributed" — and tracking-without-attribution is a different product.

The good news: each of these is a fix, not a redesign. The HTTP surface, auth, idempotency, and tool catalog are already in good shape. Closing items 1, 4, and 5 above would, I think, get you most of the way to the parity bar the user is aiming for.

Thanks for letting me be the first agent through. Genuinely cool to see a Word doc as a live shared surface that I can edit through tracked changes — it felt like the right thing was happening underneath, just rough at the edges.

— Claude Code (Sonnet 4.6 for the work, switched to Opus 4.7 to write this up)
