import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  parseTrackingHeader,
  insertTrackingHeader,
  generateFootnoteDefinition,
  initHashline,
  computeLineHash,
  stripHashlinePrefixes,
  stripBoundaryEcho,
  computeSettledLineHash,
  settledLine,
  defaultNormalizer,
  computeCommittedView,
  computeSettledView,
  CriticMarkupParser,
  ChangeStatus,
  settleAcceptedChangesOnly,
  settleRejectedChangesOnly,
} from '@changetracks/core';
import { validateOrAutoRemap, type RelocationEntry, type AutoRemapResult } from './hashline-relocate.js';
import { HashlineMismatchError } from '@changetracks/core';
import { handleProposeBatch } from './propose-batch.js';
import { computeAffectedLines, type AffectedLineEntry, type ViewProjection } from './propose-utils.js';
import { resolveAuthor } from '../author.js';
import { ConfigResolver } from '../config-resolver.js';
import { strArg, optionalStrArg } from '../args.js';
import { applyProposeChange, contentZoneText, extractLineRange, findUniqueMatch, guardOverlap, resolveOverlapWithAuthor, stripRefsFromContent } from '../file-ops.js';
import { toRelativePath } from '../path-utils.js';
import { resolveTrackingStatus } from '../scope.js';
import { SessionState, type ViewName } from '../state.js';
import { parseOp, nowTimestamp } from '@changetracks/core';
import { resolveAt, parseAt } from '@changetracks/core';
import { resolveProtocolMode } from '../config.js';
export interface ProposeChangeResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

type ProposeChangeErrorCode =
  | 'MISSING_ARGUMENT'
  | 'TRACKING_UNTRACKED_FILE'
  | 'HASHLINE_DISABLED'
  | 'HASHLINE_REFERENCE_UNRESOLVED'
  | 'HASHLINE_LINE_OUT_OF_RANGE'
  | 'FILE_UNREADABLE'
  | 'AUTHOR_RESOLUTION_FAILED'
  | 'VALIDATION_ERROR'
  | 'PROTOCOL_MODE_MISMATCH'
  | 'DEPRECATED_PARAMS'
  | 'INTERNAL_ERROR';

/**
 * Detects whether hashline addressing params are present in args.
 */
function hasHashlineParams(args: Record<string, unknown>): boolean {
  return (
    args.start_line !== undefined ||
    args.start_hash !== undefined ||
    args.after_line !== undefined ||
    args.after_hash !== undefined
  );
}

// Shared utilities — canonical source is propose-utils.ts.
// Re-exported here so external consumers that import from propose-change.ts still work.
export { computeAffectedLines } from './propose-utils.js';
export type { AffectedLineEntry, ViewProjection } from './propose-utils.js';

/**
 * Detect whether the recorded hashes came from a committed view (have `committed` field).
 */
function hasCommittedHashes(
  filePath: string,
  state: SessionState,
): boolean {
  const recorded = state.getRecordedHashes(filePath);
  if (!recorded || recorded.length === 0) return false;
  return recorded.some(entry => entry.committed !== undefined);
}

/**
 * Detect whether the recorded hashes came from a settled view (have `settledView` field).
 */
function hasSettledHashes(
  filePath: string,
  state: SessionState,
): boolean {
  const recorded = state.getRecordedHashes(filePath);
  if (!recorded || recorded.length === 0) return false;
  return recorded.some(entry => entry.settledView !== undefined);
}

/**
 * Check for file staleness by comparing current file content against recorded hashes.
 * Returns a warning message if the file has changed since last read_tracked_file call.
 *
 * When recorded hashes have committed fields (from committed view), staleness is checked
 * against raw file hashes using the rawLineNum mapping.
 */
function checkStaleness(
  fileContent: string,
  filePath: string,
  state: SessionState,
): string | undefined {
  const recorded = state.getRecordedHashes(filePath);
  if (!recorded || recorded.length === 0) return undefined;

  const lines = fileContent.split('\n');

  if (hasCommittedHashes(filePath, state)) {
    // Committed-view staleness check: compare raw hashes at mapped raw line numbers
    for (const entry of recorded) {
      const rawLine = entry.rawLineNum ?? entry.line;
      if (rawLine < 1 || rawLine > lines.length) {
        return 'File has changed since last read_tracked_file: line count differs. Re-read with read_tracked_file view=committed for current hashes.';
      }
      const currentHash = computeLineHash(rawLine - 1, lines[rawLine - 1], lines);
      if (currentHash !== entry.raw) {
        return `File has changed since last read_tracked_file: raw line ${rawLine} hash differs (recorded ${entry.raw}, current ${currentHash}). Re-read with read_tracked_file view=committed for current hashes.`;
      }
    }
  } else if (hasSettledHashes(filePath, state)) {
    // Settled-view staleness check: settled line numbers differ from raw,
    // so use the rawLineNum mapping (recorded during read_tracked_file view=settled)
    // to validate against raw file hashes.
    for (const entry of recorded) {
      const rawLine = entry.rawLineNum ?? entry.line;
      if (rawLine < 1 || rawLine > lines.length) {
        return 'File has changed since last read_tracked_file: line count differs. Re-read with read_tracked_file view=settled for current hashes.';
      }
      const currentHash = computeLineHash(rawLine - 1, lines[rawLine - 1], lines);
      if (currentHash !== entry.raw) {
        return `File has changed since last read_tracked_file: raw line ${rawLine} hash differs (recorded ${entry.raw}, current ${currentHash}). Re-read with read_tracked_file view=settled for current hashes.`;
      }
    }
  } else {
    // Standard staleness check: compare raw hashes directly
    for (const entry of recorded) {
      if (entry.line < 1 || entry.line > lines.length) {
        return 'File has changed since last read_tracked_file: line count differs. Re-read with read_tracked_file for current hashes.';
      }
      const currentHash = computeLineHash(entry.line - 1, lines[entry.line - 1], lines);
      if (currentHash !== entry.raw) {
        return `File has changed since last read_tracked_file: line ${entry.line} hash differs (recorded ${entry.raw}, current ${currentHash}). Re-read with read_tracked_file for current hashes.`;
      }
    }
  }

  return undefined;
}

function classifyHashlineValidationError(message: string): ProposeChangeErrorCode {
  if (message.includes('Line ') && message.includes(' is out of range')) {
    return 'HASHLINE_LINE_OUT_OF_RANGE';
  }
  return 'HASHLINE_REFERENCE_UNRESOLVED';
}

/**
 * Build a quick_fix object for hashline errors.
 * Provides machine-parseable recovery hints so agents can automatically
 * re-read the file and retry with correct coordinates.
 */
function buildQuickFix(
  file: string,
  staleLine?: number,
  currentHash?: string,
): Record<string, unknown> {
  const quickFix: Record<string, unknown> = {
    action: 're_read',
    file,
  };
  if (staleLine !== undefined) {
    quickFix.stale_line = staleLine;
  }
  if (currentHash !== undefined) {
    quickFix.current_hash = currentHash;
  }
  return quickFix;
}

/**
 * Extract stale_line and current_hash from a hashline validation error.
 * Works with HashlineMismatchError (has mismatches array with actual hashes),
 * resolveAt plain Error messages ("Hash mismatch at line N: ... current hash is X"),
 * and generic out-of-range errors ("Line N out of range").
 */
function extractQuickFixFromError(
  err: unknown,
  fallbackLine?: number,
): { staleLine?: number; currentHash?: string } {
  if (err instanceof HashlineMismatchError && err.mismatches.length > 0) {
    return {
      staleLine: err.mismatches[0].line,
      currentHash: err.mismatches[0].actual,
    };
  }
  // Parse plain Error messages from resolveAt / validateOrAutoRemap
  if (err instanceof Error) {
    const msg = err.message;
    // "Hash mismatch at line 4: expected de, current hash is ab"
    const hashMatch = msg.match(/at line (\d+):.*current hash is (\w+)/);
    if (hashMatch) {
      return {
        staleLine: Number(hashMatch[1]),
        currentHash: hashMatch[2],
      };
    }
    // "Line 4 out of range"
    const rangeMatch = msg.match(/Line (\d+).*out of range/);
    if (rangeMatch) {
      return { staleLine: Number(rangeMatch[1]) };
    }
  }
  return { staleLine: fallbackLine };
}

/**
 * Settle-on-demand: if `oldText` matches inside an accepted/rejected CriticMarkup
 * construct (either via exact match inside the markup, or via the settled-text
 * fallback), settle those constructs first so the subsequent proposal operates on
 * clean prose.
 *
 * Returns the file content to use (settled if settlement happened) and whether
 * settlement occurred. When settlement occurs, the caller must write the settled
 * content to disk before applying the proposal.
 *
 * Only accepted and rejected changes are settled — proposed changes are never
 * auto-settled.
 */
