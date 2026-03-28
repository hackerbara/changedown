/**
 * scrubBackward — backward pass for the L3 resolution protocol.
 *
 * Takes the current document body and a list of active operations
 * (extracted from L3 footnotes), processes them in reverse log order,
 * and un-applies each to reconstruct body_0 (the original body before
 * any changes were applied).
 *
 * For each operation the algorithm:
 *   1. Finds where the operation's text lives in the current body state
 *   2. Records the position (offset + lineIdx) and resolution status
 *   3. Un-applies: removes inserted text, restores deleted text, or
 *      reverts substituted text
 *   4. Advances to the next operation (which now sees the body without
 *      the already-processed later operation)
 *
 * Matching uses a two-tier strategy:
 *   PRIMARY — parseContextualEditOp extracts contextBefore/contextAfter
 *             from the edit-op line; searches for the anchored snippet
 *             within a ±maxDelta line window.
 *   FALLBACK — when parseContextualEditOp returns null (no CriticMarkup),
 *              searches for op.modifiedText directly (insertions/subs only;
 *              deletions have no body text to search for).
 */

import { tryFindUniqueMatch, type UniqueMatch } from '../file-ops.js';
import { parseContextualEditOp } from '../parser/footnote-native-parser.js';
import { computeLineHash } from '../hashline.js';
import { buildContextualL3EditOp } from './footnote-generator.js';
import { buildLineStarts, offsetToLineNumber } from './l2-to-l3.js';
import { ChangeType, ChangeStatus } from '../model/types.js';
import { splitBodyAndFootnotes, FOOTNOTE_DEF_START, FOOTNOTE_L3_EDIT_OP } from '../footnote-patterns.js';
import { parseFootnoteHeader } from '../footnote-utils.js';
import { parseOp } from '../op-parser.js';
// Note: parseForFormat import is used inside resolve() only.
// This creates a circular ESM reference (scrub → format-aware-parse → footnote-native-parser → scrub)
// which is safe in Node.js ESM because the reference is used inside a function body,
// not at module initialization time.
import { parseForFormat } from '../format-aware-parse.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActiveOperation {
  /** Unique change identifier, e.g. "cn-1". */
  id: string;
  /** Semantic type of the change. */
  type: 'insertion' | 'deletion' | 'substitution' | 'highlight' | 'comment';
  /** Text that appears in the body for this change (empty for deletions). */
  modifiedText: string;
  /** Original (pre-change) text (empty for insertions). */
  originalText: string;
  /**
   * The full L3 edit-op line from the footnote, including the LINE:HASH
   * prefix and CriticMarkup.  Example:
   *   '    1:a1 The {++very ++}lazy dog'
   */
  editOpLine: string;
  /** 1-based line number where the edit was recorded. */
  lineNumber: number;
  /** Short hash for the line at recording time. */
  hash: string;
  /** Status string, e.g. "proposed", "accepted", "rejected". */
  status: string;
}

export interface IntermediatePosition {
  /** Byte offset in the body at which this op's anchor starts. -1 when unresolved. */
  offset: number;
  /** 0-based line index of the target line. */
  lineIdx: number;
  /** Whether the position was successfully resolved. */
  resolved: boolean;
}

export interface BackwardPassResult {
  /** Reconstructed original body (before all participating ops). */
  body0: string;
  /** Resolved position for each participating op, keyed by op.id. */
  positions: Map<string, IntermediatePosition>;
}

