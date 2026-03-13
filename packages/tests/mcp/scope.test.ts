import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveTrackingStatus } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('resolveTrackingStatus', () => {
  let tmpDir: string;

  const makeConfig = (overrides?: Partial<{
    include: string[];
    exclude: string[];
    default: 'tracked' | 'untracked';
    auto_header: boolean;
    enforcement: 'warn' | 'block';
    mode: 'strict' | 'normalized';
  }>): ChangeTracksConfig => ({
    tracking: {
      include: overrides?.include ?? ['**/*.md'],
      exclude: overrides?.exclude ?? ['node_modules/**', 'dist/**'],
      default: overrides?.default ?? 'tracked',
      auto_header: overrides?.auto_header ?? true,
    },
    author: { default: '', enforcement: 'optional' },
    hooks: { enforcement: overrides?.enforcement ?? 'warn', exclude: [] },
    matching: { mode: overrides?.mode ?? 'normalized' },
    hashline: { enabled: false, auto_remap: false },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-scope-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns file_header source when file has tracked header', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\n# Hello\n');

    const result = await resolveTrackingStatus(filePath, makeConfig(), tmpDir);

    expect(result.status).toBe('tracked');
    expect(result.source).toBe('file_header');
    expect(result.header_present).toBe(true);
    expect(result.project_default).toBe('tracked');
    expect(result.auto_header).toBe(true);
  });

  it('returns file_header source with untracked status when file has untracked header', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- ctrcks.com/v1: untracked -->\n# Hello\n');

    const result = await resolveTrackingStatus(filePath, makeConfig(), tmpDir);

    expect(result.status).toBe('untracked');
    expect(result.source).toBe('file_header');
    expect(result.header_present).toBe(true);
  });

  it('returns project_config source when file has no header but is in scope', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# Just a regular markdown file\n');

    const result = await resolveTrackingStatus(filePath, makeConfig(), tmpDir);

    expect(result.status).toBe('tracked');
    expect(result.source).toBe('project_config');
    expect(result.header_present).toBe(false);
    expect(result.project_default).toBe('tracked');
  });

  it('returns global_default source with untracked when file has no header and is out of scope', async () => {
    const filePath = path.join(tmpDir, 'image.png');
    await fs.writeFile(filePath, 'binary content');

    const result = await resolveTrackingStatus(filePath, makeConfig(), tmpDir);

    expect(result.status).toBe('untracked');
    expect(result.source).toBe('global_default');
    expect(result.header_present).toBe(false);
  });

  it('returns untracked when file has no header and config default is untracked', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# A markdown file\n');

    const config = makeConfig({ default: 'untracked' });
    const result = await resolveTrackingStatus(filePath, config, tmpDir);

    expect(result.status).toBe('untracked');
    expect(result.source).toBe('project_config');
    expect(result.project_default).toBe('untracked');
  });

  it('falls through to config/global for nonexistent file', async () => {
    const filePath = path.join(tmpDir, 'does-not-exist.md');

    const result = await resolveTrackingStatus(filePath, makeConfig(), tmpDir);

    // File doesn't exist, no header. But .md matches include globs,
    // so it falls to project_config layer.
    expect(result.status).toBe('tracked');
    expect(result.source).toBe('project_config');
    expect(result.header_present).toBe(false);
  });

  it('falls through to global_default for nonexistent file out of scope', async () => {
    const filePath = path.join(tmpDir, 'does-not-exist.ts');

    const result = await resolveTrackingStatus(filePath, makeConfig(), tmpDir);

    // .ts doesn't match **/*.md, so falls to global_default
    expect(result.status).toBe('untracked');
    expect(result.source).toBe('global_default');
    expect(result.header_present).toBe(false);
  });

  it('passes through auto_header field correctly', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# Hello\n');

    const configAutoOff = makeConfig({ auto_header: false });
    const result = await resolveTrackingStatus(filePath, configAutoOff, tmpDir);

    expect(result.auto_header).toBe(false);
  });

  it('file header overrides project config even when config says untracked', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\n# Hello\n');

    const config = makeConfig({ default: 'untracked' });
    const result = await resolveTrackingStatus(filePath, config, tmpDir);

    // File header takes precedence over project config
    expect(result.status).toBe('tracked');
    expect(result.source).toBe('file_header');
    expect(result.project_default).toBe('untracked');
  });

  it('file header with untracked overrides project config default tracked', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- ctrcks.com/v1: untracked -->\n# Hello\n');

    const config = makeConfig({ default: 'tracked' });
    const result = await resolveTrackingStatus(filePath, config, tmpDir);

    expect(result.status).toBe('untracked');
    expect(result.source).toBe('file_header');
  });

  it('handles file with header after YAML frontmatter', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      '---',
      'title: My Doc',
      '---',
      '<!-- ctrcks.com/v1: tracked -->',
      '# Content',
    ].join('\n'));

    const result = await resolveTrackingStatus(filePath, makeConfig(), tmpDir);

    expect(result.status).toBe('tracked');
    expect(result.source).toBe('file_header');
    expect(result.header_present).toBe(true);
  });
});
