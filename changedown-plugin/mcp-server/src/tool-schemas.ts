// Re-exports from changedown engine.
// Canonical implementation lives in packages/cli/src/engine/tool-schemas.ts.
export {
  compactProposeChangeSchema,
  classicProposeChangeSchema,
} from 'changedown/engine';
export type { ToolSchema } from 'changedown/engine';
