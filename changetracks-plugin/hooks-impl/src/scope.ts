// scope.ts — File scope checking (include/exclude patterns)
import * as path from 'node:path';
import picomatch from 'picomatch';
import type { ChangeTracksConfig } from './config.js';

// Re-export the canonical isFileInScope from cli/config via config.ts
export { isFileInScope } from './config.js';

/**
 * Checks whether a file is excluded from hook enforcement.
 * Files matching `[hooks] exclude` globs are still in tracking scope
 * (propose_change works) but hooks pass through silently (no warn/block/wrap).
 */
export function isFileExcludedFromHooks(
  filePath: string,
  config: ChangeTracksConfig,
  projectDir: string,
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
