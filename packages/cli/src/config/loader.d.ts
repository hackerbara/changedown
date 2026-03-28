import type { ChangeDownConfig, PolicyMode } from './index.js';
export declare function asStringArray(value: unknown): string[] | undefined;
export declare function derivePolicyMode(legacyEnforcement: string | undefined): PolicyMode;
/**
 * Parses an already-read TOML string into a fully populated ChangeDownConfig.
 * Missing sections are filled from DEFAULT_CONFIG.
 *
 * This is the single canonical implementation of the TOML→config mapping.
 * Consumers that need custom I/O (e.g. walk-up directory search) can call
 * this after reading the file themselves.
 */
export declare function parseConfigToml(raw: string): ChangeDownConfig;
/**
 * Walks up from `startDir` looking for `.changedown/config.toml`.
 * Returns the path to the config file if found, or undefined.
 */
export declare function findConfigFile(startDir: string): Promise<string | undefined>;
/**
 * Resolves the project root by finding `.changedown/config.toml` starting from
 * `startDir`. Returns the directory that contains `.changedown/`, or undefined.
 */
export declare function resolveProjectDir(startDir: string): Promise<string | undefined>;
/**
 * Loads ChangeDown configuration from `.changedown/config.toml`.
 *
 * First checks the given project directory, then walks up parent directories
 * (like git does for `.git/`). Returns default values if no config file is
 * found. Missing sections in a partial config file are filled with defaults.
 */
export declare function loadConfig(projectDir: string): Promise<ChangeDownConfig>;
/**
 * Resolves the effective protocol mode by checking the CHANGEDOWN_PROTOCOL_MODE
 * environment variable first. If set to a valid value, it overrides config.
 */
export declare function resolveProtocolMode(configMode: 'classic' | 'compact'): 'classic' | 'compact';
/**
 * Checks whether a file path is in tracking scope based on include/exclude
 * glob patterns. The file path is resolved relative to `projectDir`.
 *
 * A file is in scope when it matches at least one include pattern AND does
 * not match any exclude pattern.
 */
export declare function isFileInScope(filePath: string, config: ChangeDownConfig, projectDir: string): boolean;
