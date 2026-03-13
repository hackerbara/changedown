import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, isFileInScope, isFileExcludedFromHooks, DEFAULT_CONFIG } from '@changetracks/opencode-plugin/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when config file does not exist', async () => {
    const config = await loadConfig(tmpDir);

    expect(config.tracking.include).toEqual(['**/*.md']);
    expect(config.tracking.exclude).toEqual(['node_modules/**', 'dist/**']);
    expect(config.tracking.default).toBe('tracked');
    expect(config.tracking.auto_header).toBe(true);
    expect(config.author.default).toBe('');
    expect(config.author.enforcement).toBe('optional');
    expect(config.hooks.enforcement).toBe('warn');
    expect(config.hooks.exclude).toEqual([]);
    expect(config.matching.mode).toBe('normalized');
    expect(config.hashline.enabled).toBe(false);
  });

  it('returns default settlement section when config file does not exist', async () => {
    const config = await loadConfig(tmpDir);

    expect(config.settlement.auto_on_approve).toBe(true);
    expect(config.settlement.auto_on_reject).toBe(true);
  });

  it('returns default policy section when config file does not exist', async () => {
    const config = await loadConfig(tmpDir);

    expect(config.policy.mode).toBe('safety-net');
    expect(config.policy.creation_tracking).toBe('footnote');
    expect(config.policy.default_view).toBe('review');
    expect(config.policy.view_policy).toBe('suggest');
  });

  it('returns default protocol section when config file does not exist', async () => {
    const config = await loadConfig(tmpDir);

    expect(config.protocol.mode).toBe('classic');
    expect(config.protocol.level).toBe(2);
    expect(config.protocol.reasoning).toBe('optional');
    expect(config.protocol.batch_reasoning).toBe('optional');
  });

  it('returns default meta section when config file does not exist', async () => {
    const config = await loadConfig(tmpDir);

    expect(config.meta).toBeDefined();
    expect(config.meta!.compact_threshold).toBe(80);
  });

  it('parses settlement section from TOML', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[settlement]
auto_on_approve = false
auto_on_reject = true
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.settlement.auto_on_approve).toBe(false);
    expect(config.settlement.auto_on_reject).toBe(true);
  });

  it('parses policy section from TOML', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[policy]
mode = "strict"
creation_tracking = "inline"
default_view = "changes"
view_policy = "require"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.policy.mode).toBe('strict');
    expect(config.policy.creation_tracking).toBe('inline');
    expect(config.policy.default_view).toBe('changes');
    expect(config.policy.view_policy).toBe('require');
  });

  it('parses protocol section from TOML', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[protocol]
mode = "compact"
level = 1
reasoning = "required"
batch_reasoning = "required"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.protocol.mode).toBe('compact');
    expect(config.protocol.level).toBe(1);
    expect(config.protocol.reasoning).toBe('required');
    expect(config.protocol.batch_reasoning).toBe('required');
  });

  it('parses meta section from TOML', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[meta]
compact_threshold = 120
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.meta).toBeDefined();
    expect(config.meta!.compact_threshold).toBe(120);
  });

  it('parses custom include patterns', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[tracking]
include = ["**/*.md", "docs/**/*.txt"]
exclude = ["node_modules/**", "dist/**", ".vscode-test/**"]
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.tracking.include).toEqual(['**/*.md', 'docs/**/*.txt']);
    expect(config.tracking.exclude).toEqual([
      'node_modules/**',
      'dist/**',
      '.vscode-test/**',
    ]);
  });

  it('parses author enforcement settings', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[author]
default = "ai:claude-opus-4.6"
enforcement = "required"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.author.default).toBe('ai:claude-opus-4.6');
    expect(config.author.enforcement).toBe('required');
  });

  it('returns defaults for missing sections in a partial config', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[author]
default = "human:alice"
`
    );

    const config = await loadConfig(tmpDir);

    // tracking section should use defaults
    expect(config.tracking.include).toEqual(['**/*.md']);
    expect(config.tracking.exclude).toEqual(['node_modules/**', 'dist/**']);
    expect(config.tracking.default).toBe('tracked');
    expect(config.tracking.auto_header).toBe(true);
    // author section should use provided value
    expect(config.author.default).toBe('human:alice');
    // hooks and matching should use defaults
    expect(config.hooks.enforcement).toBe('warn');
    expect(config.matching.mode).toBe('normalized');
  });
});

describe('isFileInScope', () => {
  const projectDir = '/projects/my-project';

  const defaultConfig = structuredClone(DEFAULT_CONFIG);

  it('matches markdown files by default', () => {
    const result = isFileInScope(
      path.join(projectDir, 'docs/README.md'),
      defaultConfig,
      projectDir
    );
    expect(result).toBe(true);
  });

  it('excludes node_modules', () => {
    const result = isFileInScope(
      path.join(projectDir, 'node_modules/some-pkg/README.md'),
      defaultConfig,
      projectDir
    );
    expect(result).toBe(false);
  });

  it('excludes non-md files', () => {
    const result = isFileInScope(
      path.join(projectDir, 'src/index.ts'),
      defaultConfig,
      projectDir
    );
    expect(result).toBe(false);
  });
});

describe('isFileExcludedFromHooks', () => {
  const projectDir = '/projects/my-project';

  const configWithHookExcludes = {
    ...structuredClone(DEFAULT_CONFIG),
    tracking: {
      include: ['**/*.md'],
      exclude: ['node_modules/**'],
      default: 'tracked' as const,
      auto_header: true,
    },
    hooks: {
      enforcement: 'warn' as const,
      exclude: ['**/*.config.md', 'templates/**'],
    },
  };

  it('returns false when no hooks exclude patterns are set', () => {
    const config = structuredClone(DEFAULT_CONFIG);

    const result = isFileExcludedFromHooks(
      path.join(projectDir, 'docs/README.md'),
      config,
      projectDir
    );
    expect(result).toBe(false);
  });

  it('returns true for files matching hooks exclude patterns', () => {
    expect(isFileExcludedFromHooks(
      path.join(projectDir, 'project.config.md'),
      configWithHookExcludes,
      projectDir
    )).toBe(true);

    expect(isFileExcludedFromHooks(
      path.join(projectDir, 'templates/template.md'),
      configWithHookExcludes,
      projectDir
    )).toBe(true);
  });

  it('returns false for files not matching hooks exclude patterns', () => {
    const result = isFileExcludedFromHooks(
      path.join(projectDir, 'docs/README.md'),
      configWithHookExcludes,
      projectDir
    );
    expect(result).toBe(false);
  });
});
