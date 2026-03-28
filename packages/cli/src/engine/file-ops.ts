/**
 * File-ops re-exports from @changedown/core.
 *
 * The pure text-transform functions have been moved into the core package.
 * This module re-exports them so existing MCP server code continues to work
 * without import path changes.
 */

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
  resolveOverlapWithAuthor,
  stripRefsFromContent,
  contentZoneText,
  type UniqueMatch,
  type ProposeChangeParams,
  type ProposeChangeResult,
  type CriticMarkupOverlap,
  type LineRangeResult,
  type ApplySingleOperationParams,
  type ApplySingleOperationResult,
  type OverlapResolution,
} from '@changedown/core';
