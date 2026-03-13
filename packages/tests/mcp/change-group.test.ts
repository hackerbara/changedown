import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionState } from '@changetracks/mcp/internals';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { handleBeginChangeGroup } from '@changetracks/mcp/internals';
import { handleEndChangeGroup } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changetracks/mcp/internals';

const TODAY = new Date().toISOString().slice(0, 10);
const TS_RE = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z';

// ─── Unit Tests: SessionState group tracking ─────────────────────────

describe('SessionState group tracking', () => {
  let state: SessionState;

  beforeEach(() => {
    state = new SessionState();
  });

  it('beginGroup returns a group ID in ct-N format', () => {
    const groupId = state.beginGroup('Refactor introduction paragraph');
    expect(groupId).toBe('ct-1');
  });

  it('beginGroup is independent of per-file counters (file-local numbering)', () => {
    // Simulate prior usage: file A has used ct-1..ct-5
    const textA = 'File A [^ct-5] content.';
    state.getNextId('/tmp/a.md', textA); // returns ct-6
    // File B has used ct-1..ct-2
    const textB = 'File B [^ct-2] content.';
    state.getNextId('/tmp/b.md', textB); // returns ct-3

    // beginGroup starts from ct-1 (independent of other files)
    const groupId = state.beginGroup('Cross-file refactor');
    expect(groupId).toBe('ct-1');
  });

  it('getNextId returns dotted IDs during active group', () => {
    const groupId = state.beginGroup('Test group');
    expect(groupId).toBe('ct-1');

    const id1 = state.getNextId('/tmp/file.md', 'plain text');
    expect(id1).toBe('ct-1.1');

    const id2 = state.getNextId('/tmp/file.md', 'plain text');
    expect(id2).toBe('ct-1.2');

    const id3 = state.getNextId('/tmp/other.md', 'other text');
    expect(id3).toBe('ct-1.3');
  });

  it('endGroup returns group info with children and files', () => {
    state.beginGroup('My group', 'Because reasons');
    state.getNextId('/tmp/a.md', 'text');
    state.getNextId('/tmp/b.md', 'text');
    state.getNextId('/tmp/a.md', 'text');

    const result = state.endGroup();
    expect(result.id).toBe('ct-1');
    expect(result.childIds).toEqual(['ct-1.1', 'ct-1.2', 'ct-1.3']);
    expect(result.files).toContain('/tmp/a.md');
    expect(result.files).toContain('/tmp/b.md');
    expect(result.files).toHaveLength(2);
  });

  it('endGroup throws when no active group', () => {
    expect(() => state.endGroup()).toThrow(/no active/i);
  });

  it('beginGroup throws when a group is already active', () => {
    state.beginGroup('First group');
    expect(() => state.beginGroup('Second group')).toThrow(/already active/i);
  });

  it('hasActiveGroup returns correct state', () => {
    expect(state.hasActiveGroup()).toBe(false);
    state.beginGroup('Test');
    expect(state.hasActiveGroup()).toBe(true);
    state.endGroup();
    expect(state.hasActiveGroup()).toBe(false);
  });

  it('getActiveGroup returns group info when active', () => {
    expect(state.getActiveGroup()).toBeNull();
    state.beginGroup('My description', 'My reasoning');
    const group = state.getActiveGroup();
    expect(group).not.toBeNull();
    expect(group!.id).toBe('ct-1');
    expect(group!.description).toBe('My description');
    expect(group!.reasoning).toBe('My reasoning');
  });

  it('after endGroup, getNextId returns normal IDs (not dotted)', () => {
    state.beginGroup('Temporary group');
    state.getNextId('/tmp/file.md', 'text'); // ct-1.1
    state.endGroup();

    // Next ID should be ct-2 (the group consumed ct-1)
    const nextId = state.getNextId('/tmp/file.md', 'text');
    expect(nextId).toBe('ct-2');
  });

  it('after endGroup, a new group starts from 1 (file-local numbering)', () => {
    // File-local numbering means groups don't coordinate across files
    state.beginGroup('Group A');
    expect(state.getActiveGroup()!.id).toBe('ct-1');
    state.getNextId('/tmp/file.md', 'text'); // ct-1.1
    state.endGroup();

    // Next group also starts from 1 unless knownMaxId is provided
    state.beginGroup('Group B');
    expect(state.getActiveGroup()!.id).toBe('ct-1');
    state.endGroup();

    // To avoid collision, pass knownMaxId from the files you'll edit:
    const fileText = 'Text [^ct-1] here.'; // File already has ct-1 from Group A
    const knownMax = 1; // Scanned from files to be edited
    const groupId = state.beginGroup('Group C', undefined, knownMax);
    expect(groupId).toBe('ct-2'); // Starts after knownMax
  });

  it('group IDs use knownMaxId to avoid collision with file IDs', () => {
    // File has ct-10 already in text
    const text = 'Text [^ct-10] and [^ct-3] here.';

    // Pass knownMaxId=10 (scanned from the file we're about to edit)
    const groupId = state.beginGroup('Group', undefined, 10);
    expect(groupId).toBe('ct-11'); // knownMaxId + 1

    const childId = state.getNextId('/tmp/file.md', text);
    expect(childId).toBe('ct-11.1');
  });

  it('per-file counter is updated to at least the group parent ID', () => {
    // Start a group
    state.beginGroup('Group');
    // Get a child ID for a fresh file
    state.getNextId('/tmp/fresh.md', 'no ids here'); // ct-1.1
    state.endGroup();

    // Now, the file's counter should be at least 1 (the group ID)
    // So next non-group ID for this file should be ct-2, not ct-1
    const nextId = state.getNextId('/tmp/fresh.md', 'no ids here');
    expect(nextId).toBe('ct-2');
  });
});

