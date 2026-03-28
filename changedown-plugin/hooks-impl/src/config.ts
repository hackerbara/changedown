// config.ts — re-exports from changedown/config
//
// All config loading logic lives in the changedown package.
// This module re-exports everything so existing imports within hooks-impl continue
// to work without changes.

export type { ChangeDownConfig, PolicyMode, CreationTracking } from 'changedown/config';
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
} from 'changedown/config';
