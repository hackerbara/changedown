export {
  parseProjectConfig, DEFAULT_CONFIG,
  type ChangeDownConfig, type HumanAgentSplit, type PolicyMode, type CreationTracking,
  type CoherenceConfig,
  // Backward compat aliases (deprecated)
  type ProjectReviewConfig, type ReasonRequirement,
} from './config/index.js';
export { reviewerType, canAccept, canWithdraw, type ParticipantType } from './config/review-permissions.js';
export { parseTimestamp, nowTimestamp, compareTimestamps, formatTimestamp, type Timestamp } from './timestamp.js';
export { ChangeType, ChangeStatus, changeTypeToAbbrev, changeTypeToShortCode, OffsetRange, ChangeNode, InlineMetadata, TextEdit, PendingOverlay, Approval, Revision, DiscussionComment, Resolution, isGhostNode, consumptionLabel, nodeStatus, UnresolvedDiagnostic } from './model/types.js';
export { VirtualDocument, assertResolved } from './model/document.js';
export { TokenType } from './parser/tokens.js';
export { CriticMarkupParser, type ParseOptions } from './parser/parser.js';
export { findCodeZones, buildCodeZoneMask, CodeZone, tryMatchFenceOpen, tryMatchFenceClose, skipInlineCode, isFenceCloserLine } from './parser/code-zones.js';
export { computeAccept, computeReject, computeAcceptParts, computeRejectParts, AcceptRejectParts, computeFootnoteStatusEdits, computeApprovalLineEdit, computeFootnoteArchiveLineEdit, ApprovalLineOptions } from './operations/accept-reject.js';
export { computeResolutionEdit, computeUnresolveEdit, ResolutionOptions } from './operations/resolution.js';
export { computeReplyEdit, type ReplyOptions, type ReplyResult } from './operations/reply.js';
export { nextChange, previousChange } from './operations/navigation.js';
export { wrapInsertion, wrapDeletion, wrapSubstitution } from './operations/tracking.js';
export { insertComment } from './operations/comment.js';
export { generateFootnoteDefinition, scanMaxCnId, buildEditOpFromParts, formatL3EditOpLine, buildContextualL3EditOp, type ContextualEditOpParams } from './operations/footnote-generator.js';
export { ensureL2, type EnsureL2Options, type EnsureL2Result } from './operations/ensure-l2.js';
export { applyReview, VALID_DECISIONS, type Decision, type ApplyReviewSuccess, type ApplyReviewError } from './operations/apply-review.js';
export { computeAmendEdits, type AmendOptions, type AmendResult, type AmendSuccess, type AmendError } from './operations/amend.js';
export { computeSupersedeResult, type SupersedeOptions, type SupersedeResult, type SupersedeSuccess, type SupersedeError } from './operations/supersede.js';
export { promoteToLevel1, promoteToLevel2 } from './operations/level-promotion.js';
export { compactToLevel1, compactToLevel0 } from './operations/level-descent.js';
export {
  analyzeCompactionCandidates, compact, compactL2, checkSupersedesIntegrity,
  type FootnoteRef, type SupersedeChain, type CompactionSurface,
  type CompactionRequest, type CompactedDocument, type VerificationResult,
} from './operations/compact.js';
export { convertL2ToL3, bodyReplacement, buildLineStarts, offsetToLineNumber } from './operations/l2-to-l3.js';
export { convertL3ToL2 } from './operations/l3-to-l2.js';
export { scrubBackward, scrubForward, resolve, traceDependencies, resolveReplayFromParsedFootnotes, type ActiveOperation, type IntermediatePosition, type BackwardPassResult, type ForwardPassResult, type ResolvedChange, type ResolvedDocument, type DependencyReport, type DependentChange, type ReplayFootnote, type ReplayResolutionResult } from './operations/scrub.js';
export { Workspace } from './workspace.js';
export { CommentSyntax, StrippedLine, getCommentSyntax, wrapLineComment, stripLineComment, escapeRegex, lineOffset } from './comment-syntax.js';
export { annotateMarkdown } from './annotators/markdown-annotator.js';
export { annotateSidecar, AnnotationMetadata } from './annotators/sidecar-annotator.js';
export { SidecarParser } from './parser/sidecar-parser.js';
export { FootnoteNativeParser, parseContextualEditOp } from './parser/footnote-native-parser.js';
export { computeSidecarAccept, computeSidecarReject, computeSidecarResolveAll } from './operations/sidecar-accept-reject.js';
export { ChangeProvider } from './providers/change-provider.js';
export { parseTrackingHeader, generateTrackingHeader, insertTrackingHeader, TrackingHeader } from './tracking-header.js';
export { defaultNormalizer, normalizedIndexOf, collapseWhitespace, buildWhitespaceCollapseMap, whitespaceCollapsedFind, whitespaceCollapsedIsAmbiguous, diagnosticConfusableNormalize, unicodeName, tryDiagnosticConfusableMatch, TextNormalizer, WhitespaceCollapsedMatch, ConfusableDifference, DiagnosticConfusableResult } from './text-normalizer.js';
export { computeCurrentReplace, computeCurrentText, computeOriginalText, applyAcceptedChanges, applyRejectedChanges, computeCurrentView, type CurrentTextOptions, type CurrentLine, type CurrentViewResult } from './operations/current-text.js';
export { initHashline, ensureHashlineReady, computeLineHash, formatHashLines, parseLineRef, validateLineRef, HashlineMismatchError } from './hashline.js';
export { currentLine, computeCurrentLineHash, formatTrackedHashLines, formatTrackedHeader } from './hashline-tracked.js';
export { stripHashlinePrefixes, detectNoOp, relocateHashRef, relocateHashRefMulti, stripBoundaryEcho } from './hashline-cleanup.js';
export type { HashStrategy } from './hashline-cleanup.js';
export { findFootnoteBlockStart } from './footnote-utils.js';
/** @deprecated Use parseForFormat() from format-aware-parse.js instead */
export { parseFootnotes, type FootnoteInfo } from './footnote-parser.js';
export { computeDecidedLine, computeDecidedView, formatDecidedOutput, type DecidedLineResult, type DecidedLine, type DecidedViewResult, type FormatOptions, type FootnoteStatus } from './decided-text.js';
export { SIDECAR_BLOCK_MARKER, findSidecarBlockStart } from './constants.js';
export {
  singleLineSubstitution, singleLineDeletion, singleLineInsertion, singleLineHighlight, singleLineComment,
  multiLineSubstitution, multiLineInsertion, multiLineDeletion, multiLineHighlight, multiLineComment,
  HAS_CRITIC_MARKUP, hasCriticMarkup, inlineMarkupAll, markupWithRef,
} from './critic-regex.js';
export {
  FOOTNOTE_ID_PATTERN, FOOTNOTE_ID_NUMERIC_PATTERN,
  FOOTNOTE_REF_ANCHORED, footnoteRefGlobal, footnoteRefNumericGlobal,
  FOOTNOTE_DEF_START, FOOTNOTE_DEF_START_QUICK,
  FOOTNOTE_DEF_LENIENT, FOOTNOTE_DEF_STRICT, FOOTNOTE_DEF_STATUS, FOOTNOTE_DEF_STATUS_VALUE,
  FOOTNOTE_CONTINUATION, FOOTNOTE_THREAD_REPLY,
  FOOTNOTE_L3_EDIT_OP, isL3Format, splitBodyAndFootnotes,
} from './footnote-patterns.js';
export {
  buildViewSurfaceMap, viewAwareFind,
  type ViewSurfaceMap, type ViewAwareMatch,
} from './view-surface.js';
export {
  findUniqueMatch, findUniqueEndpointPairWithCascade, tryFindUniqueMatch, applyProposeChange, applySingleOperation,
  appendFootnote, extractLineRange, replaceUnique,
  stripCriticMarkupWithMap, stripCriticMarkup,
  stripCriticMarkupToCommittedWithMap,
  checkCriticMarkupOverlap, guardOverlap, stripRefsFromContent,
  findAllProposedOverlaps, resolveOverlapWithAuthor,
  contentZoneText,
  type UniqueMatch, type EndpointPairContext, type UniqueEndpointPairMatch,
  type ProposeChangeParams, type ProposeChangeKind, type ProposeChangeResult,
  type CriticMarkupOverlap, type LineRangeResult,
  type ApplySingleOperationParams, type ApplySingleOperationResult,
  type CommittedMapResult, type MarkupRange,
  type ProposedOverlap, type OverlapResolution,
} from './file-ops.js';
export {
  countFootnoteHeadersWithStatus, findFootnoteBlock, parseFootnoteHeader,
  findDiscussionInsertionIndex, findReviewInsertionIndex, findChildFootnoteIds,
  resolveChangeById, extractFootnoteStatuses,
  type FootnoteBlock, type FootnoteHeader,
} from './footnote-utils.js';
export {
  parseAt, resolveAt,
  type ParsedAt, type ResolvedTarget,
} from './at-resolver.js';
export {
  parseOp,
  type ParsedOp, type RangeContext,
} from './op-parser.js';
export {
  type ThreeZoneDocument, type ThreeZoneLine, type ContentSpan,
  type LineMetadata, type DeliberationHeader, type LineFlag,
} from './renderers/three-zone-types.js';
export { formatDocument, formatPlainText, formatAnsi, formatHtml, type ThreeZoneFormatOptions, type AnsiFormatOptions, type HtmlFormatOptions } from './renderers/formatters/index.js';
export {
  buildViewDocument, buildReviewDocument, buildSimpleDocument,
  buildDecidedDocument, buildRawDocument,
  type ViewOptions, type ReviewBuildOptions, type SimpleBuildOptions,
  type DecidedBuildOptions, type RawViewOptions,
} from './renderers/view-builders/index.js';
export { buildDeliberationHeader, buildLineRefMap, findFootnoteSectionRange, computeContinuationLines } from './renderers/view-builder-utils.js';
export {
  type EditEvent, type PendingBuffer as EditPendingBuffer,
  type EditBoundaryState, type EditBoundaryConfig,
  type Effect as EditBoundaryEffect, type EditPendingOverlay,
  type SignalType, DEFAULT_EDIT_BOUNDARY_CONFIG,
  type L2CrystallizeResult, type L3CrystallizeResult, type FullCrystallizeEffect,
  isEmpty as isBufferEmpty, bufferEnd, containsOffset as bufferContainsOffset,
  extend as extendBuffer, prependOriginal, appendOriginal,
  spliceInsert, spliceDelete, createBuffer,
} from './edit-boundary/index.js';
// classifySignal re-enabled (Task 2)
export { classifySignal } from './edit-boundary/index.js';
export { processEvent } from './edit-boundary/index.js';
export type { ProcessEventContext, ProcessEventResult } from './edit-boundary/index.js';
export { validateStructuralIntegrity } from './operations/structural-integrity.js';
export { materializeResolvedChangesForExport, type ExportSettlementResult } from './operations/export-settlement.js';
export { findMarkupRangeById, removeMarkupById, type MarkupKind, type MarkupRangeById } from './operations/markup-by-id.js';
export { parseForFormat, stripFootnoteBlocks } from './format-aware-parse.js';
export { buildSessionHashes } from './renderers/view-builders/session-hashes.js';
export type { SessionHashes, SessionHashesResult } from './renderers/view-builders/session-hashes.js';
export type { CoherenceStatusParams, DecorationDataParams, ChangeCountParams, AllChangesResolvedParams, DiagnosticData } from './lsp-protocol-types.js';

