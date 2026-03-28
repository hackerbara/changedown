import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeBatch } from '@changedown/mcp/internals';
import { computeLineHash } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import { ConfigResolver } from '@changedown/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changedown/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/** Helper: compute hash for a 1-indexed line in a file content string. */
function hashForLine(content: string, lineNum: number): string {
  const lines = content.split('\n');
  return computeLineHash(lineNum - 1, lines[lineNum - 1], lines);
}

describe('propose_batch compact mode', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  const compactConfig: ChangeDownConfig = {
    tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
    author: { default: 'ai:test-agent', enforcement: 'optional' },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: true, auto_remap: false },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    reasoning: {
      propose: { human: false, agent: false },
      review: { human: false, agent: false },
    },
  };

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-batch-compact-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('applies batch of compact substitution ops atomically', async () => {
    const content = 'line one\nline two\nline three';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h3 = hashForLine(content, 3);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'batch test',
        changes: [
          { at: `1:${h1}`, op: '{~~one~>ONE~~}' },
          { at: `3:${h3}`, op: '{~~three~>THREE~~}' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~one~>ONE~~}');
    expect(modified).toContain('{~~three~>THREE~~}');
  });

  it('creates change group with dotted IDs', async () => {
    const content = 'alpha\nbeta';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h2 = hashForLine(content, 2);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'group test',
        changes: [
          { at: `1:${h1}`, op: '{--alpha--}' },
          { at: `2:${h2}`, op: '{++gamma++}' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.group_id).toMatch(/^cn-\d+$/);
    expect(data.applied).toHaveLength(2);
  });

  it('applies compact insertion via at+op with after_line semantics', async () => {
    const content = 'first line\nsecond line';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'insert test',
        changes: [
          { at: `1:${h1}`, op: '{++new line after first++}' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{++new line after first++}');
  });

  it('applies compact deletion via at+op', async () => {
    const content = 'keep this\ndelete this line\nkeep this too';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h2 = hashForLine(content, 2);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'delete test',
        changes: [
          { at: `2:${h2}`, op: '{--delete this line--}' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{--delete this line--}');
  });

  it('passes reasoning from op {>> suffix to footnote', async () => {
    const content = 'timeout=30';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'batch reasoning',
        changes: [
          { at: `1:${h1}`, op: '{~~timeout=30~>timeout=60~~}{>>slow networks' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~timeout=30~>timeout=60~~}');
    expect(modified).toContain('slow networks');
  });

  it('compact batch does not require top-level reasoning', async () => {
    const content = 'line one\nline two\nline three';
    const filePath = path.join(tmpDir, 'no-reasoning.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h3 = hashForLine(content, 3);

    // Call with NO reasoning param at all — only file + changes
    const result = await handleProposeBatch(
      {
        file: filePath,
        changes: [
          { at: `1:${h1}`, op: '{~~one~>ONE~~}{>>inline reason' },
          { at: `3:${h3}`, op: '{~~three~>THREE~~}' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied).toHaveLength(2);
    expect(data.group_id).toMatch(/^cn-\d+$/);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~one~>ONE~~}');
    expect(modified).toContain('{~~three~>THREE~~}');
    // Inline reasoning from op should still be recorded
    expect(modified).toContain('inline reason');
  });

  it('rejects compact ops when protocol mode is classic', async () => {
    const classicConfig: ChangeDownConfig = {
      ...compactConfig,
      protocol: { ...compactConfig.protocol, mode: 'classic' as const },
    };
    const classicResolver = await createTestResolver(tmpDir, classicConfig);
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'test',
        changes: [{ at: '1:ab', op: '{++text++}' }],
      },
      classicResolver,
      state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('classic');
  });

  it('rejects batch when compact op has at but missing op', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'test',
        changes: [{ at: '1:ab' }],
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
  });

  it('rejects batch when compact op has op but missing at', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'test',
        changes: [{ op: '{++text++}' }],
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
  });

  it('rejects batch when compact op has invalid op syntax', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const h1 = hashForLine('content', 1);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'test',
        changes: [{ at: `1:${h1}`, op: '' }],
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
  });

  it('rejects batch when compact at has invalid format', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'test',
        changes: [{ at: 'not-valid', op: '{++text++}' }],
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
  });

  it('mixes compact ops correctly in a single batch', async () => {
    const content = 'aaa\nbbb\nccc';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h2 = hashForLine(content, 2);
    const h3 = hashForLine(content, 3);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'mixed ops',
        changes: [
          { at: `1:${h1}`, op: '{~~aaa~>AAA~~}' },     // sub
          { at: `2:${h2}`, op: '{--bbb--}' },           // del
          { at: `3:${h3}`, op: '{++inserted++}' },       // ins (after line 3)
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~aaa~>AAA~~}');
    expect(modified).toContain('{--bbb--}');
    expect(modified).toContain('{++inserted++}');
  });

  it('applies two substitutions on the same line without delta drift', async () => {
    // Regression test: when the file ends with \n, bodyLineCount must give
    // consistent results before and after footnotes are appended. Without the
    // trailing-blank-line normalization, a file ending with \n gets count N+1
    // (no footnotes) vs N (with footnotes), producing delta = -1 and causing
    // the second op to target the wrong line.
    const content = 'This has a tpyo and a HTTP/2.0 reference here.\nSecond line.\n';
    const filePath = path.join(tmpDir, 'same-line.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'two fixes on same line',
        changes: [
          { at: `1:${h1}`, op: '{~~tpyo~>typo~~}{>>fix spelling' },
          { at: `1:${h1}`, op: '{~~HTTP/2.0~>HTTP/2~~}{>>fix version format' },
        ],
      },
      resolver,
      state,
    );

    // Same-line ops targeting the same at coordinate are detected as overlapping.
    // The batch handler rejects overlapping operations to prevent corruption.
    expect(result.isError).toBe(true);
    const errorText = result.content[0].text;
    expect(errorText).toContain('overlap');
  });

  // ─── Out-of-order batch operations ───────────────────────────────
  // Regression: when batch ops are not in document order (e.g. insert
  // after line 6, then substitute on line 2), the cumulativeDelta from
  // the insertion incorrectly shifts coordinates for the earlier line.

  describe('out-of-order batch operations', () => {
    it('handles insertion after line N followed by substitution before line N', async () => {
      const content = [
        'Line one.',
        'Line two.',
        'Line three.',
        'Line four.',
        'Line five.',
        'Line six.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'out-of-order.md');
      await fs.writeFile(filePath, content);

      const h1 = hashForLine(content, 1);
      const h6 = hashForLine(content, 6);

      // Batch: insert after line 6, then substitute on line 1 (BEFORE the insertion)
      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'out-of-order ops',
          changes: [
            { at: `6:${h6}`, op: '{++New inserted line.++}' },
            { at: `1:${h1}`, op: '{~~Line one.~>Updated line one.~~}' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const newContent = await fs.readFile(filePath, 'utf-8');
      expect(newContent).toContain('{~~Line one.~>Updated line one.~~}');
      expect(newContent).toContain('{++New inserted line.++}');
    });

    it('handles insertion before line N followed by substitution after line N', async () => {
      const content = [
        'Line one.',
        'Line two.',
        'Line three.',
        'Line four.',
        'Line five.',
        'Line six.',
      ].join('\n');
      const filePath = path.join(tmpDir, 'reverse-order.md');
      await fs.writeFile(filePath, content);

      const h1 = hashForLine(content, 1);
      const h6 = hashForLine(content, 6);

      // Batch: insert after line 1, then substitute on line 6 (AFTER the insertion)
      const result = await handleProposeBatch(
        {
          file: filePath,
          reason: 'reverse-order ops',
          changes: [
            { at: `1:${h1}`, op: '{++New inserted line.++}' },
            { at: `6:${h6}`, op: '{~~Line six.~>Updated line six.~~}' },
          ],
        },
        resolver,
        state,
      );

      expect(result.isError).toBeUndefined();
      const newContent = await fs.readFile(filePath, 'utf-8');
      expect(newContent).toContain('{++New inserted line.++}');
      expect(newContent).toContain('{~~Line six.~>Updated line six.~~}');
    });
  });

  // ─── Auto-header + compact batch coordinate shift ──────────────────
  // Regression: exact scenario from user research — compact batch with at/op
  // fails when auto_header inserts a tracking header that shifts line numbers.

  it('handles document with [^cn- patterns inside code fences', async () => {
    // Regression test: bodyLineCount must not falsely detect [^cn- patterns
    // inside code fences as the footnote block start. If it does,
    // cumulativeDelta is wrong and later ops target the wrong lines.
    const content = [
      '# Design Doc',
      '',
      '```markdown',
      '[^cn-5]: @alice | 2026-03-14 | ins | proposed',
      '    image-dimensions: 2.5in x 1.8in',
      '```',
      '',
      'The image-dimensions line stores the display size.',
    ].join('\n');
    const filePath = path.join(tmpDir, 'footnote-in-body.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1); // # Design Doc
    const h8 = hashForLine(content, 8); // paragraph line

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'fix typo and update title',
        changes: [
          {
            at: `1:${h1}`,
            op: '{~~# Design Doc~># Design Document~~}',
          },
          {
            at: `8:${h8}`,
            op: '{~~The image-dimensions line stores the display size.~>The image-dimensions line stores the DOCX display size.~~}',
          },
        ],
      },
      resolver,
      state,
    );

    if (result.isError) {
      console.error('BATCH ERROR:', JSON.stringify(result, null, 2));
    }
    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    // Both operations should have been applied
    expect(modified).toContain('{~~# Design Doc~># Design Document~~}');
    expect(modified).toContain('{~~The image-dimensions line stores the display size.~>The image-dimensions line stores the DOCX display size.~~}');
  });

  it('compact batch succeeds when auto_header shifts lines', async () => {
    const autoHeaderConfig = {
      ...compactConfig,
      tracking: { ...compactConfig.tracking, auto_header: true },
    };
    const autoHeaderResolver = await createTestResolver(tmpDir, autoHeaderConfig);

    const filePath = path.join(tmpDir, 'no-header-compact.md');
    // File without tracking header
    const body = '# Title\n\nParagraph one.\nParagraph two.\n';
    await fs.writeFile(filePath, body);

    // Compute hashes as the agent sees them (no header)
    const h2 = hashForLine(body, 2);
    const h3 = hashForLine(body, 3);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'compact batch with auto_header shift',
        changes: [
          { at: `2:${h2}`, op: '{++New section after blank line++}' },
          { at: `3:${h3}`, op: '{~~one~>1~~}{>>use number' },
        ],
      },
      autoHeaderResolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied).toHaveLength(2);

    const written = await fs.readFile(filePath, 'utf-8');
    expect(written).toContain('<!-- changedown.com/v1: tracked -->');
    expect(written).toContain('{++New section after blank line++}');
    expect(written).toContain('{~~one~>1~~}');
  });
});
