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
} from './pending-buffer.js';
import { wrapInsertion, wrapDeletion, wrapSubstitution } from '../operations/tracking.js';
import { generateFootnoteDefinition, buildContextualL3EditOp } from '../operations/footnote-generator.js';
import { computeLineHash } from '../hashline.js';
import { buildLineStarts, offsetToLineNumber } from '../operations/l2-to-l3.js';
import { ChangeType, ChangeStatus, changeTypeToAbbrev } from '../model/types.js';
import type { TextEdit, ChangeNode } from '../model/types.js';
import { CriticMarkupParser } from '../parser/parser.js';

// Module-level singleton — CriticMarkupParser is stateless between parse() calls
const cmParser = new CriticMarkupParser();

// ── Public API ──────────────────────────────────────────────────────────

export interface ProcessEventContext {
  /** Current timestamp (ms). Injected by host for deterministic replay. */
  now: number;
  /** Allocate a new change ID (e.g., "cn-7"). Called once per buffer creation. */
  allocateScId?: () => string;
  /** Author identity for footnote metadata, e.g. "@alice" */
  author?: string;
  /** Current document text — needed for L3 hash computation and merge detection */
  documentText?: string;
  /** Document format — adapter determines via isFootnoteNative() or hardcodes */
  documentFormat?: 'l2' | 'l3';
}

export interface ProcessEventResult {
  newState: EditBoundaryState;
  effects: Effect[];
}

