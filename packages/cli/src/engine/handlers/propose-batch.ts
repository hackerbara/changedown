import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  initHashline,
  defaultNormalizer,
  parseTrackingHeader,
  insertTrackingHeader,
  generateFootnoteDefinition,
  scanMaxCtId,
  nowTimestamp,
} from '@changetracks/core';
import { validateOrAutoRemap, type RelocationEntry, type AutoRemapResult } from './hashline-relocate.js';
import { resolveAuthor } from '../author.js';
import { ConfigResolver } from '../config-resolver.js';
import { strArg, optionalStrArg } from '../args.js';
import { applySingleOperation, extractLineRange, findUniqueMatch, appendFootnote } from '../file-ops.js';
import { computeAffectedLines, type AffectedLineEntry } from './propose-utils.js';
import { toRelativePath } from '../path-utils.js';
import { resolveTrackingStatus } from '../scope.js';
import { SessionState } from '../state.js';
import { parseOp } from '@changetracks/core';
import { parseAt } from '@changetracks/core';
import { resolveProtocolMode } from '../config.js';
import { normalizeContentPayload } from '../content-normalizer.js';
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
            old_text: { type: 'string' },
            new_text: { type: 'string' },
            reason: { type: 'string' },
            insert_after: { type: 'string' },
            start_line: { type: 'number' },
            start_hash: { type: 'string' },
            end_line: { type: 'number' },
            end_hash: { type: 'string' },
            after_line: { type: 'number' },
            after_hash: { type: 'string' },
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
  const idx = lines.findIndex((line) => line.startsWith('[^ct-'));
  // Determine the end boundary (all lines if no footnotes, up to footnote block otherwise)
  let bodyEnd = idx === -1 ? lines.length : idx;
  // Walk backwards to skip trailing blank lines — ensures consistent counting
  // whether or not footnotes are present (a file ending with \n has a trailing
  // empty element from split that must not inflate the count).
  while (bodyEnd > 0 && lines[bodyEnd - 1]!.trim() === '') {
    bodyEnd--;
  }
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

      // ─── Compact mode: convert {at, op} → classic format ───────
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

        let atParsed: ReturnType<typeof parseAt>;
        try {
          atParsed = parseAt(op.at as string);
        } catch (err) {
          throw new OpValidationError(
            `Operation ${i}: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        // Adjust for auto-header line shift (read_tracked_file showed the file
        // without the header; validation runs against header-inserted content)
        if (headerLineDelta > 0) {
          atParsed = {
            ...atParsed,
            startLine: atParsed.startLine + headerLineDelta,
            endLine: atParsed.endLine + headerLineDelta,
          };
        }

        const opReasoning = parsedOp.reasoning ?? (op.reason as string | undefined);
        const normalizedNewText = normalizeContentPayload(parsedOp.newText);

        if (parsedOp.type === 'ins') {
          // Insertion: use after_line
          const resolved: ResolvedOp = {
            oldText: '',
            newText: normalizedNewText,
            reason: opReasoning,
            afterLine: atParsed.startLine,
          };
          // Validate hash
          try {
            const afterResult = validateOrAutoRemap(
              { line: atParsed.startLine, hash: atParsed.startHash },
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
          resolvedOps.push(resolved);
        } else {
          // Sub, del, highlight: verify hash, then use line-range addressing.
          // Line-range with delta adjustment is correct here because:
          // 1. bodyLineCount() excludes footnotes, so appended footnotes don't shift delta
          // 2. Inline CriticMarkup from earlier ops modifies content but not line count
          // 3. String matching against currentText would find false matches inside
          //    CriticMarkup from earlier ops (e.g. {~~old~>new~~} contains both old and new text)
          let resolvedStartLine: number;
          try {
            const startResult = validateOrAutoRemap(
              { line: atParsed.startLine, hash: atParsed.startHash },
              fileLines,
              'start_line',
              relocations,
              autoRemap,
            );
            resolvedStartLine = startResult.line;
            if (startResult.remap) remaps.push(startResult.remap);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            throw new OpValidationError(message);
          }
          let resolvedEndLine = resolvedStartLine;
          if (atParsed.endLine !== atParsed.startLine) {
            try {
              const endResult = validateOrAutoRemap(
                { line: atParsed.endLine, hash: atParsed.endHash },
                fileLines,
                'end_line',
                relocations,
                autoRemap,
              );
              resolvedEndLine = endResult.line;
              if (endResult.remap) remaps.push(endResult.remap);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              throw new OpValidationError(message);
            }
          }
          // Pass startLine/endLine so applySingleOperation uses extractLineRange
          // to narrow search scope to the target line(s) only
          const resolved: ResolvedOp = {
            oldText: parsedOp.oldText,
            newText: normalizedNewText,
            reason: opReasoning,
            startLine: resolvedStartLine,
            endLine: resolvedEndLine,
          };
          resolvedOps.push(resolved);

          // Record position for overlap detection (line-range based)
          if (parsedOp.oldText !== '') {
            // Sub-line match within the range: find exact position
            try {
              const rangeResult = extractLineRange(fileLines, resolvedStartLine, resolvedEndLine);
              const match = findUniqueMatch(rangeResult.content, parsedOp.oldText, defaultNormalizer);
              batchPositions.push({
                index: i,
                startOffset: rangeResult.startOffset + match.index,
                endOffset: rangeResult.startOffset + match.index + match.length,
              });
            } catch {
              // If match fails here, applySingleOperation will catch it later
            }
          } else {
            // Whole-range target
            const rangeResult = extractLineRange(fileLines, resolvedStartLine, resolvedEndLine);
            batchPositions.push({
              index: i,
              startOffset: rangeResult.startOffset,
              endOffset: rangeResult.endOffset,
            });
          }
        }
        continue; // Skip classic param extraction below
      }

      // ─── Classic mode: extract old_text/new_text ─────────────────
      const oldText = strArg(op, 'old_text', 'oldText');
      const newText = normalizeContentPayload(strArg(op, 'new_text', 'newText'));
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
            } catch {
              // If match fails here, applySingleOperation will catch it later
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
    const results: Array<{ change_id: string; type: 'ins' | 'del' | 'sub'; index: number; startLine?: number; endLine?: number }> = [];
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
        const adjAfter = op.afterLine !== undefined ? op.afterLine + delta : undefined;
        const adjStart = op.startLine !== undefined ? op.startLine + delta : undefined;
        const adjEnd = op.endLine !== undefined ? op.endLine + delta : undefined;

        if ((op.afterLine !== undefined || op.startLine !== undefined) && adjStart === undefined && adjAfter === undefined) {
          throw new Error(`Operation ${originalIndex}: hashline params require after_line or start_line.`);
        }

        const applied = applySingleOperation({
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
      affected_lines: affectedLinesResult,
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
