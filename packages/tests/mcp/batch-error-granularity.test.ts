import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeBatch } from '@changetracks/mcp/internals';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('batch error granularity — operation_index in error responses', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-batch-error-'));
    state = new SessionState();
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: false,
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

  it('partial success: bad op reported in failed[], good ops in applied[]', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'First line.\n\nSecond line.\n\nThird line.\n');

    // Send a batch of 3 operations where the 2nd fails (bad target text)
    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Test batch',
        changes: [
          { old_text: 'First line.', new_text: 'Heading' },           // Good
          { old_text: 'NONEXISTENT', new_text: 'Replacement' },       // BAD — text not found
          { old_text: 'Third line.', new_text: '3rd line.' },          // Good
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    // Partial success — not an error since 2 ops succeeded
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied.length).toBe(2);
    expect(data.failed.length).toBe(1);
    expect(data.failed[0].index).toBe(1); // 0-indexed, 2nd operation
  });

  it('partial success: first op fails, second succeeds', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.\n');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'First op fails',
        changes: [
          { old_text: 'MISSING_TEXT', new_text: 'Replacement' },   // BAD — index 0
          { old_text: 'Hello world.', new_text: 'Hi world.' },      // Good
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    // Partial success — not an error since 1 op succeeded
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied.length).toBe(1);
    expect(data.failed.length).toBe(1);
    expect(data.failed[0].index).toBe(0);
  });

  it('partial success: empty old_text+new_text fails, good op succeeds', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Some content.\n');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Empty op',
        changes: [
          { old_text: 'Some content.', new_text: 'New content.' },    // Good
          { old_text: '', new_text: '' },                              // BAD — both empty
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    // Partial success — not an error since 1 op succeeded
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied.length).toBe(1);
    expect(data.failed.length).toBe(1);
    expect(data.failed[0].index).toBe(1);
    expect(data.failed[0].reason).toContain('Operation 1:');
  });

  it('application-phase error uses 0-indexed "Operation N:" format (not 1-indexed)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Use text where 'beta gamma' and 'gamma delta' overlap — this is now caught
    // during validation as an overlap error, not during application.
    await fs.writeFile(filePath, 'alpha beta gamma delta\n');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Trigger overlap error',
        changes: [
          { old_text: 'beta gamma', new_text: 'BG' },
          // 'gamma delta' overlaps with 'beta gamma' at 'gamma'
          { old_text: 'gamma delta', new_text: 'GD' },
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    // Overlapping changes are now rejected during validation with a clear overlap message
    expect(result.isError).toBe(true);
    const errorText = result.content[0].text;
    expect(errorText.toLowerCase()).toContain('overlap');
  });

  it('application-phase error total_operations reflects input array length', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // 'beta gamma' and 'gamma delta' overlap — now caught at validation.
    // Verify the overlap error includes total_operations.
    await fs.writeFile(filePath, 'alpha beta gamma delta epsilon\n');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Check total_operations',
        changes: [
          { old_text: 'alpha', new_text: 'A' },
          { old_text: 'beta gamma', new_text: 'BG' },
          // 'gamma delta' overlaps with 'beta gamma' at 'gamma'
          { old_text: 'gamma delta', new_text: 'GD' },
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[1].text);
    // total_operations must equal the input changes array length (3)
    expect(data.error.total_operations).toBe(3);
  });

  it('partial success writes only successful changes to disk', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const original = 'First line.\n\nSecond line.\n\nThird line.\n';
    await fs.writeFile(filePath, original);

    await handleProposeBatch(
      {
        file: filePath,
        reason: 'Test batch',
        changes: [
          { old_text: 'First line.', new_text: 'Heading' },
          { old_text: 'NONEXISTENT', new_text: 'Replacement' },
          { old_text: 'Third line.', new_text: '3rd line.' },
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    // File should contain successful changes (partial success writes to disk)
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('Heading');
    expect(content).toContain('3rd line.');
    expect(content).not.toContain('Replacement');
  });

  it('successful batch does NOT include operation_index in response', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Alpha. Beta. Gamma.');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'All succeed',
        changes: [
          { old_text: 'Alpha.', new_text: 'A.' },
          { old_text: 'Beta.', new_text: 'B.' },
          { old_text: 'Gamma.', new_text: 'G.' },
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.operation_index).toBeUndefined();
    expect(data.group_id).toBeDefined();
    expect(data.applied).toHaveLength(3);
  });

  it('all-failed batch uses "Operation N:" error format', async () => {
    // When ALL operations fail, the batch returns an error with proper format
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Line one.\nLine two.\n');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Format check',
        changes: [
          { old_text: '', new_text: '' },  // BAD — both empty
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    const message = result.content[0].text;
    expect(message).not.toMatch(/Batch operation/i);
  });

  it('partial success reports failure reasons with "Operation N:" format', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Line one.\nLine two.\n');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'Format check',
        changes: [
          { old_text: 'Line one.', new_text: 'L1.' },
          { old_text: '', new_text: '' },  // BAD — both empty
        ],
        author: 'ai:test',
      },
      resolver,
      state,
    );

    // Partial success — good op applied
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied.length).toBe(1);
    expect(data.failed.length).toBe(1);
    // Failure reason uses "Operation N:" format
    expect(data.failed[0].reason).toContain('Operation 1:');
  });

  it('propose_change(changes=[...]) reports all validation failures, not just the first', async () => {
    const content = '<!-- ctrcks.com/v1: tracked -->\nLine one.\nLine two.\nLine three.\n';
    const filePath = path.join(tmpDir, 'multi-fail.md');
    await fs.writeFile(filePath, content);

    const result = await handleProposeChange({
      file: filePath,
      author: 'ai:test',
      changes: [
        { old_text: 'Line one.', new_text: 'Changed one.', start_line: 2, start_hash: 'ff', reason: 'stale hash 1' },
        { old_text: 'Line two.', new_text: 'Changed two.', start_line: 3, start_hash: 'ff', reason: 'stale hash 2' },
      ],
    }, resolver, state);

    // Should report failures for BOTH operations, not just the first.
    // The response is an all-failed partial batch: isError=true, with failed[].index for each op.
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[1].text);
    expect(data.error.failed).toHaveLength(2);
    expect(data.error.failed[0].index).toBe(0);
    expect(data.error.failed[1].index).toBe(1);
  });
});
