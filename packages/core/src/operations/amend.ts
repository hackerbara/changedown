/**
 * Pure computation for amending a proposed change.
 *
 * Extracted from packages/cli/src/engine/handlers/amend-change.ts (Task 1C).
 * Handles inline markup rewriting and footnote revision entry insertion
 * without any file I/O.
 */

import { parseForFormat } from '../format-aware-parse.js';
import { ChangeType, ChangeStatus } from '../model/types.js';
import { resolveChangeById, parseFootnoteHeader, findFootnoteBlock, findDiscussionInsertionIndex } from '../footnote-utils.js';
import { nowTimestamp } from '../timestamp.js';

const CRITIC_DELIMITER_RE = /\{\+\+|\{--|\{~~|\{==|\{>>/;

export interface AmendOptions {
  newText: string;
  oldText?: string;
  reason?: string;
  author: string;
  date?: string;
}

export interface AmendSuccess {
  isError: false;
  text: string;
  changeId: string;
  previousText: string;
  inlineUpdated: boolean;
}

export interface AmendError {
  isError: true;
  error: string;
}

export type AmendResult = AmendSuccess | AmendError;

/**
 * Computes the amended document text for a proposed change.
 *
 * Pure function: no I/O. Takes the full file text and returns the
 * rewritten text with inline markup updated and a `revised:` + `previous:`
 * entry inserted in the footnote block.
 *
 * Constraints enforced:
 * - Only `proposed` changes can be amended
 * - Same-author enforcement (@ prefix normalized)
 * - Deletion/Highlight cannot have newText
 * - Insertion/Substitution/Comment require newText
 * - Substitution supports oldText for scope expansion
 * - newText cannot contain CriticMarkup delimiters
 */
export function computeAmendEdits(
  text: string,
  changeId: string,
  opts: AmendOptions,
): AmendResult {
  const { newText, oldText, reason, author } = opts;

  // --- Resolve change by ID (footnote-based, handles dotted IDs) ---
  const resolved = resolveChangeById(text, changeId);
  if (!resolved || !resolved.footnoteBlock) {
    return { isError: true, error: `Change ${changeId} not found in file` };
  }

  // --- Parse footnote header for validation ---
  const parsedHeader = parseFootnoteHeader(resolved.footnoteBlock.headerContent);
  if (!parsedHeader) {
    return { isError: true, error: `Change ${changeId} not found in file` };
  }

  const statusStr = parsedHeader.status;
  let status: ChangeStatus;
  if (statusStr === 'accepted') {
    status = ChangeStatus.Accepted;
  } else if (statusStr === 'rejected') {
    status = ChangeStatus.Rejected;
  } else {
    status = ChangeStatus.Proposed;
  }

  if (status !== ChangeStatus.Proposed) {
    return {
      isError: true,
      error: `Cannot amend a ${statusStr} change. Only proposed changes can be amended.`,
    };
  }

  // --- Author enforcement ---
  const changeAuthor = parsedHeader.author.replace(/^@/, '');
  const resolvedAuthorNorm = author.replace(/^@/, '');
  if (changeAuthor && resolvedAuthorNorm !== changeAuthor) {
    return {
      isError: true,
      error: `Cannot amend change ${changeId}: you (${author}) are not the original author (${changeAuthor}). Use supersede_change to propose an alternative.`,
    };
  }

  // --- Parse document for ChangeNode range/content ---
  const doc = parseForFormat(text);
  const change = doc.getChanges().find((c) => c.id === changeId);

  if (!change) {
    return { isError: true, error: `Change ${changeId} not found in file` };
  }

  const changeType = change.type;
  const currentProposed =
    changeType === ChangeType.Substitution || changeType === ChangeType.Insertion || changeType === ChangeType.Comment
      ? (change.modifiedText ?? '')
      : '';

  // --- Type-specific validation ---
  if (
    (changeType === ChangeType.Substitution || changeType === ChangeType.Insertion || changeType === ChangeType.Comment) &&
    newText === ''
  ) {
    return { isError: true, error: 'new_text is required for amend (substitution, insertion, or comment).' };
  }

  if (changeType === ChangeType.Deletion || changeType === ChangeType.Highlight) {
    if (newText.length > 0) {
      return {
        isError: true,
        error: 'Deletion changes cannot be amended inline (the deleted text is fixed). To amend reasoning, pass reasoning without new_text. To target different text, reject this change and propose a new one.',
      };
    }
  } else {
    if (CRITIC_DELIMITER_RE.test(newText)) {
      return { isError: true, error: 'new_text cannot contain CriticMarkup delimiters' };
    }
    if (changeType === ChangeType.Insertion && newText === '') {
      return { isError: true, error: 'Cannot amend an insertion to empty text. Use reject to remove the change.' };
    }
    if (newText === currentProposed && !reason) {
      return { isError: true, error: 'new_text is identical to current proposed text and no reasoning provided; nothing to amend' };
    }
  }

  // Reasoning-only when text is identical to current proposed
  const reasoningOnly = newText === currentProposed;

  // Validate old_text is only used with substitutions
  if (oldText && changeType !== ChangeType.Substitution) {
    return {
      isError: true,
      error: 'old_text scope expansion is only supported for substitution changes.',
    };
  }

  // --- Build new inline markup ---
  const originalMarkup = text.slice(change.range.start, change.range.end);
  const refs = originalMarkup.match(/\[\^ct-[\d.]+\]/g) ?? [];
  const refString = refs.join('');

  let newMarkup: string;
  let previousText = '';
  let inlineUpdated = false;

  // Track whether scope expansion requires a wider replacement range
  let expandedStart: number | undefined;
  let expandedEnd: number | undefined;

  if (reasoningOnly) {
    newMarkup = originalMarkup;
    inlineUpdated = false;
  } else {
    switch (changeType) {
      case ChangeType.Substitution: {
        if (oldText) {
          // Scope expansion: old_text must contain the original substitution text
          const currentOriginal = change.originalText ?? '';
          if (!oldText.includes(currentOriginal)) {
            return {
              isError: true,
              error: `old_text must contain the original substitution text "${currentOriginal}" as a substring.`,
            };
          }

          // Split old_text around the original text to get prefix and suffix context
          const prefixIdx = oldText.indexOf(currentOriginal);
          const prefix = oldText.slice(0, prefixIdx);
          const suffix = oldText.slice(prefixIdx + currentOriginal.length);

          // Verify prefix text exists immediately before the markup in the raw file
          const rawBefore = text.slice(change.range.start - prefix.length, change.range.start);
          if (rawBefore !== prefix) {
            return {
              isError: true,
              error: `old_text context does not match: expected "${prefix}" before the markup but found "${rawBefore}"`,
            };
          }

          // Verify suffix text exists immediately after the markup in the raw file
          const rawAfter = text.slice(change.range.end, change.range.end + suffix.length);
          if (rawAfter !== suffix) {
            return {
              isError: true,
              error: `old_text context does not match: expected "${suffix}" after the markup but found "${rawAfter}"`,
            };
          }

          expandedStart = change.range.start - prefix.length;
          expandedEnd = change.range.end + suffix.length;

          newMarkup = `{~~${oldText}~>${newText}~~}${refString}`;
        } else {
          newMarkup = `{~~${change.originalText ?? ''}~>${newText}~~}${refString}`;
        }
        previousText = change.modifiedText ?? '';
        inlineUpdated = true;
        break;
      }
      case ChangeType.Insertion:
        newMarkup = `{++${newText}++}${refString}`;
        previousText = change.modifiedText ?? '';
        inlineUpdated = true;
        break;
      case ChangeType.Comment:
        newMarkup = `{>>${newText}<<}${refString}`;
        previousText = change.modifiedText ?? '';
        inlineUpdated = true;
        break;
      case ChangeType.Deletion:
      case ChangeType.Highlight:
        newMarkup = originalMarkup;
        inlineUpdated = false;
        break;
      default:
        return { isError: true, error: `Unsupported change type for amend: ${changeType}` };
    }
  }

  // --- Apply inline replacement ---
  const replaceStart = expandedStart ?? change.range.start;
  const replaceEnd = expandedEnd ?? change.range.end;
  let modifiedContent =
    text.slice(0, replaceStart) + newMarkup + text.slice(replaceEnd);

  // --- Insert revision entry in footnote ---
  const lines = modifiedContent.split('\n');
  const block = findFootnoteBlock(lines, changeId);
  if (!block) {
    return { isError: true, error: `Change metadata for ${changeId} not found in file` };
  }

  const ts = opts.date ?? nowTimestamp().raw;
  const authorWithAt = author.startsWith('@') ? author : `@${author}`;
  const reasonLine = `    revised ${authorWithAt} ${ts}: ${reason ?? 'amended proposed text'}`;
  const insertIdx = findDiscussionInsertionIndex(lines, block.headerLine, block.blockEnd);
  const toInsert: string[] = [reasonLine];
  if (previousText.length > 0) {
    const truncated =
      previousText.length > 100 ? previousText.slice(0, 100) + '...' : previousText;
    toInsert.push(`    previous: "${truncated.replace(/"/g, '\\"')}"`);
  }
  lines.splice(insertIdx + 1, 0, ...toInsert);
  modifiedContent = lines.join('\n');

  return {
    isError: false,
    text: modifiedContent,
    changeId,
    previousText,
    inlineUpdated,
  };
}
