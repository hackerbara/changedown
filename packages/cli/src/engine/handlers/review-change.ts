import * as fs from 'node:fs/promises';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { applyReview, VALID_DECISIONS, type Decision, type ApplyReviewSuccess, type ApplyReviewError } from '@changetracks/core';
import { applyBlockingAnnotation } from '../shared/blocking-annotation.js';
import { SessionState } from '../state.js';
import { rerecordState } from '../state-utils.js';
import { settleAcceptedChanges, settleRejectedChanges } from './settle.js';

/**
 * Tool definition for the review_change MCP tool.
 * Raw JSON Schema -- used when registering the tool with the MCP server.
 */
export const reviewChangeTool = {
  name: 'review_change',
  description:
    'Accept, reject, or request changes on a tracked change. Reasoning is required.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      change_id: {
        type: 'string',
        description: "e.g., 'ct-7' or 'ct-7.2'",
      },
      decision: {
        type: 'string',
        enum: ['approve', 'reject', 'request_changes', 'withdraw'],
        description: 'The review decision',
      },
      reason: {
        type: 'string',
        description: 'Why this decision. Required.',
      },
      author: {
        type: 'string',
        description:
          'Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement.',
      },
      blocking: {
        type: 'boolean',
        description: 'When true and decision is request_changes, adds a blocking hold that must be withdrawn before acceptance.',
      },
      label: {
        type: 'string',
        description: 'Optional label for request_changes (e.g. "security", "testing"). Labels in config blocking_labels auto-block.',
      },
    },
    required: ['file', 'change_id', 'decision', 'reason'],
  },
};

export interface ReviewChangeResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// Re-export types and values that other CLI modules depend on.
// Note: applyReview is NOT re-exported from here; consumers should import
// it directly from '@changetracks/core'.
export { VALID_DECISIONS, type Decision, type ApplyReviewSuccess, type ApplyReviewError } from '@changetracks/core';

/**
 * Handles a `review_change` tool call.
 *
 * Validates arguments, reads the target file, finds the footnote definition
 * for the specified change ID, inserts a review line, optionally updates the
 * header status, writes the result back to disk, and returns a structured
 * response suitable for the MCP protocol.
 */
export async function handleReviewChange(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState
): Promise<ReviewChangeResult> {
  try {
    // 1. Extract and validate args (accept snake_case and camelCase)
    const file = args.file as string | undefined;
    const changeId = optionalStrArg(args, 'change_id', 'changeId');
    const decision = optionalStrArg(args, 'decision', 'decision');
    const reasoning = optionalStrArg(args, 'reason', 'reason');

    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    if (!decision) {
      return errorResult('Missing required argument: "decision"');
    }
    if (!reasoning) {
      return errorResult('Missing required argument: "reason"');
    }

    // Validate decision enum
    if (!VALID_DECISIONS.includes(decision as Decision)) {
      return errorResult(
        `Invalid decision: "${decision}". Must be one of: approve, reject, request_changes, withdraw`
      );
    }
    const typedDecision = decision as Decision;

    // 2. Resolve file path
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);

    // 3. Check scope
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(
        `File is not in scope for tracking: "${filePath}". ` +
          'Check .changetracks/config.toml include/exclude patterns.'
      );
    }

    // 4. Read file from disk
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }

    // 5. Resolve author
    const { author, error: authorError } = resolveAuthor(
      args.author as string | undefined,
      config,
      'review_change',
    );
    if (authorError) {
      return errorResult(authorError.message);
    }

    // 6. Apply review (shared logic)
    const applied = applyReview(fileContent, changeId, typedDecision, reasoning, author, config);
    if ('error' in applied) {
      return errorResult(applied.error);
    }

    // 6b. Post-process: add blocked: line for request_changes with blocking/label
    if (typedDecision === 'request_changes') {
      const blockingArg = args.blocking === true;
      const labelArg = optionalStrArg(args, 'label', 'label');
      const autoBlock = labelArg ? (config.review.blocking_labels[labelArg] === true) : false;
      const shouldBlock = blockingArg || autoBlock;
      if (labelArg || shouldBlock) {
        applied.updatedContent = applyBlockingAnnotation(applied.updatedContent, changeId, author, labelArg, shouldBlock);
      }
    }

    // 7. Write file back (only when content actually changed)
    if (applied.updatedContent !== fileContent) {
      fileContent = applied.updatedContent;
      await fs.writeFile(filePath, fileContent, 'utf-8');
    }

    let settlementInfo: { settledIds: string[] } | undefined;
    if (config.settlement.auto_on_approve && typedDecision === 'approve') {
      const { settledContent, settledIds } = settleAcceptedChanges(fileContent);
      if (settledIds.length > 0) {
        await fs.writeFile(filePath, settledContent, 'utf-8');
        fileContent = settledContent;
        settlementInfo = { settledIds };
      }
    }

    if (config.settlement.auto_on_reject && typedDecision === 'reject') {
      const { settledContent, settledIds } = settleRejectedChanges(fileContent);
      if (settledIds.length > 0) {
        await fs.writeFile(filePath, settledContent, 'utf-8');
        fileContent = settledContent;
        settlementInfo = { settledIds };
      }
    }

    await rerecordState(state, filePath, fileContent, config);

    const response: Record<string, unknown> = { ...applied.result };
    if (settlementInfo) {
      response.settled = settlementInfo.settledIds;
      const settlementVerb = typedDecision === 'reject' ? 'rejected' : 'accepted';
      response.settlement_note =
        `${settlementInfo.settledIds.length} ${settlementVerb} change(s) settled to clean text. ` +
        `The file now contains clean prose where those changes were. ` +
        `Proposed changes remain as markup.`;
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

