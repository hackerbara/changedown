import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeBatch } from '@changetracks/mcp/internals';
import { computeLineHash } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/** Helper: compute hash for a 1-indexed line in file content. */
function hashForLine(content: string, lineNum: number): string {
  const lines = content.split('\n');
  return computeLineHash(lineNum - 1, lines[lineNum - 1], lines);
}

describe('propose_batch batch primitive', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-propose-batch-'));
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

  describe('validation', () => {
    it('rejects when file is missing', async () => {
      const result = await handleProposeBatch(
        {
          reason: 'test',
          changes: [{ old_text: 'a', new_text: 'b' }],
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/file|missing/i);
    });

    it('rejects when changes is empty', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const original = 'Hello world.';
      await fs.writeFile(filePath, original);

      const result = await handleProposeBatch(
        { file: filePath, reason: 'test', changes: [] },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(original);
    });

    it('rejects entire batch when one operation has invalid hash and file content unchanged', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const original = 'Line one.\nLine two.\nLine three.\n';
      await fs.writeFile(filePath, original);

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'batch with bad hash',
          changes: [
            { old_text: 'Line one.', new_text: 'Line 1.', start_line: 1, start_hash: 'zz' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(original);
    });
  });

  describe('application', () => {
    beforeEach(async () => {
      config.tracking!.auto_header = false;
      resolver = await createTestResolver(tmpDir, config);
    });

    it('applies multiple string-match edits in one batch', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'First. Second. Third.');

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'three substitutions',
          changes: [
            { old_text: 'First.', new_text: 'One.' },
            { old_text: 'Second.', new_text: 'Two.' },
            { old_text: 'Third.', new_text: 'Three.' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.group_id).toMatch(/^ct-\d+$/);
      expect(data.applied).toHaveLength(3);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('{~~First.~>One.~~}');
      expect(content).toContain('{~~Second.~>Two.~~}');
      expect(content).toContain('{~~Third.~>Three.~~}');
    });

    it('applies hashline-addressed edits with coordinate adjustment', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const body = 'A\nB\nC\n';
      await fs.writeFile(filePath, body);
      const h1 = hashForLine(body, 1);
      const h2 = hashForLine(body, 2);
      const h3 = hashForLine(body, 3);

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'three insertions',
          changes: [
            { old_text: '', new_text: ' after 1', after_line: 1, after_hash: h1 },
            { old_text: '', new_text: ' after 2', after_line: 2, after_hash: h2 },
            { old_text: '', new_text: ' after 3', after_line: 3, after_hash: h3 },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.group_id).toMatch(/^ct-\d+$/);
      expect(data.applied).toHaveLength(3);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('{++ after 1++}');
      expect(content).toContain('{++ after 2++}');
      expect(content).toContain('{++ after 3++}');
    });

    it('adjusts coordinates when earlier edit changes line count', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const body = 'Line1\nLine2\nLine3\nLine4\n';
      await fs.writeFile(filePath, body);
      const h2 = hashForLine(body, 2);
      // Second op uses string match so "Line4" is found after the first op's insert; hashline coordinate adjustment is covered by the three-insertion test above.
      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'insert then replace',
          changes: [
            { old_text: '', new_text: 'Inserted', after_line: 2, after_hash: h2 },
            { old_text: 'Line4', new_text: 'LineFour' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('Inserted');
      expect(content).toContain('{~~Line4~>LineFour~~}');
    });
  });

  describe('change group', () => {
    it('auto-creates a change group with group_id and dotted change_ids, no active group after, file contains group footnote with reasoning', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'Alpha. Beta. Gamma.');

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'Align wording',
          changes: [
            { old_text: 'Alpha.', new_text: 'A.' },
            { old_text: 'Beta.', new_text: 'B.' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.group_id).toMatch(/^ct-\d+$/);
      expect(data.document_state).toBeDefined();
      expect(data.document_state.total_changes).toBeGreaterThanOrEqual(1);
      expect(data.applied).toHaveLength(2);
      expect(data.applied.map((c: { change_id: string }) => c.change_id)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^ct-\d+\.1$/), expect.stringMatching(/^ct-\d+\.2$/)]),
      );
      expect(state.hasActiveGroup()).toBe(false);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toMatch(/\[\^ct-\d+\]:\s*@\S+\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*group\s*\|\s*proposed/);
      expect(content).toContain('Align wording');
    });

    it('batch-level reasoning in group footnote and per-operation reasoning in child footnotes', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'One. Two.');

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'Batch reason',
          changes: [
            { old_text: 'One.', new_text: '1.', reason: 'First op reason' },
            { old_text: 'Two.', new_text: '2.', reason: 'Second op reason' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('Batch reason');
      expect(content).toContain('First op reason');
      expect(content).toContain('Second op reason');
    });
  });

  describe('real-world scenarios', () => {
    beforeEach(async () => {
      config.tracking!.auto_header = false;
      resolver = await createTestResolver(tmpDir, config);
    });

    it('ADR wording alignment: 5 substitutions in one batch', async () => {
      const filePath = path.join(tmpDir, 'adr.md');
      await fs.writeFile(
        filePath,
        'We will support X. We will support Y. We will support Z. We will support W. We will support V.',
      );

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'Align ADR wording',
          changes: [
            { old_text: 'We will support X.', new_text: 'The system SHALL support X.' },
            { old_text: 'We will support Y.', new_text: 'The system SHALL support Y.' },
            { old_text: 'We will support Z.', new_text: 'The system SHALL support Z.' },
            { old_text: 'We will support W.', new_text: 'The system SHALL support W.' },
            { old_text: 'We will support V.', new_text: 'The system SHALL support V.' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.group_id).toMatch(/^ct-\d+$/);
      expect(data.applied).toHaveLength(5);
    });

    it('mixed operations: insert, substitute, delete in one batch', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'Keep this. Replace me. Remove me.');

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'Mixed batch',
          changes: [
            { old_text: '', new_text: 'Inserted. ', insert_after: 'Keep' },
            { old_text: 'Replace me.', new_text: 'Replaced.' },
            { old_text: ' Remove me.', new_text: '' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      const types = data.applied.map((c: { type: string }) => c.type);
      expect(types).toContain('ins');
      expect(types).toContain('sub');
      expect(types).toContain('del');
    });

  });

  // ─── affected_lines + preview response shape ─────────────────────────
  describe('affected_lines + preview in response', () => {
    beforeEach(async () => {
      config.tracking!.auto_header = false;
      resolver = await createTestResolver(tmpDir, config);
    });

    it('batch response includes affected_lines with content (not all-lines hashes)', async () => {
      const filePath = path.join(tmpDir, 'batch-preview.md');
      await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\nLine one\nLine two\nLine three\nLine four\nLine five');
      const content = await fs.readFile(filePath, 'utf-8');

      const result = await handleProposeBatch(
        {
          file: filePath,
          author: 'ai:test',
          changes: [
            { old_text: 'one', new_text: 'ONE', start_line: 2, start_hash: hashForLine(content, 2) },
            { old_text: 'three', new_text: 'THREE', start_line: 4, start_hash: hashForLine(content, 4) },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.affected_lines).toBeDefined();
      expect(data.updated_lines).toBeUndefined();
      const totalFileLines = (await fs.readFile(filePath, 'utf-8')).split('\n').length;
      expect(data.affected_lines.length).toBeLessThan(totalFileLines);
      for (const entry of data.affected_lines) {
        expect(entry.content).toBeDefined();
        expect(typeof entry.content).toBe('string');
      }
    });

    it('batch applied entries include preview field', async () => {
      const filePath = path.join(tmpDir, 'batch-preview2.md');
      await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\nLine one\nLine two\nLine three');
      const content = await fs.readFile(filePath, 'utf-8');

      const result = await handleProposeBatch(
        {
          file: filePath,
          author: 'ai:test',
          changes: [
            { old_text: 'one', new_text: 'ONE', start_line: 2, start_hash: hashForLine(content, 2), reason: 'fix' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.applied).toBeDefined();
      expect(data.applied[0].preview).toBeDefined();
      expect(data.applied[0].preview).toContain('ONE');
    });
  });

  // ─── Auto-header + hashline coordinate consistency ─────────────────
  // Regression: read_tracked_file returns coordinates for the file WITHOUT
  // a tracking header. handleProposeBatch auto-inserts the header, shifting
  // all line numbers by 1. The delta adjustment ensures agent coordinates
  // from the unshifted read still validate correctly.

  describe('auto_header + hashline batch coordinate shift', () => {
    it('batch with hashline params succeeds when auto_header shifts lines', async () => {
      // Re-enable auto_header (application tests above disable it)
      config.tracking!.auto_header = true;
      resolver = await createTestResolver(tmpDir, config);

      const filePath = path.join(tmpDir, 'no-header-batch.md');
      // File without tracking header
      const body = '# Title\n\nLine A\nLine B\n';
      await fs.writeFile(filePath, body);

      // Compute hashes as the agent would see them (no header)
      const h1 = hashForLine(body, 1);
      const h3 = hashForLine(body, 3);

      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'batch with auto_header shift',
          changes: [
            { old_text: '', new_text: 'After title', after_line: 1, after_hash: h1 },
            { old_text: 'Line A', new_text: 'Line Alpha', start_line: 3, start_hash: h3 },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.applied).toHaveLength(2);

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toContain('<!-- ctrcks.com/v1: tracked -->');
      expect(written).toContain('{++After title++}');
      expect(written).toContain('{~~Line A~>Line Alpha~~}');
    });
  });
});
