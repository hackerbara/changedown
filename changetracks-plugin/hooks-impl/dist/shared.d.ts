export { loadConfig, DEFAULT_CONFIG } from './config.js';
export type { ChangeTracksConfig } from './config.js';
export { isFileInScope, isFileExcludedFromHooks } from './scope.js';
export { readStdin, writeStdout, deriveProjectDir, deriveSessionId } from './adapters/shared.js';
export type { HookInput } from './adapters/shared.js';
