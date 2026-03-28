import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { optionalStrArg } from '../args.js';
import { ConfigResolver } from '../config-resolver.js';
import { countFootnoteHeadersWithStatus } from '@changedown/core';
import { resolveTrackingStatus } from '../scope.js';
import { SessionState } from '../state.js';
import { rerecordState } from '../state-utils.js';
import { settleAcceptedChanges } from './settle.js';
import picomatch from 'picomatch';

/**
 * Tool definition for the get_tracking_status MCP tool.
 * Raw JSON Schema -- used when registering the tool with the MCP server.
 */
export const getTrackingStatusTool = {
  name: 'get_tracking_status',
  description:
    'Check whether a file is tracked by ChangeDown and why. ' +
    'Returns tracking status, which layer determined it (file header, project config, or global default), ' +
    'and whether auto-header insertion is enabled. ' +
    'If file is omitted, returns a project-wide config summary.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description:
          'Path to check (absolute or relative to project root). If omitted, returns project-wide config summary.',
      },
      settle_accepted: {
        type: 'boolean',
        description:
          'If true and file is provided and tracked, settle all accepted changes in the file (escape hatch when auto-settle was off or file came from elsewhere). Default false.',
      },
    },
    required: [],
  },
};

export interface GetTrackingStatusResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handles a `get_tracking_status` tool call.
 *
 * - If `file` is provided: resolves the three-layer tracking status for that file
 *   (file header > project config > global default).
 * - If `file` is omitted: returns a summary of the project-wide config.
 */
export async function handleGetTrackingStatus(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState
): Promise<GetTrackingStatusResult> {
  try {
    const file = optionalStrArg(args, 'file', 'file');
    const settleAccepted = args.settle_accepted === true;

    if (file) {
      const filePath = resolver.resolveFilePath(file);
      const { config, projectDir } = await resolver.forFile(filePath);

      const status = await resolveTrackingStatus(filePath, config, projectDir);
      let relative = path.relative(projectDir, filePath);
      relative = relative.split(path.sep).join('/');
      const matchesHooksExclude = picomatch(config.hooks.exclude);
      const hookExcluded = matchesHooksExclude(relative);

      const out: Record<string, unknown> = {
        ...status,
        hook_excluded: hookExcluded,
        hooks_exclude: config.hooks.exclude,
      };

      const isTracked = status.status === 'tracked';
      if (isTracked) {
        let content: string;
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch {
          content = '';
        }
        const beforeSettle = countFootnoteHeadersWithStatus(content, 'accepted');
        out.accepted_unsettled_count = beforeSettle;

        if (settleAccepted && beforeSettle > 0) {
          const { settledContent, settledIds } = settleAcceptedChanges(content);
          if (settledIds.length > 0) {
            await fs.writeFile(filePath, settledContent, 'utf-8');
            out.settled = true;
            out.settled_ids = settledIds;
            await rerecordState(state, filePath, settledContent, config);
          }
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(out) }],
      };
    }

    // No file argument: return project config summary
    const config = await resolver.lastConfig();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            policy_mode: config.policy.mode,
            tracking_default: config.tracking.default,
            auto_header: config.tracking.auto_header,
            include: config.tracking.include,
            exclude: config.tracking.exclude,
            hooks_enforcement: config.hooks.enforcement,
            hooks_exclude: config.hooks.exclude,
            matching_mode: config.matching.mode,
            hashline_enabled: config.hashline.enabled,
            author_default: config.author.default,
            author_enforcement: config.author.enforcement,
          }),
        },
      ],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: msg }],
      isError: true,
    };
  }
}
