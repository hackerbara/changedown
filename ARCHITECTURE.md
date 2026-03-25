# ARCHITECTURE.md — ChangeTracks

## Package Dependency Graph

    core (0 internal deps)
      ↑
    docx (imports core)
      ↑
    cli (imports core, docx)
      ↑
    lsp-server (imports core; imports cli for config parsing only)
      ↑
    vscode-extension (LSP protocol to lsp-server; imports core/docx/cli for types only)

Build order: core → docx → cli → lsp-server → vscode-extension
All packages use TypeScript with strict mode. Core emits both CJS (dist/) and ESM (dist-esm/).

## Core Data Flow

    Text input
      │
      ▼
    CriticMarkupParser.parse(text) → VirtualDocument { changes: ChangeNode[] }
      │
      ▼
    Operations (accept-reject, amend, supersede, navigation, tracking, comment)
      │
      ▼
    Renderers (settled-text, committed-text, sidecar views)

Key types:
- ChangeNode — parsed change with ChangeType, ChangeStatus, offsets, metadata
- ChangeType — Insertion | Deletion | Substitution | Highlight | Comment
- ChangeStatus — Proposed | Accepted | Rejected
- VirtualDocument — container for ChangeNode[], provides query methods

## CriticMarkup Syntax

| Type | Syntax | Example |
|------|--------|---------|
| Insertion | `{++text++}` | `{++added text++}` |
| Deletion | `{--text--}` | `{--removed text--}` |
| Substitution | `{~~old~>new~~}` | `{~~before~>after~~}` |
| Highlight | `{==text==}` | `{==highlighted==}` |
| Comment | `{>>text<<}` | `{>>note<<}` |

Highlights can attach comments with no whitespace: `{==text==}{>>comment<<}`

## L2 and L3 Formats

**L2 (on-disk format):** Inline CriticMarkup with footnote metadata. This is the
canonical, persisted format. All files on disk are L2. Footnotes (`[^ct-N]`)
carry author, timestamp, status, and discussion metadata.

**L3 (live editing projection):** L2 with deterministic line anchoring. L3 exists
for editors like VS Code that don't handle interleaved delimiter characters well.
Changes are moved to footnote definitions with `LINE:HASH {edit-op}` anchoring,
and the document body contains clean text.

Key properties of L3:
- Never persisted to disk — exists only during active editing sessions
- Round-trip compatible: L2 → L3 → L2 must be lossless
- Deterministic: same L2 input always produces same L3 output
- Line anchoring uses xxhash of the clean body line content

Conversion: `convertL2ToL3()` in `packages/core/src/operations/l2-to-l3.ts`
Reverse: `convertL3ToL2()` in `packages/core/src/operations/l3-to-l2.ts`

## Matching Cascade

Six-level matching in `findUniqueMatch()` (`packages/core/src/file-ops.ts`):

1. **Exact** — `text.indexOf(target)` with uniqueness check
2. **Ref-transparent** — Strips `[^ct-N]` footnote refs from both haystack and needle
3. **Normalized** — NFKC unicode normalization
4. **Whitespace-collapsed** — All whitespace runs → single space
5. **Committed-text** — Strips pending proposals (accepted changes stay)
6. **Settled-text** — Strips all CriticMarkup, expands match to cover constructs

Each level is tried only if the previous fails. Returns `UniqueMatch` with index,
length, original text, and flags indicating which level matched.

Critical invariant: never silently normalize confusables (ADR-022/061). The cascade
is diagnostic — it tells you which level matched, it doesn't silently transform input.

## Extension Architecture

**Controller** (`packages/vscode-extension/src/controller.ts`, ~119K):
State machine managing tracking mode, view mode, edit boundary detection, and
cursor position. See `packages/vscode-extension/AGENTS.md` for the full state
field inventory and event handler chain.

