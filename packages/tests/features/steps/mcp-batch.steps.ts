/**
 * Step definitions for O8 (Batch Operations) feature file.
 *
 * Covers: batch propose with dotted IDs, per-change reasoning, shared reasoning,
 * coordinate adjustment, batch review, and partial batch review.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeTracksWorld } from './world.js';

const MULTI_PARA = `# Specification

The system uses alpha encoding for data.
The interface supports beta mode by default.
All outputs pass through gamma filtering.`;

// =============================================================================
// O8: Background — tracked file with several paragraphs
// =============================================================================

Given(
  'a tracked file {string} with several paragraphs',
  async function (this: ChangeTracksWorld, name: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = await this.ctx.createFile(name, MULTI_PARA);
    this.files.set(name, filePath);
  },
);

// =============================================================================
// O8: When steps — batch propose
// =============================================================================

When(
  'I call propose_change with a changes array of {int} items',
  async function (this: ChangeTracksWorld, count: number) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');

    const changes = [
      { old_text: 'alpha', new_text: 'ALPHA', reason: 'capitalize 1' },
      { old_text: 'beta', new_text: 'BETA', reason: 'capitalize 2' },
      { old_text: 'gamma', new_text: 'GAMMA', reason: 'capitalize 3' },
    ].slice(0, count);

    try {
      this.lastResult = await this.ctx.propose(filePath, {
        changes,
        reason: 'batch capitalize',
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call propose_change with changes array where each has reasoning',
  async function (this: ChangeTracksWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    try {
      this.lastResult = await this.ctx.propose(filePath, {
        changes: [
          { old_text: 'alpha', new_text: 'ALPHA', reason: 'reason-for-alpha' },
          { old_text: 'beta', new_text: 'BETA', reason: 'reason-for-beta' },
        ],
        reason: 'batch edit',
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call propose_change with top-level reasoning and changes array',
  async function (this: ChangeTracksWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    try {
      this.lastResult = await this.ctx.propose(filePath, {
        changes: [
          { old_text: 'alpha', new_text: 'ALPHA' },
          { old_text: 'beta', new_text: 'BETA' },
        ],
        reason: 'capitalize for emphasis',
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call propose_change with a changes array where item 1 shifts line numbers',
  async function (this: ChangeTracksWorld) {
    if (!this.ctx) await this.setupContext();
    // Use content where the first change adds lines
    const content = `# Doc\n\nFirst paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.`;
    const filePath = await this.ctx.createFile('spec.md', content);
    this.files.set('spec.md', filePath);

    try {
      this.lastResult = await this.ctx.propose(filePath, {
        changes: [
          { old_text: 'First paragraph here.', new_text: 'First paragraph revised.\nWith an extra line.', reason: 'expand first' },
          { old_text: 'Second paragraph here.', new_text: 'Second paragraph revised.', reason: 'update second' },
          { old_text: 'Third paragraph here.', new_text: 'Third paragraph revised.', reason: 'update third' },
        ],
        reason: 'multi-paragraph edit',
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call review_changes approving all three',
  async function (this: ChangeTracksWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    try {
      this.lastResult = await this.ctx.review(filePath, {
        reviews: [
          { change_id: 'ct-1.1', decision: 'approve', reason: 'looks good' },
          { change_id: 'ct-1.2', decision: 'approve', reason: 'looks good' },
          { change_id: 'ct-1.3', decision: 'approve', reason: 'looks good' },
        ],
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I approve ct-1.1 and reject ct-1.2 and request_changes on ct-1.3',
  async function (this: ChangeTracksWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    try {
      this.lastResult = await this.ctx.review(filePath, {
        reviews: [
          { change_id: 'ct-1.1', decision: 'approve', reason: 'alpha change is correct' },
          { change_id: 'ct-1.2', decision: 'reject', reason: 'beta should stay lowercase' },
          { change_id: 'ct-1.3', decision: 'request_changes', reason: 'gamma needs different casing' },
        ],
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call propose_change with a changes array in classic mode \\(no hashlines)',
  async function (this: ChangeTracksWorld) {
    if (!this.ctx) await this.setupContext();
    // Use the large-doc.md created by "Given a tracked file with 50+ lines"
    const filePath = this.files.get('large-doc.md') ?? this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    // Dynamically read the file and pick a line near the middle
    const fileContent = await this.ctx.readDisk(filePath);
    const lines = fileContent.split('\n').filter((l: string) => l.trim().length > 0);
    const midIndex = Math.floor(lines.length / 2);
    const midLine = lines[midIndex];
    const firstWord = midLine.split(/\s+/).find((w: string) => w.length > 3) ?? 'content';
    const newLine = midLine.replace(firstWord, 'ALPHA');
    try {
      this.lastResult = await this.ctx.propose(filePath, {
        changes: [
          {
            old_text: midLine,
            new_text: newLine,
            reason: 'batch edit in classic mode',
          },
        ],
        reason: 'test affected_lines windowing for batch',
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

// =============================================================================
// O8: Setup steps for batch review scenarios
// =============================================================================

Given(
  'a batch of {int} changes \\(ct-1.1, ct-1.2, ct-1.3)',
  async function (this: ChangeTracksWorld, _count: number) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value ?? await this.ctx.createFile('spec.md', MULTI_PARA);
    if (!this.files.has('spec.md')) this.files.set('spec.md', filePath);

    await this.ctx.propose(filePath, {
      changes: [
        { old_text: 'alpha', new_text: 'ALPHA', reason: 'cap 1' },
        { old_text: 'beta', new_text: 'BETA', reason: 'cap 2' },
        { old_text: 'gamma', new_text: 'GAMMA', reason: 'cap 3' },
      ],
      reason: 'batch capitalize',
    });
  },
);

Given(
  'a batch of {int} changes',
  async function (this: ChangeTracksWorld, _count: number) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value ?? await this.ctx.createFile('spec.md', MULTI_PARA);
    if (!this.files.has('spec.md')) this.files.set('spec.md', filePath);

    await this.ctx.propose(filePath, {
      changes: [
        { old_text: 'alpha', new_text: 'ALPHA', reason: 'cap 1' },
        { old_text: 'beta', new_text: 'BETA', reason: 'cap 2' },
        { old_text: 'gamma', new_text: 'GAMMA', reason: 'cap 3' },
      ],
      reason: 'batch capitalize',
    });
  },
);

// =============================================================================
// O8: Then steps — batch assertions
// =============================================================================

Then(
  'the response contains change_ids {string}, {string}, {string}',
  function (this: ChangeTracksWorld, id1: string, id2: string, id3: string) {
    assert.ok(this.lastResult, 'No MCP result available');
    const data = this.ctx.parseResult(this.lastResult);
    const changes = data.applied as Array<{ change_id: string }>;
    assert.ok(changes, 'Expected applied array in response');
    const ids = changes.map(c => c.change_id);
    assert.ok(ids.includes(id1), `Expected ${id1} in response`);
    assert.ok(ids.includes(id2), `Expected ${id2} in response`);
    assert.ok(ids.includes(id3), `Expected ${id3} in response`);
  },
);

Then(
  'all three footnotes share the group prefix {string}',
  async function (this: ChangeTracksWorld, prefix: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes(`[^${prefix}.1]:`), `Expected [^${prefix}.1]: in file`);
    assert.ok(disk.includes(`[^${prefix}.2]:`), `Expected [^${prefix}.2]: in file`);
    assert.ok(disk.includes(`[^${prefix}.3]:`), `Expected [^${prefix}.3]: in file`);
    assert.ok(disk.includes(`[^${prefix}]:`), `Expected group footnote [^${prefix}]: in file`);
  },
);

Then(
  'each footnote contains its respective reasoning',
  async function (this: ChangeTracksWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes('reason-for-alpha'), 'Expected reason-for-alpha in footnote');
    assert.ok(disk.includes('reason-for-beta'), 'Expected reason-for-beta in footnote');
  },
);

Then(
  'each footnote contains the shared reasoning',
  async function (this: ChangeTracksWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    // Shared reasoning goes into the group footnote [^ct-1]
    const groupSection = extractFootnoteSection(disk, 'ct-1');
    assert.ok(groupSection.includes('capitalize for emphasis'), 'Expected shared reasoning in group footnote');
  },
);

Then(
  'item 2 and 3 are still applied correctly \\(auto-adjusted)',
  async function (this: ChangeTracksWorld) {
    assert.ok(this.lastResult, 'No MCP result available');
    const data = this.ctx.parseResult(this.lastResult);
    const changes = data.applied as Array<{ change_id: string }>;
    assert.ok(changes, 'Expected applied array');
    assert.equal(changes.length, 3, 'Expected 3 changes');

    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes('Second paragraph revised.'), 'Expected item 2 applied');
    assert.ok(disk.includes('Third paragraph revised.'), 'Expected item 3 applied');
  },
);

Then(
  'all three footnotes show {string}',
  async function (this: ChangeTracksWorld, status: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    await this.ctx.assertFootnoteStatus(filePath, 'ct-1.1', status);
    await this.ctx.assertFootnoteStatus(filePath, 'ct-1.2', status);
    await this.ctx.assertFootnoteStatus(filePath, 'ct-1.3', status);
  },
);

Then(
  'each footnote reflects its individual decision',
  async function (this: ChangeTracksWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    await this.ctx.assertFootnoteStatus(filePath, 'ct-1.1', 'accepted');
    await this.ctx.assertFootnoteStatus(filePath, 'ct-1.2', 'rejected');
    // request_changes does not change status from proposed
    await this.ctx.assertFootnoteStatus(filePath, 'ct-1.3', 'proposed');
  },
);

// =============================================================================
// Helpers
// =============================================================================

function extractFootnoteSection(content: string, changeId: string): string {
  const lines = content.split('\n');
  const escapedId = changeId.replace('.', '\\.');
  const headerRegex = new RegExp(`^\\[\\^${escapedId}\\]:`);
  const startIdx = lines.findIndex(l => headerRegex.test(l));
  if (startIdx === -1) return '';
  const result = [lines[startIdx]];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('    ') || lines[i].trim() === '') {
      result.push(lines[i]);
    } else {
      break;
    }
  }
  return result.join('\n');
}
