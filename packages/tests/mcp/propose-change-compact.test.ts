import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
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

describe('propose_change compact mode', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  const compactConfig: ChangeTracksConfig = {
    tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
    author: { default: 'ai:test-agent', enforcement: 'optional' },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: true, auto_remap: false },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
  };

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-compact-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('substitution via at+op', async () => {
    const content = 'The quick brown fox';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~quick brown~>slow red~~}' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~quick brown~>slow red~~}');
    expect(modified).toContain('[^ct-1]');
  });

  it('insertion via at+op', async () => {
    const content = 'first line\nsecond line';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{++\nnew line after first++}' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{++');
    expect(modified).toContain('new line after first');
  });

  it('deletion via at+op', async () => {
    const content = 'keep this\ndelete this line\nkeep this too';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 2);
    const result = await handleProposeChange(
      { file: filePath, at: `2:${hash}`, op: '{--delete this line--}' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{--delete this line--}');
    expect(modified).toContain('[^ct-1]');
  });

  it('op with {>>reasoning generates footnote with reasoning', async () => {
    const content = 'timeout=30';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~timeout=30~>timeout=60~~}{>>slow networks' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~timeout=30~>timeout=60~~}');
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
  });

  it('rejects compact params in classic mode', async () => {
    const classicConfig: ChangeTracksConfig = {
      ...compactConfig,
      protocol: { ...compactConfig.protocol, mode: 'classic' as const },
    };
    const classicResolver = await createTestResolver(tmpDir, classicConfig);
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const result = await handleProposeChange(
      { file: filePath, at: '1:ab', op: '{++text++}' },
      classicResolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('classic');
  });

  it('rejects old_text/new_text params in compact mode', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const result = await handleProposeChange(
      { file: filePath, old_text: 'content', new_text: 'changed' },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('compact');
  });

  it('compact substitution generates response with document_state', async () => {
    const content = 'line one\nline two';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~one~>1~~}' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.type).toBe('sub');
    expect(data.document_state).toBeDefined();
    expect(data.document_state.total_changes).toBe(1);
    expect(data.document_state.proposed).toBe(1);
  });

  it('compact mode passes reasoning from op {>> to footnote', async () => {
    const content = 'debug=true';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~debug=true~>debug=false~~}{>>security hardening' },
      resolver,
      state,
    );

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('security hardening');
  });

  describe('whole-range replace', () => {
    it('empty left side of ~> with range replaces entire range content', async () => {
      const content = [
        'Line one.',
        'Line two.',
        'Line three.',
        'Line four.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, content);

      const line2Hash = hashForLine(content, 2);
      const line4Hash = hashForLine(content, 4);

      const result = await handleProposeChange(
        { file: filePath, at: `2:${line2Hash}-4:${line4Hash}`, op: '{~~~>Replacement paragraph.~~}{>>rewrite' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~');
      expect(modified).toContain('Line two.\nLine three.\nLine four.');
      expect(modified).toContain('~>Replacement paragraph.');
      expect(modified).toContain('~~}');
      // Should have footnote with reasoning
      expect(modified).toContain('rewrite');
    });

    it('empty left side of ~> with single line replaces whole line', async () => {
      const content = 'Replace this entire line.';
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, content);

      const hash = hashForLine(content, 1);

      const result = await handleProposeChange(
        { file: filePath, at: `1:${hash}`, op: '{~~~>Brand new line.~~}{>>rewrite' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~Replace this entire line.~>Brand new line.~~}');
    });

    it('whole-range deletion with empty op text', async () => {
      const content = [
        'Keep this.',
        'Delete this line.',
        'Keep this too.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, content);

      const hash = hashForLine(content, 2);

      const result = await handleProposeChange(
        { file: filePath, at: `2:${hash}`, op: '{----}{>>removing unused line' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{--Delete this line.--}');
      expect(modified).toContain('[^ct-1]');
      // Should have footnote with reasoning
      expect(modified).toContain('removing unused line');
    });

    it('whole-range deletion across multiple lines', async () => {
      const content = [
        'Intro.',
        'Remove this.',
        'And this.',
        'Outro.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'doc.md');
      await fs.writeFile(filePath, content);

      const line2Hash = hashForLine(content, 2);
      const line3Hash = hashForLine(content, 3);

      const result = await handleProposeChange(
        { file: filePath, at: `2:${line2Hash}-3:${line3Hash}`, op: '{----}{>>cleanup' },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{--Remove this.\nAnd this.--}');
      expect(modified).toContain('[^ct-1]');
    });
  });

  describe('whole-range replace at level 1 (inline comment, no footnote)', () => {
    const level1Config: ChangeTracksConfig = {
      ...compactConfig,
      protocol: { ...compactConfig.protocol, level: 1 },
    };
    let level1Resolver: ConfigResolver;

    beforeEach(async () => {
      level1Resolver = await createTestResolver(tmpDir, level1Config);
    });

    it('empty left side of ~> with range produces inline comment at level 1', async () => {
      const content = [
        'Line one.',
        'Line two.',
        'Line three.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'level1-doc.md');
      await fs.writeFile(filePath, content);

      const line2Hash = hashForLine(content, 2);
      const line3Hash = hashForLine(content, 3);

      const result = await handleProposeChange(
        { file: filePath, at: `2:${line2Hash}-3:${line3Hash}`, op: '{~~~>Replacement.~~}{>>rewrite' },
        level1Resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      // Should have substitution markup
      expect(modified).toContain('{~~');
      expect(modified).toContain('~>Replacement.');
      expect(modified).toContain('~~}');
      // Level 1: inline metadata comment with author|date|type|status
      expect(modified).toMatch(/\{>>@ai:test-agent\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\|sub\|proposed<<\}/);
      // No footnote definition line (level 2 would produce [^ct-N]:)
      expect(modified).not.toMatch(/^\[\^ct-\d+\]:/m);
    });
  });

  describe('view-aware coordinate translation (settled view)', () => {
    it('accepts settled-view coordinates in compact mode after reading settled view', async () => {
      // File has an accepted substitution: in settled view, deleted text is gone,
      // inserted text appears as a real line, shifting line numbers.
      // The accepted sub means "old" text is gone, "new" text is present.
      const rawContent = [
        'Line one',
        '{~~old text~>new text~~}[^ct-1]',
        'Line three',
        '',
        '[^ct-1]: @ai:test | 2026-03-04 | sub | accepted',
      ].join('\n');

      const filePath = path.join(tmpDir, 'settled-test.md');
      await fs.writeFile(filePath, rawContent);

      // 1. Read in settled view — records settled-view hashes in session state
      const readResult = await handleReadTrackedFile(
        { file: filePath, view: 'settled' },
        resolver,
        state,
      );
      expect(readResult.isError).toBeUndefined();

      // 2. Extract settled hash for "Line three" from the read output
      //    In settled view: line 1="Line one", line 2="new text", line 3="Line three"
      const readText = readResult.content[readResult.content.length - 1].text;
      const lines = readText.split('\n');
      const targetEntry = lines.find(l => l.includes('Line three'));
      expect(targetEntry).toBeDefined();

      // Parse the settled line format: "N:HH|FLAG content" or similar
      const lineMatch = targetEntry!.match(/(\d+):([0-9a-f]{2})/);
      expect(lineMatch).toBeDefined();
      const settledLineNum = parseInt(lineMatch![1], 10);
      const settledHash = lineMatch![2];

      // 3. Propose a change using settled-view coordinates in compact mode
      const result = await handleProposeChange(
        {
          file: filePath,
          at: `${settledLineNum}:${settledHash}`,
          op: '{~~Line three~>Line three (updated)~~}',
        },
        resolver,
        state,
      );

      // Should succeed — not an error
      expect(result.isError).toBeUndefined();

      // Verify the file was modified correctly
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~Line three~>Line three (updated)~~}');
      expect(modified).toContain('[^ct-2]');
    });

    it('returns hash mismatch error when settled-view hash does not match recorded hash', async () => {
      // File with a settled change
      const rawContent = [
        'Line one',
        '{~~old~>new~~}[^ct-1]',
        'Line three',
        '',
        '[^ct-1]: @ai:test | 2026-03-04 | sub | accepted',
      ].join('\n');

      const filePath = path.join(tmpDir, 'mismatch-test.md');
      await fs.writeFile(filePath, rawContent);

      // Read in settled view first
      await handleReadTrackedFile(
        { file: filePath, view: 'settled' },
        resolver,
        state,
      );

      // Use a wrong hash (all zeros)
      const result = await handleProposeChange(
        {
          file: filePath,
          at: '3:00',  // wrong hash
          op: '{~~Line three~>updated~~}',
        },
        resolver,
        state,
      );

      // Should fail with hash mismatch
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error.code).toBe('HASHLINE_REFERENCE_UNRESOLVED');
      expect(data.error.message).toContain('Hash mismatch');
      expect(data.error.message).toContain('settled');
    });

    it('falls through to raw resolution when no session state exists', async () => {
      // No prior read_tracked_file call — state has no recorded hashes
      const content = 'Just one line of text';
      const filePath = path.join(tmpDir, 'no-session.md');
      await fs.writeFile(filePath, content);

      // Compute the raw hash directly
      const lines = content.split('\n');
      const rawHash = computeLineHash(0, lines[0], lines);

      // Propose using raw hash (no session state = fall through to raw)
      const result = await handleProposeChange(
        {
          file: filePath,
          at: `1:${rawHash}`,
          op: '{~~Just~>Only~~}',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~Just~>Only~~}');
    });

    it('returns affected_lines in settled-space after compact-mode edit and re-records for chained edits', async () => {
      // File has a proposed substitution. In settled view, line 2 shows "new text"
      // (old replaced by new), line 3 shows "Line three".
      const rawContent = [
        'Line one',
        '{~~old text~>new text~~}[^ct-1]',
        'Line three',
        '',
        '[^ct-1]: @ai:test | 2026-03-04 | sub | proposed',
      ].join('\n');
      const filePath = path.join(tmpDir, 'settled-projection.md');
      await fs.writeFile(filePath, rawContent);

      // 1. Read in settled view — records settled-view hashes in session state
      const readResult = await handleReadTrackedFile(
        { file: filePath, view: 'settled' },
        resolver,
        state,
      );
      expect(readResult.isError).toBeUndefined();

      // 2. Extract the settled hash for "Line three" (settled line 3)
      //    The settled view output lines look like: "  3:HH| Line three"
      const readText = readResult.content[readResult.content.length - 1].text;
      const readLines = readText.split('\n');
      const lineThreeLine = readLines.find(l => l.includes('Line three') && !l.includes('one'));
      expect(lineThreeLine).toBeDefined();
      const lineMatch = lineThreeLine!.match(/(\d+):([0-9a-f]{2})/);
      expect(lineMatch).toBeDefined();
      const settledLineNum = parseInt(lineMatch![1], 10);
      const settledHash = lineMatch![2];

      // "Line three" should be at settled line 3
      expect(settledLineNum).toBe(3);

      // 3. Propose a compact edit using settled-view coordinates
      const result = await handleProposeChange(
        {
          file: filePath,
          at: `${settledLineNum}:${settledHash}`,
          op: '{~~Line three~>Line three (updated)~~}',
          author: 'ai:test-model',
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);

      // 4. Verify affected_lines uses settled-space line numbers (not raw line numbers)
      //    Raw line 3 is "Line three" in the original. After edit, settled line 3 is still line 3.
      //    The affected_lines should reference settled-view lines (small numbers), not raw lines.
      expect(parsed.affected_lines).toBeDefined();
      const affectedLineNums = (parsed.affected_lines as Array<{ line: number }>).map(e => e.line);
      // Settled view line numbers should be small (1-3 range for a 3-line settled file)
      // Raw line numbers for the footnote section would be 4-5+
      expect(affectedLineNums.every((n: number) => n <= 5)).toBe(true);
      // The edit target (settled line 3) should appear in affected_lines
      expect(affectedLineNums).toContain(settledLineNum);

      // 5. Verify hashes in affected_lines are settled-view hashes (not raw hashes)
      //    Settled hashes should match the new settled view of the modified file
      if (parsed.affected_lines[0]?.hash) {
        // All hashes should be 2-char hex (settled-view hash format)
        for (const entry of parsed.affected_lines as Array<{ hash?: string }>) {
          if (entry.hash) {
            expect(entry.hash).toMatch(/^[0-9a-f]{2}$/);
          }
        }
      }

      // 6. Verify the file was modified correctly
      const modified = await fs.readFile(filePath, 'utf-8');
      expect(modified).toContain('{~~Line three~>Line three (updated)~~}');
      expect(modified).toContain('[^ct-2]');

      // 7. Verify chained edit works: use affected_lines hashes for a follow-up edit
      //    After the first edit, the session state should have settled-view hashes re-recorded.
      //    A second edit using the new settled-view coordinates should succeed.
      //    We use "Line one" (no P flag) as the chained edit target to avoid the
      //    guardOverlap restriction that prevents editing inside a proposed change.
      const chainedAffected = parsed.affected_lines as Array<{ line: number; hash?: string; content: string; flag?: string }>;
      // Find a line without a proposed-change flag (no 'P' flag) to avoid nesting
      const unchainedLine = chainedAffected.find(e => !e.flag && e.hash && e.content.includes('Line one'));

      if (unchainedLine?.hash) {
        const chainedResult = await handleProposeChange(
          {
            file: filePath,
            at: `${unchainedLine.line}:${unchainedLine.hash}`,
            op: '{~~one~>ONE~~}',
            author: 'ai:test-model',
          },
          resolver,
          state,
        );
        // Should succeed without a "stale hashline" error
        expect(chainedResult.isError).toBeUndefined();
        const chainedModified = await fs.readFile(filePath, 'utf-8');
        // The chained edit creates a CriticMarkup proposal (not direct substitution)
        expect(chainedModified).toContain('{~~one~>ONE~~}');
      } else {
        // If no unchainedLine found, fail the test with a clear message
        throw new Error(`Could not find "Line one" in affected_lines: ${JSON.stringify(chainedAffected)}`);
      }
    });
  });
});