Key state groups:
- **Tracking & view** — `_trackingMode`, `_viewMode`, `_showDelimiters`
- **Document shadow** — `documentShadow` (Map<uri, string>) for deletion detection
- **Edit boundary** — `pendingEditManager` wraps core `EditBoundaryState`
- **Projected view** — `projectedView` manages buffer swap for settled/raw modes
- **Per-document** — `convertingUris`, `nextScIdMap`, `userTrackingOverrides`, `documentStates`
- **Cursor** — `lastCursorOffsets`, `cursorPositionSender` (for CodeLens)

**Decorator** (`packages/vscode-extension/src/decorator.ts`, ~63K):
17 `TextEditorDecorationType` instances covering all change semantics.
See `packages/vscode-extension/AGENTS.md` for the full decoration type table.

**Review Panel** (`packages/vscode-extension/src/review-panel.ts`, ~63K):
Webview panel showing all changes with accept/reject controls, discussion threads,
and filtering.

## L2 ↔ L3 Lifecycle

L3 is an in-memory projection that exists only during active editing. The LSP
server owns promotion (L2→L3) and the extension/application owns demotion
(L3→L2 on save).

### Promotion (L2 → L3)

Automatic on file open if the document has tracked changes.

    File opens in VS Code
        ↓
    LSP onDidOpen → parse L2, find changes
        ↓
    convertL2ToL3(text) → L3 text with LINE:HASH anchors
        ↓
    Parse L3 → cache, send decorationData (pre-cache for instant render)
        ↓
    Send promotionStarting notification → extension sets convertingUris guard
        ↓
    workspace.applyEdit() → replace buffer with L3
        ↓
    promotingUris guard suppresses echo re-parse
        ↓
    Send promotionComplete → extension clears guard, refreshes decorations

**Guards:**
- `promotingUris` (LSP) — suppresses re-parse of the echo didChange
- `batchEditUris` (LSP) — suppresses re-promotion during multi-file batch ops
- `suppressRepromotionAfterDiskRevert` (LSP) — prevents re-promoting after "Don't Save" close
- `convertingUris` (extension) — suppresses tracking during promotion/demotion

### Demotion (L3 → L2)

Not automatic — the application is responsible for calling `convertL3ToL2()` before
writing to disk. In the extension, this happens in `onWillSaveTextDocument`.

    User saves (Ctrl+S)
        ↓
    Extension flushes pending edits
        ↓
    convertL3ToL2(L3text) → L2 with inline CriticMarkup restored
        ↓
    WorkspaceEdit replaces buffer with L2 (convertingUris guard active)
        ↓
    File written to disk as L2

### L3 Format Example

L2 on disk:
```
The team {++new ++}[^ct-1]prototype last week.

[^ct-1]: @alice | 2026-03-16 | ins | proposed
```

L3 in memory:
```
The team new prototype last week.

[^ct-1]: @alice | 2026-03-16 | ins | proposed
    1:a3f {++new ++}
```

Body is clean (no delimiters, no refs). Each footnote's first body line is
`    LINE:HASH {edit-op}` where LINE is 1-indexed and HASH is xxhash of the
clean body line. The matching cascade (`findUniqueMatch()`) re-locates changes
during L3→L2 conversion even if the body has been edited.

### Round-Trip Invariant

L2 → L3 → L2 must be lossless. This is enforced by:
- All metadata lives in footnote headers (preserved verbatim)
- Discussion lines preserved as continuation lines
- `findUniqueMatch()` 6-level cascade re-locates changes in the body
- Status determines body text state (accepted insertions stay, rejected removed)

## Accept/Reject Flow

End-to-end trace from user action to rendered result.

    User: Command palette / CodeLens / Review Panel → Accept or Reject
        ↓
    Extension: acceptChangeAtCursor() → optional QuickPick for reason
        ↓
    Extension: sendLifecycleRequest('changetracks/reviewChange', {
        uri, changeId, decision, reason
    })
        ↓
    LSP: handleReviewChange() → getDocumentText(uri)
        ↓
    Core: applyReview(text, changeId, decision, reason, author)
        ├─ Find footnote block for changeId
        ├─ Insert review line: "    approved: @author date "reason""
        ├─ Update footnote header status (proposed → accepted/rejected)
        ├─ Cascade to children if grouped change
        └─ Return updatedContent
        ↓
    LSP: optional auto-settle (settleAcceptedChangesOnly / settleRejectedChangesOnly)
        ↓
    LSP: return fullDocumentEdit → extension applies via workspace.applyEdit()
        ↓
    LSP: re-parse on didChange → sendDecorationData → extension refreshes decorations

