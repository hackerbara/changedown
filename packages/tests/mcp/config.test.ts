import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, resolveProjectDir, isFileInScope, type ChangeTracksConfig } from '@changetracks/mcp/internals';
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

  it('parses a valid config file correctly', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[tracking]
include = ["**/*.md", "docs/**/*.txt"]
exclude = ["node_modules/**", "dist/**", ".vscode-test/**"]

[author]
default = "ai:claude-opus-4.6"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.tracking.include).toEqual(['**/*.md', 'docs/**/*.txt']);
    expect(config.tracking.exclude).toEqual([
      'node_modules/**',
      'dist/**',
      '.vscode-test/**',
    ]);
    expect(config.author.default).toBe('ai:claude-opus-4.6');
  });

  it('returns defaults when config file does not exist', async () => {
    const config = await loadConfig(tmpDir);

    expect(config.tracking.include).toEqual(['**/*.md']);
    expect(config.tracking.exclude).toEqual(['node_modules/**', 'dist/**']);
    expect(config.author.default).toBe('');
    // New fields should have defaults
    expect(config.tracking.default).toBe('tracked');
    expect(config.tracking.auto_header).toBe(true);
    expect(config.hooks.enforcement).toBe('warn');
    expect(config.matching.mode).toBe('normalized');
  });

  it('finds config in parent directory when started from subdirectory', async () => {
    // Create config in tmpDir (the "project root")
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[tracking]
include = ["**/*.md"]
exclude = ["node_modules/**", "dist/**", ".vscode-test/**"]

[hashline]
enabled = true
`
    );

    // Create a nested subdirectory to load from
    const subDir = path.join(tmpDir, 'packages', 'mcp-server', 'src');
    await fs.mkdir(subDir, { recursive: true });

    const config = await loadConfig(subDir);

    // Should have found the parent's config, not defaults
    expect(config.tracking.exclude).toEqual(['node_modules/**', 'dist/**', '.vscode-test/**']);
    expect(config.hashline.enabled).toBe(true);
  });

  it('prefers config in startDir over parent directory config', async () => {
    // Create config in parent (tmpDir)
    const parentConfigDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(parentConfigDir);
    await fs.writeFile(
      path.join(parentConfigDir, 'config.toml'),
      `[author]
default = "parent-author"
`
    );

    // Create config in child
    const childDir = path.join(tmpDir, 'child');
    const childConfigDir = path.join(childDir, '.changetracks');
    await fs.mkdir(childConfigDir, { recursive: true });
    await fs.writeFile(
      path.join(childConfigDir, 'config.toml'),
      `[author]
default = "child-author"
`
    );

    const config = await loadConfig(childDir);

    // Should use the closer (child) config
    expect(config.author.default).toBe('child-author');
  });

  it('logs warning to stderr when no config found', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await loadConfig(tmpDir);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('no .changetracks/config.toml found')
      );
    } finally {
      stderrSpy.mockRestore();
    }
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

  it('parses config with all new fields', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[tracking]
include = ["**/*.md"]
exclude = ["node_modules/**"]
default = "untracked"
auto_header = false

[author]
default = "ai:claude-opus-4.6"

[hooks]
enforcement = "block"

[matching]
mode = "strict"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.tracking.default).toBe('untracked');
    expect(config.tracking.auto_header).toBe(false);
    expect(config.hooks.enforcement).toBe('block');
    expect(config.matching.mode).toBe('strict');
  });

  it('uses defaults for missing new fields in partial config (backward compat)', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    // Old-style config with no new fields
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[tracking]
include = ["**/*.md", "**/*.txt"]
exclude = ["dist/**"]

[author]
default = "human:bob"
`
    );

    const config = await loadConfig(tmpDir);

    // Existing fields parsed correctly
    expect(config.tracking.include).toEqual(['**/*.md', '**/*.txt']);
    expect(config.tracking.exclude).toEqual(['dist/**']);
    expect(config.author.default).toBe('human:bob');
    // New fields get defaults
    expect(config.tracking.default).toBe('tracked');
    expect(config.tracking.auto_header).toBe(true);
    expect(config.hooks.enforcement).toBe('warn');
    expect(config.matching.mode).toBe('normalized');
  });

  it('handles partial new fields (only some new fields present)', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[tracking]
include = ["**/*.md"]
exclude = ["node_modules/**"]
default = "untracked"

[hooks]
enforcement = "block"
`
    );

    const config = await loadConfig(tmpDir);

    // Explicitly set new fields
    expect(config.tracking.default).toBe('untracked');
    expect(config.hooks.enforcement).toBe('block');
    // Missing new fields get defaults
    expect(config.tracking.auto_header).toBe(true);
    expect(config.matching.mode).toBe('normalized');
    // Missing author section gets default
    expect(config.author.default).toBe('');
  });

  it('parses author.enforcement = "required"', async () => {
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

    expect(config.author.enforcement).toBe('required');
    expect(config.author.default).toBe('ai:claude-opus-4.6');
  });

  it('parses author.enforcement = "optional"', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[author]
default = "ai:claude-opus-4.6"
enforcement = "optional"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.author.enforcement).toBe('optional');
  });

  it('defaults author.enforcement to "optional" when missing', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[author]
default = "ai:claude-opus-4.6"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.author.enforcement).toBe('optional');
  });

  it('defaults author.enforcement to "optional" for invalid value', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[author]
default = "ai:claude-opus-4.6"
enforcement = "banana"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.author.enforcement).toBe('optional');
  });

  // --- hashline section ---

  it('defaults hashline.enabled to false when no config file', async () => {
    const config = await loadConfig(tmpDir);

    expect(config.hashline.enabled).toBe(false);
  });

  it('defaults hashline section when missing from config', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[author]
default = "human:alice"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.hashline.enabled).toBe(false);
  });

  it('parses hashline.enabled = true', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[hashline]
enabled = true
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.hashline.enabled).toBe(true);
  });

  it('parses hashline.enabled = false', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[hashline]
enabled = false
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.hashline.enabled).toBe(false);
  });

  it('defaults hashline.enabled to false for non-boolean value', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[hashline]
enabled = "yes"
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.hashline.enabled).toBe(false);
  });

  // --- settlement section ---

  it('defaults settlement.auto_on_approve to true when no config file', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.settlement.auto_on_approve).toBe(true);
  });

  it('parses settlement.auto_on_approve from [settlement] section', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[settlement]
auto_on_approve = false
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.settlement.auto_on_approve).toBe(false);
  });

  it('parses hashline alongside all other sections', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[tracking]
include = ["**/*.md"]
exclude = ["node_modules/**"]

[author]
default = "ai:claude-opus-4.6"

[hooks]
enforcement = "block"

[matching]
mode = "strict"

[hashline]
enabled = true
`
    );

    const config = await loadConfig(tmpDir);

    expect(config.tracking.include).toEqual(['**/*.md']);
    expect(config.author.default).toBe('ai:claude-opus-4.6');
    expect(config.hooks.enforcement).toBe('block');
    expect(config.matching.mode).toBe('strict');
    expect(config.hashline.enabled).toBe(true);
  });

  // --- policy section ---

  describe('policy section', () => {
    it('defaults to safety-net when [policy] is absent', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[tracking]\ninclude = ["**/*.md"]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('safety-net');
    });

    it('parses policy.mode = "strict"', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nmode = "strict"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('strict');
    });

    it('parses policy.mode = "permissive"', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nmode = "permissive"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('permissive');
    });

    it('parses policy.mode = "safety-net"', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nmode = "safety-net"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('safety-net');
    });

    it('falls back to safety-net for invalid mode', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nmode = "garbage"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('safety-net');
    });

    it('derives strict from legacy hooks.enforcement = "block" when no [policy]', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[hooks]\nenforcement = "block"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('strict');
    });

    it('derives safety-net from legacy hooks.enforcement = "warn" when no [policy]', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[hooks]\nenforcement = "warn"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('safety-net');
    });

    it('policy.mode takes precedence over hooks.enforcement', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nmode = "permissive"\n\n[hooks]\nenforcement = "block"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.mode).toBe('permissive');
    });

    // --- default_view and view_policy ---

    it('parses default_view and view_policy from config', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nmode = "strict"\ndefault_view = "changes"\nview_policy = "require"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.default_view).toBe('changes');
      expect(config.policy.view_policy).toBe('require');
    });

    it('defaults default_view to "review" when not specified', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nmode = "strict"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.default_view).toBe('review');
    });

    it('defaults view_policy to "suggest" when not specified', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nmode = "strict"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.view_policy).toBe('suggest');
    });

    it('parses default_view = "settled"', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\ndefault_view = "settled"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.default_view).toBe('settled');
    });

    it('defaults default_view for invalid value', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\ndefault_view = "garbage"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.default_view).toBe('review');
    });

    it('defaults view_policy for invalid value', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[policy]\nview_policy = "garbage"\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.view_policy).toBe('suggest');
    });

    it('defaults default_view and view_policy when [policy] is absent', async () => {
      const configDir = path.join(tmpDir, '.changetracks');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, 'config.toml'), '[tracking]\ninclude = ["**/*.md"]\n', 'utf-8');
      const config = await loadConfig(tmpDir);
      expect(config.policy.default_view).toBe('review');
      expect(config.policy.view_policy).toBe('suggest');
    });
  });
});

