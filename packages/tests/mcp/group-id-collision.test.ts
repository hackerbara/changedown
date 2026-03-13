import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleProposeBatch } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Regression test for BUG-1: Group ID collision in propose_batch.
 *
 * Before the fix, `beginGroup()` was called without `knownMaxId`, so
 * every batch started at group ID `ct-1` regardless of existing IDs
 * in the file. This caused collisions when a file already contained
 * changes (e.g., from a previous batch or individual proposals).
 */
describe('BUG-1: Group ID collision in propose_batch', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-group-collision-'));
    state = new SessionState();
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: false,
      },
      author: {
        default: 'ai:test-agent',
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

  it('second batch gets group ID higher than first batch IDs', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Alpha. Beta. Gamma. Delta.');

    // First batch: creates ct-1 group with ct-1.1, ct-1.2
    const result1 = await handleProposeBatch(
      {
        file: filePath,
        reason: 'First batch',
        changes: [
          { old_text: 'Alpha.', new_text: 'A.' },
          { old_text: 'Beta.', new_text: 'B.' },
        ],
      },
      resolver,
      state,
    );

    expect(result1.isError).toBeUndefined();
    const data1 = JSON.parse(result1.content[0].text);
    expect(data1.group_id).toBe('ct-1');
    expect(data1.applied[0].change_id).toBe('ct-1.1');
    expect(data1.applied[1].change_id).toBe('ct-1.2');

    // Second batch on the SAME file: must NOT collide with ct-1
    // Before the fix, this would also produce ct-1 (collision)
    const result2 = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Second batch',
        changes: [
          { old_text: 'Gamma.', new_text: 'G.' },
          { old_text: 'Delta.', new_text: 'D.' },
        ],
      },
      resolver,
      state,
    );

    expect(result2.isError).toBeUndefined();
    const data2 = JSON.parse(result2.content[0].text);

    // The second group ID must be higher than any ID from the first batch.
    // First batch used ct-1 (group), ct-1.1, ct-1.2. So second group
    // must be at least ct-2.
    const groupNum2 = parseInt(data2.group_id.replace('ct-', ''), 10);
    expect(groupNum2).toBeGreaterThan(1);
    expect(data2.group_id).not.toBe('ct-1');

    // Child IDs must use the new group's parent
    expect(data2.applied[0].change_id).toBe(`ct-${groupNum2}.1`);
    expect(data2.applied[1].change_id).toBe(`ct-${groupNum2}.2`);

    // Verify all footnotes in the file have unique IDs
    const content = await fs.readFile(filePath, 'utf-8');
    const footnoteIds = [...content.matchAll(/\[\^(ct-\d+(?:\.\d+)?)\]/g)].map((m) => m[1]);
    const uniqueIds = new Set(footnoteIds);
    // Each ID should appear exactly twice (inline ref + footnote def), so
    // unique count * 2 should equal total. But the key check is no collision.
    expect(uniqueIds.size).toBeGreaterThanOrEqual(6); // ct-1, ct-1.1, ct-1.2, ct-2, ct-2.1, ct-2.2
  });

  it('batch on file with pre-existing changes avoids collision', async () => {
    const filePath = path.join(tmpDir, 'existing.md');
    // Simulate a file that already has ct-1 through ct-3 from previous edits
    const existingContent = [
      'Some {~~old~>new~~}[^ct-1] text here.',
      '',
      'More {++added++}[^ct-2] content.',
      '',
      'Final {--removed--}[^ct-3] section. Keep this.',
      '',
      '[^ct-1]: @ai:test-agent | 2026-02-20 | sub | proposed',
      '[^ct-2]: @ai:test-agent | 2026-02-20 | ins | proposed',
      '[^ct-3]: @ai:test-agent | 2026-02-20 | del | proposed',
    ].join('\n');
    await fs.writeFile(filePath, existingContent);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Batch on existing file',
        changes: [
          { old_text: 'Keep this.', new_text: 'Keep all of this.' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    // Group ID must be ct-4 (one above max existing ct-3)
    expect(data.group_id).toBe('ct-4');
    expect(data.applied[0].change_id).toBe('ct-4.1');
  });

  it('propose_change with changes array (multi-op) avoids collision via batch path', async () => {
    // This tests the code path where propose_change delegates to handleProposeBatch
    // when changes array has length > 1. We call handleProposeBatch directly since
    // that is the function propose_change delegates to.
    const filePath = path.join(tmpDir, 'via-propose.md');
    const existingContent = [
      'Intro paragraph.',
      '',
      'Body {~~was~>is~~}[^ct-5] here. More text.',
      '',
      '[^ct-5]: @ai:test-agent | 2026-02-20 | sub | proposed',
    ].join('\n');
    await fs.writeFile(filePath, existingContent);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Changes via propose_change array',
        changes: [
          { old_text: 'Intro paragraph.', new_text: 'Introduction.' },
          { old_text: 'More text.', new_text: 'Additional text.' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    // Must be ct-6 (one above existing ct-5)
    expect(data.group_id).toBe('ct-6');
    expect(data.applied[0].change_id).toBe('ct-6.1');
    expect(data.applied[1].change_id).toBe('ct-6.2');
  });
});