**Bulk operations** (`reviewAll`): sorted in reverse document order (highest offset
first) to prevent offset invalidation. Single auto-settle pass at the end.

**Key detail**: The primary accept/reject path uses `applyReview()` (footnote-level
metadata manipulation), NOT `computeAccept/Reject()` (low-level text edit primitives
used by settled-text rendering).

## Edit Boundary State Machine

The edit boundary groups rapid keystrokes into single tracked changes.

    User types character
        ↓
    onDidChangeTextDocument fires
        ↓
    Selection-confirmation gate:
        Deletions auto-confirm
        Insertions/substitutions → queue unconfirmedTrackedEdit, 50ms timeout
        ↓
    onDidChangeTextEditorSelection fires (1-5ms later)
        Confirms pending edit → handleTrackedEdits()
        ↓
    PendingEditManager.handleEdit() → core processEvent()
        Returns effects: updatePendingOverlay | crystallize | mergeAdjacent
        ↓
    crystallize: wrap text in {++...++}, {--...--}, or {~~...~~}
        Apply edit to document, emit footnote (L3)

**Flush triggers:**
- Cursor moves outside pending range (`shouldFlushOnCursorMove`)
- Safety-net timer exceeds `pauseThresholdMs` (default 30s, 0 = disabled)
- Document save
- Tracking mode toggled off (abandons pending, does not crystallize)
- Manual flush via `changetracks/flushPending` notification

## State Synchronization Protocol

The LSP server and extension maintain synchronized state via notifications.

### Server → Client

| Notification | Payload | Trigger |
|---|---|---|
| `decorationData` | `ChangeNode[]` | parse complete (debounced 60ms) |
| `changeCount` | counts by type | same as decorationData |
| `allChangesResolved` | uri | when total changes = 0 |
| `documentState` | tracking + viewMode | doc open, header change, config change |
| `viewModeChanged` | uri + viewMode | view mode confirmation |
| `pendingEditFlushed` | uri + range + newText | pending edit crystallizes |
| `promotionStarting` | uri | before L2→L3 buffer replace |
| `promotionComplete` | uri | after L2→L3 success or failure |

### Client → Server

| Notification | Payload | Purpose |
|---|---|---|
| `trackingEvent` | type + offset + text | route to pending edit manager |
| `batchEditStart` / `batchEditEnd` | uri | suppress re-promotion during batch |
| `flushPending` | uri | hard break: crystallize pending |
| `updateSettings` | reviewerIdentity | update attribution |
| `pendingOverlay` | uri + overlay | in-flight insertion preview |
| `setViewMode` | uri + viewMode | view mode change |
| `cursorPosition` | uri + line + changeId | cursor-gated CodeLens |
| `setCodeLensMode` | mode | user preference (cursor/always/off) |

### Custom Requests (client → server, expects response)

| Request | Purpose | Core function |
|---|---|---|
| `getChanges` | fetch parsed ChangeNode[] | `getMergedChanges` |
| `reviewChange` | accept/reject one change | `applyReview` |
| `reviewAll` | bulk accept/reject | `applyReview` (loop) |
| `amendChange` | modify change text | `computeAmendEdits` |
| `supersedeChange` | replace change | `computeSupersedeResult` |
| `replyToThread` | add discussion comment | `computeReplyEdit` |
| `resolveThread` / `unresolveThread` | thread resolution | `computeResolutionEdit` |
| `compactChange` | compact change level | `compactToLevel1/0` |
| `annotate` | git-based annotation | `annotateMarkdown` |
| `getProjectConfig` | read config | project config state |

