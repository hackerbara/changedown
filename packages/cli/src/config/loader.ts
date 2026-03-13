// changetracks/config/loader — canonical config loading from .changetracks/config.toml
//
// All packages (mcp-server, hooks-impl, opencode-plugin) should import from
// changetracks/config instead of maintaining their own TOML parsing logic.

import { parse } from 'smol-toml';
import picomatch from 'picomatch';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ChangeTracksConfig, PolicyMode } from './index.js';
import { DEFAULT_CONFIG } from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.every((v) => typeof v === 'string')) return value as string[];
  return undefined;
}

export function derivePolicyMode(
  legacyEnforcement: string | undefined,
): PolicyMode {
  if (legacyEnforcement === 'block') return 'strict';
  if (legacyEnforcement === 'warn') return 'safety-net';
  return 'safety-net';
}

// ---------------------------------------------------------------------------
// TOML → ChangeTracksConfig (pure parsing, no I/O)
// ---------------------------------------------------------------------------

/**
 * Parses an already-read TOML string into a fully populated ChangeTracksConfig.
 * Missing sections are filled from DEFAULT_CONFIG.
 *
 * This is the single canonical implementation of the TOML→config mapping.
 * Consumers that need custom I/O (e.g. walk-up directory search) can call
 * this after reading the file themselves.
 */
export function parseConfigToml(raw: string): ChangeTracksConfig {
  const parsed = parse(raw) as Record<string, unknown>;

  const tracking = parsed['tracking'] as Record<string, unknown> | undefined;
  const author = parsed['author'] as Record<string, unknown> | undefined;
  const hooks = parsed['hooks'] as Record<string, unknown> | undefined;
  const matching = parsed['matching'] as Record<string, unknown> | undefined;
  const hashline = parsed['hashline'] as Record<string, unknown> | undefined;
  const settlement = parsed['settlement'] as Record<string, unknown> | undefined;
  const policy = parsed['policy'] as Record<string, unknown> | undefined;
  const protocol = parsed['protocol'] as Record<string, unknown> | undefined;
  const meta = parsed['meta'] as Record<string, unknown> | undefined;
  const review = parsed['review'] as Record<string, unknown> | undefined;
  const reasonRequired = review?.['reason_required'] as Record<string, unknown> | undefined;

  return {
    tracking: {
      include: asStringArray(tracking?.['include']) ?? DEFAULT_CONFIG.tracking.include,
      exclude: asStringArray(tracking?.['exclude']) ?? DEFAULT_CONFIG.tracking.exclude,
      default: tracking?.['default'] === 'tracked' || tracking?.['default'] === 'untracked'
        ? tracking['default']
        : DEFAULT_CONFIG.tracking.default,
      auto_header: typeof tracking?.['auto_header'] === 'boolean'
        ? tracking['auto_header']
        : DEFAULT_CONFIG.tracking.auto_header,
    },
    author: {
      default: typeof author?.['default'] === 'string'
        ? author['default']
        : DEFAULT_CONFIG.author.default,
      enforcement: author?.['enforcement'] === 'optional' || author?.['enforcement'] === 'required'
        ? author['enforcement']
        : DEFAULT_CONFIG.author.enforcement,
    },
    hooks: {
      enforcement: hooks?.['enforcement'] === 'warn' || hooks?.['enforcement'] === 'block'
        ? hooks['enforcement']
        : DEFAULT_CONFIG.hooks.enforcement,
      exclude: asStringArray(hooks?.['exclude']) ?? DEFAULT_CONFIG.hooks.exclude,
      patch_wrap_experimental: typeof hooks?.['patch_wrap_experimental'] === 'boolean'
        ? hooks['patch_wrap_experimental']
        : DEFAULT_CONFIG.hooks.patch_wrap_experimental,
    },
    matching: {
      mode: matching?.['mode'] === 'strict' || matching?.['mode'] === 'normalized'
        ? matching['mode']
        : DEFAULT_CONFIG.matching.mode,
    },
    hashline: {
      enabled: typeof hashline?.['enabled'] === 'boolean'
        ? hashline['enabled']
        : DEFAULT_CONFIG.hashline.enabled,
      auto_remap: typeof hashline?.['auto_remap'] === 'boolean'
        ? hashline['auto_remap']
        : DEFAULT_CONFIG.hashline.auto_remap,
    },
    settlement: {
      auto_on_approve: typeof settlement?.['auto_on_approve'] === 'boolean'
        ? settlement['auto_on_approve']
        : DEFAULT_CONFIG.settlement.auto_on_approve,
      auto_on_reject: typeof settlement?.['auto_on_reject'] === 'boolean'
        ? settlement['auto_on_reject']
        : DEFAULT_CONFIG.settlement.auto_on_reject,
    },
    review: {
      reasonRequired: {
        human: typeof reasonRequired?.['human'] === 'boolean'
          ? reasonRequired['human']
          : DEFAULT_CONFIG.review.reasonRequired.human,
        agent: typeof reasonRequired?.['agent'] === 'boolean'
          ? reasonRequired['agent']
          : DEFAULT_CONFIG.review.reasonRequired.agent,
      },
    },
    policy: {
      mode: policy?.['mode'] === 'strict' || policy?.['mode'] === 'safety-net' || policy?.['mode'] === 'permissive'
        ? policy['mode']
        : derivePolicyMode(hooks?.['enforcement'] as string | undefined),
      creation_tracking: policy?.['creation_tracking'] === 'none' || policy?.['creation_tracking'] === 'footnote' || policy?.['creation_tracking'] === 'inline'
        ? policy['creation_tracking']
        : DEFAULT_CONFIG.policy.creation_tracking,
      default_view: policy?.['default_view'] === 'review' || policy?.['default_view'] === 'changes' || policy?.['default_view'] === 'settled'
        ? policy['default_view']
        : DEFAULT_CONFIG.policy.default_view,
      view_policy: policy?.['view_policy'] === 'suggest' || policy?.['view_policy'] === 'require'
        ? policy['view_policy']
        : DEFAULT_CONFIG.policy.view_policy,
    },
    protocol: {
      mode: protocol?.['mode'] === 'classic' || protocol?.['mode'] === 'compact'
        ? protocol['mode']
        : DEFAULT_CONFIG.protocol.mode,
      level: protocol?.['level'] === 1 || protocol?.['level'] === 2
        ? protocol['level']
        : DEFAULT_CONFIG.protocol.level,
      reasoning: protocol?.['reasoning'] === 'optional' || protocol?.['reasoning'] === 'required'
        ? protocol['reasoning']
        : DEFAULT_CONFIG.protocol.reasoning,
      batch_reasoning: protocol?.['batch_reasoning'] === 'optional' || protocol?.['batch_reasoning'] === 'required'
        ? protocol['batch_reasoning']
        : DEFAULT_CONFIG.protocol.batch_reasoning,
    },
    meta: {
      compact_threshold: typeof meta?.['compact_threshold'] === 'number' && meta['compact_threshold'] > 0
        ? meta['compact_threshold']
        : DEFAULT_CONFIG.meta?.compact_threshold ?? 80,
    },
  };
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Walks up from `startDir` looking for `.changetracks/config.toml`.
 * Returns the path to the config file if found, or undefined.
 */
export async function findConfigFile(startDir: string): Promise<string | undefined> {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, '.changetracks', 'config.toml');
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Not found at this level, try parent
    }

    const parent = path.dirname(dir);
    if (parent === dir || dir === root) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Resolves the project root by finding `.changetracks/config.toml` starting from
 * `startDir`. Returns the directory that contains `.changetracks/`, or undefined.
 */
