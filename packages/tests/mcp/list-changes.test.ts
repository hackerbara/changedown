import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleListChanges } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';

describe('list_changes tool', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: any;
  let filePath: string;

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-list-'));
    state = new SessionState();
    const config: ChangeTracksConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: true },
      author: { default: 'ai:test', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: false, auto_remap: false },
      settlement: { auto_on_approve: false, auto_on_reject: false },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };
    resolver = await createTestResolver(tmpDir, config);
    filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# {~~Old Title~>New Title~~}[^ct-1]',
      '',
      'Some {++added++}[^ct-2] text.',
      '',
      '[^ct-1]: @ai:test | 2026-02-20 | sub | proposed',
      '    @ai:test 2026-02-20: Title update',
      '[^ct-2]: @ai:test | 2026-02-20 | ins | accepted',
      '    @ai:test 2026-02-20: Addition',
    ].join('\n'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lists all changes with correct metadata', async () => {
    const result = await handleListChanges({ file: filePath }, resolver, state);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.changes).toHaveLength(2);
    expect(data.changes[0].change_id).toBe('ct-1');
    expect(data.changes[0].type).toBe('sub');
    expect(data.changes[0].status).toBe('proposed');
    expect(data.changes[1].change_id).toBe('ct-2');
    expect(data.changes[1].status).toBe('accepted');
  });

  it('filters by status', async () => {
    const result = await handleListChanges(
      { file: filePath, status: 'proposed' },
      resolver, state,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].change_id).toBe('ct-1');
  });

  it('returns author and line number for each change', async () => {
    const result = await handleListChanges({ file: filePath }, resolver, state);
    const data = JSON.parse(result.content[0].text);
    expect(data.changes[0].author).toBe('ai:test');
    expect(data.changes[0].line).toBe(2);
    expect(data.changes[1].author).toBe('ai:test');
    expect(data.changes[1].line).toBe(4);
  });

  it('returns preview text for each change', async () => {
    const result = await handleListChanges({ file: filePath }, resolver, state);
    const data = JSON.parse(result.content[0].text);
    // Substitution preview should contain the old~>new text
    expect(data.changes[0].preview).toBeDefined();
    expect(data.changes[0].preview.length).toBeGreaterThan(0);
    // Insertion preview should contain "added"
    expect(data.changes[1].preview).toContain('added');
  });

  it('returns empty array for file with no changes', async () => {
    const emptyFile = path.join(tmpDir, 'empty.md');
    await fs.writeFile(emptyFile, '<!-- ctrcks.com/v1: tracked -->\n\nJust plain text.\n');
    const result = await handleListChanges({ file: emptyFile }, resolver, state);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.changes).toHaveLength(0);
  });

  it('returns error for missing file argument', async () => {
    const result = await handleListChanges({}, resolver, state);
    expect(result.isError).toBe(true);
  });

  it('returns error for nonexistent file', async () => {
    const result = await handleListChanges({ file: path.join(tmpDir, 'nope.md') }, resolver, state);
    expect(result.isError).toBe(true);
  });

  it('returns error for file not in scope', async () => {
    const txtFile = path.join(tmpDir, 'notes.txt');
    await fs.writeFile(txtFile, 'Plain text.');
    const result = await handleListChanges({ file: txtFile }, resolver, state);
    expect(result.isError).toBe(true);
  });

  it('filters returning no matches yields empty array', async () => {
    const result = await handleListChanges(
      { file: filePath, status: 'rejected' },
      resolver, state,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.changes).toHaveLength(0);
  });

  it('lists changes correctly after Layer 1 settlement', async () => {
    // Post-settlement state: inline CriticMarkup removed, refs and footnotes remain
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# New Title[^ct-1]',
      '',
      'Some added[^ct-2] text.',
      '',
      '[^ct-1]: @ai:test | 2026-02-20 | sub | accepted',
      '    @ai:test 2026-02-20: Title update',
      '[^ct-2]: @ai:test | 2026-02-20 | ins | accepted',
      '    @ai:test 2026-02-20: Addition',
    ].join('\n'));

    const result = await handleListChanges({ file: filePath }, resolver, state);
    const data = JSON.parse(result.content[0].text);

    expect(data.total_count).toBe(2);
    expect(data.changes).toHaveLength(2);
    expect(data.changes[0].change_id).toBe('ct-1');
    expect(data.changes[0].status).toBe('accepted');
    expect(data.changes[0].type).toBe('sub');
    expect(data.changes[1].change_id).toBe('ct-2');
    expect(data.changes[1].status).toBe('accepted');
  });

  it('includes total_count and filtered_count in response', async () => {
    const result = await handleListChanges(
      { file: filePath, status: 'proposed' },
      resolver, state,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.total_count).toBe(2);
    expect(data.filtered_count).toBe(1);
  });

  // ─── Detail levels ───────────────────────────────────────────────────────

  it('returns context lines when detail=context', async () => {
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      'Line one.',
      'Line two.',
      'Line three {++added++}[^ct-1].',
      'Line four.',
      'Line five.',
      '',
      '[^ct-1]: @alice | 2026-01-01 | ins | proposed',
      '    @alice 2026-01-01: test addition',
    ].join('\n'));

    const result = await handleListChanges(
      { file: filePath, detail: 'context', context_lines: 2 },
      resolver, state,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    const change = data.changes[0];
    expect(change.context_before).toBeInstanceOf(Array);
    expect(change.context_after).toBeInstanceOf(Array);
    expect(change.context_before.length).toBeLessThanOrEqual(2);
    expect(change.markup).toBeTypeOf('string');
    expect(change.markup).toContain('{++added++}');
  });

  it('returns full details when detail=full', async () => {
    const result = await handleListChanges(
      { file: filePath, detail: 'full' },
      resolver, state,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    const change = data.changes[0];
    expect(change.footnote).toBeDefined();
    expect(change.footnote.author).toBe('ai:test');
    expect(change.participants).toBeInstanceOf(Array);
  });

  it('defaults to summary when no detail specified', async () => {
    const result = await handleListChanges(
      { file: filePath },
      resolver, state,
    );
    const data = JSON.parse(result.content[0].text);
    const change = data.changes[0];
    // Summary level should NOT have context_before/markup/footnote
    expect(change.context_before).toBeUndefined();
    expect(change.markup).toBeUndefined();
    expect(change.footnote).toBeUndefined();
  });

  // ─── Batch change_ids ──────────────────────────────────────────────────

  it('returns details for specific change_ids', async () => {
    // File already has ct-1 and ct-2 from beforeEach
    const result = await handleListChanges(
      { file: filePath, change_ids: ['ct-1', 'ct-2'], detail: 'full' },
      resolver, state,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.changes).toHaveLength(2);
    expect(data.changes[0].change_id).toBe('ct-1');
    expect(data.changes[1].change_id).toBe('ct-2');
    expect(data.changes[0].footnote).toBeDefined();
  });

  it('returns error entry for missing change_id', async () => {
    const result = await handleListChanges(
      { file: filePath, change_ids: ['ct-1', 'ct-99'] },
      resolver, state,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.changes).toHaveLength(2);
    expect(data.changes[0].change_id).toBe('ct-1');
    expect(data.changes[1].change_id).toBe('ct-99');
    expect(data.changes[1].error).toBe('Change not found');
  });

  it('handles single change_id (get_change equivalent)', async () => {
    const result = await handleListChanges(
      { file: filePath, change_id: 'ct-2', detail: 'full' },
      resolver, state,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].change_id).toBe('ct-2');
    expect(data.changes[0].footnote).toBeDefined();
    expect(data.changes[0].footnote.author).toBe('ai:test');
  });

  it('defaults to detail=full when change_id specified without detail', async () => {
    const result = await handleListChanges(
      { file: filePath, change_id: 'ct-1' },
      resolver, state,
    );
    const data = JSON.parse(result.content[0].text);
    const change = data.changes[0];
    // Should default to full detail when IDs are specified
    expect(change.footnote).toBeDefined();
    expect(change.participants).toBeInstanceOf(Array);
  });

  it('returns level and anchored fields for each change', async () => {
    const testFile = path.join(tmpDir, 'level-anchored.md');
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      'Hello {++world++}[^ct-1] and {--goodbye--}',
      '',
      '[^ct-1]: @ai:test | 2026-03-04 | ins | proposed',
    ].join('\n');
    await fs.writeFile(testFile, content);

    const result = await handleListChanges({ file: testFile }, resolver, state);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    const changes = parsed.changes;

    const anchored = changes.find((c: any) => c.change_id === 'ct-1');
    expect(anchored).toBeDefined();
    expect(anchored.level).toBe(2);
    expect(anchored.anchored).toBe(true);

    const bare = changes.find((c: any) => c.anchored === false);
    expect(bare).toBeDefined();
    expect(bare.anchored).toBe(false);
    expect(bare.change_id).toMatch(/^ct-/);
  });
});