## Decoration Pipeline

    LSP server: parse → ChangeNode[] → sendDecorationData notification
        ↓
    Extension lsp-client: cache in decorationCache Map
        ↓
    Controller: scheduleDecorationUpdate (50ms debounce)
        ↓
    Controller: updateDecorations(editor)
        Merge LSP cache + optimistic pending overlay nodes
        ↓
    Decorator: decorate(editor, virtualDoc, viewMode, text, showDelimiters)
        Build 13 DecorationOptions[] arrays
        Apply per-author dynamic decoration types
        ↓
    editor.setDecorations() × (13 fixed types + per-author types + rulers)

View mode determines decoration behavior:
- **review** — full CriticMarkup visible with type coloring
- **changes** (simple) — delimiters hidden, cursor-reveal on hover
- **settled** — projected view, accepted text only, read-only buffer
- **raw** — projected view, original text only, read-only buffer

## CLI and Engine Layer

**Two bin entries** from `packages/cli` (`changetracks` npm package):
- `ctrk` — main agent + user CLI; routes to git diff driver / user commands / agent commands
- `changetracks` — init wizard only (`changetracks init`)

**Three-path routing in `ctrk`:** git diff driver (7-arg detection) → user commands (Commander, `status|list|diff|…`) → agent commands (`runAgentCommands()` → `runCommand()`).

**Engine layer** (`packages/cli/src/engine/`, exported as `changetracks/engine`) is the shared contract consumed by both `ctrk` and the MCP server. Key components:

- **Handler signature contract:** All 16 engine handlers share:
  `(args: Record<string, unknown>, resolver: ConfigResolver, state: SessionState) => Promise<{ content: [...]; isError?: boolean }>`
  This is the MCP tool result format. The CLI wraps it via `handlerToCliResult()`. Adding a new operation: write handler → export from `engine/index.ts` → add to `agent-command-registry.ts` → add to MCP server's `CallToolRequestSchema`.

- **`ConfigResolver`** — Session-scoped, lazy per-file config loader. Walks up to `.changetracks/config.toml`, caches by project root, file-watches for live reload. One instance per MCP stdio session; one per `ctrk` invocation (disposed after via `resolver.dispose()`).

- **`SessionState`** — Per-session ID counter and hash registry. Tracks `ct-N` allocation per file, manages change groups, records per-line hashes for staleness detection.

- **Protocol mode** (`classic` vs `compact`) is read from `.changetracks/config.toml` via `resolveProtocolMode()`. `getListedToolsWithConfig()` selects between `classicProposeChangeSchema` (old_text/new_text) and `compactProposeChangeSchema` (LINE:HASH + CriticMarkup op) at tool-list time. The MCP client sees a different `propose_change` schema depending on the project's config.

**The 6-tool MCP surface** (`engine/listed-tools.ts`): `read_tracked_file`, `propose_change`, `review_changes`, `amend_change`, `list_changes`, `supersede_change`. Additional backward-compat handlers exist (`raw_edit`, `propose_batch`, `respond_to_thread`, etc.) but are not in the listed surface.

**LSP server CLI import** is narrow: only `parseConfigToml` and `DEFAULT_CONFIG` from `changetracks/config`. The LSP server does not use engine handlers — all change operations go through `@changetracks/core` directly.

## Key Invariants

These must remain true across all changes:

1. Parser is single-pass O(n). No multiple passes.
2. Status fallback: `node.metadata?.status ?? node.inlineMetadata?.status ?? node.status`
3. No silent confusable normalization. Diagnostic detection only.
4. L2 → L3 → L2 round-trip is lossless.
5. `hiddenObj` decorator uses `textDecoration: 'none; display: none;'` — load-bearing CSS.
6. Edit boundary: `pauseThresholdMs=0` means "disable timer" (core guard checks `> 0`).
7. Extension communicates with core through LSP, not direct import, for change operations.
