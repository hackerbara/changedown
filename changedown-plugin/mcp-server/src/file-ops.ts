// Re-exports from changedown engine.
// Canonical implementation lives in packages/cli/src/engine/file-ops.ts (which itself re-exports from @changedown/core).
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
} from 'changedown/engine';
export type {
  UniqueMatch,
  ProposeChangeParams,
  CriticMarkupOverlap,
  LineRangeResult,
  ApplySingleOperationParams,
  ApplySingleOperationResult,
} from 'changedown/engine';
export type { CoreProposeChangeResult as ProposeChangeResult } from 'changedown/engine';
