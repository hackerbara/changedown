import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changedown/mcp/internals';
import { handleSupersedeChange } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changedown/mcp/internals';

const TODAY = new Date().toISOString().slice(0, 10);

function defaultConfig(overrides?: Partial<ChangeDownConfig>): ChangeDownConfig {
  return {
    tracking: {
      include: ['**/*.md'],
      exclude: ['node_modules/**', 'dist/**'],
      default: 'tracked',
      auto_header: true,
    },
    author: {
      default: 'ai:test',
      enforcement: 'optional',
    },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: false, auto_remap: false },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    ...overrides,
  };
}

describe('handleSupersedeChange', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeDownConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-supersede-test-'));
    state = new SessionState();
    config = defaultConfig();
    resolver = await createTestResolver(tmpDir, config);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('basic supersede: rejects old change and proposes replacement', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    // Propose initial change
    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', reason: 'first try', author: 'ai:test' },
      resolver,
      state
    );

    // Verify initial state
    let content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{~~quick~>slow~~}[^cn-1]');
    expect(content).toContain('| proposed');

    // Supersede the change
    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'fast',
        reason: 'better word choice',
        author: 'ai:test',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.old_change_id).toBe('cn-1');
    expect(data.new_change_id).toBe('cn-2');
    expect(data.supersedes).toBe('cn-1');
    expect(data.type).toBe('sub');

    // Verify file content
    content = await fs.readFile(filePath, 'utf-8');
    // Old change should be rejected (and settled since auto_on_reject is true)
    // New change should be proposed
    expect(content).toContain('{~~quick~>fast~~}[^cn-2]');
    expect(content).toContain('supersedes: cn-1');
    // cn-1 footnote should have rejected status
    expect(content).toMatch(/\[\^cn-1\]:.*\|\s*rejected/);
    // cn-2 footnote should have proposed status
    expect(content).toMatch(/\[\^cn-2\]:.*\|\s*proposed/);
  });

  it('supersede with settlement: rejected markup is compacted', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'ai:test', reason: 'test' },
      resolver,
      state
    );

    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'fast',
        author: 'ai:test',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const content = await fs.readFile(filePath, 'utf-8');
    // With auto_on_reject=true, the old substitution should be settled:
    // {~~quick~>slow~~} rejected => reverted to 'quick'
    // Then the new change targets 'quick' => {~~quick~>fast~~}
    expect(content).toContain('{~~quick~>fast~~}[^cn-2]');
    // The old inline markup should be compacted (settled)
    expect(content).not.toContain('{~~quick~>slow~~}');
  });

  it('supersede without settlement: rejected markup remains inline', async () => {
    const noSettleConfig = defaultConfig({
      settlement: { auto_on_approve: true, auto_on_reject: false },
    });
    const noSettleResolver = await createTestResolver(tmpDir, noSettleConfig);
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'ai:test', reason: 'test' },
      noSettleResolver,
      state
    );

    // When no settlement, the old markup stays. The new change targets text
    // in the file as-is (which still has the old CriticMarkup).
    // The old_text for the new change should be something findable in the settled view.
    // Since settlement is off, the file still has {~~quick~>slow~~}[^cn-1]
    // So we target 'The' (which is plain text) for a different substitution.
    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'brown',
        new_text: 'red',
        reason: 'different target',
        author: 'ai:test',
      },
      noSettleResolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const content = await fs.readFile(filePath, 'utf-8');
    // Old change markup still present (rejected but not settled)
    expect(content).toContain('[^cn-1]');
    // New change present
    expect(content).toContain('{~~brown~>red~~}[^cn-2]');
    expect(content).toContain('supersedes: cn-1');
    // cn-1 status is rejected
    expect(content).toMatch(/\[\^cn-1\]:.*\|\s*rejected/);
  });

  it('error: change_id not found', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-99',
        old_text: 'quick',
        new_text: 'fast',
        author: 'ai:test',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('cn-99');
    expect(result.content[0].text).toContain('not found');
  });

  it('error: change already accepted', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'ai:test', reason: 'test' },
      resolver,
      state
    );

    // Manually set status to accepted
    let content = await fs.readFile(filePath, 'utf-8');
    content = content.replace('| proposed', '| accepted');
    await fs.writeFile(filePath, content);

    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'fast',
        author: 'ai:test',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already accepted');
  });

  it('error: change already rejected', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'ai:test', reason: 'test' },
      resolver,
      state
    );

    // Manually set status to rejected
    let content = await fs.readFile(filePath, 'utf-8');
    content = content.replace('| proposed', '| rejected');
    await fs.writeFile(filePath, content);

    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'fast',
        author: 'ai:test',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already rejected');
  });

  it('error: missing file argument', async () => {
    const result = await handleSupersedeChange(
      {
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'fast',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required argument: "file"');
  });

  it('error: missing change_id argument', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    const result = await handleSupersedeChange(
      {
        file: filePath,
        old_text: 'quick',
        new_text: 'fast',
      },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required argument: "change_id"');
  });

  it('supersede deletion: proposes new deletion', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    // Propose a deletion
    await handleProposeChange(
      { file: filePath, old_text: ' brown', new_text: '', author: 'ai:test', reason: 'test' },
      resolver,
      state
    );

    // Supersede with a different deletion target
    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: ' quick',
        new_text: '',
        author: 'ai:test',
        reason: 'delete different word',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.type).toBe('del');
    expect(data.supersedes).toBe('cn-1');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('{-- quick--}[^cn-2]');
    expect(content).toContain('supersedes: cn-1');
  });

  it('supersede insertion: proposes new insertion', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The fox.');

    // Propose an insertion
    await handleProposeChange(
      { file: filePath, old_text: '', new_text: ' quick', insert_after: 'The', author: 'ai:test', reason: 'test' },
      resolver,
      state
    );

    // Supersede with different insertion
    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: '',
        new_text: ' speedy',
        insert_after: 'The',
        author: 'ai:test',
        reason: 'even better word',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.type).toBe('ins');
    expect(data.supersedes).toBe('cn-1');
  });

  it('document_state reflects correct counts after supersede', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'ai:test', reason: 'test' },
      resolver,
      state
    );

    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'fast',
        author: 'ai:test',
      },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    // cn-1 is rejected, cn-2 is proposed
    expect(data.document_state.proposed).toBe(1);
    expect(data.document_state.rejected).toBe(1);
    expect(data.document_state.total_changes).toBe(2);
  });

  it('supersedes line appears in new footnote', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox.');

    await handleProposeChange(
      { file: filePath, old_text: 'quick', new_text: 'slow', author: 'ai:test', reason: 'test' },
      resolver,
      state
    );

    await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'fast',
        reason: 'improved',
        author: 'ai:test',
      },
      resolver,
      state
    );

    const content = await fs.readFile(filePath, 'utf-8');
    // Find cn-2 footnote block and verify supersedes is right after the header
    const lines = content.split('\n');
    const sc2HeaderIdx = lines.findIndex(l => l.startsWith('[^cn-2]:'));
    expect(sc2HeaderIdx).toBeGreaterThan(-1);
    // The line after the header should be the supersedes line
    expect(lines[sc2HeaderIdx + 1]).toBe('    supersedes: cn-1');
  });

  it('author enforcement: missing author when required returns error', async () => {
    const requiredConfig = defaultConfig({
      author: { default: '', enforcement: 'required' },
    });
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);
    const filePath = path.join(tmpDir, 'doc.md');
    // Write file with an existing proposed change
    await fs.writeFile(
      filePath,
      `The {~~quick~>slow~~}[^cn-1] brown fox.\n\n[^cn-1]: @ai:test | ${TODAY} | sub | proposed\n    @ai:test ${TODAY}: first try`
    );

    const result = await handleSupersedeChange(
      {
        file: filePath,
        change_id: 'cn-1',
        old_text: 'quick',
        new_text: 'fast',
      },
      requiredResolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires an author parameter');
  });
});
