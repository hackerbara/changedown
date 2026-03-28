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
  defaultNormalizer,
  CriticMarkupParser,
  ChangeStatus,
  settleAcceptedChangesOnly,
  settleRejectedChangesOnly,
  reviewerType,
} from '@changedown/core';
import { validateOrAutoRemap, type RelocationEntry, type AutoRemapResult } from './hashline-relocate.js';
import { HashlineMismatchError } from '@changedown/core';
import { handleProposeBatch } from './propose-batch.js';
import { computeAffectedLines, type AffectedLineEntry, type ViewProjection } from './propose-utils.js';
import { resolveAuthor } from '../author.js';
import { ConfigResolver } from '../config-resolver.js';
import { strArg, optionalStrArg } from '../args.js';
import { applyProposeChange, contentZoneText, extractLineRange, findUniqueMatch, resolveOverlapWithAuthor, stripRefsFromContent } from '../file-ops.js';
import { toRelativePath } from '../path-utils.js';
import { resolveTrackingStatus } from '../scope.js';
import { SessionState, type ViewName } from '../state.js';
import { parseOp, nowTimestamp } from '@changedown/core';
import { resolveProtocolMode } from '../config.js';
import { rerecordState } from '../state-utils.js';
import { resolveAndApply, type NormalizedCompactOp } from './resolve-and-apply.js';
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
  | 'REASONING_REQUIRED'
  | 'VALIDATION_ERROR'
  | 'PROTOCOL_MODE_MISMATCH'
  | 'DEPRECATED_PARAMS'
  | 'INTERNAL_ERROR';

