/**
 * Edit Boundary State Machine — Signal Classifier
 *
 * Pure function that classifies an EditEvent + current state into a SignalType.
 * The state machine dispatches on the signal to decide what effects to emit.
 */

import type { EditEvent, EditBoundaryState, SignalType } from './types.js';
import { bufferEnd, containsOffset, containsOffsetInclusive } from './pending-buffer.js';

/**
 * Classify an incoming EditEvent against the current state.
 *
 * Classification rules (in priority order):
 *
 * 1. Composition events → ignore (state machine handles isComposing flag)
 * 2. Editor switch, save, explicit flush → hard-break
 * 3. Timer fired → soft-break
 * 4. No pending buffer + edit → new-edit
 * 5. Cursor move outside pending range → hard-break
 * 6. Cursor move within pending range → cursor-within
 * 7. Insertion: newline/paste → hard-break, at end → extend, within → splice
 * 8. Deletion: adjacent before → extend-backward, adjacent after → extend-forward, within → splice
 * 9. Substitution: within range → splice, otherwise → hard-break
 * 10. Edit outside buffer range → hard-break
 */
export function classifySignal(event: EditEvent, state: EditBoundaryState): SignalType {
  const { pending, isComposing } = state;

  // ── 1. Composition events ────────────────────────────────────────────
  if (event.type === 'compositionStart' || event.type === 'compositionEnd') {
    return 'ignore';
  }

  // ── 2. Always-hard-break events ──────────────────────────────────────
  if (event.type === 'editorSwitch' || event.type === 'save' || event.type === 'flush') {
    return 'hard-break';
  }

  // ── 3. Timer ─────────────────────────────────────────────────────────
  if (event.type === 'timerFired') {
    return 'soft-break';
  }

  // ── During IME composition, ignore regular edits ─────────────────────
  if (isComposing && (event.type === 'insertion' || event.type === 'deletion' || event.type === 'substitution')) {
    return 'ignore';
  }

  // ── 4. No pending buffer → new edit or cursor move ───────────────────
  if (pending === null) {
    if (event.type === 'cursorMove') {
      return 'ignore';
    }
    return 'new-edit';
  }

  // ── From here on, pending buffer exists ──────────────────────────────
  const end = bufferEnd(pending);

  // ── 5/6. Cursor move ─────────────────────────────────────────────────
  if (event.type === 'cursorMove') {
    if (containsOffsetInclusive(pending, event.offset)) {
      return 'cursor-within';
    }
    return 'hard-break';
  }

  // ── Newline insertion → hard-break (if configured) ───────────────────
  if (
    event.type === 'insertion' &&
    state.config.breakOnNewline &&
    event.text.includes('\n')
  ) {
    return 'hard-break';
  }

  // ── Paste detection → hard-break ─────────────────────────────────────
  if (
    event.type === 'insertion' &&
    event.text.length >= state.config.pasteMinChars
  ) {
    return 'hard-break';
  }

  // ── 7. Insertion at buffer end → extend ──────────────────────────────
  if (event.type === 'insertion' && event.offset === end) {
    return 'extend';
  }

  // ── 7b. Insertion within buffer range → splice ───────────────────────
  if (event.type === 'insertion' && containsOffset(pending, event.offset)) {
    return 'splice';
  }

  // ── 8. Deletion classification ───────────────────────────────────────
  if (event.type === 'deletion') {
    // Adjacent before: offset + deletedText.length === anchor → extend-backward
    if (event.offset + event.deletedText.length === pending.anchorOffset) {
      return 'extend-backward';
    }
    // Adjacent after: offset === end → extend-forward
    if (event.offset === end) {
      return 'extend-forward';
    }
    // Within buffer range → splice
    if (containsOffset(pending, event.offset)) {
      return 'splice';
    }
    // Outside → hard-break
    return 'hard-break';
  }

  // ── 9. Substitution classification ───────────────────────────────────
  if (event.type === 'substitution') {
    // Check if substitution range is fully within [anchor, end)
    if (event.offset >= pending.anchorOffset &&
        event.offset + event.oldText.length <= end) {
      return 'splice';
    }
    return 'hard-break';
  }

  // ── 10. Edit outside buffer range → hard-break ───────────────────────
  return 'hard-break';
}
