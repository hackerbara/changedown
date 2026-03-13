"use strict";
// changetracks/config/loader — canonical config loading from .changetracks/config.toml
//
// All packages (mcp-server, hooks-impl, opencode-plugin) should import from
// changetracks/config instead of maintaining their own TOML parsing logic.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asStringArray = asStringArray;
exports.derivePolicyMode = derivePolicyMode;
exports.parseConfigToml = parseConfigToml;
exports.findConfigFile = findConfigFile;
exports.resolveProjectDir = resolveProjectDir;
exports.loadConfig = loadConfig;
exports.resolveProtocolMode = resolveProtocolMode;
exports.isFileInScope = isFileInScope;
const smol_toml_1 = require("smol-toml");
const picomatch_1 = __importDefault(require("picomatch"));
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const index_js_1 = require("./index.js");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function asStringArray(value) {
    if (!Array.isArray(value))
        return undefined;
    if (value.every((v) => typeof v === 'string'))
        return value;
    return undefined;
}
function derivePolicyMode(legacyEnforcement) {
    if (legacyEnforcement === 'block')
        return 'strict';
    if (legacyEnforcement === 'warn')
        return 'safety-net';
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
function parseConfigToml(raw) {
    const parsed = (0, smol_toml_1.parse)(raw);
    const tracking = parsed['tracking'];
    const author = parsed['author'];
    const hooks = parsed['hooks'];
    const matching = parsed['matching'];
    const hashline = parsed['hashline'];
    const settlement = parsed['settlement'];
    const policy = parsed['policy'];
    const protocol = parsed['protocol'];
    const meta = parsed['meta'];
    const review = parsed['review'];
    const reasonRequired = review?.['reason_required'];
    return {
        tracking: {
            include: asStringArray(tracking?.['include']) ?? index_js_1.DEFAULT_CONFIG.tracking.include,
            exclude: asStringArray(tracking?.['exclude']) ?? index_js_1.DEFAULT_CONFIG.tracking.exclude,
            default: tracking?.['default'] === 'tracked' || tracking?.['default'] === 'untracked'
                ? tracking['default']
                : index_js_1.DEFAULT_CONFIG.tracking.default,
            auto_header: typeof tracking?.['auto_header'] === 'boolean'
                ? tracking['auto_header']
                : index_js_1.DEFAULT_CONFIG.tracking.auto_header,
        },
        author: {
            default: typeof author?.['default'] === 'string'
                ? author['default']
                : index_js_1.DEFAULT_CONFIG.author.default,
            enforcement: author?.['enforcement'] === 'optional' || author?.['enforcement'] === 'required'
                ? author['enforcement']
                : index_js_1.DEFAULT_CONFIG.author.enforcement,
        },
        hooks: {
            enforcement: hooks?.['enforcement'] === 'warn' || hooks?.['enforcement'] === 'block'
                ? hooks['enforcement']
                : index_js_1.DEFAULT_CONFIG.hooks.enforcement,
            exclude: asStringArray(hooks?.['exclude']) ?? index_js_1.DEFAULT_CONFIG.hooks.exclude,
            patch_wrap_experimental: typeof hooks?.['patch_wrap_experimental'] === 'boolean'
                ? hooks['patch_wrap_experimental']
                : index_js_1.DEFAULT_CONFIG.hooks.patch_wrap_experimental,
        },
        matching: {
            mode: matching?.['mode'] === 'strict' || matching?.['mode'] === 'normalized'
                ? matching['mode']
                : index_js_1.DEFAULT_CONFIG.matching.mode,
        },
        hashline: {
            enabled: typeof hashline?.['enabled'] === 'boolean'
                ? hashline['enabled']
                : index_js_1.DEFAULT_CONFIG.hashline.enabled,
            auto_remap: typeof hashline?.['auto_remap'] === 'boolean'
                ? hashline['auto_remap']
                : index_js_1.DEFAULT_CONFIG.hashline.auto_remap,
        },
        settlement: {
            auto_on_approve: typeof settlement?.['auto_on_approve'] === 'boolean'
                ? settlement['auto_on_approve']
                : index_js_1.DEFAULT_CONFIG.settlement.auto_on_approve,
            auto_on_reject: typeof settlement?.['auto_on_reject'] === 'boolean'
                ? settlement['auto_on_reject']
                : index_js_1.DEFAULT_CONFIG.settlement.auto_on_reject,
        },
        review: {
            reasonRequired: {
                human: typeof reasonRequired?.['human'] === 'boolean'
                    ? reasonRequired['human']
                    : index_js_1.DEFAULT_CONFIG.review.reasonRequired.human,
                agent: typeof reasonRequired?.['agent'] === 'boolean'
                    ? reasonRequired['agent']
                    : index_js_1.DEFAULT_CONFIG.review.reasonRequired.agent,
            },
        },
        policy: {
            mode: policy?.['mode'] === 'strict' || policy?.['mode'] === 'safety-net' || policy?.['mode'] === 'permissive'
                ? policy['mode']
                : derivePolicyMode(hooks?.['enforcement']),
            creation_tracking: policy?.['creation_tracking'] === 'none' || policy?.['creation_tracking'] === 'footnote' || policy?.['creation_tracking'] === 'inline'
                ? policy['creation_tracking']
                : index_js_1.DEFAULT_CONFIG.policy.creation_tracking,
            default_view: policy?.['default_view'] === 'review' || policy?.['default_view'] === 'changes' || policy?.['default_view'] === 'settled'
                ? policy['default_view']
                : index_js_1.DEFAULT_CONFIG.policy.default_view,
            view_policy: policy?.['view_policy'] === 'suggest' || policy?.['view_policy'] === 'require'
                ? policy['view_policy']
                : index_js_1.DEFAULT_CONFIG.policy.view_policy,
        },
        protocol: {
            mode: protocol?.['mode'] === 'classic' || protocol?.['mode'] === 'compact'
                ? protocol['mode']
                : index_js_1.DEFAULT_CONFIG.protocol.mode,
            level: protocol?.['level'] === 1 || protocol?.['level'] === 2
                ? protocol['level']
                : index_js_1.DEFAULT_CONFIG.protocol.level,
            reasoning: protocol?.['reasoning'] === 'optional' || protocol?.['reasoning'] === 'required'
                ? protocol['reasoning']
                : index_js_1.DEFAULT_CONFIG.protocol.reasoning,
            batch_reasoning: protocol?.['batch_reasoning'] === 'optional' || protocol?.['batch_reasoning'] === 'required'
                ? protocol['batch_reasoning']
                : index_js_1.DEFAULT_CONFIG.protocol.batch_reasoning,
        },
        meta: {
            compact_threshold: typeof meta?.['compact_threshold'] === 'number' && meta['compact_threshold'] > 0
                ? meta['compact_threshold']
                : index_js_1.DEFAULT_CONFIG.meta?.compact_threshold ?? 80,
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
async function findConfigFile(startDir) {
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;
    while (true) {
        const candidate = path.join(dir, '.changetracks', 'config.toml');
        try {
            await fs.access(candidate);
            return candidate;
        }
        catch {
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
async function resolveProjectDir(startDir) {
    const configPath = await findConfigFile(startDir);
    if (!configPath)
        return undefined;
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
async function loadConfig(projectDir) {
    const configPath = await findConfigFile(projectDir);
    if (!configPath) {
        console.error(`changetracks: no .changetracks/config.toml found (searched from ${projectDir} to /), using defaults`);
        return structuredClone(index_js_1.DEFAULT_CONFIG);
    }
    let raw;
    try {
        raw = await fs.readFile(configPath, 'utf-8');
    }
    catch {
        console.error(`changetracks: found ${configPath} but could not read it, using defaults`);
        return structuredClone(index_js_1.DEFAULT_CONFIG);
    }
    try {
        return parseConfigToml(raw);
    }
    catch (err) {
        console.error(`changetracks: ${configPath} contains invalid TOML (${err instanceof Error ? err.message : String(err)}), using defaults`);
        return structuredClone(index_js_1.DEFAULT_CONFIG);
    }
}
// ---------------------------------------------------------------------------
// Protocol mode resolver
// ---------------------------------------------------------------------------
/**
 * Resolves the effective protocol mode by checking the CHANGETRACKS_PROTOCOL_MODE
 * environment variable first. If set to a valid value, it overrides config.
 */
function resolveProtocolMode(configMode) {
    const envVal = process.env['CHANGETRACKS_PROTOCOL_MODE'];
    if (envVal === 'classic' || envVal === 'compact')
        return envVal;
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
function isFileInScope(filePath, config, projectDir) {
    let relative;
    if (path.isAbsolute(filePath)) {
        relative = path.relative(projectDir, filePath);
    }
    else {
        relative = filePath;
    }
    relative = relative.split(path.sep).join('/');
    const matchesInclude = (0, picomatch_1.default)(config.tracking.include);
    const matchesExclude = (0, picomatch_1.default)(config.tracking.exclude);
    return matchesInclude(relative) && !matchesExclude(relative);
}
//# sourceMappingURL=loader.js.map