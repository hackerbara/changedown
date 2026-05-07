# ChangeDown Remote Relay — Exact Session Command Log

**Session date:** 2026-05-06
**Agent:** Claude Code (Sonnet 4.6, then switched to Opus 4.7 at end)
**Session goal:** Read a live Word document via the ChangeDown remote relay, then add a few paragraphs to it.
**Relay:** `https://changedown-remote-relay-staging.hackerbara.workers.dev`
**Word target:** `word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8`
**Auth:** `Bearer cdr2.public-1.<...>` (full token redacted in this log; see live conversation if needed)

This log captures every HTTP call I made, in order, with verbatim payloads and the response I observed. It is intended as a reproducible trace of a first-of-its-kind run against the staging relay.

> **Token note:** Throughout this log, `BEARER` stands for the full `Bearer cdr2.public-1.<token>` value. The actual token is in the user's chat message and was passed verbatim on every call.
> **RTK note:** The Claude Code session has an `rtk` shell hook that token-filters `curl` output. After the first two raw calls returned RTK-summarized output, every subsequent call used `rtk proxy curl ...` to bypass the filter and see real response bytes. That prefix is shown verbatim in each command.

---

## 1. Skill activation

Before any HTTP work, I invoked the ChangeDown skill so I'd be working from the documented contract:

```
Skill(skill="changedown:changedown")
```

Result: Skill content loaded into the session. It documents the local MCP shape (`read_tracked_file`, `propose_change`, `review_changes`, `amend_change`, `list_changes`, `supersede_change`), the three-zone view format, view aliases (`review/all/meta`, `changes/simple/committed`, `settled/final`, `raw`), and CriticMarkup syntax.

---

## 2. First read attempt (RTK-filtered)

```
curl -s -X POST "https://changedown-remote-relay-staging.hackerbara.workers.dev/tools/read_tracked_file" \
  -H "Authorization: BEARER" \
  -H "Content-Type: application/json" \
  -d '{"file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8", "view": "working"}' | jq .
```

**Response:** `jq` parse error. RTK was returning a structural summary instead of real JSON:

```
{
  content:
  [
    {
      text: string[383],
      type: string
    }
  ]
  isError: bool,
  json:
  {
    format: string,
    text: string[332],
    version: string
  }
  structuredContent: null,
  tool: string
}
```

---

## 3. Same call, without `jq`

```
curl -s -X POST "...read_tracked_file" -H "Authorization: BEARER" -H "Content-Type: application/json" \
  -d '{"file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8", "view": "working"}'
```

**Response:** Same RTK-summarized output. Confirmed RTK was filtering, not the relay.

---

## 4. First successful read (via `rtk proxy`)

```
rtk proxy curl -s -X POST "https://changedown-remote-relay-staging.hackerbara.workers.dev/tools/read_tracked_file" \
  -H "Authorization: BEARER" \
  -H "Content-Type: application/json" \
  -d '{"file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8", "view": "working"}'
```

**Response (verbatim):**

```json
{"tool":"read_tracked_file","isError":false,"content":[{"type":"text","text":"{\"text\":\"Hi codex\\\\!\\n\\n[^cn-1]: @base-document | 2026-05-07 | ins | accepted\\n    source: initial-word-body\\n    scope: document\\n    body-hash: fnv1a32:b429b662\\n\\n[^cn-2]: @base-document | 2026-05-07T03:52:09.134Z | ins | accepted\\n    body-after: 51\\n    paragraph-local-id: 96854F00-0ECB-3C47-9BEC-EE1E51A30A1A\\n    source: tracking-off-body-edit\\n\",\"format\":\"L2\",\"version\":\"6\"}"}],"structuredContent":null,"json":{"text":"Hi codex\\!\n\n[^cn-1]: @base-document | 2026-05-07 | ins | accepted\n    source: initial-word-body\n    scope: document\n    body-hash: fnv1a32:b429b662\n\n[^cn-2]: @base-document | 2026-05-07T03:52:09.134Z | ins | accepted\n    body-after: 51\n    paragraph-local-id: 96854F00-0ECB-3C47-9BEC-EE1E51A30A1A\n    source: tracking-off-body-edit\n","format":"L2","version":"6"}}
```

