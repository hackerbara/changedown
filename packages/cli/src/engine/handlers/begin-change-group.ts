import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { scanMaxCtId } from '@changetracks/core';
import { errorResult } from '../shared/error-result.js';
import { optionalStrArg } from '../args.js';
import { isFileInScope, type ChangeTracksConfig } from '../config.js';
import { ConfigResolver } from '../config-resolver.js';
import { SessionState } from '../state.js';

/**
 * Tool definition for the begin_change_group MCP tool.
 * Raw JSON Schema -- used when registering the tool with the MCP server.
 */
export const beginChangeGroupTool = {
  name: 'begin_change_group',
  description:
    'Start a logical group of related changes. All subsequent propose_change calls ' +
    'will receive dotted child IDs (ct-N.M) under this group until end_change_group is called. ' +
    'Use for refactors, multi-step edits, or cross-file changes that belong together.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string',
        description: 'What this group of changes accomplishes (required).',
      },
      reason: {
        type: 'string',
        description: 'Why these changes are being made together. Optional but encouraged.',
      },
    },
    required: ['description'],
  },
};

export interface BeginChangeGroupResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Scans all tracked files in the project for existing `[^ct-N]` IDs
 * and returns the highest parent ID number found. Returns 0 if no IDs
 * exist or the directory is unreadable.
 */
export async function scanProjectForMaxId(
  projectDir: string,
  config: ChangeTracksConfig,
): Promise<number> {
  let max = 0;
  try {
    const entries = await fs.readdir(projectDir, { recursive: true });
    for (const rawEntry of entries) {
      const entry = typeof rawEntry === 'string' ? rawEntry : String(rawEntry);
      const fullPath = path.join(projectDir, entry);
      if (!isFileInScope(fullPath, config, projectDir)) continue;
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const fileMax = scanMaxCtId(content);
        if (fileMax > max) max = fileMax;
      } catch {
        // Skip directories, binary files, unreadable files
      }
    }
  } catch {
    // Directory unreadable — return 0
  }
  return max;
}

/**
 * Handles a `begin_change_group` tool call.
 *
 * Validates arguments, scans tracked files for existing IDs, starts a
 * new change group in session state, and returns the allocated group ID.
 * All subsequent `propose_change` calls will produce dotted child IDs
 * under this group.
 */
export async function handleBeginChangeGroup(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState
): Promise<BeginChangeGroupResult> {
  try {
    const description = optionalStrArg(args, 'description', 'description');
    const reasoning = optionalStrArg(args, 'reason', 'reason');

    if (!description) {
      return errorResult('Missing required argument: "description"');
    }

    // Don't scan project-wide - group ID will be allocated from the first file edited
    const groupId = state.beginGroup(description, reasoning);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ group_id: groupId }),
        },
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

