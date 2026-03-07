/**
 * Edit Boundary State Machine — Core Logic
 *
 * Pure function that processes edit events and produces new state + effects.
 * No I/O, no timers, no async — timer scheduling is emitted as an effect
 * for the host adapter to execute.
 *
 * This replaces 738 LOC in the VS Code extension and 455 LOC in the LSP
 * server with a single, testable, editor-agnostic state machine.
 */

import type {
  EditEvent,
  EditBoundaryState,
  Effect,
  EditPendingOverlay,
  PendingBuffer,
} from './types.js';
import { classifySignal } from './signal-classifier.js';
import {
  createBuffer,
  extend,
  prependOriginal,
  appendOriginal,
  spliceInsert,
  spliceDelete,
  isEmpty,
} from './pending-buffer.js';

// ── Public API ──────────────────────────────────────────────────────────

export interface ProcessEventContext {
  /** Current timestamp (ms). Injected by host for deterministic replay. */
  now: number;
  /** Allocate a new change ID (e.g., "ct-7"). Called once per buffer creation. */
  allocateScId?: () => string;
}

export interface ProcessEventResult {
  newState: EditBoundaryState;
  effects: Effect[];
}

/**
 * Process a single edit event against the current state.
 * Returns the new state and any effects the host should execute.
 */
export function processEvent(
  state: EditBoundaryState,
  event: EditEvent,
  context: ProcessEventContext,
): ProcessEventResult {
  // Composition events are handled specially — they modify the isComposing
  // flag but the classifier returns 'ignore' so we handle them before dispatch.
  if (event.type === 'compositionStart') {
    return {
      newState: { ...state, isComposing: true },
      effects: [],
    };
  }

  if (event.type === 'compositionEnd') {
    const effects: Effect[] = [];
    // Reset timer on composition end if there is a pending buffer
    if (state.pending !== null && state.config.pauseThresholdMs > 0) {
      effects.push({ type: 'scheduleTimer', ms: state.config.pauseThresholdMs });
    }
    return {
      newState: { ...state, isComposing: false },
      effects,
    };
  }

  const signal = classifySignal(event, state);

  switch (signal) {
    case 'hard-break':
      return handleHardBreak(state, event, context);
    case 'soft-break':
      return handleSoftBreak(state);
    case 'extend':
      return handleExtend(state, event as Extract<EditEvent, { type: 'insertion' }>, context);
    case 'extend-backward':
      return handleExtendBackward(state, event as Extract<EditEvent, { type: 'deletion' }>, context);
    case 'extend-forward':
      return handleExtendForward(state, event as Extract<EditEvent, { type: 'deletion' }>, context);
    case 'splice':
      return handleSplice(state, event, context);
    case 'cursor-within':
      return handleCursorWithin(state, event as Extract<EditEvent, { type: 'cursorMove' }>);
    case 'ignore':
      return { newState: state, effects: [] };
    case 'new-edit':
      return handleNewEdit(state, event, context);
  }
}

// ── Internal Helpers ────────────────────────────────────────────────────

/** Convert a PendingBuffer to the overlay data the host renders. */
function createOverlay(buf: PendingBuffer): EditPendingOverlay {
  return {
    anchorOffset: buf.anchorOffset,
    currentLength: buf.currentText.length,
    currentText: buf.currentText,
    originalText: buf.originalText,
    cursorOffset: buf.cursorOffset,
  };
}

/** Flush the pending buffer: crystallize + clear overlay + cancel timer + merge adjacent. */
function flush(state: EditBoundaryState): { effects: Effect[]; clearedState: EditBoundaryState } {
  const buf = state.pending;
  if (buf === null) {
    return { effects: [], clearedState: state };
  }

  const effects: Effect[] = [];

  // Determine change type from buffer contents at flush time
  const hasOriginal = buf.originalText.length > 0;
  const hasCurrent = buf.currentText.length > 0;

  if (!hasOriginal && !hasCurrent) {
    // Self-cancellation: both empty → no crystallize, just clean up
  } else {
    let changeType: 'insertion' | 'deletion' | 'substitution';
    if (!hasOriginal && hasCurrent) {
      changeType = 'insertion';
    } else if (hasOriginal && !hasCurrent) {
      changeType = 'deletion';
    } else {
      changeType = 'substitution';
    }

    effects.push({
      type: 'crystallize',
      changeType,
      offset: buf.anchorOffset,
      length: changeType === 'insertion' ? buf.currentText.length :
              changeType === 'deletion' ? buf.originalText.length :
              buf.originalText.length,
      currentText: buf.currentText,
      originalText: buf.originalText,
      scId: buf.scId,
    });
  }

  effects.push(
    { type: 'updatePendingOverlay', overlay: null },
    { type: 'cancelTimer' },
    { type: 'mergeAdjacent', offset: buf.anchorOffset },
  );

  const clearedState: EditBoundaryState = {
    ...state,
    pending: null,
  };

  return { effects, clearedState };
}

