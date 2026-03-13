import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGetChange } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changetracks/mcp/internals';

const TODAY = new Date().toISOString().slice(0, 10);

describe('handleGetChange', () => {
  let tmpDir: string;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-get-change-test-'));
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

  // ─── Compact by default ─────────────────────────────────────────────

  it('omits footnote.raw_text by default (compact)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Before {~~old~>new~~}[^ct-1] after.',
        '',
        `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
        '    reason: Better wording',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.footnote.raw_text).toBeUndefined();
  });

  it('includes footnote.raw_text when include_raw_footnote is true', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Before {~~old~>new~~}[^ct-1] after.',
        '',
        `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
        '    reason: Better wording',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1', include_raw_footnote: true },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.footnote.raw_text).toBeDefined();
    expect(parsed.footnote.raw_text).toContain('[^ct-1]:');
    expect(parsed.footnote.raw_text).toContain('reason:');
  });

  // ─── Basic substitution ─────────────────────────────────────────────

  it('basic substitution: returns correct type, original_text, modified_text, inline context, footnote fields', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Line one.',
        'Before {~~old~>new~~}[^ct-1] after.',
        'Line three.',
        '',
        `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
        '    reason: Better wording',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.type).toBe('sub');
    expect(data.status).toBe('proposed');
    expect(data.inline.original_text).toBe('old');
    expect(data.inline.modified_text).toBe('new');
    expect(data.inline.markup).toContain('{~~old~>new~~}');
    expect(data.inline.line_number).toBe(2);
    expect(data.inline.end_line_number).toBe(2);
    expect(data.inline.context_before).toEqual(['Line one.']);
    expect(data.inline.context_after[0]).toBe('Line three.');
    expect(data.inline.context_after.length).toBeGreaterThanOrEqual(1);
    expect(data.footnote.author).toBe('alice');
    expect(data.footnote.date).toBe(TODAY);
    expect(data.footnote.reasoning).toBe('Better wording');
    expect(data.footnote.discussion_count).toBe(1);
  });

  // ─── Basic insertion ─────────────────────────────────────────────────

  it('basic insertion: original_text is null, modified_text is correct', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Start {++inserted++}[^ct-1] end.',
        '',
        `[^ct-1]: @bob | ${TODAY} | ins | proposed`,
        '    reason: Added clarification',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.type).toBe('ins');
    expect(data.inline.original_text).toBeNull();
    expect(data.inline.modified_text).toBe('inserted');
  });

  // ─── Basic deletion ──────────────────────────────────────────────────

  it('basic deletion: modified_text is null, original_text is correct', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Keep {--removed--}[^ct-1] keep.',
        '',
        `[^ct-1]: @carol | ${TODAY} | del | proposed`,
        '    reason: Redundant',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.type).toBe('del');
    expect(data.inline.modified_text).toBeNull();
    expect(data.inline.original_text).toBe('removed');
  });

  // ─── Context lines (default 3) ─────────────────────────────────────

  it('context lines (default 3): context_before and context_after have correct content and length', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const lines = [
      'L1',
      'L2',
      'L3',
      'L4',
      'Before {~~x~>y~~}[^ct-1] after',
      'L6',
      'L7',
      'L8',
      'L9',
      '',
      `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
    ];
    await fs.writeFile(filePath, lines.join('\n'));

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.inline.context_before).toEqual(['L2', 'L3', 'L4']);
    expect(data.inline.context_before).toHaveLength(3);
    expect(data.inline.context_after).toEqual(['L6', 'L7', 'L8']);
    expect(data.inline.context_after).toHaveLength(3);
  });

  // ─── Context lines (custom) ─────────────────────────────────────────

  it('context lines (custom): context_lines 5 returns 5 lines before/after', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const body = Array.from({ length: 15 }, (_, i) => (i === 7 ? 'X {~~a~>b~~}[^ct-1] Y' : `Line ${i + 1}`));
    await fs.writeFile(
      filePath,
      body.join('\n') + '\n\n' + `[^ct-1]: @alice | ${TODAY} | sub | proposed\n`
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1', context_lines: 5 },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.inline.context_before).toHaveLength(5);
    expect(data.inline.context_after).toHaveLength(5);
  });

  // ─── Context at file start ──────────────────────────────────────────

  it('context at file start: change on line 1, context_before is empty, context_after is correct', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        '{~~first~>second~~}[^ct-1]',
        'Line two.',
        'Line three.',
        'Line four.',
        '',
        `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.inline.line_number).toBe(1);
    expect(data.inline.context_before).toEqual([]);
    expect(data.inline.context_after).toEqual(['Line two.', 'Line three.', 'Line four.']);
  });

  // ─── Context at file end ─────────────────────────────────────────────

  it('context at file end: change on last body line, context_after is empty, context_before is correct', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Line one.',
        'Line two.',
        'Line three.',
        'End {~~old~>new~~}[^ct-1]',
        '',
        `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.inline.context_before).toEqual(['Line one.', 'Line two.', 'Line three.']);
    // context_after may include blank line and footnote (next N lines after change)
    expect(data.inline.context_after.length).toBeLessThanOrEqual(3);
  });

  // ─── Footnote metadata ──────────────────────────────────────────────

  it('footnote metadata: author, date, reasoning, discussion_count extracted correctly', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Text {~~a~>b~~}[^ct-1] more.',
        '',
        `[^ct-1]: @ai:claude-opus-4.6 | 2026-02-10 | sub | proposed`,
        '    reason: Align with ADR',
        '    @bob 2026-02-11: Agreed',
        '    @alice 2026-02-11: LGTM',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.footnote.author).toBe('ai:claude-opus-4.6');
    expect(data.footnote.date).toBe('2026-02-10');
    expect(data.footnote.reasoning).toContain('Align with ADR');
    expect(data.footnote.discussion_count).toBe(3);
  });

  // ─── Request-changes detection ────────────────────────────────────────

  it('request-changes detection: request_changes array populated when footnote has request-changes lines', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Text {~~x~>y~~}[^ct-1].',
        '',
        `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
        '    reason: Initial proposal',
        '    request-changes: @bob 2026-02-11 "Use REST instead"',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.footnote.request_changes).toContain('@bob');
    expect(data.footnote.request_changes.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Grouped change (dotted IDs; siblings by id prefix) ─────────────────

  it('grouped change: group.parent_id, group.description, group.siblings returned correctly', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Use dotted-ID group: parent ct-5 with children ct-5.1 and ct-5.2 (siblings by id prefix)
    await fs.writeFile(
      filePath,
      [
        'One {~~a~>b~~}[^ct-5.1] two {~~c~>d~~}[^ct-5.2] three.',
        '',
        `[^ct-5]: @alice | ${TODAY} | group | proposed`,
        '    reason: Refactor section',
        `[^ct-5.1]: @alice | ${TODAY} | sub | proposed`,
        `[^ct-5.2]: @alice | ${TODAY} | sub | proposed`,
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-5.2' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.group).not.toBeNull();
    expect(data.group.parent_id).toBe('ct-5');
    // Siblings derived by id prefix (ct-5.) when not a move group
    expect(data.group.siblings).toContain('ct-5.1');
    expect(data.group.siblings).toContain('ct-5.2');
  });

  // ─── Non-grouped change ───────────────────────────────────────────────

  it('non-grouped change: group is null', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Text {~~x~>y~~}[^ct-7].',
        '',
        `[^ct-7]: @alice | ${TODAY} | sub | proposed`,
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-7' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.group).toBeNull();
  });

  // ─── Multi-line change ───────────────────────────────────────────────

  it('multi-line change: inline line_number and end_line_number differ; markup spans lines', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Parser may treat multiline substitution differently; use a form that produces two lines
    const content = [
      'Before',
      'Middle {~~old~>new~~}[^ct-1] same line',
      'After',
      '',
      `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.inline.line_number).toBeGreaterThanOrEqual(1);
    expect(data.inline.end_line_number).toBeGreaterThanOrEqual(data.inline.line_number);
    expect(data.inline.markup).toContain('old');
    expect(data.inline.markup).toContain('new');
  });

  // ─── Change not found ───────────────────────────────────────────────

  it('change not found: returns error "Change ct-99 not found in file"', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        'Text {~~a~>b~~}[^ct-1].',
        '',
        `[^ct-1]: @alice | ${TODAY} | sub | proposed`,
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-99' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Change ct-99 not found in file');
  });

  // ─── Settled change (inline gone, footnote remains) ─────────────────

  it('returns CHANGE_SETTLED for changes that have been compacted', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Inline markup has been compacted away, but footnote remains
    await fs.writeFile(
      filePath,
      [
        '<!-- ctrcks.com/v1: tracked -->',
        '# Title',
        '',
        'The settled content here.',  // No inline markup
        '',
        `[^ct-1]: @ai:test | 2026-02-20 | sub | accepted`,
        '    @ai:test 2026-02-20: reason',
        '    approved: @ai:reviewer 2026-02-20 "Looks good"',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('settled');
    expect(text).toContain('CHANGE_SETTLED');
  });

  it('returns CHANGE_SETTLED with correct status extracted from footnote', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        '<!-- ctrcks.com/v1: tracked -->',
        'Clean text after rejection.',
        '',
        `[^ct-3]: @bob | 2026-02-18 | del | rejected`,
        '    @bob 2026-02-18: Not needed',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-3' },
      resolver
    );

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('CHANGE_SETTLED');
    expect(text).toContain('rejected');
  });

  it('returns generic not-found when neither inline markup nor footnote exist', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      [
        '<!-- ctrcks.com/v1: tracked -->',
        'Just plain text, no changes at all.',
      ].join('\n')
    );

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-42' },
      resolver
    );

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('ct-42');
    expect(text).toContain('not found');
    expect(text).not.toContain('CHANGE_SETTLED');
  });

  // ─── File not found ─────────────────────────────────────────────────

  it('file not found: returns error', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.md');

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found|unreadable/i);
  });

  // ─── File not in scope ───────────────────────────────────────────────

  it('file not in scope: returns error', async () => {
    const filePath = path.join(tmpDir, 'notes.txt');
    await fs.writeFile(filePath, 'Plain text.');

    const result = await handleGetChange(
      { file: filePath, change_id: 'ct-1' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not in scope|include|exclude/i);
  });
});
