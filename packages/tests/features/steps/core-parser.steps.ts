import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { ChangeTracksWorld } from './world.js';

// =============================================================================
// Given — set up raw text for parsing
// =============================================================================

Given('the text {string}', function (this: ChangeTracksWorld, text: string) {
  // Cucumber passes literal \n as two characters; convert to real newlines
  this.lastText = text.replace(/\\n/g, '\n');
});

// =============================================================================
// When — parse the text
// =============================================================================

When('I parse the text', function (this: ChangeTracksWorld) {
  this.lastDoc = this.parser.parse(this.lastText);
});

// =============================================================================
// Then — change count
// =============================================================================

Then('there is 1 change', function (this: ChangeTracksWorld) {
  assert.ok(this.lastDoc, 'No document was parsed');
  const changes = this.lastDoc.getChanges();
  assert.equal(changes.length, 1, `Expected 1 change but got ${changes.length}`);
});

Then('there are {int} changes', function (this: ChangeTracksWorld, count: number) {
  assert.ok(this.lastDoc, 'No document was parsed');
  const changes = this.lastDoc.getChanges();
  assert.equal(changes.length, count, `Expected ${count} changes but got ${changes.length}`);
});

// =============================================================================
// Then — change type
// =============================================================================

Then(
  'change {int} is type {string}',
  function (this: ChangeTracksWorld, index: number, expectedType: string) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const changes = this.lastDoc.getChanges();
    const c = changes[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.equal(c.type, expectedType, `Change ${index} type: expected "${expectedType}" but got "${c.type}"`);
  },
);

// =============================================================================
// Then — text content assertions
// =============================================================================

Then(
  'change {int} has modified text {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    const expectedText = expected.replace(/\\n/g, '\n');
    assert.equal(c.modifiedText, expectedText);
  },
);

Then(
  'change {int} has original text {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    const expectedText = expected.replace(/\\n/g, '\n');
    assert.equal(c.originalText, expectedText);
  },
);

Then(
  'change {int} has no original text',
  function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.equal(c.originalText, undefined);
  },
);

Then(
  'change {int} has no modified text',
  function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.equal(c.modifiedText, undefined);
  },
);

// =============================================================================
// Then — range assertions
// =============================================================================

Then(
  'change {int} has range {int} to {int}',
  function (this: ChangeTracksWorld, index: number, start: number, end: number) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.deepEqual(c.range, { start, end });
  },
);

Then(
  'change {int} has content range {int} to {int}',
  function (this: ChangeTracksWorld, index: number, start: number, end: number) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.deepEqual(c.contentRange, { start, end });
  },
);

Then(
  'change {int} has original range {int} to {int}',
  function (this: ChangeTracksWorld, index: number, start: number, end: number) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.deepEqual(c.originalRange, { start, end });
  },
);

Then(
  'change {int} has modified range {int} to {int}',
  function (this: ChangeTracksWorld, index: number, start: number, end: number) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.deepEqual(c.modifiedRange, { start, end });
  },
);

// =============================================================================
// Then — ID assertions
// =============================================================================

Then(
  'change {int} has id {string}',
  function (this: ChangeTracksWorld, index: number, expectedId: string) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.equal(c.id, expectedId);
  },
);

// =============================================================================
// Then — metadata assertions
// =============================================================================

Then(
  'change {int} has comment {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.ok(c.metadata, `Change ${index} has no metadata`);
    assert.equal(c.metadata.comment, expected);
  },
);

Then(
  'change {int} has no metadata',
  function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.equal(c.metadata, undefined);
  },
);

// =============================================================================
// Then — status assertions
// =============================================================================

Then(
  'all changes have status {string}',
  function (this: ChangeTracksWorld, expectedStatus: string) {
    assert.ok(this.lastDoc, 'No document was parsed');
    const changes = this.lastDoc.getChanges();
    for (const c of changes) {
      assert.equal(c.status, expectedStatus, `Change ${c.id} status: expected "${expectedStatus}" but got "${c.status}"`);
    }
  },
);

// =============================================================================
// Then — document order assertion
// =============================================================================

Then('changes are in document order', function (this: ChangeTracksWorld) {
  assert.ok(this.lastDoc, 'No document was parsed');
  const changes = this.lastDoc.getChanges();
  for (let i = 1; i < changes.length; i++) {
    assert.ok(
      changes[i - 1].range.end <= changes[i].range.start,
      `Change ${i} (end=${changes[i - 1].range.end}) overlaps with change ${i + 1} (start=${changes[i].range.start})`,
    );
  }
});
