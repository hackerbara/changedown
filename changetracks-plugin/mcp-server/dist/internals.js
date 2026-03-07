// internals.ts — barrel export for test consumption
// This file is NOT part of the production bundle (esbuild entry points).
// It is compiled by `tsc` and exposed via the `./internals` subpath export.
// ── Config ──────────────────────────────────────────────────────────
export { DEFAULT_CONFIG, loadConfig, resolveProjectDir, isFileInScope, resolveProtocolMode, } from './config.js';
// ── Config resolver ─────────────────────────────────────────────────
export { ConfigResolver } from './config-resolver.js';
// ── Session state ───────────────────────────────────────────────────
export { SessionState } from './state.js';
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
export { handleBeginChangeGroup } from './tools/begin-change-group.js';
export { handleEndChangeGroup } from './tools/end-change-group.js';
export { handleSupersedeChange } from './tools/supersede-change.js';
export { settleAcceptedChanges, settleRejectedChanges } from './tools/settle.js';
export { computeLineHash, validateOrRelocate, validateOrAutoRemap, tryRelocate, } from './tools/hashline-relocate.js';
// ── Core utilities ──────────────────────────────────────────────────
export { parseAt, resolveAt } from './at-resolver.js';
export { parseOp } from './op-parser.js';
export { applyProposeChange, replaceUnique, findUniqueMatch, checkCriticMarkupOverlap, guardOverlap, } from './file-ops.js';
export { resolveAuthor } from './author.js';
export { resolveTrackingStatus } from './scope.js';
export { normalizeContentPayload } from './content-normalizer.js';
export { countFootnoteHeadersWithStatus } from './footnote-utils.js';
export { composeGuide } from './guide-composer.js';
export { buildViewSurfaceMap, viewAwareFind } from './view-surface.js';
export { getListedTools, getListedToolsWithConfig } from './listed-tools.js';
export { compactProposeChangeSchema, classicProposeChangeSchema, } from './tool-schemas.js';
//# sourceMappingURL=internals.js.map