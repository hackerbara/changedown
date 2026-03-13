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

describe('partial batch semantics (Bug 10)', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-partial-batch-'));
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

  // ── handleProposeBatch direct tests ──

  describe('handleProposeBatch partial-success behavior', () => {
    it('applies good changes and reports failures separately', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nFirst line.\n\nSecond line.\n\nThird line.\n',
      );

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'partial test',
          changes: [
            { old_text: 'First line.', new_text: 'Line 1.' },
            { old_text: 'NONEXISTENT TEXT', new_text: 'Replacement' },  // will fail
            { old_text: 'Third line.', new_text: 'Line 3.' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.applied).toBeDefined();
      expect(data.failed).toBeDefined();
      expect(data.applied.length).toBe(2);
      expect(data.failed.length).toBe(1);
      // The failed entry should reference the original index (1)
      expect(data.failed[0].index).toBe(1);
      expect(data.failed[0].reason).toMatch(/not found|no match/i);
    });

    it('partial behavior is default (no flag needed)', async () => {
      const filePath = path.join(tmpDir, 'default-partial.md');
      await fs.writeFile(filePath, '# Test\n\nFirst line.\nSecond line.\nThird line.\n');

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'default partial test',
          changes: [
            { old_text: 'First line.', new_text: 'Line 1.' },
            { old_text: 'NONEXISTENT', new_text: 'nope' },
            { old_text: 'Third line.', new_text: 'Line 3.' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.applied.length).toBe(2);
      expect(data.failed.length).toBe(1);
      expect(data.failed[0].index).toBe(1);
    });

    it('batch with all changes succeeding returns applied array', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nLine one.\n\nLine two.\n',
      );

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'all good',
          changes: [
            { old_text: 'Line one.', new_text: 'Line 1.' },
            { old_text: 'Line two.', new_text: 'Line 2.' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      // All succeeded: applied should have 2, failed should be empty
      expect(data.applied.length).toBe(2);
      expect(data.failed.length).toBe(0);
    });

    it('batch where ALL changes fail returns error', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nSome content.\n',
      );

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'all fail',
          changes: [
            { old_text: 'NOPE', new_text: 'A' },
            { old_text: 'ALSO NOPE', new_text: 'B' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      // When all fail, even partial mode should return an error
      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[1].text);
      expect(errorData.error.failed).toBeDefined();
      expect(errorData.error.failed.length).toBe(2);
    });

    it('correctly writes only successful changes to disk', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nKeep this.\n\nChange this.\n\nAlso keep.\n',
      );

      await handleProposeBatch(
        {
          file: filePath,
          reason: 'disk write check',
          changes: [
            { old_text: 'Change this.', new_text: 'Changed!' },
            { old_text: 'MISSING TEXT', new_text: 'Nope' },  // fails
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      const written = await fs.readFile(filePath, 'utf-8');
      // Successful change should be in the file
      expect(written).toContain('Changed!');
      // Failed change should NOT affect the file
      expect(written).not.toContain('Nope');
      // Original text for failed op should remain unchanged
      expect(written).not.toContain('MISSING TEXT');
    });

    it('group footnote only references successfully applied child IDs', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nAlpha.\n\nBeta.\n\nGamma.\n',
      );

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'group check',
          changes: [
            { old_text: 'Alpha.', new_text: 'A' },
            { old_text: 'MISSING', new_text: 'X' },  // fails
            { old_text: 'Gamma.', new_text: 'G' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);

      // Read the file to verify footnotes
      const written = await fs.readFile(filePath, 'utf-8');

      // Each applied change should have a footnote
      for (const change of data.applied) {
        expect(written).toContain(`[^${change.change_id}]`);
      }
    });
  });

  // ── handleProposeChange delegation tests (partial passes through) ──

  describe('handleProposeChange batch delegation', () => {
    it('propose_change(changes=[...]) is atomic: mixed valid/invalid fails entire call', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nHello world.\n\nGoodbye world.\n',
      );

      const result = await handleProposeChange(
        {
          file: filePath,
          changes: [
            { old_text: 'Hello world.', new_text: 'Hi world.' },
            { old_text: 'DOES NOT EXIST', new_text: 'Fail' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      const errPayload = result.content[1]?.text ? JSON.parse(result.content[1].text) : {};
      expect((errPayload.error?.message ?? result.content[0].text)).toBeDefined();
      // No change IDs created; file unchanged (atomic rollback)
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toContain('Hello world.');
      expect(written).not.toContain('Hi world.');
    });

    it('propose_change with all valid changes applies both', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nHello world.\n\nGoodbye world.\n',
      );

      const result = await handleProposeChange(
        {
          file: filePath,
          changes: [
            { old_text: 'Hello world.', new_text: 'Hi world.' },
            { old_text: 'Goodbye world.', new_text: 'Bye world.' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.applied).toBeDefined();
      expect(data.applied.length).toBe(2);
      expect(data.failed).toBeDefined();
      expect(data.failed.length).toBe(0);
    });
  });

  // ── Structural errors still fail the whole batch even with partial=true ──

  describe('structural errors bypass partial mode', () => {
    it('missing file still fails entire batch', async () => {
      const result = await handleProposeBatch(
        {
          file: path.join(tmpDir, 'nonexistent.md'),
          reason: 'test',
          changes: [
            { old_text: 'a', new_text: 'b' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
    });

    it('empty changes array still fails entire batch', async () => {
      const result = await handleProposeBatch(
        {
          file: path.join(tmpDir, 'doc.md'),
          reason: 'test',
          changes: [],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
    });
  });
});
