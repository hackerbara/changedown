// Re-exports from changedown engine.
// Canonical implementation lives in packages/cli/src/engine/config.ts.
export type { ChangeDownConfig, PolicyMode, CreationTracking } from 'changedown/engine';
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
} from 'changedown/engine';