function checkReasoningRequired(
  author: string,
  reasoning: string | undefined,
  config: { reasoning?: { propose?: { human?: boolean; agent?: boolean } } },
  compact: boolean,
): ProposeChangeResult | null {
  const participantType = reviewerType(author);
  if (!config.reasoning?.propose?.[participantType]) return null;
  if (reasoning) return null;
  const hint = compact
    ? 'Append {>>reason to your op string, or include a reason parameter in your propose_change call.'
    : 'Include a reason parameter in your propose_change call.';
  return errorResult(`This project requires reasoning on proposals. ${hint}`, 'REASONING_REQUIRED');
}

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
      // Same partial semantics as propose_batch: all failures reported, not just the first.
      const batchArgs: Record<string, unknown> = {
        file: args.file,
        reason: args.reason,
        author: args.author,
        changes: changesArray,
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
      const strippedOld = oldText.replace(/\[\^?cn-\d+(?:\.\d+)?\]/g, '').trim();
      const strippedNew = newText.replace(/\[\^?cn-\d+(?:\.\d+)?\]/g, '').trim();
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
        'Hashline addressing requires [hashline] enabled = true in .changedown/config.toml',
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
      return await handleCompactProposeChange(args, filePath, relativePath, config, state, fileContent);
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
        }
        // If view resolution failed (match: false) or no session state (undefined),
        // fall through to downstream validateOrRelocate which scans the actual file.
      }

      if (endLine !== undefined && endHash !== undefined) {
        const resolved = state.resolveHash(filePath, endLine, endHash);
        if (resolved?.match === true) {
          endLine = resolved.rawLineNum;
          viewResolved = viewResolved ?? resolved.view;
        }
        // Same: fall through on mismatch — let file-based relocation handle it.
      }

      if (afterLine !== undefined && afterHash !== undefined) {
        const resolved = state.resolveHash(filePath, afterLine, afterHash);
        if (resolved?.match === true) {
          afterLine = resolved.rawLineNum;
          viewResolved = viewResolved ?? resolved.view;
        }
        // Same: fall through on mismatch.
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

    // 7. Reasoning enforcement check
    const reasoningError = checkReasoningRequired(author!, reasoning, config, false);
    if (reasoningError) return reasoningError;

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
        try {
          affectedLines = computeAffectedLines(modifiedText, affectedStart, affectedEnd, {
            hashlineEnabled: config.hashline.enabled,
          });
        } catch {
          affectedLines = [];
        }

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
        try {
          affectedLines = computeAffectedLines(modifiedText, startLine!, affectedEnd, {
            hashlineEnabled: config.hashline.enabled,
          });
        } catch {
          affectedLines = [];
        }
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
      // audit trail [^cn-N] refs inline adjacent to the settled text, rather than
      // having them consumed into the new proposal's raw range.
      if (oldText && !insertAfter) {
        const settleResult = settleOnDemandIfNeeded(fileContent, oldText);
        if (settleResult.settled) {
          fileContent = settleResult.content;
          // In-memory only — the final write at step 8 writes the fully-proposed content.
          // No intermediate disk write: if applyProposeChange fails, the file stays unchanged.
        }
      }

      const result = await applyProposeChange({
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
      // Bounded window: markup line ±2 before, +5 after
      const affStart = Math.max(1, matchLine - 2);
      const affEnd = Math.min(modLines.length, matchLine + 5);
      try {
        affectedLines = computeAffectedLines(modifiedText, affStart, affEnd, {
          hashlineEnabled: config.hashline.enabled,
        });
      } catch {
        affectedLines = [];
      }
    }

    // 8. Write back to disk
    await fs.writeFile(filePath, modifiedText, 'utf-8');

    // 8a. Re-record hashes and fingerprint so chained edits don't trigger false staleness warnings
    await rerecordState(state, filePath, modifiedText, config);

    // 9. Build response
    const responseData: Record<string, unknown> = {
      change_id: changeId,
      file: relativePath,
      type: changeType,
      ...(relocations.length > 0 ? { relocated: relocations } : {}),
      ...(remaps.length > 0 ? { remaps } : {}),
      ...(supersededIds.length > 0 ? { superseded: supersededIds } : {}),
    };

    if (affectedLines && config.response?.affected_lines) {
      responseData.affected_lines = affectedLines;
    }

    if (stalenessWarning) {
      responseData.warning = stalenessWarning;
    }

    const footnoteCount = (modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
    const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
    const authorMatches = modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
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
  config: import('../config.js').ChangeDownConfig,
  state: SessionState,
  fileContent: string,
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

  // Get next ID (scans file for existing cn-N IDs)
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

  // Reasoning enforcement check
  const reasoningError = checkReasoningRequired(author!, reasoning, config, true);
  if (reasoningError) return reasoningError;

  let modifiedText: string;
  let changeType: 'ins' | 'del' | 'sub' | 'highlight' | 'comment';
  const supersededIds: string[] = [];
  // ─── Resolve coordinates and apply markup via pipeline ───────────────────
  let applyResult: ReturnType<typeof resolveAndApply>;
  try {
    const op: NormalizedCompactOp = {
      at,
      type: parsed.type,
      oldText: parsed.oldText,
      newText: parsed.newText,
      reasoning,
    };
    applyResult = resolveAndApply(
      op, fileContent, fileLines, state, filePath, config, changeId, author!,
    );
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

  modifiedText = applyResult.modifiedText;
  changeType = applyResult.changeType;
  supersededIds.push(...applyResult.supersededIds);
  // Update fileContent and fileLines so re-recording block uses modified content
  fileContent = applyResult.modifiedText;
  fileLines = fileContent.split('\n');

  // Write to disk
  await fs.writeFile(filePath, modifiedText, 'utf-8');

  // Re-record hashes and fingerprint for staleness detection.
  const viewResult = await rerecordState(state, filePath, modifiedText, config);

  // Build viewProjection from returned view result (no double computation)
  let viewProjection: ViewProjection | undefined;
  if (viewResult?.settledView) {
    const rawToViewMap = new Map<number, { viewLine: number; viewHash: string; viewContent: string }>();
    for (const sl of viewResult.settledView.lines) {
      rawToViewMap.set(sl.rawLineNum, { viewLine: sl.settledLineNum, viewHash: sl.hash, viewContent: sl.text });
    }
    viewProjection = { view: 'settled', rawToView: rawToViewMap };
  } else if (viewResult?.committedView) {
    const rawToViewMap = new Map<number, { viewLine: number; viewHash: string; viewContent: string }>();
    for (const cl of viewResult.committedView.lines) {
      rawToViewMap.set(cl.rawLineNum, { viewLine: cl.committedLineNum, viewHash: cl.hash, viewContent: cl.text });
    }
    viewProjection = { view: 'changes', rawToView: rawToViewMap };
  }

  // Build response
  const footnoteCount = (modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
  const proposedCount = (modifiedText.match(/\|\s*proposed\s*$/gm) || []).length;
  const acceptedCount = (modifiedText.match(/\|\s*accepted\s*$/gm) || []).length;
  const authorMatches = modifiedText.match(/^\[\^cn-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
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
  let affectedLines: AffectedLineEntry[] = [];
  try {
    affectedLines = computeAffectedLines(modifiedText, applyResult.affectedStartLine, applyResult.affectedEndLine, {
      hashlineEnabled: config.hashline.enabled,
      viewProjection,
    });
  } catch {
    // Degrade gracefully: return response without affected_lines rather than failing after successful write
  }
  if (affectedLines && config.response?.affected_lines) {
    responseData.affected_lines = affectedLines;
  }

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