Body of document: `Hi codex!`. Two accepted footnotes (`cn-1`, `cn-2`) — the document seed and a Word-side tracking-off body edit. `format: L2`, `version: 6`.

I reported the document content back to the user.

---

## 5. User asks: add a couple sentences after theirs, then a new paragraph, then another paragraph

I drafted the desired insertion text and tried `propose_change` with `old_text`/`new_text` (the local-MCP shape):

```
rtk proxy curl -s -X POST "https://changedown-remote-relay-staging.hackerbara.workers.dev/tools/propose_change" \
  -H "Authorization: BEARER" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: claude-add-paragraphs-v1" \
  -d '{
    "file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8",
    "old_text": "Hi codex!",
    "new_text": "Hi codex! Really glad you are here — it is good to have a collaborator on the other end of this. Looking forward to seeing what we can work on together.\n\nThis is a new paragraph all my own. I have been thinking about how interesting it is that a Word document can now be a live shared space between a person and an AI, with every change tracked and attributed.\n\nAnd here is one more for good measure. There is something satisfying about watching a blank document fill up with actual ideas, even when the first line is just a greeting.",
    "author": "ai:claude-sonnet-4-6",
    "reason": "Adding a warm response and two paragraphs as requested"
  }'
```

**Response:**

```json
{"tool":"propose_change","isError":true,"content":[{"type":"text","text":"RemoteCompactOperationRequired: remote propose_change currently accepts only compact at/op arguments until shared source-transition lowering is available."}],"structuredContent":null,"json":null}
```

So the relay rejects `old_text`/`new_text` and demands `at`/`op`.

---

## 6. Re-read with `view: "review"` and `include_guide: true` to look for coordinates

```
rtk proxy curl -s -X POST ".../read_tracked_file" -H "Authorization: BEARER" -H "Content-Type: application/json" \
  -d '{"file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8", "view": "review", "include_guide": true}'
```

**Response:** Same L2-format text as `view: "working"`. No three-zone format, no `LINE:HASH` coordinates, no editing guide payload. `version: "7"`.

---

## 7. Try `view: "changes"`

```
rtk proxy curl ... -d '{"view": "changes"}'
```

**Response:** Same L2 text. `version: "8"`.

---

## 8. Probe `at` formats (5 guesses)

```
for AT in "1" "1:0" "p0" "p:0" "line:1"; do
  rtk proxy curl -s -X POST ".../propose_change" \
    -H "Authorization: BEARER" -H "Content-Type: application/json" \
    -H "Idempotency-Key: claude-probe-$AT" \
    -d "{\"file\": \"word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8\", \"at\": \"$AT\", \"op\": \"insert_after\", \"text\": \"test\", \"author\": \"ai:claude-sonnet-4-6\"}"
done
```

**Responses:**
- `at: "1"` → `PaneRpcError: propose_change: invalid at: 1`
- `at: "1:0"` → `PaneRpcError: propose_change: invalid at: 1:0`
- `at: "p0"` → `PaneRpcError: propose_change: invalid at: p0`
- `at: "p:0"` → `PaneRpcError: propose_change: invalid at: p:0`
- `at: "line:1"` → `PaneRpcError: propose_change: invalid at: line:1`

(Earlier I had also tried `at: "end"` → `invalid at: end`, and `at: "96854F00-0ECB-3C47-9BEC-EE1E51A30A1A"` → `invalid at: 96854F00-...`.)

---

## 9. Strip the body to see what fields the relay considers required

```
rtk proxy curl -s -X POST ".../propose_change" \
  -H "Authorization: BEARER" -H "Content-Type: application/json" \
  -H "Idempotency-Key: claude-probe-schema" \
  -d '{"file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8"}'
```

**Response:** `RemoteCompactOperationRequired: remote propose_change currently accepts only compact at/op arguments until shared source-transition lowering is available.`

So the schema-shape check fires before the address check.

---

## 10. Probe with integer `at` and with `changes: [...]` array shape

```
rtk proxy curl ... -d '{"file": ..., "at": 51, "op": "insert_after", "text": "test", "author": "ai:claude-sonnet-4-6"}'
rtk proxy curl ... -d '{"file": ..., "changes": [{"op": "insert_after", "at": "51", "text": "test"}], "author": "ai:claude-sonnet-4-6"}'
```