function settleOnDemandIfNeeded(
  fileContent: string,
  oldText: string,
): { content: string; settled: boolean } {
  // Quick path: no CriticMarkup in file, no settlement needed.
  if (!oldText || !/\{\+\+|\{--|\{~~|\{==|\{>>/.test(fileContent)) {
    return { content: fileContent, settled: false };
  }

  // Parse the document to find accepted/rejected changes.
  const parser = new CriticMarkupParser();
  const doc = parser.parse(fileContent, { skipCodeBlocks: false });
  const changes = doc.getChanges();

  // Filter to only accepted/rejected changes (these are candidates for settlement).
  const settleableChanges = changes.filter(
    (c) => c.status === ChangeStatus.Accepted || c.status === ChangeStatus.Rejected,
  );

  if (settleableChanges.length === 0) {
    return { content: fileContent, settled: false };
  }

  // Try matching old_text in the content zone (without footnotes).
  let match: ReturnType<typeof findUniqueMatch> | undefined;
  try {
    match = findUniqueMatch(contentZoneText(fileContent), oldText, defaultNormalizer);
  } catch {
    // Match not found or ambiguous — let the caller handle the error
    return { content: fileContent, settled: false };
  }

  const matchStart = match.index;
  const matchEnd = match.index + match.length;

  // Check if the match range overlaps any accepted or rejected change range.
  // This catches both:
  // 1. Exact match landing inside CriticMarkup construct (e.g., `new` inside `{~~old~>new~~}`)
  // 2. Settled-text match (wasSettledMatch=true) expanding to cover markup constructs
  const overlapsSettleable = settleableChanges.some(
    (c) => c.range.start < matchEnd && c.range.end > matchStart,
  );

  if (!overlapsSettleable) {
    return { content: fileContent, settled: false };
  }

  // Settle accepted changes first, then rejected changes.
  // settleAcceptedChangesOnly and settleRejectedChangesOnly preserve footnote refs
  // inline adjacent to the settled text (the audit trail remains).
  const { settledContent: afterAccepted } = settleAcceptedChangesOnly(fileContent);
  const { settledContent: afterRejected } = settleRejectedChangesOnly(afterAccepted);

  return { content: afterRejected, settled: true };
}

/**
 * Compact-path equivalent of settleOnDemandIfNeeded.
 *
 * Given raw line numbers from view-aware coordinate translation,
 * checks if the target region overlaps any accepted/rejected CriticMarkup.
 * If so, settles the entire file in-memory (accepted then rejected)
 * and returns the settled content.
 */
function settleOnDemandForCompact(
  fileContent: string,
  rawStartLine: number,
  rawEndLine: number,
): { content: string; settled: boolean } {
  // Quick path: no settleable CriticMarkup → no settlement needed.
  // Note: {== (highlight) and {>> (comment) are not settleable; excluding them is correct.
  if (!/\{\+\+|\{--|\{~~/.test(fileContent)) {
    return { content: fileContent, settled: false };
  }

  const parser = new CriticMarkupParser();
  const doc = parser.parse(fileContent, { skipCodeBlocks: false });
  const changes = doc.getChanges();

  const settleableChanges = changes.filter(
    (c) => c.status === ChangeStatus.Accepted || c.status === ChangeStatus.Rejected,
  );

  if (settleableChanges.length === 0) {
    return { content: fileContent, settled: false };
  }

  // Convert raw line numbers to character offsets for overlap detection
  const lines = fileContent.split('\n');
  let targetStart = 0;
  for (let i = 0; i < rawStartLine - 1 && i < lines.length; i++) {
    targetStart += lines[i].length + 1;
  }
  let targetEnd = targetStart;
  for (let i = rawStartLine - 1; i < rawEndLine && i < lines.length; i++) {
    targetEnd += lines[i].length + 1;
  }

  // Check if the target region overlaps any accepted/rejected change
  const overlapsSettleable = settleableChanges.some(
    (c) => c.range.start < targetEnd && c.range.end > targetStart,
  );

  if (!overlapsSettleable) {
    return { content: fileContent, settled: false };
  }

  // Settle accepted then rejected (same as classic path)
  const { settledContent: afterAccepted } = settleAcceptedChangesOnly(fileContent);
  const { settledContent: afterRejected } = settleRejectedChangesOnly(afterAccepted);

  return { content: afterRejected, settled: true };
}

/**
 * Handles a `propose_change` tool call.
 *
 * Validates arguments, reads the target file, applies CriticMarkup changes
 * via `applyProposeChange` or hashline-based addressing, writes the result
 * back to disk, and returns a structured response suitable for the MCP protocol.
 *
 * Three addressing modes:
 * 1. String match (legacy): only old_text provided, no line params
 * 2. Line range: start_line + start_hash (with optional end_line/end_hash)
 * 3. Hybrid: both start_line/start_hash AND old_text for sub-line precision
 */
export async function handleProposeChange(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState
): Promise<ProposeChangeResult> {
  try {
    // ─── Early dispatch: changes array and raw mode ─────────────
    // Gracefully handle string-encoded changes arrays (common cross-model serialization)
    let changesArray: Array<Record<string, unknown>> | undefined;
    if (Array.isArray(args.changes)) {
      changesArray = args.changes as Array<Record<string, unknown>>;
    } else if (typeof args.changes === 'string') {
      try {
        const parsed: unknown = JSON.parse(args.changes as string);
        if (Array.isArray(parsed)) {
          changesArray = parsed as Array<Record<string, unknown>>;
        } else {
          return errorResult(
            'The "changes" parameter was received as a JSON string but parsed to ' +
            `${typeof parsed}, not an array. Send changes as a JSON array of objects, e.g.: ` +
            'changes: [{ "at": "5:a1b2", "op": "{~~old~>new~~}" }]',
            'VALIDATION_ERROR',
          );
        }
      } catch {
        return errorResult(
          'The "changes" parameter was received as a string but could not be parsed as JSON. ' +
          'Send changes as a JSON array of objects, e.g.: ' +
          'changes: [{ "at": "5:a1b2", "op": "{~~old~>new~~}" }]',
          'VALIDATION_ERROR',
        );
      }
    } else if (args.changes !== undefined) {
      return errorResult(
        `The "changes" parameter must be an array of objects, got ${typeof args.changes}. ` +
        'Send changes as a JSON array, e.g.: changes: [{ "at": "5:a1b2", "op": "{~~old~>new~~}" }]',
        'VALIDATION_ERROR',
      );
    }
    const rawMode = args.raw === true;

    // Policy gate for raw mode (check before any file I/O)
    if (rawMode) {
      const file = args.file as string | undefined;
      if (!file) {
        return errorResult('Missing required argument: "file"', 'MISSING_ARGUMENT');
      }
      const filePath = resolver.resolveFilePath(file);
      const { config } = await resolver.forFile(filePath);
      const policyMode = config.policy?.mode ?? 'safety-net';
      if (policyMode === 'strict') {
        return errorResult(
          'Raw edit denied: project policy is strict. Raw edits bypass CriticMarkup tracking and are not allowed in strict mode.',
          'VALIDATION_ERROR',
        );
      }
    }

    // Normalize: convert to changes array or fall through to legacy path
    if (changesArray) {
      if (changesArray.length === 0) {
        return errorResult('No changes provided: changes array is empty.', 'VALIDATION_ERROR');
      }

      // Validate that each element is a non-null object
      for (let i = 0; i < changesArray.length; i++) {
        const elem = changesArray[i];
        if (elem === null || elem === undefined || typeof elem !== 'object' || Array.isArray(elem)) {
          return errorResult(
            `changes[${i}] must be an object, got ${elem === null ? 'null' : Array.isArray(elem) ? 'array' : typeof elem}.`,
            'VALIDATION_ERROR',
          );
        }
      }

      const file = args.file as string | undefined;
      if (!file) {
        return errorResult('Missing required argument: "file"', 'MISSING_ARGUMENT');
      }

      // Raw mode: direct replacements without CriticMarkup
      if (rawMode) {
        return handleRawChanges(changesArray, file, resolver, state);
      }

      // Single change in array: extract and pass through existing single-change path
      if (changesArray.length === 1) {
        const change = changesArray[0]!;
        // Build a new args object from the single change, preserving file-level params
        const singleArgs: Record<string, unknown> = {
          file: args.file,
          author: args.author,
          // Per-change reason takes precedence over batch-level reason
          reason: change.reason ?? args.reason,
          level: args.level,
        };
        // Classic params from the change element
        if (change.old_text !== undefined) singleArgs.old_text = change.old_text;
        if (change.new_text !== undefined) singleArgs.new_text = change.new_text;
        if (change.insert_after !== undefined) singleArgs.insert_after = change.insert_after;
        if (change.after_text !== undefined) singleArgs.insert_after = change.after_text;
        // Compact params from the change element
        if (change.at !== undefined) singleArgs.at = change.at;
        if (change.op !== undefined) singleArgs.op = change.op;
        // Hashline params from the change element
        if (change.start_line !== undefined) singleArgs.start_line = change.start_line;
        if (change.start_hash !== undefined) singleArgs.start_hash = change.start_hash;
        if (change.end_line !== undefined) singleArgs.end_line = change.end_line;
        if (change.end_hash !== undefined) singleArgs.end_hash = change.end_hash;
        if (change.after_line !== undefined) singleArgs.after_line = change.after_line;
        if (change.after_hash !== undefined) singleArgs.after_hash = change.after_hash;

        // Recurse through the same handler with extracted single-change params
        return handleProposeChange(singleArgs, resolver, state);
      }

      // Multiple changes: delegate to batch handler (reuses handleProposeBatch logic).
      // propose_change(changes=[...]) is atomic: validate all, apply none on any failure.
      const batchArgs: Record<string, unknown> = {
        file: args.file,
        reason: args.reason,
        author: args.author,
        changes: changesArray,
        atomic: true,
      };
      const batchResult = await handleProposeBatch(batchArgs, resolver, state);
      // Adapt ProposeBatchResult to ProposeChangeResult (same shape)
      return batchResult as ProposeChangeResult;
    }

    // Legacy path: no changes array. Check for raw mode with legacy params.
    if (rawMode) {
      const file = args.file as string | undefined;
      if (!file) {
        return errorResult('Missing required argument: "file"', 'MISSING_ARGUMENT');
      }
      const oldText = strArg(args, 'old_text', 'oldText');
      const newText = strArg(args, 'new_text', 'newText');
      if (oldText === '' && newText === '') {
        return errorResult('Both old_text and new_text are empty — nothing to change.', 'VALIDATION_ERROR');
      }
      return handleRawChanges(
        [{ old_text: oldText, new_text: newText }],
        file,
        resolver,
        state,
      );
    }

    // ─── Legacy single-change path (existing behavior) ──────────
    // 1. Extract and validate args (accept snake_case and camelCase for text params)
    const file = args.file as string | undefined;
    const oldText = strArg(args, 'old_text', 'oldText');
    const newText = strArg(args, 'new_text', 'newText');
    const reasoning = args.reason as string | undefined;
    const insertAfter = optionalStrArg(args, 'insert_after', 'insertAfter');
    const level = (args.level as 1 | 2 | undefined) ?? 2;

    // Hashline params (needed to allow line-range deletion: empty old_text + new_text with start_line/start_hash)
    let startLine = args.start_line as number | undefined;
    const startHash = args.start_hash as string | undefined;

    // Detect compact mode params early (at/op bypass classic validation)
    const hasCompactParams = typeof args.at === 'string' || typeof args.op === 'string';

    if (oldText === '' && newText === '' && !hasCompactParams) {
      const isLineRangeDeletion = startLine !== undefined && startHash !== undefined;
      if (!isLineRangeDeletion) {
        const receivedKeys = Object.keys(args ?? {}).join(', ') || '(none)';
        const oldLen = typeof args.old_text === 'string' ? args.old_text.length : (typeof args.oldText === 'string' ? args.oldText.length : 'missing');
        const newLen = typeof args.new_text === 'string' ? args.new_text.length : (typeof args.newText === 'string' ? args.newText.length : 'missing');
        return errorResult(
          `Both old_text and new_text are empty — nothing to change. Received argument keys: [${receivedKeys}]. old_text/oldText length: ${String(oldLen)}, new_text/newText length: ${String(newLen)}. Use old_text and new_text (snake_case) or oldText and newText (camelCase).`,
          'VALIDATION_ERROR',
          { received_keys: Object.keys(args ?? {}), old_text_length: oldLen, new_text_length: newLen },
        );
      }
    }

    // Identity-substitution guard: catch ref-only edits
    if (oldText && newText) {
      const strippedOld = oldText.replace(/\[\^?ct-\d+(?:\.\d+)?\]/g, '').trim();
      const strippedNew = newText.replace(/\[\^?ct-\d+(?:\.\d+)?\]/g, '').trim();
      if (strippedOld === strippedNew) {
        return errorResult(
          'No prose changes detected (only footnote references differ). ' +
          'Footnote references are structural links to change history — ' +
          'use review_changes to manage them, not propose_change.',
          'VALIDATION_ERROR',
        );
      }
    }

    let endLine = args.end_line as number | undefined;
    const endHash = args.end_hash as string | undefined;
    let afterLine = args.after_line as number | undefined;
    const afterHash = args.after_hash as string | undefined;

    if (!file) {
      return errorResult('Missing required argument: "file"', 'MISSING_ARGUMENT');
    }

    // 2. Resolve file path
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    const relativePath = toRelativePath(projectDir, filePath);
    const trackingStatus = await resolveTrackingStatus(filePath, config, projectDir);

    // 1b. Config gate: if hashline params provided, check config.hashline.enabled
    if (hasHashlineParams(args) && !config.hashline.enabled) {
      return errorResult(
        'Hashline addressing requires [hashline] enabled = true in .changetracks/config.toml',
        'HASHLINE_DISABLED',
        {
          file: relativePath,
          hashline_enabled: config.hashline.enabled,
        },
      );
    }

    // 3. Resolve tracking with precedence (file header > project config > global default)
    // and fail with actionable diagnostics when propose_change is used on untracked files.
    if (trackingStatus.status !== 'tracked') {
      return errorResult(
        `File is not tracked for propose_change: "${filePath}".`,
        'TRACKING_UNTRACKED_FILE',
        {
          file: relativePath,
          tracking_status: trackingStatus,
        },
      );
    }

    // 4. Read file from disk (or handle new file creation)
    let fileContent: string;
    let isNewFile = false;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      // New file creation: file doesn't exist, oldText is empty, no insertAfter, no hashline params
      if (oldText === '' && !insertAfter && !hasHashlineParams(args)) {
        fileContent = '';
        isNewFile = true;
      } else {
        const msg =
          err instanceof Error ? err.message : String(err);
        return errorResult(`File not found or unreadable: ${msg}`, 'FILE_UNREADABLE', {
          file: relativePath,
        });
      }
    }

    // ─── Protocol mode dispatch ───────────────────────────────────
    const protocolMode = resolveProtocolMode(config.protocol?.mode ?? 'classic');
    const hasClassicParams = (typeof args.old_text === 'string' && args.old_text !== '') ||
      (typeof args.new_text === 'string' && args.new_text !== '') ||
      typeof args.insert_after === 'string';

    // Classic mode: reject compact params
    if (protocolMode === 'classic' && hasCompactParams) {
      return errorResult(
        'This project uses classic mode. Use old_text/new_text parameters instead of at/op.',
        'PROTOCOL_MODE_MISMATCH',
      );
    }

    // Compact mode: reject classic params
    if (protocolMode === 'compact' && hasClassicParams && !hasCompactParams) {
      return errorResult(
        'This project uses compact mode. Use at/op parameters instead of old_text/new_text.',
        'PROTOCOL_MODE_MISMATCH',
      );
    }

    if (protocolMode === 'compact' && hasCompactParams) {
      return await handleCompactProposeChange(args, filePath, relativePath, config, state, fileContent, projectDir);
    }

    // 4b. Auto-insert tracking header if needed.
    // Track line delta so hashline coordinates from the agent's read can be adjusted —
    // read_tracked_file shows the file without the header, but validation runs against
    // the header-inserted content, shifting all line numbers.
    let headerLineDelta = 0;
    if (config.tracking.auto_header) {
      if (!parseTrackingHeader(fileContent)) {
        const linesBefore = fileContent.split('\n').length;
        const { newText: headerText, headerInserted } = insertTrackingHeader(fileContent);
        if (headerInserted) {
          fileContent = headerText;
          headerLineDelta = fileContent.split('\n').length - linesBefore;
        }
      }
    }

    // ─── View-aware hashline resolution (pre-header-delta) ────────────────
    // Must happen before headerLineDelta adjustment because view-space line
    // numbers are in the space the agent saw (file without tracking header).
    // The mapped raw line numbers also reference the original file layout,
    // so we apply headerLineDelta to the mapped raw lines afterward.
    //
    // resolveHash() detects the view the agent used (committed/settled/raw)
    // and translates view-space coordinates to raw-space coordinates in one
    // call, eliminating separate hasCommittedHashes / hasSettledHashes branches.
    let viewResolved: ViewName | undefined;

    if (hasHashlineParams(args)) {
      if (startLine !== undefined && startHash !== undefined) {
        const resolved = state.resolveHash(filePath, startLine, startHash);
        if (resolved?.match === true) {
          startLine = resolved.rawLineNum;
          viewResolved = resolved.view;
        } else if (resolved !== undefined && !resolved.match) {
          return errorResult(
            `Hash mismatch at line ${startLine} (${resolved.view} view): ` +
            `expected ${resolved.expectedHash}, got ${startHash}. Re-read the file.`,
            'HASHLINE_REFERENCE_UNRESOLVED',
            {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, startLine),
            },
          );
        }
        // undefined = no session state, proceed with raw coordinates
      }

      if (endLine !== undefined && endHash !== undefined) {
        const resolved = state.resolveHash(filePath, endLine, endHash);
        if (resolved?.match === true) {
          endLine = resolved.rawLineNum;
          viewResolved = viewResolved ?? resolved.view;
        } else if (resolved !== undefined && !resolved.match) {
          return errorResult(
            `Hash mismatch at end line ${endLine} (${resolved.view} view): ` +
            `expected ${resolved.expectedHash}, got ${endHash}. Re-read the file.`,
            'HASHLINE_REFERENCE_UNRESOLVED',
            {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, endLine),
            },
          );
        }
        // undefined = no session state, proceed with raw coordinates
      }

      if (afterLine !== undefined && afterHash !== undefined) {
        const resolved = state.resolveHash(filePath, afterLine, afterHash);
        if (resolved?.match === true) {
          afterLine = resolved.rawLineNum;
          viewResolved = viewResolved ?? resolved.view;
        } else if (resolved !== undefined && !resolved.match) {
          return errorResult(
            `Hash mismatch at after_line ${afterLine} (${resolved.view} view): ` +
            `expected ${resolved.expectedHash}, got ${afterHash}. Re-read the file.`,
            'HASHLINE_REFERENCE_UNRESOLVED',
            {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, afterLine),
            },
          );
        }
        // undefined = no session state, proceed with raw coordinates
      }
    }

    // Adjust hashline coordinates for auto-header line shift
    if (headerLineDelta > 0) {
      if (startLine !== undefined) startLine += headerLineDelta;
      if (afterLine !== undefined) afterLine += headerLineDelta;
      if (endLine !== undefined) endLine += headerLineDelta;
    }

    // 5. Get next ID
    const changeId = state.getNextId(filePath, fileContent);

    // 6. Determine author
    const { author, error: authorError } = resolveAuthor(
      args.author as string | undefined,
      config,
      'propose_change',
    );
    if (authorError) {
      return errorResult(authorError.message, 'AUTHOR_RESOLUTION_FAILED');
    }

    // Determine addressing mode
    const useLineRange = (startLine !== undefined && startHash !== undefined);
    const useAfterLine = (afterLine !== undefined && afterHash !== undefined);
    const isHashlineMode = useLineRange || useAfterLine;

    let modifiedText: string;
    let changeType: 'ins' | 'del' | 'sub';
    let affectedLines: AffectedLineEntry[] | undefined;
    let stalenessWarning: string | undefined;
    const supersededIds: string[] = [];
    const relocations: RelocationEntry[] = [];
    const remaps: AutoRemapResult[] = [];
    const autoRemap = config.hashline.auto_remap ?? true;

    if (isHashlineMode) {
      // ─── Hashline addressing modes ────────────────────────────────

      // Ensure hashline WASM is initialized
      await initHashline();

      const fileLines = fileContent.split('\n');

      // Check staleness
      stalenessWarning = checkStaleness(fileContent, filePath, state);

      if (useAfterLine && oldText === '') {
        // ─── Insertion via after_line ──────────────────────────────
        // Validate after_line hash (skip when already resolved from view-space)
        if (viewResolved === undefined) {
          try {
            const afterResult = validateOrAutoRemap(
              { line: afterLine!, hash: afterHash! },
              fileLines,
              'after_line',
              relocations,
              autoRemap,
            );
            afterLine = afterResult.line;
            if (afterResult.remap) remaps.push(afterResult.remap);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const { staleLine, currentHash } = extractQuickFixFromError(err, afterLine);
            return errorResult(message, classifyHashlineValidationError(message), {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, staleLine, currentHash),
            });
          }
        }

        // Apply cleanup heuristics to new_text
        let cleanedNewText = newText;
        const newTextLines = cleanedNewText.split('\n');
        const strippedLines = stripHashlinePrefixes(newTextLines);
        cleanedNewText = strippedLines.join('\n');

        changeType = 'ins';
        const ts = nowTimestamp();
        const authorAt = author.startsWith('@') ? author : `@${author}`;
        const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|ins|proposed<<}` : '';
        const inlineMarkup = level === 2
          ? `{++${cleanedNewText}++}[^${changeId}]`
          : `{++${cleanedNewText}++}${l1Comment}`;
        const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
        const reasonLine = reasoning
          ? `\n    @${author} ${ts.raw}: ${reasoning}`
          : '';
        const footnoteBlock = footnoteHeader + reasonLine;

        // Insert after the target line (end of line afterLine)
        const insertPos = fileLines.slice(0, afterLine!).join('\n').length;
        modifiedText = fileContent.slice(0, insertPos) + '\n' + inlineMarkup + fileContent.slice(insertPos);

        if (level === 2) {
          const { appendFootnote } = await import('../file-ops.js');
          modifiedText = appendFootnote(modifiedText, footnoteBlock);
        }

        // Compute affected lines around the insertion point
        const modifiedLines = modifiedText.split('\n');
        const affectedStart = afterLine!;
        const affectedEnd = Math.min(modifiedLines.length, afterLine! + 3);
        affectedLines = computeAffectedLines(modifiedText, affectedStart, affectedEnd, {
          hashlineEnabled: config.hashline.enabled,
        });

      } else if (useLineRange) {
        // ─── Line range mode (with or without old_text for hybrid) ──
        const ts = nowTimestamp();

        let effectiveEndLine = endLine ?? startLine!;
        const effectiveEndHash = endHash ?? (effectiveEndLine === startLine! ? startHash! : undefined);

        // Validate start_line hash (skip when already resolved from view-space)
        if (viewResolved === undefined) {
          try {
            const startResult = validateOrAutoRemap(
              { line: startLine!, hash: startHash! },
              fileLines,
              'start_line',
              relocations,
              autoRemap,
            );
            startLine = startResult.line;
            if (startResult.remap) remaps.push(startResult.remap);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const { staleLine, currentHash } = extractQuickFixFromError(err, startLine);
            return errorResult(message, classifyHashlineValidationError(message), {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, staleLine, currentHash),
            });
          }
        }

        // Validate end_line hash (skip when already resolved from view-space)
        if (viewResolved === undefined && (effectiveEndLine !== startLine! || (endHash !== undefined && endHash !== startHash))) {
          if (!effectiveEndHash) {
            return errorResult(
              'end_line requires end_hash for verification.',
              'VALIDATION_ERROR',
              { file: relativePath },
            );
          }
          try {
            const endResult = validateOrAutoRemap(
              { line: effectiveEndLine, hash: effectiveEndHash },
              fileLines,
              'end_line',
              relocations,
              autoRemap,
            );
            effectiveEndLine = endResult.line;
            if (endResult.remap) remaps.push(endResult.remap);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const { staleLine, currentHash } = extractQuickFixFromError(err, effectiveEndLine);
            return errorResult(message, classifyHashlineValidationError(message), {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, staleLine, currentHash),
            });
          }
        }

        // Extract content from line range
        const extracted = extractLineRange(fileLines, startLine!, effectiveEndLine);

        if (oldText !== '') {
          // ─── Hybrid mode: scope old_text search within line range ──
          let rangeText = extracted.content;
          let rangeStartOffset = extracted.startOffset;

          // Find old_text within the extracted range content (restrict to content zone)
          let match = findUniqueMatch(contentZoneText(rangeText), oldText, defaultNormalizer);
          // Auto-supersede same-author overlaps; throw for different-author overlaps
          const absMatchPos0 = rangeStartOffset + match.index;
          const supersedeResult = resolveOverlapWithAuthor(fileContent, absMatchPos0, match.length, author);
          if (supersedeResult) {
            fileContent = supersedeResult.settledContent;
            supersededIds.push(...supersedeResult.supersededIds);
            // Re-extract and re-match after settlement (offsets shift)
            const updatedFileLines = fileContent.split('\n');
            const reExtracted = extractLineRange(updatedFileLines, startLine!, effectiveEndLine);
            rangeText = reExtracted.content;
            rangeStartOffset = reExtracted.startOffset;
            match = findUniqueMatch(contentZoneText(rangeText), oldText, defaultNormalizer);
          }
          const actualOldText = match.originalText;
          // Strip footnote refs so they don't end up inside CriticMarkup delimiters
          const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(actualOldText);

          // Apply cleanup to new_text
          let cleanedNewText = newText;
          const newTextLines = cleanedNewText.split('\n');
          const strippedLines = stripHashlinePrefixes(newTextLines);
          cleanedNewText = strippedLines.join('\n');

          if (cleanedNewText === '') {
            changeType = 'del';
          } else {
            changeType = 'sub';
          }

          const authorAt = author.startsWith('@') ? author : `@${author}`;
          const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|${changeType}|proposed<<}` : '';
          const refTail = preservedRefs.join('');
          const inlineMarkup = level === 2
            ? (changeType === 'del'
              ? `{--${cleanedOld}--}[^${changeId}]${refTail}`
              : `{~~${cleanedOld}~>${cleanedNewText}~~}[^${changeId}]${refTail}`)
            : (changeType === 'del'
              ? `{--${cleanedOld}--}${l1Comment}${refTail}`
              : `{~~${cleanedOld}~>${cleanedNewText}~~}${l1Comment}${refTail}`);

          // Compute absolute position in file
          const absPos = rangeStartOffset + match.index;
          const absEnd = absPos + match.length;

          modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);

        } else {
          // ─── Pure line-range mode (no old_text) ────────────────────

          // Guard: nested CriticMarkup produces invalid markup
          if (/\{\+\+|\{--|\{~~|\{==|\{>>/.test(extracted.content)) {
            return errorResult(
              'Line range contains existing CriticMarkup. ' +
              'Use hybrid mode (provide old_text to target specific text within the range) ' +
              'or accept/reject the existing change first.',
              'VALIDATION_ERROR',
              { file: relativePath },
            );
          }

          // Apply cleanup heuristics to new_text
          let cleanedNewText = newText;
          let newTextLines = cleanedNewText.split('\n');
          newTextLines = stripHashlinePrefixes(newTextLines);

          // Strip boundary echo (context lines from before/after the range)
          newTextLines = stripBoundaryEcho(fileLines, startLine!, effectiveEndLine, newTextLines);

          cleanedNewText = newTextLines.join('\n');

          const authorAt = author.startsWith('@') ? author : `@${author}`;
          if (cleanedNewText === '') {
            // Deletion
            changeType = 'del';
            // Strip footnote refs so they don't end up inside CriticMarkup delimiters
            const { cleaned: cleanedExtracted, refs: preservedRefs } = stripRefsFromContent(extracted.content);
            const refTail = preservedRefs.join('');
            const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|del|proposed<<}` : '';
            const inlineMarkup = level === 2
              ? `{--${cleanedExtracted}--}[^${changeId}]${refTail}`
              : `{--${cleanedExtracted}--}${l1Comment}${refTail}`;
            modifiedText = fileContent.slice(0, extracted.startOffset) +
              inlineMarkup +
              fileContent.slice(extracted.endOffset);
          } else {
            // Substitution
            changeType = 'sub';
            // Strip footnote refs so they don't end up inside CriticMarkup delimiters
            const { cleaned: cleanedExtracted, refs: preservedRefs } = stripRefsFromContent(extracted.content);
            const refTail = preservedRefs.join('');
            const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|sub|proposed<<}` : '';
            const inlineMarkup = level === 2
              ? `{~~${cleanedExtracted}~>${cleanedNewText}~~}[^${changeId}]${refTail}`
              : `{~~${cleanedExtracted}~>${cleanedNewText}~~}${l1Comment}${refTail}`;
            modifiedText = fileContent.slice(0, extracted.startOffset) +
              inlineMarkup +
              fileContent.slice(extracted.endOffset);
          }
        }

        if (level === 2) {
          const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
          const reasonLine = reasoning
            ? `\n    @${author} ${ts.raw}: ${reasoning}`
            : '';
          const footnoteBlock = footnoteHeader + reasonLine;
          const { appendFootnote } = await import('../file-ops.js');
          modifiedText = appendFootnote(modifiedText, footnoteBlock);
        }

        // Compute affected lines for affected region
        const modifiedLines = modifiedText.split('\n');
        const affectedEnd = Math.min(modifiedLines.length, (endLine ?? startLine!) + 5);
        affectedLines = computeAffectedLines(modifiedText, startLine!, affectedEnd, {
          hashlineEnabled: config.hashline.enabled,
        });
      } else {
        // Should not reach here — useAfterLine or useLineRange must be true
        return errorResult(
          'Internal error: hashline mode detected but no valid params.',
          'INTERNAL_ERROR',
        );
      }

    } else if (isNewFile && oldText === '' && !insertAfter) {
      // ─── New file creation (legacy) ─────────────────────────────
      changeType = 'ins';
      const ts = nowTimestamp();
      const authorAt = author.startsWith('@') ? author : `@${author}`;
      const l1Comment = level === 1 ? `{>>${authorAt}|${ts.raw}|ins|proposed<<}` : '';
      const inlineMarkup = level === 2
        ? `{++${newText}++}[^${changeId}]`
        : `{++${newText}++}${l1Comment}`;
      const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
      const reasonLine = reasoning ? `\n    @${author} ${ts.raw}: ${reasoning}` : '';
      const footnoteBlock = footnoteHeader + reasonLine;

      // Ensure parent directory exists for new files
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      modifiedText = level === 2 ? fileContent + inlineMarkup + footnoteBlock : fileContent + inlineMarkup;
    } else {
      // ─── Legacy string match mode ────────────────────────────────

      // Settle-on-demand: if old_text targets text inside accepted/rejected CriticMarkup
      // (i.e., the match only succeeds via the settled-text fallback), settle those
      // constructs first so the proposal operates on clean prose. This preserves the
      // audit trail [^ct-N] refs inline adjacent to the settled text, rather than
      // having them consumed into the new proposal's raw range.
      if (oldText && !insertAfter) {
        const settleResult = settleOnDemandIfNeeded(fileContent, oldText);
        if (settleResult.settled) {
          fileContent = settleResult.content;
          // In-memory only — the final write at step 8 writes the fully-proposed content.
          // No intermediate disk write: if applyProposeChange fails, the file stays unchanged.
        }
      }

      const result = applyProposeChange({
        text: fileContent,
        oldText,
        newText,
        changeId,
        author,
        reasoning,
        insertAfter,
        level,
      });
      modifiedText = result.modifiedText;
      changeType = result.changeType;
    }

    // 7b. Compute affected_lines for non-hashline paths that didn't set it above
    if (!affectedLines && modifiedText) {
      // Find the CriticMarkup in modifiedText to determine affected region
      const modLines = modifiedText.split('\n');
      let matchLine = 1;
      for (let i = 0; i < modLines.length; i++) {
        if (/\{\+\+|\{--|\{~~|\{==/.test(modLines[i])) {
          matchLine = i + 1;
          break;
        }
      }
      // Bounded window: markup line ±2 before, +5 after (includes footnote area)
      const affStart = Math.max(1, matchLine - 2);
      let affEnd = Math.min(modLines.length, matchLine + 5);

      // Extend window to include footnote region if present
      // Footnotes are at the end of the file, marked by [^ct-N]: pattern
      for (let i = modLines.length - 1; i >= affEnd; i--) {
        if (/^\[\^ct-\d+(?:\.\d+)?\]:/.test(modLines[i])) {
          affEnd = modLines.length; // Include entire footnote block
          break;
        }
      }
      affectedLines = computeAffectedLines(modifiedText, affStart, affEnd, {
        hashlineEnabled: config.hashline.enabled,
      });
    }

    // 8. Write back to disk
    await fs.writeFile(filePath, modifiedText, 'utf-8');

    // 8a. Re-record hashes and fingerprint so chained edits don't trigger false staleness warnings
    if (isHashlineMode) {
      await initHashline();
      const rerecordLines = modifiedText.split('\n');
      const allSettledRerecord = rerecordLines.map(l => settledLine(l));
      if (viewResolved === 'changes') {
        // Re-record with committed hashes for chained committed-view edits
        const committedResult = computeCommittedView(modifiedText);
        const newHashes = committedResult.lines.map(cl => ({
          line: cl.committedLineNum,
          raw: computeLineHash(cl.rawLineNum - 1, rerecordLines[cl.rawLineNum - 1], rerecordLines),
          settled: computeSettledLineHash(cl.rawLineNum - 1, rerecordLines[cl.rawLineNum - 1], allSettledRerecord),
          committed: cl.hash,
          rawLineNum: cl.rawLineNum,
        }));
        state.rerecordAfterWrite(filePath, modifiedText, newHashes);
      } else if (viewResolved === 'review') {
        // Review view shows raw line numbers to agents — re-record with raw coordinates
        const newHashes = rerecordLines.map((line, i) => ({
          line: i + 1,
          raw: computeLineHash(i, line, rerecordLines),
          settled: computeSettledLineHash(i, line, allSettledRerecord),
        }));
        state.rerecordAfterWrite(filePath, modifiedText, newHashes);
      } else if (viewResolved === 'settled') {
        // Re-record with settled hashes for chained settled-view edits
        const settledResult = computeSettledView(modifiedText);
        const newHashes = settledResult.lines.map(sl => ({
          line: sl.settledLineNum,
          raw: computeLineHash(sl.rawLineNum - 1, rerecordLines[sl.rawLineNum - 1], rerecordLines),
          settled: computeSettledLineHash(sl.rawLineNum - 1, rerecordLines[sl.rawLineNum - 1], allSettledRerecord),
          settledView: sl.hash,
          rawLineNum: sl.rawLineNum,
        }));
        state.rerecordAfterWrite(filePath, modifiedText, newHashes);
      } else {
        const newHashes = rerecordLines.map((line, i) => ({
          line: i + 1,
          raw: computeLineHash(i, line, rerecordLines),
          settled: computeSettledLineHash(i, line, allSettledRerecord),
        }));
        state.rerecordAfterWrite(filePath, modifiedText, newHashes);
      }
    } else {
      // Non-hashline classic path: still update fingerprint and reset ID counter
      state.rerecordAfterWrite(filePath, modifiedText, []);
    }

    // 9. Build response
    const responseData: Record<string, unknown> = {
      change_id: changeId,
      file: relativePath,
      type: changeType,
      ...(relocations.length > 0 ? { relocated: relocations } : {}),
      ...(remaps.length > 0 ? { remaps } : {}),
      ...(supersededIds.length > 0 ? { superseded: supersededIds } : {}),
    };

    if (affectedLines) {
      responseData.affected_lines = affectedLines;
    }

    if (stalenessWarning) {
      responseData.warning = stalenessWarning;
    }

    const footnoteCount = (modifiedText.match(/^\[\^ct-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
    const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
    const authorMatches = modifiedText.match(/^\[\^ct-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
    const uniqueAuthors = new Set(
      authorMatches.map((m) => m.match(/@([^\s|]+)/)?.[1]).filter(Boolean)
    );
    responseData.document_state = {
      total_changes: footnoteCount,
      proposed: proposedCount,
      accepted: acceptedCount,
      authors: uniqueAuthors.size,
    };

    responseData.state_summary = `📋 ${footnoteCount} tracked change(s) | ${proposedCount} proposed, ${acceptedCount} accepted | ${uniqueAuthors.size} author(s)`;

    return {
      content: [{ type: 'text', text: JSON.stringify(responseData) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg, 'INTERNAL_ERROR');
  }
}

/**
 * Handles raw mode changes: direct text replacement without CriticMarkup wrapping.
 * Policy gate (strict mode rejection) is handled by the caller.
 */
async function handleRawChanges(
  changes: Array<Record<string, unknown>>,
  file: string,
  resolver: ConfigResolver,
  state?: SessionState,
): Promise<ProposeChangeResult> {
  const filePath = resolver.resolveFilePath(file);
  const { projectDir } = await resolver.forFile(filePath);
  const relativePath = toRelativePath(projectDir, filePath);

  let fileContent: string;
  try {
    fileContent = await fs.readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(`File not found or unreadable: ${msg}`, 'FILE_UNREADABLE', {
      file: relativePath,
    });
  }

  let modifiedText = fileContent;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;
    const oldText = (change.old_text as string) ?? '';
    const newText = (change.new_text as string) ?? '';

    if (oldText === '' && newText === '') {
      return errorResult(
        `Raw change ${i}: both old_text and new_text are empty.`,
        'VALIDATION_ERROR',
      );
    }

    if (oldText === '') {
      // Insertion: require an anchor to specify insertion point
      const afterText = (change.after_text as string) ?? (change.insert_after as string) ?? '';
      if (afterText === '') {
        return errorResult(
          `Raw change ${i}: Raw insertion requires after_text to specify insertion point (or use non-empty old_text for replacement).`,
          'VALIDATION_ERROR',
          { file: relativePath },
        );
      }
      const anchorIdx = modifiedText.indexOf(afterText);
      if (anchorIdx === -1) {
        return errorResult(
          `Raw change ${i}: after_text anchor not found in file.`,
          'VALIDATION_ERROR',
          { file: relativePath },
        );
      }
      const insertPos = anchorIdx + afterText.length;
      modifiedText = modifiedText.slice(0, insertPos) + newText + modifiedText.slice(insertPos);
    } else {
      // Replacement: find and replace old_text with new_text
      const idx = modifiedText.indexOf(oldText);
      if (idx === -1) {
        return errorResult(
          `Raw change ${i}: old_text not found in file.`,
          'VALIDATION_ERROR',
          { file: relativePath },
        );
      }
      modifiedText = modifiedText.slice(0, idx) + newText + modifiedText.slice(idx + oldText.length);
    }
  }

  await fs.writeFile(filePath, modifiedText, 'utf-8');

  // Raw edits bypass hashline, so just reset the ID counter and clear cache
  if (state) {
    state.resetFile(filePath);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify({ file: relativePath, raw: true, changes_applied: changes.length }) }],
  };
}

/**
 * Handles compact mode propose_change (at + op parameters).
 * Parses the op string, resolves the at coordinate, and generates CriticMarkup.
 */
async function handleCompactProposeChange(
  args: Record<string, unknown>,
  filePath: string,
  relativePath: string,
  config: import('../config.js').ChangeTracksConfig,
  state: SessionState,
  fileContent: string,
  projectDir: string,
): Promise<ProposeChangeResult> {
  // Reject pre-compact hashline params — `at` supersedes them in compact mode
  if (args.start_line || args.end_line || args.after_line) {
    return errorResult(
      'Use at parameter for line addressing. start_line/end_line/after_line are not supported in compact mode.',
      'DEPRECATED_PARAMS',
    );
  }

  const at = args.at as string;
  const op = args.op as string;

  if (!at || !op) {
    return errorResult('Compact mode requires both "at" and "op" parameters.', 'MISSING_ARGUMENT');
  }

  // Parse the op string
  let parsed: ReturnType<typeof parseOp>;
  try {
    parsed = parseOp(op);
  } catch (err) {
    return errorResult(
      err instanceof Error ? err.message : String(err),
      'VALIDATION_ERROR',
    );
  }

  let fileLines = fileContent.split('\n');

  // Initialize hashline WASM
  await initHashline();

  // ─── View-aware coordinate translation ───────────────────────────────────
  // When the agent read the file in settled or committed view, the `at` string
  // carries view-space line numbers and view-space hashes. resolveAt() works
  // against raw file content, so we must translate before calling it.
  //
  // Strategy:
  //   1. Parse the `at` string with parseAt() to extract line/hash pairs.
  //   2. For each line, call state.resolveHash() to detect the view space and
  //      validate the supplied hash.
  //   3. If the view is settled or committed, map the view-space line number to
  //      the raw line number, recompute the raw hash for that line, and rebuild
  //      the `at` string with raw coordinates.
  //   4. If no session state exists (no prior read), fall through unchanged —
  //      the `at` is assumed to already use raw coordinates.
  let resolvedAt = at;
  // Track which view the agent was working in — used post-write for re-recording
  // hashes in view-space and for projecting affected_lines to view coordinates.
  let compactViewResolved: ViewName | undefined;
  {
    let parsedAtCoord: ReturnType<typeof parseAt>;
    try {
      parsedAtCoord = parseAt(at);
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : String(err),
        'HASHLINE_REFERENCE_UNRESOLVED',
        { file: relativePath },
      );
    }

    const startResolution = state.resolveHash(filePath, parsedAtCoord.startLine, parsedAtCoord.startHash);

    if (startResolution && !startResolution.match) {
      // Hash supplied for start line doesn't match the expected view-space hash
      return errorResult(
        `Hash mismatch at line ${parsedAtCoord.startLine} (${startResolution.view} view): ` +
        `expected ${startResolution.expectedHash}, got ${parsedAtCoord.startHash}. ` +
        `Re-read the file to get fresh coordinates.`,
        'HASHLINE_REFERENCE_UNRESOLVED',
        {
          file: relativePath,
          quick_fix: buildQuickFix(filePath, parsedAtCoord.startLine),
        },
      );
    }

    if (startResolution?.match) {
      compactViewResolved = startResolution.view;

      // Translate start line from view-space to raw-space.
      // This applies to all views (settled, changes, raw, review) —
      // in every case, rawLineNum tells us which raw line the agent addressed,
      // and we must recompute the actual raw hash for resolveAt().
      const rawStartLine = startResolution.rawLineNum;
      if (rawStartLine < 1 || rawStartLine > fileLines.length) {
        return errorResult(
          `Line ${parsedAtCoord.startLine} out of range after view translation (raw line ${rawStartLine}).`,
          'HASHLINE_LINE_OUT_OF_RANGE',
          { file: relativePath },
        );
      }
      const rawStartHash = computeLineHash(rawStartLine - 1, fileLines[rawStartLine - 1], fileLines);

      // Handle end line: if range, translate end too; if single line, both map to rawStartLine
      let rawEndLine = rawStartLine;
      let rawEndHash = rawStartHash;

      if (parsedAtCoord.startLine !== parsedAtCoord.endLine) {
        const endResolution = state.resolveHash(filePath, parsedAtCoord.endLine, parsedAtCoord.endHash);

        if (endResolution && !endResolution.match) {
          return errorResult(
            `Hash mismatch at end line ${parsedAtCoord.endLine} (${endResolution.view} view): ` +
            `expected ${endResolution.expectedHash}, got ${parsedAtCoord.endHash}. ` +
            `Re-read the file to get fresh coordinates.`,
            'HASHLINE_REFERENCE_UNRESOLVED',
            {
              file: relativePath,
              quick_fix: buildQuickFix(filePath, parsedAtCoord.endLine),
            },
          );
        }

        if (endResolution?.match) {
          rawEndLine = endResolution.rawLineNum;
          if (rawEndLine < 1 || rawEndLine > fileLines.length) {
            return errorResult(
              `End line ${parsedAtCoord.endLine} out of range after view translation (raw line ${rawEndLine}).`,
              'HASHLINE_LINE_OUT_OF_RANGE',
              { file: relativePath },
            );
          }
          rawEndHash = computeLineHash(rawEndLine - 1, fileLines[rawEndLine - 1], fileLines);
        }
      }

      // Rebuild `at` with raw coordinates so resolveAt() works correctly
      if (rawStartLine === rawEndLine) {
        resolvedAt = `${rawStartLine}:${rawStartHash}`;
      } else {
        resolvedAt = `${rawStartLine}:${rawStartHash}-${rawEndLine}:${rawEndHash}`;
      }
    }
  }

  // ─── Compact settle-on-demand ────────────────────────────────────────────
  // When the agent reads settled/changes view, accepted CriticMarkup appears
  // as clean text. If the raw file still has unsettled markup at the target,
  // settle in-memory before applying the op.
  {
    const rawCoords = parseAt(resolvedAt);
    const settleResult = settleOnDemandForCompact(fileContent, rawCoords.startLine, rawCoords.endLine);
    if (settleResult.settled) {
      fileContent = settleResult.content;
      fileLines = fileContent.split('\n');
      // Recompute hash for target line(s) in settled content
      const newStartHash = computeLineHash(rawCoords.startLine - 1, fileLines[rawCoords.startLine - 1], fileLines);
      if (rawCoords.startLine === rawCoords.endLine) {
        resolvedAt = `${rawCoords.startLine}:${newStartHash}`;
      } else {
        const newEndHash = computeLineHash(rawCoords.endLine - 1, fileLines[rawCoords.endLine - 1], fileLines);
        resolvedAt = `${rawCoords.startLine}:${newStartHash}-${rawCoords.endLine}:${newEndHash}`;
      }
    }
  }

  // Resolve the at coordinate (against raw file lines)
  let target: ReturnType<typeof resolveAt>;
  try {
    target = resolveAt(resolvedAt, fileLines);
  } catch (err) {
    const { staleLine, currentHash } = extractQuickFixFromError(err);
    return errorResult(
      err instanceof Error ? err.message : String(err),
      'HASHLINE_REFERENCE_UNRESOLVED',
      {
        file: relativePath,
        quick_fix: buildQuickFix(filePath, staleLine, currentHash),
      },
    );
  }

  // Get next ID (scans file for existing ct-N IDs)
  const changeId = state.getNextId(filePath, fileContent);

  // Resolve author
  const { author, error: authorError } = resolveAuthor(
    args.author as string | undefined,
    config,
    'propose_change',
  );
  if (authorError) {
    return errorResult(authorError.message, 'AUTHOR_RESOLUTION_FAILED');
  }

  // Merge reasoning: op {>> suffix takes priority, JSON param is fallback
  const reasoning = parsed.reasoning ?? (args.reason as string | undefined);
  const level = config.protocol?.level ?? 2;

  let modifiedText: string;
  let changeType: 'ins' | 'del' | 'sub' | 'highlight' | 'comment';
  const supersededIds: string[] = [];

  const ts = nowTimestamp();
  const authorAt = author.startsWith('@') ? author : `@${author}`;
  const l1Comment = (ct: string) => level === 1 ? `{>>${authorAt}|${ts.raw}|${ct}|proposed<<}` : '';

  // ─── Auto-supersede same-author overlaps ─────────────────────────────────
  // Check the full target range for overlapping proposed changes. If all
  // overlapping proposals are from the same author, reject+settle them
  // in-memory so the new proposal can be placed cleanly. Different-author
  // overlaps still throw (same behavior as guardOverlap).
  // Insertions don't replace text, so no overlap check needed.
  if (parsed.type !== 'ins' && parsed.type !== 'comment') {
    const supersedeResult = resolveOverlapWithAuthor(
      fileContent, target.startOffset, target.endOffset - target.startOffset, author,
    );
    if (supersedeResult) {
      fileContent = supersedeResult.settledContent;
      fileLines = fileContent.split('\n');
      supersededIds.push(...supersedeResult.supersededIds);
      // Re-resolve target after settlement (offsets shift when markup is settled)
      const rawCoords = parseAt(resolvedAt);
      const newStartHash = computeLineHash(rawCoords.startLine - 1, fileLines[rawCoords.startLine - 1]!, fileLines);
      if (rawCoords.startLine === rawCoords.endLine) {
        resolvedAt = `${rawCoords.startLine}:${newStartHash}`;
      } else {
        const newEndHash = computeLineHash(rawCoords.endLine - 1, fileLines[rawCoords.endLine - 1]!, fileLines);
        resolvedAt = `${rawCoords.startLine}:${newStartHash}-${rawCoords.endLine}:${newEndHash}`;
      }
      target = resolveAt(resolvedAt, fileLines);
    }
  }

  if (parsed.type === 'ins') {
    // Insertion: insert after the target line
    changeType = 'ins';
    const inlineMarkup = level === 2
      ? `{++${parsed.newText}++}[^${changeId}]`
      : `{++${parsed.newText}++}${l1Comment('ins')}`;

    // Insert after the last line of the target range
    const insertPos = fileLines.slice(0, target.endLine).join('\n').length;
    modifiedText = fileContent.slice(0, insertPos) + '\n' + inlineMarkup + fileContent.slice(insertPos);
  } else if (parsed.type === 'del') {
    // Deletion: wrap the matched text in deletion markup
    changeType = 'del';

    if (parsed.oldText === '') {
      // Whole-line or whole-range deletion: empty text after '-' means delete entire target
      guardOverlap(fileContent, target.startOffset, target.endOffset - target.startOffset);
      // Strip footnote refs so they don't end up inside CriticMarkup delimiters
      const { cleaned: cleanedContent, refs: preservedRefs } = stripRefsFromContent(target.content);
      const refTail = preservedRefs.join('');

      const inlineMarkup = level === 2
        ? `{--${cleanedContent}--}[^${changeId}]${refTail}`
        : `{--${cleanedContent}--}${l1Comment('del')}${refTail}`;

      modifiedText = fileContent.slice(0, target.startOffset) + inlineMarkup + fileContent.slice(target.endOffset);
    } else {
      const match = findUniqueMatch(contentZoneText(target.content), parsed.oldText, defaultNormalizer);
      const absPos = target.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const absEnd = absPos + match.length;
      // Strip footnote refs so they don't end up inside CriticMarkup delimiters
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
      const refTail = preservedRefs.join('');

      const inlineMarkup = level === 2
        ? `{--${cleanedOld}--}[^${changeId}]${refTail}`
        : `{--${cleanedOld}--}${l1Comment('del')}${refTail}`;

      modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    }
  } else if (parsed.type === 'sub') {
    // Substitution: wrap the matched text in substitution markup
    changeType = 'sub';

    if (parsed.oldText === '') {
      // Whole-line or whole-range replace: empty left side of ~> means replace entire target
      guardOverlap(fileContent, target.startOffset, target.endOffset - target.startOffset);
      // Strip footnote refs so they don't end up inside CriticMarkup delimiters
      const { cleaned: cleanedContent, refs: preservedRefs } = stripRefsFromContent(target.content);
      const refTail = preservedRefs.join('');

      const inlineMarkup = level === 2
        ? `{~~${cleanedContent}~>${parsed.newText}~~}[^${changeId}]${refTail}`
        : `{~~${cleanedContent}~>${parsed.newText}~~}${l1Comment('sub')}${refTail}`;

      modifiedText = fileContent.slice(0, target.startOffset) + inlineMarkup + fileContent.slice(target.endOffset);
    } else {
      const match = findUniqueMatch(contentZoneText(target.content), parsed.oldText, defaultNormalizer);
      const absPos = target.startOffset + match.index;
      guardOverlap(fileContent, absPos, match.length);
      const absEnd = absPos + match.length;
      // Strip footnote refs so they don't end up inside CriticMarkup delimiters
      const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
      const refTail = preservedRefs.join('');

      const inlineMarkup = level === 2
        ? `{~~${cleanedOld}~>${parsed.newText}~~}[^${changeId}]${refTail}`
        : `{~~${cleanedOld}~>${parsed.newText}~~}${l1Comment('sub')}${refTail}`;

      modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
    }
  } else if (parsed.type === 'comment') {
    // Standalone comment: insert comment markup at end of target line.
    // No text matching needed — appends at the end of the target line.
    changeType = 'comment';
    const commentText = parsed.reasoning ?? '';
    const inlineMarkup = level === 2
      ? `{>>${commentText}<<}[^${changeId}]`
      : `{>>${commentText}<<}${l1Comment('comment')}`;

    // Append at end of the target line (endOffset points to end of line content, before \n)
    modifiedText = fileContent.slice(0, target.endOffset) + inlineMarkup + fileContent.slice(target.endOffset);
  } else {
    // Highlight: wrap target text with highlight markup
    changeType = 'highlight';
    const match = findUniqueMatch(contentZoneText(target.content), parsed.oldText, defaultNormalizer);
    const absPos = target.startOffset + match.index;
    guardOverlap(fileContent, absPos, match.length);
    const absEnd = absPos + match.length;
    // Strip footnote refs so they don't end up inside CriticMarkup delimiters
    const { cleaned: cleanedOld, refs: preservedRefs } = stripRefsFromContent(match.originalText);
    const refTail = preservedRefs.join('');

    const inlineMarkup = level === 2
      ? `{==${cleanedOld}==}[^${changeId}]${refTail}`
      : `{==${cleanedOld}==}${l1Comment('highlight')}${refTail}`;

    modifiedText = fileContent.slice(0, absPos) + inlineMarkup + fileContent.slice(absEnd);
  }

  // Append footnote for level 2
  if (level === 2) {
    const footnoteHeader = generateFootnoteDefinition(changeId, changeType, author);
    // For comments, the text is already inline ({>>text<<}) — don't duplicate it in the footnote.
    const reasonLine = reasoning && changeType !== 'comment'
      ? `\n    @${author} ${ts.raw}: ${reasoning}`
      : '';
    const footnoteBlock = footnoteHeader + reasonLine;
    const { appendFootnote } = await import('../file-ops.js');
    modifiedText = appendFootnote(modifiedText, footnoteBlock);
  }

  // Write to disk
  await fs.writeFile(filePath, modifiedText, 'utf-8');

  // Re-record hashes and fingerprint for staleness detection (initHashline already called above).
  // When the agent was working in settled or changes view, re-record with view-space hashes so
  // chained edits can use the same view coordinates without a re-read.
  const rerecordLines = modifiedText.split('\n');
  const allSettledRerecord = rerecordLines.map(l => settledLine(l));

  let viewProjection: ViewProjection | undefined;

  if (compactViewResolved === 'changes') {
    // Re-record with committed hashes for chained committed-view edits
    const committedResult = computeCommittedView(modifiedText);
    const newHashes = committedResult.lines.map(cl => ({
      line: cl.committedLineNum,
      raw: computeLineHash(cl.rawLineNum - 1, rerecordLines[cl.rawLineNum - 1], rerecordLines),
      settled: computeSettledLineHash(cl.rawLineNum - 1, rerecordLines[cl.rawLineNum - 1], allSettledRerecord),
      committed: cl.hash,
      rawLineNum: cl.rawLineNum,
    }));
    state.rerecordAfterWrite(filePath, modifiedText, newHashes);

    // Build rawToView map for affected_lines projection (changes view)
    const rawToViewMap = new Map<number, { viewLine: number; viewHash: string; viewContent: string }>();
    for (const cl of committedResult.lines) {
      rawToViewMap.set(cl.rawLineNum, {
        viewLine: cl.committedLineNum,
        viewHash: cl.hash,
        viewContent: cl.text,
      });
    }
    viewProjection = { view: 'changes', rawToView: rawToViewMap };
  } else if (compactViewResolved === 'review') {
    // Review view shows raw line numbers to agents — re-record with raw coordinates
    const newHashes = rerecordLines.map((line, i) => ({
      line: i + 1,
      raw: computeLineHash(i, line, rerecordLines),
      settled: computeSettledLineHash(i, line, allSettledRerecord),
    }));
    state.rerecordAfterWrite(filePath, modifiedText, newHashes);
    // No viewProjection needed: review view uses raw line numbers (identity mapping)
  } else if (compactViewResolved === 'settled') {
    // Re-record with settled hashes for chained settled-view edits
    const settledResult = computeSettledView(modifiedText);
    const newHashes = settledResult.lines.map(sl => ({
      line: sl.settledLineNum,
      raw: computeLineHash(sl.rawLineNum - 1, rerecordLines[sl.rawLineNum - 1], rerecordLines),
      settled: computeSettledLineHash(sl.rawLineNum - 1, rerecordLines[sl.rawLineNum - 1], allSettledRerecord),
      settledView: sl.hash,
      rawLineNum: sl.rawLineNum,
    }));
    state.rerecordAfterWrite(filePath, modifiedText, newHashes);

    // Build rawToView map for affected_lines projection (settled view)
    const rawToViewMap = new Map<number, { viewLine: number; viewHash: string; viewContent: string }>();
    for (const sl of settledResult.lines) {
      rawToViewMap.set(sl.rawLineNum, {
        viewLine: sl.settledLineNum,
        viewHash: sl.hash,
        viewContent: sl.text,
      });
    }
    viewProjection = { view: 'settled', rawToView: rawToViewMap };
  } else {
    // Raw view or no session state: record raw hashes
    const newHashes = rerecordLines.map((line, i) => ({
      line: i + 1,
      raw: computeLineHash(i, line, rerecordLines),
      settled: computeSettledLineHash(i, line, allSettledRerecord),
    }));
    state.rerecordAfterWrite(filePath, modifiedText, newHashes);
  }

  // Build response
  const footnoteCount = (modifiedText.match(/^\[\^ct-\d+(?:\.\d+)?\]:/gm) || []).length;
  const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
  const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
  const authorMatches = modifiedText.match(/^\[\^ct-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
  const uniqueAuthors = new Set(
    authorMatches.map((m) => m.match(/@([^\s|]+)/)?.[1]).filter(Boolean)
  );

  const responseData: Record<string, unknown> = {
    change_id: changeId,
    file: relativePath,
    type: changeType,
    ...(supersededIds.length > 0 ? { superseded: supersededIds } : {}),
    document_state: {
      total_changes: footnoteCount,
      proposed: proposedCount,
      accepted: acceptedCount,
      authors: uniqueAuthors.size,
    },
    state_summary: `\u{1F4CB} ${footnoteCount} tracked change(s) | ${proposedCount} proposed, ${acceptedCount} accepted | ${uniqueAuthors.size} author(s)`,
  };

  // Compute affected lines — in view-space when the agent used a non-raw view
  const affectedLines = computeAffectedLines(modifiedText, target.startLine, target.endLine, {
    hashlineEnabled: config.hashline.enabled,
    viewProjection,
  });
  responseData.affected_lines = affectedLines;

  return {
    content: [{ type: 'text', text: JSON.stringify(responseData) }],
  };
}

function errorResult(
  message: string,
  code: ProposeChangeErrorCode,
  details?: Record<string, unknown>,
): ProposeChangeResult {
  // Extract quick_fix from details so it lives at top level, not inside error
  const quickFix = details?.quick_fix as Record<string, unknown> | undefined;
  const errorDetails = details ? { ...details } : undefined;
  if (errorDetails) {
    delete errorDetails.quick_fix;
  }

  const payload: Record<string, unknown> = {
    error: {
      code,
      message,
      ...(errorDetails ?? {}),
    },
  };

  // Add quick_fix at top level for machine-parseable recovery
  if (quickFix) {
    payload.quick_fix = quickFix;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: true,
  };
}
