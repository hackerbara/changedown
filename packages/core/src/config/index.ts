/**
 * Core configuration types for ChangeDown.
 *
 * Defines the full ChangeDownConfig interface shared across all packages.
 * CLI-specific sections (hooks, protocol, meta) are added by CLIConfig in
 * the CLI package.
 */

// ---------------------------------------------------------------------------
// Scalar types
// ---------------------------------------------------------------------------

export type PolicyMode = 'strict' | 'safety-net' | 'permissive';
export type CreationTracking = 'none' | 'footnote' | 'inline';

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface HumanAgentSplit {
  human: boolean;
  agent: boolean;
}

export interface CoherenceConfig {
  /** Percentage threshold (0-100). Below this = degraded state. Default: 98. */
  threshold: number;
}

// ---------------------------------------------------------------------------
// ChangeDownConfig — the canonical config shape owned by core
// ---------------------------------------------------------------------------

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
  matching: { mode: 'strict' | 'normalized' };
  hashline: { enabled: boolean; auto_remap: boolean };
  settlement: { auto_on_approve: boolean; auto_on_reject: boolean };
  coherence: CoherenceConfig;
  review: {
    may_review: HumanAgentSplit;
    self_acceptance: HumanAgentSplit;
    cross_withdrawal: HumanAgentSplit;
    blocking_labels: Record<string, boolean>;
  };
  reasoning: {
    propose: HumanAgentSplit;
    review: HumanAgentSplit;
  };
  policy: {
    mode: PolicyMode;
    creation_tracking: CreationTracking;
    default_view?: 'review' | 'changes' | 'settled';
    view_policy?: 'suggest' | 'require';
  };
  response?: { affected_lines?: boolean };
}

// ---------------------------------------------------------------------------
// Backward compat aliases (absorbed into new shape)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `HumanAgentSplit` instead. Kept for backward compatibility
 * during the transition period.
 */
export type ReasonRequirement = HumanAgentSplit;

/**
 * @deprecated Use `ChangeDownConfig` instead. Kept for backward
 * compatibility during the transition period.
 */
export interface ProjectReviewConfig {
  reasonRequired: HumanAgentSplit;
  coherence: CoherenceConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: ChangeDownConfig = {
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
  matching: { mode: 'normalized' },
  hashline: { enabled: false, auto_remap: true },
  settlement: { auto_on_approve: false, auto_on_reject: false },
  coherence: { threshold: 98 },
  review: {
    may_review: { human: true, agent: true },
    self_acceptance: { human: true, agent: true },
    cross_withdrawal: { human: false, agent: false },
    blocking_labels: {},
  },
  reasoning: {
    propose: { human: false, agent: true },
    review: { human: false, agent: true },
  },
  policy: {
    mode: 'safety-net',
    creation_tracking: 'footnote',
    default_view: 'review',
    view_policy: 'suggest',
  },
};

// ---------------------------------------------------------------------------
// Parser (backward compat — parses old raw config shape)
// ---------------------------------------------------------------------------

/**
 * Parse project review config from a raw config object.
 *
 * Accepts the shape produced by TOML parsing or VS Code settings.
 * Missing fields fall back to defaults (human: optional, agent: required).
 *
 * Expected input shape:
 * ```
 * { review: { reason_required: { human: true, agent: false } } }
 * ```
 *
 * Returns the legacy `ProjectReviewConfig` shape for backward compatibility
 * with the LSP server and VS Code extension.
 */
export function parseProjectConfig(raw: Record<string, any>): ProjectReviewConfig {
  const review = raw?.review;
  const reasonRaw = review?.reason_required;

  const defaultReasoning = DEFAULT_CONFIG.reasoning.review;

  const reasonRequired = (!reasonRaw || typeof reasonRaw !== 'object')
    ? { ...defaultReasoning }
    : {
        human: typeof reasonRaw.human === 'boolean' ? reasonRaw.human : defaultReasoning.human,
        agent: typeof reasonRaw.agent === 'boolean' ? reasonRaw.agent : defaultReasoning.agent,
      };

  const coherenceRaw = raw?.coherence;
  const threshold = (coherenceRaw && typeof coherenceRaw.threshold === 'number')
    ? Math.max(0, Math.min(100, coherenceRaw.threshold))
    : DEFAULT_CONFIG.coherence.threshold;

  return {
    reasonRequired,
    coherence: { threshold },
  };
}
