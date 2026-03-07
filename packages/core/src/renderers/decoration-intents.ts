/**
 * DecorationIntent — editor-agnostic decoration directives.
 *
 * Given a set of ChangeNodes and a ViewName, produces an array of
 * DecorationIntents that describe *what* to render and at *what visibility*,
 * without referencing any editor API. The VS Code extension (or any other
 * editor adapter) maps these intents to platform-specific decoration types.
 *
 * This is the core layer that replaces the ~400 LOC of view-conditional
 * logic scattered across EditorDecorator in the extension.
 */

import type { ChangeNode, OffsetRange } from '../model/types.js';
import { ChangeType } from '../model/types.js';
import type { EditPendingOverlay } from '../edit-boundary/types.js';
import type { ViewName } from './three-zone-types.js';
import { TokenType } from '../parser/tokens.js';

// ── Types ──────────────────────────────────────────────────────────────

export type DecorationKind =
  | 'insertion'
  | 'deletion'
  | 'substitution-old'
  | 'substitution-new'
  | 'highlight'
  | 'comment'
  | 'delimiter'
  | 'pending'
  | 'move-source'
  | 'move-target';

export type DecorationVisibility = 'visible' | 'hidden' | 'faded';

export interface DecorationIntent {
  range: { start: number; end: number };
  kind: DecorationKind;
  visibility: DecorationVisibility;
  metadata?: {
    author?: string;
    status?: string;
    scId?: string;
  };
}

// ── Delimiter lengths ──────────────────────────────────────────────────

const OPEN_DELIMITER_LEN = 3;  // {++, {--, {~~, {==, {>>
const CLOSE_DELIMITER_LEN = 3; // ++}, --}, ~~}, ==}, <<}
const SUB_SEPARATOR_LEN = TokenType.SubstitutionSeparator.length; // ~> = 2

// ── Builder ────────────────────────────────────────────────────────────

/**
 * Build decoration intents for a set of change nodes in a given view mode.
 *
 * @param changeNodes - Parsed CriticMarkup change nodes
 * @param viewMode - Which view to render
 * @param pendingOverlay - In-flight edit overlay (from edit-boundary state machine)
 * @returns Array of DecorationIntents, sorted by range.start
 */
export function buildDecorationIntents(
  changeNodes: ChangeNode[],
  viewMode: ViewName,
  pendingOverlay?: EditPendingOverlay | null,
): DecorationIntent[] {
  // Raw view: no decoration intents at all — literal bytes, no styling.
  if (viewMode === 'raw') {
    return [];
  }

  const intents: DecorationIntent[] = [];

  for (const node of changeNodes) {
    buildNodeIntents(node, viewMode, intents);
  }

  // Pending overlay
  if (pendingOverlay) {
    buildPendingIntents(pendingOverlay, viewMode, intents);
  }

  // Sort by range start for deterministic processing by consumers
  intents.sort((a, b) => a.range.start - b.range.start);

  return intents;
}

// ── Per-node intent builders ───────────────────────────────────────────

function buildNodeIntents(node: ChangeNode, viewMode: ViewName, out: DecorationIntent[]): void {
  // Move operations override the normal type-based rendering
  if (node.moveRole === 'from') {
    buildMoveSourceIntents(node, viewMode, out);
    return;
  }
  if (node.moveRole === 'to') {
    buildMoveTargetIntents(node, viewMode, out);
    return;
  }

  switch (node.type) {
    case ChangeType.Insertion:
      buildInsertionIntents(node, viewMode, out);
      break;
    case ChangeType.Deletion:
      buildDeletionIntents(node, viewMode, out);
      break;
    case ChangeType.Substitution:
      buildSubstitutionIntents(node, viewMode, out);
      break;
    case ChangeType.Highlight:
      buildHighlightIntents(node, viewMode, out);
      break;
    case ChangeType.Comment:
      buildCommentIntents(node, viewMode, out);
      break;
  }
}

function metaFor(node: ChangeNode): DecorationIntent['metadata'] {
  return {
    author: node.metadata?.author ?? node.inlineMetadata?.author,
    status: node.metadata?.status ?? node.inlineMetadata?.status ?? node.status,
    scId: node.id,
  };
}

// ── Insertion ──────────────────────────────────────────────────────────

function buildInsertionIntents(node: ChangeNode, viewMode: ViewName, out: DecorationIntent[]): void {
  const meta = metaFor(node);

  if (viewMode === 'review') {
    // Open delimiter
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'visible', meta);
    // Content
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'insertion',
      visibility: 'visible',
      metadata: meta,
    });
    // Close delimiter
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'visible', meta);
  } else if (viewMode === 'changes') {
    // Delimiters hidden, content shown with color
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'insertion',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  } else if (viewMode === 'settled') {
    // Delimiters hidden, content shown as plain text (no color — accepted as-is)
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    // No intent for content — it renders as plain text
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  }
}

// ── Deletion ───────────────────────────────────────────────────────────

function buildDeletionIntents(node: ChangeNode, viewMode: ViewName, out: DecorationIntent[]): void {
  const meta = metaFor(node);

  if (viewMode === 'review') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'visible', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'deletion',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'visible', meta);
  } else if (viewMode === 'changes') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'deletion',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  } else if (viewMode === 'settled') {
    // Entire deletion hidden — the deleted text disappears in the "final" view
    out.push({
      range: { start: node.range.start, end: node.range.end },
      kind: 'deletion',
      visibility: 'hidden',
      metadata: meta,
    });
  }
}

// ── Substitution ───────────────────────────────────────────────────────