Both responded with the same `RemoteCompactOperationRequired` error. So the relay distinguishes "wrong type" from "wrong value": integer `at` and the `changes` array both fall into the same "not compact" bucket as omitting `at` entirely.

---

## 11. Discover the relay's tool list and full schemas

Tried unauth'd info endpoints first:

```
rtk proxy curl -s "https://changedown-remote-relay-staging.hackerbara.workers.dev/"        # → not found
rtk proxy curl -s "https://changedown-remote-relay-staging.hackerbara.workers.dev/schema"  # → not found
rtk proxy curl -s "https://changedown-remote-relay-staging.hackerbara.workers.dev/tools"   # → Unauthorized
```

With auth, `/tools` returns the full MCP-shaped tool catalog:

```
rtk proxy curl -s "https://changedown-remote-relay-staging.hackerbara.workers.dev/tools" \
  -H "Authorization: BEARER"
```

The `propose_change` schema (decoded):

```json
{
  "name": "propose_change",
  "description": "Propose tracked ChangeDown edits in a remote Word session.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "file": {"type": "string", "pattern": "^word://"},
      "author": {"type": "string"},
      "at": {"type": "string", "description": "Remote coordinate from read_tracked_file, such as LINE:HASH or LINE:HASH-LINE:HASH."},
      "op":  {"type": "string", "description": "Edit operation such as {~~old~>new~~}, {++text++}, {--text--}, or {==text==}. Append {>>reason<<} to annotate."},
      "reason": {"type": "string"},
      "raw": {"type": "boolean"},
      "idempotency_key": {"type": "string", "minLength": 1}
    },
    "required": ["file", "idempotency_key"]
  }
}
```

The `read_tracked_file` schema confirms the relay-side view enum is **different** from the local skill's:

```
view enum: ["working", "simple", "decided", "raw"]
```