// ─── Integration Tests: Tool handlers ─────────────────────────────────

describe('handleBeginChangeGroup', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-begin-group-test-'));
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

  it('returns group_id on success (empty project)', async () => {
    const result = await handleBeginChangeGroup(
      { description: 'Refactor introduction' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.group_id).toBe('ct-1');
  });

  it('returns group_id with reasoning', async () => {
    const result = await handleBeginChangeGroup(
      { description: 'Fix typos', reason: 'Multiple spelling errors found' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.group_id).toBe('ct-1');
  });

  it('file-local numbering: does not scan existing files', async () => {
    // Create a file with existing ct-5 and ct-5.1 footnotes
    const filePath = path.join(tmpDir, 'existing.md');
    await fs.writeFile(filePath, [
      'Some text {~~old~>new~~}[^ct-5.1]',
      '',
      '[^ct-5]: @author | 2026-01-01 | group | proposed',
      '[^ct-5.1]: @author | 2026-01-01 | sub | proposed',
    ].join('\n'));

    const result = await handleBeginChangeGroup(
      { description: 'New group after existing IDs' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    // With file-local numbering, always starts from ct-1 (no project scan)
    expect(data.group_id).toBe('ct-1');
  });

  it('file-local numbering: each group is independent', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), 'Text [^ct-3] here.');
    await fs.writeFile(path.join(tmpDir, 'b.md'), 'Text [^ct-8] here.');
    await fs.writeFile(path.join(tmpDir, 'c.md'), 'Text [^ct-2] here.');

    const result = await handleBeginChangeGroup(
      { description: 'Cross-file group' },
      resolver,
      state
    );

    const data = JSON.parse(result.content[0].text);
    // No cross-file scanning - each group starts from ct-1
    expect(data.group_id).toBe('ct-1');
  });

  it('no scanning behavior: ignores all files in project', async () => {
    // Create files with existing IDs
    await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'Text [^ct-100] here.');
    await fs.writeFile(path.join(tmpDir, 'doc.md'), 'Text [^ct-3] here.');

    const result = await handleBeginChangeGroup(
      { description: 'File-local numbering' },
      resolver,
      state
    );

    const data = JSON.parse(result.content[0].text);
    // No scanning - always ct-1
    expect(data.group_id).toBe('ct-1');
  });

  it('returns error when description is missing', async () => {
    const result = await handleBeginChangeGroup(
      {},
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/description/i);
  });

  it('returns error when a group is already active', async () => {
    await handleBeginChangeGroup(
      { description: 'First group' },
      resolver,
      state
    );

    const result = await handleBeginChangeGroup(
      { description: 'Second group' },
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/already active/i);
  });
});

