import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('propose_change with settled hashes', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-propose-settled-'));
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
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts settled hash and maps to raw position for substitution', async () => {
    // File with a proposed insertion — in settled view (accept-all), the insertion
    // text appears as a real line, so settled line numbers shift relative to raw
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Title',
      '{++Inserted line.++}[^ct-1]',
      'Line after.',
      '',
      '[^ct-1]: @alice | 2026-02-24 | ins | proposed',
      '    @alice 2026-02-24: adding context',
    ].join('\n'));

    const resolver = await createTestResolver(tmpDir, config);

    // 1. Read with settled view (records settled hashes with rawLineNum in session state)
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver,
      state,
    );
    expect(readResult.isError).toBeUndefined();

    // Extract settled hash for "Line after." from output
    const readText = readResult.content[0].text;
    const lines = readText.split('\n');
    const targetLineEntry = lines.find(l => l.includes('Line after.'));
    expect(targetLineEntry).toBeDefined();

    // Parse the settled line format: "N:HH|content"
    const match = targetLineEntry!.match(/^\s*(\d+):([0-9a-f]{2})/);
    expect(match).toBeDefined();
    const settledLineNum = parseInt(match![1], 10);
    const settledHash = match![2];

    // 2. Propose a change using settled coordinates
    const proposeResult = await handleProposeChange(
      {
        file: filePath,
        old_text: 'Line after.',
        new_text: 'Updated after.',
        start_line: settledLineNum,
        start_hash: settledHash,
        reason: 'test update via settled coordinates',
      },
      resolver,
      state,
    );

    if (proposeResult.isError) {
      throw new Error(`propose_change failed: ${proposeResult.content[0].text}`);
    }
    const response = JSON.parse(proposeResult.content[0].text);
    expect(response.change_id).toBeDefined();
    expect(response.type).toBe('sub');

    // 3. Verify the file was modified correctly
    const modifiedContent = await fs.readFile(filePath, 'utf-8');
    expect(modifiedContent).toContain('{~~Line after.~>Updated after.~~}');
  });

  it('returns error for stale settled hash', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Title',
      'Some text.',
    ].join('\n'));

    const resolver = await createTestResolver(tmpDir, config);

    // 1. Read with settled view (records settled hashes)
    await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver,
      state,
    );

    // 2. Propose with wrong settled hash
    const proposeResult = await handleProposeChange(
      {
        file: filePath,
        old_text: 'Some text.',
        new_text: 'Updated text.',
        start_line: 2,
        start_hash: 'zz', // wrong hash
        reason: 'test',
      },
      resolver,
      state,
    );

    expect(proposeResult.isError).toBe(true);
    const errorText = proposeResult.content[0].text;
    expect(errorText).toContain('Hash mismatch on line');
    expect(errorText).toContain('read_tracked_file');
  });

  it('handles file with pending deletion — deleted line absent from settled view', async () => {
    // In settled (accept-all) view, a pending deletion line disappears entirely.
    // The agent should be able to target lines around the deletion using settled-space coordinates.
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Title',
      'Line before.',
      '{--Deleted line.--}[^ct-1]',
      'Line after deletion.',
      '',
      '[^ct-1]: @alice | 2026-02-24 | del | proposed',
    ].join('\n'));

    const resolver = await createTestResolver(tmpDir, config);

    // 1. Read settled view — "Deleted line." is absent
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver,
      state,
    );
    expect(readResult.isError).toBeUndefined();
    const readText = readResult.content[0].text;

    // Verify the deleted line is NOT in settled output
    expect(readText).not.toContain('Deleted line.');

    // Extract settled hash for "Line after deletion."
    const lines = readText.split('\n');
    const afterEntry = lines.find(l => l.includes('Line after deletion.'));
    expect(afterEntry).toBeDefined();

    const match = afterEntry!.match(/^\s*(\d+):([0-9a-f]{2})/);
    expect(match).toBeDefined();
    const settledLineNum = parseInt(match![1], 10);
    const settledHash = match![2];

    // 2. Propose a change targeting "Line after deletion."
    const proposeResult = await handleProposeChange(
      {
        file: filePath,
        old_text: 'Line after deletion.',
        new_text: 'Updated after deletion.',
        start_line: settledLineNum,
        start_hash: settledHash,
        reason: 'edit near deletion',
      },
      resolver,
      state,
    );

    if (proposeResult.isError) {
      throw new Error(`propose_change failed: ${proposeResult.content[0].text}`);
    }
    const response = JSON.parse(proposeResult.content[0].text);
    expect(response.type).toBe('sub');

    // 3. Verify the correct raw line was modified
    const modifiedContent = await fs.readFile(filePath, 'utf-8');
    expect(modifiedContent).toContain('{~~Line after deletion.~>Updated after deletion.~~}');
    // The original deletion markup should still be intact
    expect(modifiedContent).toContain('{--Deleted line.--}');
  });

  it('re-records settled hashes after edit for chained edits', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Title',
      'First line.',
      'Second line.',
    ].join('\n'));

    const resolver = await createTestResolver(tmpDir, config);

    // 1. Read with settled view
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver,
      state,
    );

    // Extract hash for "First line."
    const readText = readResult.content[0].text;
    const firstLine = readText.split('\n').find(l => l.includes('First line.'));
    const firstMatch = firstLine!.match(/^\s*(\d+):([0-9a-f]{2})/);
    const firstLineNum = parseInt(firstMatch![1], 10);
    const firstHash = firstMatch![2];

    // 2. Make first edit
    const proposeResult = await handleProposeChange(
      {
        file: filePath,
        old_text: 'First line.',
        new_text: 'Updated first line.',
        start_line: firstLineNum,
        start_hash: firstHash,
        reason: 'test',
      },
      resolver,
      state,
    );
    expect(proposeResult.isError).toBeUndefined();

    // 3. Verify settled hashes were re-recorded (should have settledView field)
    const hashes = state.getRecordedHashes(filePath);
    expect(hashes).toBeDefined();
    expect(hashes!.some(h => h.settledView !== undefined)).toBe(true);

    // 4. Read settled view again to get fresh hashes for second edit
    const readResult2 = await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver,
      state,
    );
    const readText2 = readResult2.content[0].text;
    const secondLine = readText2.split('\n').find(l => l.includes('Second line.'));
    expect(secondLine).toBeDefined();
    const secondMatch = secondLine!.match(/^\s*(\d+):([0-9a-f]{2})/);
    const secondLineNum = parseInt(secondMatch![1], 10);
    const secondHash = secondMatch![2];

    // 5. Make second edit using settled coordinates
    const proposeResult2 = await handleProposeChange(
      {
        file: filePath,
        old_text: 'Second line.',
        new_text: 'Updated second line.',
        start_line: secondLineNum,
        start_hash: secondHash,
        reason: 'test',
      },
      resolver,
      state,
    );
    expect(proposeResult2.isError).toBeUndefined();

    // 6. Verify both edits applied
    const finalContent = await fs.readFile(filePath, 'utf-8');
    expect(finalContent).toContain('{~~First line.~>Updated first line.~~}');
    expect(finalContent).toContain('{~~Second line.~>Updated second line.~~}');
  });

  it('maps settled coordinates for insertion (after_line)', async () => {
    // Test inserting new content using settled-space after_line coordinate
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Title',
      '{++Existing insertion.++}[^ct-1]',
      'Target line.',
      '',
      '[^ct-1]: @alice | 2026-02-24 | ins | proposed',
    ].join('\n'));

    const resolver = await createTestResolver(tmpDir, config);

    // 1. Read settled view
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver,
      state,
    );
    expect(readResult.isError).toBeUndefined();

    // Extract settled hash for "Target line."
    const readText = readResult.content[0].text;
    const targetEntry = readText.split('\n').find(l => l.includes('Target line.'));
    expect(targetEntry).toBeDefined();
    const match = targetEntry!.match(/^\s*(\d+):([0-9a-f]{2})/);
    const settledLineNum = parseInt(match![1], 10);
    const settledHash = match![2];

    // 2. Insert after "Target line." using settled coordinates
    const proposeResult = await handleProposeChange(
      {
        file: filePath,
        old_text: '',
        new_text: 'New content here.',
        after_line: settledLineNum,
        after_hash: settledHash,
        reason: 'insert via settled coordinates',
      },
      resolver,
      state,
    );

    if (proposeResult.isError) {
      throw new Error(`propose_change failed: ${proposeResult.content[0].text}`);
    }
    const response = JSON.parse(proposeResult.content[0].text);
    expect(response.type).toBe('ins');

    // 3. Verify the insertion was placed correctly
    const modifiedContent = await fs.readFile(filePath, 'utf-8');
    expect(modifiedContent).toContain('{++New content here.++}');
  });
});
