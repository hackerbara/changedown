import * as fs from 'node:fs/promises';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { computeResolutionEdit, computeUnresolveEdit, type TextEdit } from '@changedown/core';
import { SessionState } from '../state.js';
import { rerecordState } from '../state-utils.js';

/**
 * Tool definition for the resolve_thread MCP tool.
 * Raw JSON Schema — used when registering the tool with the MCP server.
 */
export const resolveThreadTool = {
  name: 'resolve_thread',
  description: 'Resolve or unresolve a change thread. Resolving marks the discussion as complete.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      change_id: {
        type: 'string',
        description: 'e.g., cn-7',
      },
      action: {
        type: 'string',
        enum: ['resolve', 'unresolve'],
        description: 'Whether to resolve or unresolve the thread. Defaults to resolve.',
      },
      author: {
        type: 'string',
        description:
          'Who is resolving/unresolving. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement.',
      },
    },
    required: ['file', 'change_id'],
  },
};

export interface ResolveThreadResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function applyTextEdit(text: string, edit: TextEdit): string {
  return text.slice(0, edit.offset) + edit.newText + text.slice(edit.offset + edit.length);
}

/**
 * Handles a `resolve_thread` tool call.
 *
 * Validates arguments, reads the target file, applies either a resolution or
 * un-resolution edit to the footnote block, writes the result back to disk,
 * and returns a structured response.
 */
export async function handleResolveThread(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState
): Promise<ResolveThreadResult> {
  try {
    // 1. Extract and validate args
    const file = args.file as string | undefined;
    const changeId = optionalStrArg(args, 'change_id', 'changeId');
    const action = optionalStrArg(args, 'action', 'action') ?? 'resolve';

    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }

    // Validate action enum
    const VALID_ACTIONS = ['resolve', 'unresolve'] as const;
    if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
      return errorResult(`Invalid action: "${action}". Must be one of: resolve, unresolve`);
    }

    // 2. Resolve file path
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);

    // 3. Check scope
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(
        `File is not in scope for tracking: "${filePath}". ` +
          'Check .changedown/config.toml include/exclude patterns.'
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
      'resolve_thread',
    );
    if (authorError) {
      return errorResult(authorError.message);
    }

    // 6. Apply the appropriate edit
    let edit: TextEdit | null;
    if (action === 'resolve') {
      edit = computeResolutionEdit(fileContent, changeId, { author });
    } else {
      edit = computeUnresolveEdit(fileContent, changeId);
    }

    if (!edit) {
      if (action === 'resolve') {
        return errorResult(`Change "${changeId}" not found in file.`);
      }
      // For unresolve, the change may exist but have no resolved line
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              change_id: changeId,
              action,
              success: false,
              reason: `No resolved line found for "${changeId}".`,
            }),
          },
        ],
      };
    }

    // 7. Apply edit and write back to disk
    const updatedContent = applyTextEdit(fileContent, edit);
    await fs.writeFile(filePath, updatedContent, 'utf-8');
    await rerecordState(state, filePath, updatedContent, config);

    // 8. Return success
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            change_id: changeId,
            action,
            success: true,
          }),
        },
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}
