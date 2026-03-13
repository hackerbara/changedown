import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser, ChangeType, ChangeStatus, VirtualDocument } from '@changetracks/core';
import type { PendingOverlay, ChangeNode } from '@changetracks/core';
import type { ChangeTracksWorld } from './world';

// Extend ChangeTracksWorld with parser state for @fast tier scenarios
declare module './world' {
    interface ChangeTracksWorld {
        parser?: CriticMarkupParser;
        inputText?: string;
        parseResult?: VirtualDocument;
        overlayState?: PendingOverlay;
    }
}

// Map user-facing type names to ChangeType enum values
const TYPE_MAP: Record<string, ChangeType> = {
    insertion: ChangeType.Insertion,
    deletion: ChangeType.Deletion,
    substitution: ChangeType.Substitution,
    highlight: ChangeType.Highlight,
    comment: ChangeType.Comment,
};

Given('the input text is:', async function (this: ChangeTracksWorld, docString: string) {
    this.parser = new CriticMarkupParser();
    this.inputText = docString;
});

When('I parse the text', async function (this: ChangeTracksWorld) {
    assert.ok(this.parser, 'Parser not initialized — call "the input text is:" first');
    assert.ok(this.inputText !== undefined, 'Input text not set');
    this.parseResult = this.parser.parse(this.inputText);
});

// ─── fromOverlayOnly (OVL1) ───────────────────────────────────────────

Given('a pending overlay with range {int} to {int} and text {string}', async function (this: ChangeTracksWorld, start: number, end: number, text: string) {
    this.overlayState = { range: { start, end }, text, type: 'insertion' };
});

Given('a pending overlay with range {int} to {int} and text {string} and scId {string}', async function (this: ChangeTracksWorld, start: number, end: number, text: string, scId: string) {
    this.overlayState = { range: { start, end }, text, type: 'insertion', scId };
});

When('I create a VirtualDocument from overlay only', async function (this: ChangeTracksWorld) {
    assert.ok(this.overlayState, 'Overlay not set — call "a pending overlay with..." first');
    this.parseResult = VirtualDocument.fromOverlayOnly(this.overlayState);
});

Then('the parser finds {int} change(s)', async function (this: ChangeTracksWorld, count: number) {
    assert.ok(this.parseResult, 'No parse result — call "I parse the text" first');
    const changes = this.parseResult.getChanges();
    assert.strictEqual(
        changes.length,
        count,
        `Expected ${count} changes, got ${changes.length}`
    );
});

Then('change {int} is a/an {word}', async function (this: ChangeTracksWorld, index: number, typeName: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    const expectedType = TYPE_MAP[typeName.toLowerCase()];
    assert.ok(expectedType, `Unknown type name "${typeName}". Valid: ${Object.keys(TYPE_MAP).join(', ')}`);
    assert.strictEqual(
        change.type,
        expectedType,
        `Change ${index}: expected type "${expectedType}", got "${change.type}"`
    );
});

Then('change {int} has modified text {string}', async function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.modifiedText, expected);
});

Then('change {int} has original text {string}', async function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.originalText, expected);
});

Then('change {int} has modified text:', async function (this: ChangeTracksWorld, index: number, docString: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.modifiedText, docString);
});

Then('change {int} has original text:', async function (this: ChangeTracksWorld, index: number, docString: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.originalText, docString);
});

Then('change {int} has comment:', async function (this: ChangeTracksWorld, index: number, docString: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.metadata?.comment, docString);
});

Then('no changes are found', async function (this: ChangeTracksWorld) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    assert.strictEqual(changes.length, 0, `Expected 0 changes, got ${changes.length}`);
});

// --- Range assertions (offset-based) ---

Then('change {int} range starts at {int}', async function (this: ChangeTracksWorld, index: number, offset: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.strictEqual(change.range.start, offset, `Change ${index}: expected range.start ${offset}, got ${change.range.start}`);
});

Then('change {int} range ends at {int}', async function (this: ChangeTracksWorld, index: number, offset: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.strictEqual(change.range.end, offset, `Change ${index}: expected range.end ${offset}, got ${change.range.end}`);
});

