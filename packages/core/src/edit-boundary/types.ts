/**
 * Edit Boundary State Machine — Type Definitions
 *
 * Pure data types for the edit-boundary state machine that classifies
 * user edits into "pending" (still being typed) vs "committed" (crystallized
 * into CriticMarkup). These types are editor-agnostic: both the VS Code
 * extension and the LSP server consume them via thin adapters.
 */

// ── Events ──────────────────────────────────────────────────────────────

/**
 * All possible events the state machine can receive.
 * Editor adapters translate platform events into these.
 */
export type EditEvent =
  | { type: 'insertion'; offset: number; text: string }
  | { type: 'deletion'; offset: number; deletedText: string }
  | { type: 'substitution'; offset: number; oldText: string; newText: string }
  | { type: 'cursorMove'; offset: number }
  | { type: 'timerFired' }
  | { type: 'save' }
  | { type: 'compositionStart' }
  | { type: 'compositionEnd' }
  | { type: 'editorSwitch' }
  | { type: 'flush' };

// ── Pending Buffer ──────────────────────────────────────────────────────

/**
 * The in-flight text accumulator. Tracks what the user has typed
 * (or deleted) since the last crystallization boundary.
 */
export interface PendingBuffer {
  /** Where the edit region starts in the document (absolute offset). */
  anchorOffset: number;
  /** What's in the document now at [anchor, anchor+currentText.length). */
  currentText: string;
  /** What was there before editing began (accumulated from deletions). */
  originalText: string;
  /** Cursor position within the buffer (0-based, relative to anchorOffset). */
  cursorOffset: number;
  /** When this edit began (ms since epoch, for pause timer). */
  startTime: number;
  /** Last modification timestamp (ms since epoch). */
  lastEditTime: number;
  /** Change ID (allocated on creation). */
  scId?: string;
}

// ── State ───────────────────────────────────────────────────────────────

/**
 * Full state of the edit-boundary state machine.
 * Pure value — no side effects, no subscriptions.
 */
export interface EditBoundaryState {
  pending: PendingBuffer | null;
  isComposing: boolean;
  config: EditBoundaryConfig;
}

// ── Configuration ───────────────────────────────────────────────────────

export interface EditBoundaryConfig {
  /** Pause threshold in ms. 0 = never auto-commit on pause. Default 30000. */
  pauseThresholdMs: number;
  /** Whether a newline character forces a hard break. Default true. */
  breakOnNewline: boolean;
  /** Minimum characters for a paste to be treated as a hard break. Default 50. */
  pasteMinChars: number;
}

/** Sensible defaults. */
export const DEFAULT_EDIT_BOUNDARY_CONFIG: Readonly<EditBoundaryConfig> = {
  pauseThresholdMs: 30000,
  breakOnNewline: true,
  pasteMinChars: 50,
};

// ── Effects ─────────────────────────────────────────────────────────────

/**
 * Side effects that the state machine requests from the host.
 * The state machine is pure — it returns effects, the host executes them.
 */
export type Effect =
  | { type: 'crystallize'; changeType: 'insertion' | 'deletion' | 'substitution';
      offset: number; length: number; currentText: string; originalText: string; scId?: string }
  | { type: 'updatePendingOverlay'; overlay: EditPendingOverlay | null }
  | { type: 'scheduleTimer'; ms: number }
  | { type: 'cancelTimer' }
  | { type: 'mergeAdjacent'; offset: number };

/**
 * Overlay data the host uses to render the pending edit region.
 *
 * Named `EditPendingOverlay` to distinguish from the legacy
 * `PendingOverlay` in model/types.ts (which has a different shape).
 * This type replaces it once the state-machine migration is complete.
 */
export interface EditPendingOverlay {
  anchorOffset: number;
  currentLength: number;
  currentText: string;
  originalText: string;
  cursorOffset: number;
}

// ── Signal Classification ───────────────────────────────────────────────

/**
 * Result of classifying an EditEvent against the current state.
 * The state machine dispatches on this to decide what to do.
 */
export type SignalType =
  | 'hard-break'
  | 'soft-break'
  | 'extend'
  | 'extend-backward'
  | 'extend-forward'
  | 'splice'
  | 'cursor-within'
  | 'ignore'
  | 'new-edit';
