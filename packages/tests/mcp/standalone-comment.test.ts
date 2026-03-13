/**
 * Standalone comment support via propose_change.
 *
 * Previously, comment-only ops ({>>text) were rejected by a gate in
 * handleCompactProposeChange that said "use respond_to_thread instead".
 * But respond_to_thread requires a pre-existing change_id, so there was
 * no way to add a comment on unchanged text.
 *
 * The fix: standalone comments with `at:` coordinates should be allowed.
 * They insert `{>>comment text<<}[^ct-N]` at the end of the target line
 * and create a footnote definition with `type: comment | status: proposed`.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Extract LINE:HASH from a formatted output line.
 */
function extractCoordinate(outputLine: string): { lineNum: number; hash: string } {
  const m = outputLine.match(/^\s*(\d+):([0-9a-f]{2})/);
  if (!m) throw new Error(`Cannot extract coordinate from line: "${outputLine}"`);
  return { lineNum: parseInt(m[1], 10), hash: m[2] };
}

const compactConfig: ChangeTracksConfig = {
  tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
  author: { default: 'ai:test-agent', enforcement: 'optional' },
  hooks: { enforcement: 'warn', exclude: [] },
  matching: { mode: 'normalized' },
  hashline: { enabled: true, auto_remap: false },
  settlement: { auto_on_approve: false, auto_on_reject: false },
  policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'suggest' },
  protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
};