Then('change {int} content range starts at {int}', async function (this: ChangeTracksWorld, index: number, offset: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.strictEqual(change.contentRange.start, offset, `Change ${index}: expected contentRange.start ${offset}, got ${change.contentRange.start}`);
});

Then('change {int} content range ends at {int}', async function (this: ChangeTracksWorld, index: number, offset: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.strictEqual(change.contentRange.end, offset, `Change ${index}: expected contentRange.end ${offset}, got ${change.contentRange.end}`);
});

Then('change {int} original range starts at {int}', async function (this: ChangeTracksWorld, index: number, offset: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.ok(change.originalRange, `Change ${index} has no originalRange`);
    assert.strictEqual(change.originalRange.start, offset, `Change ${index}: expected originalRange.start ${offset}, got ${change.originalRange.start}`);
});

Then('change {int} original range ends at {int}', async function (this: ChangeTracksWorld, index: number, offset: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.ok(change.originalRange, `Change ${index} has no originalRange`);
    assert.strictEqual(change.originalRange.end, offset, `Change ${index}: expected originalRange.end ${offset}, got ${change.originalRange.end}`);
});

Then('change {int} modified range starts at {int}', async function (this: ChangeTracksWorld, index: number, offset: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.ok(change.modifiedRange, `Change ${index} has no modifiedRange`);
    assert.strictEqual(change.modifiedRange.start, offset, `Change ${index}: expected modifiedRange.start ${offset}, got ${change.modifiedRange.start}`);
});

Then('change {int} modified range ends at {int}', async function (this: ChangeTracksWorld, index: number, offset: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.ok(change.modifiedRange, `Change ${index} has no modifiedRange`);
    assert.strictEqual(change.modifiedRange.end, offset, `Change ${index}: expected modifiedRange.end ${offset}, got ${change.modifiedRange.end}`);
});

// --- Metadata assertions ---

Then('change {int} has comment {string}', async function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.strictEqual(change.metadata?.comment, expected, `Change ${index}: expected comment "${expected}", got "${change.metadata?.comment}"`);
});

Then('change {int} has no comment', async function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.strictEqual(change.metadata?.comment, undefined, `Change ${index}: expected no comment, got "${change.metadata?.comment}"`);
});

// --- Status assertions ---

const STATUS_MAP: Record<string, ChangeStatus> = {
    proposed: ChangeStatus.Proposed,
    accepted: ChangeStatus.Accepted,
    rejected: ChangeStatus.Rejected,
};

Then('change {int} has status {string}', async function (this: ChangeTracksWorld, index: number, statusName: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    const expectedStatus = STATUS_MAP[statusName.toLowerCase()];
    assert.ok(expectedStatus, `Unknown status "${statusName}". Valid: ${Object.keys(STATUS_MAP).join(', ')}`);
    assert.strictEqual(change.status, expectedStatus, `Change ${index}: expected status "${expectedStatus}", got "${change.status}"`);
});

Then('all changes have status {string}', async function (this: ChangeTracksWorld, statusName: string) {
    assert.ok(this.parseResult, 'No parse result');
    const expectedStatus = STATUS_MAP[statusName.toLowerCase()];
    assert.ok(expectedStatus, `Unknown status "${statusName}". Valid: ${Object.keys(STATUS_MAP).join(', ')}`);
    const changes = this.parseResult.getChanges();
    assert.ok(changes.length > 0, 'No changes to check');
    for (let i = 0; i < changes.length; i++) {
        assert.strictEqual(changes[i].status, expectedStatus, `Change ${i + 1}: expected status "${expectedStatus}", got "${changes[i].status}"`);
    }
});

// --- ID uniqueness ---

Then('all changes have unique IDs', async function (this: ChangeTracksWorld) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    assert.ok(changes.length > 0, 'No changes to check');
    const ids = changes.map(c => c.id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(uniqueIds.size, ids.length, `Duplicate IDs found: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
});
