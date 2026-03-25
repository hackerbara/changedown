import * as fs from 'node:fs/promises';
import { computeSupersedeResult, parseForFormat } from '@changetracks/core';
import { errorResult } from '../shared/error-result.js';
import { strArg, optionalStrArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { toRelativePath } from '../path-utils.js';
import type { SessionState } from '../state.js';
import { rerecordState } from '../state-utils.js';

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
    const newText = strArg(args, 'new_text', 'newText');
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

    // Same-author enforcement: amend is restricted to the original change's author
    const doc = parseForFormat(fileContent);
    const originalChange = doc.getChanges().find(c => c.id === changeId);
    if (originalChange) {
      const originalAuthor = originalChange.metadata?.author?.replace(/^@/, '') ?? '';
      const normalizedAuthor = (author ?? '').replace(/^@/, '');
      if (originalAuthor && normalizedAuthor && originalAuthor !== normalizedAuthor) {
        return errorResult(
          `Cannot amend change "${changeId}": you (${normalizedAuthor}) are not the original author (${originalAuthor}). ` +
          `Use supersede_change to propose a replacement by a different author.`
        );
      }
    }

    // Delegate pure computation to core
    const result = await computeSupersedeResult(fileContent, changeId, {
      newText,
      oldText,
      reason: reasoning,
      author,
    });

    if (result.isError) {
      return errorResult(result.error);
    }

    // Write modified content to disk and sync state
    await fs.writeFile(filePath, result.text, 'utf-8');
    await rerecordState(state, filePath, result.text, config);

    const responseData: Record<string, unknown> = {
      change_id: changeId,
      new_change_id: result.newChangeId,
      file: toRelativePath(projectDir, filePath),
      amended: true,
      new_text: newText,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(responseData) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

