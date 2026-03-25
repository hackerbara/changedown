import * as fs from 'node:fs/promises';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg, strArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { isFileInScope } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { computeSupersedeResult, countFootnoteHeadersWithStatus } from '@changetracks/core';
import { toRelativePath } from '../path-utils.js';
import { SessionState } from '../state.js';
import { rerecordState } from '../state-utils.js';
import { settleRejectedChanges } from './settle.js';
/**
 * Tool definition for the supersede_change MCP tool.
 * Atomically rejects an old change and proposes a replacement,
 * linking them via `supersedes: ct-N` in the new footnote.
 */
export const supersedeChangeTool = {
  name: 'supersede_change',
  description:
    'Atomically reject an existing proposed change and propose a replacement. ' +
    'The old change is rejected and the new change\'s footnote includes a `supersedes: ct-N` link. ' +
    'Use this instead of separate reject + propose calls when replacing a change with a better version.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      change_id: {
        type: 'string',
        description: 'The change ID to supersede (e.g., \'ct-1\'). Must be in proposed status.',
      },
      old_text: {
        type: 'string',
        description:
          'Text to replace in the (possibly settled) file. If the rejected change was settled (compacted), ' +
          'this targets the resulting clean text. If not settled, targets text in the current file.',
      },
      new_text: {
        type: 'string',
        description: 'Replacement text for the new proposed change.',
      },
      reason: {
        type: 'string',
        description: 'Why this change supersedes the old one.',
      },
      insert_after: {
        type: 'string',
        description: 'For insertions (empty old_text): insert new text after this anchor text.',
      },
      author: {
        type: 'string',
        description:
          'Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. ' +
          'Required when this project has author enforcement.',
      },
    },
    required: ['file', 'change_id', 'old_text', 'new_text'],
  },
};

export interface SupersedeChangeResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handles a `supersede_change` tool call.
 *
 * Atomically:
 * 1. Verifies the old change exists and is in `proposed` status
 * 2. Rejects the old change (updates footnote status)
 * 3. Settles (compacts) the rejected markup if auto_on_reject is enabled
 * 4. Proposes the new replacement change
 * 5. Adds `supersedes: ct-N` to the new change's footnote
 */
export async function handleSupersedeChange(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState
): Promise<SupersedeChangeResult> {
  try {
    // 1. Extract and validate args
    const file = args.file as string | undefined;
    const changeId = optionalStrArg(args, 'change_id', 'changeId');
    const oldText = strArg(args, 'old_text', 'oldText');
    const newText = strArg(args, 'new_text', 'newText');
    const reasoning = optionalStrArg(args, 'reason', 'reason');
    const insertAfter = optionalStrArg(args, 'insert_after', 'insertAfter');

    if (!file) {
      return errorResult('Missing required argument: "file"');
    }
    if (!changeId) {
      return errorResult('Missing required argument: "change_id"');
    }
    if (oldText === '' && newText === '') {
      return errorResult('Both old_text and new_text are empty — nothing to change.');
    }

    // 2. Resolve file path and config
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);

    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(
        `File is not in scope for tracking: "${filePath}". ` +
          'Check .changetracks/config.toml include/exclude patterns.'
      );
    }

    // 3. Read file
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }

    // 4. Resolve author
    const { author, error: authorError } = resolveAuthor(
      args.author as string | undefined,
      config,
      'supersede_change',
    );
    if (authorError) {
      return errorResult(authorError.message);
    }

    // 5. Delegate pure computation to core (reject + propose + cross-link)
    const result = await computeSupersedeResult(fileContent, changeId, {
      newText,
      oldText,
      reason: reasoning,
      author,
      insertAfter: insertAfter ?? undefined,
    });

    if (result.isError) {
      return errorResult(result.error);
    }

    fileContent = result.text;

    // 6. Settle rejected changes if auto_on_reject is enabled (policy decision)
    if (config.settlement.auto_on_reject) {
      const { settledContent } = settleRejectedChanges(fileContent);
      fileContent = settledContent;
    }

    // 7. Write back to disk
    await fs.writeFile(filePath, fileContent, 'utf-8');
    await rerecordState(state, filePath, fileContent, config);

    // 8. Build response
    const relativePath = toRelativePath(projectDir, filePath);
    const footnoteCount = (fileContent.match(/^\[\^ct-\d+(?:\.\d+)?\]:/gm) || []).length;
    const proposedCount = countFootnoteHeadersWithStatus(fileContent, 'proposed');
    const acceptedCount = countFootnoteHeadersWithStatus(fileContent, 'accepted');
    const rejectedCount = countFootnoteHeadersWithStatus(fileContent, 'rejected');

    // Derive change type from old_text/new_text
    const changeType = oldText === '' ? 'ins' : newText === '' ? 'del' : 'sub';

    const responseData: Record<string, unknown> = {
      old_change_id: changeId,
      new_change_id: result.newChangeId,
      file: relativePath,
      type: changeType,
      supersedes: changeId,
      document_state: {
        total_changes: footnoteCount,
        proposed: proposedCount,
        accepted: acceptedCount,
        rejected: rejectedCount,
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(responseData) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

