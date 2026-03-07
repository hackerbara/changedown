import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { findFootnoteBlock, findDiscussionInsertionIndex, nowTimestamp } from '@changetracks/core';
import { SessionState } from '../state.js';

/**
 * Tool definition for the respond_to_thread MCP tool.
 * Raw JSON Schema — used when registering the tool with the MCP server.
 */
export const respondToThreadTool = {
  name: 'respond_to_thread',
  description: "Add a response to an existing change's discussion thread.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      change_id: {
        type: 'string',
        description: 'e.g., ct-7',
      },
      response: {
        type: 'string',
        description: 'Your contribution to the discussion',
      },
      label: {
        type: 'string',
        enum: ['suggestion', 'issue', 'question', 'praise', 'todo', 'thought', 'nitpick'],
        description: 'Optional comment label',
      },
      author: {
        type: 'string',
        description:
          'Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement.',
      },
    },
    required: ['file', 'change_id', 'response'],
  },
};

export interface RespondToThreadResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handles a `respond_to_thread` tool call.
 *
 * Validates arguments, reads the target file, locates the footnote block
 * for the given change_id, formats a discussion entry, inserts it at the
 * correct position (after existing discussion, before approval/resolution),
 * and writes the result back to disk.
 */
export async function handleRespondToThread(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  _state: SessionState
): Promise<RespondToThreadResult> {
  try {
    // 1. Extract and validate args (accept snake_case and camelCase)
    const file = args.file as string | undefined;
    const changeId = optionalStrArg(args, 'change_id', 'changeId');
    const response = optionalStrArg(args, 'response', 'response');
    const label = optionalStrArg(args, 'label', 'label');

    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    if (!response) {
      return errorResult('Missing required argument: "response"');
    }

    // Validate label enum
    const VALID_LABELS = ['suggestion', 'issue', 'question', 'praise', 'todo', 'thought', 'nitpick'] as const;
    if (label && !VALID_LABELS.includes(label as typeof VALID_LABELS[number])) {
      return errorResult(`Invalid label: "${label}". Must be one of: ${VALID_LABELS.join(', ')}`);
    }

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

    // 5. Find footnote block for change_id
    const lines = fileContent.split('\n');
    const block = findFootnoteBlock(lines, changeId);

    if (!block) {
      return errorResult(
        `Change "${changeId}" not found in file "${filePath}".`
      );
    }

    // 6. Determine the insertion point within the footnote block.
    // Discussion entries go after metadata and existing discussion,
    // but before approval/resolution lines.
    const insertionIdx = findDiscussionInsertionIndex(lines, block.headerLine, block.blockEnd) + 1;

    // 7. Format the response line(s)
    const { author, error: authorError } = resolveAuthor(
      args.author as string | undefined,
      config,
      'respond_to_thread',
    );
    if (authorError) {
      return errorResult(authorError.message);
    }
    const ts = nowTimestamp();
    const formattedLines = formatResponseLines(author, ts.raw, response, label);

    // 8. Insert the response line(s)
    lines.splice(insertionIdx, 0, ...formattedLines);

    // 9. Write back to disk
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    // 10. Return success
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            change_id: changeId,
            comment_added: true,
          }),
        },
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

/**
 * Formats a discussion response into one or more lines with proper indentation.
 *
 * Top-level discussion entries use 4-space indent:
 *   `    @author date: message`
 *   `    @author date [label]: message`
 *
 * Multi-line responses use 6-space indent for continuation lines:
 *   `    @author date: first line`
 *   `      second line`
 *   `      third line`
 */
function formatResponseLines(
  author: string,
  date: string,
  response: string,
  label?: string
): string[] {
  const responseLines = response.split('\n');
  const indent = '    '; // 4 spaces for top-level discussion
  const continuationIndent = '      '; // 6 spaces for continuation

  // Format the first line with author/date prefix
  const labelPart = label ? ` [${label}]` : '';
  const firstLine = `${indent}@${author} ${date}${labelPart}: ${responseLines[0]}`;

  const result = [firstLine];

  // Add continuation lines with extra indent
  for (let i = 1; i < responseLines.length; i++) {
    result.push(`${continuationIndent}${responseLines[i]}`);
  }

  return result;
}