describe('resolveProjectDir', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-resolve-project-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns directory containing .changetracks when config exists above startDir', async () => {
    const configDir = path.join(tmpDir, '.changetracks');
    await fs.mkdir(configDir);
    await fs.writeFile(path.join(configDir, 'config.toml'), '[tracking]\ninclude = ["**/*.md"]\n');

    const nestedScriptDir = path.join(tmpDir, 'changetracks-plugin', 'mcp-server', 'dist');
    await fs.mkdir(nestedScriptDir, { recursive: true });

    const resolved = await resolveProjectDir(nestedScriptDir);

    expect(resolved).toBe(tmpDir);
  });

  it('returns undefined when no config found above startDir', async () => {
    const childDir = path.join(tmpDir, 'child', 'dist');
    await fs.mkdir(childDir, { recursive: true });

    const resolved = await resolveProjectDir(childDir);

    expect(resolved).toBeUndefined();
  });
});

describe('isFileInScope', () => {
  const projectDir = '/projects/my-project';

  const defaultConfig: ChangeTracksConfig = {
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
    },
    matching: {
      mode: 'normalized',
    },
    hashline: {
      enabled: false,
      auto_remap: false,
    },
    settlement: {
      auto_on_approve: true,
      auto_on_reject: true,
    },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  };

  it('returns true for a markdown file matching **/*.md', () => {
    const result = isFileInScope(
      path.join(projectDir, 'docs/README.md'),
      defaultConfig,
      projectDir
    );
    expect(result).toBe(true);
  });

  it('returns false for a TypeScript file not matching **/*.md', () => {
    const result = isFileInScope(
      path.join(projectDir, 'src/index.ts'),
      defaultConfig,
      projectDir
    );
    expect(result).toBe(false);
  });

  it('returns false for a file in node_modules even if it matches include', () => {
    const result = isFileInScope(
      path.join(projectDir, 'node_modules/some-pkg/README.md'),
      defaultConfig,
      projectDir
    );
    expect(result).toBe(false);
  });

  it('returns false for a file in dist even if it matches include', () => {
    const result = isFileInScope(
      path.join(projectDir, 'dist/output.md'),
      defaultConfig,
      projectDir
    );
    expect(result).toBe(false);
  });

  it('handles absolute paths by converting to relative', () => {
    // Absolute path should produce the same result as relative
    const absResult = isFileInScope(
      '/projects/my-project/docs/notes.md',
      defaultConfig,
      projectDir
    );
    expect(absResult).toBe(true);
  });

  it('handles relative paths directly', () => {
    // If someone passes a path already relative to projectDir
    const result = isFileInScope(
      'docs/notes.md',
      defaultConfig,
      projectDir
    );
    expect(result).toBe(true);
  });

  it('works with multiple include patterns', () => {
    const config: ChangeTracksConfig = {
      tracking: {
        include: ['**/*.md', '**/*.txt'],
        exclude: ['node_modules/**'],
        default: 'tracked',
        auto_header: true,
      },
      author: { default: '', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: false, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };

    expect(isFileInScope(path.join(projectDir, 'notes.txt'), config, projectDir)).toBe(true);
    expect(isFileInScope(path.join(projectDir, 'README.md'), config, projectDir)).toBe(true);
    expect(isFileInScope(path.join(projectDir, 'main.ts'), config, projectDir)).toBe(false);
  });

  it('returns false for a file matching no include patterns', () => {
    const result = isFileInScope(
      path.join(projectDir, 'image.png'),
      defaultConfig,
      projectDir
    );
    expect(result).toBe(false);
  });
});
