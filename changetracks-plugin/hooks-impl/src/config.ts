// config.ts — re-exports from changetracks/config
//
// All config loading logic lives in the changetracks package.
// This module re-exports everything so existing imports within hooks-impl continue
// to work without changes.

export type { ChangeTracksConfig, PolicyMode, CreationTracking } from 'changetracks/config';
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
} from 'changetracks/config';
