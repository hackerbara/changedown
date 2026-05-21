import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeBatch } from '@changedown/mcp/internals';
import { handleProposeChange } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import { ConfigResolver } from '@changedown/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changedown/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('partial batch semantics (Bug 10)', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeDownConfig;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-partial-batch-'));
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
    it('applies good changes and reports failures separately (explicit partial:true)', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nFirst line.\n\nSecond line.\n\nThird line.\n',
      );

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'partial test',
          partial: true,
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

    it('atomic default: batch with one failing op aborts entire batch (ADR-036 §4)', async () => {
      const filePath = path.join(tmpDir, 'default-atomic.md');
      const original = '# Test\n\nFirst line.\nSecond line.\nThird line.\n';
      await fs.writeFile(filePath, original);

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'atomic default test',
          // NO partial flag — atomic is the default
          changes: [
            { old_text: 'First line.', new_text: 'Line 1.' },
            { old_text: 'NONEXISTENT', new_text: 'nope' },  // will fail
            { old_text: 'Third line.', new_text: 'Line 3.' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      // Atomic default: one failure means the whole batch fails
      expect(result.isError).toBe(true);
      // File must be unchanged (all-or-nothing)
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(original);
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

    it('partial:true batch where ALL changes fail returns error with failed[] details', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nSome content.\n',
      );

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'all fail',
          partial: true,
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

    it('partial:true correctly writes only successful changes to disk', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nKeep this.\n\nChange this.\n\nAlso keep.\n',
      );

      await handleProposeBatch(
        {
          file: filePath,
          reason: 'disk write check',
          partial: true,
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

    it('partial:true group footnote only references successfully applied child IDs', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(
        filePath,
        '# Test\n\nAlpha.\n\nBeta.\n\nGamma.\n',
      );

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'group check',
          partial: true,
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

  // ── ADR-036 §4: atomic default + explicit partial opt-in ──

  describe('atomic default (ADR-036 §4)', () => {
    it('batch with one failing op aborts entire batch — no disk write', async () => {
      const filePath = path.join(tmpDir, 'atomic-abort.md');
      const original = '# Doc\n\nFirst.\n\nSecond.\n\nThird.\n';
      await fs.writeFile(filePath, original);

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'atomic abort test',
          // NO partial flag — atomic is the default per ADR-036 §4
          changes: [
            { old_text: 'First.', new_text: 'One.' },
            { old_text: 'DOES NOT EXIST', new_text: 'nope' },  // will fail
            { old_text: 'Third.', new_text: 'Three.' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      // File must be completely unchanged — all-or-nothing
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(original);
    });

    it('batch where all ops succeed completes normally in atomic mode', async () => {
      const filePath = path.join(tmpDir, 'atomic-success.md');
      await fs.writeFile(filePath, '# Doc\n\nAlpha.\n\nBeta.\n');

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'atomic success test',
          changes: [
            { old_text: 'Alpha.', new_text: 'A.' },
            { old_text: 'Beta.', new_text: 'B.' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.applied).toHaveLength(2);
      expect(data.failed).toHaveLength(0);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('A.');
      expect(content).toContain('B.');
    });

    it('atomic abort error response contains diagnostics', async () => {
      const filePath = path.join(tmpDir, 'atomic-diag.md');
      await fs.writeFile(filePath, 'Foo.\n');

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'diagnostics test',
          changes: [
            { old_text: 'Foo.', new_text: 'Bar.' },       // would succeed
            { old_text: 'MISSING', new_text: 'nope' },    // fails — aborts whole batch
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      // Error message should identify the failing operation
      const msg = result.content[0].text;
      expect(msg).toMatch(/Operation 1:|not found|no match/i);
    });
  });

  describe('explicit partial:true opt-in', () => {
    it('partial:true applies valid ops and reports failures — file is modified', async () => {
      const filePath = path.join(tmpDir, 'partial-opt-in.md');
      await fs.writeFile(filePath, 'Good text.\n\nBad target.\n');

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'explicit partial',
          partial: true,
          changes: [
            { old_text: 'Good text.', new_text: 'Better text.' },
            { old_text: 'NONEXISTENT', new_text: 'nope' },  // will fail
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.applied).toHaveLength(1);
      expect(data.failed).toHaveLength(1);
      expect(data.failed[0].index).toBe(1);
      // The successful op IS written to disk
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('Better text.');
    });
  });

  // ── handleProposeChange delegation tests (atomic by default) ──

  describe('handleProposeChange batch delegation', () => {
    it('propose_change(changes=[...]) is atomic by default: one failing op writes nothing', async () => {
      const filePath = path.join(tmpDir, 'propose-change-atomic.md');
      const original = '# Test\n\nFirst line.\nSecond line.\nThird line.\n';
      await fs.writeFile(filePath, original);

      const result = await handleProposeChange(
        {
          file: filePath,
          reason: 'propose_change atomic default',
          changes: [
            { old_text: 'First line.', new_text: 'Line 1.' },
            { old_text: 'NONEXISTENT TEXT', new_text: 'Replacement' },
            { old_text: 'Third line.', new_text: 'Line 3.' },
          ],
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(original);
      const data = JSON.parse(result.content[1].text);
      expect(data.error.operation_index).toBe(1);
      expect(data.error.total_operations).toBe(3);
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
