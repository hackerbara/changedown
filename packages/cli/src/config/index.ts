// changetracks/config — shared config schema, types, and TOML loader
//
// Core owns the canonical ChangeTracksConfig interface.
// CLI extends it with hooks, protocol, and meta sections.

import {
  DEFAULT_CONFIG as CORE_DEFAULT,
  type ChangeTracksConfig as CoreConfig,
} from '@changetracks/core';

// Re-export core types so downstream consumers can import from 'changetracks/config'
export { type PolicyMode, type CreationTracking, type HumanAgentSplit, type CoherenceConfig } from '@changetracks/core';

// ---------------------------------------------------------------------------
// CLIConfig — extends core with CLI-only sections
// ---------------------------------------------------------------------------

export interface CLIConfig extends CoreConfig {
  hooks: {
    enforcement: 'warn' | 'block';
    exclude: string[];
    intercept_tools: boolean;
    intercept_bash: boolean;
    patch_wrap_experimental?: boolean;
  };
  protocol: {
    mode: 'classic' | 'compact';
    level: 1 | 2;
    reasoning: 'optional' | 'required';
    batch_reasoning: 'optional' | 'required';
  };
}

// ---------------------------------------------------------------------------
// Backward compat: ChangeTracksConfig = CLIConfig
//
// All downstream packages (hooks-impl, mcp-server, opencode-plugin) and
// ~80+ test files import `ChangeTracksConfig` from the CLI. To avoid a
// massive rename, we keep the alias.
// ---------------------------------------------------------------------------

export type ChangeTracksConfig = CLIConfig;

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: CLIConfig = {
  ...CORE_DEFAULT,
  hooks: {
    enforcement: 'warn',
    exclude: [],
    intercept_tools: true,
    intercept_bash: false,
    patch_wrap_experimental: false,
  },
  protocol: {
    mode: 'classic',
    level: 2,
    reasoning: 'optional',
    batch_reasoning: 'optional',
  },
};

// Re-export loader functions so consumers can import everything from the package root
export {
  loadConfig,
  parseConfigToml,
  findConfigFile,
  resolveProjectDir,
  resolveProtocolMode,
  isFileInScope,
  derivePolicyMode,
  asStringArray,
} from './loader.js';