// Typed document model.
// Note: FootnoteHeader is re-exported as TypedFootnoteHeader to avoid a name
// collision with the different FootnoteHeader shape in ./footnote-utils.js
// (which is the pre-Task-5 parsed header). The typed model's version is the
// new canonical one for Plans 2-6.
export type {
  Footnote,
  FootnoteLine,
  FootnoteHeader as TypedFootnoteHeader,
  EditOp,
  DiscussionReply,
  ReviewAction,
} from './model/footnote.js';
export type { L2Document, L3Document, Document } from './model/document.js';
export { parseL2, parseL3, serializeL2, serializeL3 } from './operations/parse-document.js';
export { changeNodesToL3Document } from './operations/changes-to-document.js';
export {
  type DiagnosticKind, type Diagnostic,
  UnresolvedChangesError, StructuralIntegrityError,
} from './model/diagnostic.js';

// Backend port — re-exported from the ./backend subpath for consumers that
// import from the root. The subpath export remains the canonical location.
export {
  parseUri,
  type ParsedUri,
  type DocumentRef,
  type DocumentSnapshotCapability,
  type DocumentSnapshotDiagnostic,
  type DocumentSnapshotReadiness,
  type DocumentSnapshot,
  type ChangeOp,
  type ChangeResult,
  type ChangeSummary,
  type BackendEvent,
  type Unsubscribe,
  type DocumentBackend,
  type DocumentResourceDescriptor,
} from './backend/types.js';
export { BackendRegistry, type BackendEntry } from './backend/registry.js';

export * from './protocol/index.js';
