import * as fs from 'node:fs/promises';
import { errorResult } from '../shared/error-result.js';
import { ConfigResolver } from '../config-resolver.js';
import { SessionState } from '../state.js';
import { rerecordState } from '../state-utils.js';
import { isFileInScope } from '../config.js';
import {
  compact, compactL2, analyzeCompactionCandidates, isL3Format,
} from '@changetracks/core';
import type { CompactionRequest } from '@changetracks/core';

/**
 * Tool definition for the compact_changes MCP tool.
 * Raw JSON Schema -- used when registering the tool with the MCP server.
 */
export const compactChangesTool = {
  name: 'compact_changes',
  description:
    'Compact decided (accepted/rejected) footnotes from a tracked file. ' +
    'Removes targeted footnote blocks, applies body mutations for rejected ' +
    'proposed changes, and inserts a compaction-boundary footnote. ' +
    'Supports both L2 and L3 format documents.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file: {
        type: 'string',
        description: 'Path to the file (absolute or relative to project root)',
      },
      targets: {
        oneOf: [
          {
            type: 'array',
            items: { type: 'string' },
            description: 'Footnote IDs to compact (e.g. ["ct-1", "ct-3"])',
          },
          {
            type: 'string',
            enum: ['all-decided'],
            description: 'Compact all accepted/rejected footnotes',
          },
        ],
        description:
          'Which footnotes to compact: an array of IDs or "all-decided"',
      },
      undecided_policy: {
        type: 'string',
        enum: ['accept', 'reject'],
        description:
          'Policy for proposed (undecided) changes in the target list. ' +
          '"accept" keeps the body as-is; "reject" reverts proposed changes.',
        default: 'accept',
      },
      boundary_meta: {
        type: 'object',
        description:
          'Optional metadata for the compaction-boundary footnote. ' +
          'Keys become key: value lines in the boundary body.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['file', 'targets'],
  },
};

export interface CompactChangesResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Handles a `compact_changes` tool call.
 *
 * Reads the file, detects L2 vs L3 format, calls the appropriate
 * compaction function, writes the result, and returns a summary.
 */
export async function handleCompactChanges(
  args: Record<string, unknown>,
  resolver: ConfigResolver,
  state: SessionState,
): Promise<CompactChangesResult> {
  try {
    // 1. Extract and validate args
    const file = args.file as string | undefined;
    if (!file) {
      return errorResult('Missing required argument: "file"');
    }

    const targets = args.targets as string[] | 'all-decided' | undefined;
    if (!targets) {
      return errorResult('Missing required argument: "targets"');
    }

    // Validate targets shape
    if (targets !== 'all-decided' && !Array.isArray(targets)) {
      return errorResult(
        'Invalid "targets": must be an array of change IDs or "all-decided"',
      );
    }

    const undecidedPolicy = (args.undecided_policy ?? args.undecidedPolicy ?? 'accept') as string;
    if (undecidedPolicy !== 'accept' && undecidedPolicy !== 'reject') {
      return errorResult(
        `Invalid undecided_policy: "${undecidedPolicy}". Must be "accept" or "reject".`,
      );
    }

    const boundaryMeta = (args.boundary_meta ?? args.boundaryMeta) as Record<string, string> | undefined;

    // 2. Resolve file path
    const filePath = resolver.resolveFilePath(file);
    const { config, projectDir } = await resolver.forFile(filePath);

    // 3. Check scope
    if (!isFileInScope(filePath, config, projectDir)) {
      return errorResult(
        `File is not in scope for tracking: "${filePath}". ` +
          'Check .changetracks/config.toml include/exclude patterns.',
      );
    }

    // 4. Read file
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult(`File not found or unreadable: ${msg}`);
    }

    // 5. Detect format and compact
    const l3 = isL3Format(fileContent);
    const compactFn = l3 ? compact : compactL2;

    const request: CompactionRequest = {
      targets,
      undecidedPolicy: undecidedPolicy as 'accept' | 'reject',
      boundaryMeta,
    };

    const result = await compactFn(fileContent, request);

    // 6. Write result
    if (result.text !== fileContent) {
      await fs.writeFile(filePath, result.text, 'utf-8');
    }

    // 7. Re-record state
    await rerecordState(state, filePath, result.text, config);

    // 8. Build response
    const response: Record<string, unknown> = {
      compacted_ids: result.compactedIds,
      format: l3 ? 'L3' : 'L2',
      verification: result.verification,
    };

    if (result.compactedIds.length === 0) {
      response.message = 'No changes were compacted.';
    } else {
      response.message =
        `Compacted ${result.compactedIds.length} change(s): ${result.compactedIds.join(', ')}.`;
    }

    if (!result.verification.valid) {
      response.warning =
        `${result.verification.danglingRefs.length} dangling ref(s) detected: ` +
        result.verification.danglingRefs.join(', ');
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(response) }],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}
