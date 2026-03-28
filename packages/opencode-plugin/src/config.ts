// config.ts — re-exports from changedown/config
//
// All config loading logic lives in the changedown package.
// This module re-exports everything so existing imports within opencode-plugin
// continue to work without changes.

import * as path from 'node:path';
import picomatch from 'picomatch';
import type { ChangeDownConfig } from 'changedown/config';

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

// ---------------------------------------------------------------------------
// hooks-specific scope check (not part of the shared cli/config module)
// ---------------------------------------------------------------------------

/**
 * Checks whether a file is excluded from hook enforcement.
 * Files matching `[hooks] exclude` globs are still in tracking scope
 * (propose_change works) but hooks pass through silently (no warn/block/wrap).
 */
export function isFileExcludedFromHooks(
  filePath: string,
  config: ChangeDownConfig,
  projectDir: string
): boolean {
  if (config.hooks.exclude.length === 0) return false;

  let relative: string;
  if (path.isAbsolute(filePath)) {
    relative = path.relative(projectDir, filePath);
  } else {
    relative = filePath;
  }
  relative = relative.split(path.sep).join('/');

  return picomatch(config.hooks.exclude)(relative);
}
