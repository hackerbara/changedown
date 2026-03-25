/**
 * Pure computation for superseding a proposed change.
 *
 * Extracted from packages/cli/src/engine/handlers/supersede-change.ts (Task 1D).
 * Atomically rejects the original change and proposes a replacement,
 * linking them via `supersedes:` and `superseded-by:` cross-references.
 *
 * No file I/O, no config resolution, no settlement (that's a policy decision).
 */

import { findFootnoteBlock, parseFootnoteHeader } from '../footnote-utils.js';
import { applyReview } from './apply-review.js';
import { applyProposeChange, appendFootnote } from '../file-ops.js';
import { scanMaxCtId, generateFootnoteDefinition } from './footnote-generator.js';
import { isL3Format } from '../footnote-patterns.js';
import { parseForFormat } from '../format-aware-parse.js';
import { computeReject } from './accept-reject.js';
import { ChangeType } from '../model/types.js';
import { nowTimestamp } from '../timestamp.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SupersedeOptions {
  /** Replacement text for the new change. */
  newText: string;
  /** Text to replace (targets the document after rejection). Empty for insertion-style supersede. */
  oldText?: string;
  /** Why this change supersedes the old one. */
  reason?: string;
  /** Who is making the supersede. */
  author: string;
  /** Anchor for insertions (when oldText is empty). */
  insertAfter?: string;
}

export interface SupersedeSuccess {
  isError: false;
  /** The full document text after supersede operations. */
  text: string;
  /** The newly allocated change ID (e.g. "ct-2"). */
  newChangeId: string;
  /** The original change ID that was superseded. */
  originalChangeId: string;
}

export interface SupersedeError {
  isError: true;
  error: string;
}

export type SupersedeResult = SupersedeSuccess | SupersedeError;

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Computes the result of superseding a proposed change.
 *
 * Pure function: no I/O. Takes the full file text and returns the
 * rewritten text with:
 * 1. Original change rejected (status → rejected, rejection line added)
 * 2. New replacement change proposed at the same location
 * 3. Cross-references: `supersedes: ct-N` in new footnote,
 *    `superseded-by: ct-M` in original footnote
 *
 * Constraints enforced:
 * - Only `proposed` changes can be superseded
 */
