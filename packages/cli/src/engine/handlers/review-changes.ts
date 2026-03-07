import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { findFootnoteBlock, findDiscussionInsertionIndex, countFootnoteHeadersWithStatus, initHashline, nowTimestamp } from '@changetracks/core';
import { SessionState } from '../state.js';
import { rerecordState } from '../state-utils.js';
import {
  applyReview,
  type Decision,
  VALID_DECISIONS,
} from './review-change.js';
import { settleAcceptedChanges, settleRejectedChanges } from './settle.js';
import { computeAffectedLines, type AffectedLineEntry } from './propose-utils.js';

/**
 * Tool definition for the review_changes MCP tool.
 * Batch review multiple changes in one call.
 */
export const reviewChangesTool = {
  name: 'review_changes',
  description:
    'Review existing changes: accept/reject decisions and thread responses. Pass reviews for accept/reject or responses for thread replies. Accepted changes are compacted by the server per project config (no separate settle step). ' +
    'When status_updated is false, a reason field explains why (already_accepted, already_rejected, request_changes_no_status_change).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      reviews: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            change_id: {
              type: 'string',
              description: "e.g., 'ct-7' or 'ct-7.2'",
            },
            decision: {
              type: 'string',
              enum: ['approve', 'reject', 'request_changes'],
              description: 'The review decision',
            },
            reason: {
              type: 'string',
              description: 'Why this decision. Required.',
            },
          },
          required: ['change_id', 'decision', 'reason'],
        },
        description: 'Array of review decisions to apply',
      },
      author: {
        type: 'string',
        description:
          'Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement.',
      },
      responses: {
        type: 'array',
        description: 'Thread responses. Each: {change_id, response, label?}.',
        items: {
          type: 'object',
          properties: {
            change_id: { type: 'string' },
            response: { type: 'string' },
            label: { type: 'string', enum: ['suggestion', 'issue', 'question', 'praise', 'todo', 'thought', 'nitpick'] },
          },
          required: ['change_id', 'response'],
        },
      },
    },
    required: ['file'],
  },
};

export interface ReviewChangesResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface ReviewItem {
  change_id: string;
  decision: string;
  reason: string;
}

/**
 * Handles a `review_changes` tool call.
 * Reads file once, applies all reviews in reverse document order (to preserve line offsets),
 * writes once, returns per-change results (partial success on invalid change_id).
 */
