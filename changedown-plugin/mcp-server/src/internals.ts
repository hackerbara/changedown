// internals.ts — barrel export for test consumption
// This file is NOT part of the production bundle (esbuild entry points).
// It is compiled by `tsc` and exposed via the `./internals` subpath export.

// ── Config ──────────────────────────────────────────────────────────
export {
  DEFAULT_CONFIG,
  loadConfig,
  resolveProjectDir,
  isFileInScope,
  expandTrackingAbsolutePattern,
  resolveProtocolMode,
} from './config.js';
export type { ChangeDownConfig } from './config.js';

// ── Config resolver ─────────────────────────────────────────────────
export { ConfigResolver } from './config-resolver.js';

// ── Session state ───────────────────────────────────────────────────
export { SessionState } from './state.js';
export { rerecordState } from './state-utils.js';

// ── Tool handlers ───────────────────────────────────────────────────
export { handleProposeChange } from './tools/propose-change.js';
export { handleProposeBatch } from './tools/propose-batch.js';
export { handleReviewChange, applyReview } from './tools/review-change.js';
export { handleReviewChanges } from './tools/review-changes.js';
export { handleReadTrackedFile } from './tools/read-tracked-file.js';
export { handleGetChange } from './tools/get-change.js';
export { handleAmendChange } from './tools/amend-change.js';
export { handleListChanges } from './tools/list-changes.js';
export { handleListOpenThreads } from './tools/list-open-threads.js';
export { handleGetTrackingStatus } from './tools/get-tracking-status.js';
export { handleRawEdit } from './tools/raw-edit.js';
export { handleRespondToThread } from './tools/respond-to-thread.js';
export { handleResolveThread, resolveThreadTool } from './tools/resolve-thread.js';
export { handleBeginChangeGroup } from './tools/begin-change-group.js';
export { handleEndChangeGroup } from './tools/end-change-group.js';
export { handleSupersedeChange } from './tools/supersede-change.js';
export { applyAcceptedChanges, applyRejectedChanges } from './tools/settle.js';
export {
  computeLineHash,
  validateOrRelocate,
  validateOrAutoRemap,
  tryRelocate,
} from './tools/hashline-relocate.js';
export type { RelocationResult } from './tools/hashline-relocate.js';
export { initHashline, HashlineMismatchError } from '@changedown/core';

// ── Core utilities ──────────────────────────────────────────────────
export { parseAt, resolveAt } from './at-resolver.js';
export type { ResolvedTarget } from './at-resolver.js';

export { parseOp } from './op-parser.js';
export type { ParsedOp } from './op-parser.js';

export {
  applyProposeChange,
  replaceUnique,
  findUniqueMatch,
  checkCriticMarkupOverlap,
  guardOverlap,
} from './file-ops.js';

export { resolveAuthor, synthesizeAuthorFromClientInfo } from './author.js';
export type { ClientInfo } from './author.js';
export { resolveTrackingStatus } from './scope.js';
export { countFootnoteHeadersWithStatus } from './footnote-utils.js';
export { composeGuide } from './guide-composer.js';
export { buildViewSurfaceMap, viewAwareFind } from './view-surface.js';
export { getListedTools, getListedToolsWithConfig } from './listed-tools.js';
export {
  compactProposeChangeSchema,
  classicProposeChangeSchema,
} from './tool-schemas.js';

// ── Coordinate Pipeline ──────────────────────────────────────────────
export {
  prepareClassicProposeChange,
  prepareCompactProposeChange,
  resolveCoordinates,
  applyCompactOp,
  resolveAndApply,
} from '@changedown/cli/engine';
export type {
  PrepareClassicProposeInput,
  PreparedClassicPropose,
  PrepareClassicProposeResult,
  PrepareCompactProposeInput,
  PreparedCompactPropose,
  PrepareCompactProposeResult,
  NormalizedCompactOp,
  ResolvedCoordinates,
  ApplyResult,
} from '@changedown/cli/engine';

// ── MCP Resources ───────────────────────────────────────────────────
export { ResourceLister, ResourceReader, SubscriptionManager } from './resources/index.js';
export type { ReadResourceResult, ResourceNotification, SubscriptionManagerOptions } from './resources/index.js';
export { normalizeDocumentTarget } from './document-target.js';
export type { NormalizedDocumentTarget } from './document-target.js';
export { applyPreparedWordProposeChange, prepareWordProposeChange } from './word-propose.js';
export type { PreparedWordPropose, PrepareWordProposeInput, WordProposalFamily } from './word-propose.js';
// ── Word backend adapters ─────────────────────────────────────────
export { prepareWordReviewChanges, applyWordReviewChanges } from './word-review.js';
export type { PreparedWordReviewChanges, WordReviewOperation, WordReviewValidationError } from './word-review.js';

// ── Remote relay MCP factory ───────────────────────────────────────
export { createRemoteRelayServer } from './remote/remote-server-factory.js';
export { getRemoteWordTools, REMOTE_WORD_TOOL_NAMES } from './remote/remote-tool-list.js';
export type { RelayRequestContext, RelayRoomClient, RelayAuthContext, RelayClientInfo } from './remote/relay-context.js';
export { withRemoteMcpClient, listRemoteToolsViaMcp, callRemoteToolViaMcp } from './remote/mcp-inmemory-client.js';
export { openApiFromMcpTools } from './remote/openapi-from-mcp.js';
export { handleRemoteHttpFacade } from './remote/http-facade.js';
