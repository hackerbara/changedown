// config.ts — re-exports from ../config (absorbed from @changetracks/config-types)
//
// All config loading logic lives in packages/cli/src/config/.
// This module re-exports everything so existing imports within the engine continue
// to work without changes.

export type { ChangeTracksConfig, PolicyMode, CreationTracking } from '../config/index.js';
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
} from '../config/index.js';
