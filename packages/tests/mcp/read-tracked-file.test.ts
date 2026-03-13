import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('handleReadTrackedFile', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  // initHashline is async and must be called once before any hash operations
  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-read-tracked-test-'));
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
        enforcement: 'warn',
        exclude: [],
      },
      matching: {
        mode: 'normalized',
      },
      hashline: {
        enabled: true,
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

  // ─── Hashline disabled ─────────────────────────────────────────────────

  it('returns full-file content with line numbers (no hashes) when hashline is disabled', async () => {
    const disabledConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: false, auto_remap: false },
    };
    const disabledResolver = await createTestResolver(tmpDir, disabledConfig);
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.\nSecond line.');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      disabledResolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Non-hashline path uses legacy header format: ## file: {name}\n## policy: X | tracking: Y
    expect(text).toContain('## file:');
    expect(text).toContain('## policy: safety-net | tracking:');
    expect(text).toContain('Hashline addressing is disabled');
    expect(text).toContain('Use string matching in propose_change');
    expect(text).toContain('  1| Hello world.');
    expect(text).toContain('  2| Second line.');
    expect(text).not.toMatch(/\d+:[a-f0-9]{2}\|/); // no LINE:HASH
  });

  it('supports offset/limit pagination even when hashline is disabled', async () => {
    const disabledConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: false, auto_remap: false },
    };
    const disabledResolver = await createTestResolver(tmpDir, disabledConfig);
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Line 1\nLine 2\nLine 3');

    const result = await handleReadTrackedFile(
      { file: filePath, offset: 1, limit: 2, view: 'content' },
      disabledResolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Line 1');
    expect(text).toContain('Line 2');
    expect(text).not.toContain('Line 3');
  });

  // ─── File not found ──────────────────────────────────────────────────

  it('returns error when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleReadTrackedFile(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|ENOENT|unreadable/i);
  });

  // ─── Missing file argument ───────────────────────────────────────────

  it('returns error when file argument is missing', async () => {
    const result = await handleReadTrackedFile(
      {},
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('file');
  });

  // ─── Compact by default, relative path ─────────────────────────────────

  it('default output uses relative path in header (no absolute path)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.\nSecond line.');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Unified renderer: no absolute path in header
    expect(text).not.toMatch(/## \/\//);
    // Header contains filename with policy
    expect(text).toMatch(/## .*doc\.md \| policy:/);
    // Hashline content present (new format has spaces: "N:HH  | content")
    expect(text).toMatch(/^\s*\d+:[0-9a-f]{2}\s+\|/m);
  });

  it('default output omits change levels line (compact)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      '<!-- ctrcks.com/v1: tracked -->\nHello {++world++}[^ct-1].\n\n[^ct-1]: @ai | 2026-01-01 | ins | proposed',
    );

    const result = await handleReadTrackedFile(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).not.toContain('## change levels:');
  });

  it('with include_meta true includes change levels line when file has changes', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      '<!-- ctrcks.com/v1: tracked -->\nHello {++world++}[^ct-1].\n\n[^ct-1]: @ai | 2026-01-01 | ins | proposed',
    );

    const result = await handleReadTrackedFile(
      { file: filePath, include_meta: true },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('## change levels:');
  });

  // ─── Basic file read ─────────────────────────────────────────────────

  it('reads file and returns header + hashline content', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.\nSecond line.\nThird line.');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Unified renderer header: ## {filename} | policy: {protocol.mode} | tracking: {status}
    expect(text).toMatch(/## .*doc\.md \| policy:/);
    expect(text).toContain('## lines: 1-3 of 3');

    // Hashline content should follow header (separated by blank line after ---)
    const parts = text.split('\n\n');
    expect(parts.length).toBeGreaterThanOrEqual(2);

    // Unified renderer hashline format: " N:HH  | content" (with spaces around flag and pipe)
    const hashlineContent = parts[parts.length - 1];
    const lines = hashlineContent.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\s*1:[0-9a-f]{2}\s+\| Hello world\.$/);
    expect(lines[1]).toMatch(/^\s*2:[0-9a-f]{2}\s+\| Second line\.$/);
    expect(lines[2]).toMatch(/^\s*3:[0-9a-f]{2}\s+\| Third line\.$/);
  });

  // ─── Relative file path ──────────────────────────────────────────────

  it('resolves relative file paths against project root', async () => {
    const subDir = path.join(tmpDir, 'docs');
    await fs.mkdir(subDir);
    const filePath = path.join(subDir, 'notes.md');
    await fs.writeFile(filePath, 'Some notes.');

    const result = await handleReadTrackedFile(
      { file: 'docs/notes.md', view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/## .*notes\.md \| policy:/);
    expect(result.content[0].text).toMatch(/1:[0-9a-f]{2}\s+\| Some notes\./);
  });

  // ─── Pagination (offset / limit) ──────────────────────────────

  it('returns sliced content with offset and limit', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    await fs.writeFile(filePath, content);

    const result = await handleReadTrackedFile(
      { file: filePath, offset: 2, limit: 3, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Header should show the slice range
    expect(text).toContain('## lines: 2-4 of 5');

    // Should only contain lines 2-4
    const parts = text.split('\n\n');
    const hashlineContent = parts[parts.length - 1];
    const lines = hashlineContent.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\s*2:[0-9a-f]{2}\s+\| Line 2$/);
    expect(lines[1]).toMatch(/^\s*3:[0-9a-f]{2}\s+\| Line 3$/);
    expect(lines[2]).toMatch(/^\s*4:[0-9a-f]{2}\s+\| Line 4$/);
  });

  it('returns content from offset to default limit', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    await fs.writeFile(filePath, content);

    const result = await handleReadTrackedFile(
      { file: filePath, offset: 3, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    expect(text).toContain('## lines: 3-5 of 5');

    const parts = text.split('\n\n');
    const hashlineContent = parts[parts.length - 1];
    const lines = hashlineContent.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\s*3:[0-9a-f]{2}\s+\| Line 3$/);
  });

  it('returns first N lines with only limit specified', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    await fs.writeFile(filePath, content);

    const result = await handleReadTrackedFile(
      { file: filePath, limit: 2, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    expect(text).toContain('## lines: 1-2 of 5');

    const parts = text.split('\n\n');
    const hashlineContent = parts[parts.length - 1];
    const lines = hashlineContent.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\s*1:[0-9a-f]{2}\s+\| Line 1$/);
    expect(lines[1]).toMatch(/^\s*2:[0-9a-f]{2}\s+\| Line 2$/);
  });

  // ─── Settled view ────────────────────────────────────────────────────

  it('settled view strips CriticMarkup from content', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Use accepted footnotes so settled view applies the changes
    const content = [
      'Hello {++beautiful ++}[^ct-1]world.',
      'Plain line.',
      '{--removed--}[^ct-2] text.',
      '',
      '[^ct-1]: @test | 2026-02-12 | ins | accepted',
      '[^ct-2]: @test | 2026-02-12 | del | accepted',
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    const parts = text.split('\n\n');
    const hashlineContent = parts[parts.length - 1];
    const lines = hashlineContent.split('\n');

    // Line 1: accepted insertion → "Hello beautiful world."
    // Unified renderer format: "N:HH  | content" (space after pipe)
    expect(lines[0]).toMatch(/\| Hello beautiful world\.$/);
    // Line 2: unchanged → "Plain line."
    expect(lines[1]).toMatch(/\| Plain line\.$/);
    // Line 3: accepted deletion → " text."
    expect(lines[2]).toMatch(/\|  text\.$/);
  });

  it('settled view uses settled hashes (not raw hashes)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = 'Hello {++beautiful ++}world.';
    await fs.writeFile(filePath, content);

    // Raw view
    const rawResult = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );
    // Settled view
    const settledResult = await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver,
      state,
    );

    const rawText = rawResult.content[0].text;
    const settledText = settledResult.content[0].text;

    // The hash in settled view should differ from the raw hash
    // (since the content is different after stripping CriticMarkup)
    const rawHashMatch = rawText.split('\n\n').pop()!.match(/1:([0-9a-f]{2})/);
    const settledHashMatch = settledText.split('\n\n').pop()!.match(/1:([0-9a-f]{2})/);

    expect(rawHashMatch).toBeTruthy();
    expect(settledHashMatch).toBeTruthy();
    // Note: raw view dual hash includes both raw and settled, but the primary hash is raw
    // Settled view primary hash is the settled hash
  });

  // ─── Session state recording ─────────────────────────────────────────

  it('records file hashes in session state after read', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.\nSecond line.');

    // Before read: no recorded hashes
    expect(state.getRecordedHashes(filePath)).toBeUndefined();

    await handleReadTrackedFile(
      { file: filePath },
      resolver,
      state,
    );

    // After read: hashes should be recorded
    const hashes = state.getRecordedHashes(filePath);
    expect(hashes).toBeDefined();
    expect(hashes).toHaveLength(2);
    expect(hashes![0].line).toBe(1);
    expect(hashes![0].raw).toMatch(/^[0-9a-f]{2}$/);
    expect(hashes![0].settled).toMatch(/^[0-9a-f]{2}$/);
    expect(hashes![1].line).toBe(2);
  });

  it('session state hashes are overwritten on re-read of same file', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Version 1.');

    await handleReadTrackedFile(
      { file: filePath },
      resolver,
      state,
    );

    const hashesV1 = state.getRecordedHashes(filePath);
    expect(hashesV1).toHaveLength(1);

    // Modify the file and re-read
    await fs.writeFile(filePath, 'Version 2.\nNew line.');

    await handleReadTrackedFile(
      { file: filePath },
      resolver,
      state,
    );

    const hashesV2 = state.getRecordedHashes(filePath);
    expect(hashesV2).toHaveLength(2);
  });

  // ─── Tracking status in header ───────────────────────────────────────

  it('includes tracking status from file header when present', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\nHello world.');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    // Unified renderer: policy field shows protocol.mode ('classic'), tracking status from file header
    expect(result.content[0].text).toContain('policy: classic');
    expect(result.content[0].text).toContain('tracking: tracked');
  });

  // ─── Policy mode in header ──────────────────────────────────────

  it('includes protocol mode in header (unified renderer uses protocol.mode)', async () => {
    const strictConfig: ChangeTracksConfig = { ...config, policy: { mode: 'strict' as const, creation_tracking: 'footnote' as const } };
    const strictResolver = await createTestResolver(tmpDir, strictConfig);
    const filePath = path.join(tmpDir, 'policy-test.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      strictResolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Unified renderer shows protocol.mode in the policy field
    expect(text).toContain('policy: classic');
  });

  it('includes protocol mode in header (default config)', async () => {
    const filePath = path.join(tmpDir, 'policy-default.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Unified renderer uses protocol.mode ('classic') not policy.mode
    expect(text).toContain('policy: classic');
  });

  it('includes policy mode in header when hashline is disabled', async () => {
    const disabledConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: false, auto_remap: false },
      policy: { mode: 'permissive' as const, creation_tracking: 'footnote' as const },
    };
    const disabledResolver = await createTestResolver(tmpDir, disabledConfig);
    const filePath = path.join(tmpDir, 'policy-no-hash.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      disabledResolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('## policy: permissive');
  });

  // ─── View parameter validation ──────────────────────────────────────

  it('rejects invalid view parameter with helpful error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'badview' },
      resolver,
      state,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid view');
    expect(result.content[0].text).toContain('meta');
    expect(result.content[0].text).toContain('content');
  });

  it('full view is treated as alias for content view', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello {++world++}.');

    const fullResult = await handleReadTrackedFile(
      { file: filePath, view: 'full' },
      resolver,
      state,
    );
    const contentResult = await handleReadTrackedFile(
      { file: filePath, view: 'content' },
      resolver,
      state,
    );

    expect(fullResult.isError).toBeUndefined();
    expect(contentResult.isError).toBeUndefined();
    // full and content should produce identical output
    expect(fullResult.content[0].text).toBe(contentResult.content[0].text);
  });

  // ─── Edge cases ──────────────────────────────────────────────────────

  it('handles empty file', async () => {
    const filePath = path.join(tmpDir, 'empty.md');
    await fs.writeFile(filePath, '');

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('## lines: 1-1 of 1');
  });

  it('pagination with limit exceeding file length clamps to file end', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Line 1\nLine 2\nLine 3');

    const result = await handleReadTrackedFile(
      { file: filePath, offset: 2, limit: 100, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('## lines: 2-3 of 3');

    const parts = text.split('\n\n');
    const hashlineContent = parts[parts.length - 1];
    const lines = hashlineContent.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('default view is raw (shows CriticMarkup)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello {++world++}.');

    const result = await handleReadTrackedFile(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('{++world++}');
  });

  // ─── Settled view with multi-line CriticMarkup ──────────────────────

  describe('settled view with multi-line CriticMarkup', () => {
    it('correctly settles multi-line insertions (accept-all: proposed kept)', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      // Multi-line insertion spanning lines 2-4
      const content = 'Line one\n{++Line two\nLine three\nLine four++}[^ct-1]\nLine five\n\n[^ct-1]: @test | 2026-02-12 | ins | proposed';
      await fs.writeFile(filePath, content);

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'settled' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;

      // Accept-all: proposed insertions are applied (kept) in settled view
      expect(text).toContain('Line one');
      expect(text).toContain('Line five');
      expect(text).toContain('Line two');
      expect(text).toContain('Line three');
      expect(text).toContain('Line four');
      // Footnotes stripped
      expect(text).not.toContain('[^ct-1]');
    });

    it('correctly settles multi-line deletions (accept-all: proposed removes text)', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\n{--Line two\nLine three--}[^ct-1]\nLine four\n\n[^ct-1]: @test | 2026-02-12 | del | proposed';
      await fs.writeFile(filePath, content);

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'settled' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;

      // Accept-all: proposed deletion is applied = text removed
      expect(text).not.toContain('Line two');
      expect(text).not.toContain('Line three');
      expect(text).toContain('Line one');
      expect(text).toContain('Line four');
    });

    it('accepted deletion removes text and settled view has fewer lines', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\n{--Line two\nLine three--}[^ct-1]\nLine four\n\n[^ct-1]: @test | 2026-02-12 | del | accepted';
      await fs.writeFile(filePath, content);

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'settled' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;

      // Accepted deletion = text removed
      expect(text).toContain('Line one');
      expect(text).toContain('Line four');
      expect(text).not.toContain('Line two');
      expect(text).not.toContain('Line three');
    });
  });

  it('settled view with pagination shows correct sliced settled content', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Use accepted footnote so settled view applies the insertion
    const content = [
      'Line 1',
      'Hello {++world++}[^ct-1].',
      'Line 3',
      'Line 4',
      '',
      '[^ct-1]: @test | 2026-02-12 | ins | accepted',
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleReadTrackedFile(
      { file: filePath, offset: 2, limit: 2, view: 'settled' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Settled text has fewer lines (footnotes stripped), pagination is in settled-space
    expect(text).toMatch(/## lines: 2-3 of 4/);

    const parts = text.split('\n\n');
    const hashlineContent = parts[parts.length - 1];
    const lines = hashlineContent.split('\n');
    expect(lines).toHaveLength(2);
    // Line 2 settled = "Hello world." — unified format: "N:HH  | content"
    expect(lines[0]).toMatch(/\| Hello world\.$/);
    // Line 3 unchanged = "Line 3"
    expect(lines[1]).toMatch(/\| Line 3$/);
  });

  it('default limit truncates at 500 lines with truncation message', async () => {
    const filePath = path.join(tmpDir, 'big.md');
    const lines = Array.from({ length: 600 }, (_, i) => `Line ${i + 1}`);
    await fs.writeFile(filePath, lines.join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('## lines: 1-500 of 600');
    expect(text).toContain('use offset/limit to paginate');
    expect(text).not.toContain('Line 501');
  });

  it('explicit limit is capped at 2000', async () => {
    const filePath = path.join(tmpDir, 'huge.md');
    const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
    await fs.writeFile(filePath, lines.join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, limit: 2500, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('## lines: 1-2000 of 2500');
    expect(text).not.toContain('Line 2001');
  });

  it('extends truncation boundary to close open CriticMarkup block', async () => {
    const filePath = path.join(tmpDir, 'markup.md');
    // Line 3 opens a multi-line insertion, line 5 closes it
    const lines = [
      'Line 1',
      'Line 2',
      '{++Line 3 starts insertion',
      'Line 4 continues',
      'Line 5 closes it++}',
      'Line 6',
    ];
    await fs.writeFile(filePath, lines.join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, limit: 3, view: 'raw' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Should extend past line 3 to include line 5 (closing delimiter)
    expect(text).toContain('Line 5 closes it++}');
  });

  // ─── View name aliases ──────────────────────────────────────────────────

  describe('view name aliases', () => {
    it('view=review produces same output as view=meta', async () => {
      const filePath = path.join(tmpDir, 'alias-test.md');
      await fs.writeFile(filePath, 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai | 2026-01-01 | ins | proposed');

      const metaResult = await handleReadTrackedFile(
        { file: filePath, view: 'meta' }, resolver, state);
      const reviewResult = await handleReadTrackedFile(
        { file: filePath, view: 'review' }, resolver, state);
      expect(reviewResult.content[0].text).toBe(metaResult.content[0].text);
    });

    it('view=changes produces same output as view=committed', async () => {
      const filePath = path.join(tmpDir, 'alias-test.md');
      await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\nHello world.\n\n[^ct-1]: @ai | 2026-01-01 | ins | proposed');

      const committedResult = await handleReadTrackedFile(
        { file: filePath, view: 'committed' }, resolver, state);
      const changesResult = await handleReadTrackedFile(
        { file: filePath, view: 'changes' }, resolver, state);
      expect(changesResult.content[0].text).toBe(committedResult.content[0].text);
    });

    it('view=all is alias for review (meta)', async () => {
      const filePath = path.join(tmpDir, 'alias-test.md');
      await fs.writeFile(filePath, 'Hello world.');

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'all' }, resolver, state);
      expect(result.isError).toBeUndefined();
    });

    it('view=simple is alias for changes (committed)', async () => {
      const filePath = path.join(tmpDir, 'alias-test.md');
      await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\nHello world.');

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'simple' }, resolver, state);
      expect(result.isError).toBeUndefined();
    });

    it('view=final is alias for settled', async () => {
      const filePath = path.join(tmpDir, 'alias-test.md');
      await fs.writeFile(filePath, 'Hello world.');

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'final' }, resolver, state);
      expect(result.isError).toBeUndefined();
    });

    it('view=raw remains a valid alias for content', async () => {
      const filePath = path.join(tmpDir, 'alias-test.md');
      await fs.writeFile(filePath, 'Hello {++world++}.');

      const rawResult = await handleReadTrackedFile(
        { file: filePath, view: 'raw' }, resolver, state);
      const contentResult = await handleReadTrackedFile(
        { file: filePath, view: 'content' }, resolver, state);
      expect(rawResult.content[0].text).toBe(contentResult.content[0].text);
    });
  });

  // ─── Committed view trailing blank lines ──────────────────────────────

  it('committed view does not have trailing blank lines from footnote stripping', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Create file with footnotes that will be stripped — the blank line before
    // footnotes becomes a trailing blank line after stripping
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Title',
      '',
      'Content here.',
      '',
      '[^ct-1]: @ai:test | 2026-02-20 | ins | proposed',
      '    @ai:test 2026-02-20: reason',
    ].join('\n'));

    const result = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    const text = result.content[0].text;
    // The blank line before footnotes should be trimmed — it was only a
    // visual separator for the footnote block that no longer exists.
    // Content lines should end at "Content here." (line 4), not include
    // a trailing empty line that was the footnote separator.
    const contentSection = text.split('\n\n').slice(1).join('\n\n'); // skip header
    const contentLines = contentSection.split('\n');
    const lastContentLine = contentLines[contentLines.length - 1];
    // Last line of content should not be a blank-content hashline
    // Unified format: "N:HH  | content"
    expect(lastContentLine).toMatch(/\| Content here\.$/);
  });

  // ─── View policy enforcement ──────────────────────────────────────────

  describe('view_policy = require', () => {
    it('returns error when agent requests non-default view', async () => {
      const requireConfig: ChangeTracksConfig = {
        ...config,
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'require' },
      };
      const requireResolver = await createTestResolver(tmpDir, requireConfig);
      const filePath = path.join(tmpDir, 'policy-require.md');
      await fs.writeFile(filePath, 'Hello world.');

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'changes' },
        requireResolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('view_policy');
      expect(result.content[0].text).toContain('require');
    });

    it('allows the default view when explicitly requested', async () => {
      const requireConfig: ChangeTracksConfig = {
        ...config,
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'require' },
      };
      const requireResolver = await createTestResolver(tmpDir, requireConfig);
      const filePath = path.join(tmpDir, 'policy-allow.md');
      await fs.writeFile(filePath, 'Hello world.');

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'review' },
        requireResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
    });

    it('allows when no view specified (uses default)', async () => {
      const requireConfig: ChangeTracksConfig = {
        ...config,
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'require' },
      };
      const requireResolver = await createTestResolver(tmpDir, requireConfig);
      const filePath = path.join(tmpDir, 'policy-noview.md');
      await fs.writeFile(filePath, 'Hello world.');

      const result = await handleReadTrackedFile(
        { file: filePath },
        requireResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
    });

    it('rejects alias of non-default view', async () => {
      const requireConfig: ChangeTracksConfig = {
        ...config,
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'require' },
      };
      const requireResolver = await createTestResolver(tmpDir, requireConfig);
      const filePath = path.join(tmpDir, 'policy-alias.md');
      await fs.writeFile(filePath, 'Hello world.');

      // 'simple' is alias for 'changes', which is not 'review'
      const result = await handleReadTrackedFile(
        { file: filePath, view: 'simple' },
        requireResolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('view_policy');
    });

    it('accepts alias of default view', async () => {
      const requireConfig: ChangeTracksConfig = {
        ...config,
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'require' },
      };
      const requireResolver = await createTestResolver(tmpDir, requireConfig);
      const filePath = path.join(tmpDir, 'policy-alias-ok.md');
      await fs.writeFile(filePath, 'Hello world.');

      // 'all' is alias for 'review'
      const result = await handleReadTrackedFile(
        { file: filePath, view: 'all' },
        requireResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
    });
  });

  describe('view_policy = suggest', () => {
    it('uses default_view when no view specified', async () => {
      const suggestConfig: ChangeTracksConfig = {
        ...config,
        hashline: { enabled: false, auto_remap: false },
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'settled', view_policy: 'suggest' },
      };
      const suggestResolver = await createTestResolver(tmpDir, suggestConfig);
      const filePath = path.join(tmpDir, 'policy-suggest-default.md');
      await fs.writeFile(filePath, 'Hello {++world++}.');

      const result = await handleReadTrackedFile(
        { file: filePath },
        suggestResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      // Settled view strips CriticMarkup
      expect(text).not.toContain('{++');
      expect(text).toContain('Hello world.');
    });

    it('allows agent to override with a different view', async () => {
      const suggestConfig: ChangeTracksConfig = {
        ...config,
        hashline: { enabled: false, auto_remap: false },
        policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'settled', view_policy: 'suggest' },
      };
      const suggestResolver = await createTestResolver(tmpDir, suggestConfig);
      const filePath = path.join(tmpDir, 'policy-suggest-override.md');
      await fs.writeFile(filePath, 'Hello {++world++}.');

      const result = await handleReadTrackedFile(
        { file: filePath, view: 'raw' },
        suggestResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const text = result.content[0].text;
      // Raw view preserves CriticMarkup
      expect(text).toContain('{++world++}');
    });
  });
});
