// internals.ts — barrel export for test consumption
// This file is NOT part of the production bundle (esbuild entry points).
// It is compiled by `tsc` and exposed via the `./internals` subpath export.
// ── Top-level hooks (Claude Code facade) ────────────────────────────
// These re-export from adapters/claude-code/*. Tests that previously imported
// from the facade OR directly from adapters/claude-code/* get the same function.
export { handlePreToolUse } from './pre-tool-use.js';
export { handlePostToolUse } from './post-tool-use.js';
export { handleStop, findEditPosition, findDeletionInsertionPoint } from './stop.js';
// ── Pending edits ───────────────────────────────────────────────────
export { readPendingEdits, appendPendingEdit, clearPendingEdits, clearSessionEdits, } from './pending.js';
// ── Shared / config / scope ────────────────────────────────────────
export { loadConfig, DEFAULT_CONFIG } from './config.js';
export { isFileInScope, isFileExcludedFromHooks } from './scope.js';
// ── Core modules ────────────────────────────────────────────────────
export { applyPendingEdits } from './core/batch-wrapper.js';
export { classifyEdit, shouldLogEdit } from './core/edit-tracker.js';
export { scanMaxId, allocateIds } from './core/id-allocator.js';
export { evaluateRawEdit, evaluateRawRead, evaluateMcpCall } from './core/policy-engine.js';
export { formatRedirect, formatReadRedirect } from './core/redirect-formatter.js';
// ── Cursor adapters ─────────────────────────────────────────────────
// Renamed to avoid collisions with Claude Code facade re-exports above.
export { handleAfterFileEdit } from './adapters/cursor/after-file-edit.js';
export { handleBeforeMcpExecution } from './adapters/cursor/before-mcp-execution.js';
export { handleBeforeReadFile } from './adapters/cursor/before-read-file.js';
export { handlePreToolUse as cursorPreToolUse, } from './adapters/cursor/pre-tool-use.js';
export { handleCursorStop } from './adapters/cursor/stop.js';
//# sourceMappingURL=internals.js.map