import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { isFileInScope, isFileExcludedFromHooks, loadConfig, DEFAULT_CONFIG } from 'changedown-hooks/internals';
import type { ChangeDownConfig } from 'changedown-hooks/internals';

describe('isFileInScope — direct import from scope.ts', () => {
  const projectDir = '/project';

  it('matches markdown files with default config', () => {
    expect(isFileInScope('/project/readme.md', DEFAULT_CONFIG, projectDir)).toBe(true);
    expect(isFileInScope('/project/docs/guide.md', DEFAULT_CONFIG, projectDir)).toBe(true);
  });

  it('rejects non-markdown files with default config', () => {
    expect(isFileInScope('/project/index.js', DEFAULT_CONFIG, projectDir)).toBe(false);
    expect(isFileInScope('/project/src/main.ts', DEFAULT_CONFIG, projectDir)).toBe(false);
  });

  it('excludes node_modules by default', () => {
    expect(isFileInScope('/project/node_modules/pkg/readme.md', DEFAULT_CONFIG, projectDir)).toBe(false);
  });

  it('excludes dist by default', () => {
    expect(isFileInScope('/project/dist/output.md', DEFAULT_CONFIG, projectDir)).toBe(false);
  });

  it('handles relative file paths', () => {
    expect(isFileInScope('readme.md', DEFAULT_CONFIG, projectDir)).toBe(true);
    expect(isFileInScope('docs/guide.md', DEFAULT_CONFIG, projectDir)).toBe(true);
    expect(isFileInScope('index.js', DEFAULT_CONFIG, projectDir)).toBe(false);
  });

  it('respects custom include patterns', () => {
    const config: ChangeDownConfig = {
      ...DEFAULT_CONFIG,
      tracking: {
        ...DEFAULT_CONFIG.tracking,
        include: ['docs/**/*.md'],
      },
    };
    expect(isFileInScope('/project/docs/guide.md', config, projectDir)).toBe(true);
    expect(isFileInScope('/project/readme.md', config, projectDir)).toBe(false);
  });

  it('respects custom exclude patterns', () => {
    const config: ChangeDownConfig = {
      ...DEFAULT_CONFIG,
      tracking: {
        ...DEFAULT_CONFIG.tracking,
        exclude: ['drafts/**'],
      },
    };
    expect(isFileInScope('/project/readme.md', config, projectDir)).toBe(true);
    expect(isFileInScope('/project/drafts/wip.md', config, projectDir)).toBe(false);
  });
});

describe('isFileExcludedFromHooks — direct import from scope.ts', () => {
  const projectDir = '/project';

  it('returns false when hooks.exclude is empty', () => {
    expect(isFileExcludedFromHooks('/project/readme.md', DEFAULT_CONFIG, projectDir)).toBe(false);
  });

  it('returns true for files matching hooks.exclude patterns', () => {
    const config: ChangeDownConfig = {
      ...DEFAULT_CONFIG,
      hooks: {
        ...DEFAULT_CONFIG.hooks,
        exclude: ['llm-garden/**'],
      },
    };
    expect(isFileExcludedFromHooks('/project/llm-garden/essay.md', config, projectDir)).toBe(true);
  });

  it('returns false for files NOT matching hooks.exclude patterns', () => {
    const config: ChangeDownConfig = {
      ...DEFAULT_CONFIG,
      hooks: {
        ...DEFAULT_CONFIG.hooks,
        exclude: ['llm-garden/**'],
      },
    };
    expect(isFileExcludedFromHooks('/project/docs/guide.md', config, projectDir)).toBe(false);
  });

  it('handles relative file paths', () => {
    const config: ChangeDownConfig = {
      ...DEFAULT_CONFIG,
      hooks: {
        ...DEFAULT_CONFIG.hooks,
        exclude: ['llm-garden/**'],
      },
    };
    expect(isFileExcludedFromHooks('llm-garden/essay.md', config, projectDir)).toBe(true);
    expect(isFileExcludedFromHooks('docs/guide.md', config, projectDir)).toBe(false);
  });
});

describe('isFileInScope — integration with loadConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-hooks-scope-'));
    const scDir = path.join(tmpDir, '.changedown');
    await fs.mkdir(scDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uses config loaded from TOML to determine scope', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.changedown', 'config.toml'),
      '[tracking]\ninclude = ["docs/**/*.md"]\nexclude = ["docs/archive/**"]\n',
      'utf-8',
    );
    const config = await loadConfig(tmpDir);

    expect(isFileInScope(path.join(tmpDir, 'docs', 'guide.md'), config, tmpDir)).toBe(true);
    expect(isFileInScope(path.join(tmpDir, 'docs', 'archive', 'old.md'), config, tmpDir)).toBe(false);
    expect(isFileInScope(path.join(tmpDir, 'readme.md'), config, tmpDir)).toBe(false);
  });
});
