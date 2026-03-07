import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { findFootnoteBlock, parseFootnoteHeader, findReviewInsertionIndex, findChildFootnoteIds, nowTimestamp, CriticMarkupParser, ChangeType, generateFootnoteDefinition, appendFootnote } from '@changetracks/core';
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
        enum: ['approve', 'reject', 'request_changes'],
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
    },
    required: ['file', 'change_id', 'decision', 'reason'],
  },
};

export interface ReviewChangeResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const VALID_DECISIONS = ['approve', 'reject', 'request_changes'] as const;
export type Decision = typeof VALID_DECISIONS[number];

/**
 * Maps a decision value to its footnote keyword.
 *
 * - `approve` -> `approved:`
 * - `reject` -> `rejected:`
 * - `request_changes` -> `request-changes:`
 */
function decisionToKeyword(decision: Decision): string {
  switch (decision) {
    case 'approve':
      return 'approved:';
    case 'reject':
      return 'rejected:';
    case 'request_changes':
      return 'request-changes:';
  }
}

export interface ApplyReviewSuccess {
  updatedContent: string;
  result: { change_id: string; decision: Decision; status_updated: boolean; reason?: string; cascaded_children?: string[] };
}

export interface ApplyReviewError {
  error: string;
}

/**
 * Maps a ChangeType enum value to the abbreviated type string used in footnotes.
 */
function changeTypeToAbbrev(type: ChangeType): string {
  switch (type) {
    case ChangeType.Insertion: return 'ins';
    case ChangeType.Deletion: return 'del';
    case ChangeType.Substitution: return 'sub';
    case ChangeType.Highlight: return 'hig';
    case ChangeType.Comment: return 'com';
  }
}

/**
 * Auto-promotes a Level 0 bare CriticMarkup change (no footnote, no inline metadata)
 * to Level 2 by inserting `[^changeId]` immediately after the change's closing delimiter
 * and appending a footnote definition.
 *
 * Returns the promoted file content, or null if the change cannot be found.
 */
function promoteLevel0ToLevel2(
  fileContent: string,
  changeId: string,
  author: string,
): string | null {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(fileContent);
  const changes = doc.getChanges();

  const change = changes.find((c) => c.id === changeId);
  if (!change) {
    return null;
  }

  // Only promote Level 0 (bare markup, no footnote, no inline metadata)
  if (change.level !== 0) {
    return null;
  }

  // Insert [^changeId] immediately after the closing delimiter
  const insertPos = change.range.end;
  const withRef =
    fileContent.slice(0, insertPos) +
    `[^${changeId}]` +
    fileContent.slice(insertPos);

  // Append the footnote definition
  const typeAbbrev = changeTypeToAbbrev(change.type);
  const footnoteDef = generateFootnoteDefinition(changeId, typeAbbrev, author);
  return appendFootnote(withRef, footnoteDef);
}

/**
 * Applies a single review to file content in memory.
 * Used by both review_change (single) and review_changes (batch).
 * Does not read or write disk.
 *
 * When the target change is a bare Level 0 CriticMarkup change (no footnote),
 * it is automatically promoted to Level 2 (ref + footnote) before the review
 * is applied. This allows agents to review changes proposed without footnotes.
 */