describe('handleEndChangeGroup', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-group-test-'));
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

  it('returns error when no group is active', async () => {
    const result = await handleEndChangeGroup(
      {},
      resolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/no active/i);
  });

  it('ends group and appends parent footnote to the first file', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    // Begin group
    await handleBeginChangeGroup(
      { description: 'Fix greeting' },
      resolver,
      state
    );

    // Make a change in the group
    await handleProposeChange(
      { file: filePath, old_text: 'Hello', new_text: 'Hi' },
      resolver,
      state
    );

    // End group
    const result = await handleEndChangeGroup(
      {},
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.group_id).toBe('ct-1');
    expect(data.children).toEqual(['ct-1.1']);
    expect(data.files).toHaveLength(1);

    // Verify parent footnote was written to disk
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | group | proposed`);
    expect(modified).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE}: Fix greeting`));
  });

  it('ends group with summary appended to reason', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    await handleBeginChangeGroup(
      { description: 'Fix greeting', reason: 'Tone too formal' },
      resolver,
      state
    );

    await handleProposeChange(
      { file: filePath, old_text: 'Hello', new_text: 'Hi' },
      resolver,
      state
    );

    const result = await handleEndChangeGroup(
      { summary: 'Changed 1 greeting' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Parent footnote should have discussion comment with description + summary
    expect(modified).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE}: Fix greeting`));
    expect(modified).toContain('summary: Changed 1 greeting');
  });

  it('handles group with no children (empty group)', async () => {
    await handleBeginChangeGroup(
      { description: 'Empty group' },
      resolver,
      state
    );

    const result = await handleEndChangeGroup(
      {},
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.group_id).toBe('ct-1');
    expect(data.children).toEqual([]);
    expect(data.files).toEqual([]);
    // No parent footnote written (no files to write to)
  });

  it('uses explicit author parameter when provided', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    await handleBeginChangeGroup(
      { description: 'Fix greeting' },
      resolver,
      state
    );

    await handleProposeChange(
      { file: filePath, old_text: 'Hello', new_text: 'Hi' },
      resolver,
      state
    );

    const result = await handleEndChangeGroup(
      { author: 'ai:claude-sonnet-4.5' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Parent footnote should use explicit author, not config default
    expect(modified).toContain(`[^ct-1]: @ai:claude-sonnet-4.5 | ${TODAY} | group | proposed`);
    // The child footnote will still have the default author from propose_change
    const lines = modified.split('\n');
    const parentFootnote = lines.find(l => l.startsWith('[^ct-1]:'));
    expect(parentFootnote).toContain('@ai:claude-sonnet-4.5');
  });

  it('uses config default author when author parameter is omitted', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    await handleBeginChangeGroup(
      { description: 'Fix greeting' },
      resolver,
      state
    );

    await handleProposeChange(
      { file: filePath, old_text: 'Hello', new_text: 'Hi' },
      resolver,
      state
    );

    const result = await handleEndChangeGroup(
      {},
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Should use config default
    expect(modified).toContain(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | group | proposed`);
  });

  it('appends group footnote after existing footnote without corrupting summary (appendFootnote separator bug)', async () => {
    // Reproduce: existing footnote with indented summary line; end_change_group with summary.
    // Bug: new footnote summary was merged into last line of previous (e.g. "trialaks for plugin trial").
    const filePath = path.join(tmpDir, 'doc.md');
    const existingContent = [
      'Some text {++added++}[^ct-5] here.',
      '',
      '[^ct-5]: @alice | 2026-02-10 | ins | proposed',
      '    summary: Plugin trial',
    ].join('\n');
    await fs.writeFile(filePath, existingContent);

    await handleBeginChangeGroup(
      { description: 'Two table header tweaks', reason: 'Headers need tweaks' },
      resolver,
      state
    );

    await handleProposeChange(
      { file: filePath, old_text: 'Some', new_text: 'Other' },
      resolver,
      state
    );

    const result = await handleEndChangeGroup(
      { summary: 'Two table header tweaks for plugin trial' },
      resolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    // Previous footnote's last line must not be merged with the new one: blank line then a footnote.
    const lastLineOfFirst = '    summary: Plugin trial';
    const idx = modified.indexOf(lastLineOfFirst);
    expect(idx).not.toBe(-1);
    const afterFirstFootnote = modified.slice(idx + lastLineOfFirst.length);
    // Must have blank line(s) then a footnote definition (ct-1.1 child or ct-1 group), not "aks" from "tweaks"
    expect(afterFirstFootnote).toMatch(/^\s*\n+\s*\[\^ct-/);
    // New group footnote summary must be intact (not "trialaks for plugin trial").
    expect(modified).toContain('summary: Two table header tweaks for plugin trial');
    expect(modified).not.toContain('trialaks');
  });

  // ─── Author enforcement ─────────────────────────────────────────────

  it('enforcement=required without author returns error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    await handleBeginChangeGroup(
      { description: 'Fix greeting' },
      resolver,
      state
    );

    await handleProposeChange(
      { file: filePath, old_text: 'Hello', new_text: 'Hi' },
      resolver,
      state
    );

    const requiredConfig: ChangeTracksConfig = {
      ...config,
      author: { default: 'ai:claude-opus-4.6', enforcement: 'required' },
    };
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

    // Capture file content before attempting end_change_group
    const beforeContent = await fs.readFile(filePath, 'utf-8');

    const result = await handleEndChangeGroup(
      {},
      requiredResolver,
      state
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires an author parameter');

    // File must NOT have the parent footnote added
    const afterContent = await fs.readFile(filePath, 'utf-8');
    expect(afterContent).toBe(beforeContent);

    // Group must still be active — retry with author should succeed
    const retryResult = await handleEndChangeGroup(
      { author: 'ai:claude-sonnet-4.5' },
      requiredResolver,
      state
    );
    expect(retryResult.isError).toBeUndefined();
    const retryContent = await fs.readFile(filePath, 'utf-8');
    expect(retryContent).toContain('[^ct-1]:');
  });

  it('enforcement=required with author succeeds', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'Hello world.');

    await handleBeginChangeGroup(
      { description: 'Fix greeting' },
      resolver,
      state
    );

    await handleProposeChange(
      { file: filePath, old_text: 'Hello', new_text: 'Hi' },
      resolver,
      state
    );

    const requiredConfig: ChangeTracksConfig = {
      ...config,
      author: { default: 'ai:claude-opus-4.6', enforcement: 'required' },
    };
    const requiredResolver = await createTestResolver(tmpDir, requiredConfig);

    const result = await handleEndChangeGroup(
      { author: 'ai:claude-sonnet-4.5' },
      requiredResolver,
      state
    );

    expect(result.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain(`[^ct-1]: @ai:claude-sonnet-4.5 | ${TODAY} | group | proposed`);
  });
});

