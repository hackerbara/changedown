import * as fs from 'node:fs/promises';
import {
  initHashline,
  defaultNormalizer,
  parseTrackingHeader,
  insertTrackingHeader,
  generateFootnoteDefinition,
  scanMaxCtId,
  nowTimestamp,
  findFootnoteBlockStart,
} from '@changetracks/core';
import { validateOrAutoRemap, type RelocationEntry, type AutoRemapResult } from './hashline-relocate.js';
import { resolveCoordinates, applyCompactOp, type NormalizedCompactOp, type ResolvedCoordinates } from './resolve-and-apply.js';
import { resolveAuthor } from '../author.js';
import { ConfigResolver } from '../config-resolver.js';
import { strArg, optionalStrArg } from '../args.js';
import { applySingleOperation, extractLineRange, findUniqueMatch, appendFootnote } from '../file-ops.js';
import { computeAffectedLines, type AffectedLineEntry } from './propose-utils.js';
import { toRelativePath } from '../path-utils.js';
import { resolveTrackingStatus } from '../scope.js';
import { SessionState } from '../state.js';
import { parseOp, parseAt } from '@changetracks/core';
import { resolveProtocolMode } from '../config.js';
import { rerecordState } from '../state-utils.js';

/**
 * Tool definition for the propose_batch MCP tool.
 * One conceptual edit: ordered array of edits against one file, applied atomically
 * with server-managed coordinate adjustment and an auto-created change group.
 */
export const proposeBatchTool = {
  name: 'propose_batch',
  description:
    'Propose a batch of tracked changes to a single markdown file as one atomic edit. ' +
    'Use for 3+ related edits in one file: server applies all-or-nothing, adjusts line refs automatically, ' +
    'and creates one change group. One call = one conceptual edit (ADR-036).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      reason: {
        type: 'string',
        description: 'Why this batch of changes is being made. Optional but encouraged.',
      },
      author: {
        type: 'string',
        description:
          'Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement.',
      },
      changes: {
        type: 'array',
        description: 'Ordered list of operations; each has same shape as propose_change.',
        items: {
          type: 'object',
          properties: {
            old_text: { type: 'string', description: 'Text to replace (classic mode only)' },
            new_text: { type: 'string', description: 'Replacement text (classic mode only)' },
            reason: { type: 'string', description: 'Annotation for the change' },
            insert_after: { type: 'string', description: 'Anchor text for insertion (classic mode only)' },
            start_line: { type: 'number', description: 'Start line number (classic mode only)' },
            start_hash: { type: 'string', description: 'Start line hash (classic mode only)' },
            end_line: { type: 'number', description: 'End line number (classic mode only)' },
            end_hash: { type: 'string', description: 'End line hash (classic mode only)' },
            after_line: { type: 'number', description: 'Line number for insertion (classic mode only)' },
            after_hash: { type: 'string', description: 'Line hash for insertion (classic mode only)' },
            at: { type: 'string', description: 'Hashline coordinate (compact mode)' },
            op: { type: 'string', description: 'Operation expression (compact mode)' },
          },
        },
      },
    },
    required: ['file', 'changes'],
  },
};

export interface ProposeBatchResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface BatchOperation {
  index: number;
  old_text: string;
  new_text: string;
  reason?: string;
  insert_after?: string;
  start_line?: number;
  start_hash?: string;
  end_line?: number;
  end_hash?: string;
  after_line?: number;
  after_hash?: string;
}

function errorResult(message: string, details?: Record<string, unknown>): ProposeBatchResult {
  const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: message }];
  if (details) {
    content.push({ type: 'text', text: JSON.stringify({ error: { message, ...details } }) });
  }
  return { content, isError: true };
}

function hasHashlineParams(op: Record<string, unknown>): boolean {
  return (
    op.start_line !== undefined ||
    op.start_hash !== undefined ||
    op.after_line !== undefined ||
    op.after_hash !== undefined
  );
}

/** Number of content lines in the document body (excluding trailing blank
 *  separator lines and the footnote block at the end). This is critical for
 *  accurate delta calculation: appending a footnote adds a blank separator +
 *  footnote definition, but those must NOT inflate the body line count or
 *  subsequent ops will target wrong lines. */
