import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, DEFAULT_CONFIG } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';

/**
 * Tests that invalid or malformed config files degrade gracefully to defaults
 * instead of crashing. Exercises both loadConfig() (low-level parser) and
 * ConfigResolver.forFile() (high-level resolver with caching).
 */

let tmpDir: string;

async function setupTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ct-config-degrade-'));
}

async function writeConfig(dir: string, content: string): Promise<void> {
  const configDir = path.join(dir, '.changetracks');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, 'config.toml'), content, 'utf-8');
}

async function ensureConfigDirExists(dir: string): Promise<void> {
  await fs.mkdir(path.join(dir, '.changetracks'), { recursive: true });
}

describe('Config Graceful Degradation', () => {
  beforeEach(async () => {
    tmpDir = await setupTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── loadConfig() direct tests ──────────────────────────────────────────

  describe('loadConfig()', () => {
    it('uses defaults when config file does not exist', async () => {
      // No .changetracks/config.toml created — just a bare temp dir
      const config = await loadConfig(tmpDir);
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('uses defaults when config file is empty', async () => {
      await writeConfig(tmpDir, '');
      const config = await loadConfig(tmpDir);
      // Empty TOML parses to {} — every section is undefined, so all defaults apply
      // parseConfigToml adds response section even when not in TOML
      expect(config).toEqual({ ...DEFAULT_CONFIG, response: { affected_lines: false } });
    });

    it('uses defaults when config contains malformed TOML', async () => {
      await writeConfig(tmpDir, 'this is not valid [[[ toml {{{');
      const config = await loadConfig(tmpDir);
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('does not throw on malformed TOML', async () => {
      await writeConfig(tmpDir, '[tracking\nbad = "unclosed');
      await expect(loadConfig(tmpDir)).resolves.toBeDefined();
    });

    it('fills missing sections with defaults when only [tracking] is present', async () => {
      await writeConfig(tmpDir, `
[tracking]
include = ["**/*.txt"]
exclude = []
default = "untracked"
auto_header = false
`);
      const config = await loadConfig(tmpDir);

      // tracking section is overridden by the file
      expect(config.tracking.include).toEqual(['**/*.txt']);
      expect(config.tracking.default).toBe('untracked');
      expect(config.tracking.auto_header).toBe(false);

      // all other sections fall back to defaults
      expect(config.author).toEqual(DEFAULT_CONFIG.author);
      expect(config.hooks).toEqual(DEFAULT_CONFIG.hooks);
      expect(config.matching).toEqual(DEFAULT_CONFIG.matching);
      expect(config.hashline).toEqual(DEFAULT_CONFIG.hashline);
      expect(config.settlement).toEqual(DEFAULT_CONFIG.settlement);
      expect(config.protocol).toEqual(DEFAULT_CONFIG.protocol);
    });

    it('fills missing sections with defaults when only [author] is present', async () => {
      await writeConfig(tmpDir, `
[author]
default = "alice"
enforcement = "required"
`);
      const config = await loadConfig(tmpDir);

      expect(config.author.default).toBe('alice');
      expect(config.author.enforcement).toBe('required');
      expect(config.tracking).toEqual(DEFAULT_CONFIG.tracking);
      expect(config.hooks).toEqual(DEFAULT_CONFIG.hooks);
      expect(config.hashline).toEqual(DEFAULT_CONFIG.hashline);
    });

    it('uses default for enforcement when value is invalid string', async () => {
      await writeConfig(tmpDir, `
[author]
enforcement = "invalid_value"
`);
      const config = await loadConfig(tmpDir);
      expect(config.author.enforcement).toBe(DEFAULT_CONFIG.author.enforcement);
    });

    it('uses default for hooks.enforcement when value is invalid', async () => {
      await writeConfig(tmpDir, `
[hooks]
enforcement = "explode"
`);
      const config = await loadConfig(tmpDir);
      expect(config.hooks.enforcement).toBe(DEFAULT_CONFIG.hooks.enforcement);
    });

    it('uses default for matching.mode when value is invalid', async () => {
      await writeConfig(tmpDir, `
[matching]
mode = "fuzzy"
`);
      const config = await loadConfig(tmpDir);
      expect(config.matching.mode).toBe(DEFAULT_CONFIG.matching.mode);
    });

    it('uses default for tracking.default when value is invalid', async () => {
      await writeConfig(tmpDir, `
[tracking]
default = "maybe"
`);
      const config = await loadConfig(tmpDir);
      expect(config.tracking.default).toBe(DEFAULT_CONFIG.tracking.default);
    });

    it('uses default for boolean fields when value is not boolean', async () => {
      await writeConfig(tmpDir, `
[tracking]
auto_header = "yes"

[hashline]
enabled = "true"
`);
      const config = await loadConfig(tmpDir);
      expect(config.tracking.auto_header).toBe(DEFAULT_CONFIG.tracking.auto_header);
      expect(config.hashline.enabled).toBe(DEFAULT_CONFIG.hashline.enabled);
    });

    it('uses default for protocol.level when value is not 1 or 2', async () => {
      await writeConfig(tmpDir, `
[protocol]
level = 3
`);
      const config = await loadConfig(tmpDir);
      expect(config.protocol.level).toBe(DEFAULT_CONFIG.protocol.level);
    });

    it('uses default for protocol.mode when value is invalid', async () => {
      await writeConfig(tmpDir, `
[protocol]
mode = "turbo"
`);
      const config = await loadConfig(tmpDir);
      expect(config.protocol.mode).toBe(DEFAULT_CONFIG.protocol.mode);
    });

    it('uses default for protocol.reasoning when value is invalid', async () => {
      await writeConfig(tmpDir, `
[protocol]
reasoning = "always"
batch_reasoning = "never"
`);
      const config = await loadConfig(tmpDir);
      expect(config.protocol.reasoning).toBe(DEFAULT_CONFIG.protocol.reasoning);
      expect(config.protocol.batch_reasoning).toBe(DEFAULT_CONFIG.protocol.batch_reasoning);
    });

    it('uses default for policy.mode when value is invalid', async () => {
      await writeConfig(tmpDir, `
[policy]
mode = "yolo"
`);
      const config = await loadConfig(tmpDir);
      // When policy.mode is invalid and no hooks.enforcement is present,
      // derivePolicyMode(undefined) returns 'safety-net'
      expect(config.policy.mode).toBe('safety-net');
    });

    it('uses default for policy.creation_tracking when value is invalid', async () => {
      await writeConfig(tmpDir, `
[policy]
creation_tracking = "magic"
`);
      const config = await loadConfig(tmpDir);
      expect(config.policy.creation_tracking).toBe(DEFAULT_CONFIG.policy.creation_tracking);
    });

    it('uses default for settlement booleans when values are invalid', async () => {
      await writeConfig(tmpDir, `
[settlement]
auto_on_approve = "yes"
auto_on_reject = 1
`);
      const config = await loadConfig(tmpDir);
      expect(config.settlement.auto_on_approve).toBe(DEFAULT_CONFIG.settlement.auto_on_approve);
      expect(config.settlement.auto_on_reject).toBe(DEFAULT_CONFIG.settlement.auto_on_reject);
    });

    it('uses default for include/exclude when values are not string arrays', async () => {
      await writeConfig(tmpDir, `
[tracking]
include = "not-an-array"
exclude = [42, true]
`);
      const config = await loadConfig(tmpDir);
      expect(config.tracking.include).toEqual(DEFAULT_CONFIG.tracking.include);
      expect(config.tracking.exclude).toEqual(DEFAULT_CONFIG.tracking.exclude);
    });

    it('handles config with only comments and whitespace', async () => {
      await writeConfig(tmpDir, `
# This is a comment-only config
# No actual settings

# Just comments
`);
      const config = await loadConfig(tmpDir);
      expect(config).toEqual({ ...DEFAULT_CONFIG, response: { affected_lines: false } });
    });

    it('handles config with unknown sections gracefully', async () => {
      await writeConfig(tmpDir, `
[unknown_section]
foo = "bar"
baz = 42

[another_unknown]
x = true
`);
      const config = await loadConfig(tmpDir);
      // Unknown sections are ignored; all known sections use defaults
      expect(config).toEqual({ ...DEFAULT_CONFIG, response: { affected_lines: false } });
    });

    it('handles config with mix of valid and invalid fields in same section', async () => {
      await writeConfig(tmpDir, `
[author]
default = "bob"
enforcement = "nonsense"
`);
      const config = await loadConfig(tmpDir);
      // Valid field is used
      expect(config.author.default).toBe('bob');
      // Invalid field falls back to default
      expect(config.author.enforcement).toBe(DEFAULT_CONFIG.author.enforcement);
    });
  });

  // ── ConfigResolver.forFile() tests ─────────────────────────────────────

  describe('ConfigResolver.forFile()', () => {
    it('returns fallback config when no config file exists', async () => {
      const resolver = new ConfigResolver(tmpDir);
      const dummyFile = path.join(tmpDir, 'doc.md');
      await fs.writeFile(dummyFile, '# test', 'utf-8');

      const { config } = await resolver.forFile(dummyFile);
      // ConfigResolver uses its own FALLBACK_CONFIG when no .changetracks/ exists
      expect(config.tracking.include).toEqual(['**/*.md']);
      expect(config.hooks.enforcement).toBe('warn');
      expect(config.matching.mode).toBe('normalized');
      resolver.dispose();
    });

    it('returns parsed config for empty TOML file', async () => {
      await writeConfig(tmpDir, '');
      const resolver = new ConfigResolver(tmpDir);
      const dummyFile = path.join(tmpDir, 'doc.md');
      await fs.writeFile(dummyFile, '# test', 'utf-8');

      const { config } = await resolver.forFile(dummyFile);
      // Empty TOML → parseConfigToml produces all defaults including response section
      expect(config).toEqual({ ...DEFAULT_CONFIG, response: { affected_lines: false } });
      resolver.dispose();
    });

    it('does not throw on malformed TOML via resolver', async () => {
      await writeConfig(tmpDir, ']]]]invalid toml[[[');
      const resolver = new ConfigResolver(tmpDir);
      const dummyFile = path.join(tmpDir, 'doc.md');
      await fs.writeFile(dummyFile, '# test', 'utf-8');

      const { config } = await resolver.forFile(dummyFile);
      expect(config).toEqual(DEFAULT_CONFIG);
      resolver.dispose();
    });

    it('resolves partial config through resolver', async () => {
      await writeConfig(tmpDir, `
[hashline]
enabled = true
`);
      const resolver = new ConfigResolver(tmpDir);
      const dummyFile = path.join(tmpDir, 'doc.md');
      await fs.writeFile(dummyFile, '# test', 'utf-8');

      const { config } = await resolver.forFile(dummyFile);
      expect(config.hashline.enabled).toBe(true);
      // Other sections are defaults
      expect(config.author).toEqual(DEFAULT_CONFIG.author);
      resolver.dispose();
    });
  });
});
