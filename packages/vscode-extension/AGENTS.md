# VS Code Extension — changetracks-vscode

Editor integration: decorations, commands, panels (Review + Settings),
git integration, DOCX editor, tracking mode, view mode cycling.

## Build & Test

    npm run build                    # Full build from root (required first)
    npm run compile -w changetracks-vscode  # TS compile only (~2s)
    npm run test:fast                # Parser tests, no VS Code (<1s)
    npm run test:slow                # Playwright + VS Code Electron (~30s)

Package for install:
    cd packages/vscode-extension
    npx @vscode/vsce package --no-dependencies
    cursor --install-extension changetracks-0.0.1.vsix

Debug: press F5 in VS Code (launches Extension Development Host).

## Source Layout

    src/
    ├── commands/         Command registrations (change, comment, scm, setup, test)
    ├── docx/             DOCX editor provider and preview
    ├── preview/          Markdown preview plugin
    ├── view/             View components
    ├── extension.ts      Entry point — registers commands, creates controller (26K)
    ├── controller.ts     State machine — tracking, view mode, events (119K)
    ├── decorator.ts      Decoration engine — colors, hiding, cursor unfolding (63K)
    ├── review-panel.ts   Review panel webview (63K)
    ├── settings-panel.ts Settings panel webview (51K)
    ├── lsp-client.ts     LSP client connection
    ├── git-gutter-manager.ts  Git gutter takeover
    ├── git-integration.ts     Git extension API wrapper
    └── hover-provider.ts      Hover info for changes

## Controller State Machine

The controller (`controller.ts`) is the central state machine. See ARCHITECTURE.md
for cross-cutting flows (L2↔L3 lifecycle, accept/reject, edit boundary).

### State Fields

**Tracking & View:**
- `_trackingMode: boolean` — enables CriticMarkup wrapping on edits
- `_viewMode: ViewMode` — `'review'` | `'changes'` | `'settled'` | `'raw'`
- `_showDelimiters: boolean` — controls delimiter visibility (default false)
- `userTrackingOverrides: Map<uri, boolean>` — per-document user toggle (trumps LSP)
- `documentStates: Map<uri, {tracking, viewMode}>` — LSP-sourced per-doc state

**Document Shadow & IDs:**
- `documentShadow: Map<uri, string>` — previous text for deletion extraction
- `nextScIdMap: Map<uri, number>` — per-document ct-ID allocator

**Edit Boundary:**
- `pendingEditManager: PendingEditManager` — wraps core EditBoundaryState
- `isApplyingTrackedEdit: boolean` — re-entrancy guard during header/footnote writes
- `unconfirmedTrackedEdit` — deferred insertion/substitution awaiting selection confirmation (50ms)

**Projected View:**
- `projectedView: ProjectedView` — buffer swap for settled/raw modes (with `.changetracks-swap` crash recovery)
- `convertingUris: Set<uri>` — suppresses tracking during L3→L2 conversion and projected view transitions

**Cursor:**
- `lastCursorOffsets: Map<uri, number>` — direction for hidden range snap
- `isSnappingCursor: boolean` — guard against recursive snap
- `lastActiveEditorUri: string` — prevents spurious sidebar-toggle re-fires

**Cut/Paste Moves:**
- `pendingCut: {text, timestamp, moveId}` — paired with paste within 60s window

**LSP Integration:**
- `overlaySender` — sends pending edit overlay for preview
- `viewModeSender` — notifies LSP of view mode changes
- `cursorPositionSender` — notifies LSP of cursor moves (for CodeLens)
- `batchEditSender` — brackets batch edits to skip re-promotion
- `lspClient` — sends lifecycle requests (accept/reject/amend/supersede)

### Event Handler Chain

Typical keystroke flow:

    onDidChangeTextDocument
      ├─ Guards: undo/redo? projected view? converting? comment widget?
      ├─ Tracking: deletions auto-confirm, insertions queue as unconfirmed (50ms)
      ├─ Update documentShadow
      └─ transformCachedDecorations (optimistic), scheduleDecorationUpdate (50ms)

    onDidChangeTextEditorSelection (1-5ms later)
      ├─ Confirm pending edit if queued → handleTrackedEdits()
      ├─ Flush on cursor move if outside pending range
      ├─ updateChangeAtCursorContext → cursorPositionSender to LSP
      └─ snapCursorPastHiddenRanges (direction-aware, max 10 iterations)

    scheduleDecorationUpdate (50ms debounce)
      └─ updateDecorations(editor) → merge LSP cache + overlay → decorator.decorate()

    scheduleNotifyChanges (120ms debounce)
      └─ fire onDidChangeChanges (SCM, Change Explorer, timeline)

