import type { ChangeTracksConfig } from './config.js';
export { isFileInScope } from './config.js';
/**
 * Checks whether a file is excluded from hook enforcement.
 * Files matching `[hooks] exclude` globs are still in tracking scope
 * (propose_change works) but hooks pass through silently (no warn/block/wrap).
 */
export declare function isFileExcludedFromHooks(filePath: string, config: ChangeTracksConfig, projectDir: string): boolean;
