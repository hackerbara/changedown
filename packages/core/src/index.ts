export { parseProjectConfig, type ProjectReviewConfig, type ReasonRequirement } from './config/index.js';
export { parseTimestamp, nowTimestamp, compareTimestamps, formatTimestamp, type Timestamp } from './timestamp.js';
export { ChangeType, ChangeStatus, OffsetRange, ChangeNode, InlineMetadata, TextEdit, PendingOverlay, Approval, Revision, DiscussionComment, Resolution } from './model/types.js';
export { VirtualDocument } from './model/document.js';
export { TokenType } from './parser/tokens.js';
export { CriticMarkupParser, type ParseOptions } from './parser/parser.js';
export { findCodeZones, CodeZone, tryMatchFenceOpen, tryMatchFenceClose, skipInlineCode } from './parser/code-zones.js';
export { computeAccept, computeReject, computeAcceptParts, computeRejectParts, AcceptRejectParts, computeFootnoteStatusEdits, computeApprovalLineEdit, computeFootnoteArchiveLineEdit, ApprovalLineOptions } from './operations/accept-reject.js';
export { computeResolutionEdit, computeUnresolveEdit, ResolutionOptions } from './operations/resolution.js';
export { computeReplyEdit, type ReplyOptions, type ReplyResult } from './operations/reply.js';
export { nextChange, previousChange } from './operations/navigation.js';
export { wrapInsertion, wrapDeletion, wrapSubstitution } from './operations/tracking.js';
export { insertComment } from './operations/comment.js';
export { generateFootnoteDefinition, scanMaxCtId } from './operations/footnote-generator.js';
export { ensureL2, type EnsureL2Options, type EnsureL2Result } from './operations/ensure-l2.js';
export { applyReview, VALID_DECISIONS, type Decision, type ApplyReviewSuccess, type ApplyReviewError } from './operations/apply-review.js';
export { computeAmendEdits, type AmendOptions, type AmendResult, type AmendSuccess, type AmendError } from './operations/amend.js';
export { computeSupersedeResult, type SupersedeOptions, type SupersedeResult, type SupersedeSuccess, type SupersedeError } from './operations/supersede.js';
export { promoteToLevel1, promoteToLevel2 } from './operations/level-promotion.js';
export { compactToLevel1, compactToLevel0 } from './operations/level-descent.js';
export { Workspace } from './workspace.js';
export { CommentSyntax, StrippedLine, getCommentSyntax, wrapLineComment, stripLineComment, escapeRegex, lineOffset } from './comment-syntax.js';
export { annotateMarkdown } from './annotators/markdown-annotator.js';
export { annotateSidecar, AnnotationMetadata } from './annotators/sidecar-annotator.js';
export { SidecarParser } from './parser/sidecar-parser.js';
export { computeSidecarAccept, computeSidecarReject, computeSidecarResolveAll } from './operations/sidecar-accept-reject.js';
export { ChangeProvider } from './providers/change-provider.js';
export { parseTrackingHeader, generateTrackingHeader, insertTrackingHeader, TrackingHeader } from './tracking-header.js';
export { defaultNormalizer, normalizedIndexOf, collapseWhitespace, buildWhitespaceCollapseMap, whitespaceCollapsedFind, whitespaceCollapsedIsAmbiguous, diagnosticConfusableNormalize, unicodeName, tryDiagnosticConfusableMatch, TextNormalizer, WhitespaceCollapsedMatch, ConfusableDifference, DiagnosticConfusableResult } from './text-normalizer.js';
export { computeSettledReplace, computeSettledText, settleAcceptedChangesOnly, settleRejectedChangesOnly, computeSettledView, type SettledTextOptions, type SettledLine, type SettledViewResult } from './operations/settled-text.js';
export { initHashline, ensureHashlineReady, computeLineHash, formatHashLines, parseLineRef, validateLineRef, HashlineMismatchError } from './hashline.js';
export { settledLine, computeSettledLineHash, formatTrackedHashLines, formatTrackedHeader } from './hashline-tracked.js';
export { stripHashlinePrefixes, detectNoOp, relocateHashRef, stripBoundaryEcho } from './hashline-cleanup.js';
export { parseFootnotes, type FootnoteInfo } from './footnote-parser.js';
export { computeCommittedLine, computeCommittedView, formatCommittedOutput, type CommittedLineResult, type CommittedLine, type CommittedViewResult, type FormatOptions, type FootnoteStatus } from './committed-text.js';
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
} from './footnote-patterns.js';
export {
  buildViewSurfaceMap, viewAwareFind,
  type ViewSurfaceMap, type ViewAwareMatch,
} from './view-surface.js';
export {
  findUniqueMatch, applyProposeChange, applySingleOperation,
  appendFootnote, extractLineRange, replaceUnique,
  stripCriticMarkupWithMap, stripCriticMarkup,
  stripCriticMarkupToCommittedWithMap,
  checkCriticMarkupOverlap, guardOverlap, stripRefsFromContent,
  findAllProposedOverlaps, resolveOverlapWithAuthor,
  contentZoneText,
  type UniqueMatch, type ProposeChangeParams, type ProposeChangeResult,
  type CriticMarkupOverlap, type LineRangeResult,
  type ApplySingleOperationParams, type ApplySingleOperationResult,
  type CommittedMapResult, type MarkupRange,
  type ProposedOverlap, type OverlapResolution,
} from './file-ops.js';
export {
  countFootnoteHeadersWithStatus, findFootnoteBlock, parseFootnoteHeader,
  findDiscussionInsertionIndex, findReviewInsertionIndex, findChildFootnoteIds,
  resolveChangeById,
  type FootnoteBlock, type FootnoteHeader,
} from './footnote-utils.js';
export {
  parseAt, resolveAt,
  type ParsedAt, type ResolvedTarget,
} from './at-resolver.js';
export {
  parseOp,
  type ParsedOp,
} from './op-parser.js';
export {
  type ThreeZoneDocument, type ThreeZoneLine, type ContentSpan,
  type LineMetadata, type DeliberationHeader, type LineFlag,
  type ViewName as ThreeZoneViewName,
  type ViewName,
  VIEW_NAME_ALIASES, VIEW_NAME_DISPLAY_NAMES, VIEW_NAMES,
  resolveViewName, nextViewName,
} from './renderers/three-zone-types.js';
export {
  type DecorationIntent, type DecorationKind, type DecorationVisibility,
  buildDecorationIntents,
} from './renderers/decoration-intents.js';
export { formatDocument, formatPlainText, formatAnsi, formatHtml, type ThreeZoneFormatOptions, type AnsiFormatOptions, type HtmlFormatOptions } from './renderers/formatters/index.js';
export {
  buildViewDocument, buildReviewDocument, buildChangesDocument,
  buildSettledDocument, buildRawDocument,
  type ViewOptions, type ReviewBuildOptions, type ChangesViewOptions,
  type SettledViewOptions, type RawViewOptions,
} from './renderers/view-builders/index.js';
export { buildDeliberationHeader, buildLineRefMap, findFootnoteSectionRange } from './renderers/view-builder-utils.js';
export {
  type EditEvent, type PendingBuffer as EditPendingBuffer,
  type EditBoundaryState, type EditBoundaryConfig,
  type Effect as EditBoundaryEffect, type EditPendingOverlay,
  type SignalType, DEFAULT_EDIT_BOUNDARY_CONFIG,
  isEmpty as isBufferEmpty, bufferEnd, containsOffset as bufferContainsOffset,
  extend as extendBuffer, prependOriginal, appendOriginal,
  spliceInsert, spliceDelete, createBuffer,
} from './edit-boundary/index.js';
// classifySignal re-enabled (Task 2)
export { classifySignal } from './edit-boundary/index.js';
export { processEvent } from './edit-boundary/index.js';
export type { ProcessEventContext, ProcessEventResult } from './edit-boundary/index.js';
