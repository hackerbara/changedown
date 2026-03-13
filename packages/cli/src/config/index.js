"use strict";
// changetracks/config — shared config schema, types, and TOML loader
Object.defineProperty(exports, "__esModule", { value: true });
exports.asStringArray = exports.derivePolicyMode = exports.isFileInScope = exports.resolveProtocolMode = exports.resolveProjectDir = exports.findConfigFile = exports.parseConfigToml = exports.loadConfig = exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
    tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: true,
    },
    author: {
        default: '',
        enforcement: 'optional',
    },
    hooks: {
        enforcement: 'warn',
        exclude: [],
        patch_wrap_experimental: false,
    },
    matching: {
        mode: 'normalized',
    },
    hashline: {
        enabled: false,
        auto_remap: true,
    },
    settlement: {
        auto_on_approve: true,
        auto_on_reject: true,
    },
    review: {
        reasonRequired: { human: false, agent: true },
    },
    policy: {
        mode: 'safety-net',
        creation_tracking: 'footnote',
        default_view: 'review',
        view_policy: 'suggest',
    },
    protocol: {
        mode: 'classic',
        level: 2,
        reasoning: 'optional',
        batch_reasoning: 'optional',
    },
    meta: {
        compact_threshold: 80,
    },
};
// Re-export loader functions so consumers can import everything from the package root
var loader_js_1 = require("./loader.js");
Object.defineProperty(exports, "loadConfig", { enumerable: true, get: function () { return loader_js_1.loadConfig; } });
Object.defineProperty(exports, "parseConfigToml", { enumerable: true, get: function () { return loader_js_1.parseConfigToml; } });
Object.defineProperty(exports, "findConfigFile", { enumerable: true, get: function () { return loader_js_1.findConfigFile; } });
Object.defineProperty(exports, "resolveProjectDir", { enumerable: true, get: function () { return loader_js_1.resolveProjectDir; } });
Object.defineProperty(exports, "resolveProtocolMode", { enumerable: true, get: function () { return loader_js_1.resolveProtocolMode; } });
Object.defineProperty(exports, "isFileInScope", { enumerable: true, get: function () { return loader_js_1.isFileInScope; } });
Object.defineProperty(exports, "derivePolicyMode", { enumerable: true, get: function () { return loader_js_1.derivePolicyMode; } });
Object.defineProperty(exports, "asStringArray", { enumerable: true, get: function () { return loader_js_1.asStringArray; } });
//# sourceMappingURL=index.js.map