export function applyReview(
  fileContent: string,
  changeId: string,
  decision: Decision,
  reasoning: string,
  author: string
): ApplyReviewSuccess | ApplyReviewError {
  let lines = fileContent.split('\n');
  let block = findFootnoteBlock(lines, changeId);

  if (!block) {
    // Attempt auto-promotion for Level 0 bare CriticMarkup changes
    const promoted = promoteLevel0ToLevel2(fileContent, changeId, author);
    if (!promoted) {
      return { error: `Change "${changeId}" not found in file.` };
    }
    fileContent = promoted;
    lines = fileContent.split('\n');
    block = findFootnoteBlock(lines, changeId);
    if (!block) {
      return { error: `Change "${changeId}" not found in file after promotion attempt.` };
    }
  }

  const header = parseFootnoteHeader(lines[block.headerLine]);
  if (!header) {
    return {
      error: `Malformed metadata for change "${changeId}". Expected format: @author | date | type | status`,
    };
  }
  const currentStatus = header.status;

  // Idempotency: if the change is already in the target status, return a no-op.
  // request_changes still appends (it is a comment, not a status transition).
  if (decision === 'approve' && currentStatus === 'accepted') {
    return {
      updatedContent: fileContent,
      result: { change_id: changeId, decision, status_updated: false, reason: 'already_accepted' },
    };
  }
  if (decision === 'reject' && currentStatus === 'rejected') {
    return {
      updatedContent: fileContent,
      result: { change_id: changeId, decision, status_updated: false, reason: 'already_rejected' },
    };
  }

  const keyword = decisionToKeyword(decision);
  const ts = nowTimestamp();
  const reviewLine = `    ${keyword} @${author} ${ts.raw} "${reasoning}"`;

  const insertAfterIdx = findReviewInsertionIndex(lines, block.headerLine, block.blockEnd);
  lines.splice(insertAfterIdx + 1, 0, reviewLine);

  let statusUpdated = false;
  let reason: string | undefined;
  if (decision === 'approve' && currentStatus === 'proposed') {
    lines[block.headerLine] = lines[block.headerLine].replace(/\|\s*proposed\s*$/, '| accepted');
    statusUpdated = true;
  } else if (decision === 'reject' && currentStatus === 'proposed') {
    lines[block.headerLine] = lines[block.headerLine].replace(/\|\s*proposed\s*$/, '| rejected');
    statusUpdated = true;
  } else if (decision === 'reject' && currentStatus === 'accepted') {
    // Explicit reject overrides prior cascade (e.g. parent approved then user rejects child).
    lines[block.headerLine] = lines[block.headerLine].replace(/\|\s*accepted\s*$/, '| rejected');
    statusUpdated = true;
  } else if (decision === 'request_changes') {
    reason = 'request_changes_no_status_change';
  }

  // Cascade to children if this is a group parent
  let cascadedChildren: string[] | undefined;
  if (statusUpdated && (decision === 'approve' || decision === 'reject')) {
    const childIds = findChildFootnoteIds(lines, changeId);
    if (childIds.length > 0) {
      cascadedChildren = [];
      const targetStatus = decision === 'approve' ? 'accepted' : 'rejected';
      for (const childId of childIds) {
        const childBlock = findFootnoteBlock(lines, childId);
        if (!childBlock) continue;
        const childHeader = parseFootnoteHeader(lines[childBlock.headerLine]);
        if (!childHeader) continue;
        // Only cascade to children still at 'proposed'
        if (childHeader.status !== 'proposed') continue;

        // Update child status
        lines[childBlock.headerLine] = lines[childBlock.headerLine].replace(
          /\|\s*proposed\s*$/,
          `| ${targetStatus}`
        );
        // Insert review line in child footnote
        const childInsertIdx = findReviewInsertionIndex(lines, childBlock.headerLine, childBlock.blockEnd);
        const childReviewLine = `    ${keyword} @${author} ${ts.raw} "${reasoning}" (cascaded from ${changeId})`;
        lines.splice(childInsertIdx + 1, 0, childReviewLine);
        cascadedChildren.push(childId);
      }
      if (cascadedChildren.length === 0) cascadedChildren = undefined;
    }
  }

  const result: ApplyReviewSuccess['result'] = { change_id: changeId, decision, status_updated: statusUpdated };
  if (reason) {
    result.reason = reason;
  }
  if (cascadedChildren) {
    result.cascaded_children = cascadedChildren;
  }

  return {
    updatedContent: lines.join('\n'),
    result,
  };
}

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
        `Invalid decision: "${decision}". Must be one of: approve, reject, request_changes`
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
    const applied = applyReview(fileContent, changeId, typedDecision, reasoning, author);
    if ('error' in applied) {
      return errorResult(applied.error);
    }

    // 7. Write file back (only when content actually changed)
    if (applied.updatedContent !== fileContent) {
      fileContent = applied.updatedContent;
      await fs.writeFile(filePath, fileContent, 'utf-8');
    } else {
      fileContent = applied.updatedContent;
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