export interface ForwardPassResult {
  /** Fresh edit-op lines keyed by change ID */
  anchors: Map<string, string>;
  /** Consumption relationships: consumed operation ID → {consumedBy, type} */
  consumption: Map<string, { consumedBy: string; type: 'full' | 'partial' }>;
  /** Final-body-coordinate spans for each participating op */
  finalPositions: Map<string, { start: number; end: number }>;
  /** The reconstructed body (should equal Current) */
  finalBody: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────


/** Strip the leading LINE:HASH prefix (e.g. "    1:a1 ") from an edit-op line. */
function stripLineHashPrefix(line: string): string {
  return line.replace(/^\s*\d+:[a-f0-9]+\s*/, '');
}

/** Whether an operation participates in body splicing (not rejected, not decoration). */
export function isParticipating(op: ActiveOperation): boolean {
  return op.status !== 'rejected' && op.type !== 'highlight' && op.type !== 'comment';
}

/** Extract modifiedText/originalText from a CriticMarkup op string. */
function extractOpTexts(opString: string): { modifiedText: string; originalText: string } {
  const ctxParsed = parseContextualEditOp(opString);
  const parsed = parseOp(ctxParsed ? ctxParsed.opString : opString);
  return { modifiedText: parsed.newText, originalText: parsed.oldText };
}

/**
 * Search for `searchText` within a ±maxDelta line window centered on `targetIdx`.
 * Returns the matching line index and match result, or null if not found.
 */
function searchInLineWindow(
  lines: string[],
  targetIdx: number,
  searchText: string,
  maxDelta: number,
): { lineIdx: number; match: UniqueMatch } | null {
  for (let delta = 0; delta <= maxDelta; delta++) {
    const deltas = delta === 0 ? [0] : [-delta, delta];
    for (const d of deltas) {
      const searchIdx = targetIdx + d;
      if (searchIdx < 0 || searchIdx >= lines.length) continue;
      const match = tryFindUniqueMatch(lines[searchIdx], searchText);
      if (match) return { lineIdx: searchIdx, match };
    }
  }
  return null;
}

/** Apply or un-apply a splice to a body string. */
function applySplice(
  body: string,
  op: ActiveOperation,
  offset: number,
  direction: 'apply' | 'unapply',
): string {
  if (direction === 'apply') {
    if (op.type === 'insertion') return body.slice(0, offset) + op.modifiedText + body.slice(offset);
    if (op.type === 'deletion') return body.slice(0, offset) + body.slice(offset + op.originalText.length);
    if (op.type === 'substitution') return body.slice(0, offset) + op.modifiedText + body.slice(offset + op.originalText.length);
  } else {
    if (op.type === 'insertion') return body.slice(0, offset) + body.slice(offset + op.modifiedText.length);
    if (op.type === 'deletion') return body.slice(0, offset) + op.originalText + body.slice(offset);
    if (op.type === 'substitution') return body.slice(0, offset) + op.originalText + body.slice(offset + op.modifiedText.length);
  }
  return body;
}

/** Build the contextual search target for a line-window match. */
function buildSearchTarget(op: ActiveOperation, parsed: { contextBefore: string; contextAfter: string }): string {
  return op.type === 'deletion'
    ? parsed.contextBefore + parsed.contextAfter
    : parsed.contextBefore + op.modifiedText + parsed.contextAfter;
}

// ─── Core algorithm ──────────────────────────────────────────────────────────

/**
 * Maximum number of lines to search above/below the recorded line when
 * the anchor cannot be found at the exact target line.
 */
const MAX_DELTA = 5;

export function scrubBackward(
  body: string,
  operations: ActiveOperation[],
): BackwardPassResult {
  const positions = new Map<string, IntermediatePosition>();
  let currentBody = body;
  const participating = operations.filter(isParticipating);

  // Process in REVERSE log order so that later edits are un-applied first,
  // restoring the body state that earlier edits would have seen.
  for (let i = participating.length - 1; i >= 0; i--) {
    const op = participating[i];
    const stripped = stripLineHashPrefix(op.editOpLine);
    const parsed = parseContextualEditOp(stripped);
    const lines = currentBody.split('\n');
    const lineStarts = buildLineStarts(currentBody);
    const targetLineIdx = Math.min(Math.max(op.lineNumber - 1, 0), lines.length - 1);

    let offset = -1;
    let resolved = false;

    // PRIMARY: contextual embedding search
    if (parsed) {
      const hit = searchInLineWindow(lines, targetLineIdx, buildSearchTarget(op, parsed), MAX_DELTA);
      if (hit) {
        offset = lineStarts[hit.lineIdx] + hit.match.index + parsed.contextBefore.length;
        resolved = true;
      }
    }

    // FALLBACK: direct text search (no CriticMarkup in edit-op line)
    if (!resolved && !parsed && op.modifiedText &&
        (op.type === 'insertion' || op.type === 'substitution')) {
      const hit = searchInLineWindow(lines, targetLineIdx, op.modifiedText, MAX_DELTA);
      if (hit) {
        offset = lineStarts[hit.lineIdx] + hit.match.index;
        resolved = true;
      }
    }

    positions.set(op.id, { offset, lineIdx: targetLineIdx, resolved });

    if (resolved) {
      currentBody = applySplice(currentBody, op, offset, 'unapply');
    }
  }

  return { body0: currentBody, positions };
}

// ─── Forward pass ─────────────────────────────────────────────────────────────

/**
 * scrubForward — forward pass for the L3 resolution protocol.
 *
 * Takes body_0 (from scrubBackward), replays operations in log order
 * (first to last), and for each operation:
 *   1. DETECT CONSUMPTION — check if this operation's target region
 *      overlaps any earlier operation's active span.
 *   2. APPLY the splice (insert/delete/substitute).
 *   3. ANCHOR — compute fresh LINE:HASH + contextual embedding.
 *   4. TRACK — record this operation's span in the post-splice body.
 *   5. SHIFT — adjust earlier spans for length changes.
 *
 * Returns fresh anchors (edit-op lines), consumption relationships, and
 * the reconstructed final body (which should equal the current body).
 */
export function scrubForward(
  body0: string,
  operations: ActiveOperation[],
  positions: Map<string, IntermediatePosition>,
): ForwardPassResult {
  const anchors = new Map<string, string>();
  const consumption = new Map<string, { consumedBy: string; type: 'full' | 'partial' }>();
  const activeSpans = new Map<string, { start: number; end: number }>();
  let currentBody = body0;

  const participating = operations.filter(isParticipating);

  for (const op of participating) {
    const pos = positions.get(op.id);
    if (!pos || !pos.resolved) continue;

    const offset = pos.offset;

    // Capture target region (before splice)
    let targetStart = offset;
    let targetEnd = offset;
    if (op.type === 'deletion' || op.type === 'substitution') {
      targetEnd = offset + op.originalText.length;
    }

    // Detect consumption using target region
    if (op.type === 'deletion' || op.type === 'substitution') {
      for (const [earlierId, span] of activeSpans) {
        if (span.start >= targetStart && span.end <= targetEnd) {
          consumption.set(earlierId, { consumedBy: op.id, type: 'full' });
        } else if (span.start < targetEnd && span.end > targetStart) {
          consumption.set(earlierId, { consumedBy: op.id, type: 'partial' });
        }
      }
    }

    // Apply splice
    currentBody = applySplice(currentBody, op, offset, 'apply');

    // Step 4: ANCHOR — compute fresh LINE:HASH + contextual embedding
    const lines = currentBody.split('\n');
    const lineStarts = buildLineStarts(currentBody);
    const lineIdx = offsetToLineNumber(lineStarts, offset) - 1; // 0-indexed
    const lineContent = lines[lineIdx] ?? '';
    const hash = computeLineHash(lineIdx, lineContent, lines);

    const lineStartOff = lineIdx > 0 ? lineStarts[lineIdx] : 0;
    const column = offset - lineStartOff;

    const anchorLen = (op.type === 'insertion' || op.type === 'substitution')
      ? op.modifiedText.length : 0;

    const changeType = op.type === 'insertion' ? ChangeType.Insertion
      : op.type === 'deletion' ? ChangeType.Deletion
      : ChangeType.Substitution;

    const freshAnchor = buildContextualL3EditOp({
      changeType,
      originalText: op.originalText,
      currentText: op.modifiedText,
      lineContent,
      lineNumber: lineIdx + 1,
      hash,
      column,
      anchorLen,
    });
    anchors.set(op.id, freshAnchor);

    // Step 5: TRACK SPANS (in the post-splice body coordinates)
    const spanStart = offset;
    let spanEnd = offset;
    if (op.type === 'insertion') spanEnd = offset + op.modifiedText.length;
    else if (op.type === 'substitution') spanEnd = offset + op.modifiedText.length;
    activeSpans.set(op.id, { start: spanStart, end: spanEnd });

    // Step 6: SHIFT earlier spans for length changes caused by this splice
    const lengthDelta =
      (op.type === 'insertion' ? op.modifiedText.length : 0)
      - (op.type === 'deletion' ? op.originalText.length : 0)
      + (op.type === 'substitution' ? op.modifiedText.length - op.originalText.length : 0);

    if (lengthDelta !== 0) {
      for (const [id, span] of activeSpans) {
        if (id === op.id) continue;
        if (span.start > offset) {
          span.start += lengthDelta;
          span.end += lengthDelta;
        }
      }
    }
  }

  return { anchors, consumption, finalPositions: activeSpans, finalBody: currentBody };
}

// ─── traceDependencies types ─────────────────────────────────────────────────

export interface DependencyReport {
  target: string;
  dependents: DependentChange[];
  bodyDiff: { before: string; after: string };
  canAutoResolve: boolean;
}

export interface DependentChange {
  id: string;
  reason: string;
  confidence: 'exact' | 'fuzzy' | 'none';
}

// ─── traceDependencies ───────────────────────────────────────────────────────

/**
 * traceDependencies — rejection dependency tracing for the L3 resolution protocol.
 *
 * Given an L3 document and a target operation ID, determines which other
 * operations would fail to resolve if the target were rejected.
 *
 * Algorithm:
 *   1. Parse the L3 text and extract operations.
 *   2. Run backward + forward with all active ops → baseline anchors (normalForward).
 *   3. Replay the forward pass from normal body_0, but exclude the target op.
 *      At each op's recorded offset, validate that the expected text is actually
 *      present before applying (instead of blindly splicing).
 *   4. Any op that resolved in the baseline but fails text-validation in the
 *      modified replay → dependent on the target.
 *
 * Why exclude from the backward pass too:
 *   The normal backward pass produces body_0 that does NOT include the target's
 *   contribution.  Positions in the backward map are offsets in the evolving body
 *   state; they are valid for replay from body_0 only when all other ops run in
 *   sequence.  Excluding the target from the forward replay exposes ops whose
 *   required text (originalText for sub/del, or context for ins) was introduced
 *   by the target and is therefore absent in body_0.
 */
export function traceDependencies(l3Text: string, targetId: string): DependencyReport {
  const lines = l3Text.split('\n');
  const { bodyLines, footnoteLines } = splitBodyAndFootnotes(lines);
  const body = bodyLines.join('\n');
  const operations = extractOperations(footnoteLines);

  const active = operations.filter(isParticipating);

  // 1. Run backward pass normally → body_0
  const backward = scrubBackward(body, active);

  // 2. Run forward pass with original operations (baseline)
  const normalForward = scrubForward(backward.body0, active, backward.positions);

  // 3. Replay forward from normal body_0 without the target, validating each splice.
  const failsWithoutTarget = new Set<string>();
  {
    let replayBody = backward.body0;
    let cumulativeShift = 0;

    for (const op of active) {
      if (op.id === targetId) {
        // Simulate the target being absent — apply its length delta as if it
        // never ran, so subsequent offsets shift as they would without it.
        // (We do NOT apply the target's text; we just skip it entirely.)
        continue;
      }

      const pos = backward.positions.get(op.id);
      if (!pos || !pos.resolved) continue;

      // Adjust offset by the cumulative shift from preceding ops that DID run.
      const adjustedOffset = pos.offset + cumulativeShift;

      // Validate: does the expected text exist at the adjusted offset?
      let textMatch = true;
      if (op.type === 'deletion' || op.type === 'substitution') {
        const actualText = replayBody.slice(adjustedOffset, adjustedOffset + op.originalText.length);
        if (actualText !== op.originalText) {
          textMatch = false;
        }
      } else if (op.type === 'insertion') {
        // For insertions there is no text to remove, but we can verify the
        // insertion point is within bounds.
        if (adjustedOffset < 0 || adjustedOffset > replayBody.length) {
          textMatch = false;
        }
      }

      if (!textMatch && normalForward.anchors.has(op.id)) {
        failsWithoutTarget.add(op.id);
        // Don't apply the op — leave body as-is so subsequent ops see correct state
        continue;
      }

      // Apply the op to advance the replay body and track the length delta.
      replayBody = applySplice(replayBody, op, adjustedOffset, 'apply');
      if (op.type === 'insertion') cumulativeShift += op.modifiedText.length;
      else if (op.type === 'deletion') cumulativeShift -= op.originalText.length;
      else if (op.type === 'substitution') cumulativeShift += op.modifiedText.length - op.originalText.length;
    }
  }

  // 4. Build dependents list from ops that failed text-validation.
  const dependents: DependentChange[] = [];
  for (const op of active) {
    if (op.id === targetId) continue;
    if (failsWithoutTarget.has(op.id)) {
      dependents.push({
        id: op.id,
        reason: `anchor resolution fails without ${targetId}`,
        confidence: 'none',
      });
    }
  }

  // For the bodyDiff, show what the document looks like when the target is
  // excluded from scrubbing entirely (a clean re-scrub without the target).
  const opsWithoutTarget = active.filter(op => op.id !== targetId);
  const modifiedBackward = scrubBackward(body, opsWithoutTarget);
  const modifiedForward = scrubForward(modifiedBackward.body0, opsWithoutTarget, modifiedBackward.positions);

  return {
    target: targetId,
    dependents,
    bodyDiff: { before: body, after: modifiedForward.finalBody },
    canAutoResolve: dependents.every(d => d.confidence !== 'none'),
  };
}

// ─── resolve types ──────────────────────────────────────────────────────────

export interface ResolvedChange {
  id: string;
  resolved: boolean;
  resolutionPath: 'hash' | 'context' | 'replay' | 'rejected';
  consumedBy?: string;
  consumptionType?: 'full' | 'partial';
  freshAnchor?: string;
  /** Byte range in the current body. Only set when the op's text is present in the body. */
  resolvedRange?: { start: number; end: number };
}

export interface ResolvedDocument {
  resolvedText: string;
  changes: ResolvedChange[];
  coherenceRate: number;
  unresolvedDiagnostics: string[];
}

// ─── resolve ────────────────────────────────────────────────────────────────

/** Map footnote header type abbreviations to ActiveOperation type strings. */
export const ABBREV_TO_TYPE: Record<string, ActiveOperation['type']> = {
  ins: 'insertion',
  del: 'deletion',
  sub: 'substitution',
  hig: 'highlight',
  com: 'comment',
};

/**
 * Parse L3 footnotes into ActiveOperation[].
 *
 * Walks the footnote lines, identifies each `[^cn-N]:` block, extracts
 * the header metadata and the indented LINE:HASH edit-op line.
 */
function extractOperations(footnoteLines: string[]): ActiveOperation[] {
  const ops: ActiveOperation[] = [];
  let i = 0;

  while (i < footnoteLines.length) {
    const line = footnoteLines[i];
    const idMatch = line.match(/^\[\^(cn-[\w.]+)\]:/);
    if (!idMatch) { i++; continue; }

    const id = idMatch[1];
    const header = parseFootnoteHeader(line);
    if (!header) { i++; continue; }

    const opType = ABBREV_TO_TYPE[header.type] ?? header.type as ActiveOperation['type'];

    // Scan continuation lines for the edit-op line
    let editOpLine = '';
    let lineNumber = 0;
    let hash = '';
    let modifiedText = '';
    let originalText = '';
    i++;

    while (i < footnoteLines.length) {
      const contLine = footnoteLines[i];
      // Stop at next footnote definition
      if (FOOTNOTE_DEF_START.test(contLine)) break;
      // Check for edit-op line
      const editMatch = contLine.match(FOOTNOTE_L3_EDIT_OP);
      if (editMatch && !editOpLine) {
        editOpLine = contLine;
        lineNumber = parseInt(editMatch[1], 10);
        hash = editMatch[2];
        const opString = editMatch[3];
        try {
          ({ modifiedText, originalText } = extractOpTexts(opString));
        } catch {
          // If parseOp fails, leave texts empty
        }
      }
      // Accept indented continuation lines and blank lines
      if (/^\s/.test(contLine) || contLine.trim() === '') {
        i++;
      } else {
        break;
      }
    }

    // Only include operations that have an edit-op line
    if (editOpLine) {
      ops.push({
        id,
        type: opType,
        modifiedText,
        originalText,
        editOpLine,
        lineNumber,
        hash,
        status: header.status,
      });
    }
  }

  return ops;
}

// ─── Shared replay helper ───────────────────────────────────────────────────

/**
 * Pre-parsed footnote data accepted by resolveReplayFromParsedFootnotes.
 * Mirrors ParsedFootnote from footnote-native-parser.ts but limited to the
 * fields needed for replay — avoids a cross-module dependency.
 */
export interface ReplayFootnote {
  id: string;
  type: string;       // 'ins', 'del', 'sub', etc.
  status: string;     // 'proposed', 'accepted', 'rejected'
  lineNumber?: number;
  hash?: string;
  opString?: string;   // The raw edit-op content (CriticMarkup with optional context)
  editOpLine?: string; // The full indented LINE:HASH edit-op line
}

export interface ReplayResolutionResult {
  freshAnchors: Map<string, string>;
  consumption: Map<string, { consumedBy: string; type: 'full' | 'partial' }>;
  finalPositions: Map<string, { start: number; end: number }>;
}

/**
 * resolveReplayFromParsedFootnotes — run the scrub replay (backward + forward
 * passes) against already-parsed footnote data.
 *
 * This is the slow-path helper used by FootnoteNativeParser when Phase A
 * (hash + context) leaves some changes unanchored.  The parser calls this
 * with its own ParsedFootnote[] (converted to ReplayFootnote[]) so that the
 * document is never re-parsed from raw text.
 *
 * Returns freshAnchors, consumption relationships, and final body-coordinate
 * positions for every participating operation.
 */
export function resolveReplayFromParsedFootnotes(
  bodyText: string,
  footnotes: ReplayFootnote[],
): ReplayResolutionResult {
  // Convert ReplayFootnote[] to ActiveOperation[]
  const operations: ActiveOperation[] = [];
  for (const fn of footnotes) {
    if (!fn.editOpLine || fn.lineNumber === undefined || !fn.hash) continue;

    const opType = ABBREV_TO_TYPE[fn.type] ?? fn.type as ActiveOperation['type'];

    let modifiedText = '';
    let originalText = '';
    if (fn.opString) {
      try {
        ({ modifiedText, originalText } = extractOpTexts(fn.opString));
      } catch { /* leave empty */ }
    }

    operations.push({
      id: fn.id,
      type: opType,
      modifiedText,
      originalText,
      editOpLine: fn.editOpLine,
      lineNumber: fn.lineNumber,
      hash: fn.hash,
      status: fn.status,
    });
  }

  const active = operations.filter(isParticipating);
  if (active.length === 0) {
    return {
      freshAnchors: new Map(),
      consumption: new Map(),
      finalPositions: new Map(),
    };
  }

  const backward = scrubBackward(bodyText, active);
  const forward = scrubForward(backward.body0, active, backward.positions);

  return {
    freshAnchors: forward.anchors,
    consumption: forward.consumption,
    finalPositions: forward.finalPositions,
  };
}

// ─── resolve ────────────────────────────────────────────────────────────────

/**
 * resolve — unified L3 resolution protocol.
 *
 * Thin wrapper over parseForFormat() that converts ChangeNode[] results into
 * the ResolvedDocument shape expected by callers. Delegates Phase A (hash-gate
 * + context match) and Phase B (scrubBackward + scrubForward) to the unified
 * parser (FootnoteNativeParser), which already runs the full resolution protocol
 * and populates anchored, resolutionPath, freshAnchor, and consumedBy on each
 * ChangeNode.
 *
 * After parsing, this function:
 *   1. Converts ChangeNode[] → ResolvedChange[]
 *   2. Computes the coherence rate
 *   3. Collects unresolved diagnostics
 *   4. Rebuilds the L3 text with fresh anchors (same logic as before)
 */
export function resolve(l3Text: string): ResolvedDocument {
  const lines = l3Text.split('\n');
  const { bodyLines, footnoteLines } = splitBodyAndFootnotes(lines);
  const body = bodyLines.join('\n');

  // Delegate to the unified parser — it runs Phase A (hash + context) and
  // Phase B (scrub replay) and populates all resolution fields on ChangeNode.
  const doc = parseForFormat(l3Text);
  const parsedChanges = doc.getChanges();

  if (parsedChanges.length === 0) {
    return {
      resolvedText: l3Text,
      changes: [],
      coherenceRate: 100,
      unresolvedDiagnostics: [],
    };
  }

  // ── Convert ChangeNode[] → ResolvedChange[] ────────────────────────────────
  const allChanges: ResolvedChange[] = parsedChanges.map(node => {
    // Rejected changes are always "resolved" (no action needed)
    if (node.status === ChangeStatus.Rejected) {
      return {
        id: node.id,
        resolved: true,
        resolutionPath: 'rejected' as const,
      };
    }

    // Consumed nodes: the scrub replay successfully processed them (they exist
    // in the edit history), but their text is absent from the current body
    // because another op overwrote/deleted it. They are "resolved" in the sense
    // that the protocol handled them — same semantics as the old resolve() Phase B.
    // Parser sets anchored:false for consumed nodes (ghost-node filter), but
    // resolve() treats them as resolved per the original API contract.
    const isConsumed = !!node.consumedBy;
    const isResolved = node.anchored || isConsumed;

    const result: ResolvedChange = {
      id: node.id,
      resolved: isResolved,
      resolutionPath: node.resolutionPath ?? (isResolved ? 'replay' : 'rejected'),
      freshAnchor: node.freshAnchor,
      // Only provide resolvedRange for non-consumed, anchored nodes.
      // Consumed ops' text is absent from the current body, so a body range is invalid.
      resolvedRange: (node.anchored && !isConsumed)
        ? { start: node.range.start, end: node.range.end }
        : undefined,
    };

    if (node.consumedBy) {
      result.consumedBy = node.consumedBy;
      result.consumptionType = node.consumptionType ?? 'full';
    }

    return result;
  });

  // ── Compute coherence rate ─────────────────────────────────────────────────
  const totalResolvable = allChanges.length;
  const resolvedCount = allChanges.filter(c => c.resolved).length;
  const coherenceRate = totalResolvable > 0
    ? Math.round((resolvedCount / totalResolvable) * 100)
    : 100;

  // ── Collect unresolved diagnostics ─────────────────────────────────────────
  const unresolvedDiagnostics: string[] = [];
  for (const change of allChanges) {
    if (!change.resolved) {
      unresolvedDiagnostics.push(`${change.id}: unresolved via ${change.resolutionPath}`);
    }
  }

  // ── Rewrite L3 text with fresh anchors ─────────────────────────────────────
  // Build a map of id → fresh anchor for footnote rewriting
  const anchorMap = new Map<string, string>();
  for (const change of allChanges) {
    if (change.freshAnchor) {
      anchorMap.set(change.id, change.freshAnchor);
    }
  }

  // Rebuild footnote section with fresh anchors
  const rebuiltFootnotes: string[] = [];
  let fi = 0;

  while (fi < footnoteLines.length) {
    const fline = footnoteLines[fi];
    const idMatch = fline.match(/^\[\^(cn-[\w.]+)\]:/);

    if (idMatch) {
      const changeId = idMatch[1];
      const freshAnchor = anchorMap.get(changeId);
      rebuiltFootnotes.push(fline);
      fi++;

      // Process continuation lines — replace the edit-op line if we have a fresh anchor
      let editOpReplaced = false;
      while (fi < footnoteLines.length) {
        const contLine = footnoteLines[fi];
        if (FOOTNOTE_DEF_START.test(contLine)) break;

        if (!editOpReplaced && FOOTNOTE_L3_EDIT_OP.test(contLine) && freshAnchor) {
          rebuiltFootnotes.push(freshAnchor);
          editOpReplaced = true;
          fi++;
        } else if (/^\s/.test(contLine) || contLine.trim() === '') {
          rebuiltFootnotes.push(contLine);
          fi++;
        } else {
          break;
        }
      }
    } else {
      rebuiltFootnotes.push(fline);
      fi++;
    }
  }

  const resolvedText = body + '\n\n' + rebuiltFootnotes.join('\n') + '\n';

  return {
    resolvedText,
    changes: allChanges,
    coherenceRate,
    unresolvedDiagnostics,
  };
}
