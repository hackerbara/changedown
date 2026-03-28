import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changedown/mcp/internals';
import { handleAmendChange } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changedown/mcp/internals';

const TODAY = new Date().toISOString().slice(0, 10);

function defaultConfig(overrides?: Partial<ChangeDownConfig['author']>): ChangeDownConfig {
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
  let config: ChangeDownConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-amend-test-'));
    state = new SessionState();
    config = defaultConfig();
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('amend substitution: supersedes original and creates new change', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'first proposal' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast', reason: 'typo fix' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1');
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);
    expect(data.new_text).toBe('fast');

    const modified = await fs.readFile(filePath, 'utf-8');
    // New change proposes the amended text
    expect(modified).toContain('{~~quick~>fast~~}');
    expect(modified).toContain(`[^${data.new_change_id}]`);
    // Original change is rejected with superseded-by cross-reference
    expect(modified).toContain('| rejected');
    expect(modified).toContain(`superseded-by: ${data.new_change_id}`);
    // New change has supersedes cross-reference
    expect(modified).toContain(`supersedes: cn-1`);
  });

  it('amend insertion: supersedes original and creates new insertion', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: '', new_text: ' brown', insert_after: 'quick', reason: 'test' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: ' red', reason: 'better word' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);
    expect(data.new_text).toBe(' red');

    const modified = await fs.readFile(filePath, 'utf-8');
    // New insertion with amended text
    expect(modified).toContain('{++ red++}');
    expect(modified).toContain(`[^${data.new_change_id}]`);
    // Original is rejected
    expect(modified).toContain('| rejected');
    expect(modified).toContain(`supersedes: cn-1`);
  });

  it('amend comment: supersedes original and creates new comment', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      `Line one.\n\n{>>old note<<}[^cn-1]\n\n[^cn-1]: @ai:claude-opus-4.6 | ${TODAY} | com | proposed`
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'updated note', reason: 'clarified' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    // Original comment is rejected, new one created
    expect(modified).toContain('| rejected');
    expect(modified).toContain(`supersedes: cn-1`);
  });

  it('deletion: amend with empty new_text supersedes and creates new deletion', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');
    await handleProposeChange(
      { file: filePath, old_text: ' brown', new_text: '', reason: 'remove extra' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: '', reason: 'actually for consistency' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    // Original rejected, new deletion proposed
    expect(modified).toContain('| rejected');
    expect(modified).toContain(`supersedes: cn-1`);
  });

  it('deletion: amend with new_text supersedes deletion with substitution', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');
    await handleProposeChange(
      { file: filePath, old_text: ' brown', new_text: '', reason: 'test' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: ' something', reason: 'test' },
      resolver
    );

    // With supersede logic, providing new_text to a former deletion is valid —
    // it rejects the deletion and proposes a new substitution
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('| rejected');
    expect(modified).toContain(`supersedes: cn-1`);
  });

  it('same-author enforced: different author returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'human:alice', reason: 'test' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast', author: 'human:bob', reason: 'test' },
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
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'test' },
      resolver,
      state
    );
    const content = await fs.readFile(filePath, 'utf-8');
    await fs.writeFile(
      filePath,
      content.replace('| proposed', '| accepted')
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast', reason: 'test' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already accepted');
  });

  it('status must be proposed: amend rejected change returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'test' },
      resolver,
      state
    );
    const content = await fs.readFile(filePath, 'utf-8');
    await fs.writeFile(
      filePath,
      content.replace('| proposed', '| rejected')
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast', reason: 'test' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already rejected');
  });

  it('change not found returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-99', new_text: 'fast', reason: 'test' },
      resolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Change "cn-99" not found in file.');
  });

  it('new_text identical to current still supersedes (no identical-text guard)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'test' },
      resolver,
      state
    );

    // With supersede logic, identical new_text is still valid — it rejects the
    // original and creates a new change with the same text
    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'slow', reason: 'test' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);
  });

  it('footnote preserves discussion: original footnote has rejection and superseded-by', async () => {
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
    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast', reason: 'typo' },
      resolver
    );
    const data = JSON.parse(result.content[0].text);
    const after = await fs.readFile(filePath, 'utf-8');
    // Original footnote is rejected with superseded-by cross-reference
    expect(after).toContain('[^cn-1]:');
    expect(after).toContain('| rejected');
    expect(after).toContain(`superseded-by: ${data.new_change_id}`);
    // New footnote has supersedes cross-reference
    expect(after).toContain(`[^${data.new_change_id}]:`);
    expect(after).toContain('supersedes: cn-1');
  });

  it('multiple amends: each supersede creates a new change', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'test' },
      resolver,
      state
    );
    const r1 = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast', reason: 'first' },
      resolver
    );
    const d1 = JSON.parse(r1.content[0].text);
    expect(d1.new_change_id).toBeDefined();

    // Second amend targets the NEW change (cn-2), not the already-rejected cn-1
    const r2 = await handleAmendChange(
      { file: filePath, change_id: d1.new_change_id, new_text: 'swift', reason: 'second' },
      resolver
    );
    const d2 = JSON.parse(r2.content[0].text);
    expect(d2.new_change_id).toBeDefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Final change proposes 'swift'
    expect(modified).toContain('{~~quick~>swift~~}');
    // Both cn-1 and cn-2 are rejected (superseded)
    expect(modified).toContain('superseded-by:');
    expect(modified).toContain('supersedes:');
  });

  it('amends a dotted group member by ID (supersede path)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    const content = [
      'Hello {~~old~>new~~}[^cn-1.1]',
      '',
      '[^cn-1.1]: @ai:test-model | 2026-03-04 | sub | proposed',
      '    @ai:test-model 2026-03-04: original reason',
    ].join('\n');
    await fs.writeFile(filePath, content);

    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'cn-1.1',
        new_text: 'newer',
        author: 'ai:test-model',
        reason: 'updated text',
      },
      resolver,
      state
    );

    expect(result.isError, `Expected success but got: ${JSON.stringify(result)}`).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.change_id).toBe('cn-1.1');
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    // New change with the amended text
    expect(modified).toContain('{~~old~>newer~~}');
    // Original is rejected with superseded-by cross-reference
    expect(modified).toContain('| rejected');
    expect(modified).toContain(`superseded-by: ${data.new_change_id}`);
    expect(modified).toContain('supersedes: cn-1.1');
  });

  it('grouped change: amend cn-5.2 supersedes child only, parent unchanged', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(
      filePath,
      'A {~~one~>uno~~}[^cn-5] B {~~two~>dos~~}[^cn-5.2]\n\n[^cn-5]: @human:alice | 2026-01-01 | sub | proposed\n[^cn-5.2]: @human:alice | 2026-01-01 | sub | proposed'
    );
    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-5.2', new_text: 'deux', reason: 'French', author: 'human:alice' },
      resolver
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    const modified = await fs.readFile(filePath, 'utf-8');
    // Parent cn-5 unchanged
    expect(modified).toContain('{~~one~>uno~~}[^cn-5]');
    // Child cn-5.2 superseded, new change proposes 'deux'
    expect(modified).toContain('{~~two~>deux~~}');
    expect(modified).toContain(`supersedes: cn-5.2`);
  });

  it('expands substitution scope via old_text parameter (supersede path)', async () => {
    const content = [
      '<!-- changedown.com/v1: tracked -->',
      '# Test',
      'Rate limiting from between 10-20 {~~milliseconds~>milliseconds~~}[^cn-1] per request.',
      '',
      '[^cn-1]: @ai:test-agent | 2026-02-25 | sub | proposed',
      '    @ai:test-agent 2026-02-25: audit marker',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'from between 10-20 milliseconds',
        new_text: 'from 10-20 ms',
        author: 'ai:test-agent',
        reason: 'test',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);

    const modified = await fs.readFile(filePath, 'utf-8');
    // New change with expanded scope
    expect(modified).toContain('{~~from between 10-20 milliseconds~>from 10-20 ms~~}');
    expect(modified).toContain(`[^${data.new_change_id}]`);
    // Original rejected and cross-referenced
    expect(modified).toContain('supersedes: cn-1');
  });

  it('rejects scope expansion when old_text not found in document after rejection', async () => {
    const content = [
      '<!-- changedown.com/v1: tracked -->',
      '# Test',
      'The API uses {~~REST~>GraphQL~~}[^cn-1] for requests.',
      '',
      '[^cn-1]: @ai:test-agent | 2026-02-25 | sub | proposed',
      '    @ai:test-agent 2026-02-25: paradigm',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'completely different text',
        new_text: 'gRPC',
        author: 'ai:test-agent',
        reason: 'test',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });

  it('scope expansion on insertion: supersede rejects insertion then proposes substitution', async () => {
    const content = [
      '<!-- changedown.com/v1: tracked -->',
      '# Test',
      'The quick{++ brown++}[^cn-1] fox.',
      '',
      '[^cn-1]: @ai:test-agent | 2026-02-25 | ins | proposed',
      '    @ai:test-agent 2026-02-25: add word',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content, 'utf-8');

    // With supersede, amending an insertion with old_text is valid:
    // the insertion is rejected (reverted), then a new substitution is proposed
    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'red',
        author: 'ai:test-agent',
        reason: 'test',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    // New substitution proposed
    expect(modified).toContain('{~~quick~>red~~}');
    // Original insertion rejected
    expect(modified).toContain('supersedes: cn-1');
  });

  it('scope expansion: context mismatch returns not-found error', async () => {
    const content = [
      '<!-- changedown.com/v1: tracked -->',
      '# Test',
      'The API uses {~~REST~>GraphQL~~}[^cn-1] for requests.',
      '',
      '[^cn-1]: @ai:test-agent | 2026-02-25 | sub | proposed',
      '    @ai:test-agent 2026-02-25: paradigm',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content, 'utf-8');

    // old_text contains 'REST' but the surrounding context doesn't match the document
    const result = await handleAmendChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'XYZ REST ABC',
        new_text: 'gRPC',
        author: 'ai:test-agent',
        reason: 'test',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    // After rejection, the body has 'REST' but not 'XYZ REST ABC'
    expect(result.content[0].text).toMatch(/not found/i);
  });

  it('CriticMarkup in new_text: supersede path does not block (no delimiter guard)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'test' },
      resolver,
      state
    );

    // With supersede logic, the CriticMarkup delimiter guard is no longer
    // enforced at the amend handler level. The supersede proceeds.
    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast {++nested++}', reason: 'test' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);
  });

  it('author enforcement required: amend without author when required returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'human:alice', reason: 'test' },
      resolver,
      state
    );
    const requiredConfig = defaultConfig({ enforcement: 'required' });
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast', reason: 'test' },
      requiredResolver
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires an author parameter');
  });

  it('preserves other changes: amend one leaves the other untouched', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'test' },
      resolver,
      state
    );
    await handleProposeChange(
      { file: filePath, old_text: 'brown', new_text: 'red', reason: 'test' },
      resolver,
      state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'fast', reason: 'test' },
      resolver
    );
    const data = JSON.parse(result.content[0].text);

    const modified = await fs.readFile(filePath, 'utf-8');
    // New change with 'fast' (supersedes cn-1)
    expect(modified).toContain('{~~quick~>fast~~}');
    expect(modified).toContain(`[^${data.new_change_id}]`);
    // cn-2 untouched
    expect(modified).toContain('{~~brown~>red~~}[^cn-2]');
  });

  it('sequential amend of 5 proposals: each supersede creates new change', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Word1 Word2 Word3 Word4 Word5 end.');
    // Create 5 proposals (cn-1 through cn-5)
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

    // Amend all 5 sequentially — each creates a new change
    const newIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const result = await handleAmendChange(
        { file: filePath, change_id: `cn-${i}`, new_text: `Amended${i}`, reason: `amend reason ${i}` },
        resolver, state
      );
      expect(result.isError, `cn-${i} amend should succeed but got: ${result.content[0].text}`).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.new_change_id).toBeDefined();
      newIds.push(data.new_change_id);
    }

    const modified = await fs.readFile(filePath, 'utf-8');

    // All 5 new changes should have the amended inline markup
    for (let i = 1; i <= 5; i++) {
      expect(modified).toContain(`{~~Word${i}~>Amended${i}~~}`);
    }

    // All 5 original changes should be rejected with superseded-by
    for (let i = 0; i < 5; i++) {
      expect(modified).toContain(`superseded-by: ${newIds[i]}`);
    }

    // All 5 new changes should have supersedes cross-references
    for (let i = 1; i <= 5; i++) {
      expect(modified).toContain(`supersedes: cn-${i}`);
    }
  });

  it('reasoning-only amend for substitution: same new_text still supersedes', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'initial' },
      resolver, state
    );

    // With supersede logic, even same text creates a new change
    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'slow', reason: 'updated reasoning only' },
      resolver
    );

    expect(result.isError, `amend should succeed but got: ${result.content[0].text}`).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.amended).toBe(true);
    expect(data.new_change_id).toBeDefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // New change proposes the same text
    expect(modified).toContain('{~~quick~>slow~~}');
    // Original is rejected
    expect(modified).toContain('| rejected');
    expect(modified).toContain('supersedes: cn-1');
  });

  it('reasoning-only amend for insertion: same new_text still supersedes', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: '', new_text: ' brown', insert_after: 'quick', reason: 'test' },
      resolver, state
    );

    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: ' brown', reason: 'adding rationale for the addition' },
      resolver
    );

    expect(result.isError, `amend should succeed but got: ${result.content[0].text}`).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);

    const modified = await fs.readFile(filePath, 'utf-8');
    // New insertion with the same text
    expect(modified).toContain('{++ brown++}');
    // Original is rejected
    expect(modified).toContain('supersedes: cn-1');
  });

  it('same-text amend without reasoning: supersede still proceeds', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick fox.');
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'test' },
      resolver, state
    );

    // With supersede, same text without reasoning is no longer an error
    const result = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'slow' },
      resolver
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.new_change_id).toBeDefined();
    expect(data.amended).toBe(true);
  });

  it('sequential amends on multiple proposals: each supersede creates new change with cross-references', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    // Build a file mimicking the benchmark: 5 proposals with request-changes
    const content = [
      '<!-- changedown.com/v1: tracked -->',
      '# Test Doc',
      '',
      'The API uses {~~REST~>GraphQL~~}[^cn-1] for requests.',
      '',
      'The collector runs as a {~~DaemonSet~>sidecar~~}[^cn-2] on each node.',
      '',
      '{++Added storage info.++}[^cn-3]',
      '',
      '{++Added query targets.++}[^cn-4]',
      '',
      '{~~Old silence policy.~>New silence policy.~~}[^cn-5]',
      '',
      '[^cn-1]: @ai:agent | 2026-02-20 | sub | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Fix consistency"',
      '',
      '[^cn-2]: @ai:agent | 2026-02-20 | sub | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Revert to DaemonSet"',
      '',
      '[^cn-3]: @ai:agent | 2026-02-20 | ins | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Fix the SLA"',
      '',
      '[^cn-4]: @ai:agent | 2026-02-20 | ins | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Fix tier boundaries"',
      '',
      '[^cn-5]: @ai:agent | 2026-02-20 | sub | proposed',
      '    request-changes: @human:reviewer 2026-02-22 "Fix silence duration"',
    ].join('\n');
    await fs.writeFile(filePath, content, 'utf-8');

    // Amend all 5 — each supersede rejects the original and creates a new change
    const newIds: string[] = [];

    const r1 = await handleAmendChange(
      { file: filePath, change_id: 'cn-1', new_text: 'gRPC', reason: 'better for internal', author: 'ai:agent' },
      resolver, state
    );
    expect(r1.isError, `cn-1: ${r1.content[0].text}`).toBeUndefined();
    newIds.push(JSON.parse(r1.content[0].text).new_change_id);

    const r2 = await handleAmendChange(
      { file: filePath, change_id: 'cn-2', new_text: 'DaemonSet', reason: 'reverted per reviewer', author: 'ai:agent' },
      resolver, state
    );
    expect(r2.isError, `cn-2: ${r2.content[0].text}`).toBeUndefined();
    newIds.push(JSON.parse(r2.content[0].text).new_change_id);

    const r3 = await handleAmendChange(
      { file: filePath, change_id: 'cn-3', new_text: 'Updated storage info.', reason: 'fixed SLA', author: 'ai:agent' },
      resolver, state
    );
    expect(r3.isError, `cn-3: ${r3.content[0].text}`).toBeUndefined();
    newIds.push(JSON.parse(r3.content[0].text).new_change_id);

    // Same text amends (reasoning-only in old model, full supersede in new model)
    const r4 = await handleAmendChange(
      { file: filePath, change_id: 'cn-4', new_text: 'Added query targets.', reason: 'adding rationale for SLA targets', author: 'ai:agent' },
      resolver, state
    );
    expect(r4.isError, `cn-4 amend should succeed: ${r4.content[0].text}`).toBeUndefined();
    newIds.push(JSON.parse(r4.content[0].text).new_change_id);

    const r5 = await handleAmendChange(
      { file: filePath, change_id: 'cn-5', new_text: 'New silence policy.', reason: 'tightening silence policies', author: 'ai:agent' },
      resolver, state
    );
    expect(r5.isError, `cn-5 amend should succeed: ${r5.content[0].text}`).toBeUndefined();
    newIds.push(JSON.parse(r5.content[0].text).new_change_id);

    const modified = await fs.readFile(filePath, 'utf-8');

    // All 5 originals should be rejected with superseded-by cross-references
    for (let i = 0; i < 5; i++) {
      expect(modified).toContain(`superseded-by: ${newIds[i]}`);
      expect(modified).toContain(`supersedes: cn-${i + 1}`);
    }

    // All 5 new changes should have proposed status
    for (const id of newIds) {
      expect(modified).toContain(`[^${id}]:`);
    }
  });
});
