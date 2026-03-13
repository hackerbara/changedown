// changetracks/config — shared config schema, types, and TOML loader

export type PolicyMode = 'strict' | 'safety-net' | 'permissive';
export type CreationTracking = 'none' | 'footnote' | 'inline';

export interface ChangeTracksConfig {
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
    reasonRequired: { human: boolean; agent: boolean };
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

export const DEFAULT_CONFIG: ChangeTracksConfig = {
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
    default_view: 'review' as const,
    view_policy: 'suggest' as const,
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
