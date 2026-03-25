import type { ChangeTracksConfig } from './config.js';
import { reviewChangesTool } from './handlers/review-changes.js';
import { readTrackedFileTool } from './handlers/read-tracked-file.js';
import { amendChangeTool } from './handlers/amend-change.js';
import { listChangesTool } from './handlers/list-changes.js';
import { supersedeChangeTool } from './handlers/supersede-change.js';
import { resolveThreadTool } from './handlers/resolve-thread.js';
import {
  classicProposeChangeSchema,
  compactProposeChangeSchema,
} from './tool-schemas.js';

export type ListedTool = {
  name: string;
  description: string;
  inputSchema: unknown;
};

/**
 * Final 7-tool surface returned by MCP listTools (tools/list).
 *
 * 1. read_tracked_file  — read with deliberation-aware projection
 * 2. propose_change     — propose 1-N tracked changes (classic or compact)
 * 3. review_changes     — accept/reject, thread responses, settle
 * 4. amend_change       — revise own proposed change
 * 5. list_changes       — change inventory with detail levels + batch ID lookup
 * 6. supersede_change   — atomically reject + re-propose a change
 * 7. resolve_thread     — resolve or unresolve a change discussion thread
 *
 * get_change is now a backward-compat alias routing through list_changes
 * with detail=full. All other old tools (raw_edit, get_tracking_status,
 * propose_batch, respond_to_thread, list_open_threads, begin/end_change_group,
 * review_change) remain as handlers in index.ts for backward compat.
 */
export function getListedTools(mode: 'classic' | 'compact' = 'classic'): ListedTool[] {
  const proposeChange = mode === 'compact' ? compactProposeChangeSchema : classicProposeChangeSchema;

  return [
    { name: readTrackedFileTool.name, description: readTrackedFileTool.description, inputSchema: readTrackedFileTool.inputSchema },
    { name: proposeChange.name, description: proposeChange.description, inputSchema: proposeChange.inputSchema },
    { name: reviewChangesTool.name, description: reviewChangesTool.description, inputSchema: reviewChangesTool.inputSchema },
    { name: amendChangeTool.name, description: amendChangeTool.description, inputSchema: amendChangeTool.inputSchema },
    { name: listChangesTool.name, description: listChangesTool.description, inputSchema: listChangesTool.inputSchema },
    { name: supersedeChangeTool.name, description: supersedeChangeTool.description, inputSchema: supersedeChangeTool.inputSchema },
    { name: resolveThreadTool.name, description: resolveThreadTool.description, inputSchema: resolveThreadTool.inputSchema },
  ];
}

const AUTHOR_REQUIRED_SUFFIX = ' In this project author is required.';

/**
 * Returns the tool list with author param descriptions enriched from project config.
 * When config.author.enforcement === 'required', appends a hint so the agent sees
 * the requirement before the first write (at list_tools time).
 * Uses protocol mode to select the correct propose_change schema (classic vs compact).
 */
export function getListedToolsWithConfig(config: ChangeTracksConfig, mode: 'classic' | 'compact' = 'classic'): ListedTool[] {
  const tools = getListedTools(mode);
  const suffix =
    config.author?.enforcement === 'required' ? AUTHOR_REQUIRED_SUFFIX : '';
  if (!suffix) return tools;

  return tools.map((t) => {
    const schema = t.inputSchema as { properties?: Record<string, { description?: string }> };
    if (!schema?.properties?.author?.description) return t;
    const cloned = JSON.parse(JSON.stringify(t.inputSchema)) as typeof schema;
    if (cloned.properties?.author?.description) {
      cloned.properties.author.description += suffix;
    }
    return { name: t.name, description: t.description, inputSchema: cloned };
  });
}
