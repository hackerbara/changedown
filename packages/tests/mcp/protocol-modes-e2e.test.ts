import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changedown/mcp/internals';
import { handleReadTrackedFile } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline, computeLineHash } from '@changedown/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('protocol modes end-to-end', () => {
  let tmpDir: string;
  let state: SessionState;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-e2e-modes-'));
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('full round-trip: read -> propose_change (compact) -> read updated', async () => {
    const config: ChangeDownConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
      author: { default: 'ai:e2e-test', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    };
    const resolver = await createTestResolver(tmpDir, config);

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox\njumps over the lazy dog');

    // Step 1: Read file to get coordinates
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );
    expect(readResult.isError).toBeUndefined();
    const readText = readResult.content[0].text;

    // Extract LINE:HASH from output (format: " 1:XX|content" or " 1:XX.YY|content")
    const lineMatch = readText.match(/\b1:([0-9a-f]{2})[\s.|]/);
    expect(lineMatch).not.toBeNull();
    const hash = lineMatch![1];

    // Step 2: Propose change using coordinate from read
    const proposeResult = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~quick brown~>slow red~~}{>>change animal speed' },
      resolver,
      state,
    );
    expect(proposeResult.isError).toBeUndefined();

    // Verify response structure
    const responseData = JSON.parse(proposeResult.content[0].text);
    expect(responseData.change_id).toBe('cn-1');
    expect(responseData.type).toBe('sub');

    // Step 3: Read again to verify the change was applied
    const readResult2 = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver,
      state,
    );
    expect(readResult2.isError).toBeUndefined();
    const text2 = readResult2.content[0].text;
    expect(text2).toContain('slow red');
    expect(text2).toContain('compact');
    // The file should now contain CriticMarkup substitution
    const fileOnDisk = await fs.readFile(filePath, 'utf-8');
    expect(fileOnDisk).toContain('{~~quick brown~>slow red~~}');
    expect(fileOnDisk).toContain('[^cn-1]');
    expect(fileOnDisk).toContain('change animal speed');
  });

  it('round-trip with insertion: read -> +text -> read', async () => {
    const config: ChangeDownConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
      author: { default: 'ai:e2e-test', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    };
    const resolver = await createTestResolver(tmpDir, config);

    const filePath = path.join(tmpDir, 'insert.md');
    await fs.writeFile(filePath, 'line one\nline two');

    // Read to get coordinates
    const readResult = await handleReadTrackedFile({ file: filePath, view: 'raw' }, resolver, state);
    expect(readResult.isError).toBeUndefined();
    const readText = readResult.content[0].text;

    // Get hash for line 1
    const lineMatch = readText.match(/\b1:([0-9a-f]{2})[\s.|]/);
    expect(lineMatch).not.toBeNull();
    const hash = lineMatch![1];

    // Insert after line 1
    const proposeResult = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{++\ninserted between lines++}', reason: 'test' },
      resolver,
      state,
    );
    expect(proposeResult.isError).toBeUndefined();

    // Verify on disk
    const fileOnDisk = await fs.readFile(filePath, 'utf-8');
    expect(fileOnDisk).toContain('{++');
    expect(fileOnDisk).toContain('inserted between lines');

    // Read again to verify hashline output reflects the change
    const readResult2 = await handleReadTrackedFile({ file: filePath, view: 'raw' }, resolver, state);
    expect(readResult2.isError).toBeUndefined();
    const text2 = readResult2.content[0].text;
    expect(text2).toContain('inserted between lines');
  });

  it('round-trip with deletion: read -> -text -> read', async () => {
    const config: ChangeDownConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
      author: { default: 'ai:e2e-test', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    };
    const resolver = await createTestResolver(tmpDir, config);

    const filePath = path.join(tmpDir, 'delete.md');
    await fs.writeFile(filePath, 'keep this\nremove this\nkeep this too');

    // Read to get coordinates
    const readResult = await handleReadTrackedFile({ file: filePath, view: 'raw' }, resolver, state);
    expect(readResult.isError).toBeUndefined();
    const readText = readResult.content[0].text;

    // Get hash for line 2
    const lineMatch = readText.match(/\b2:([0-9a-f]{2})[\s.|]/);
    expect(lineMatch).not.toBeNull();
    const hash = lineMatch![1];

    // Delete text on line 2
    const proposeResult = await handleProposeChange(
      { file: filePath, at: `2:${hash}`, op: '{--remove this--}', reason: 'test' },
      resolver,
      state,
    );
    expect(proposeResult.isError).toBeUndefined();

    // Verify deletion markup on disk
    const fileOnDisk = await fs.readFile(filePath, 'utf-8');
    expect(fileOnDisk).toContain('{--remove this--}');
  });

  it('chained edits: two propose_change calls on the same file', async () => {
    const config: ChangeDownConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
      author: { default: 'ai:e2e-test', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    };
    const resolver = await createTestResolver(tmpDir, config);

    const filePath = path.join(tmpDir, 'chained.md');
    await fs.writeFile(filePath, 'alpha\nbeta\ngamma');

    // First edit: read + propose on line 1
    const read1 = await handleReadTrackedFile({ file: filePath, view: 'raw' }, resolver, state);
    const hash1Match = read1.content[0].text.match(/\b1:([0-9a-f]{2})[\s.|]/);
    expect(hash1Match).not.toBeNull();

    const propose1 = await handleProposeChange(
      { file: filePath, at: `1:${hash1Match![1]}`, op: '{~~alpha~>ALPHA~~}', reason: 'test' },
      resolver,
      state,
    );
    expect(propose1.isError).toBeUndefined();

    // Second edit: re-read to get updated hashes, then propose on a different line
    const read2 = await handleReadTrackedFile({ file: filePath, view: 'raw' }, resolver, state);
    expect(read2.isError).toBeUndefined();

    // Line numbers shifted due to footnote addition; find "gamma" line
    const read2Text = read2.content[0].text;
    // gamma is on the line after beta; extract its hash
    const gammaLineMatch = read2Text.match(/\b(\d+):([0-9a-f]{2})[\s.|].*gamma/);
    expect(gammaLineMatch).not.toBeNull();
    const gammaLine = gammaLineMatch![1];
    const gammaHash = gammaLineMatch![2];

    const propose2 = await handleProposeChange(
      { file: filePath, at: `${gammaLine}:${gammaHash}`, op: '{~~gamma~>GAMMA~~}', reason: 'test' },
      resolver,
      state,
    );
    expect(propose2.isError).toBeUndefined();

    // Verify both changes on disk
    const fileOnDisk = await fs.readFile(filePath, 'utf-8');
    expect(fileOnDisk).toContain('{~~alpha~>ALPHA~~}');
    expect(fileOnDisk).toContain('{~~gamma~>GAMMA~~}');
    expect(fileOnDisk).toContain('[^cn-1]');
    expect(fileOnDisk).toContain('[^cn-2]');
  });

  it('env var switches mode without config change', async () => {
    // Start with classic config
    const config: ChangeDownConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
      author: { default: 'ai:e2e-test', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    };
    const resolver = await createTestResolver(tmpDir, config);

    const filePath = path.join(tmpDir, 'envtest.md');
    await fs.writeFile(filePath, 'hello world');

    // Without env var: classic mode, at/op params are rejected
    const classicResult = await handleProposeChange(
      { file: filePath, at: '1:ab', op: '{++text++}' },
      resolver,
      state,
    );
    expect(classicResult.isError).toBe(true);
    expect(classicResult.content[0].text).toContain('classic');

    // With env var override: compact mode, at/op should work
    const origEnv = process.env['CHANGEDOWN_PROTOCOL_MODE'];
    process.env['CHANGEDOWN_PROTOCOL_MODE'] = 'compact';
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const contentLines = content.split('\n');
      const hash = computeLineHash(0, contentLines[0], contentLines);
      const compactResult = await handleProposeChange(
        { file: filePath, at: `1:${hash}`, op: '{~~hello~>goodbye~~}', reason: 'test' },
        resolver,
        state,
      );
      expect(compactResult.isError).toBeUndefined();

      // Verify the change was applied
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~hello~>goodbye~~}');
    } finally {
      if (origEnv === undefined) delete process.env['CHANGEDOWN_PROTOCOL_MODE'];
      else process.env['CHANGEDOWN_PROTOCOL_MODE'] = origEnv;
    }
  });

  it('read output reflects compact tip when in compact mode', async () => {
    const config: ChangeDownConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
      author: { default: 'ai:e2e-test', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    };
    const resolver = await createTestResolver(tmpDir, config);

    const filePath = path.join(tmpDir, 'tip.md');
    await fs.writeFile(filePath, 'some content');

    const readResult = await handleReadTrackedFile({ file: filePath, view: 'raw' }, resolver, state);
    expect(readResult.isError).toBeUndefined();
    const text = readResult.content[0].text;
    // Compact mode: policy field shows 'compact' from protocol.mode
    expect(text).toContain('compact');
  });

  it('classic read output does NOT contain compact tip', async () => {
    const config: ChangeDownConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
      author: { default: 'ai:e2e-test', enforcement: 'optional' },
      hooks: { enforcement: 'warn', exclude: [] },
      matching: { mode: 'normalized' },
      hashline: { enabled: true, auto_remap: false },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
    };
    const resolver = await createTestResolver(tmpDir, config);

    const filePath = path.join(tmpDir, 'tip-classic.md');
    await fs.writeFile(filePath, 'some content');

    const readResult = await handleReadTrackedFile({ file: filePath, view: 'raw' }, resolver, state);
    expect(readResult.isError).toBeUndefined();
    const text = readResult.content[0].text;
    expect(text).not.toContain('compact');
  });
});
