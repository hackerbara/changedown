import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { computeLineHash } from '@changetracks/mcp/internals';
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

describe('quick_fix field in hashline errors', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  // Classic mode config with hashline enabled
  const classicConfig: ChangeTracksConfig = {
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

  // Compact mode config with hashline enabled
  const compactConfig: ChangeTracksConfig = {
    ...classicConfig,
    protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  };

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-quickfix-'));
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('compact mode (at/op params)', () => {
    beforeEach(async () => {
      resolver = await createTestResolver(tmpDir, compactConfig);
    });

    it('hashline error includes machine-parseable quick_fix field', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\n# Title\n\nSome content here.\n');

      const result = await handleProposeChange(
        { file: filePath, at: '4:de', op: '{~~Some~>Other~~}', author: 'ai:test' },
        resolver, state,
      );
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.quick_fix).toBeDefined();
      expect(data.quick_fix.action).toBe('re_read');
      expect(data.quick_fix.file).toBeDefined();
    });

    it('quick_fix includes stale_line and current_hash when available', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = '<!-- ctrcks.com/v1: tracked -->\n# Title\n\nSome content here.\n';
      await fs.writeFile(filePath, content);

      const result = await handleProposeChange(
        { file: filePath, at: '4:de', op: '{~~Some~>Other~~}', author: 'ai:test' },
        resolver, state,
      );
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.quick_fix.stale_line).toBe(4);
      expect(data.quick_fix.current_hash).toBeDefined();
      expect(typeof data.quick_fix.current_hash).toBe('string');
    });
  });

  describe('classic mode (start_line/start_hash params)', () => {
    beforeEach(async () => {
      resolver = await createTestResolver(tmpDir, classicConfig);
    });

    it('start_hash mismatch includes quick_fix', async () => {
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
          author: 'ai:test',
        },
        resolver, state,
      );

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.quick_fix).toBeDefined();
      expect(data.quick_fix.action).toBe('re_read');
      expect(data.quick_fix.file).toBeDefined();
      expect(data.quick_fix.stale_line).toBe(2);
    });

    it('end_hash mismatch includes quick_fix', async () => {
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
          author: 'ai:test',
        },
        resolver, state,
      );

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.quick_fix).toBeDefined();
      expect(data.quick_fix.action).toBe('re_read');
      expect(data.quick_fix.stale_line).toBe(3);
    });

    it('after_hash mismatch includes quick_fix', async () => {
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
          author: 'ai:test',
        },
        resolver, state,
      );

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.quick_fix).toBeDefined();
      expect(data.quick_fix.action).toBe('re_read');
      expect(data.quick_fix.stale_line).toBe(2);
    });

    it('line out of range includes quick_fix', async () => {
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
          author: 'ai:test',
        },
        resolver, state,
      );

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.quick_fix).toBeDefined();
      expect(data.quick_fix.action).toBe('re_read');
      expect(data.quick_fix.file).toBeDefined();
    });

    it('committed hash mismatch includes quick_fix', async () => {
      const filePath = path.join(tmpDir, 'doc.md');
      const content = 'Line one\nLine two\nLine three';
      await fs.writeFile(filePath, content);

      // Simulate recorded hashes with committed field
      state.recordFileHashes(filePath, [
        { line: 1, raw: hashForLine(content, 1), settled: hashForLine(content, 1), committed: 'aa', rawLineNum: 1 },
        { line: 2, raw: hashForLine(content, 2), settled: hashForLine(content, 2), committed: 'bb', rawLineNum: 2 },
        { line: 3, raw: hashForLine(content, 3), settled: hashForLine(content, 3), committed: 'cc', rawLineNum: 3 },
      ]);

      const result = await handleProposeChange(
        {
          file: filePath,
          old_text: '',
          new_text: 'replaced',
          start_line: 2,
          start_hash: 'zz', // Wrong committed hash
          author: 'ai:test',
        },
        resolver, state,
      );

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.quick_fix).toBeDefined();
      expect(data.quick_fix.action).toBe('re_read');
      expect(data.quick_fix.file).toBeDefined();
    });
  });
});