export function processEvent(
  state: EditBoundaryState,
  event: EditEvent,
  context: ProcessEventContext,
): ProcessEventResult {
  // Timestamp-based break: if pending buffer exists and time gap exceeded,
  // treat as break regardless of adjacency (LibreOffice deltaOneMinute pattern).
  if (
    state.pending !== null &&
    state.config.pauseThresholdMs > 0 &&
    (event.type === 'insertion' || event.type === 'deletion' || event.type === 'substitution') &&
    context.now - state.pending.lastEditTime > state.config.pauseThresholdMs
  ) {
    return handleBreak(state, event, context);
  }

  const signal = classifySignal(event, state);

  switch (signal) {
    case 'hard-break':
      return handleHardBreak(state, context);
    case 'break':
      return handleBreak(state, event, context);
    case 'extend':
      return handleExtend(state, event, context);
    case 'splice':
      return handleSplice(state, event, context);
    case 'ignore':
      return { newState: state, effects: [] };
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

/** Flush the pending buffer: crystallize + clear overlay + merge adjacent. */
function flush(state: EditBoundaryState, context?: ProcessEventContext): { effects: Effect[]; clearedState: EditBoundaryState } {
  const buf = state.pending;
  if (buf === null) {
    return { effects: [], clearedState: state };
  }

  const effects: Effect[] = [];

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

    const hasContext = context?.documentText !== undefined && context?.author !== undefined;
    const canProduceL2 = hasContext && context?.documentFormat === 'l2';
    const canProduceL3 = hasContext && context?.documentFormat === 'l3';

    if (canProduceL2 || canProduceL3) {
      // Shared preamble for fully-formed crystallize (L2 and L3)
      const scId = buf.scId ?? 'cn-0';
      const docText = context!.documentText!;
      const ct = changeType === 'insertion' ? ChangeType.Insertion
        : changeType === 'deletion' ? ChangeType.Deletion
        : ChangeType.Substitution;
      const abbrev = changeTypeToAbbrev(ct);
      const rawAuthor = context!.author!.replace(/^@/, '');
      const dateStr = new Date(context!.now).toISOString().slice(0, 10);

      if (canProduceL2) {
        let markupEdit = changeType === 'insertion'
          ? wrapInsertion(buf.currentText, buf.anchorOffset, buf.scId)
          : changeType === 'deletion'
          ? wrapDeletion(buf.originalText, buf.anchorOffset, buf.scId)
          : wrapSubstitution(buf.originalText, buf.currentText, buf.anchorOffset, buf.scId);

        // Atomic merge: simulate post-edit document and merge adjacent same-type changes
        const simulated =
          docText.slice(0, markupEdit.offset) +
          markupEdit.newText +
          docText.slice(markupEdit.offset + markupEdit.length);
        markupEdit = tryAtomicMerge(simulated, markupEdit, ct, buf.scId);

        const footnoteText = generateFootnoteDefinition(scId, abbrev, rawAuthor, dateStr);
        effects.push({
          type: 'crystallize',
          edits: {
            format: 'l2',
            markupEdit,
            footnoteEdit: { offset: docText.length, length: 0, newText: footnoteText },
          },
        });
      } else {
        // L3: footnote only, body stays as-is
        const lineStarts = buildLineStarts(docText);
        const lineNumber = offsetToLineNumber(lineStarts, buf.anchorOffset);
        const lineIdx = lineNumber - 1;
        const lineContent = docText.split('\n')[lineIdx] ?? '';
        // Only allocate allLines for blank-line context hashing
        const allLines = lineContent.trim() === '' ? docText.split('\n') : undefined;
        const hash = computeLineHash(lineIdx, lineContent, allLines);
        const column = buf.anchorOffset - (lineStarts[lineIdx] ?? 0);
        const anchorLen = changeType === 'deletion' ? 0 : buf.currentText.length;

        const editOpLine = buildContextualL3EditOp({
          changeType: ct, originalText: buf.originalText, currentText: buf.currentText,
          lineContent, lineNumber, hash, column, anchorLen,
        });

        const footnoteHeader = generateFootnoteDefinition(scId, abbrev, rawAuthor, dateStr);
        effects.push({
          type: 'crystallize',
          edits: {
            format: 'l3',
            markupEdit: null,
            footnoteEdit: { offset: docText.length, length: 0, newText: footnoteHeader + '\n' + editOpLine },
          },
        });
      }
    } else {
      // Legacy crystallize effect — host applies edits itself
      effects.push({
        type: 'crystallize',
        changeType,
        offset: buf.anchorOffset,
        length: changeType === 'insertion' ? buf.currentText.length :
                changeType === 'deletion' ? 0 :
                buf.currentText.length,
        currentText: buf.currentText,
        originalText: buf.originalText,
        scId: buf.scId,
      });
    }
  }

  // For full crystallize effects, skip mergeAdjacent (handled atomically in Task 5)
  const hasFullCrystallize = effects.some(e => e.type === 'crystallize' && 'edits' in e);

  effects.push({ type: 'updatePendingOverlay', overlay: null });
  if (!hasFullCrystallize) {
    effects.push({ type: 'mergeAdjacent', offset: buf.anchorOffset });
  }

  return { effects, clearedState: { ...state, pending: null } };
}

/**
 * hard-break: control events (save, editorSwitch, flush).
 * Flush pending buffer, no new buffer.
 */
function handleHardBreak(state: EditBoundaryState, context: ProcessEventContext): ProcessEventResult {
  const { effects, clearedState } = flush(state, context);
  return { newState: clearedState, effects };
}

/**
 * break: edit outside buffer range, type switch, timestamp gap, newline, paste,
 * or first edit with no prior buffer.
 * Flush old buffer (if any), start new buffer for the triggering edit.
 */
function handleBreak(
  state: EditBoundaryState,
  event: EditEvent,
  context: ProcessEventContext,
): ProcessEventResult {
  const { effects: flushEffects, clearedState } = flush(state, context);

  if (event.type === 'insertion') {
    // Newline or paste → crystallize immediately (no pending buffer)
    if ((state.config.breakOnNewline && event.text.includes('\n')) ||
        event.text.length >= state.config.pasteMinChars) {
      return {
        newState: clearedState,
        effects: [...flushEffects, {
          type: 'crystallize',
          changeType: 'insertion',
          offset: event.offset,
          length: event.text.length,
          currentText: event.text,
          originalText: '',
        }],
      };
    }

    const scId = context.allocateScId?.();
    const buf = createBuffer(event.offset, event.text, '', context.now, scId);
    return {
      newState: { ...clearedState, pending: buf },
      effects: [...flushEffects, { type: 'updatePendingOverlay', overlay: createOverlay(buf) }],
    };
  }

  if (event.type === 'deletion') {
    const scId = context.allocateScId?.();
    const buf = createBuffer(event.offset, '', event.deletedText, context.now, scId);
    return {
      newState: { ...clearedState, pending: buf },
      effects: [...flushEffects, { type: 'updatePendingOverlay', overlay: createOverlay(buf) }],
    };
  }

  if (event.type === 'substitution') {
    const scId = context.allocateScId?.();
    const buf = createBuffer(event.offset, event.newText, event.oldText, context.now, scId);
    return {
      newState: { ...clearedState, pending: buf },
      effects: [...flushEffects, { type: 'updatePendingOverlay', overlay: createOverlay(buf) }],
    };
  }

  throw new Error(`Unreachable: unhandled event type in handleBreak: ${(event as EditEvent).type}`);
}

/**
 * extend: adjacent edit grows the buffer.
 * Handles insertion (append), backward deletion (prepend original),
 * and forward deletion (append original) — unified from three old handlers.
 */
function handleExtend(
  state: EditBoundaryState,
  event: EditEvent,
  context: ProcessEventContext,
): ProcessEventResult {
  const buf = state.pending!;
  const now = context.now;
  let newBuf: PendingBuffer;

  if (event.type === 'insertion') {
    newBuf = extend(buf, event.text, now);
  } else if (event.type === 'deletion') {
    if (event.offset + event.deletedText.length === buf.anchorOffset) {
      // Backward deletion (backspace before buffer start)
      newBuf = prependOriginal(buf, event.deletedText, now);
    } else {
      // Forward deletion (delete key at buffer end)
      newBuf = appendOriginal(buf, event.deletedText, now);
    }
  } else {
    throw new Error('Unreachable: extend signal only dispatched for insertion/deletion');
  }

  return {
    newState: { ...state, pending: newBuf },
    effects: [{ type: 'updatePendingOverlay', overlay: createOverlay(newBuf) }],
  };
}

/**
 * splice: edit within buffer range (user fixing a typo in recent typing).
 * Handles insertion, deletion, and substitution within buffer.
 */
function handleSplice(
  state: EditBoundaryState,
  event: EditEvent,
  context: ProcessEventContext,
): ProcessEventResult {
  const buf = state.pending!;
  const now = context.now;

  if (event.type === 'insertion') {
    const newBuf = spliceInsert(buf, event.offset, event.text, now);
    return {
      newState: { ...state, pending: newBuf },
      effects: [{ type: 'updatePendingOverlay', overlay: createOverlay(newBuf) }],
    };
  }

  if (event.type === 'deletion') {
    const newBuf = spliceDelete(buf, event.offset, event.deletedText.length, now);
    if (newBuf === null) {
      // Self-cancellation: both texts empty → discard silently
      return {
        newState: { ...state, pending: null },
        effects: [{ type: 'updatePendingOverlay', overlay: null }],
      };
    }
    return {
      newState: { ...state, pending: newBuf },
      effects: [{ type: 'updatePendingOverlay', overlay: createOverlay(newBuf) }],
    };
  }


  if (event.type === 'substitution') {
    // Substitution within buffer: splice-delete the old text, splice-insert the new text.
    // Treat as: delete old range, insert new text at same position.
    const afterDelete = spliceDelete(buf, event.offset, event.oldText.length, now);
    if (afterDelete === null) {
      // Deletion emptied the buffer, now insert the new text
      const newBuf = createBuffer(event.offset, event.newText, '', now, buf.scId);
      return {
        newState: { ...state, pending: newBuf },
        effects: [{ type: 'updatePendingOverlay', overlay: createOverlay(newBuf) }],
      };
    }
    const newBuf = spliceInsert(afterDelete, event.offset, event.newText, now);
    return {
      newState: { ...state, pending: newBuf },
      effects: [{ type: 'updatePendingOverlay', overlay: createOverlay(newBuf) }],
    };
  }

  throw new Error(`Unreachable: unhandled event type in handleSplice: ${(event as EditEvent).type}`);
}

// ── Atomic Merge Helpers ─────────────────────────────────────────────

/**
 * Try to merge the newly-created CriticMarkup change with an adjacent
 * same-type change in the simulated document text.
 *
 * Returns the (possibly merged) markupEdit in original-docText coordinates.
 */
function tryAtomicMerge(
  simulated: string,
  originalEdit: TextEdit,
  expectedType: ChangeType,
  scId: string | undefined,
): TextEdit {
  const parser = new CriticMarkupParser();
  const vdoc = parser.parse(simulated);
  const changes = vdoc.getChanges();

  // Find the change we just created by matching its scId
  const newIdx = changes.findIndex(c => c.id === scId);
  if (newIdx < 0) return originalEdit;

  const newChange = changes[newIdx];

  // The markupEdit replaced docText[offset..offset+length] with newText.
  // In the simulated text, everything before originalEdit.offset is unchanged.
  // The delta is how much longer the simulated text is vs docText at the edit point.
  const delta = originalEdit.newText.length - originalEdit.length;

  // Check predecessor (change immediately before)
  if (newIdx > 0) {
    const pred = changes[newIdx - 1];
    if (canMerge(pred, newChange, expectedType)) {
      return buildMergedEdit(pred, newChange, expectedType, scId, originalEdit, delta, 'predecessor');
    }
  }

  // Check successor (change immediately after)
  if (newIdx < changes.length - 1) {
    const succ = changes[newIdx + 1];
    if (canMerge(newChange, succ, expectedType)) {
      return buildMergedEdit(newChange, succ, expectedType, scId, originalEdit, delta, 'successor');
    }
  }

  return originalEdit;
}

/** Check if two adjacent changes can be merged. */
function canMerge(first: ChangeNode, second: ChangeNode, expectedType: ChangeType): boolean {
  return (
    first.type === expectedType &&
    second.type === expectedType &&
    first.status === ChangeStatus.Proposed &&
    second.status === ChangeStatus.Proposed &&
    first.range.end === second.range.start
  );
}

/**
 * Build a merged markupEdit that combines two adjacent same-type changes
 * into one, mapped back to original docText coordinates.
 */
function buildMergedEdit(
  first: ChangeNode,
  second: ChangeNode,
  changeType: ChangeType,
  scId: string | undefined,
  originalEdit: TextEdit,
  delta: number,
  direction: 'predecessor' | 'successor',
): TextEdit {
  // Extract content from both changes
  let combinedContent: string;
  let combinedOriginal: string | undefined;
  let combinedModified: string | undefined;

  if (changeType === ChangeType.Insertion) {
    combinedContent = (first.modifiedText ?? '') + (second.modifiedText ?? '');
  } else if (changeType === ChangeType.Deletion) {
    combinedContent = (first.originalText ?? '') + (second.originalText ?? '');
  } else {
    // Substitution: combine both original and modified parts
    combinedOriginal = (first.originalText ?? '') + (second.originalText ?? '');
    combinedModified = (first.modifiedText ?? '') + (second.modifiedText ?? '');
    combinedContent = ''; // not used for substitution
  }

  // Build the merged CriticMarkup text
  let mergedNewText: string;
  if (changeType === ChangeType.Insertion) {
    mergedNewText = wrapInsertion(combinedContent, 0, scId).newText;
  } else if (changeType === ChangeType.Deletion) {
    mergedNewText = wrapDeletion(combinedContent, 0, scId).newText;
  } else {
    mergedNewText = wrapSubstitution(combinedOriginal!, combinedModified!, 0, scId).newText;
  }

  // Map simulated-text offsets back to docText offsets.
  //
  // The originalEdit replaced docText[offset..offset+length] with newText,
  // producing 'simulated'. Everything BEFORE originalEdit.offset is at the
  // same offset in both coordinate systems. Everything AFTER the edit point
  // is shifted by delta = newText.length - length.
  //
  // For predecessor merge: the predecessor is before the edit point, so its
  // simulated offset = its docText offset. The edit point in docText is
  // originalEdit.offset + originalEdit.length.
  //
  // For successor merge: the successor is after the edit point, so its
  // simulated offset = its docText offset + delta.

  let docStartOffset: number;
  let docEndOffset: number;

  if (direction === 'predecessor') {
    // 'first' is the predecessor (before edit point), 'second' is the new change
    docStartOffset = first.range.start; // same in both coordinate systems
    docEndOffset = originalEdit.offset + originalEdit.length; // end of original edit region in docText
  } else {
    // 'first' is the new change, 'second' is the successor (after edit point)
    docStartOffset = originalEdit.offset; // start of the edit region in docText
    docEndOffset = second.range.end - delta; // map successor end back to docText coordinates
  }

  return {
    offset: docStartOffset,
    length: docEndOffset - docStartOffset,
    newText: mergedNewText,
  };
}
