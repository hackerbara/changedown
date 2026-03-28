// config.ts — re-exports from ../config (absorbed from @changedown/config-types)
//
// All config loading logic lives in packages/cli/src/config/.
// This module re-exports everything so existing imports within the engine continue
// to work without changes.

export type { ChangeDownConfig, CLIConfig, PolicyMode, CreationTracking } from '../config/index.js';
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
