import { DEFAULT_CONFIG as CORE_DEFAULT } from '@changedown/core';
import type { CLIConfig } from '../config/index.js';

export type { ChangeDownConfig, CLIConfig, PolicyMode, CreationTracking } from '../config/index.js';

export const DEFAULT_CONFIG: CLIConfig = {
  ...CORE_DEFAULT,
  hooks: {
    enforcement: 'warn',
    exclude: [],
    intercept_tools: true,
    intercept_bash: false,
    patch_wrap_experimental: false,
  },
  protocol: {
    mode: 'classic',
    level: 2,
    reasoning: 'optional',
    batch_reasoning: 'optional',
  },
};

export function resolveProtocolMode(mode: 'classic' | 'compact'): 'classic' | 'compact' {
  return mode === 'compact' ? 'compact' : 'classic';
}

export { SessionState } from './browser-state.js';
export type { BuiltinView, ViewName, FileRecord, ActiveGroup } from './browser-state.js';
export { rerecordState } from './state-utils.js';
export { composeGuide } from './guide-composer.js';
export { errorResult } from './shared/error-result.js';
export { resolveAuthor } from './author.js';
export { prepareClassicProposeChange } from './handlers/propose-classic-memory.js';
export type {
  PrepareClassicProposeInput,
  PreparedClassicPropose,
  PrepareClassicProposeResult,
} from './handlers/propose-classic-memory.js';
export { prepareCompactProposeChange } from './handlers/propose-compact-memory.js';
export type {
  PrepareCompactProposeInput,
  PreparedCompactPropose,
  PrepareCompactProposeResult,
} from './handlers/propose-compact-memory.js';
export { TYPE_MAP, offsetToLineNumber } from './handlers/change-utils.js';
