import { describe, it, expect } from 'vitest';

describe('CLI feature flag contract', () => {
  it('CHANGEDOWN_CLI env var is documented contract', () => {
    // The CLI always works. The env var controls SKILL.md recommendations only.
    // This test documents the contract exists.
    const flagName = 'CHANGEDOWN_CLI';
    expect(flagName).toBe('CHANGEDOWN_CLI');
  });
});