// ─── Full Integration: begin_group + propose_change + end_group ──────

describe('full change group integration', () => {
  let tmpDir: string;
  let state: SessionState;
  let config: ChangeTracksConfig;
  let resolver: ConfigResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-full-group-test-'));
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

  it('multiple changes in a group produce dotted IDs and a parent footnote', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'The quick brown fox jumps over the lazy dog.');

    // Begin group
    const beginResult = await handleBeginChangeGroup(
      { description: 'Improve animal descriptions' },
      resolver,
      state
    );
    const beginData = JSON.parse(beginResult.content[0].text);
    expect(beginData.group_id).toBe('ct-1');

    // First change: substitution
    const change1 = await handleProposeChange(
      { file: filePath, old_text: 'quick brown', new_text: 'slow red' },
      resolver,
      state
    );
    const data1 = JSON.parse(change1.content[0].text);
    expect(data1.change_id).toBe('ct-1.1');

    // Second change: substitution
    const change2 = await handleProposeChange(
      { file: filePath, old_text: 'lazy', new_text: 'energetic' },
      resolver,
      state
    );
    const data2 = JSON.parse(change2.content[0].text);
    expect(data2.change_id).toBe('ct-1.2');

    // End group
    const endResult = await handleEndChangeGroup(
      { summary: 'Changed 2 animal adjectives' },
      resolver,
      state
    );
    const endData = JSON.parse(endResult.content[0].text);
    expect(endData.group_id).toBe('ct-1');
    expect(endData.children).toEqual(['ct-1.1', 'ct-1.2']);

    // Verify file content
    const modified = await fs.readFile(filePath, 'utf-8');

    // Inline markup uses dotted IDs
    expect(modified).toContain('{~~quick brown~>slow red~~}[^ct-1.1]');
    expect(modified).toContain('{~~lazy~>energetic~~}[^ct-1.2]');

    // Child footnotes use dotted IDs
    expect(modified).toContain(`[^ct-1.1]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`);
    expect(modified).toContain(`[^ct-1.2]: @ai:claude-opus-4.6 | ${TODAY} | sub | proposed`);

    // Parent footnote exists
    expect(modified).toContain(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | group | proposed`);
    expect(modified).toMatch(new RegExp(`@ai:claude-opus-4.6 ${TS_RE}: Improve animal descriptions`));
    expect(modified).toContain('summary: Changed 2 animal adjectives');
  });

  it('changes after endGroup use normal IDs again', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'First sentence. Second sentence.');

    // Group with one change
    await handleBeginChangeGroup(
      { description: 'Fix first sentence' },
      resolver,
      state
    );
    await handleProposeChange(
      { file: filePath, old_text: 'First', new_text: 'Modified first' },
      resolver,
      state
    );
    await handleEndChangeGroup({}, resolver, state);

    // Re-read file after group changes
    const afterGroup = await fs.readFile(filePath, 'utf-8');

    // Now make a non-grouped change (re-read the file since it was modified)
    const change = await handleProposeChange(
      { file: filePath, old_text: 'Second', new_text: 'Another' },
      resolver,
      state
    );
    const data = JSON.parse(change.content[0].text);
    // Group consumed ct-1 (parent), child was ct-1.1.
    // After group, next normal ID should be ct-2
    expect(data.change_id).toBe('ct-2');
  });

  it('multi-file group: changes across files share the same group parent', async () => {
    const fileA = path.join(tmpDir, 'a.md');
    const fileB = path.join(tmpDir, 'b.md');
    await fs.writeFile(fileA, 'Content in file A.');
    await fs.writeFile(fileB, 'Content in file B.');

    await handleBeginChangeGroup(
      { description: 'Cross-file refactor' },
      resolver,
      state
    );

    const changeA = await handleProposeChange(
      { file: fileA, old_text: 'Content', new_text: 'Updated content' },
      resolver,
      state
    );
    expect(JSON.parse(changeA.content[0].text).change_id).toBe('ct-1.1');

    const changeB = await handleProposeChange(
      { file: fileB, old_text: 'Content', new_text: 'Updated content' },
      resolver,
      state
    );
    expect(JSON.parse(changeB.content[0].text).change_id).toBe('ct-1.2');

    const endResult = await handleEndChangeGroup({}, resolver, state);
    const endData = JSON.parse(endResult.content[0].text);
    expect(endData.files).toHaveLength(2);
    expect(endData.files).toContain(fileA);
    expect(endData.files).toContain(fileB);

    // Parent footnote should be written to the first file in the group
    const modifiedA = await fs.readFile(fileA, 'utf-8');
    expect(modifiedA).toContain(`[^ct-1]: @ai:claude-opus-4.6 | ${TODAY} | group | proposed`);
  });
});
