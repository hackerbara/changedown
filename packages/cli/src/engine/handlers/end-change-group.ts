import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { generateFootnoteDefinition, nowTimestamp } from '@changetracks/core';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { resolveAuthor } from '../author.js';
import { ConfigResolver } from '../config-resolver.js';
import { appendFootnote } from '../file-ops.js';
import { SessionState } from '../state.js';

/**
 * Tool definition for the end_change_group MCP tool.
 * Raw JSON Schema -- used when registering the tool with the MCP server.
 */
export const endChangeGroupTool = {
  name: 'end_change_group',
  description:
    'End the current change group. Writes a parent footnote (type "group") to the ' +
    'first file that received changes. Returns the group ID and list of child change IDs.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: 'Optional summary of what the group accomplished.',
      },
      author: {
        type: 'string',
        description:
          'Who is making this change. Recommended: always pass your model/agent identity (e.g. ai:composer) for clear attribution. Required when this project has author enforcement.',
      },
    },
    required: [],
  },
};

export interface EndChangeGroupResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handles an `end_change_group` tool call.
 *
 * Ends the active change group, writes a parent footnote definition
 * (type "group") to the first affected file, and returns a summary
 * of the group including all child IDs and affected files.
 */
export async function handleEndChangeGroup(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState
): Promise<EndChangeGroupResult> {
  try {
    const summary = optionalStrArg(args, 'summary', 'summary');
    const config = await resolver.lastConfig();
    const projectDir = resolver.resolveDir();

    // Resolve author identity BEFORE mutating state.
    // If enforcement rejects, the group must remain active so the agent can retry.
    const { author, error: authorError } = resolveAuthor(
      args.author as string | undefined,
      config,
      'end_change_group',
    );
    if (authorError) {
      return errorResult(authorError.message);
    }

    const groupInfo = state.endGroup();

    // Write parent footnote to the first file that was part of the group
    if (groupInfo.files.length > 0) {
      const targetFile = groupInfo.files[0];

      // Generate the parent footnote using core's generator
      const footnoteHeader = generateFootnoteDefinition(groupInfo.id, 'group', author);
      const ts = nowTimestamp();
      const reasonLine = groupInfo.description ? `\n    @${author} ${ts.raw}: ${groupInfo.description}` : '';
      const summaryLine = summary ? `\n    summary: ${summary}` : '';
      const footnoteBlock = footnoteHeader + reasonLine + summaryLine;

      // Read current file content, append footnote, write back
      const fileContent = await fs.readFile(targetFile, 'utf-8');
      const modifiedText = appendFootnote(fileContent, footnoteBlock);
      await fs.writeFile(targetFile, modifiedText, 'utf-8');
    }

    // Human-readable list of modified files + instruction so agents share paths with the user
    const filesList =
      groupInfo.files.length > 0
        ? `Modified files:\n${groupInfo.files.map((f) => path.relative(projectDir, f)).join('\n')}\n\nShare this list with the user so they know which file(s) to open or read.`
        : '';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            group_id: groupInfo.id,
            children: groupInfo.childIds,
            files: groupInfo.files,
          }),
        },
        ...(filesList ? [{ type: 'text' as const, text: filesList }] : []),
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

