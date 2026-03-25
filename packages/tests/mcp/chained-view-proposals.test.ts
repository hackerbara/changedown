import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
import { handleProposeBatch } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('review view cross-batch coordinate stability', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  const compactConfig: ChangeTracksConfig = {
    tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
    author: { default: 'ai:test', enforcement: 'optional' },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: true, auto_remap: false },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  };

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-chained-view-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('second batch resolves stale review-view coordinates via committed hash', async () => {
    // 1. Create a file with simple content
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Heading',
      '',
      'Paragraph one.',
      '',
      'Paragraph two.',
    ].join('\n');
    const filePath = path.join(tmpDir, 'cross-batch-review.md');
    await fs.writeFile(filePath, content);

    // 2. Read in review view — records hashes in session state
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' },
      resolver, state,
    );
    expect(readResult.isError).toBeFalsy();

    // 3. Extract coordinates for paragraphs 1 and 2 from the read output
    const readText = readResult.content[0].text;
    // Parse LINE:HASH and content from each output line.
    // Format per line: "  4:10  | Paragraph one."
    // Split by newline, then match each line individually to avoid \s* crossing newlines.
    let para1At: string | undefined;
    let para2At: string | undefined;
    for (const outputLine of readText.split('\n')) {
      const m = outputLine.match(/^\s*(\d+):([0-9a-f]{2})\s+.?\|\s?(.*)$/);
      if (!m) continue;
      const lineNum = m[1];
      const hash = m[2];
      const lineContent = m[3];
      if (lineContent.includes('Paragraph one') && !para1At) {
        para1At = `${lineNum}:${hash}`;
      }
      if (lineContent.includes('Paragraph two') && !para2At) {
        para2At = `${lineNum}:${hash}`;
      }
    }
    expect(para1At).toBeDefined();
    expect(para2At).toBeDefined();

    // 4. Batch 1: edit paragraph one (inserts CriticMarkup, changes raw hashes)
    const batch1 = await handleProposeBatch({
      file: filePath,
      author: 'ai:test',
      changes: [
        { at: para1At, op: '{~~Paragraph one.~>Paragraph ONE.~~}{>>capitalize' },
      ],
    }, resolver, state);
    if (batch1.isError) {
      throw new Error(`batch1 failed: ${batch1.content.map(c => c.text).join('\n')}`);
    }

    // 5. Batch 2: edit paragraph two using ORIGINAL coordinates (from step 3)
    const batch2 = await handleProposeBatch({
      file: filePath,
      author: 'ai:test',
      changes: [
        { at: para2At, op: '{~~Paragraph two.~>Paragraph TWO.~~}{>>capitalize' },
      ],
    }, resolver, state);
    expect(batch2.isError).toBeFalsy();

    // 6. Verify both proposals are in the file
    const finalContent = await fs.readFile(filePath, 'utf-8');
    expect(finalContent).toContain('Paragraph one.~>Paragraph ONE.');
    expect(finalContent).toContain('Paragraph two.~>Paragraph TWO.');
  });
});
