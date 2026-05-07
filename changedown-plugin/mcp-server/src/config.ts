// Re-exports from changedown engine.
// Canonical implementation lives in packages/cli/src/engine/config.ts.
export type { ChangeDownConfig, PolicyMode, CreationTracking } from '@changedown/cli/engine';
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
} from '@changedown/cli/engine';
export { expandTrackingAbsolutePattern } from '@changedown/cli/config';
