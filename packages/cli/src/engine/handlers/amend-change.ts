import * as fs from 'node:fs/promises';
import { CriticMarkupParser, ChangeType, ChangeStatus, resolveChangeById, parseFootnoteHeader } from '@changetracks/core';
import { errorResult } from '../shared/error-result.js';
import { strArg, optionalStrArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { isFileInScope, type ChangeTracksConfig } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { findFootnoteBlock, findDiscussionInsertionIndex, nowTimestamp } from '@changetracks/core';
import { toRelativePath } from '../path-utils.js';
import { normalizeContentPayload } from '../content-normalizer.js';
import type { SessionState } from '../state.js';
import { rerecordState } from '../state-utils.js';

const CRITIC_DELIMITER_RE = /\{\+\+|\{--|\{~~|\{==|\{>>/;

export const amendChangeTool = {
  name: 'amend_change',
  description:
    'Revise your own proposed change. Same-author enforcement. Preserves change ID and adds revision history. ' +
    'new_text accepts the same escape normalization as propose_change.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      change_id: {
        type: 'string',
        description: "The change ID to amend (e.g., 'ct-7' or 'ct-7.2')",
      },
      new_text: {
        type: 'string',
        description:
          "The new proposed text. For substitutions: replaces the 'new' side (after ~>). For insertions: replaces the inserted text. For deletions: not applicable (amend reason only via reason param).",
      },
      old_text: {
        type: 'string',
        description:
          'Optional. Expands the scope of a substitution by replacing the OLD side. Must contain the original old text as a substring.',
      },
      reason: {
        type: 'string',
        description: "Why this amendment is being made. Recorded as a 'revised:' entry in the footnote.",
      },
      author: {
        type: 'string',
        description:
          'Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer); must match the original change author. Required when this project has author enforcement.',
      },
    },
    required: ['file', 'change_id'],
  },
};

export interface AmendChangeResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handles an `amend_change` tool call.
 * Updates the proposed text of a change in place, preserves change ID and discussion, adds revised/previous to footnote.
 */
export async function handleAmendChange(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state?: SessionState
): Promise<AmendChangeResult> {
  try {
    const file = args.file as string | undefined;
    const changeId = optionalStrArg(args, 'change_id', 'changeId');
    let newText = normalizeContentPayload(strArg(args, 'new_text', 'newText'));
    const oldText = optionalStrArg(args, 'old_text', 'oldText');
    const reasoning = optionalStrArg(args, 'reason', 'reason');

    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);

    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(
        `File is not in scope for tracking: "${filePath}". Check .changetracks/config.toml include/exclude patterns.`
      );
    }

    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }

    const { author, error: authorError } = resolveAuthor(
      args.author as string | undefined,
      config,
      'amend_change'
    );
    if (authorError) {
      return errorResult(authorError.message);
    }

    // Use resolveChangeById for reliable ID resolution — handles dotted group member IDs
    // (e.g. ct-1.1) that the parser's sequential counter would otherwise miss.
    const resolved = resolveChangeById(fileContent, changeId);
    if (!resolved || !resolved.footnoteBlock) {
      return errorResult(`Change ${changeId} not found in file`);
    }

    // Parse the footnote header to get status and author for validation.
    const parsedHeader = parseFootnoteHeader(resolved.footnoteBlock.headerContent);
    if (!parsedHeader) {
      return errorResult(`Change ${changeId} not found in file`);
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
      return errorResult(
        `Cannot amend a ${statusStr} change. Only proposed changes can be amended.`
      );
    }

    const changeAuthor = parsedHeader.author.replace(/^@/, '');
    const resolvedAuthorNorm = author.replace(/^@/, '');
    if (changeAuthor && resolvedAuthorNorm !== changeAuthor) {
      return errorResult(
        `Cannot amend change ${changeId}: you (${author}) are not the original author (${changeAuthor}). Use supersede_change to propose an alternative.`
      );
    }

    // Parse the document to find the ChangeNode for content/range manipulation.
    // resolveChangeById confirms the change exists; the parser provides the ChangeNode
    // with range, originalText, modifiedText needed for inline markup rewriting.
    const parser = new CriticMarkupParser();
    const doc = parser.parse(fileContent);
    const change = doc.getChanges().find((c) => c.id === changeId);

    if (!change) {
      return errorResult(`Change ${changeId} not found in file`);
    }

    const changeType = change.type;
    const currentProposed =
      changeType === ChangeType.Substitution || changeType === ChangeType.Insertion || changeType === ChangeType.Comment
        ? (change.modifiedText ?? '')
        : '';

    if (
      (changeType === ChangeType.Substitution || changeType === ChangeType.Insertion || changeType === ChangeType.Comment) &&
      newText === ''
    ) {
      return errorResult('new_text is required for amend (substitution, insertion, or comment).');
    }

    if (changeType === ChangeType.Deletion || changeType === ChangeType.Highlight) {
      if (newText.length > 0) {
        return errorResult(
          'Deletion changes cannot be amended inline (the deleted text is fixed). To amend reasoning, pass reasoning without new_text. To target different text, reject this change and propose a new one.'
        );
      }
    } else {
      if (CRITIC_DELIMITER_RE.test(newText)) {
        return errorResult('new_text cannot contain CriticMarkup delimiters');
      }
      if (changeType === ChangeType.Insertion && newText === '') {
        return errorResult('Cannot amend an insertion to empty text. Use reject to remove the change.');
      }
      if (newText === currentProposed && !reasoning) {
        return errorResult('new_text is identical to current proposed text and no reasoning provided; nothing to amend');
      }
    }

    // When text is identical to current, this is a reasoning-only amendment
    const reasoningOnly = newText === currentProposed;

    // Validate old_text is only used with substitutions
    if (oldText && changeType !== ChangeType.Substitution) {
      return errorResult(
        'old_text scope expansion is only supported for substitution changes.'
      );
    }

    const originalMarkup = fileContent.slice(change.range.start, change.range.end);
    const refs = originalMarkup.match(/\[\^ct-[\d.]+\]/g) ?? [];
    const refString = refs.join('');

    let newMarkup: string;
    let previousText = '';
    let inlineUpdated = false;

    // Track whether scope expansion requires a wider replacement range
    let expandedStart: number | undefined;
    let expandedEnd: number | undefined;

    if (reasoningOnly) {
      // Reasoning-only amendment: no inline change, just add revised entry to footnote
      newMarkup = originalMarkup;
      inlineUpdated = false;
    } else {
      switch (changeType) {
        case ChangeType.Substitution: {
          if (oldText) {
            // Scope expansion: old_text must contain the original substitution text
            const currentOriginal = change.originalText ?? '';
            if (!oldText.includes(currentOriginal)) {
              return errorResult(
                `old_text must contain the original substitution text "${currentOriginal}" as a substring.`
              );
            }

            // Split old_text around the original text to get prefix and suffix context
            const prefixIdx = oldText.indexOf(currentOriginal);
            const prefix = oldText.slice(0, prefixIdx);
            const suffix = oldText.slice(prefixIdx + currentOriginal.length);

            // Verify prefix text exists immediately before the markup in the raw file
            const rawBefore = fileContent.slice(change.range.start - prefix.length, change.range.start);
            if (rawBefore !== prefix) {
              return errorResult(
                `old_text context does not match: expected "${prefix}" before the markup but found "${rawBefore}"`
              );
            }

            // Verify suffix text exists immediately after the markup (including refs) in the raw file
            const rawAfter = fileContent.slice(change.range.end, change.range.end + suffix.length);
            if (rawAfter !== suffix) {
              return errorResult(
                `old_text context does not match: expected "${suffix}" after the markup but found "${rawAfter}"`
              );
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
          return errorResult(`Unsupported change type for amend: ${changeType}`);
      }
    }

    const replaceStart = expandedStart ?? change.range.start;
    const replaceEnd = expandedEnd ?? change.range.end;
    let modifiedContent =
      fileContent.slice(0, replaceStart) + newMarkup + fileContent.slice(replaceEnd);

    const lines = modifiedContent.split('\n');
    const block = findFootnoteBlock(lines, changeId);
    if (!block) {
      return errorResult(`Change metadata for ${changeId} not found in file`);
    }

    const ts = nowTimestamp();
    const reasonLine = `    revised @${author} ${ts.raw}: ${reasoning ?? 'amended proposed text'}`;
    const insertIdx = findDiscussionInsertionIndex(lines, block.headerLine, block.blockEnd);
    const toInsert: string[] = [reasonLine];
    if (previousText.length > 0) {
      const truncated =
        previousText.length > 100 ? previousText.slice(0, 100) + '...' : previousText;
      toInsert.push(`    previous: "${truncated.replace(/"/g, '\\"')}"`);
    }
    lines.splice(insertIdx + 1, 0, ...toInsert);
    modifiedContent = lines.join('\n');

    await fs.writeFile(filePath, modifiedContent, 'utf-8');
    await rerecordState(state, filePath, modifiedContent, config);

    const responseData: Record<string, unknown> = {
      change_id: changeId,
      file: toRelativePath(projectDir, filePath),
      type: changeType,
      amended: true,
      previous_text: previousText,
      new_text: newText,
      inline_updated: inlineUpdated,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(responseData) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

