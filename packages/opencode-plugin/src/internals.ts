// internals.ts — test-only exports for @changedown/opencode-plugin
//
// This barrel exposes internal modules that are NOT part of the public API.
// Consumed by packages/tests/opencode/ after test extraction.

// file-ops
export {
  extractLineRange,
  findUniqueMatch,
  appendFootnote,
} from './file-ops.js';
export type { LineRangeResult, MatchResult } from './file-ops.js';

// config (re-exports from changedown/config + local isFileExcludedFromHooks)
export {
  loadConfig,
  isFileInScope,
  isFileExcludedFromHooks,
  DEFAULT_CONFIG,
} from './config.js';
export type { ChangeDownConfig } from './config.js';

// state
export { SessionState } from './state.js';
export type { ActiveGroup } from './state.js';

// pending
export {
  readPendingEdits,
  appendPendingEdit,
  clearSessionEdits,
  clearAllEdits,
} from './pending.js';
export type { PendingEdit } from './pending.js';

// hooks (tool.execute.before, tool.execute.after, stop)
export { toolExecuteBeforeHook } from './hooks/tool-execute-before.js';
export { toolExecuteAfterHook } from './hooks/tool-execute-after.js';
export { stopHook } from './hooks/stop.js';

// plugin-level config (.opencode/changedown.json opt-out)
export { loadOpencodePluginConfig } from './opencode-plugin-config.js';
export type { ChangeDownOpencodeConfig } from './opencode-plugin-config.js';

// HookContext type
export type { HookContext } from './types/opencode-plugin.js';
