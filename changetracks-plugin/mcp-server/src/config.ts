// Re-exports from changetracks engine.
// Canonical implementation lives in packages/cli/src/engine/config.ts.
export type { ChangeTracksConfig, PolicyMode, CreationTracking } from 'changetracks/engine';
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
} from 'changetracks/engine';