function bodyLineCount(text: string): number {
  const lines = text.split('\n');
  let bodyEnd = findFootnoteBlockStart(lines);
  // Skip trailing blank lines between body and footnote block
  while (bodyEnd > 0 && lines[bodyEnd - 1]!.trim() === '') bodyEnd--;
  return bodyEnd;
}

/**
 * Handles a propose_batch tool call.
 * Validation pass: all-or-nothing gate; no write to disk until Task 3.
 */
export async function handleProposeBatch(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState,
): Promise<ProposeBatchResult> {
  try {
    // 1. Extract and validate top-level args
    const file = args.file as string | undefined;
    const reasoning = args.reason as string | undefined;
    let changesRaw: unknown = args.changes;

    if (!file) {
      return errorResult('Missing required argument: "file"');
    }

    // Gracefully handle string-encoded changes arrays (common cross-model serialization)
    if (typeof changesRaw === 'string') {
      try {
        const parsed: unknown = JSON.parse(changesRaw);
        if (Array.isArray(parsed)) {
          changesRaw = parsed;
        } else {
          return errorResult(
            'The "changes" parameter was received as a JSON string but parsed to ' +
            `${typeof parsed}, not an array. Send changes as a JSON array of objects.`,
          );
        }
      } catch {
        return errorResult(
          'The "changes" parameter was received as a string but could not be parsed as JSON. ' +
          'Send changes as a JSON array of objects.',
        );
      }
    }

    if (!Array.isArray(changesRaw) || changesRaw.length === 0) {
      return errorResult('changes must be a non-empty array.');
    }

    const MAX_BATCH_SIZE = 100;
    if (changesRaw.length > MAX_BATCH_SIZE) {
      return errorResult(`Batch too large: ${changesRaw.length} changes exceeds maximum of ${MAX_BATCH_SIZE}. Split into smaller batches.`);
    }

    // Validate that each element is a non-null object with at least one edit param
    for (let i = 0; i < changesRaw.length; i++) {
      const elem = changesRaw[i];
      if (elem === null || elem === undefined || typeof elem !== 'object' || Array.isArray(elem)) {
        return errorResult(
          `changes[${i}] must be an object, got ${elem === null ? 'null' : Array.isArray(elem) ? 'array' : typeof elem}.`,
        );
      }
    }

    // 2. Resolve file path and check tracking
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);
    const relativePath = toRelativePath(projectDir, filePath);
    const trackingStatus = await resolveTrackingStatus(filePath, config, projectDir);

    if (trackingStatus.status !== 'tracked') {
      return errorResult(
        `File is not tracked for propose_batch: "${filePath}".`,
        { file: relativePath, tracking_status: trackingStatus },
      );
    }

    // 3. If manual group is active, error
    if (state.hasActiveGroup()) {
      return errorResult(
        'End your current change group before calling propose_batch.',
      );
    }

    // 4. Read file from disk
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`, { file: relativePath });
    }

    // 5. Resolve author
    const { author, error: authorError } = resolveAuthor(
      args.author as string | undefined,
      config,
      'propose_batch',
    );
    if (authorError) {
      return errorResult(authorError.message);
    }

    // Auto-insert tracking header if needed.
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

    // 5b. Resolve protocol mode (env override > config)
    const protocolMode = resolveProtocolMode(config.protocol?.mode ?? 'classic');

    // Detect whether any op in the batch uses compact params (at/op)
    const hasCompactOpsInBatch = changesRaw.some(
      (op: Record<string, unknown>) => typeof op.at === 'string' || typeof op.op === 'string',
    );

    // Protocol mode gate: reject compact ops in classic mode and vice versa
    if (protocolMode === 'classic' && hasCompactOpsInBatch) {
      return errorResult(
        'Protocol mode is "classic" but batch contains compact params (at/op). ' +
        'Use old_text/new_text instead, or set protocol.mode = "compact" in config.',
      );
    }

    if (protocolMode === 'compact' && !hasCompactOpsInBatch) {
      // Classic params in compact mode — check if any op has old_text/new_text
      const hasClassicOpsInBatch = changesRaw.some(
        (op: Record<string, unknown>) =>
          (typeof op.old_text === 'string' && op.old_text !== '') ||
          (typeof op.new_text === 'string' && op.new_text !== ''),
      );
      if (hasClassicOpsInBatch) {
        return errorResult(
          'Protocol mode is "compact" but batch contains classic params (old_text/new_text). ' +
          'Use at/op instead, or set protocol.mode = "classic" in config.',
        );
      }
    }

    // 5c. Atomic vs partial: when atomic=true (e.g. propose_change changes array), all-or-nothing.
    // When atomic=false/undefined (e.g. propose_batch tool), partial success is allowed.
    const partial = args.atomic !== true;

    // Track per-operation validation failures for partial mode.
    // Keyed by original index in changesRaw. Structural errors (missing file,
    // bad author, etc.) still fail the whole batch regardless of partial flag.
    const validationFailures: Array<{ index: number; reason: string }> = [];

    // 6. Validate each operation and build resolved ops (relocated line numbers)
    const fileLines = fileContent.split('\n');
    const relocations: RelocationEntry[] = [];
    const remaps: AutoRemapResult[] = [];
    const autoRemap = config.hashline.auto_remap ?? true;
    const hasHashlineInBatch = changesRaw.some((op: Record<string, unknown>) => hasHashlineParams(op));
    if (hasHashlineInBatch && !config.hashline.enabled) {
      return errorResult(
        'Hashline addressing in batch requires [hashline] enabled = true in .changetracks/config.toml',
        { file: relativePath },
      );
    }
    if (hasHashlineInBatch) {
      await initHashline();
    }

    // Compact mode always uses hashline coordinates via `at`
    if (hasCompactOpsInBatch) {
      await initHashline();
    }

    interface ResolvedOp {
      oldText: string;
      newText: string;
      reason?: string;
      insertAfter?: string;
      afterLine?: number;
      startLine?: number;
      endLine?: number;
    }
    const resolvedOps: ResolvedOp[] = [];

    // Compact-mode resolved data keyed by original op index.
    // Stored separately so the apply loop can dispatch to applyCompactOp
    // instead of applySingleOperation for compact-path operations.
    const compactResolvedMap = new Map<number, { resolved: ResolvedCoordinates; compactOp: NormalizedCompactOp }>();

    // Track positions of each change in the original file for overlap detection.
    // Insertions (afterLine with empty oldText) are excluded from overlap checks
    // because they insert new content rather than targeting existing text.
    interface BatchPosition {
      index: number;        // original index in changes array
      startOffset: number;  // byte offset in original file content
      endOffset: number;    // byte offset (exclusive) in original file content
    }
    const batchPositions: BatchPosition[] = [];

    // Use a class to signal per-operation validation failures in partial mode.
    // Thrown inside the validation loop body, caught by the partial-mode wrapper.
    class OpValidationError extends Error {
      constructor(message: string) { super(message); }
    }

    // Set of indices that failed validation (partial mode only).
    // Used to skip these operations during application and overlap detection.
    const skippedIndices = new Set<number>();

    for (let i = 0; i < changesRaw.length; i++) {
      // In partial mode, wrap the entire per-operation validation in try/catch.
      // On failure, record and continue instead of aborting the whole batch.
      try {

      const op = changesRaw[i] as Record<string, unknown>;

      // ─── Compact mode: use resolveCoordinates pipeline ──────────
      if (protocolMode === 'compact' && (typeof op.at === 'string' || typeof op.op === 'string')) {
        if (!op.at || !op.op) {
          throw new OpValidationError(`Operation ${i}: compact mode requires both "at" and "op".`);
        }

        let parsedOp: ReturnType<typeof parseOp>;
        try {
          parsedOp = parseOp(op.op as string);
        } catch (err) {
          throw new OpValidationError(
            `Operation ${i}: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        const opReasoning = parsedOp.reasoning ?? (op.reason as string | undefined);

        // Adjust the `at` coordinate for auto-header line shift.
        // read_tracked_file shows the file without the header, so the agent's
        // coordinates must be shifted to match the header-inserted content.
        let adjustedAt = op.at as string;
        if (headerLineDelta > 0) {
          // Parse → shift line numbers → reserialize as "startLine:startHash" or
          // "startLine:startHash-endLine:endHash". Hashes are not recomputed here
          // because they haven't changed — the file content is the same, only line
          // numbers differ. resolveCoordinates handles hash validation/remap.
          const atParsed = parseAt(adjustedAt);
          if (atParsed.startLine === atParsed.endLine) {
            adjustedAt = `${atParsed.startLine + headerLineDelta}:${atParsed.startHash}`;
          } else {
            adjustedAt = `${atParsed.startLine + headerLineDelta}:${atParsed.startHash}-${atParsed.endLine + headerLineDelta}:${atParsed.endHash}`;
          }
        }

        const compactOp: NormalizedCompactOp = {
          at: adjustedAt,
          type: parsedOp.type,
          oldText: parsedOp.oldText,
          newText: parsedOp.newText,
          reasoning: opReasoning,
        };

        // Validate via the unified pipeline (stages 1-3: parse → view-aware
        // translation → auto-relocation). Throws on hash mismatch or out-of-range.
        let resolved: ResolvedCoordinates;
        try {
          resolved = resolveCoordinates(compactOp, fileContent, fileLines, state, filePath, config);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new OpValidationError(`Operation ${i}: ${message}`);
        }

        // Accumulate relocations/remaps from the resolved result
        relocations.push(...resolved.relocations);
        remaps.push(...resolved.remaps);

        // Store for the apply phase
        compactResolvedMap.set(i, { resolved, compactOp });

        // Push a sentinel ResolvedOp so indices stay aligned with changesRaw.
        // startLine is set so the sort order in the apply loop is correct.
        resolvedOps.push({
          oldText: parsedOp.oldText,
          newText: parsedOp.newText,
          reason: opReasoning,
          startLine: resolved.rawStartLine,
          endLine: resolved.rawEndLine,
        });

        // Record position for overlap detection using resolved character offsets.
        // Insertions are excluded — they insert new content, not targeting existing text.
        if (parsedOp.type !== 'ins') {
          batchPositions.push({
            index: i,
            startOffset: resolved.startOffset,
            endOffset: resolved.endOffset,
          });
        }

        continue; // Skip classic param extraction below
      }

      // ─── Classic mode: extract old_text/new_text ─────────────────
      const oldText = strArg(op, 'old_text', 'oldText');
      const newText = strArg(op, 'new_text', 'newText');
      const opReasoning = op.reason as string | undefined;
      const insertAfter = optionalStrArg(op, 'insert_after', 'insertAfter');

      if (oldText === '' && newText === '') {
        throw new OpValidationError(`Operation ${i}: both old_text and new_text are empty.`);
      }

      const resolved: ResolvedOp = { oldText, newText, reason: opReasoning, insertAfter };

      if (hasHashlineParams(op)) {
        let afterLine = op.after_line as number | undefined;
        const afterHash = op.after_hash as string | undefined;
        let startLine = op.start_line as number | undefined;
        const startHash = op.start_hash as string | undefined;
        let endLine = op.end_line as number | undefined;
        const endHash = op.end_hash as string | undefined;

        // Adjust for auto-header line shift
        if (headerLineDelta > 0) {
          if (afterLine !== undefined) afterLine += headerLineDelta;
          if (startLine !== undefined) startLine += headerLineDelta;
          if (endLine !== undefined) endLine += headerLineDelta;
        }

        if (afterLine !== undefined && afterHash !== undefined) {
          try {
            const afterResult = validateOrAutoRemap(
              { line: afterLine, hash: afterHash },
              fileLines,
              'after_line',
              relocations,
              autoRemap,
            );
            resolved.afterLine = afterResult.line;
            if (afterResult.remap) remaps.push(afterResult.remap);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OpValidationError(message);
          }
        }
        if (startLine !== undefined && startHash !== undefined) {
          try {
            const startResult = validateOrAutoRemap(
              { line: startLine, hash: startHash! },
              fileLines,
              'start_line',
              relocations,
              autoRemap,
            );
            resolved.startLine = startResult.line;
            if (startResult.remap) remaps.push(startResult.remap);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OpValidationError(message);
          }
          resolved.endLine = endLine ?? resolved.startLine!;
          if (resolved.endLine !== resolved.startLine! && endHash !== undefined) {
            try {
              const endResult = validateOrAutoRemap(
                { line: resolved.endLine, hash: endHash },
                fileLines,
                'end_line',
                relocations,
                autoRemap,
              );
              resolved.endLine = endResult.line;
              if (endResult.remap) remaps.push(endResult.remap);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              throw new OpValidationError(message);
            }
          }

          // Record position for overlap detection (hashline line-range)
          if (oldText !== '') {
            try {
              const rangeResult = extractLineRange(fileLines, resolved.startLine!, resolved.endLine!);
              const match = findUniqueMatch(rangeResult.content, oldText, defaultNormalizer);
              batchPositions.push({
                index: i,
                startOffset: rangeResult.startOffset + match.index,
                endOffset: rangeResult.startOffset + match.index + match.length,
              });
            } catch (err) {
              console.error(`[changetracks] overlap detection: match failed, deferring to apply phase: ${err}`);
            }
          } else {
            const rangeResult = extractLineRange(fileLines, resolved.startLine!, resolved.endLine!);
            batchPositions.push({
              index: i,
              startOffset: rangeResult.startOffset,
              endOffset: rangeResult.endOffset,
            });
          }
        }
      } else if (oldText !== '') {
        try {
          const match = findUniqueMatch(fileContent, oldText, defaultNormalizer);
          // Record position for overlap detection
          batchPositions.push({
            index: i,
            startOffset: match.index,
            endOffset: match.index + match.length,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new OpValidationError(message);
        }
      }
      resolvedOps.push(resolved);

      } catch (validationErr: unknown) {
        // Per-operation validation failure
        if (partial && validationErr instanceof OpValidationError) {
          const msg = validationErr.message;
          validationFailures.push({ index: i, reason: msg });
          skippedIndices.add(i);
          // Push a placeholder into resolvedOps so indices stay aligned with changesRaw
          resolvedOps.push({ oldText: '', newText: '', reason: undefined });
          continue;
        }
        // Non-partial mode or non-validation error: propagate as before
        if (validationErr instanceof OpValidationError) {
          return errorResult(validationErr.message, {
            operation_index: i, total_operations: changesRaw.length,
          });
        }
        throw validationErr;
      }
    }

    // 6b. Detect overlapping changes in the batch before applying any.
    // Two changes overlap if their matched regions in the original file intersect.
    // Applying overlapping changes sequentially would corrupt the document because
    // the second change's position shifts after the first is applied.
    // In partial mode, exclude positions from skipped (validation-failed) ops.
    const activeBatchPositions = partial
      ? batchPositions.filter((p) => !skippedIndices.has(p.index))
      : batchPositions;
    if (activeBatchPositions.length >= 2) {
      const sorted = [...activeBatchPositions].sort((a, b) =>
        a.startOffset !== b.startOffset ? a.startOffset - b.startOffset : a.endOffset - b.endOffset
      );
      for (let j = 0; j < sorted.length - 1; j++) {
        const curr = sorted[j]!;
        const next = sorted[j + 1]!;
        if (curr.endOffset > next.startOffset) {
          return errorResult(
            `Batch changes overlap: operation ${curr.index} (offsets ${curr.startOffset}-${curr.endOffset}) ` +
            `and operation ${next.index} (offsets ${next.startOffset}-${next.endOffset}) target overlapping text. ` +
            `Split into separate propose_change calls or adjust old_text to non-overlapping regions.`,
            {
              overlapping_operations: [curr.index, next.index],
              total_operations: changesRaw.length,
            },
          );
        }
      }
    }

    // 6c. In partial mode, if ALL operations failed validation, return error now
    if (partial && skippedIndices.size === changesRaw.length) {
      return errorResult('All operations failed in partial batch.', {
        failed: validationFailures,
        total_operations: changesRaw.length,
      });
    }

    // 7. Begin group and apply operations in order with coordinate adjustment
    const knownMaxId = scanMaxCtId(fileContent);
    const groupId = state.beginGroup(reasoning ?? 'propose_batch', reasoning, knownMaxId);
    let currentText = fileContent;
    let cumulativeDelta = 0;
    const results: Array<{ change_id: string; type: 'ins' | 'del' | 'sub' | 'highlight' | 'comment'; index: number; startLine?: number; endLine?: number }> = [];
    // Application-phase failures (partial mode)
    const applicationFailures: Array<{ index: number; reason: string }> = [];

    // Sort operations by target line (ascending) so cumulativeDelta
    // accumulates correctly — insertions at earlier lines only affect
    // later operations. Preserves original index for error reporting.
    const sortedOps = resolvedOps
      .map((op, originalIndex) => ({ op, originalIndex }))
      .sort((a, b) => {
        const lineA = a.op.startLine ?? a.op.afterLine ?? 0;
        const lineB = b.op.startLine ?? b.op.afterLine ?? 0;
        return lineA - lineB;
      });

    for (let i = 0; i < sortedOps.length; i++) {
      const { op, originalIndex } = sortedOps[i]!;

      // Skip operations that already failed validation in partial mode
      if (skippedIndices.has(originalIndex)) {
        continue;
      }

      try {
        const changeId = state.getNextId(filePath, currentText);
        const delta = cumulativeDelta;

        const compactEntry = compactResolvedMap.get(originalIndex);
        if (compactEntry) {
          // ─── Compact path: use applyCompactOp (stages 4-7) ──────
          // Adjust raw line numbers by the cumulative delta from earlier ops so
          // applyCompactOp targets the correct lines in the evolved currentText.
          // Note: startOffset/endOffset from the spread are stale (from validation
          // pass against original content), but applyCompactOp rebuilds fresh
          // offsets from rawStartLine/rawEndLine via resolveAt against currentText.
          const adjustedResolved: ResolvedCoordinates = {
            ...compactEntry.resolved,
            rawStartLine: compactEntry.resolved.rawStartLine + delta,
            rawEndLine: compactEntry.resolved.rawEndLine + delta,
          };
          const currentLines = currentText.split('\n');
          const applied = applyCompactOp(
            adjustedResolved,
            compactEntry.compactOp,
            currentText,
            currentLines,
            changeId,
            author!,
            config,
          );

          const linesAfter = bodyLineCount(applied.modifiedText);
          const linesBeforeBody = bodyLineCount(currentText);
          cumulativeDelta += linesAfter - linesBeforeBody;
          currentText = applied.modifiedText;
          results.push({
            change_id: changeId,
            type: applied.changeType,
            index: originalIndex,
            startLine: applied.affectedStartLine,
            endLine: applied.affectedEndLine,
          });
        } else {
          // ─── Classic path: use applySingleOperation ──────────────
          const adjAfter = op.afterLine !== undefined ? op.afterLine + delta : undefined;
          const adjStart = op.startLine !== undefined ? op.startLine + delta : undefined;
          const adjEnd = op.endLine !== undefined ? op.endLine + delta : undefined;

          if ((op.afterLine !== undefined || op.startLine !== undefined) && adjStart === undefined && adjAfter === undefined) {
            throw new Error(`Operation ${originalIndex}: hashline params require after_line or start_line.`);
          }

          const applied = await applySingleOperation({
            fileContent: currentText,
            oldText: op.oldText,
            newText: op.newText,
            changeId,
            author: author!,
            reasoning: op.reason,
            insertAfter: op.insertAfter,
            afterLine: adjAfter,
            startLine: adjStart,
            endLine: adjEnd,
          });

          const linesAfter = bodyLineCount(applied.modifiedText);
          const linesBeforeBody = bodyLineCount(currentText);
          cumulativeDelta += linesAfter - linesBeforeBody;
          currentText = applied.modifiedText;
          results.push({
            change_id: changeId,
            type: applied.changeType,
            index: originalIndex,
            startLine: applied.affectedStartLine,
            endLine: applied.affectedEndLine,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!partial) {
          // All-or-nothing: clean up and return error immediately
          state.endGroup();
          return errorResult(
            `Operation ${originalIndex}: ${msg}`,
            { phase: 'application', operation_index: originalIndex, total_operations: changesRaw.length },
          );
        }
        // Partial mode: record failure and continue
        applicationFailures.push({ index: originalIndex, reason: msg });
      }
    }

    // Combine validation and application failures for partial mode
    const allFailures = [...validationFailures, ...applicationFailures];

    // If partial mode and ALL operations failed (validation + application), return error
    if (partial && results.length === 0) {
      state.endGroup();
      return errorResult('All operations failed in partial batch.', {
        failed: allFailures,
        total_operations: changesRaw.length,
      });
    }

    const groupInfo = state.endGroup();

    // Re-sort results back to submission order (results are in document order
    // from the sorted-ops loop; agents expect responses in the same order
    // they submitted the batch).
    results.sort((a, b) => a.index - b.index);

    const footnoteHeader = generateFootnoteDefinition(groupInfo.id, 'group', author!);
    const ts = nowTimestamp();
    const reasonLine = (groupInfo.reasoning ?? groupInfo.description)
      ? `\n    @${author!} ${ts.raw}: ${groupInfo.reasoning ?? groupInfo.description}`
      : '';
    const groupFootnoteBlock = footnoteHeader + reasonLine;
    currentText = appendFootnote(currentText, groupFootnoteBlock);
    await fs.writeFile(filePath, currentText, 'utf-8');
    await rerecordState(state, filePath, currentText, config);

    // Compute affected_lines for the final file state so agents have fresh
    // hashline coordinates without needing to re-read the entire file.
    // Only covers lines near the changes (with context), not the entire file.
    await initHashline();

    const affectedLineSet = new Set<number>();
    for (const r of results) {
      if (r.startLine && r.endLine) {
        for (let l = r.startLine; l <= r.endLine; l++) affectedLineSet.add(l);
      }
    }

    let affectedLinesResult: AffectedLineEntry[];
    if (affectedLineSet.size > 0) {
      const sortedLines = [...affectedLineSet].sort((a, b) => a - b);
      affectedLinesResult = computeAffectedLines(currentText, sortedLines[0], sortedLines[sortedLines.length - 1], {
        hashlineEnabled: config.hashline.enabled,
        contextLines: 1,
      });
    } else {
      // Fallback: scan for CriticMarkup to find a bounded window instead of returning entire file
      const modLines = currentText.split('\n');
      let matchLine = 1;
      for (let i = 0; i < modLines.length; i++) {
        if (/\{\+\+|\{--|\{~~|\{==/.test(modLines[i])) {
          matchLine = i + 1;
          break;
        }
      }
      const fallbackStart = Math.max(1, matchLine - 2);
      const fallbackEnd = Math.min(modLines.length, matchLine + 5);
      affectedLinesResult = computeAffectedLines(currentText, fallbackStart, fallbackEnd, {
        hashlineEnabled: config.hashline.enabled,
      });
    }

    // Add preview to each applied result
    const modifiedLines = currentText.split('\n');
    for (const r of results) {
      if (r.startLine) {
        (r as any).preview = modifiedLines[r.startLine - 1] ?? '';
      }
    }

    const footnoteCount = (currentText.match(/^\[\^ct-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = (currentText.match(/\|\s*proposed\s*$/gm) || []).length;
    const acceptedCount = (currentText.match(/\|\s*accepted\s*$/gm) || []).length;
    const authorMatches = currentText.match(/^\[\^ct-\d+(?:\.\d+)?\]:\s*@([^\s|]+)/gm) || [];
    const uniqueAuthors = new Set(
      authorMatches.map((m) => m.match(/@([^\s|]+)/)?.[1]).filter(Boolean)
    );

    const responseData: Record<string, unknown> = {
      group_id: groupId,
      file: relativePath,
      reasoning: reasoning ?? undefined,
      applied: results,
      failed: allFailures,
      ...(config.response?.affected_lines ? { affected_lines: affectedLinesResult } : {}),
      document_state: {
        total_changes: footnoteCount,
        proposed: proposedCount,
        accepted: acceptedCount,
        authors: uniqueAuthors.size,
      },
    };
    if (relocations.length > 0) {
      responseData.relocated = relocations;
    }
    if (remaps.length > 0) {
      responseData.remaps = remaps;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(responseData) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}