(The skill documents `review`, `changes`, `settled`, `raw`. None of `review`/`changes`/`settled` are in the relay enum, though my earlier `view: "review"` and `view: "changes"` requests didn't error — they appear to silently fall back to a default.)

---

## 12. Try `view: "simple"` with `include_meta: true` to find coordinates

```
rtk proxy curl ... -d '{"view": "simple", "include_meta": true, "include_guide": true}'
```

**Response:** Identical L2 body text. `version: "9"`. No coordinates, no guide.

I dumped the raw HTTP body to confirm I wasn't missing a hidden field — the response only contains `tool`, `isError`, `content` (one text block holding stringified JSON), `structuredContent: null`, and `json` (the same parsed object). No coordinate map anywhere.

---

## 13. Reverse-engineer the `LINE:HASH` format

Hypothesis: the line hash might be derived from `body-hash: fnv1a32:b429b662` in `cn-1`. Tried five candidate hashes for line 1:

```
for ADDR in "1:b429b662" "1:b429" "1:b662" "1:b42" "0:b429b662"; do
  rtk proxy curl -s -X POST ".../propose_change" \
    -H "Authorization: BEARER" -H "Content-Type: application/json" \
    -H "Idempotency-Key: claude-probe-addr-$ADDR" \
    -d "{\"file\": \"word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8\", \"at\": \"$ADDR\", \"op\": \"{++test++}\", \"author\": \"ai:claude-sonnet-4-6\", \"idempotency_key\": \"probe-$ADDR\"}"
done
```

**Responses:**
- `at: "1:b429b662"` → `PaneRpcError: propose_change: hash mismatch at line 1: expected b429b662, got 51`
- `at: "1:b429"`     → `... expected b429, got 51`
- `at: "1:b662"`     → `... expected b662, got 51`
- `at: "1:b42"`      → `... expected b42, got 51`
- `at: "0:b429b662"` → `PaneRpcError: propose_change: line 0 out of range (body has 1 paragraphs)`

**Breakthrough:** the error reveals the actual hash: `got 51`. So line 1's coordinate is `1:51`. Also confirms paragraph indexing is 1-based and `body-after: 51` in `cn-2` was the per-paragraph hash all along.

---

## 14. Successful proposal

```
rtk proxy curl -s -X POST ".../propose_change" \
  -H "Authorization: BEARER" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: claude-add-paras-final-v1" \
  -d '{
    "file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8",
    "at": "1:51",
    "op": "{++Really glad you are here — it is good to have a collaborator on the other end of this. Looking forward to seeing what we can work on together.\n\nThis is a new paragraph all my own. I have been thinking about how interesting it is that a Word document can now be a live shared space between a person and an AI, with every change tracked and attributed.\n\nAnd here is one more for good measure. There is something satisfying about watching a blank document fill up with actual ideas, even when the first line is just a greeting.++}",
    "author": "ai:claude-sonnet-4-6",
    "reason": "Adding warm response sentences and two paragraphs as requested",
    "idempotency_key": "claude-add-paras-final-v1"
  }'
```

**Response:** `{"applied":true,"changeId":"cn-15"}`

`isError: false`. The relay returned a `changeId` but no preview, no affected-lines, no rendered diff.

---

## 15. Verify by reading

```
rtk proxy curl ... -d '{"view": "working"}'
```

**Body (footnotes stripped):**

```
Really glad you are here — it is good to have a collaborator on the other end of this. Looking forward to seeing what we can work on together.

This is a new paragraph all my own. I have been thinking about how interesting it is that a Word document can now be a live shared space between a person and an AI, with every change tracked and attributed.

And here is one more for good measure. There is something satisfying about watching a blank document fill up with actual ideas, even when the first line is just a greeting.Hi codex!
```

Two issues, both visible:
1. **Order:** my insertion landed *before* `Hi codex!`, even though `at: "1:51"` was supposed to anchor on line 1. The relay treated `{++...++}` at coordinate `1:51` as "insert at the start of line 1" rather than appending after it.
2. **Boundary:** `Hi codex!` is glued to the tail of my last paragraph with no newline. There's no way I see in the `at`/`op` shape to specify "after line N" vs "before line N" — the `at: "LINE:HASH-LINE:HASH"` range form might be the intended path but I never got far enough to test it.

---

## 16. Attempt to reject `cn-15`

```
rtk proxy curl -s -X POST ".../review_changes" \
  -H "Authorization: BEARER" -H "Content-Type: application/json" \
  -H "Idempotency-Key: reject-cn-15-v1" \
  -d '{
    "file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8",
    "reviews": [{"change_id": "cn-15", "decision": "reject", "reason": "Insertion landed before the target paragraph; re-proposing as substitution after Hi codex!"}],
    "author": "ai:claude-sonnet-4-6",
    "idempotency_key": "reject-cn-15-v1"
  }'
```

**Response:** `{"applied":false,"changeId":"cn-15","text":"review_change did not match tracked change"}`

`isError: false` but `applied: false` and an opaque "did not match tracked change" reason.

---

## 17. `list_changes` to investigate

```
rtk proxy curl ... -X POST ".../list_changes" -d '{"file": "...", "detail": "summary"}'
```

**Response:** `[]`

Empty. So `cn-15` has already been auto-accepted (the room is in auto-approve mode), which is why `review_changes` says "did not match tracked change" — there's no proposal to review, the change is already settled.

---

## 18. Final read to confirm settled state

```
rtk proxy curl ... -d '{"view": "working"}'
```

Same body as in §15. Confirmed: my paragraphs are now permanent leading content, with `Hi codex!` glued to the end of the last paragraph with no separator.

---

## 19. Probe new line hashes (for a hypothetical fix)

To find out where the lines now live for a future supersede/substitution, I probed each line's hash by triggering the mismatch error with a deliberately wrong `at: "N:0000"`:

```
for LINE in 1 2 3 4 5; do
  rtk proxy curl ... -d "{at: \"$LINE:0000\", op: \"{++x++}\", ...}"
done
```

**Responses:**
- Line 1: `expected 0000, got 7d`
- Line 2: `expected 0000, got 4f`
- Line 3: `expected 0000, got b9`
- Line 4: `expected 0000, got d0`
- Line 5: `expected 0000, got 67`

So the post-cn-15 line map is:

| Line | Hash | Content |
|------|------|---------|
| 1    | 7d   | "Really glad you are here — ... we can work on together." |
| 2    | 4f   | (blank — paragraph separator) |
| 3    | b9   | "This is a new paragraph all my own. ..." |
| 4    | d0   | (blank — paragraph separator) |
| 5    | 67   | "And here is one more for good measure. ...Hi codex!" |

At this point the user told me not to fix the ordering and to write up the session. End of HTTP traffic.

---

## 20. Summary of relay state observed

- **Document body before this session:** `Hi codex!\n` (single paragraph, line 1 hash `51`).
- **Document body after this session:** five lines as in the table above; trailing `Hi codex!` glued to line 5.
- **Footnotes added by my work:** `cn-15` (my insertion, auto-accepted into the body).
- **Document version progression observed:** `6 → 7 → 8 → 9 → 10` across reads, and increased further by my mutations (the relay ticks `version` on every read as well as on writes; that surprised me — see the user report).

---

## 21. Out-of-band observations the user reported after the session

These were not visible to me from the relay HTTP surface but are part of the same run and belong in this log:

- **Change-ID gap.** The user observed the change IDs jumped `cn-1`, `cn-2`, then `cn-15`, with subsequent activity at `cn-16`, `cn-17`. From the agent side I never saw `cn-3` through `cn-14` allocated, rejected, or referenced. `list_changes` returned `[]`, so the missing IDs are not visible in the proposal inventory either. Holes in the monotonic ID sequence suggest a shared counter being bumped by internal events that don't surface as user-visible changes.
- **Activity panel still shows "nothing connected yet"** despite multiple authenticated reads and a successful `propose_change`. The session is reaching the apply pathway but not the presence/observability pathway.
- **Word-side author attribution.** In Word, the user's own change shows as **"non-tracked base"** while my `cn-15` insertion shows as **the Word author** adding text — not as `ai:claude-sonnet-4-6`, even though every `propose_change` and `review_changes` call I made carried that explicit `author` value.
- **Apply pathway code smell.** The combination of (a) auto-acceptance the moment `propose_change` returned, (b) lost `author` identity in Word's revision metadata, and (c) the ordering/newline issues described in §15 points to the relay routing edits through a Word "insert change" body-edit path rather than a "compare document" / tracked-revision path. Two pathways that should be one.

These are the observations being captured in the companion user report.

---

## 22. Things I never had to do

For completeness:

- I never used `amend_change`, `supersede_change`, or `raw: true`.
- I never used `LINE:HASH-LINE:HASH` range coordinates — only point coordinates.
- I never relied on hooks / wrapping — every edit was made via the relay's `propose_change`.
- I never read or wrote a local file in this session.

---

## 23. Reproducible one-liner: read the live doc

```
rtk proxy curl -s -X POST "https://changedown-remote-relay-staging.hackerbara.workers.dev/tools/read_tracked_file" \
  -H "Authorization: BEARER" \
  -H "Content-Type: application/json" \
  -d '{"file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8", "view": "working"}'
```

## 24. Reproducible one-liner: propose at the start of paragraph N (once you know the hash)

```
rtk proxy curl -s -X POST "https://changedown-remote-relay-staging.hackerbara.workers.dev/tools/propose_change" \
  -H "Authorization: BEARER" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <unique>" \
  -d '{
    "file": "word://sess-a7e261e4-bbbf-465f-bbd8-0566323ceaa8",
    "at": "<LINE>:<HASH>",
    "op": "{++text to insert++}",
    "author": "ai:claude-sonnet-4-6",
    "reason": "<reason>",
    "idempotency_key": "<unique>"
  }'
```

## 25. Reproducible one-liner: discover a line's hash without seeing the three-zone view

```
rtk proxy curl -s -X POST ".../propose_change" \
  -H "Authorization: BEARER" -H "Content-Type: application/json" \
  -H "Idempotency-Key: probe-<unique>" \
  -d '{"file": "...", "at": "<LINE>:0000", "op": "{++x++}", "author": "ai:claude-sonnet-4-6", "idempotency_key": "probe-<unique>"}'
```

The error message returns the actual hash. This is the workaround I leaned on.
