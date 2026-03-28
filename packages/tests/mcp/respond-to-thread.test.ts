import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleRespondToThread } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import { ConfigResolver } from '@changedown/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const TODAY = new Date().toISOString().slice(0, 10);
const TS_RE = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z';

describe('handleRespondToThread', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeDownConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-respond-test-'));
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
        enforcement: 'warn', exclude: [],
      },
      matching: {
        mode: 'normalized',
      },
      hashline: {
        enabled: false,
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

  // ─── 1. Basic response ───────────────────────────────────────────────

  it('adds a basic response to a change with header + reason', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'This looks good to me' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1');
    expect(data.comment_added).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`    @ai:claude-opus-4.6 ${TS_RE}: This looks good to me`));
  });

  // ─── 2. Response with label ──────────────────────────────────────────

  it('adds a response with an optional label', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'Consider using a different word', label: 'suggestion' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`    @ai:claude-opus-4.6 ${TS_RE} \\[suggestion\\]: Consider using a different word`));
  });

  // ─── 3. Response inserted after existing discussion ──────────────────

  it('inserts response after existing discussion entries', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
      `    @human:alice ${TODAY}: I think this needs more context`,
      `      @ai:claude-opus-4.6 ${TODAY}: How about adding an example?`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'Agreed, example would help' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    // Find the new discussion line
    const newLineIdx = lines.findIndex(l => l.includes('Agreed, example would help'));
    expect(newLineIdx).toBeGreaterThan(-1);

    // It should be after the reply line
    const replyIdx = lines.findIndex(l => l.includes('How about adding an example?'));
    expect(newLineIdx).toBeGreaterThan(replyIdx);

    // It should be a top-level discussion entry (4-space indent)
    expect(lines[newLineIdx]).toMatch(new RegExp(`^    @ai:claude-opus-4.6 ${TS_RE}: Agreed, example would help$`));
  });

  // ─── 4. Response inserted before approval lines ──────────────────────

  it('inserts response before approval lines', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
      `    @human:alice ${TODAY}: Looks reasonable`,
      `    approved: @human:alice ${TODAY} "Looks good with the example"`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'Thanks for the approval' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    // Find the new discussion line and the approval line
    const newLineIdx = lines.findIndex(l => l.includes('Thanks for the approval'));
    const approvalIdx = lines.findIndex(l => l.includes('approved:'));

    // New line should come before approval
    expect(newLineIdx).toBeLessThan(approvalIdx);
  });

  // ─── 5. Multi-line response ──────────────────────────────────────────

  it('handles multi-line response with continuation indent', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'First line\nSecond line\nThird line' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // First line has normal format
    expect(modified).toMatch(new RegExp(`    @ai:claude-opus-4.6 ${TS_RE}: First line`));
    // Continuation lines get same indent + 2 extra spaces
    expect(modified).toContain('      Second line');
    expect(modified).toContain('      Third line');
  });

  // ─── 6. Error: change_id not found ──────────────────────────────────

  it('returns error when change_id footnote is not found in file', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-99', response: 'Hello' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/cn-99|not found/i);
  });

  // ─── 7. Error: missing required args ────────────────────────────────

  it('returns error when file argument is missing', async () => {
    const result = await handleRespondToThread(
      { change_id: 'cn-1', response: 'Hello' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/file/i);
  });

  it('returns error when change_id argument is missing', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Some text.');

    const result = await handleRespondToThread(
      { file: filePath, response: 'Hello' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/change_id/i);
  });

  it('returns error when response argument is missing', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Some text.');

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/response/i);
  });

  // ─── 8. Error: file not found ───────────────────────────────────────

  it('returns error when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'Hello' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|no such file|ENOENT/i);
  });

  // ─── 9. Response to change with no existing discussion ──────────────

  it('adds response after metadata when no existing discussion entries', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
      '    context: "text with {old} in it"',
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'First discussion entry' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    // The response should appear after the context line
    const contextIdx = lines.findIndex(l => l.includes('context:'));
    const responseIdx = lines.findIndex(l => l.includes('First discussion entry'));
    expect(responseIdx).toBeGreaterThan(contextIdx);
    expect(lines[responseIdx]).toMatch(new RegExp(`^    @ai:claude-opus-4.6 ${TS_RE}: First discussion entry$`));
  });

  // ─── 10. Response inserted before resolution lines ───────────────────

  it('inserts response before resolution lines', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
      `    @human:alice ${TODAY}: Good change`,
      `    resolved @human:alice ${TODAY}: Accepted after review`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'One more thought' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    const newLineIdx = lines.findIndex(l => l.includes('One more thought'));
    const resolvedIdx = lines.findIndex(l => l.includes('resolved'));

    expect(newLineIdx).toBeLessThan(resolvedIdx);
  });

  // ─── 11. File not in scope ──────────────────────────────────────────

  it('returns error when file is not in scope', async () => {
    const filePath = path.join(tmpDir, 'src', 'code.ts');
    await fs.mkdir(path.join(tmpDir, 'src'));
    await fs.writeFile(filePath, 'const x = 1;');

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'Hello' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not in scope/i);
  });

  // ─── 12. Relative file path resolution ──────────────────────────────

  it('resolves relative file path against projectDir', async () => {
    const subDir = path.join(tmpDir, 'docs');
    await fs.mkdir(subDir);
    const filePath = path.join(subDir, 'notes.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: 'docs/notes.md', change_id: 'cn-1', response: 'Looks good' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1');
    expect(data.comment_added).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`    @ai:claude-opus-4.6 ${TS_RE}: Looks good`));
  });

  // ─── 13. Multiple footnotes: targets correct one ────────────────────

  it('targets the correct footnote when multiple exist', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Text {~~a~>b~~}[^cn-1] and {~~c~>d~~}[^cn-2] here.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: First change`,
      '',
      `[^cn-2]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Second change`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-2', response: 'Targeting the second one' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    // The response should be in the cn-2 block, not cn-1
    const sc2HeaderIdx = lines.findIndex(l => l.startsWith('[^cn-2]:'));
    const responseIdx = lines.findIndex(l => l.includes('Targeting the second one'));
    const sc1HeaderIdx = lines.findIndex(l => l.startsWith('[^cn-1]:'));

    expect(responseIdx).toBeGreaterThan(sc2HeaderIdx);
    // cn-1 block should NOT contain the response
    expect(responseIdx).toBeGreaterThan(sc1HeaderIdx);
  });

  // ─── 14. Response before rejected: and request-changes: lines ───────

  it('inserts response before rejected: and request-changes: lines', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
      `    @human:alice ${TODAY}: Not sure about this`,
      `    rejected: @human:bob ${TODAY} "Doesn't fit the style"`,
      `    request-changes: @human:charlie ${TODAY} "Needs rework"`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'I disagree with the rejection' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    const newLineIdx = lines.findIndex(l => l.includes('I disagree with the rejection'));
    const rejectedIdx = lines.findIndex(l => l.includes('rejected:'));
    const requestChangesIdx = lines.findIndex(l => l.includes('request-changes:'));

    expect(newLineIdx).toBeLessThan(rejectedIdx);
    expect(newLineIdx).toBeLessThan(requestChangesIdx);
  });

  // ─── 15. open -- resolution line ────────────────────────────────────

  it('inserts response before open resolution lines', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
      `    @human:alice ${TODAY}: Still discussing`,
      `    open -- needs more review`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'Adding my thoughts' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    const newLineIdx = lines.findIndex(l => l.includes('Adding my thoughts'));
    const openIdx = lines.findIndex(l => l.includes('open --'));

    expect(newLineIdx).toBeLessThan(openIdx);
  });

  // ─── 15b. bare "open" resolution line (no reason) ─────────────────────

  it('inserts response before bare "open" resolution line', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
      `    @human:alice ${TODAY}: Still discussing`,
      '    open',
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'Adding my thoughts' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    const lines = modified.split('\n');

    const newLineIdx = lines.findIndex(l => l.includes('Adding my thoughts'));
    const openIdx = lines.findIndex(l => l.trim() === 'open');

    expect(newLineIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(-1);
    expect(newLineIdx).toBeLessThan(openIdx);
  });

  // ─── 16. Error: invalid label ────────────────────────────────────────

  it('returns error when an invalid label is provided', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'Hello', label: 'invalid-label' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/invalid label/i);
    expect(result.content[0].text).toContain('invalid-label');
  });

  // ─── 17. Explicit author parameter ──────────────────────────────────

  it('uses explicit author parameter when provided', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'This looks good to me', author: 'ai:claude-sonnet-4.5' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Should use the explicit author, not the config default
    expect(modified).toMatch(new RegExp(`    @ai:claude-sonnet-4.5 ${TS_RE}: This looks good to me`));
    // The original footnote header will still have the default author
    // but the discussion line should use the explicit author
    const lines = modified.split('\n');
    const discussionLine = lines.find(l => l.includes('This looks good to me'));
    expect(discussionLine).toContain('@ai:claude-sonnet-4.5');
  });

  it('uses config default author when author parameter is omitted', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'This looks good to me' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Should use the config default
    expect(modified).toMatch(new RegExp(`    @ai:claude-opus-4.6 ${TS_RE}: This looks good to me`));
  });

  // ─── 18. Author enforcement ────────────────────────────────────────

  it('enforcement=required without author returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const originalContent = [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n');
    await fs.writeFile(filePath, originalContent);

    const requiredConfig: ChangeDownConfig = {
      ...config,
      author: { default: 'ai:claude-opus-4.6', enforcement: 'required' },
    };
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'This looks good to me' },
      requiredResolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires an author parameter');

    // File must NOT be modified
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe(originalContent);
  });

  it('enforcement=required with author succeeds', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, [
      'Some text with {~~old~>new~~}[^cn-1] inline.',
      '',
      `[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`,
      `    @ai:claude-opus-4.6 ${TODAY}: Improved clarity`,
    ].join('\n'));

    const requiredConfig: ChangeDownConfig = {
      ...config,
      author: { default: 'ai:claude-opus-4.6', enforcement: 'required' },
    };
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

    const result = await handleRespondToThread(
      { file: filePath, change_id: 'cn-1', response: 'This looks good to me', author: 'ai:claude-sonnet-4.5' },
      requiredResolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toMatch(new RegExp(`    @ai:claude-sonnet-4.5 ${TS_RE}: This looks good to me`));
  });
});
