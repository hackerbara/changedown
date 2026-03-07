/**
 * Edit Boundary — Public API
 *
 * Pure, editor-agnostic module for classifying user edits into
 * "still typing" (pending) vs "done" (crystallize into CriticMarkup).
 *
 * Consumers:
 *  - VS Code PendingEditManager (thin adapter)
 *  - LSP server pending-edit-manager (thin adapter)
 *  - State machine (Task 2, built on top of these primitives)
 */

// Types
export type {
  EditEvent,
  PendingBuffer,
  EditBoundaryState,
  EditBoundaryConfig,
  Effect,
  EditPendingOverlay,
  SignalType,
} from './types.js';

export { DEFAULT_EDIT_BOUNDARY_CONFIG } from './types.js';

// Pending Buffer operations
export {
  isEmpty,
  bufferEnd,
  containsOffset,
  containsOffsetInclusive,
  extend,
  prependOriginal,
  appendOriginal,
  spliceInsert,
  spliceDelete,
  createBuffer,
} from './pending-buffer.js';

// Signal classification
export { classifySignal } from './signal-classifier.js';

// State machine
export { processEvent } from './state-machine.js';
export type { ProcessEventContext, ProcessEventResult } from './state-machine.js';
