import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, DEFAULT_CONFIG } from 'changetracks-hooks/internals';

describe('loadConfig — direct import from config.ts', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-config-'));
    const scDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(scDir, { recursive: true });
    configPath = path.join(scDir, 'config.toml');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --- Policy section ---

  describe('policy section', () => {
    it('defaults to safety-net when [policy] is absent', async () => {
      await fs.writeFile(configPath, '[tracking]\ninclude = ["**/*.md"]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('safety-net');
    });

    it('parses policy.mode = "strict"', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "strict"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('strict');
    });

    it('parses policy.mode = "permissive"', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "permissive"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('permissive');
    });

    it('parses policy.mode = "safety-net"', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "safety-net"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('safety-net');
    });

    it('falls back to safety-net for invalid mode', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "garbage"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('safety-net');
    });

    it('derives strict from legacy hooks.enforcement = "block" when no [policy]', async () => {
      await fs.writeFile(configPath, '[hooks]\nenforcement = "block"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('strict');
    });

    it('derives safety-net from legacy hooks.enforcement = "warn" when no [policy]', async () => {
      await fs.writeFile(configPath, '[hooks]\nenforcement = "warn"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('safety-net');
    });

    it('policy.mode takes precedence over hooks.enforcement', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "permissive"\n\n[hooks]\nenforcement = "block"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('permissive');
    });
  });

  // --- Creation tracking ---

  describe('creation_tracking', () => {
    it('parses creation_tracking from policy section', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "safety-net"\ncreation_tracking = "footnote"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.creation_tracking).toBe('footnote');
    });

    it('defaults creation_tracking to "footnote" when not specified', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "safety-net"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.creation_tracking).toBe('footnote');
    });

    it('accepts creation_tracking = "none"', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "safety-net"\ncreation_tracking = "none"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.creation_tracking).toBe('none');
    });

    it('accepts creation_tracking = "inline"', async () => {
      await fs.writeFile(configPath, '[policy]\nmode = "safety-net"\ncreation_tracking = "inline"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.creation_tracking).toBe('inline');
    });
  });

  // --- Tracking section ---

  describe('tracking section', () => {
    it('parses include and exclude patterns', async () => {
      await fs.writeFile(configPath, '[tracking]\ninclude = ["docs/**/*.md"]\nexclude = ["docs/archive/**"]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.tracking.include).toEqual(['docs/**/*.md']);
      expect(config.tracking.exclude).toEqual(['docs/archive/**']);
    });

    it('defaults include to ["**/*.md"]', async () => {
      await fs.writeFile(configPath, '[tracking]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.tracking.include).toEqual(['**/*.md']);
    });

    it('defaults exclude to ["node_modules/**", "dist/**"]', async () => {
      await fs.writeFile(configPath, '[tracking]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.tracking.exclude).toEqual(['node_modules/**', 'dist/**']);
    });

    it('parses auto_header = false', async () => {
      await fs.writeFile(configPath, '[tracking]\nauto_header = false\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.tracking.auto_header).toBe(false);
    });

    it('defaults auto_header to true', async () => {
      await fs.writeFile(configPath, '[tracking]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.tracking.auto_header).toBe(true);
    });
  });

  // --- Author section ---

  describe('author section', () => {
    it('parses author.default', async () => {
      await fs.writeFile(configPath, '[author]\ndefault = "ai:claude-opus-4.6"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.author.default).toBe('ai:claude-opus-4.6');
    });

    it('parses author.enforcement = "required"', async () => {
      await fs.writeFile(configPath, '[author]\nenforcement = "required"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.author.enforcement).toBe('required');
    });

    it('defaults author.enforcement to "optional"', async () => {
      await fs.writeFile(configPath, '[author]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.author.enforcement).toBe('optional');
    });
  });

  // --- Hashline section ---

  describe('hashline section', () => {
    it('parses hashline.enabled = true', async () => {
      await fs.writeFile(configPath, '[hashline]\nenabled = true\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.hashline.enabled).toBe(true);
    });

    it('defaults hashline.enabled to false', async () => {
      await fs.writeFile(configPath, '', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.hashline.enabled).toBe(false);
    });

  });

  // --- Missing config file ---

  describe('missing config', () => {
    it('returns DEFAULT_CONFIG when .changetracks/config.toml does not exist', async () => {
      const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-hooks-noconf-'));
      try {
        const config = await loadConfig(emptyDir);
        expect(config).toEqual(DEFAULT_CONFIG);
      } finally {
        await fs.rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  // --- Hooks section ---

  describe('hooks section', () => {
    it('parses hooks.enforcement = "block"', async () => {
      await fs.writeFile(configPath, '[hooks]\nenforcement = "block"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.hooks.enforcement).toBe('block');
    });

    it('defaults hooks.enforcement to "warn"', async () => {
      await fs.writeFile(configPath, '', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.hooks.enforcement).toBe('warn');
    });

    it('parses hooks.exclude patterns', async () => {
      await fs.writeFile(configPath, '[hooks]\nexclude = ["llm-garden/**"]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.hooks.exclude).toEqual(['llm-garden/**']);
    });

    it('defaults hooks.exclude to empty array', async () => {
      await fs.writeFile(configPath, '', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.hooks.exclude).toEqual([]);
    });
  });

  // --- Matching section ---

  describe('matching section', () => {
    it('parses matching.mode = "strict"', async () => {
      await fs.writeFile(configPath, '[matching]\nmode = "strict"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.matching.mode).toBe('strict');
    });

    it('defaults matching.mode to "normalized"', async () => {
      await fs.writeFile(configPath, '', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.matching.mode).toBe('normalized');
    });
  });
});
