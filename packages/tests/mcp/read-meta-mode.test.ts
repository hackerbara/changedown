import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Tests for read_tracked_file meta mode — the "agent renderer".
 *
 * Meta mode uses three-zone annotation format per line:
 *   Zone 1: Margin (LINE:HASH FLAG| when hashline enabled)
 *   Zone 2: Content with lightweight [^ct-N] anchors inline after CriticMarkup
 *   Zone 3: {>>ct-N @author: reason<<} metadata at end of line
 *
 * Also prepends a deliberation summary header (policy, change counts, authors).
 * The footnote definition section is elided from output.
 */
describe('read_tracked_file meta mode', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let filePath: string;

  // Fixture with three tracked changes:
  // ct-1: substitution by @alice (no thread replies)
  // ct-2: insertion by @ai:claude-opus-4.6 (no thread replies)
  // ct-3: highlight by @kimi (2 thread replies from @bob and @alice)
  const FIXTURE = [
    '# API Design Doc',
    '',
    'This has a {~~tpyo~>typo~~}[^ct-1] in the intro.',
    '',
    'A {++new section about auth++}[^ct-2] was added.',
    '',
    'Rate limit is {==1000/min==}[^ct-3].',
    '',
    '[^ct-1]: @alice | 2026-02-17 | sub | proposed',
    '    reason: spelling fix',
    '',
    '[^ct-2]: @ai:claude-opus-4.6 | 2026-02-17 | ins | proposed',
    '    reason: missing auth coverage',
    '',
    '[^ct-3]: @kimi | 2026-02-17 | highlight | proposed',
    '    reason: contradicts section 4',
    '    @bob 2026-02-17: I think 1000 is correct',
    '    @alice 2026-02-17: Let me check the spec',
  ].join('\n');

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-meta-'));
    state = new SessionState();
    config = {
      tracking: {
        include: ['**/*.md'],
        exclude: ['node_modules/**', 'dist/**'],
        default: 'tracked',
        auto_header: false,
      },
      author: {
        default: 'ai:test-agent',
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
    filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, FIXTURE);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── Test 1: Deliberation summary header ──────────────────────────────

  it('meta mode includes deliberation summary header (policy, counts, authors)', async () => {
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Summary header should include policy mode (unified renderer uses protocol.mode, which defaults to 'classic')
    expect(text).toContain('policy: classic');
    // Summary header should include change status counts (new format: "proposed: N | accepted: N | rejected: N")
    expect(text).toContain('proposed: 3');
    // Summary header should include author names
    expect(text).toContain('@alice');
    expect(text).toContain('@ai:claude-opus-4.6');
    expect(text).toContain('@kimi');
  });

  // ─── Test 2: Three-zone inline metadata annotations ──────────────────

  it('meta mode uses three-zone format: [^ct-N] anchor inline, {>>metadata<<} at end of line', async () => {
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Zone 2: lightweight [^ct-N] anchor stays inline after CriticMarkup
    expect(text).toContain('{~~tpyo~>typo~~}[^ct-1]');
    expect(text).toContain('{++new section about auth++}[^ct-2]');
    expect(text).toContain('{==1000/min==}[^ct-3]');

    // Zone 3: metadata at end of line using CriticMarkup comment syntax
    expect(text).toContain('{>>ct-1 @alice: spelling fix<<}');
    expect(text).toContain('{>>ct-2 @ai:claude-opus-4.6: missing auth coverage<<}');
    // ct-3 has replies (tested separately in Test 3)
    expect(text).toMatch(/\{>>ct-3 @kimi: contradicts section 4/);

    // Zone 3 is at end of line, not inline after CriticMarkup
    const line1 = text.split('\n').find(l => l.includes('[^ct-1]'));
    expect(line1).toMatch(/\[\^ct-1\].*\{>>ct-1/);  // anchor before metadata
    expect(line1).toMatch(/<<\}$/);  // line ends with metadata closer

    // No old bracket annotation format present
    expect(text).not.toContain('[ct-1 proposed');
    expect(text).not.toContain('[ct-2 proposed');
    expect(text).not.toContain('[ct-3 proposed');
  });

  // ─── Test 3: Thread reply count in Zone 3 ────────────────────────────

  it('meta mode shows thread reply count in Zone 3 metadata', async () => {
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // ct-3 has 2 thread replies — reply count appended with pipe separator
    expect(text).toContain('{>>ct-3 @kimi: contradicts section 4 | 2 replies<<}');
    // ct-1 has no replies — Zone 3 metadata should not mention "replies"
    expect(text).not.toMatch(/\{>>ct-1.*replies/);
  });

  // ─── Test 3b: Multiple annotations per line ──────────────────────────

  it('renders multiple annotations per line with all Zone 3 blocks at end', async () => {
    const multiContent = [
      '# Doc',
      '',
      'The {~~API~>service~~}[^ct-1] should use {~~REST~>GraphQL~~}[^ct-2] for the external interface.',
      '',
      '[^ct-1]: @alice | 2026-02-20 | sub | proposed',
      '    reason: naming',
      '',
      '[^ct-2]: @claude | 2026-02-20 | sub | proposed',
      '    reason: paradigm shift',
    ].join('\n');
    await fs.writeFile(filePath, multiContent);

    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Zone 2: both anchors inline after their CriticMarkup
    expect(text).toContain('{~~API~>service~~}[^ct-1]');
    expect(text).toContain('{~~REST~>GraphQL~~}[^ct-2]');

    // Zone 3: both metadata blocks at end of line (space-separated in unified renderer)
    expect(text).toContain('{>>ct-1 @alice: naming<<}');
    expect(text).toContain('{>>ct-2 @claude: paradigm shift<<}');

    // Both zones on same line
    const multiLine = text.split('\n').find(l => l.includes('[^ct-1]') && l.includes('[^ct-2]'));
    expect(multiLine).toBeDefined();
    expect(multiLine).toMatch(/<<\}$/);  // line ends with metadata closer
  });

  // ─── Test 4: Footnote section elided ──────────────────────────────────

  it('meta mode elides footnote section', async () => {
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Footnote definitions should NOT appear in meta mode output
    expect(text).not.toContain('[^ct-1]:');
    expect(text).not.toContain('[^ct-2]:');
    expect(text).not.toContain('[^ct-3]:');
    // The reason text should only appear in inline annotations, not in footnote blocks
    expect(text).not.toContain('reason: spelling fix');
  });

  // ─── Test 5: view=content shows raw markup ────────────────────────────

  it('view=content shows raw markup without annotations', async () => {
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'content' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Raw CriticMarkup should be present
    expect(text).toContain('{~~tpyo~>typo~~}');
    expect(text).toContain('{++new section about auth++}');
    // Footnote references should be present (not replaced with annotations)
    expect(text).toContain('[^ct-1]');
    expect(text).toContain('[^ct-2]');
    // No inline metadata annotations (neither old bracket nor new Zone 3 format)
    expect(text).not.toContain('[ct-1 proposed');
    expect(text).not.toContain('{>>ct-1');
    expect(text).not.toContain('[ct-2 proposed');
    expect(text).not.toContain('{>>ct-2');
  });

  // ─── Test 6: view=full shows everything including footnotes ───────────

  it('view=full shows everything including footnotes', async () => {
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'full' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Footnote definitions should be present
    expect(text).toContain('[^ct-1]:');
    expect(text).toContain('[^ct-2]:');
    expect(text).toContain('[^ct-3]:');
    // Footnote content should be present
    expect(text).toContain('reason: spelling fix');
    expect(text).toContain('reason: missing auth coverage');
    expect(text).toContain('@bob 2026-02-17: I think 1000 is correct');
    // Raw CriticMarkup should also be present
    expect(text).toContain('{~~tpyo~>typo~~}');
  });

  // ─── Test 7: Meta view with hashline enabled shows LINE:HASH ───────────

  it('meta mode with hashline enabled includes LINE:HASH per line', async () => {
    const hashlineConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: true, auto_remap: false },
    };
    const resolver = await createTestResolver(tmpDir, hashlineConfig);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // When hashline is enabled, meta view must show LINE:HASH F| so agents can use at+op
    // Flag column: space + flag(P/A/space) + pipe = " P|", " A|", or "  |"
    expect(text).toMatch(/\d+:[0-9a-f]{2} [PA ]\|/);
    expect(text).toContain('| # API Design Doc');
    // Three-zone format: [^ct-N] anchor inline + {>>metadata<<} at end of line
    expect(text).toContain('[^ct-1]');
    expect(text).toContain('{>>ct-1');
  });

  // ─── Test 8: Default view is meta ─────────────────────────────────────

  it('default view is meta', async () => {
    const resolver = await createTestResolver(tmpDir, config);
    // No view parameter specified — should default to meta
    const result = await handleReadTrackedFile(
      { file: filePath },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Should behave like meta mode: three-zone annotations present
    expect(text).toContain('[^ct-1]');  // Zone 2: lightweight anchor
    expect(text).toContain('{>>ct-1');  // Zone 3: metadata at end of line
    // Should behave like meta mode: footnote definitions absent
    expect(text).not.toContain('[^ct-1]:');
  });

  // ─── Test 9: P flag in review view hashline for proposed changes ──────

  it('review view includes P flag in hashline for proposed changes', async () => {
    const hashlineConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: true, auto_remap: false },
    };
    const resolver = await createTestResolver(tmpDir, hashlineConfig);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Lines with proposed changes should have P flag: "N:HH P| content"
    expect(text).toMatch(/\d+:[0-9a-f]{2} P\|/);
  });

  // ─── Test 10: A flag in review view hashline for accepted changes ─────

  it('review view includes A flag for accepted changes', async () => {
    const content = [
      '# Doc',
      '{++accepted text++}[^ct-1]',
      '',
      '[^ct-1]: @alice | 2026-02-24 | ins | accepted',
      '    reason: added context',
    ].join('\n');
    await fs.writeFile(filePath, content);

    const hashlineConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: true, auto_remap: false },
    };
    const resolver = await createTestResolver(tmpDir, hashlineConfig);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Line with accepted change should have A flag: "N:HH A| content"
    expect(text).toMatch(/[0-9a-f]{2} A\|/);
  });

  // ─── Test 11: Blank flag for clean lines ──────────────────────────────

  it('review view has blank flag for clean lines', async () => {
    const hashlineConfig: ChangeTracksConfig = {
      ...config,
      hashline: { enabled: true, auto_remap: false },
    };
    const resolver = await createTestResolver(tmpDir, hashlineConfig);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;

    // Clean lines: "N:HH  | content" (2 spaces where flag would be)
    expect(text).toMatch(/\d+:[0-9a-f]{2}  \|/);
  });

  // ─── Test 12: Compact threshold for long substitutions ─────────────

  it('renders long substitution text without compaction in unified renderer', async () => {
    const longNewText = 'A'.repeat(100); // 100-char text
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      `{~~short~>${longNewText}~~}[^ct-1]`,
      '',
      '[^ct-1]: @alice | 2026-02-24 | sub | proposed',
      '    @alice 2026-02-24: expanded explanation',
    ].join('\n');
    await fs.writeFile(filePath, content);
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Unified renderer does not compact long texts — full substitution is shown
    expect(text).toContain(longNewText);
  });

  it('does not compact when new text is under threshold', async () => {
    const shortNewText = 'B'.repeat(40); // Under 80-char default threshold
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      `{~~short~>${shortNewText}~~}[^ct-1]`,
      '',
      '[^ct-1]: @alice | 2026-02-24 | sub | proposed',
      '    @alice 2026-02-24: minor edit',
    ].join('\n');
    await fs.writeFile(filePath, content);
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Should keep the full text since it's under threshold
    expect(text).toContain(shortNewText);
    expect(text).not.toContain('[40c]');
  });

  it('compacts at exactly the threshold boundary', async () => {
    const exactText = 'C'.repeat(80); // Exactly 80 chars — NOT over, should not compact
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      `{~~old~>${exactText}~~}[^ct-1]`,
      '',
      '[^ct-1]: @alice | 2026-02-24 | sub | proposed',
      '    @alice 2026-02-24: boundary test',
    ].join('\n');
    await fs.writeFile(filePath, content);
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Exactly at threshold — should NOT compact (threshold means "exceeds", not "equals")
    expect(text).toContain(exactText);
    expect(text).not.toContain('[80c]');
  });

  it('renders text just over old threshold without compaction in unified renderer', async () => {
    const overText = 'D'.repeat(81); // 81 chars
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      `{~~old~>${overText}~~}[^ct-1]`,
      '',
      '[^ct-1]: @alice | 2026-02-24 | sub | proposed',
      '    @alice 2026-02-24: just over boundary',
    ].join('\n');
    await fs.writeFile(filePath, content);
    const resolver = await createTestResolver(tmpDir, config);
    const result = await handleReadTrackedFile(
      { file: filePath, view: 'meta' },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Unified renderer does not compact — full text shown
    expect(text).toContain(overText);
  });

});
