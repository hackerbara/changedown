// internals.ts — test-only exports for @changetracks/opencode-plugin
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

// config (re-exports from changetracks/config + local isFileExcludedFromHooks)
export {
  loadConfig,
  isFileInScope,
  isFileExcludedFromHooks,
  DEFAULT_CONFIG,
} from './config.js';
export type { ChangeTracksConfig } from './config.js';

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