/** Build the timer + overlay effects for a live pending buffer. */
function pendingEffects(buf: PendingBuffer, config: EditBoundaryState['config']): Effect[] {
  const effects: Effect[] = [
    { type: 'updatePendingOverlay', overlay: createOverlay(buf) },
  ];
  if (config.pauseThresholdMs > 0) {
    effects.push({ type: 'scheduleTimer', ms: config.pauseThresholdMs });
  }
  return effects;
}

// ── Signal Handlers ─────────────────────────────────────────────────────

function handleHardBreak(
  state: EditBoundaryState,
  event: EditEvent,
  context: ProcessEventContext,
): ProcessEventResult {
  const { effects: flushEffects, clearedState } = flush(state);

  // After flushing, handle the event that caused the hard break.
  // For control events (save, editorSwitch, flush), no further action needed.
  if (event.type === 'save' || event.type === 'editorSwitch' || event.type === 'flush') {
    return { newState: clearedState, effects: flushEffects };
  }

  // For cursor moves outside range, just flush — no additional effect.
  if (event.type === 'cursorMove') {
    return { newState: clearedState, effects: flushEffects };
  }

  // For edits that caused a hard break (outside range, type change, newline, paste):
  // Create a new buffer for the edit (unified editing region — no immediate crystallize).
  if (event.type === 'insertion') {
    // Check for newline or paste — these still crystallize immediately
    if ((state.config.breakOnNewline && event.text.includes('\n')) ||
        event.text.length >= state.config.pasteMinChars) {
      const insertEffects: Effect[] = [
        {
          type: 'crystallize',
          changeType: 'insertion',
          offset: event.offset,
          length: event.text.length,
          currentText: event.text,
          originalText: '',
        },
      ];
      return {
        newState: clearedState,
        effects: [...flushEffects, ...insertEffects],
      };
    }

    // Normal insertion after hard break — create new buffer
    const scId = context.allocateScId?.();
    const now = context.now;
    const buf = createBuffer(event.offset, event.text, '', now, scId);
    const newState: EditBoundaryState = { ...clearedState, pending: buf };
    return {
      newState,
      effects: [...flushEffects, ...pendingEffects(buf, state.config)],
    };
  }

  if (event.type === 'deletion') {
    // Create buffer for deletion
    const scId = context.allocateScId?.();
    const now = context.now;
    const buf = createBuffer(event.offset, '', event.deletedText, now, scId);
    const newState: EditBoundaryState = { ...clearedState, pending: buf };
    return {
      newState,
      effects: [...flushEffects, ...pendingEffects(buf, state.config)],
    };
  }

  if (event.type === 'substitution') {
    // Create buffer for substitution
    const scId = context.allocateScId?.();
    const now = context.now;
    const buf = createBuffer(event.offset, event.newText, event.oldText, now, scId);
    const newState: EditBoundaryState = { ...clearedState, pending: buf };
    return {
      newState,
      effects: [...flushEffects, ...pendingEffects(buf, state.config)],
    };
  }

  // Unreachable: all EditEvent types handled above.
  throw new Error(`Unreachable: unhandled event type in handleHardBreak: ${(event as EditEvent).type}`);
}

function handleSoftBreak(state: EditBoundaryState): ProcessEventResult {
  // Timer fired. If there is a pending buffer, flush it.
  if (state.pending === null) {
    return { newState: state, effects: [] };
  }
  const { effects, clearedState } = flush(state);
  return { newState: clearedState, effects };
}

function handleExtend(
  state: EditBoundaryState,
  event: Extract<EditEvent, { type: 'insertion' }>,
  context: ProcessEventContext,
): ProcessEventResult {
  const buf = state.pending!;
  const now = context.now;
  const newBuf = extend(buf, event.text, now);
  const newState: EditBoundaryState = { ...state, pending: newBuf };
  return {
    newState,
    effects: pendingEffects(newBuf, state.config),
  };
}

function handleExtendBackward(
  state: EditBoundaryState,
  event: Extract<EditEvent, { type: 'deletion' }>,
  context: ProcessEventContext,
): ProcessEventResult {
  const buf = state.pending!;
  const now = context.now;
  const newBuf = prependOriginal(buf, event.deletedText, now);
  const newState: EditBoundaryState = { ...state, pending: newBuf };
  return {
    newState,
    effects: pendingEffects(newBuf, state.config),
  };
}