function buildSubstitutionIntents(node: ChangeNode, viewMode: ViewName, out: DecorationIntent[]): void {
  const meta = metaFor(node);

  // Substitution structure: {~~old~>new~~}
  // node.originalRange = old text range (between {~~ and ~>)
  // node.modifiedRange = new text range (between ~> and ~~})
  // Separator ~> sits between originalRange.end and modifiedRange.start

  if (!node.originalRange || !node.modifiedRange) return;

  const separatorStart = node.originalRange.end;
  const separatorEnd = node.modifiedRange.start;

  if (viewMode === 'review') {
    // Open delimiter {~~
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'visible', meta);
    // Old text (struck through)
    out.push({
      range: { start: node.originalRange.start, end: node.originalRange.end },
      kind: 'substitution-old',
      visibility: 'visible',
      metadata: meta,
    });
    // Separator ~>
    pushDelimiter(out, separatorStart, SUB_SEPARATOR_LEN, 'visible', meta);
    // New text
    out.push({
      range: { start: node.modifiedRange.start, end: node.modifiedRange.end },
      kind: 'substitution-new',
      visibility: 'visible',
      metadata: meta,
    });
    // Close delimiter ~~}
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'visible', meta);
  } else if (viewMode === 'changes') {
    // Delimiters + separator hidden
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    out.push({
      range: { start: node.originalRange.start, end: node.originalRange.end },
      kind: 'substitution-old',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, separatorStart, SUB_SEPARATOR_LEN, 'hidden', meta);
    out.push({
      range: { start: node.modifiedRange.start, end: node.modifiedRange.end },
      kind: 'substitution-new',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  } else if (viewMode === 'settled') {
    // Old text + all delimiters/separator hidden; new text shown as plain
    // Hide everything from range.start through modifiedRange.start (open delimiter + old + separator)
    out.push({
      range: { start: node.range.start, end: node.modifiedRange.start },
      kind: 'substitution-old',
      visibility: 'hidden',
      metadata: meta,
    });
    // New text rendered as plain (no intent needed — plain text)
    // Hide close delimiter
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  }
}

// ── Highlight ──────────────────────────────────────────────────────────

function buildHighlightIntents(node: ChangeNode, viewMode: ViewName, out: DecorationIntent[]): void {
  const meta = metaFor(node);

  if (viewMode === 'review') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'visible', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'highlight',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'visible', meta);
  } else if (viewMode === 'changes') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'highlight',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  } else if (viewMode === 'settled') {
    // Delimiters hidden, highlight content as plain text
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  }
}

// ── Comment ────────────────────────────────────────────────────────────

function buildCommentIntents(node: ChangeNode, viewMode: ViewName, out: DecorationIntent[]): void {
  const meta = metaFor(node);

  if (viewMode === 'review') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'visible', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'comment',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'visible', meta);
  } else if (viewMode === 'changes') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'comment',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  } else if (viewMode === 'settled') {
    // Comments hidden entirely in settled view
    out.push({
      range: { start: node.range.start, end: node.range.end },
      kind: 'comment',
      visibility: 'hidden',
      metadata: meta,
    });
  }
}

// ── Move operations ────────────────────────────────────────────────────

function buildMoveSourceIntents(node: ChangeNode, viewMode: ViewName, out: DecorationIntent[]): void {
  const meta = metaFor(node);

  if (viewMode === 'review') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'visible', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'move-source',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'visible', meta);
  } else if (viewMode === 'changes') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'move-source',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  } else if (viewMode === 'settled') {
    // Move source = deletion side, hidden in settled
    out.push({
      range: { start: node.range.start, end: node.range.end },
      kind: 'move-source',
      visibility: 'hidden',
      metadata: meta,
    });
  }
}

function buildMoveTargetIntents(node: ChangeNode, viewMode: ViewName, out: DecorationIntent[]): void {
  const meta = metaFor(node);

  if (viewMode === 'review') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'visible', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'move-target',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'visible', meta);
  } else if (viewMode === 'changes') {
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    out.push({
      range: { start: node.contentRange.start, end: node.contentRange.end },
      kind: 'move-target',
      visibility: 'visible',
      metadata: meta,
    });
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  } else if (viewMode === 'settled') {
    // Move target = insertion side, show as plain text
    pushDelimiter(out, node.range.start, OPEN_DELIMITER_LEN, 'hidden', meta);
    pushDelimiter(out, node.range.end - CLOSE_DELIMITER_LEN, CLOSE_DELIMITER_LEN, 'hidden', meta);
  }
}

// ── Pending overlay ────────────────────────────────────────────────────

function buildPendingIntents(
  overlay: EditPendingOverlay,
  viewMode: ViewName,
  out: DecorationIntent[],
): void {
  // Raw view has no intents (handled upstream), but guard anyway
  if (viewMode === 'raw') return;

  const range: OffsetRange = {
    start: overlay.anchorOffset,
    end: overlay.anchorOffset + overlay.currentLength,
  };

  if (viewMode === 'review') {
    // In review mode, show pending text as faded with synthetic delimiters visible
    // Synthetic open delimiter: {++
    out.push({
      range: { start: range.start, end: range.start },
      kind: 'delimiter',
      visibility: 'faded',
    });
    out.push({
      range,
      kind: 'pending',
      visibility: 'faded',
    });
    // Synthetic close delimiter: ++}
    out.push({
      range: { start: range.end, end: range.end },
      kind: 'delimiter',
      visibility: 'faded',
    });
  } else if (viewMode === 'changes' || viewMode === 'settled') {
    // Faded text, no delimiters
    out.push({
      range,
      kind: 'pending',
      visibility: 'faded',
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function pushDelimiter(
  out: DecorationIntent[],
  start: number,
  length: number,
  visibility: DecorationVisibility,
  metadata?: DecorationIntent['metadata'],
): void {
  out.push({
    range: { start, end: start + length },
    kind: 'delimiter',
    visibility,
    metadata,
  });
}
