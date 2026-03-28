/**
 * Step definitions for O7 (Settlement) feature file.
 *
 * Covers: auto-settle on approve, auto-settle on reject, manual settle via flag,
 * settlement of substitutions and deletions, and footnote persistence after Layer 1.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeDownWorld } from './world.js';

// =============================================================================
// O7: Background and setup steps
// =============================================================================

Given(
  'a tracked file with proposed changes',
  async function (this: ChangeDownWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = await this.ctx.createFile('doc.md', 'The API uses REST for queries.\nAdd caching layer.');
    this.files.set('doc.md', filePath);
    await this.ctx.propose(filePath, {
      old_text: 'REST',
      new_text: 'GraphQL',
      reason: 'better for flexible queries',
    });
  },
);

Given(
  'a pending substitution {string} -> {string}',
  async function (this: ChangeDownWorld, oldText: string, newText: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = await this.ctx.createFile('doc.md', `The API uses ${oldText} for data fetching.`);
    this.files.set('doc.md', filePath);
    await this.ctx.propose(filePath, {
      old_text: oldText,
      new_text: newText,
      reason: 'flexibility',
    });
  },
);

Given(
  'a pending deletion of {string}',
  async function (this: ChangeDownWorld, text: string) {
    if (!this.ctx) await this.setupContext();
    const filePath = await this.ctx.createFile('doc.md', `Keep this. ${text} And keep this too.`);
    this.files.set('doc.md', filePath);
    await this.ctx.propose(filePath, {
      old_text: `${text} `,
      new_text: '',
      reason: 'unnecessary content',
    });
  },
);

// =============================================================================
// O7: When steps — approve/reject/settle
// =============================================================================

When(
  'I approve cn-1',
  async function (this: ChangeDownWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    try {
      this.lastResult = await this.ctx.review(filePath, {
        reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'verified' }],
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I reject an insertion cn-1',
  async function (this: ChangeDownWorld) {
    if (!this.ctx) await this.setupContext();
    // Create a file with an insertion for this specific scenario
    const filePath = await this.ctx.createFile('doc.md', 'The API uses REST.');
    this.files.set('doc.md', filePath);
    await this.ctx.propose(filePath, {
      old_text: '',
      new_text: ' It supports caching.',
      insert_after: 'The API uses REST.',
      reason: 'add caching note',
    });
    try {
      this.lastResult = await this.ctx.review(filePath, {
        reviews: [{ change_id: 'cn-1', decision: 'reject', reason: 'not needed' }],
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I approve cn-1 \\(markup persists)',
  async function (this: ChangeDownWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    try {
      this.lastResult = await this.ctx.review(filePath, {
        reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'good call' }],
      });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I approve and settle',
  async function (this: ChangeDownWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');

    // If not yet approved, approve first
    await this.ctx.review(filePath, {
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'verified' }],
    });

    // Then settle
    try {
      this.lastResult = await this.ctx.review(filePath, { settle: true });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

When(
  'I settle all accepted changes',
  async function (this: ChangeDownWorld) {
    if (!this.ctx) await this.setupContext();
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    // Approve cn-1 first so there's an accepted change to settle
    await this.ctx.review(filePath, {
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'verified for settlement' }],
    });
    try {
      this.lastResult = await this.ctx.review(filePath, { settle: true });
    } catch (err) {
      this.lastError = err as Error;
    }
  },
);

// =============================================================================
// O7: Then steps — settlement assertions
// =============================================================================

Then(
  'the inline CriticMarkup for cn-1 is removed',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    await this.ctx.assertNoMarkupInBody(filePath);
  },
);

Then(
  'the accepted text remains in place',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes('GraphQL'), 'Expected accepted text "GraphQL" in file');
  },
);

Then(
  'the footnote definition persists \\(Layer 1)',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes('[^cn-1]:'), 'Expected footnote definition to persist');
  },
);

Then(
  'the inserted text AND delimiters are removed',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    const footnoteStart = disk.indexOf('\n[^cn-');
    const body = footnoteStart >= 0 ? disk.slice(0, footnoteStart) : disk;
    assert.ok(!body.includes('It supports caching.'), 'Expected inserted text to be removed');
    assert.ok(!body.includes('{++'), 'Expected insertion delimiters to be removed');
  },
);

Then(
  'the accepted markup is compacted',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    await this.ctx.assertNoMarkupInBody(filePath);
  },
);

Then(
  'the footnote persists',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes('[^cn-1]:'), 'Expected footnote to persist');
  },
);

Then(
  'the file contains {string} without CriticMarkup',
  async function (this: ChangeDownWorld, expected: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    const footnoteStart = disk.indexOf('\n[^cn-');
    const body = footnoteStart >= 0 ? disk.slice(0, footnoteStart) : disk;
    assert.ok(body.includes(expected), `Expected "${expected}" in body`);
    assert.ok(!body.includes('{~~'), 'Expected no CriticMarkup in body');
  },
);

Then(
  '{string} no longer appears in the document body',
  async function (this: ChangeDownWorld, text: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    const footnoteStart = disk.indexOf('\n[^cn-');
    const body = footnoteStart >= 0 ? disk.slice(0, footnoteStart) : disk;
    assert.ok(!body.includes(text), `Expected "${text}" to not appear in document body`);
  },
);

Then(
  'every footnote is still present in the file',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes('[^cn-1]:'), 'Expected [^cn-1]: to be present');
  },
);

Then(
  'each footnote status reflects {string} or {string}',
  async function (this: ChangeDownWorld, status1: string, status2: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(
      disk.includes(status1) || disk.includes(status2),
      `Expected footnotes to reflect "${status1}" or "${status2}"`,
    );
  },
);

// --- Settlement inline markup removal step ---
Then(
  'the inline markup is removed',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    await this.ctx.assertNoMarkupInBody(filePath);
  },
);

Then(
  'the document reads {string}',
  async function (this: ChangeDownWorld, expected: string) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes(expected), `Expected document to contain "${expected}"`);
  },
);

Then(
  'the footnote persists with full deliberation history',
  async function (this: ChangeDownWorld) {
    const filePath = this.files.values().next().value;
    assert.ok(filePath, 'No file in this scenario');
    const disk = await this.ctx.readDisk(filePath);
    assert.ok(disk.includes('[^cn-1]:'), 'Expected footnote to persist');
  },
);
