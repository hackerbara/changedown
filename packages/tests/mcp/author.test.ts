import { describe, it, expect, afterEach } from 'vitest';
import { resolveAuthor } from '@changetracks/mcp/internals';
import type { ChangeTracksConfig } from '@changetracks/mcp/internals';

function makeConfig(overrides: {
  authorDefault?: string;
  authorEnforcement?: 'optional' | 'required';
} = {}): ChangeTracksConfig {
  return {
    tracking: {
      include: ['**/*.md'],
      exclude: ['node_modules/**'],
      default: 'tracked',
      auto_header: true,
    },
    author: {
      default: overrides.authorDefault ?? 'ai:claude-opus-4.6',
      enforcement: overrides.authorEnforcement ?? 'optional',
    },
    hooks: {
      enforcement: 'warn',
      exclude: [],
    },
    matching: {
      mode: 'normalized',
    },
    hashline: {
      enabled: false,
      auto_remap: false,
    },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  };
}

describe('resolveAuthor', () => {
  it('optional + explicit author: uses explicit author', () => {
    const config = makeConfig({ authorEnforcement: 'optional' });
    const result = resolveAuthor('ai:gemini-2.5', config, 'propose_change');

    expect(result.author).toBe('ai:gemini-2.5');
    expect(result.error).toBeUndefined();
  });

  it('optional + missing author: falls back to config default', () => {
    const config = makeConfig({
      authorEnforcement: 'optional',
      authorDefault: 'ai:claude-opus-4.6',
    });
    const result = resolveAuthor(undefined, config, 'propose_change');

    expect(result.author).toBe('ai:claude-opus-4.6');
    expect(result.error).toBeUndefined();
  });

  it('optional + missing author + empty config default: falls back to "unknown"', () => {
    const config = makeConfig({
      authorEnforcement: 'optional',
      authorDefault: '',
    });
    const result = resolveAuthor(undefined, config, 'propose_change');

    expect(result.author).toBe('unknown');
    expect(result.error).toBeUndefined();
  });

  it('required + explicit author: uses explicit author', () => {
    const config = makeConfig({ authorEnforcement: 'required' });
    const result = resolveAuthor('ai:gemini-2.5', config, 'review_change');

    expect(result.author).toBe('ai:gemini-2.5');
    expect(result.error).toBeUndefined();
  });

  it('required + missing author (undefined): returns error', () => {
    const config = makeConfig({ authorEnforcement: 'required' });
    const result = resolveAuthor(undefined, config, 'propose_change');

    expect(result.author).toBe('');
    expect(result.error).toBeDefined();
    expect(result.error!.isError).toBe(true);
    expect(result.error!.message).toContain('propose_change');
    expect(result.error!.message).toContain('author');
  });

  it('required + empty string author: returns error', () => {
    const config = makeConfig({ authorEnforcement: 'required' });
    const result = resolveAuthor('', config, 'respond_to_thread');

    expect(result.author).toBe('');
    expect(result.error).toBeDefined();
    expect(result.error!.isError).toBe(true);
    expect(result.error!.message).toContain('respond_to_thread');
    expect(result.error!.message).toContain('author');
  });

  describe('CHANGETRACKS_AUTHOR env', () => {
    const envKey = 'CHANGETRACKS_AUTHOR';

    afterEach(() => {
      delete process.env[envKey];
    });

    it('optional + missing author + env set: uses env', () => {
      process.env[envKey] = 'ai:composer-1.5';
      const config = makeConfig({ authorEnforcement: 'optional', authorDefault: 'ai:claude-opus-4.6' });
      const result = resolveAuthor(undefined, config, 'propose_change');

      expect(result.author).toBe('ai:composer-1.5');
      expect(result.error).toBeUndefined();
    });

    it('required + missing author + env set: uses env (no error)', () => {
      process.env[envKey] = 'ai:composer-1.5';
      const config = makeConfig({ authorEnforcement: 'required' });
      const result = resolveAuthor(undefined, config, 'propose_change');

      expect(result.author).toBe('ai:composer-1.5');
      expect(result.error).toBeUndefined();
    });

    it('explicit author wins over env', () => {
      process.env[envKey] = 'ai:composer-1.5';
      const config = makeConfig({ authorEnforcement: 'optional' });
      const result = resolveAuthor('ai:gemini-2.5', config, 'propose_change');

      expect(result.author).toBe('ai:gemini-2.5');
    });

    it('empty or whitespace env is ignored, fall back to config/unknown', () => {
      process.env[envKey] = '   ';
      const config = makeConfig({ authorEnforcement: 'optional', authorDefault: 'ai:claude-opus-4.6' });
      const result = resolveAuthor(undefined, config, 'propose_change');

      expect(result.author).toBe('ai:claude-opus-4.6');
    });

    it('required + missing author + env unset: error message mentions env', () => {
      const config = makeConfig({ authorEnforcement: 'required' });
      const result = resolveAuthor(undefined, config, 'propose_change');

      expect(result.error?.message).toContain(envKey);
    });
  });

  describe('author format validation', () => {
    it('rejects author without namespace:identifier format', () => {
      const config = makeConfig({ authorEnforcement: 'required' });
      const result = resolveAuthor('not-valid!!!', config, 'propose_change');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid author format');
    });

    it('accepts valid ai namespace:identifier format', () => {
      const config = makeConfig({ authorEnforcement: 'required' });
      const result = resolveAuthor('ai:claude-opus-4.6', config, 'propose_change');

      expect(result.error).toBeUndefined();
      expect(result.author).toBe('ai:claude-opus-4.6');
    });

    it('accepts human namespace', () => {
      const config = makeConfig({ authorEnforcement: 'required' });
      const result = resolveAuthor('human:alice', config, 'propose_change');

      expect(result.error).toBeUndefined();
      expect(result.author).toBe('human:alice');
    });

    it('rejects missing namespace separator', () => {
      const config = makeConfig({ authorEnforcement: 'optional' });
      const result = resolveAuthor('justname', config, 'propose_change');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid author format');
    });

    it('rejects empty namespace', () => {
      const config = makeConfig({ authorEnforcement: 'optional' });
      const result = resolveAuthor(':name', config, 'propose_change');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid author format');
    });

    it('rejects namespace starting with number', () => {
      const config = makeConfig({ authorEnforcement: 'optional' });
      const result = resolveAuthor('1ai:model', config, 'propose_change');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid author format');
    });

    it('rejects namespace with uppercase', () => {
      const config = makeConfig({ authorEnforcement: 'optional' });
      const result = resolveAuthor('AI:model', config, 'propose_change');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid author format');
    });

    it('accepts identifier with dots, hyphens, underscores', () => {
      const config = makeConfig({ authorEnforcement: 'required' });
      const result = resolveAuthor('ai:claude-opus_4.6', config, 'propose_change');

      expect(result.error).toBeUndefined();
      expect(result.author).toBe('ai:claude-opus_4.6');
    });

    it('does not validate the "unknown" fallback for optional enforcement', () => {
      const config = makeConfig({ authorEnforcement: 'optional', authorDefault: '' });
      const result = resolveAuthor(undefined, config, 'propose_change');

      // "unknown" is a system fallback, not user-provided; should pass through
      expect(result.author).toBe('unknown');
      expect(result.error).toBeUndefined();
    });

    it('validates env-sourced author format', () => {
      process.env['CHANGETRACKS_AUTHOR'] = 'bad!!!format';
      const config = makeConfig({ authorEnforcement: 'required' });
      const result = resolveAuthor(undefined, config, 'propose_change');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid author format');
      delete process.env['CHANGETRACKS_AUTHOR'];
    });

    it('validates config default author format', () => {
      const config = makeConfig({ authorEnforcement: 'optional', authorDefault: 'nonamespace' });
      const result = resolveAuthor(undefined, config, 'propose_change');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Invalid author format');
    });
  });
});
