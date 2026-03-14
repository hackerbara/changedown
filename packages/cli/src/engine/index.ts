/**
 * Engine barrel export.
 *
 * Exposes all engine modules (config, state, handlers, utilities) so that
 * the MCP server and other consumers can import from 'changetracks/engine'.
 */

// ── Config ──
export type { ChangeTracksConfig, PolicyMode, CreationTracking } from './config.js';
export {
  DEFAULT_CONFIG,
  loadConfig,
  parseConfigToml,
  findConfigFile,
  resolveProjectDir,
  isFileInScope,
  resolveProtocolMode,
  derivePolicyMode,
  asStringArray,
} from './config.js';

// ── Config Resolver ──
export { ConfigResolver } from './config-resolver.js';

// ── Session State ──
export { SessionState } from './state.js';
export type { ViewName, FileRecord, ActiveGroup } from './state.js';

// ── State Utilities ──
export { rerecordState } from './state-utils.js';

// ── Author ──
export { resolveAuthor } from './author.js';
export type { ResolveAuthorResult } from './author.js';

// ── Scope ──
export { resolveTrackingStatus } from './scope.js';
export type { TrackingStatus } from './scope.js';

// ── Path Utilities ──
export { toRelativePath } from './path-utils.js';

// ── Guide Composer ──
export { composeGuide } from './guide-composer.js';

// ── File Operations (I/O wrappers re-exported from core) ──
export {
  findUniqueMatch,
  applyProposeChange,
  applySingleOperation,
  appendFootnote,
  extractLineRange,
  replaceUnique,
  stripCriticMarkupWithMap,
  stripCriticMarkup,
  checkCriticMarkupOverlap,
  guardOverlap,
  stripRefsFromContent,
} from './file-ops.js';
export type {
  UniqueMatch,
  ProposeChangeParams,
  ProposeChangeResult as CoreProposeChangeResult,
  CriticMarkupOverlap,
  LineRangeResult,
  ApplySingleOperationParams,
  ApplySingleOperationResult,
} from './file-ops.js';

// ── Argument Helpers ──
export { strArg, optionalStrArg } from './args.js';

// ── Tool Schemas ──
export {
  compactProposeChangeSchema,
  classicProposeChangeSchema,
} from './tool-schemas.js';
export type { ToolSchema } from './tool-schemas.js';

// ── Listed Tools ──
export { getListedTools, getListedToolsWithConfig } from './listed-tools.js';
export type { ListedTool } from './listed-tools.js';

// ── Shared Utilities ──
export { errorResult } from './shared/error-result.js';
export type { ToolResult } from './shared/error-result.js';

// ── Tool Handlers ──
export { handleProposeChange } from './handlers/propose-change.js';
export type { ProposeChangeResult } from './handlers/propose-change.js';
export { handleBeginChangeGroup } from './handlers/begin-change-group.js';
export { handleEndChangeGroup } from './handlers/end-change-group.js';
export { handleReviewChange } from './handlers/review-change.js';
export { applyReview, type Decision } from '@changetracks/core';
export { handleReviewChanges } from './handlers/review-changes.js';
export { handleRespondToThread } from './handlers/respond-to-thread.js';
export { handleListOpenThreads } from './handlers/list-open-threads.js';
export { handleRawEdit } from './handlers/raw-edit.js';
export { handleGetTrackingStatus } from './handlers/get-tracking-status.js';
export { handleReadTrackedFile } from './handlers/read-tracked-file.js';
export { handleGetChange } from './handlers/get-change.js';
export { handleAmendChange } from './handlers/amend-change.js';
export { handleListChanges } from './handlers/list-changes.js';
export { handleSupersedeChange } from './handlers/supersede-change.js';
export { handleProposeBatch } from './handlers/propose-batch.js';
export { handleFindTrackedFiles } from './handlers/find-tracked-files.js';

// ── Handler Utilities ──
export { settleAcceptedChanges, settleRejectedChanges } from './handlers/settle.js';
export { computeAffectedLines } from './handlers/propose-utils.js';
export type { AffectedLineEntry } from './handlers/propose-utils.js';
export { validateOrRelocate, validateOrAutoRemap, tryRelocate, computeLineHash as computeHandlerLineHash } from './handlers/hashline-relocate.js';
export type { RelocationEntry, RelocationResult, AutoRemapResult } from './handlers/hashline-relocate.js';
export { TYPE_MAP, offsetToLineNumber } from './handlers/change-utils.js';

// ── Coordinate Pipeline ──
export { resolveCoordinates, applyCompactOp, resolveAndApply } from './handlers/resolve-and-apply.js';
export type { NormalizedCompactOp, ResolvedCoordinates, ApplyResult } from './handlers/resolve-and-apply.js';