describe('standalone comment via propose_change (compact mode)', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-standalone-comment-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('standalone comment inserts comment markup at end of target line', async () => {
    const fileContent = [
      '# Title',
      '',
      'This is a paragraph that needs a comment.',
      '',
      'Another paragraph here.',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, fileContent);

    // Read the file to get coordinates
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, resolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    // Find the target line
    const targetLine = readResult.content[0].text.split('\n')
      .find(l => l.includes('This is a paragraph that needs a comment.'));
    expect(targetLine).toBeDefined();
    const { lineNum, hash } = extractCoordinate(targetLine!);

    // Propose a standalone comment
    const result = await handleProposeChange(
      { file: filePath, at: `${lineNum}:${hash}`, op: '{>>this is my comment', author: 'ai:test-agent' },
      resolver, state,
    );

    // Should NOT be an error
    expect(result.isError).toBeUndefined();

    // Parse the response
    const data = JSON.parse(result.content[0].text);
    expect(data.type).toBe('comment');
    expect(data.change_id).toMatch(/^ct-\d+$/);

    // Verify the file was modified correctly
    const modified = await fs.readFile(filePath, 'utf-8');

    // Should have comment markup at the end of the target line
    expect(modified).toContain('{>>this is my comment<<}');
    expect(modified).toContain(`[^${data.change_id}]`);

    // Should have a footnote definition with type: comment
    expect(modified).toMatch(new RegExp(`\\[\\^${data.change_id}\\]:.*comment.*proposed`));
  });

  it('standalone comment with closed delimiters works (forgives <<})', async () => {
    const fileContent = [
      '# Title',
      'Target line here.',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc2.md');
    await fs.writeFile(filePath, fileContent);

    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, resolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    const targetLine = readResult.content[0].text.split('\n')
      .find(l => l.includes('Target line here.'));
    expect(targetLine).toBeDefined();
    const { lineNum, hash } = extractCoordinate(targetLine!);

    // Use closed form: {>>comment<<}
    const result = await handleProposeChange(
      { file: filePath, at: `${lineNum}:${hash}`, op: '{>>closed comment<<}', author: 'ai:test-agent' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{>>closed comment<<}');
  });

  it('standalone comment does not modify existing text on the line', async () => {
    const fileContent = [
      '# Title',
      'Important text here.',
      'Other text.',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc3.md');
    await fs.writeFile(filePath, fileContent);

    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, resolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    const targetLine = readResult.content[0].text.split('\n')
      .find(l => l.includes('Important text here.'));
    expect(targetLine).toBeDefined();
    const { lineNum, hash } = extractCoordinate(targetLine!);

    const result = await handleProposeChange(
      { file: filePath, at: `${lineNum}:${hash}`, op: '{>>my note', author: 'ai:test-agent' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Original text is preserved
    expect(modified).toContain('Important text here.');
    // Comment is appended at end of the line (same line, not a new line)
    const lines = modified.split('\n');
    const commentLine = lines.find(l => l.includes('Important text here.') && l.includes('{>>my note<<}'));
    expect(commentLine).toBeDefined();
  });

  it('standalone comment works alongside existing tracked changes', async () => {
    const fileContent = [
      '# Title',
      '{++New paragraph added++}[^ct-1]',
      'Existing paragraph.',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc4.md');
    await fs.writeFile(filePath, fileContent);

    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, resolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    const targetLine = readResult.content[0].text.split('\n')
      .find(l => l.includes('Existing paragraph.'));
    expect(targetLine).toBeDefined();
    const { lineNum, hash } = extractCoordinate(targetLine!);

    const result = await handleProposeChange(
      { file: filePath, at: `${lineNum}:${hash}`, op: '{>>needs review', author: 'ai:test-agent' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0].text);
    // ID should be ct-2 since ct-1 already exists
    expect(data.change_id).toBe('ct-2');
    expect(data.type).toBe('comment');

    const modified = await fs.readFile(filePath, 'utf-8');
    // Both changes exist
    expect(modified).toContain('{++New paragraph added++}[^ct-1]');
    expect(modified).toContain('{>>needs review<<}[^ct-2]');
    // Both footnotes exist
    expect(modified).toMatch(/\[\^ct-1\]:.*ins.*proposed/);
    expect(modified).toMatch(/\[\^ct-2\]:.*comment.*proposed/);
  });

  it('footnote does not duplicate inline comment text', async () => {
    const fileContent = [
      '# Title',
      'Line that gets a comment.',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc-no-dup.md');
    await fs.writeFile(filePath, fileContent);

    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, resolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    const targetLine = readResult.content[0].text.split('\n')
      .find(l => l.includes('Line that gets a comment.'));
    expect(targetLine).toBeDefined();
    const { lineNum, hash } = extractCoordinate(targetLine!);

    const result = await handleProposeChange(
      { file: filePath, at: `${lineNum}:${hash}`, op: '{>>important observation here', author: 'ai:test-agent' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.type).toBe('comment');

    const modified = await fs.readFile(filePath, 'utf-8');

    // Comment text appears inline
    expect(modified).toContain('{>>important observation here<<}');

    // Extract the footnote block for the change_id
    const footnoteRegex = new RegExp(
      `\\[\\^${data.change_id}\\]:[^\\n]*(?:\\n    [^\\n]*)*`,
    );
    const footnoteMatch = modified.match(footnoteRegex);
    expect(footnoteMatch).toBeDefined();
    const footnoteBlock = footnoteMatch![0];

    // Footnote should contain metadata (author, date, comment, proposed)
    expect(footnoteBlock).toMatch(/comment/);
    expect(footnoteBlock).toMatch(/proposed/);
    expect(footnoteBlock).toMatch(/@ai:test-agent/);

    // Footnote must NOT contain the comment text as a reasoning line
    // (the comment text only lives inline in {>>...<<}, not duplicated in footnote)
    expect(footnoteBlock).not.toContain('important observation here');
  });

  describe('level 1 (inline metadata, no footnote)', () => {
    const level1Config: ChangeTracksConfig = {
      ...compactConfig,
      protocol: { ...compactConfig.protocol, level: 1 },
    };
    let level1Resolver: ConfigResolver;

    beforeEach(async () => {
      level1Resolver = await createTestResolver(tmpDir, level1Config);
    });

    it('standalone comment at level 1 uses inline metadata instead of footnote', async () => {
      const fileContent = [
        '# Title',
        'Target line for L1 comment.',
      ].join('\n');

      const filePath = path.join(tmpDir, 'doc-l1.md');
      await fs.writeFile(filePath, fileContent);

      const readResult = await handleReadTrackedFile(
        { file: filePath, view: 'review' }, level1Resolver, state,
      );
      expect(readResult.isError).toBeUndefined();

      const targetLine = readResult.content[0].text.split('\n')
        .find(l => l.includes('Target line for L1 comment.'));
      expect(targetLine).toBeDefined();
      const { lineNum, hash } = extractCoordinate(targetLine!);

      const result = await handleProposeChange(
        { file: filePath, at: `${lineNum}:${hash}`, op: '{>>level one note', author: 'ai:test-agent' },
        level1Resolver, state,
      );

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe('comment');

      const modified = await fs.readFile(filePath, 'utf-8');

      // Comment text appears inline
      expect(modified).toContain('{>>level one note<<}');

      // Level 1: inline metadata comment with author|date|type|status
      expect(modified).toMatch(/\{>>@ai:test-agent\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\|comment\|proposed<<\}/);

      // No footnote definition line (level 2 would produce [^ct-N]:)
      expect(modified).not.toMatch(/^\[\^ct-\d+\]:/m);
    });
  });
});
