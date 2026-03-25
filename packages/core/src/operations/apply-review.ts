import { CriticMarkupParser } from '../parser/parser.js';
import { changeTypeToAbbrev } from '../model/types.js';
import { findFootnoteBlock, parseFootnoteHeader, findReviewInsertionIndex, findChildFootnoteIds } from '../footnote-utils.js';
import { nowTimestamp } from '../timestamp.js';
import { ensureL2 } from './ensure-l2.js';
import type { ChangeTracksConfig } from '../config/index.js';
import { canAccept } from '../config/review-permissions.js';

export const VALID_DECISIONS = ['approve', 'reject', 'request_changes', 'withdraw'] as const;
export type Decision = typeof VALID_DECISIONS[number];

export interface ApplyReviewSuccess {
  updatedContent: string;
  result: { change_id: string; decision: Decision; status_updated: boolean; reason?: string; cascaded_children?: string[] };
}

export interface ApplyReviewError {
  error: string;
}

function decisionToKeyword(decision: Decision): string {
  switch (decision) {
    case 'approve':
      return 'approved:';
    case 'reject':
      return 'rejected:';
    case 'request_changes':
      return 'request-changes:';
    case 'withdraw':
      return 'withdrew:';
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}


/**
 * Scans footnote body lines for `blocked: @author` entries and checks whether
 * each blocker has been resolved by a subsequent `withdrew:` or `approved:` line
 * from the same author.
 */
function checkBlocks(
  lines: string[],
  block: { headerLine: number; blockEnd: number },
): { blocked: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const resolved = new Set<string>();

  for (let i = block.headerLine + 1; i <= block.blockEnd; i++) {
    const line = lines[i].trim();
    const colonIdx = line.indexOf(':');
    if (colonIdx < 1) continue;
    const keyword = line.slice(0, colonIdx);
    const authorMatch = line.slice(colonIdx + 1).match(/^\s*@(\S+)/);
    if (!authorMatch) continue;
    const author = '@' + authorMatch[1];

    if (keyword === 'blocked') blockers.push(author);
    else if (keyword === 'withdrew' || keyword === 'approved') resolved.add(author);
  }

  const unresolvedBlockers = blockers.filter(b => !resolved.has(b));
  return { blocked: unresolvedBlockers.length > 0, blockers: unresolvedBlockers };
}

/**
 * Attempts to auto-promote a Level 0 bare CriticMarkup change (no footnote,
 * no inline metadata) to Level 2 using ensureL2. Returns the promoted file
 * content, or null if the change cannot be found or is not L0.
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

  const typeAbbrev = changeTypeToAbbrev(change.type);
  const result = ensureL2(fileContent, change.range.start, { author, type: typeAbbrev });
  if (!result.promoted) {
    return null;
  }
  return result.text;
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
  author: string,
  config?: ChangeTracksConfig,
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

  // Permission checks (when config provided)
  if (config && (decision === 'approve' || decision === 'reject')) {
    const acceptCheck = canAccept(author, header.author, config);
    if (!acceptCheck.allowed) {
      return { error: acceptCheck.reason! };
    }
  }

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

  // Block checking: prevent acceptance when unresolved blocked: lines exist
  if (decision === 'approve') {
    const blockResult = checkBlocks(lines, block);
    if (blockResult.blocked) {
      return { error: `Acceptance blocked by unresolved request-changes from ${blockResult.blockers.join(', ')}` };
    }
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
  } else if (decision === 'approve' && currentStatus === 'rejected') {
    // ADR-D §2: rejection is not terminal — a later approval overrides it.
    lines[block.headerLine] = lines[block.headerLine].replace(/\|\s*rejected\s*$/, '| accepted');
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
