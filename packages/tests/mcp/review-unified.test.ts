import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleReviewChanges } from '@changetracks/mcp/internals';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const TODAY = new Date().toISOString().slice(0, 10);
const TS_RE = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z';

describe('unified review_changes with responses and settle', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-review-unified-'));
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
      settlement: { auto_on_approve: false, auto_on_reject: false },
      policy: { mode: 'safety-net', creation_tracking: 'footnote' },
      protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    };
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── Helper: create a file with proposed changes via propose_change ────

  async function createFileWithProposedChanges(): Promise<string> {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, '# Test Doc\n\nThis has a tpyo in it.\n\nAnd this paragraph is fine.\n');

    await handleProposeChange(
      { file: filePath, old_text: 'tpyo', new_text: 'typo', reason: 'spelling fix' },
      resolver,
      state,
    );

    await handleProposeChange(
      { file: filePath, old_text: 'And this paragraph is fine.', new_text: '', reason: 'remove filler' },
      resolver,
      state,
    );

    return filePath;
  }

  // ─── Helper: create a file with a hand-crafted fixture ─────────────────

  async function createFixtureFile(): Promise<string> {
    const filePath = path.join(tmpDir, 'fixture.md');
    const content = [
      '# Test Doc',
      '',
      `This has a {~~tpyo~>typo~~}[^ct-1] in it.`,
      '',
      `And a {++new paragraph++}[^ct-2] added.`,
      '',
      `[^ct-1]: @alice | 2026-02-17 | sub | proposed`,
      `    @alice 2026-02-17: spelling fix`,
      '',
      `[^ct-2]: @bob | 2026-02-17 | ins | proposed`,
      `    @bob 2026-02-17: missing content`,
    ].join('\n');
    await fs.writeFile(filePath, content);
    return filePath;
  }

  // ─── 1. Reviews array with accept/reject (existing behavior) ───────────

  it('reviews array with accept/reject works as before', async () => {
    const filePath = await createFixtureFile();

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'looks good' },
          { change_id: 'ct-2', decision: 'reject', reason: 'not needed' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.results).toHaveLength(2);
    expect(data.results[0].change_id).toBe('ct-1');
    expect(data.results[0].decision).toBe('approve');
    expect(data.results[0].status_updated).toBe(true);
    expect(data.results[1].change_id).toBe('ct-2');
    expect(data.results[1].decision).toBe('reject');
    expect(data.results[1].status_updated).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('| accepted');
    expect(modified).toContain('| rejected');
    expect(modified).toContain('approved:');
    expect(modified).toContain('rejected:');
  });

  // ─── 2. Responses array — respond to a thread (new) ───────────────────

  it('responses array adds thread replies to footnotes', async () => {
    const filePath = await createFixtureFile();

    const result = await handleReviewChanges(
      {
        file: filePath,
        responses: [
          { change_id: 'ct-1', response: 'I agree with this fix', label: 'praise' },
          { change_id: 'ct-2', response: 'Is this the right place for it?' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Response to ct-1 with label
    expect(modified).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE} \\[praise\\]: I agree with this fix`));
    // Response to ct-2 without label
    expect(modified).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE}: Is this the right place for it\\?`));
    // Original footnote headers and content untouched — no status change from responses
    expect(modified).toContain('| proposed');
    expect(modified).not.toContain('| accepted');
    expect(modified).not.toContain('| rejected');
  });

  // ─── 3. Combined reviews + responses in one call (new) ────────────────

  it('combined reviews + responses in one call', async () => {
    const filePath = await createFixtureFile();

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'correct fix' },
        ],
        responses: [
          { change_id: 'ct-2', response: 'Is this the right place?', label: 'question' },
        ],
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Review applied to ct-1
    expect(modified).toContain('| accepted');
    expect(modified).toMatch(new RegExp(`approved: @ai:claude-opus-4.6 ${TS_RE} "correct fix"`));
    // Response applied to ct-2
    expect(modified).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE} \\[question\\]: Is this the right place\\?`));
    // ct-2 status unchanged
    const sc2Header = modified.split('\n').find(l => l.startsWith('[^ct-2]:'));
    expect(sc2Header).toContain('| proposed');
  });

  // ─── 4. settle=true accepts all proposed and removes inline markup (new) ─

  it('settle=true accepts all proposed changes and removes inline markup', async () => {
    const filePath = await createFixtureFile();

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'good spelling fix' },
          { change_id: 'ct-2', decision: 'approve', reason: 'needed content' },
        ],
        settle: true,
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Inline markup should be removed after settlement
    expect(modified).not.toContain('{~~');
    expect(modified).not.toContain('~~}');
    expect(modified).not.toContain('{++');
    expect(modified).not.toContain('++}');
    // Accepted text should be present
    expect(modified).toContain('typo');
    expect(modified).toContain('new paragraph');
  });

  // ─── 5. Settle preserves footnotes (Layer 1 compaction only) ──────────

  it('settle preserves footnote definitions and inline refs (Layer 1)', async () => {
    const filePath = await createFixtureFile();

    const result = await handleReviewChanges(
      {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'good fix' },
          { change_id: 'ct-2', decision: 'approve', reason: 'good addition' },
        ],
        settle: true,
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Layer 1 compaction: footnote definitions preserved for audit trail
    expect(modified).toContain('[^ct-1]:');
    expect(modified).toContain('[^ct-2]:');
    // Inline footnote refs preserved
    expect(modified).toContain('[^ct-1]');
    expect(modified).toContain('[^ct-2]');
    // Status should be accepted in footnotes
    expect(modified).toContain('| accepted');
    expect(modified).not.toContain('| proposed');
  });

  // ─── 6. responses with invalid change_id returns partial success ──────

  it('responses with invalid change_id: partial success for valid entries', async () => {
    const filePath = await createFixtureFile();

    const result = await handleReviewChanges(
      {
        file: filePath,
        responses: [
          { change_id: 'ct-1', response: 'Good fix' },
          { change_id: 'ct-99', response: 'This change does not exist' },
        ],
      },
      resolver,
      state,
    );

    // Should not be a hard error — partial success like reviews
    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Valid response applied
    expect(modified).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE}: Good fix`));
  });

  // ─── 7. Empty call with neither reviews nor responses returns error ───

  it('returns error when neither reviews nor responses provided', async () => {
    const filePath = await createFixtureFile();

    const result = await handleReviewChanges(
      {
        file: filePath,
      },
      resolver,
      state,
    );

    expect(result.isError).toBe(true);
  });

  // ─── 8. settle without reviews first (standalone settle) ──────────────

  it('settle=true without reviews settles already-accepted changes', async () => {
    // Create a fixture with already-accepted changes (no reviews needed)
    const filePath = path.join(tmpDir, 'already-accepted.md');
    const content = [
      '# Doc',
      '',
      `This has a {~~tpyo~>typo~~}[^ct-1] fix.`,
      '',
      `[^ct-1]: @alice | 2026-02-17 | sub | accepted`,
      `    @alice 2026-02-17: spelling fix`,
      `    approved: @bob 2026-02-17 "looks good"`,
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleReviewChanges(
      {
        file: filePath,
        settle: true,
      },
      resolver,
      state,
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Inline markup removed by settlement
    expect(modified).not.toContain('{~~');
    expect(modified).not.toContain('~~}');
    // Settled text present
    expect(modified).toContain('typo');
    // Footnote definition preserved (Layer 1)
    expect(modified).toContain('[^ct-1]:');
    expect(modified).toContain('| accepted');
  });
});
