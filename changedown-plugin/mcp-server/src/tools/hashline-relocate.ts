// Re-exports from changedown engine.
// Canonical implementation lives in packages/cli/src/engine/handlers/hashline-relocate.ts.
export { computeHandlerLineHash as computeLineHash, validateOrRelocate, validateOrAutoRemap, tryRelocate } from 'changedown/engine';
export type { RelocationEntry, RelocationResult, AutoRemapResult } from 'changedown/engine';
