/**
 * Internals barrel export.
 *
 * Exposes command-level functions that are NOT part of the public subpath
 * exports but are needed by the extracted test suite in packages/tests/engine/.
 */

// ── Commands ──
export { computeChangeList } from './commands/list.js';
export type { ChangeListEntry } from './commands/list.js';

export { computeSettlement } from './commands/settle.js';
export type { SettlementResult } from './commands/settle.js';

export { computeStatus } from './commands/status.js';
export type { StatusResult } from './commands/status.js';

export {
  extractThreadEntries,
  formatThreadLines,
  formatAnsiWithThreads,
  isGitDiffDriverInvocation,
} from './commands/diff.js';
export type { ThreadEntry, DiffOptions } from './commands/diff.js';

export { publishSettled } from './commands/publish.js';
