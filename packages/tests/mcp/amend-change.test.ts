import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { handleAmendChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changetracks/mcp/internals';

const TODAY = new Date().toISOString().slice(0, 10);

function defaultConfig(overrides?: Partial<ChangeTracksConfig['author']>): ChangeTracksConfig {
  return {
    tracking: {
      include: ['**/*.md'],
      exclude: ['node_modules/**', 'dist/**'],
      default: 'tracked',
      auto_header: true,
    },
    author: {
      default: 'ai:claude-opus-4.6',
      enforcement: 'optional',
      ...overrides,
    },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: false, auto_remap: false },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  };
}

describe('handleAmendChange', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-amend-test-'));
    state = new SessionState();
    config = defaultConfig();
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('amend substitution: updates proposed side and footnote', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'first proposal' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast', reason: 'typo fix' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1');
    expect(data.amended).toBe(true);
    expect(data.inline_updated).toBe(true);
    expect(data.previous_text).toBe('slow');
    expect(data.new_text).toBe('fast');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~quick~>fast~~}[^ct-1]');
    expect(modified).toMatch(/revised @.+ \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z: typo fix/);
    expect(modified).toContain('previous: "slow"');
  });

  it('amend insertion: updates inserted text and footnote', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: '', new_text: ' brown', insert_after: 'quick' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: ' red', reason: 'better word' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.previous_text).toBe(' brown');
    expect(data.new_text).toBe(' red');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('quick{++ red++}[^ct-1]');
  });

  it('amend comment: updates comment text and footnote', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      `Line one.\n\n{>>old note<<}[^ct-1]\n\n[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | com | proposed`
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'updated note', reason: 'clarified' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{>>updated note<<}[^ct-1]');
  });

  it('deletion: reasoning only — no inline change, footnote gains revised', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');
    await handleProposeChange(
      { file: filePath, old_text: ' brown', new_text: '', reason: 'remove extra' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: '', reason: 'actually for consistency' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.inline_updated).toBe(false);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{-- brown--}[^ct-1]');
    expect(modified).toMatch(/revised @.+ \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z: actually for consistency/);
  });

  it('deletion: new_text provided returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');
    await handleProposeChange(
      { file: filePath, old_text: ' brown', new_text: '' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: ' something' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Deletion changes cannot be amended inline');
  });

  it('same-author enforced: different author returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'human:alice' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast', author: 'human:bob' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not the original author');
    expect(result.content[0].text).toContain('human:alice');
  });

  it('status must be proposed: amend accepted change returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      resolver,
      state
    );
    const content = await fs.readFile(filePath, 'utf-8');
    await fs.writeFile(
      filePath,
      content.replace('| proposed', '| accepted')
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot amend a accepted change');
  });

  it('status must be proposed: amend rejected change returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      resolver,
      state
    );
    const content = await fs.readFile(filePath, 'utf-8');
    await fs.writeFile(
      filePath,
      content.replace('| proposed', '| rejected')
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot amend a rejected change');
  });

  it('change not found returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-99', new_text: 'fast' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Change ct-99 not found');
  });

  it('new_text identical to current returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'slow' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('identical to current proposed text');
  });

  it('footnote preserves discussion: revised inserted after discussion, before reviews', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'original' },
      resolver,
      state
    );
    const beforeAmend = await fs.readFile(filePath, 'utf-8');
    expect(beforeAmend).toContain('@ai:claude-opus-4.6');
    expect(beforeAmend).toContain('original');
    await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast', reason: 'typo' },
      resolver
    );
    const after = await fs.readFile(filePath, 'utf-8');
    const sc1Block = after.split('[^ct-1]:')[1]?.split('\n\n')[0] ?? '';
    const revisedIdx = sc1Block.indexOf('revised');
    const discussionIdx = sc1Block.indexOf('2026-02-12: original');
    expect(revisedIdx).toBeGreaterThan(discussionIdx);
  });

  it('multiple amends: footnote has two revised entries', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      resolver,
      state
    );
    await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast', reason: 'first' },
      resolver
    );
    await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'swift', reason: 'second' },
      resolver
    );

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~quick~>swift~~}[^ct-1]');
    const revisedCount = (modified.match(/revised @/g) ?? []).length;
    expect(revisedCount).toBe(2);
    expect(modified).toContain('previous: "slow"');
    expect(modified).toContain('previous: "fast"');
  });

  it('amends a dotted group member by ID (resolveChangeById path)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = [
      'Hello {~~old~>new~~}[^ct-1.1]',
      '',
      '[^ct-1.1]: @ai:test-model | 2026-03-04 | sub | proposed',
      '    @ai:test-model 2026-03-04: original reason',
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'ct-1.1',
        new_text: 'newer',
        author: 'ai:test-model',
        reason: 'updated text',
      },
      resolver,
      state
    );

    expect(result.isError, `Expected success but got: ${JSON.stringify(result)}`).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('ct-1.1');
    expect(data.amended).toBe(true);
    expect(data.inline_updated).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~old~>newer~~}[^ct-1.1]');
    expect(modified).toMatch(/revised @ai:test-model \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z: updated text/);
    expect(modified).toContain('previous: "new"');
  });

  it('grouped change: amend ct-5.2 amends child only', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      'A {~~one~>uno~~}[^ct-5] B {~~two~>dos~~}[^ct-5.2]\n\n[^ct-5]: @human:alice | 2026-01-01 | sub | proposed\n[^ct-5.2]: @human:alice | 2026-01-01 | sub | proposed'
    );
    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-5.2', new_text: 'deux', reason: 'French', author: 'human:alice' },
      resolver
    );
    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~one~>uno~~}[^ct-5]');
    expect(modified).toContain('{~~two~>deux~~}[^ct-5.2]');
  });

  it('expands substitution scope via old_text parameter', async () => {
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Test',
      'Rate limiting from between 10-20 {~~milliseconds~>milliseconds~~}[^ct-1] per request.',
      '',
      '[^ct-1]: @ai:test-agent | 2026-02-25 | sub | proposed',
      '    @ai:test-agent 2026-02-25: audit marker',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'ct-1',
        old_text: 'from between 10-20 milliseconds',
        new_text: 'from 10-20 ms',
        author: 'ai:test-agent',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~from between 10-20 milliseconds~>from 10-20 ms~~}');
    expect(modified).toContain('[^ct-1]');
  });

  it('rejects scope expansion that does not contain original old_text', async () => {
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Test',
      'The API uses {~~REST~>GraphQL~~}[^ct-1] for requests.',
      '',
      '[^ct-1]: @ai:test-agent | 2026-02-25 | sub | proposed',
      '    @ai:test-agent 2026-02-25: paradigm',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'ct-1',
        old_text: 'completely different text',
        new_text: 'gRPC',
        author: 'ai:test-agent',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/must contain/i);
  });

  it('scope expansion rejects non-substitution changes', async () => {
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Test',
      'The quick{++ brown++}[^ct-1] fox.',
      '',
      '[^ct-1]: @ai:test-agent | 2026-02-25 | ins | proposed',
      '    @ai:test-agent 2026-02-25: add word',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'ct-1',
        old_text: 'quick brown',
        new_text: 'red',
        author: 'ai:test-agent',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/substitution/i);
  });

  it('scope expansion: prefix/suffix context mismatch returns error', async () => {
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Test',
      'The API uses {~~REST~>GraphQL~~}[^ct-1] for requests.',
      '',
      '[^ct-1]: @ai:test-agent | 2026-02-25 | sub | proposed',
      '    @ai:test-agent 2026-02-25: paradigm',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content, 'utf-8');

    // old_text contains 'REST' but the surrounding context doesn't match
    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'ct-1',
        old_text: 'XYZ REST ABC',
        new_text: 'gRPC',
        author: 'ai:test-agent',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/context does not match/i);
  });

  it('CriticMarkup in new_text returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast {++nested++}' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cannot contain CriticMarkup delimiters');
  });

  it('author enforcement required: amend without author when required returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'human:alice' },
      resolver,
      state
    );
    const requiredConfig = defaultConfig({ enforcement: 'required' });
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast' },
      requiredResolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires an author parameter');
  });

  it('preserves other changes: amend one leaves the other untouched', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      resolver,
      state
    );
    await handleProposeChange(
      { file: filePath, old_text: 'brown', new_text: 'red' },
      resolver,
      state
    );

    await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'fast' },
      resolver
    );

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~quick~>fast~~}[^ct-1]');
    expect(modified).toContain('{~~brown~>red~~}[^ct-2]');
  });

  it('sequential amend of 5+ proposals: all get revised entries in footnotes', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Word1 Word2 Word3 Word4 Word5 end.');
    // Create 5 proposals
    await handleProposeChange(
      { file: filePath, old_text: 'Word1', new_text: 'Changed1', reason: 'reason1' },
      resolver, state
    );
    await handleProposeChange(
      { file: filePath, old_text: 'Word2', new_text: 'Changed2', reason: 'reason2' },
      resolver, state
    );
    await handleProposeChange(
      { file: filePath, old_text: 'Word3', new_text: 'Changed3', reason: 'reason3' },
      resolver, state
    );
    await handleProposeChange(
      { file: filePath, old_text: 'Word4', new_text: 'Changed4', reason: 'reason4' },
      resolver, state
    );
    await handleProposeChange(
      { file: filePath, old_text: 'Word5', new_text: 'Changed5', reason: 'reason5' },
      resolver, state
    );

    // Amend all 5 sequentially
    for (let i = 1; i <= 5; i++) {
      const result = await handleAmendChange(
        { file: filePath, change_id: `ct-${i}`, new_text: `Amended${i}`, reason: `amend reason ${i}` },
        resolver, state
      );
      expect(result.isError, `ct-${i} amend should succeed but got: ${result.content[0].text}`).toBeUndefined();
    }

    const modified = await fs.readFile(filePath, 'utf-8');

    // All 5 should have updated inline markup
    for (let i = 1; i <= 5; i++) {
      expect(modified).toContain(`{~~Word${i}~>Amended${i}~~}[^ct-${i}]`);
    }

    // All 5 should have revised entries in footnotes
    const revisedMatches = modified.match(/revised @/g) ?? [];
    expect(revisedMatches.length).toBe(5);

    // All 5 should have previous entries in footnotes
    for (let i = 1; i <= 5; i++) {
      expect(modified).toContain(`previous: "Changed${i}"`);
    }

    // Verify each footnote block has its own revised entry
    for (let i = 1; i <= 5; i++) {
      // Extract the footnote block for ct-i
      const blockStart = modified.indexOf(`[^ct-${i}]:`);
      expect(blockStart).toBeGreaterThan(-1);
      const nextBlock = modified.indexOf(`[^ct-${i + 1}]:`, blockStart);
      const blockText = nextBlock > -1
        ? modified.slice(blockStart, nextBlock)
        : modified.slice(blockStart);
      expect(blockText, `ct-${i} footnote should contain revised entry`).toContain(`revised @`);
      expect(blockText, `ct-${i} footnote should contain previous entry`).toContain(`previous: "Changed${i}"`);
    }
  });

  it('reasoning-only amend for substitution: same new_text with reasoning succeeds', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'initial' },
      resolver, state
    );

    // Amend with same text but different reasoning — should succeed and add revised entry
    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'slow', reason: 'updated reasoning only' },
      resolver
    );

    expect(result.isError, `reasoning-only amend should succeed but got: ${result.content[0].text}`).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.amended).toBe(true);
    expect(data.inline_updated).toBe(false);

    const modified = await fs.readFile(filePath, 'utf-8');
    // Inline markup unchanged
    expect(modified).toContain('{~~quick~>slow~~}[^ct-1]');
    // Footnote gains revised entry
    expect(modified).toContain('revised @');
    expect(modified).toContain('updated reasoning only');
    // No previous entry since text didn't change
    expect(modified).not.toContain('previous:');
  });

  it('reasoning-only amend for insertion: same new_text with reasoning succeeds', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: '', new_text: ' brown', insert_after: 'quick' },
      resolver, state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: ' brown', reason: 'adding rationale for the addition' },
      resolver
    );

    expect(result.isError, `reasoning-only amend should succeed but got: ${result.content[0].text}`).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.inline_updated).toBe(false);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('quick{++ brown++}[^ct-1]');
    expect(modified).toContain('adding rationale for the addition');
  });

  it('reasoning-only amend without reasoning still errors', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow' },
      resolver, state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'slow' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('identical to current proposed text');
    expect(result.content[0].text).toContain('no reasoning provided');
  });

  it('sequential reasoning-only amends on multiple proposals all get revised entries', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Build a file mimicking the benchmark: 5 proposals with request-changes
    const content = [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Test Doc',
      '',
      'The API uses {~~REST~>GraphQL~~}[^ct-1] for requests.',
      '',
      'The collector runs as a {~~DaemonSet~>sidecar~~}[^ct-2] on each node.',
      '',
      '{++Added storage info.++}[^ct-3]',
      '',
      '{++Added query targets.++}[^ct-4]',
      '',
      '{~~Old silence policy.~>New silence policy.~~}[^ct-5]',
      '',
      '[^ct-1]: @ai:agent | 2026-02-20 | sub | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Fix consistency"',
      '',
      '[^ct-2]: @ai:agent | 2026-02-20 | sub | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Revert to DaemonSet"',
      '',
      '[^ct-3]: @ai:agent | 2026-02-20 | ins | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Fix the SLA"',
      '',
      '[^ct-4]: @ai:agent | 2026-02-20 | ins | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Fix tier boundaries"',
      '',
      '[^ct-5]: @ai:agent | 2026-02-20 | sub | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Fix silence duration"',
    ].join('\n');
    await fs.writeFile(filePath, content, 'utf-8');

    // Amend ct-1 through ct-3 with text changes
    const r1 = await handleAmendChange(
      { file: filePath, change_id: 'ct-1', new_text: 'gRPC', reason: 'better for internal', author: 'ai:agent' },
      resolver, state
    );
    expect(r1.isError, `ct-1: ${r1.content[0].text}`).toBeUndefined();

    const r2 = await handleAmendChange(
      { file: filePath, change_id: 'ct-2', new_text: 'DaemonSet', reason: 'reverted per reviewer', author: 'ai:agent' },
      resolver, state
    );
    expect(r2.isError, `ct-2: ${r2.content[0].text}`).toBeUndefined();

    const r3 = await handleAmendChange(
      { file: filePath, change_id: 'ct-3', new_text: 'Updated storage info.', reason: 'fixed SLA', author: 'ai:agent' },
      resolver, state
    );
    expect(r3.isError, `ct-3: ${r3.content[0].text}`).toBeUndefined();

    // Amend ct-4 and ct-5 with SAME text (reasoning-only) — this was the bug
    const r4 = await handleAmendChange(
      { file: filePath, change_id: 'ct-4', new_text: 'Added query targets.', reason: 'adding rationale for SLA targets', author: 'ai:agent' },
      resolver, state
    );
    expect(r4.isError, `ct-4 reasoning-only amend should succeed: ${r4.content[0].text}`).toBeUndefined();

    const r5 = await handleAmendChange(
      { file: filePath, change_id: 'ct-5', new_text: 'New silence policy.', reason: 'tightening silence policies', author: 'ai:agent' },
      resolver, state
    );
    expect(r5.isError, `ct-5 reasoning-only amend should succeed: ${r5.content[0].text}`).toBeUndefined();

    // Verify ALL 5 footnotes have revised entries
    const modified = await fs.readFile(filePath, 'utf-8');
    const revisedMatches = modified.match(/revised @/g) ?? [];
    expect(revisedMatches.length).toBe(5);

    // Verify each footnote block individually
    for (let i = 1; i <= 5; i++) {
      const blockStart = modified.indexOf(`[^ct-${i}]:`);
      expect(blockStart, `footnote for ct-${i} should exist`).toBeGreaterThan(-1);
      const nextBlock = modified.indexOf(`[^ct-${i + 1}]:`, blockStart);
      const blockText = nextBlock > -1
        ? modified.slice(blockStart, nextBlock)
        : modified.slice(blockStart);
      expect(blockText, `ct-${i} footnote should have revised entry`).toContain('revised @ai:agent');
    }
  });
});