### View Mode Transitions

| Mode | Projected? | Buffer | Read-only? |
|------|-----------|--------|------------|
| `review` | No | Original markup | No |
| `changes` | No | Original markup (delimiters hidden via CSS) | No |
| `settled` | Yes | `computeSettledText()` — accepted text only | Yes |
| `raw` | Yes | `computeOriginalText()` — original text only | Yes |

Transitions between projected ↔ non-projected require buffer swap via `ProjectedView`.
Crash recovery: `.changetracks-swap` backup on enter, cleaned up on exit.

### Debounce Timers

| Timer | Duration | Purpose |
|-------|----------|---------|
| Decoration update | 50ms | Coalesce parse + decorate |
| Notify changes | 120ms | Batch SCM/Explorer/panel notifications |
| Overlay send | 50ms | Throttle pending overlay to LSP |
| Edit confirmation | 50ms | Auto-discard unconfirmed insertion if no selection |
| Safety-net (PEM) | 5s interval | Flush pending if elapsed > pauseThresholdMs |

## Decoration System

17 `TextEditorDecorationType` instances:

**Change types:** insertionObj (green underline), deletionObj (red strikethrough),
substitutionOriginalObj (red strikethrough), substitutionModifiedObj (green),
highlightObj (yellow bg), commentObj (blue border + bubble emoji)

**Structural:** hiddenObj (CSS `display:none`), unfoldedObj (gray italic for cursor reveal),
activeHighlightObj (blue bg for cursor's change), settledDimObj (50% opacity),
settledRefObj (gray for `[^ct-N]` refs), ghostDeletionObj (red italic `before` pseudo-element)

**Moves:** moveFromObj (purple strikethrough + up-arrow), moveToObj (purple underline + down-arrow)

**Overview ruler:** 5 ruler types using ThemeColor tokens for user override

**Per-author dynamic types:** 5-color palette cycling (green, purple, orange, teal, blue).
Deletions always use fixed red (strikethrough signals removal, author color would contradict).

### hiddenObj Lifecycle

The `display:none` CSS cache persists in VS Code even after `setDecorations(type, [])`.
Fix: dispose/recreate the type when transitioning from had-ranges → no-ranges.
Guard: only when `changes.length > 0` (comment thread editors share the type;
disposing would break the main document).

### Cursor Unfolding

In changes mode with `showDelimiters=true`, when cursor enters a change's contentRange,
delimiters move from `hiddenObj` → `unfoldedObj` (gray italic). Delimiters become
visible while cursor is inside the change, hidden again when cursor leaves.

## Key Implementation Details

**Status fallback chain (recurring bug source):**
`node.metadata?.status ?? node.inlineMetadata?.status ?? node.status`
Always three tiers. `review-panel.ts` and `hover-provider.ts` have had bugs from
using only `metadata?.status`.

**Re-entrancy guard:** `isApplyingTrackedEdit` set during header writes, footnote
appends, comment handlers. Prevents tracking from wrapping system-generated edits.

**Monaco NBSP:** Monaco renders all spaces as U+00A0. Normalize with
`.replace(/\u00a0/g, ' ')` when reading DOM text.

## VS Code Extension Points

Commands: `changetracks.toggleTracking`, `.acceptChange`, `.rejectChange`,
`.acceptAll`, `.rejectAll`, `.nextChange`, `.previousChange`, `.addComment`, `.toggleView`

Configuration: `changetracks.trackingMode` (boolean), `changetracks.showDelimiters` (boolean),
`changetracks.clickToShowComments` (boolean), `changetracks.decorationStyle` ('foreground'|'background'),
`changetracks.authorColors` ('auto'|'always'|'never'), `changetracks.gutterStrategy` ('auto'|'assume-unchanged'|'proposed-api'|'off')

## Git Gutter Integration

`GitGutterManager` supports 3 strategies: `assume-unchanged` (flags files via
`git update-index`), `proposed-api` (VS Code QuickDiffProvider), and `off`.
Debounced at 500ms with HEAD change detection to avoid redundant reapply.
