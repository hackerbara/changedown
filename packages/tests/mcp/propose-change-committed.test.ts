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

describe('propose_change with committed hashes', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-propose-committed-'));
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

  it('accepts committed hash and maps to raw position for substitution', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '# Title',
      'Some text with {++pending addition++}[^ct-1] in it.',
      'Clean line here.',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n'));

    const resolver = await createTestResolver(tmpDir, config);

    // 1. Read with committed view (records committed hashes in session state)
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );
    expect(readResult.isError).toBeUndefined();

    // Extract committed hash for "Clean line here." from output
    const readText = readResult.content[0].text;
    const lines = readText.split('\n');
    const cleanLineEntry = lines.find(l => l.includes('Clean line here.'));
    expect(cleanLineEntry).toBeDefined();

    // Parse the committed line format: "N:HH |content"
    const match = cleanLineEntry!.match(/^\s*(\d+):([0-9a-f]{2})/);
    expect(match).toBeDefined();
    const committedLineNum = parseInt(match![1], 10);
    const committedHash = match![2];

    // 2. Propose a change using committed coordinates
    const proposeResult = await handleProposeChange(
      {
        file: filePath,
        old_text: 'Clean line here.',
        new_text: 'Updated line here.',
        start_line: committedLineNum,
        start_hash: committedHash,
        reason: 'test update',
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
    expect(modifiedContent).toContain('{~~Clean line here.~>Updated line here.~~}');
  });

  it('returns error for stale committed hash', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, '# Title\nSome text.\n');

    const resolver = await createTestResolver(tmpDir, config);

    // 1. Read with committed view
    await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );

    // 2. Propose with wrong committed hash
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
    expect(errorText).toContain('Hash mismatch at line');
    expect(errorText).toContain('view');
  });

  it('re-records committed hashes after edit for chained edits', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, [
      '# Title',
      'First line.',
      'Second line.',
    ].join('\n'));

    const resolver = await createTestResolver(tmpDir, config);

    // 1. Read with committed view
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
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
      },
      resolver,
      state,
    );
    expect(proposeResult.isError).toBeUndefined();

    // 3. Verify committed hashes were re-recorded (should have committed field)
    const hashes = state.getRecordedHashes(filePath);
    expect(hashes).toBeDefined();
    expect(hashes!.some(h => h.committed !== undefined)).toBe(true);

    // 4. Read committed view again to get fresh hashes for second edit
    const readResult2 = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver,
      state,
    );
    const readText2 = readResult2.content[0].text;
    const secondLine = readText2.split('\n').find(l => l.includes('Second line.'));
    expect(secondLine).toBeDefined();
    const secondMatch = secondLine!.match(/^\s*(\d+):([0-9a-f]{2})/);
    const secondLineNum = parseInt(secondMatch![1], 10);
    const secondHash = secondMatch![2];

    // 5. Make second edit using committed coordinates
    const proposeResult2 = await handleProposeChange(
      {
        file: filePath,
        old_text: 'Second line.',
        new_text: 'Updated second line.',
        start_line: secondLineNum,
        start_hash: secondHash,
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
});