export async function computeSupersedeResult(
  text: string,
  changeId: string,
  opts: SupersedeOptions,
): Promise<SupersedeResult> {
  const { newText, oldText = '', reason, author, insertAfter } = opts;

  // --- 1. Validate: find change, check status, check different-author ---
  const lines = text.split('\n');
  const block = findFootnoteBlock(lines, changeId);
  if (!block) {
    return { isError: true, error: `Change "${changeId}" not found in file.` };
  }

  const header = parseFootnoteHeader(lines[block.headerLine]);
  if (!header) {
    return {
      isError: true,
      error: `Malformed metadata for change "${changeId}". Expected format: @author | date | type | status`,
    };
  }

  if (header.status === 'accepted') {
    return {
      isError: true,
      error: `Cannot supersede change "${changeId}": it is already accepted. Only proposed changes can be superseded.`,
    };
  }
  if (header.status === 'rejected') {
    return {
      isError: true,
      error: `Cannot supersede change "${changeId}": it is already rejected. Only proposed changes can be superseded.`,
    };
  }
  if (header.status !== 'proposed') {
    return {
      isError: true,
      error: `Cannot supersede change "${changeId}": unexpected status "${header.status}". Only proposed changes can be superseded.`,
    };
  }

  // --- 2. Reject the original change ---
  const rejectResult = applyReview(
    text,
    changeId,
    'reject',
    reason ?? 'Superseded by new change',
    author,
  );

  if ('error' in rejectResult) {
    return { isError: true, error: `Failed to reject old change: ${rejectResult.error}` };
  }

  let fileContent = rejectResult.updatedContent;

  // --- 3. Revert body to reflect rejection (both L2 and L3) ---
  const level = isL3Format(text) ? 3 : 2;
  const doc = parseForFormat(fileContent);
  const rejectedChange = doc.getChanges().find(c => c.id === changeId);

  // For insertions and comments (amend use case, no explicit oldText/insertAfter),
  // use direct markup replacement instead of revert-and-reinsert. This avoids
  // anchor resolution issues when surrounding text contains other CriticMarkup.
  const isDirectReplace = rejectedChange && !oldText && !insertAfter &&
    (rejectedChange.type === ChangeType.Insertion || rejectedChange.type === ChangeType.Comment);

  if (isDirectReplace && rejectedChange) {
    // --- Direct replacement path for insertions and comments ---
    // Replace the old CriticMarkup with new markup inline, avoiding body reversion.
    const maxId = scanMaxCtId(fileContent);
    const newChangeId = `ct-${maxId + 1}`;

    // Build replacement markup
    let newMarkup: string;
    let changeType: string;
    if (rejectedChange.type === ChangeType.Comment) {
      newMarkup = `{>>${newText}<<}[^${newChangeId}]`;
      changeType = 'com';
    } else {
      const insPad = /^[+\-~]/.test(newText) ? ' ' : '';
      newMarkup = `{++${insPad}${newText}++}[^${newChangeId}]`;
      changeType = 'ins';
    }

    // Replace the old markup span (range covers {++...++} or {>>...<<}) and its ref [^ct-N]
    const rangeStart = rejectedChange.range.start;
    let rangeEnd = rejectedChange.range.end;
    // Include the [^ct-N] reference if present after the markup
    const refStr = `[^${changeId}]`;
    if (fileContent.slice(rangeEnd, rangeEnd + refStr.length) === refStr) {
      rangeEnd += refStr.length;
    }
    fileContent = fileContent.slice(0, rangeStart) + newMarkup + fileContent.slice(rangeEnd);

    // Append new footnote
    const footnoteHeader = generateFootnoteDefinition(newChangeId, changeType, author);
    const reasonLine = reason ? `\n    @${author} ${nowTimestamp().raw}: ${reason}` : '';
    fileContent = appendFootnote(fileContent, footnoteHeader + reasonLine);

    // Update original footnote status to rejected
    // (applyReview already did this, so just add cross-references)

    // --- Add `supersedes: ct-N` to the new change's footnote ---
    const modifiedLines = fileContent.split('\n');
    const newBlock = findFootnoteBlock(modifiedLines, newChangeId);
    if (newBlock) {
      const supersedesLine = `    supersedes: ${changeId}`;
      modifiedLines.splice(newBlock.headerLine + 1, 0, supersedesLine);
      fileContent = modifiedLines.join('\n');
    }

    // --- Add `superseded-by: ct-M` to the original change's footnote ---
    const updatedLines = fileContent.split('\n');
    const origBlock = findFootnoteBlock(updatedLines, changeId);
    if (origBlock) {
      const supersededByLine = `    superseded-by: ${newChangeId}`;
      updatedLines.splice(origBlock.headerLine + 1, 0, supersededByLine);
      fileContent = updatedLines.join('\n');
    }

    return {
      isError: false,
      text: fileContent,
      newChangeId,
      originalChangeId: changeId,
    };
  }

  // --- Standard path: revert body and re-propose ---
  if (rejectedChange) {
    const rejectEdit = computeReject(rejectedChange);
    fileContent = fileContent.slice(0, rejectEdit.offset) +
      rejectEdit.newText +
      fileContent.slice(rejectEdit.offset + rejectEdit.length);
  }

  // --- 4. Allocate next ID ---
  const maxId = scanMaxCtId(fileContent);
  const newChangeId = `ct-${maxId + 1}`;

  // --- 5. Create replacement change via applyProposeChange ---
  // Determine oldText for propose: if caller provided oldText, use it.
  // If not provided (amend use case), derive from the original change:
  // after body reversion, the original text is back in the body.
  let proposeOldText = oldText;

  if (rejectedChange) {
    if (!proposeOldText) {
      if (rejectedChange.type === ChangeType.Substitution || rejectedChange.type === ChangeType.Deletion) {
        proposeOldText = rejectedChange.originalText ?? '';
      }
    }
  }

  const proposeResult = await applyProposeChange({
    text: fileContent,
    oldText: proposeOldText,
    newText,
    changeId: newChangeId,
    author,
    reasoning: reason,
    insertAfter,
    level,
  });
  fileContent = proposeResult.modifiedText;

  // --- 6. Add `supersedes: ct-N` to the new change's footnote ---
  const modifiedLines = fileContent.split('\n');
  const newBlock = findFootnoteBlock(modifiedLines, newChangeId);
  if (newBlock) {
    const supersedesLine = `    supersedes: ${changeId}`;
    modifiedLines.splice(newBlock.headerLine + 1, 0, supersedesLine);
    fileContent = modifiedLines.join('\n');
  }

  // --- 7. Add `superseded-by: ct-M` to the original change's footnote ---
  const updatedLines = fileContent.split('\n');
  const origBlock = findFootnoteBlock(updatedLines, changeId);
  if (origBlock) {
    const supersededByLine = `    superseded-by: ${newChangeId}`;
    // Insert after the header line (before any existing content lines)
    updatedLines.splice(origBlock.headerLine + 1, 0, supersededByLine);
    fileContent = updatedLines.join('\n');
  }

  return {
    isError: false,
    text: fileContent,
    newChangeId,
    originalChangeId: changeId,
  };
}
