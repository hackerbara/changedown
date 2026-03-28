export type PolicyMode = 'strict' | 'safety-net' | 'permissive';
export type CreationTracking = 'none' | 'footnote' | 'inline';
export interface ChangeDownConfig {
    tracking: {
        include: string[];
        exclude: string[];
        default: 'tracked' | 'untracked';
        auto_header: boolean;
    };
    author: {
        default: string;
        enforcement: 'optional' | 'required';
    };
    hooks: {
        enforcement: 'warn' | 'block';
        exclude: string[];
        patch_wrap_experimental?: boolean;
    };
    matching: {
        mode: 'strict' | 'normalized';
    };
    hashline: {
        enabled: boolean;
        auto_remap: boolean;
    };
    settlement: {
        auto_on_approve: boolean;
        auto_on_reject: boolean;
    };
    review: {
        reasonRequired: {
            human: boolean;
            agent: boolean;
        };
    };
    policy: {
        mode: PolicyMode;
        creation_tracking: CreationTracking;
        default_view?: 'review' | 'changes' | 'settled';
        view_policy?: 'suggest' | 'require';
    };
    protocol: {
        mode: 'classic' | 'compact';
        level: 1 | 2;
        reasoning: 'optional' | 'required';
        batch_reasoning: 'optional' | 'required';
    };
    meta?: {
        compact_threshold: number;
    };
}
export declare const DEFAULT_CONFIG: ChangeDownConfig;
export { loadConfig, parseConfigToml, findConfigFile, resolveProjectDir, resolveProtocolMode, isFileInScope, derivePolicyMode, asStringArray, } from './loader.js';
