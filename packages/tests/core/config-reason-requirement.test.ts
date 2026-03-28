import { describe, it, expect } from 'vitest';
import { parseProjectConfig } from '@changedown/core/internals';

describe('reasonRequired config', () => {
  it('defaults human reason to optional', () => {
    const config = parseProjectConfig({});
    expect(config.reasonRequired.human).toBe(false);
  });

  it('defaults agent reason to required', () => {
    const config = parseProjectConfig({});
    expect(config.reasonRequired.agent).toBe(true);
  });

  it('reads per-harness reason config from toml', () => {
    const config = parseProjectConfig({
      review: { reason_required: { human: true, agent: false } },
    });
    expect(config.reasonRequired.human).toBe(true);
    expect(config.reasonRequired.agent).toBe(false);
  });

  it('fills missing fields with defaults', () => {
    const config = parseProjectConfig({
      review: { reason_required: { human: true } },
    });
    expect(config.reasonRequired.human).toBe(true);
    expect(config.reasonRequired.agent).toBe(true); // default
  });

  it('ignores non-boolean values', () => {
    const config = parseProjectConfig({
      review: { reason_required: { human: 'yes', agent: 42 } },
    });
    expect(config.reasonRequired.human).toBe(false); // default
    expect(config.reasonRequired.agent).toBe(true);  // default
  });

  it('handles missing review section', () => {
    const config = parseProjectConfig({ unrelated: true });
    expect(config.reasonRequired.human).toBe(false);
    expect(config.reasonRequired.agent).toBe(true);
  });
});
