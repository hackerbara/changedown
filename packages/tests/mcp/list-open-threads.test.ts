import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleListOpenThreads } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changetracks/mcp/internals';

const TODAY = new Date().toISOString().slice(0, 10);

describe('handleListOpenThreads', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-threads-test-'));
    state = new SessionState();
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: true,
      },
      author: {
        default: 'ai:claude-opus-4.6',
        enforcement: 'optional',
      },
      hooks: {
        enforcement: 'warn', exclude: [],
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
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('single file with proposed changes: returns only proposed ones', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Some {~~old~>new~~}[^ct-1] text with {--removed--}[^ct-2] changes.',
        '',
        `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
        `    @ai:claude-opus-4.6 ${TODAY}: Improved wording`,
        '',
        `[^ct-2]: @human:alice | ${TODAY} | del | accepted`,
        `    @human:alice ${TODAY}: Removed redundancy`,
      ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].change_id).toBe('ct-1');
    expect(data[0].status).toBe('proposed');
  });

  it('single file with no proposed changes: returns empty array', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Some {~~old~>new~~}[^ct-1] text.',
        '',
        `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | accepted`,
        `    @ai:claude-opus-4.6 ${TODAY}: Already accepted`,
      ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(0);
  });

  it('extracts correct metadata from footnote header and body', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Hello {++world++}[^ct-3] end.',
        '',
        `[^ct-3]: @ai:claude-opus-4.6 | 2026-02-10 | ins | proposed`,
        '    @ai:claude-opus-4.6 2026-02-10: Added greeting target',
      ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);

    const entry = data[0];
    expect(entry.change_id).toBe('ct-3');
    expect(entry.author).toBe('@ai:claude-opus-4.6');
    expect(entry.date).toBe('2026-02-10');
    expect(entry.type).toBe('ins');
    expect(entry.status).toBe('proposed');
    expect(entry.comment).toBe('Added greeting target');
    expect(entry.file).toBe(path.relative(tmpDir, filePath));
  });

  it('detects request-changes entry in footnote body', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'The {~~quick~>slow~~}[^ct-1] fox.',
        '',
        `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
        `    @ai:claude-opus-4.6 ${TODAY}: Speed correction`,
        `    request-changes: @human:bob ${TODAY} "Needs more context"`,
      ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].has_request_changes).toBe(true);
  });

  it('counts unique participants from discussion lines', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'The {~~old~>new~~}[^ct-1] text.',
        '',
        `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
        `    @ai:claude-opus-4.6 ${TODAY}: Improve clarity`,
        `    @human:alice ${TODAY}: I agree with this change`,
        `    @human:bob ${TODAY}: Looks good to me`,
        `    @ai:claude-opus-4.6 ${TODAY}: Thanks for the feedback`,
      ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    // Three unique participants: @ai:claude-opus-4.6, @human:alice, @human:bob
    expect(data[0].participants).toHaveLength(3);
    expect(data[0].participants).toContain('@ai:claude-opus-4.6');
    expect(data[0].participants).toContain('@human:alice');
    expect(data[0].participants).toContain('@human:bob');
  });

  it('applies default limit of 25 when omitted', async () => {
    const subDir = path.join(tmpDir, 'many');
    await fs.mkdir(subDir, { recursive: true });
    const trackedHeader = '<!-- ctrcks.com/v1: tracked -->\n';
    for (let i = 0; i < 30; i++) {
      const filePath = path.join(subDir, `doc-${i}.md`);
      await fs.writeFile(
        filePath,
        trackedHeader +
          [
            `Doc ${i} {~~old~>new~~}[^ct-1]`,
            '',
            `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
            `    @ai:claude-opus-4.6 ${TODAY}: Change ${i}`,
          ].join('\n')
      );
    }

    const result = await handleListOpenThreads({ path: subDir }, resolver, state);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.length).toBeLessThanOrEqual(25);
    expect(data.length).toBe(25);
    if (data[0]) {
      expect(data[0]).toHaveProperty('change_id');
      expect(data[0]).toHaveProperty('file');
      expect(data[0]).toHaveProperty('status');
    }
  });

  it('honors explicit limit when provided', async () => {
    const subDir = path.join(tmpDir, 'limit-test');
    await fs.mkdir(subDir, { recursive: true });
    const trackedHeader = '<!-- ctrcks.com/v1: tracked -->\n';
    for (let i = 0; i < 10; i++) {
      const filePath = path.join(subDir, `f${i}.md`);
      await fs.writeFile(
        filePath,
        trackedHeader +
          [
            `F ${i} {~~a~>b~~}[^ct-1]`,
            '',
            `[^ct-1]: @ai | ${TODAY} | sub | proposed`,
          ].join('\n')
      );
    }

    const result = await handleListOpenThreads(
      { path: subDir, limit: 3 },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.length).toBeLessThanOrEqual(3);
    expect(data.length).toBe(3);
  });

  it('error: path required when omitted', async () => {
    const result = await handleListOpenThreads({}, resolver, state);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/missing required argument.*path/i);
  });

  it('error: path required when empty string', async () => {
    const result = await handleListOpenThreads(
      { path: '' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/missing required argument.*path/i);
  });

  it('error: file not found', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|no such file|ENOENT/i);
  });

  it('error: file not in scope', async () => {
    const filePath = path.join(tmpDir, 'code.ts');
    await fs.writeFile(filePath, 'const x = 1;');

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not in scope/i);
  });

  it('file with no footnotes: returns empty array', async () => {
    const filePath = path.join(tmpDir, 'plain.md');
    await fs.writeFile(filePath, 'Just a plain markdown file with no changes.\n\nNothing to see here.');

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(0);
  });

  it('directory: aggregates proposed changes from multiple tracked files', async () => {
    const subDir = path.join(tmpDir, 'docs');
    await fs.mkdir(subDir, { recursive: true });
    const trackedHeader = '<!-- ctrcks.com/v1: tracked -->\n';
    const file1 = path.join(subDir, 'a.md');
    const file2 = path.join(subDir, 'b.md');
    await fs.writeFile(
      file1,
      trackedHeader +
        [
          'Doc A {~~old~>new~~}[^ct-1] text.',
          '',
          `[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
          `    @ai:claude-opus-4.6 ${TODAY}: Change in A`,
        ].join('\n')
    );
    await fs.writeFile(
      file2,
      trackedHeader +
        [
          'Doc B {++added++}[^ct-1] text.',
          '',
          `[^ct-1]: @human:alice | ${TODAY} | ins | proposed`,
          `    @human:alice ${TODAY}: Change in B`,
        ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: subDir },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(2);
    const byFile = data.map((d: { file: string }) => d.file);
    expect(byFile).toContain(path.relative(tmpDir, file1));
    expect(byFile).toContain(path.relative(tmpDir, file2));
    expect(data[0].file).toBeDefined();
    expect(data[1].file).toBeDefined();
  });

  it('directory: skips untracked .md files (no tracking header)', async () => {
    const subDir = path.join(tmpDir, 'mixed');
    await fs.mkdir(subDir, { recursive: true });
    const trackedHeader = '<!-- ctrcks.com/v1: tracked -->\n';
    const trackedFile = path.join(subDir, 'tracked.md');
    const untrackedFile = path.join(subDir, 'untracked.md');
    await fs.writeFile(
      trackedFile,
      trackedHeader + 'Tracked {~~x~>y~~}[^ct-1].\n\n[^ct-1]: @ai | ' + TODAY + ' | sub | proposed\n'
    );
    await fs.writeFile(untrackedFile, '# No header\nPlain markdown.\n');

    const result = await handleListOpenThreads(
      { path: subDir },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].file).toBe(path.relative(tmpDir, trackedFile));
  });

  it('status filter: default proposed only', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Some {~~old~>new~~}[^ct-1] and {--x--}[^ct-2].',
        '',
        `[^ct-1]: @ai | ${TODAY} | sub | proposed`,
        '',
        `[^ct-2]: @ai | ${TODAY} | del | accepted`,
      ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].change_id).toBe('ct-1');
    expect(data[0].status).toBe('proposed');
  });

  it('status filter: accepted only', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Some {~~old~>new~~}[^ct-1] and {--x--}[^ct-2].',
        '',
        `[^ct-1]: @ai | ${TODAY} | sub | proposed`,
        '',
        `[^ct-2]: @ai | ${TODAY} | del | accepted`,
      ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath, status: ['accepted'] },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].change_id).toBe('ct-2');
    expect(data[0].status).toBe('accepted');
  });

  it('status filter: proposed and rejected returns both', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'A {~~a~>b~~}[^ct-1] B {--x--}[^ct-2] C.',
        '',
        `[^ct-1]: @ai | ${TODAY} | sub | proposed`,
        '',
        `[^ct-2]: @ai | ${TODAY} | del | rejected`,
      ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath, status: ['proposed', 'rejected'] },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(2);
    const ids = data.map((d: { change_id: string }) => d.change_id).sort();
    expect(ids).toEqual(['ct-1', 'ct-2']);
  });

  it('directory with no matching changes: returns empty array', async () => {
    const subDir = path.join(tmpDir, 'empty');
    await fs.mkdir(subDir, { recursive: true });
    const trackedHeader = '<!-- ctrcks.com/v1: tracked -->\n';
    await fs.writeFile(path.join(subDir, 'nodata.md'), trackedHeader + '# No changes\n');

    const result = await handleListOpenThreads(
      { path: subDir },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(0);
  });

  it('regression: no duplicate change_id when file has all five change types plus grouped change', async () => {
    // Fixture structure from plugin trial (section 2.3): all five types + footnote refs + grouped dotted IDs.
    // Historically list_open_threads returned duplicate entries (ct-4, ct-5, ct-6 twice); this guards against regression.
    const trackedHeader = '<!-- ctrcks.com/v1: tracked -->\n';
    const filePath = path.join(tmpDir, 'all-types-and-group.md');
    await fs.writeFile(
      filePath,
      trackedHeader +
        [
          'Intro {~~sub~>substitution~~}[^ct-1] and {++insertion++}[^ct-2] and {--deletion--}[^ct-3].',
          '{==highlight==}[^ct-4]{>>comment<<}[^ct-5].',
          'Grouped: {~~a~>b~~}[^ct-6.1] and {~~c~>d~~}[^ct-6.2].',
          '',
          `[^ct-1]: @ai | ${TODAY} | sub | proposed`,
          `[^ct-2]: @ai | ${TODAY} | ins | proposed`,
          `[^ct-3]: @ai | ${TODAY} | del | proposed`,
          `[^ct-4]: @ai | ${TODAY} | highlight | proposed`,
          `[^ct-5]: @ai | ${TODAY} | comment | proposed`,
          `[^ct-6.1]: @ai | ${TODAY} | sub | proposed`,
          `[^ct-6.2]: @ai | ${TODAY} | sub | proposed`,
          `[^ct-6]: @ai | ${TODAY} | group | proposed`,
        ].join('\n')
    );

    const result = await handleListOpenThreads(
      { path: filePath },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    const ids = data.map((d: { change_id: string }) => d.change_id);
    expect(ids.length).toBe(new Set(ids).size); // no duplicates
  });
});