function handleExtendForward(
  state: EditBoundaryState,
  event: Extract<EditEvent, { type: 'deletion' }>,
  context: ProcessEventContext,
): ProcessEventResult {
  const buf = state.pending!;
  const now = context.now;
  const newBuf = appendOriginal(buf, event.deletedText, now);
  const newState: EditBoundaryState = { ...state, pending: newBuf };
  return {
    newState,
    effects: pendingEffects(newBuf, state.config),
  };
}

function handleSplice(
  state: EditBoundaryState,
  event: EditEvent,
  context: ProcessEventContext,
): ProcessEventResult {
  const buf = state.pending!;
  const now = context.now;

  if (event.type === 'insertion') {
    const newBuf = spliceInsert(buf, event.offset, event.text, now);
    const newState: EditBoundaryState = { ...state, pending: newBuf };
    return {
      newState,
      effects: pendingEffects(newBuf, state.config),
    };
  }

  if (event.type === 'deletion') {
    const newBuf = spliceDelete(buf, event.offset, event.deletedText.length, now);
    if (newBuf === null) {
      // Splice deletion emptied both currentText and originalText — discard silently.
      const newState: EditBoundaryState = { ...state, pending: null };
      return {
        newState,
        effects: [
          { type: 'updatePendingOverlay', overlay: null },
          { type: 'cancelTimer' },
        ],
      };
    }
    const newState: EditBoundaryState = { ...state, pending: newBuf };
    return {
      newState,
      effects: pendingEffects(newBuf, state.config),
    };
  }

  // Unreachable: splice is only dispatched for insertion/deletion events.
  throw new Error(`Unreachable: unhandled event type in handleSplice: ${(event as EditEvent).type}`);
}

function handleCursorWithin(
  state: EditBoundaryState,
  event: Extract<EditEvent, { type: 'cursorMove' }>,
): ProcessEventResult {
  const buf = state.pending!;
  const relativeOffset = event.offset - buf.anchorOffset;
  const newBuf: PendingBuffer = { ...buf, cursorOffset: relativeOffset };
  const newState: EditBoundaryState = { ...state, pending: newBuf };
  return {
    newState,
    effects: [
      { type: 'updatePendingOverlay', overlay: createOverlay(newBuf) },
    ],
  };
}

function handleNewEdit(
  state: EditBoundaryState,
  event: EditEvent,
  context: ProcessEventContext,
): ProcessEventResult {
  // No pending buffer — create one for all edit types.

  if (event.type === 'insertion') {
    // Check for newline hard break with no pending buffer
    if (state.config.breakOnNewline && event.text.includes('\n')) {
      return {
        newState: state,
        effects: [
          {
            type: 'crystallize',
            changeType: 'insertion',
            offset: event.offset,
            length: event.text.length,
            currentText: event.text,
            originalText: '',
          },
        ],
      };
    }

    // Check for paste detection with no pending buffer
    if (event.text.length >= state.config.pasteMinChars) {
      return {
        newState: state,
        effects: [
          {
            type: 'crystallize',
            changeType: 'insertion',
            offset: event.offset,
            length: event.text.length,
            currentText: event.text,
            originalText: '',
          },
        ],
      };
    }

    const scId = context.allocateScId?.();
    const now = context.now;
    const buf = createBuffer(event.offset, event.text, '', now, scId);
    const newState: EditBoundaryState = { ...state, pending: buf };
    return {
      newState,
      effects: pendingEffects(buf, state.config),
    };
  }

  if (event.type === 'deletion') {
    // Create buffer for deletion — no immediate crystallize
    const scId = context.allocateScId?.();
    const now = context.now;
    const buf = createBuffer(event.offset, '', event.deletedText, now, scId);
    const newState: EditBoundaryState = { ...state, pending: buf };
    return {
      newState,
      effects: pendingEffects(buf, state.config),
    };
  }

  if (event.type === 'substitution') {
    // Create buffer for substitution — no immediate crystallize
    const scId = context.allocateScId?.();
    const now = context.now;
    const buf = createBuffer(event.offset, event.newText, event.oldText, now, scId);
    const newState: EditBoundaryState = { ...state, pending: buf };
    return {
      newState,
      effects: pendingEffects(buf, state.config),
    };
  }

  // Unreachable: all edit event types handled above.
  throw new Error(`Unreachable: unhandled event type in handleNewEdit: ${(event as EditEvent).type}`);
}
