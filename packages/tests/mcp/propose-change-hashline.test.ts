import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { validateOrRelocate, validateOrAutoRemap, computeLineHash } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Helper: compute hash for a 1-indexed line in a file content string.
 */
function hashForLine(content: string, lineNum: number): string {
  const lines = content.split('\n');
  return computeLineHash(lineNum - 1, lines[lineNum - 1], lines);
}

describe('propose_change hashline addressing', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-propose-hashline-'));
    state = new SessionState();
    // Disable auto_header to avoid header insertion shifting line numbers.
    // Header insertion is tested separately in propose-change.test.ts.
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

  // ─── Legacy string match: unchanged behavior ───────────────────────

  describe('legacy string match (no line params)', () => {
    it('substitution works the same as before', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'The quick brown fox jumps over the lazy dog.');

      const result = await handleProposeChange(
        { file: filePath, old_text: 'quick brown', new_text: 'slow red' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.change_id).toBe('ct-1');
      expect(data.type).toBe('sub');
      // affected_lines present even in legacy mode (content, no hashes when hashlines disabled)
      expect(data.affected_lines).toBeDefined();

      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~quick brown~>slow red~~}[^ct-1]');
    });

    it('insertion with insert_after works the same as before', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, 'The quick fox jumps.');

      const result = await handleProposeChange(
        { file: filePath, old_text: '', new_text: ' brown', insert_after: 'quick' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('ins');
      expect(data.affected_lines).toBeDefined();

      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('quick{++ brown++}[^ct-1]');
    });
  });

  // ─── Config gate ───────────────────────────────────────────────────

  describe('config gate', () => {
    it('returns error when hashline disabled but line params provided', async () => {
      const disabledConfig: ChangeTracksConfig = {
        ...config,
        hashline: { enabled: false, auto_remap: false },
      };
      const disabledResolver = await createTestResolver(tmpDir, disabledConfig);
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        { file: filePath, old_text: '', new_text: 'replaced', start_line: 2, start_hash: hash },
        disabledResolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Hashline addressing requires');
      expect(result.content[0].text).toContain('[hashline] enabled = true');
    });

    it('returns error when hashline disabled but after_line params provided', async () => {
      const disabledConfig: ChangeTracksConfig = {
        ...config,
        hashline: { enabled: false, auto_remap: false },
      };
      const disabledResolver = await createTestResolver(tmpDir, disabledConfig);
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        { file: filePath, old_text: '', new_text: 'new stuff', after_line: 2, after_hash: hash },
        disabledResolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Hashline addressing requires');
    });
  });

  // ─── Line range substitution ───────────────────────────────────────

  describe('line range substitution', () => {
    it('replaces single line content with CriticMarkup', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Line TWO',
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('sub');
      expect(data.change_id).toBe('ct-1');
      expect(data.affected_lines).toBeDefined();
      expect(Array.isArray(data.affected_lines)).toBe(true);

      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~Line two~>Line TWO~~}[^ct-1]');
    });

    it('multi-line range: replaces lines start through end', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three\nLine four';
      await fs.writeFile(filePath, content);
      const startHash = hashForLine(content, 2);
      const endHash = hashForLine(content, 3);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Lines 2-3 replaced',
          start_line: 2,
          start_hash: startHash,
          end_line: 3,
          end_hash: endHash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('sub');

      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~Line two\nLine three~>Lines 2-3 replaced~~}[^ct-1]');
    });
  });

  // ─── Line range deletion ───────────────────────────────────────────

  describe('line range deletion', () => {
    it('deletes single line content', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: '',
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('del');

      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{--Line two--}[^ct-1]');
    });
  });

  // ─── Line insertion via after_line ─────────────────────────────────

  describe('line insertion via after_line', () => {
    it('inserts new text after specified line', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Inserted line',
          after_line: 2,
          after_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('ins');
      expect(data.affected_lines).toBeDefined();

      const modified = await fs.readFile(filePath, 'utf-8');
      // After line 2, insert the markup before line 3
      expect(modified).toContain('{++Inserted line++}[^ct-1]');
      // The insertion should appear between line 2 and line 3
      const lines = modified.split('\n');
      const insertionLineIdx = lines.findIndex(l => l.includes('{++Inserted line++}'));
      expect(insertionLineIdx).toBeGreaterThan(0);
    });
  });

  // ─── Hybrid mode (line + old_text) ────────────────────────────────

  describe('hybrid mode (line + old_text)', () => {
    it('scopes old_text search to identified line range', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      // "word" appears on both lines 1 and 2. With hybrid, scope to line 2 only.
      const content = 'The word appears here\nAnother word appears here\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: 'word',
          new_text: 'TERM',
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('sub');

      const modified = await fs.readFile(filePath, 'utf-8');
      // Only the second line's "word" should be replaced
      expect(modified).toContain('The word appears here');
      expect(modified).toContain('{~~word~>TERM~~}[^ct-1]');
      // The substitution should be on line 2
      expect(modified).toContain('Another {~~word~>TERM~~}[^ct-1] appears here');
    });

    it('hybrid mode with multi-line range', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'word here\nfoo word bar\nbaz word qux\nword there';
      await fs.writeFile(filePath, content);
      const startHash = hashForLine(content, 2);
      const endHash = hashForLine(content, 3);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: 'foo word bar',
          new_text: 'foo TERM bar',
          start_line: 2,
          start_hash: startHash,
          end_line: 3,
          end_hash: endHash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~foo word bar~>foo TERM bar~~}[^ct-1]');
    });
  });

  // ─── Hash mismatch error ──────────────────────────────────────────

  describe('hash mismatch', () => {
    it('returns error with context when start_hash is wrong', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'replaced',
          start_line: 2,
          start_hash: 'zz', // Wrong hash
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Hash mismatch on line 2');
    });

    it('returns error when end_hash is wrong', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const startHash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'replaced',
          start_line: 2,
          start_hash: startHash,
          end_line: 3,
          end_hash: 'zz', // Wrong hash
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Hash mismatch on line 3');
    });

    it('auto-relocates end_line when hash found uniquely at different line', async () => {
      const content = 'L1\nL2\nL3\nL4\nL5';
      const filePath = path.join(tmpDir, 'relocate-end.md');
      await fs.writeFile(filePath, content);
      const hashLine2 = hashForLine(content, 2);
      const hashLine4 = hashForLine(content, 4);
      const shifted = 'L1\nL2\nINSERTED\nL3\nL4\nL5';
      await fs.writeFile(filePath, shifted);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'REPLACED BLOCK',
          start_line: 2,
          start_hash: hashLine2,
          end_line: 4,
          end_hash: hashLine4,
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.relocated).toBeDefined();
      expect(data.relocated).toContainEqual(
        expect.objectContaining({ param: 'end_line', from: 4, to: 5 }),
      );
    });

    it('returns error when after_hash is wrong', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'new stuff',
          after_line: 2,
          after_hash: 'zz', // Wrong hash
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Hash mismatch on line 2');
    });

    it('auto-relocates after_line when hash found uniquely at different line', async () => {
      const content = 'L1\nL2\nL3';
      const filePath = path.join(tmpDir, 'relocate-after.md');
      await fs.writeFile(filePath, content);
      const hashLine2 = hashForLine(content, 2);
      const shifted = 'L1\nINSERTED\nL2\nL3';
      await fs.writeFile(filePath, shifted);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'NEW CONTENT',
          after_line: 2,
          after_hash: hashLine2,
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.relocated).toBeDefined();
      expect(data.relocated).toContainEqual(
        expect.objectContaining({ param: 'after_line', from: 2, to: 3 }),
      );
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toContain('L2\n{++NEW CONTENT++}');
    });

    it('validateOrRelocate finds relocated line when called with handler-style inputs', async () => {
      // Reproduce exact data the handler would have
      const content = 'L1_aaa\nL2_bbb\nL3_ccc\nL4_ddd';
      const shifted = 'L1_aaa\nL2_bbb\nINSERTED\nL3_ccc\nL4_ddd';
      const filePath = path.join(tmpDir, 'relocate-start.md');
      await fs.writeFile(filePath, shifted);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const fileLines = fileContent.split('\n');
      const hashLine3 = hashForLine(content, 3);
      const relocations: Array<{ param: string; from: number; to: number }> = [];
      const got = validateOrRelocate(
        { line: 3, hash: hashLine3 },
        fileLines,
        'start_line',
        relocations,
      );
      expect(got).toBe(4);
      expect(relocations).toContainEqual(
        expect.objectContaining({ param: 'start_line', from: 3, to: 4 }),
      );
    });

    it('auto-relocates start_line when hash found uniquely at different line', async () => {
      const content = 'L1_aaa\nL2_bbb\nL3_ccc\nL4_ddd';
      const filePath = path.join(tmpDir, 'relocate-start.md');
      await fs.writeFile(filePath, content);
      const hashLine3 = hashForLine(content, 3);
      const shifted = 'L1_aaa\nL2_bbb\nINSERTED\nL3_ccc\nL4_ddd';
      await fs.writeFile(filePath, shifted);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'L3_CCC',
          start_line: 3,
          start_hash: hashLine3,
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('sub');
      expect(data.relocated).toBeDefined();
      expect(data.relocated).toContainEqual(
        expect.objectContaining({ param: 'start_line', from: 3, to: 4 }),
      );
    });
  });

  // ─── Whitespace-only edits ──────────────────────────────────────────

  describe('whitespace-only edits', () => {
    it('allows edits that only change whitespace (no-op detection removed)', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: '  Line  two  ', // Whitespace-different but same content
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      // Should succeed — whitespace changes are meaningful for character-level editing
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('sub');
    });
  });

  // ─── Prefix stripping ─────────────────────────────────────────────

  describe('prefix stripping in new_text', () => {
    it('strips hashline prefixes from new_text lines', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: '2:ab|Line TWO', // Model echoed hashline prefix
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      // The prefix should be stripped; only "Line TWO" as new text
      expect(modified).toContain('{~~Line two~>Line TWO~~}[^ct-1]');
      expect(modified).not.toContain('2:ab|');
    });
  });

  // ─── Updated hashes in response ───────────────────────────────────

  describe('updated hashes in response', () => {
    it('includes content in affected_lines when hashlines enabled', async () => {
      // Compact mode required for at/op syntax
      const compactConfig = { ...config, protocol: { ...config.protocol, mode: 'compact' as const } };
      const compactResolver = await createTestResolver(tmpDir, compactConfig);
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash2 = hashForLine(content, 2);

      const result = await handleProposeChange(
        { file: 'doc.md', at: `2:${hash2}`, op: '{~~two~>TWO~~}', author: 'ai:test' },
        compactResolver,
        state,
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.affected_lines).toBeDefined();
      expect(Array.isArray(data.affected_lines)).toBe(true);
      // Each entry should have line, hash, and content
      const entry = data.affected_lines.find((l: any) => l.line === 2);
      expect(entry).toBeDefined();
      expect(entry.hash).toBeDefined(); // hashline enabled
      expect(entry.content).toContain('TWO'); // shows the modified content
    });

    it('omits hash from affected_lines when hashlines disabled', async () => {
      // Create a config with hashline disabled
      const noHashConfig = { ...config, hashline: { ...config.hashline, enabled: false } };
      const noHashResolver = await createTestResolver(tmpDir, noHashConfig);
      const filePath = path.join(tmpDir, 'doc2.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        { file: 'doc2.md', old_text: 'Line two', new_text: 'Line TWO', author: 'ai:test' },
        noHashResolver,
        new SessionState(),
      );

      const data = JSON.parse(result.content[0].text);
      expect(data.affected_lines).toBeDefined();
      const entry = data.affected_lines.find((l: any) => l.line === 2);
      expect(entry).toBeDefined();
      expect(entry.hash).toBeUndefined(); // no hash when disabled
      expect(entry.content).toContain('TWO');
    });

    it('includes affected_lines with hashes and content for affected lines', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Line TWO',
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.affected_lines).toBeDefined();
      expect(Array.isArray(data.affected_lines)).toBe(true);
      expect(data.affected_lines.length).toBeGreaterThan(0);
      // Each entry should have line, content, and hash (hashlines enabled)
      for (const entry of data.affected_lines) {
        expect(entry).toHaveProperty('line');
        expect(entry).toHaveProperty('content');
        expect(entry).toHaveProperty('hash');
        expect(typeof entry.line).toBe('number');
        expect(typeof entry.content).toBe('string');
        expect(typeof entry.hash).toBe('string');
      }
    });
  });

  // ─── Chained edits without re-reading ──────────────────────────────

  describe('chained edits without re-reading', () => {
    it('succeeds with stale line numbers across multiple sequential edits', async () => {
      const content = 'Title\n\nSection one\n\nSection two\n\nSection three';
      const filePath = path.join(tmpDir, 'chained.md');
      await fs.writeFile(filePath, content);

      const hashSec1 = hashForLine(content, 3);
      const hashSec2 = hashForLine(content, 5);
      const hashSec3 = hashForLine(content, 7);

      const result1 = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Section ONE',
          start_line: 3,
          start_hash: hashSec1,
          author: 'ai:test',
        },
        resolver,
        state,
      );
      expect(result1.isError).toBeUndefined();

      const result2 = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Section TWO',
          start_line: 5,
          start_hash: hashSec2,
          author: 'ai:test',
        },
        resolver,
        state,
      );
      expect(result2.isError).toBeUndefined();
      const data2 = JSON.parse(result2.content[0].text);
      if (data2.relocated) {
        expect(data2.relocated[0].param).toBe('start_line');
        expect(data2.relocated[0].from).toBe(5);
        expect(data2.relocated[0].to).toBeGreaterThan(5);
      }

      const result3 = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Section THREE',
          start_line: 7,
          start_hash: hashSec3,
          author: 'ai:test',
        },
        resolver,
        state,
      );
      expect(result3.isError).toBeUndefined();

      const finalContent = await fs.readFile(filePath, 'utf-8');
      expect(finalContent).toContain('Section ONE');
      expect(finalContent).toContain('Section TWO');
      expect(finalContent).toContain('Section THREE');
    });
  });

  // ─── Staleness check ──────────────────────────────────────────────

  describe('staleness check', () => {
    it('warns when file has changed since last read_tracked_file', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);

      // Record hashes from a "previous read" matching original content
      state.recordFileHashes(filePath, [
        { line: 1, raw: hashForLine(content, 1), settled: hashForLine(content, 1) },
        { line: 2, raw: hashForLine(content, 2), settled: hashForLine(content, 2) },
        { line: 3, raw: hashForLine(content, 3), settled: hashForLine(content, 3) },
      ]);

      // Now modify the file externally (simulating another agent/editor)
      const modified = 'Line one\nLine two CHANGED\nLine three';
      await fs.writeFile(filePath, modified);

      const startHash = hashForLine(modified, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Line two REPLACED',
          start_line: 2,
          start_hash: startHash,
        },
        resolver,
        state,
      );

      // The change should succeed but include a staleness warning
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.change_id).toBe('ct-1');
      expect(data.warning).toBeDefined();
      expect(data.warning).toMatch(/stale|changed|outdated/i);
    });
  });

  // ─── Boundary echo stripping ──────────────────────────────────────

  describe('boundary echo stripping', () => {
    it('strips echoed context lines from new_text in line-range mode', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three\nLine four';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      // Model echoes "Line one" (boundary above) and "Line three" (boundary below)
      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Line one\nLine TWO\nLine three',
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      // The boundary lines should be stripped, only "Line TWO" should be the replacement
      expect(modified).toContain('{~~Line two~>Line TWO~~}[^ct-1]');
    });
  });

  // ─── Unicode preservation (no confusable normalization) ──────────

  describe('Unicode preservation in new_text', () => {
    it('preserves Unicode en-dash in new_text (no confusable normalization)', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      // U+2013 EN DASH in new_text — should be preserved as-is
      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Line\u2013two', // en dash
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      // The en dash should be preserved as-is
      expect(modified).toContain('Line\u2013two');
      expect(modified).not.toContain('Line-two');
    });
  });

  // ─── Staleness re-recording after write ──────────────────────────

  describe('staleness re-recording after write', () => {
    it('chained edits do not produce false staleness warnings', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three\nLine four\nLine five';
      await fs.writeFile(filePath, content);

      // Simulate a prior read_tracked_file by recording hashes
      const lines = content.split('\n');
      const hashes = lines.map((line, i) => ({
        line: i + 1,
        raw: hashForLine(content, i + 1),
        settled: hashForLine(content, i + 1),
      }));
      state.recordFileHashes(filePath, hashes);

      // First edit
      const hash2 = hashForLine(content, 2);
      const result1 = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Line TWO',
          start_line: 2,
          start_hash: hash2,
        },
        resolver,
        state,
      );
      expect(result1.isError).toBeUndefined();

      // Read the modified file to get new hashes
      const modifiedContent = await fs.readFile(filePath, 'utf-8');

      // Second edit on a different line
      const hash4 = hashForLine(modifiedContent, 4);
      const result2 = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Line FOUR',
          start_line: 4,
          start_hash: hash4,
        },
        resolver,
        state,
      );
      expect(result2.isError).toBeUndefined();
      const data2 = JSON.parse(result2.content[0].text);
      // Should NOT have a staleness warning — hashes were re-recorded after first write
      expect(data2.warning).toBeUndefined();
    });
  });

  // ─── affected_lines covers edit region ──────────────────────────

  describe('affected_lines covers edit region', () => {
    it('returns affected_lines with content for edited region', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      // File with enough lines that footnotes are far from edit region
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      const content = lines.join('\n');
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Line TWO',
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.affected_lines).toBeDefined();
      expect(Array.isArray(data.affected_lines)).toBe(true);
      expect(data.affected_lines.length).toBeGreaterThan(0);

      // The affected line at line 2 should contain the CriticMarkup
      const line2 = data.affected_lines.find((l: any) => l.line === 2);
      expect(line2).toBeDefined();
      expect(line2.content).toContain('TWO');
      expect(line2.hash).toBeDefined(); // hashlines enabled
    });
  });

  // ─── Nested CriticMarkup guard ──────────────────────────────────

  describe('nested CriticMarkup guard', () => {
    it('rejects pure line-range edit on line with existing CriticMarkup', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\n{++Line two inserted++}[^ct-1]\nLine three\n\n[^ct-1]: @test | 2026-02-12 | ins | proposed';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Completely new line two',
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('existing CriticMarkup');
      expect(result.content[0].text).toContain('hybrid mode');
    });

    it('allows hybrid mode on line with existing CriticMarkup', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nSome {++inserted++}[^ct-1] text\nLine three\n\n[^ct-1]: @test | 2026-02-12 | ins | proposed';
      await fs.writeFile(filePath, content);
      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: 'text',
          new_text: 'content',
          start_line: 2,
          start_hash: hash,
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
    });
  });

  // ─── Line out of range ────────────────────────────────────────────

  describe('line out of range', () => {
    it('returns error when start_line exceeds file length', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two';
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'replaced',
          start_line: 99,
          start_hash: 'ab',
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/out of range|line 99/i);
    });
  });

  // ─── Auto-header + hashline coordinate consistency ─────────────────
  // Regression test for: read_tracked_file returns coordinates for the file
  // WITHOUT a tracking header, but propose_change auto-inserts the header
  // before validation, shifting all line numbers by 1. The fix applies a
  // delta adjustment so agent coordinates from the unshifted read still work.

  describe('auto_header + hashline coordinate shift', () => {
    let autoHeaderResolver: ConfigResolver;
    let autoHeaderConfig: ChangeTracksConfig;

    beforeEach(async () => {
      autoHeaderConfig = {
        ...config,
        tracking: { ...config.tracking, auto_header: true },
      };
      autoHeaderResolver = await createTestResolver(tmpDir, autoHeaderConfig);
    });

    it('insertion via after_line succeeds when auto_header shifts lines', async () => {
      const filePath = path.join(tmpDir, 'no-header.md');
      // File without tracking header — auto_header will prepend one
      const body = '# Title\n\nSome content\n';
      await fs.writeFile(filePath, body);

      // Compute hash for line 2 as the agent would see it (no header)
      const h2 = hashForLine(body, 2);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'Inserted text',
          after_line: 2,
          after_hash: h2,
          author: 'ai:test',
        },
        autoHeaderResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.change_id).toBe('ct-1');
      expect(data.type).toBe('ins');

      const written = await fs.readFile(filePath, 'utf-8');
      // File should have tracking header AND the insertion
      expect(written).toContain('<!-- ctrcks.com/v1: tracked -->');
      expect(written).toContain('{++Inserted text++}');
    });

    it('substitution via start_line succeeds when auto_header shifts lines', async () => {
      const filePath = path.join(tmpDir, 'no-header-sub.md');
      const body = '# Title\n\nReplace this word\n';
      await fs.writeFile(filePath, body);

      const h3 = hashForLine(body, 3);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: 'this',
          new_text: 'that',
          start_line: 3,
          start_hash: h3,
          author: 'ai:test',
        },
        autoHeaderResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toContain('<!-- ctrcks.com/v1: tracked -->');
      expect(written).toContain('{~~this~>that~~}');
    });

    it('already-headered file is not shifted (no false adjustment)', async () => {
      const filePath = path.join(tmpDir, 'has-header.md');
      const body = '<!-- ctrcks.com/v1: tracked -->\n# Title\n\nContent\n';
      await fs.writeFile(filePath, body);

      const h3 = hashForLine(body, 3);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'New line',
          after_line: 3,
          after_hash: h3,
          author: 'ai:test',
        },
        autoHeaderResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toContain('{++New line++}');
    });
  });

  // ─── Auto-remap on hash mismatch ──────────────────────────────────

  describe('auto-remap on hash mismatch', () => {
    let remapResolver: Awaited<ReturnType<typeof createTestResolver>>;

    beforeEach(async () => {
      const remapConfig = {
        ...config,
        hashline: { ...config.hashline, auto_remap: true },
      };
      remapResolver = await createTestResolver(tmpDir, remapConfig);
    });

    it('auto-remaps when exactly one candidate matches and config allows', async () => {
      // Create a file, compute hashes, then modify it so hashes go stale
      const original = 'L1_alpha\nL2_beta\nL3_gamma\nL4_delta';
      const filePath = path.join(tmpDir, 'auto-remap.md');
      await fs.writeFile(filePath, original);
      const hashLine3 = hashForLine(original, 3);

      // Insert a line so L3_gamma moves from line 3 to line 4
      const shifted = 'L1_alpha\nL2_beta\nINSERTED\nL3_gamma\nL4_delta';
      await fs.writeFile(filePath, shifted);

      // Agent sends stale hash for line 3 → server should auto-remap to line 4
      // When no end_line is specified, effectiveEndLine defaults to startLine (3)
      // which also needs remapping, so we expect 2 remaps (start + implicit end).
      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'L3_GAMMA',
          start_line: 3,
          start_hash: hashLine3,
          author: 'ai:test',
        },
        remapResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('sub');

      // Should have remaps array in response (both start and implicit end were remapped)
      expect(data.remaps).toBeDefined();
      expect(Array.isArray(data.remaps)).toBe(true);
      expect(data.remaps.length).toBeGreaterThanOrEqual(1);
      const startRemap = data.remaps.find((r: any) => r.originalRef === `3:${hashLine3}`);
      expect(startRemap).toBeDefined();
      expect(startRemap.reason).toBe('auto_corrected');

      // The file should have the change applied at the correct location
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toContain('{~~L3_gamma~>L3_GAMMA~~}');
    });

    it('returns educational error when remap is ambiguous (hash not found anywhere)', async () => {
      const content = 'L1_alpha\nL2_beta\nL3_gamma';
      const filePath = path.join(tmpDir, 'no-remap.md');
      await fs.writeFile(filePath, content);

      // Send a completely wrong hash that doesn't match any line
      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'replaced',
          start_line: 2,
          start_hash: 'zz', // Wrong hash — no candidate
          author: 'ai:test',
        },
        resolver,
        state,
      );

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      // Error message should be educational
      expect(text).toContain('Hash mismatch on line 2');
      expect(text).toContain('file content has changed since your last read');
      expect(text).toContain('read_tracked_file');
      expect(text).toContain('Quick-fix');
    });

    it('succeeds via silent relocation without remaps when auto_remap is false', async () => {
      // Same scenario as the first test (unambiguous relocation exists)
      // but with auto_remap disabled — should still relocate (existing behavior)
      // but NOT include remaps in the response
      const original = 'L1_alpha\nL2_beta\nL3_gamma\nL4_delta';
      const filePath = path.join(tmpDir, 'no-auto-remap.md');
      await fs.writeFile(filePath, original);
      const hashLine3 = hashForLine(original, 3);

      const shifted = 'L1_alpha\nL2_beta\nINSERTED\nL3_gamma\nL4_delta';
      await fs.writeFile(filePath, shifted);

      // Create a config with auto_remap disabled
      const noRemapConfig = {
        ...config,
        hashline: { ...config.hashline, auto_remap: false },
      };
      const noRemapResolver = await createTestResolver(tmpDir, noRemapConfig);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'L3_GAMMA',
          start_line: 3,
          start_hash: hashLine3,
          author: 'ai:test',
        },
        noRemapResolver,
        state,
      );

      // Should still succeed (relocation works regardless of auto_remap)
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);

      // But should NOT have remaps in response (auto_remap is false)
      expect(data.remaps).toBeUndefined();

      // Should still have relocated array (existing behavior)
      expect(data.relocated).toBeDefined();
    });

    it('auto-remap works for after_line insertion', async () => {
      const original = 'L1_alpha\nL2_beta\nL3_gamma';
      const filePath = path.join(tmpDir, 'auto-remap-after.md');
      await fs.writeFile(filePath, original);
      const hashLine2 = hashForLine(original, 2);

      // Insert line so L2_beta moves from line 2 to line 3
      const shifted = 'L1_alpha\nINSERTED\nL2_beta\nL3_gamma';
      await fs.writeFile(filePath, shifted);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'NEW CONTENT',
          after_line: 2,
          after_hash: hashLine2,
          author: 'ai:test',
        },
        remapResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.remaps).toBeDefined();
      expect(data.remaps.length).toBe(1);
      expect(data.remaps[0].reason).toBe('auto_corrected');

      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toContain('{++NEW CONTENT++}');
    });

    it('auto-remap works for end_line in multi-line range', async () => {
      const original = 'L1\nL2\nL3\nL4\nL5';
      const filePath = path.join(tmpDir, 'auto-remap-end.md');
      await fs.writeFile(filePath, original);
      const hashLine2 = hashForLine(original, 2);
      const hashLine4 = hashForLine(original, 4);

      // Insert a line so L4 moves from line 4 to line 5
      const shifted = 'L1\nL2\nINSERTED\nL3\nL4\nL5';
      await fs.writeFile(filePath, shifted);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'REPLACED BLOCK',
          start_line: 2,
          start_hash: hashLine2,
          end_line: 4,
          end_hash: hashLine4,
          author: 'ai:test',
        },
        remapResolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.remaps).toBeDefined();
      // end_line was remapped
      const endRemap = data.remaps.find((r: any) => r.originalRef.startsWith('4:'));
      expect(endRemap).toBeDefined();
      expect(endRemap.reason).toBe('auto_corrected');
    });
  });
});
