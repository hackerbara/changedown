import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, reviewerType, canAccept, canWithdraw } from '@changedown/core';
import type { ChangeDownConfig } from '@changedown/core';

describe('ChangeDownConfig (core)', () => {
  it('DEFAULT_CONFIG has all required sections', () => {
    const config: ChangeDownConfig = DEFAULT_CONFIG;
    expect(config.tracking).toBeDefined();
    expect(config.author).toBeDefined();
    expect(config.matching).toBeDefined();
    expect(config.hashline).toBeDefined();
    expect(config.settlement).toBeDefined();
    expect(config.coherence).toBeDefined();
    expect(config.review).toBeDefined();
    expect(config.reasoning).toBeDefined();
    expect(config.policy).toBeDefined();
  });

  it('review section has {human, agent} pattern for all permissions', () => {
    const r = DEFAULT_CONFIG.review;
    expect(r.may_review).toEqual({ human: true, agent: true });
    expect(r.self_acceptance).toEqual({ human: true, agent: true });
    expect(r.cross_withdrawal).toEqual({ human: false, agent: false });
    expect(r.blocking_labels).toEqual({});
  });

  it('reasoning section has {human, agent} pattern', () => {
    const rz = DEFAULT_CONFIG.reasoning;
    expect(rz.propose).toEqual({ human: false, agent: true });
    expect(rz.review).toEqual({ human: false, agent: true });
  });

  it('coherence threshold defaults to 98', () => {
    expect(DEFAULT_CONFIG.coherence.threshold).toBe(98);
  });

  it('settlement defaults to false (ADR-C compliance)', () => {
    expect(DEFAULT_CONFIG.settlement.auto_on_approve).toBe(false);
    expect(DEFAULT_CONFIG.settlement.auto_on_reject).toBe(false);
  });

  // NOTE: Settlement defaults change from true→false (Phase 0 item A-2).
  // Existing tests that rely on DEFAULT_CONFIG.settlement may need updating.
  // This is a deliberate behavioral change per ADR-C §2.
});

describe('reviewerType', () => {
  it('classifies ai: prefix as agent', () => {
    expect(reviewerType('ai:claude-opus-4.6')).toBe('agent');
  });
  it('classifies ci: prefix as agent', () => {
    expect(reviewerType('ci:changedown-lint')).toBe('agent');
  });
  it('classifies everything else as human', () => {
    expect(reviewerType('alice')).toBe('human');
    expect(reviewerType('bob:security-reviewer')).toBe('human');
  });
  it('handles @ prefix', () => {
    expect(reviewerType('@ai:claude')).toBe('agent');
    expect(reviewerType('@alice')).toBe('human');
  });
});

describe('canAccept', () => {
  it('allows acceptance by default', () => {
    const result = canAccept('bob', 'alice', DEFAULT_CONFIG);
    expect(result.allowed).toBe(true);
  });
  it('blocks self-acceptance when config disallows for human', () => {
    const config = {
      ...DEFAULT_CONFIG,
      review: { ...DEFAULT_CONFIG.review, self_acceptance: { human: false, agent: true } },
    };
    const result = canAccept('alice', 'alice', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cannot accept their own');
  });
  it('blocks agent review when may_review.agent = false', () => {
    const config = {
      ...DEFAULT_CONFIG,
      review: { ...DEFAULT_CONFIG.review, may_review: { human: true, agent: false } },
    };
    const result = canAccept('ai:claude', 'alice', config);
    expect(result.allowed).toBe(false);
  });
});

describe('canWithdraw', () => {
  const defaultConfig = DEFAULT_CONFIG;

  it('allows same-author withdrawal', () => {
    expect(canWithdraw('carol', 'carol', defaultConfig)).toBe(true);
  });
  it('blocks cross-author withdrawal by default', () => {
    expect(canWithdraw('bob', 'carol', defaultConfig)).toBe(false);
  });
  it('allows cross-author when config permits for human', () => {
    const config = {
      ...defaultConfig,
      review: { ...defaultConfig.review, cross_withdrawal: { human: true, agent: false } },
    };
    expect(canWithdraw('bob', 'carol', config)).toBe(true);
  });
  it('respects agent gate', () => {
    const config = {
      ...defaultConfig,
      review: { ...defaultConfig.review, cross_withdrawal: { human: false, agent: true } },
    };
    expect(canWithdraw('ai:claude', 'carol', config)).toBe(true);
    expect(canWithdraw('bob', 'carol', config)).toBe(false);
  });
});
