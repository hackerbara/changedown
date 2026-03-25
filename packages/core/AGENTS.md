# Core Package — @changetracks/core

CriticMarkup parser, operations engine, data structures, and matching cascade.
Zero internal dependencies. Foundation consumed by all other packages.

## Build & Test

    npm run build -w @changetracks/core       # Build CJS + ESM
    npm run test:core                          # Vitest (from root)
    cd packages/tests && npx vitest run core/  # Direct vitest

Output: `dist/` (CommonJS), `dist-esm/` (ESM)

## Source Layout

    src/
    ├── parser/           CriticMarkupParser, FootnoteNativeParser, code-zones
    ├── operations/       accept-reject, amend, supersede, L2↔L3, navigation, tracking
    ├── model/            ChangeNode, VirtualDocument, ChangeType, ChangeStatus
    ├── edit-boundary/    State machine for grouping keystrokes into tracked edits
    ├── annotators/       Markdown and sidecar annotation
    ├── renderers/        Settled-text, committed-text rendering
    ├── providers/        Change provider interface
    ├── config/           Configuration types
    ├── file-ops.ts       findUniqueMatch() — 6-level matching cascade
    ├── footnote-*.ts     Footnote parsing, patterns, utilities
    ├── hashline.ts       LINE:HASH anchoring for L3 format
    └── index.ts          Main exports

## Key Entry Points

- `CriticMarkupParser.parse(text)` → `VirtualDocument` — L2 format (inline markup)
- `FootnoteNativeParser` — L3 format (footnote-native with LINE:HASH)
- `findUniqueMatch(text, target)` → `UniqueMatch` (6-level cascade)
- `convertL2ToL3()` / `convertL3ToL2()` — format conversion
- `applyReview()` — accept/reject with footnote metadata
- `computeAccept()` / `computeReject()` — low-level text edit primitives

## L2 ↔ L3 Conversion

**L2→L3** (`operations/l2-to-l3.ts`): Parse L2 with CriticMarkupParser →
strip all CriticMarkup from body (reverse order) → compute line:hash anchors
→ inject `    LINE:HASH {edit-op}` as first body line of each footnote.

**L3→L2** (`operations/l3-to-l2.ts`): Parse L3 with FootnoteNativeParser →
extract LINE:HASH from footnotes → `findUniqueMatch()` to locate body position
→ re-insert CriticMarkup inline (reverse order) → strip edit-op lines.

**Format detection:** `isL3Format(text)` in `footnote-patterns.ts` auto-detects.

**L3 edit-op regex:** `FOOTNOTE_L3_EDIT_OP = /^ {4}(\d+):([0-9a-fA-F]{2,}) (.*)/`

## Accept/Reject Operations

Two distinct paths:

**`applyReview()`** (`operations/apply-review.ts`) — used by LSP accept/reject flow:
- Finds footnote block for changeId
- Inserts review line (approved/rejected + author + timestamp + reason)
- Updates footnote header status (proposed → accepted/rejected)
- Cascades to children if grouped change
- Returns updated file content

**`computeAccept/Reject()`** (`operations/accept-reject.ts`) — low-level primitives:
- Returns TextEdit for inline markup transformation
- Used by settled-text rendering and some test scenarios
- NOT used by the main accept/reject user flow

## Matching Cascade

`findUniqueMatch()` in `file-ops.ts` — 6 levels, each tried only if previous fails:
1. Exact → 2. Ref-transparent → 3. NFKC normalized → 4. Whitespace-collapsed
→ 5. Committed-text → 6. Settled-text

Critical for L3→L2 conversion: re-locates changes even after body edits.

## Edit Boundary State Machine

`edit-boundary/` — groups keystrokes into tracked changes. Exported separately
as `@changetracks/core/edit-boundary`. Key function: `processEvent(state, event)`
returns effects (crystallize, mergeAdjacent, updatePendingOverlay). Used by both
the extension's PendingEditManager and the LSP server's PendingEditManager.

## Exports

Three export paths:
- `.` — public API (parser, operations, types)
- `./internals` — internal utilities for LSP/extension
- `./edit-boundary` — edit boundary state machine

## Pending Work

- Footnote native parser rewrite (design: `docs/superpowers/specs/2026-03-17-footnote-native-parser-rewrite-design.md`)
- Contextual edit-op design (design: `docs/plans/2026-03-18-contextual-editop-design.md`)