export async function handleReviewChanges(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState
): Promise<ReviewChangesResult> {
  try {
    const file = optionalStrArg(args, 'file', 'file');
    const reviewsRaw = args.reviews as unknown;
    const responsesRaw = args.responses as unknown;
    const settleFlag = args.settle === true;
    const authorArg = optionalStrArg(args, 'author', 'author');

    if (!file) {
      return errorResult('Missing required argument: "file"');
    }

    const hasReviews = Array.isArray(reviewsRaw) && reviewsRaw.length > 0;
    const hasResponses = Array.isArray(responsesRaw) && responsesRaw.length > 0;

    // At least one of reviews, responses, or settle must be provided (settle used by CLI / get_tracking_status, not in LLM schema)
    if (!hasReviews && !hasResponses && !settleFlag) {
      return errorResult(
        'At least one of "reviews", "responses", or "settle" must be provided.'
      );
    }

    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);

    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(
        `File is not in scope for tracking: "${filePath}". ` +
          'Check .changetracks/config.toml include/exclude patterns.'
      );
    }

    let fileContent: string;
    let originalContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
      originalContent = fileContent;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }

    const { author, error: authorError } = resolveAuthor(
      authorArg,
      config,
      'review_changes',
    );
    if (authorError) {
      return errorResult(authorError.message);
    }

    const successes: string[] = [];
    const errors: string[] = [];

    // ── Phase 1: Process reviews ─────────────────────────────────────────

    let results: Array<
      | { change_id: string; decision: string; status_updated: boolean; reason?: string }
      | { change_id: string; error: string }
    > = [];

    if (hasReviews) {
      const lines = fileContent.split('\n');

      // Build list with positions; sort by footnote header line descending (process bottom-up to preserve offsets)
      const inputOrderChangeIds: string[] = [];
      const withPosition: { review: ReviewItem; headerLine: number }[] = [];
      const validationErrors: string[] = [];
      for (let idx = 0; idx < (reviewsRaw as unknown[]).length; idx++) {
        const r = (reviewsRaw as unknown[])[idx];
        if (r === null || r === undefined || typeof r !== 'object' || Array.isArray(r)) {
          validationErrors.push(`Review item #${idx} must be an object, got ${r === null ? 'null' : Array.isArray(r) ? 'array' : typeof r}`);
          continue;
        }
        const rObj = r as Record<string, unknown>;
        const changeId = rObj.change_id as string | undefined;
        const decision = rObj.decision as string | undefined;
        const reason = rObj.reason as string | undefined;
        const missingFields: string[] = [];
        if (!changeId) missingFields.push("'change_id'");
        if (!decision) missingFields.push("'decision'");
        if (!reason) {
          // Check if the agent passed 'reasoning' instead of 'reason'
          if (rObj.reasoning) {
            missingFields.push("'reason' (did you mean 'reason'? You passed 'reasoning' which is not the correct field name)");
          } else {
            missingFields.push("'reason'");
          }
        }
        if (missingFields.length > 0) {
          validationErrors.push(`Review item #${idx} missing required field(s): ${missingFields.join(', ')}`);
          continue;
        }
        inputOrderChangeIds.push(changeId!);
        const block = findFootnoteBlock(lines, changeId!);
        withPosition.push({
          review: { change_id: changeId!, decision: decision!, reason: reason! },
          headerLine: block ? block.headerLine : -1,
        });
      }
      withPosition.sort((a, b) => b.headerLine - a.headerLine);

      const resultByChangeId: Map<
        string,
        | { change_id: string; decision: string; status_updated: boolean; reason?: string }
        | { change_id: string; error: string }
      > = new Map();

      for (const { review } of withPosition) {
        if (!VALID_DECISIONS.includes(review.decision as Decision)) {
          resultByChangeId.set(review.change_id, {
            change_id: review.change_id,
            error: `Invalid decision: "${review.decision}". Must be one of: approve, reject, request_changes`,
          });
          continue;
        }

        const applied = applyReview(
          fileContent,
          review.change_id,
          review.decision as Decision,
          review.reason,
          author,
        );

        if ('error' in applied) {
          resultByChangeId.set(review.change_id, { change_id: review.change_id, error: applied.error });
          continue;
        }

        resultByChangeId.set(review.change_id, applied.result);
        fileContent = applied.updatedContent;
      }

      // Return results in same order as input reviews
      results = inputOrderChangeIds.map((id) => resultByChangeId.get(id)!);

      // Surface validation errors for malformed review items
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
      }

    }

    // ── Phase 2: Process responses (thread replies) in-memory ─────────
    //
    // Responses are applied to the in-memory fileContent string to avoid
    // multiple disk writes. The single write happens at the end of the handler.

    if (hasResponses) {
      const VALID_LABELS = ['suggestion', 'issue', 'question', 'praise', 'todo', 'thought', 'nitpick'] as const;

      for (let rIdx = 0; rIdx < (responsesRaw as unknown[]).length; rIdx++) {
        const resp = (responsesRaw as unknown[])[rIdx];
        if (resp === null || resp === undefined || typeof resp !== 'object' || Array.isArray(resp)) {
          errors.push(`Response item #${rIdx} must be an object, got ${resp === null ? 'null' : Array.isArray(resp) ? 'array' : typeof resp}`);
          continue;
        }
        const respObj = resp as Record<string, unknown>;
        const respChangeId = respObj.change_id as string | undefined;
        const respText = respObj.response as string | undefined;
        const respLabel = respObj.label as string | undefined;

        // Validate required fields
        if (!respChangeId || !respText) {
          const missing: string[] = [];
          if (!respChangeId) missing.push("'change_id'");
          if (!respText) missing.push("'response'");
          errors.push(`Response item #${rIdx} missing required field(s): ${missing.join(', ')}`);
          continue;
        }

        if (respLabel && !VALID_LABELS.includes(respLabel as typeof VALID_LABELS[number])) {
          errors.push(`Response to ${respChangeId}: Invalid label "${respLabel}". Must be one of: ${VALID_LABELS.join(', ')}`);
          continue;
        }

        const lines = fileContent.split('\n');
        const block = findFootnoteBlock(lines, respChangeId);
        if (!block) {
          errors.push(`Response to ${respChangeId}: Change "${respChangeId}" not found in file.`);
          continue;
        }

        const insertionIdx = findDiscussionInsertionIndex(lines, block.headerLine, block.blockEnd) + 1;
        const ts = nowTimestamp();
        const labelPart = respLabel ? ` [${respLabel}]` : '';
        const responseLines = respText.split('\n');
        const indent = '    ';
        const continuationIndent = '      ';
        const firstLine = `${indent}@${author} ${ts.raw}${labelPart}: ${responseLines[0]}`;
        const formatted = [firstLine];
        for (let li = 1; li < responseLines.length; li++) {
          formatted.push(`${continuationIndent}${responseLines[li]}`);
        }

        lines.splice(insertionIdx, 0, ...formatted);
        fileContent = lines.join('\n');
        successes.push(`Responded to ${respChangeId}`);
      }
    }

    // ── Phase 3: Auto-settlement on approve/reject (config-driven) ──────

    let settlementInfo: { settledIds: string[] } | undefined;
    if (config.settlement.auto_on_approve && hasReviews) {
      const hasApprovals = results.some((r) => 'decision' in r && r.decision === 'approve');
      if (hasApprovals) {
        const { settledContent, settledIds } = settleAcceptedChanges(fileContent);
        if (settledIds.length > 0) {
          fileContent = settledContent;
          settlementInfo = { settledIds };
        }
      }
    }

    if (config.settlement.auto_on_reject && hasReviews) {
      const hasRejections = results.some((r) => 'decision' in r && r.decision === 'reject');
      if (hasRejections) {
        const { settledContent, settledIds } = settleRejectedChanges(fileContent);
        if (settledIds.length > 0) {
          fileContent = settledContent;
          // Merge with any auto-settlement IDs from approve phase
          if (settlementInfo) {
            const existingSet = new Set(settlementInfo.settledIds);
            for (const id of settledIds) {
              if (!existingSet.has(id)) {
                settlementInfo.settledIds.push(id);
              }
            }
          } else {
            settlementInfo = { settledIds };
          }
        }
      }
    }

    // ── Phase 4: Explicit settle flag ────────────────────────────────────

    if (settleFlag) {
      const { settledContent, settledIds } = settleAcceptedChanges(fileContent);
      if (settledIds.length > 0) {
        fileContent = settledContent;
        // Merge with any auto-settlement IDs
        if (settlementInfo) {
          const existingSet = new Set(settlementInfo.settledIds);
          for (const id of settledIds) {
            if (!existingSet.has(id)) {
              settlementInfo.settledIds.push(id);
            }
          }
        } else {
          settlementInfo = { settledIds };
        }
      }
      successes.push('Settled all accepted changes (Layer 1 compaction)');
    }

    // ── Phase 5: Compute affected_lines for settled changes ─────────────
    //
    // When settlement occurred, scan post-settlement content for [^ct-ID]
    // references of settled changes to determine which lines were affected.
    // This lets the agent continue editing without a forced re-read.

    let affectedLines: AffectedLineEntry[] | undefined;
    if (settlementInfo && settlementInfo.settledIds.length > 0) {
      const postLines = fileContent.split('\n');
      const settledIdSet = new Set(settlementInfo.settledIds);

      // Find footnote section start so we only scan content lines, not footnote definitions
      const footnoteStart = postLines.findIndex(l => /^\[\^ct-/.test(l));
      const contentEnd = footnoteStart > 0 ? footnoteStart : postLines.length;

      // Find lines in post-settlement content that contain [^ct-ID] refs for settled changes
      let minLine = Infinity;
      let maxLine = -Infinity;
      for (let i = 0; i < contentEnd; i++) {
        const lineNum = i + 1; // 1-indexed
        for (const id of settledIdSet) {
          if (postLines[i].includes(`[^${id}]`)) {
            if (lineNum < minLine) minLine = lineNum;
            if (lineNum > maxLine) maxLine = lineNum;
          }
        }
      }

      // Only compute if we found affected lines in the content region
      if (minLine !== Infinity && maxLine !== -Infinity) {
        if (config.hashline.enabled) {
          await initHashline();
        }
        affectedLines = computeAffectedLines(fileContent, minLine, maxLine, {
          hashlineEnabled: config.hashline.enabled,
        });
      }
    }

    // ── Single atomic write ──────────────────────────────────────────────
    //
    // All phases above operated on the in-memory fileContent string.
    // We write to disk exactly once, ensuring file consistency even if the
    // process is interrupted.

    if (fileContent !== originalContent) {
      await fs.writeFile(filePath, fileContent, 'utf-8');
      await rerecordState(state, filePath, fileContent, config);
    }

    // ── Build response ───────────────────────────────────────────────────

    const response: Record<string, unknown> = { file: path.relative(projectDir, filePath) };
    if (results.length > 0) {
      response.results = results;
    }
    if (successes.length > 0) {
      response.successes = successes;
    }
    if (errors.length > 0) {
      response.errors = errors;
    }
    if (settlementInfo) {
      response.settled = settlementInfo.settledIds;
      response.settlement_note =
        `${settlementInfo.settledIds.length} change(s) settled to clean text. ` +
        `The file now contains clean prose where those changes were. ` +
        `Proposed changes remain as markup.`;
    }
    if (affectedLines) {
      response.affected_lines = affectedLines;
    }
    const remaining = countFootnoteHeadersWithStatus(fileContent, 'proposed');
    response.document_state = {
      remaining_proposed: remaining,
      all_resolved: remaining === 0,
    };
    if (remaining === 0) {
      response.note =
        'All changes in this file are now resolved (accepted or rejected). No proposed changes remain.';
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

