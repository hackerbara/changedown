import type { EditEvent, EditBoundaryState, SignalType } from './types.js';
import { bufferEnd, containsOffset } from './pending-buffer.js';

/**
 * Classify an incoming EditEvent against the current state.
 *
 * Classification rules (in priority order):
 *
 * 1. Control events (save, editorSwitch, flush) → hard-break
 * 2. During IME composition → ignore
 * 3. No pending buffer → break (start new buffer)
 * 4. Newline/paste insertion → break
 * 5. Insertion at end → extend, within → splice, outside → break
 * 6. Deletion adjacent → extend, within → splice, outside → break
 * 7. Substitution within → splice, outside → break
 */
export function classifySignal(event: EditEvent, state: EditBoundaryState): SignalType {
  const { pending, isComposing } = state;

  // 1. Always-hard-break events
  if (event.type === 'editorSwitch' || event.type === 'save' || event.type === 'flush') {
    return 'hard-break';
  }

  // 1b. Cursor move: flush if cursor left the pending buffer's active range
  if (event.type === 'cursorMove') {
    const buf = pending;
    if (!buf) return 'ignore';
    // Pure deletion buffers exempt — user is likely pressing Backspace repeatedly
    if (buf.currentText.length === 0 && buf.originalText.length > 0) return 'ignore';
    const outside = event.offset < buf.anchorOffset ||
                    event.offset > buf.anchorOffset + buf.currentText.length;
    return outside ? 'hard-break' : 'ignore';
  }

  // 2. During IME composition, ignore regular edits
  if (isComposing) {
    return 'ignore';
  }

  // 3. No pending buffer → break (will create new buffer)
  if (pending === null) {
    return 'break';
  }

  // ── From here on, pending buffer exists ──
  const end = bufferEnd(pending);

  // 4. Newline insertion → break (if configured)
  if (
    event.type === 'insertion' &&
    state.config.breakOnNewline &&
    event.text.includes('\n')
  ) {
    return 'break';
  }

  // 5. Paste detection → break
  if (
    event.type === 'insertion' &&
    event.text.length >= state.config.pasteMinChars
  ) {
    return 'break';
  }

  // 6. Insertion classification
  if (event.type === 'insertion') {
    if (event.offset === end) return 'extend';
    if (containsOffset(pending, event.offset)) return 'splice';
    return 'break';
  }

  // 7. Deletion classification
  if (event.type === 'deletion') {
    // Adjacent before: backspace just before buffer start
    if (event.offset + event.deletedText.length === pending.anchorOffset) return 'extend';
    // Adjacent after: forward-delete at buffer end
    if (event.offset === end) return 'extend';
    // Within buffer range
    if (containsOffset(pending, event.offset)) return 'splice';
    return 'break';
  }

  // 8. Substitution classification
  if (event.type === 'substitution') {
    if (event.offset >= pending.anchorOffset &&
        event.offset + event.oldText.length <= end) {
      return 'splice';
    }
    return 'break';
  }

  const _exhaustive: never = event;
  return _exhaustive;
}
