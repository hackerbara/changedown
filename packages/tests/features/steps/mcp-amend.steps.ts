/**
 * Step definitions for O6 (Amend) feature file.
 *
 * Covers: amend substitution text, amend reasoning only, cross-author rejection,
 * amending accepted change rejection, and preservation of change ID and thread.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeTracksWorld } from './world.js';

// =============================================================================
// O6: Background — tracked file with proposed substitution
// =============================================================================

Given(
  'a tracked file with a proposed substitution ct-1 by {string}',
  async function (this: ChangeTracksWorld, author: string, table: any) {
    if (!this.ctx) {
      this.configOverrides.settlement = { auto_on_approve: false, auto_on_reject: false };
      await this.setupContext();
    }
    // Table is key-value format: | old_text | REST | / | new_text | GraphQL |
    // Use rawTable to extract correctly (hashes() treats first row as header)
    const rows: string[][] = table.rawTable;
    const params = Object.fromEntries(rows.map((r: string[]) => [r[0].trim(), r[1].trim()]));
    const oldText = params.old_text;
    const newText = params.new_text;

    const filePath = await this.ctx.createFile('doc.md', `The API uses ${oldText} for services.`);
    this.files.set('doc.md', filePath);

    await this.ctx.propose(filePath, {
      old_text: oldText,
      new_text: newText,
      reason: 'flexibility for clients',
      author,
    });
  },
);

Given(
  'a proposed deletion ct-2 by {string}',
  async function (this: ChangeTracksWorld, author: string) {
    // Propose a deletion on the SAME file as the Background (doc.md) so it gets ct-2.
    // The Background already created ct-1 (substitution) on doc.md.
    const filePath = this.files.get('doc.md');
    assert.ok(filePath, 'Expected doc.md from Background step');
    // Read current content to find appropriate text to delete
    const content = await this.ctx.readDisk(filePath);
    // The file now has CriticMarkup from ct-1. We need to propose on text that
    // exists in the file body. Propose a deletion on a word in the file.
    // File content is like: "The API uses {~~REST~>GraphQL~~}[^ct-1] for services.\n\n[^ct-1]:..."
    // We'll delete " for" from "for services" to keep it simple.
    await this.ctx.propose(filePath, {
      old_text: 'services',
      new_text: '',
      reason: 'remove extra word',
      author,
    });
  },
);

Given(
  'ct-1 has been accepted',
  async function (this: ChangeTracksWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    // Manually update the footnote status to 'accepted'
    const content = await this.ctx.readDisk(filePath);
    const accepted = content.replace('| proposed', '| accepted');
    await this.ctx.createFile('doc.md', accepted);
  },
);

// =============================================================================
// O6: When steps — amend_change
// =============================================================================

When(
  'I call amend_change with:',
  async function (this: ChangeTracksWorld, table: any) {
    if (!this.ctx) await this.setupContext();
    const rows: string[][] = table.rawTable;
    const params = Object.fromEntries(rows.map((r: string[]) => [r[0].trim(), r[1].trim()]));

    const filePath = this.files.get('doc.md') ?? this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');

    const changeId = params.change_id || 'ct-1';
    const targetFile = filePath;

    try {
      this.lastResult = await this.ctx.amend(targetFile, changeId, {
        new_text: params.new_text,
        reason: params.reasoning || params.reason,
        author: params.author,
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call amend_change with author {string}',
  async function (this: ChangeTracksWorld, author: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    try {
      this.lastResult = await this.ctx.amend(filePath, 'ct-1', {
        new_text: 'gRPC',
        reason: 'I prefer gRPC',
        author,
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call amend_change for ct-1',
  async function (this: ChangeTracksWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    try {
      this.lastResult = await this.ctx.amend(filePath, 'ct-1', {
        new_text: 'gRPC',
        reason: 'changed my mind',
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I call amend_change for ct-1 with new_text {string}',
  async function (this: ChangeTracksWorld, newText: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');

    // First add a discussion entry so we can verify it's preserved
    await this.ctx.review(filePath, {
      responses: [{ change_id: 'ct-1', response: 'Have you benchmarked this?', label: 'question' }],
      author: 'ai:reviewer',
    });

    try {
      this.lastResult = await this.ctx.amend(filePath, 'ct-1', {
        new_text: newText,
        reason: 'benchmarks show gRPC is 3x faster',
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

// =============================================================================
// O6: Then steps — amend assertions
// =============================================================================

Then(
  'the inline markup changes from {string} to {string}',
  async function (this: ChangeTracksWorld, oldMarkup: string, newMarkup: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(!disk.includes(oldMarkup), `Expected old markup "${oldMarkup}" to be gone`);
    assert.ok(disk.includes(newMarkup), `Expected new markup "${newMarkup}" to be present`);
  },
);

Then(
  'the footnote contains {string}',
  async function (this: ChangeTracksWorld, expected: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(
      disk.includes(expected),
      `Expected footnote to contain "${expected}" but file is:\n${disk}`,
    );
  },
);

Then(
  'the footnote contains previous text {string}',
  async function (this: ChangeTracksWorld, prevText: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(
      disk.includes(`previous: "${prevText}"`),
      `Expected footnote to contain previous: "${prevText}"`,
    );
  },
);

Then(
  'the inline markup is unchanged',
  async function (this: ChangeTracksWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    // In the deletion amendment scenario, the deletion markup {--..--} should remain
    assert.ok(disk.includes('{--'), 'Expected deletion markup to be unchanged');
  },
);

Then(
  'the error mentions {string} {string}',
  function (this: ChangeTracksWorld, word1: string, word2: string) {
    assert.ok(this.lastResult, 'No MCP result available');
    const text = this.ctx.resultText(this.lastResult).toLowerCase();
    assert.ok(text.includes(word1.toLowerCase()), `Expected error to mention "${word1}"`);
    assert.ok(text.includes(word2.toLowerCase()), `Expected error to mention "${word2}"`);
  },
);

Then(
  'the error mentions status {string}',
  function (this: ChangeTracksWorld, status: string) {
    assert.ok(this.lastResult, 'No MCP result available');
    const text = this.ctx.resultText(this.lastResult).toLowerCase();
    assert.ok(text.includes(status.toLowerCase()), `Expected error to mention status "${status}"`);
  },
);

Then(
  'the change ID remains {string}',
  async function (this: ChangeTracksWorld, changeId: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes(`[^${changeId}]`), `Expected change ID "${changeId}" in file`);
  },
);

Then(
  'existing discussion entries are preserved',
  async function (this: ChangeTracksWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(
      disk.includes('Have you benchmarked this?'),
      'Expected discussion entry to be preserved',
    );
  },
);
