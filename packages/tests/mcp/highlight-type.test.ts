import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { initHashline } from '@changetracks/core';
import { computeLineHash } from '@changetracks/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';

/**
 * Helper: compute hash for a 1-indexed line in a file content string.
 */
function hashForLine(content: string, lineNum: number): string {
  const lines = content.split('\n');
  return computeLineHash(lineNum - 1, lines[lineNum - 1], lines);
}

describe('ISSUE-5: Highlight type in propose_change response', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  const compactConfig: ChangeTracksConfig = {
    tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
    author: { default: 'ai:test', enforcement: 'optional' },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: true, auto_remap: false },
    settlement: { auto_on_approve: false, auto_on_reject: false },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  };

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-highlight-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns type "highlight" for =text op, not "sub"', async () => {
    const content = 'The key insight is here.';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      {
        file: filePath,
        at: `1:${hash}`,
        op: '{==The key insight is here.==}',
        author: 'ai:test',
        reason: 'Highlighting key claim',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.type).toBe('highlight');
  });

  it('generates footnote with type "highlight" not "sub"', async () => {
    const content = 'Important sentence here.';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    await handleProposeChange(
      {
        file: filePath,
        at: `1:${hash}`,
        op: '{==Important sentence here.==}',
        author: 'ai:test',
        reason: 'test',
      },
      resolver,
      state,
    );

    const modified = await fs.readFile(filePath, 'utf-8');
    // Footnote should say "highlight", not "sub"
    expect(modified).toContain('| highlight |');
    expect(modified).not.toContain('| sub |');
  });

  it('produces correct highlight inline markup', async () => {
    const content = 'Check this claim carefully.';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      {
        file: filePath,
        at: `1:${hash}`,
        op: '{==this claim==}',
        author: 'ai:test',
        reason: 'test',
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{==this claim==}');
    expect(modified).toContain('[^ct-1]');
  });
});