export async function resolveProjectDir(startDir: string): Promise<string | undefined> {
  const configPath = await findConfigFile(startDir);
  if (!configPath) return undefined;
  return path.dirname(path.dirname(configPath));
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Loads ChangeTracks configuration from `.changetracks/config.toml`.
 *
 * First checks the given project directory, then walks up parent directories
 * (like git does for `.git/`). Returns default values if no config file is
 * found. Missing sections in a partial config file are filled with defaults.
 */
export async function loadConfig(projectDir: string): Promise<ChangeTracksConfig> {
  const configPath = await findConfigFile(projectDir);

  if (!configPath) {
    console.error(
      `changetracks: no .changetracks/config.toml found (searched from ${projectDir} to /), using defaults`
    );
    return structuredClone(DEFAULT_CONFIG);
  }

  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf-8');
  } catch {
    console.error(
      `changetracks: found ${configPath} but could not read it, using defaults`
    );
    return structuredClone(DEFAULT_CONFIG);
  }

  try {
    return parseConfigToml(raw);
  } catch (err) {
    console.error(
      `changetracks: ${configPath} contains invalid TOML (${err instanceof Error ? err.message : String(err)}), using defaults`
    );
    return structuredClone(DEFAULT_CONFIG);
  }
}

// ---------------------------------------------------------------------------
// Protocol mode resolver
// ---------------------------------------------------------------------------

/**
 * Resolves the effective protocol mode by checking the CHANGETRACKS_PROTOCOL_MODE
 * environment variable first. If set to a valid value, it overrides config.
 */
export function resolveProtocolMode(
  configMode: 'classic' | 'compact',
): 'classic' | 'compact' {
  const envVal = process.env['CHANGETRACKS_PROTOCOL_MODE'];
  if (envVal === 'classic' || envVal === 'compact') return envVal;
  return configMode;
}

// ---------------------------------------------------------------------------
// Scope checking
// ---------------------------------------------------------------------------

/**
 * Checks whether a file path is in tracking scope based on include/exclude
 * glob patterns. The file path is resolved relative to `projectDir`.
 *
 * A file is in scope when it matches at least one include pattern AND does
 * not match any exclude pattern.
 */
export function isFileInScope(
  filePath: string,
  config: ChangeTracksConfig,
  projectDir: string,
): boolean {
  let relative: string;
  if (path.isAbsolute(filePath)) {
    relative = path.relative(projectDir, filePath);
  } else {
    relative = filePath;
  }
  relative = relative.split(path.sep).join('/');

  const matchesInclude = picomatch(config.tracking.include);
  const matchesExclude = picomatch(config.tracking.exclude);

  return matchesInclude(relative) && !matchesExclude(relative);
}
