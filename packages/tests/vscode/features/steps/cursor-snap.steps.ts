/**
 * @fast tier step definitions for cursor snap tests (CS1).
 *
 * Tests binary search and hidden offset computation.
 */

// ── MUST be first: install vscode mock before any vscode-dependent imports ──
import { installVscodeMock, resetDecorationTypeCounter } from './vscode-mock';
installVscodeMock();

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { findContainingHiddenRange } from 'changetracks-vscode/internals';
import type { ChangeTracksWorld } from './world';

// ── Extend World with cursor snap test state ─────────────────────────
declare module './world' {
    interface ChangeTracksWorld {
        searchRanges?: ReadonlyArray<{start: number; end: number}>;
        searchResult?: {start: number; end: number} | undefined;
        /** Sentinel to distinguish "not searched yet" from "searched, got undefined". */
        searchPerformed?: boolean;
    }
}

Before({ tags: '@fast and @CS1' }, function (this: ChangeTracksWorld) {
    resetDecorationTypeCounter();
    this.searchRanges = undefined;
    this.searchResult = undefined;
    this.searchPerformed = false;
});

// ── Binary search Given/When/Then ──

Given('hidden offset ranges []', function (this: ChangeTracksWorld) {
    this.searchRanges = [];
});

Given('hidden offset ranges {string}', function (this: ChangeTracksWorld, rangesJson: string) {
    this.searchRanges = JSON.parse(rangesJson);
});

When('I search for offset {int}', function (this: ChangeTracksWorld, offset: number) {
    assert.ok(this.searchRanges !== undefined, 'No search ranges set');
    this.searchResult = findContainingHiddenRange(this.searchRanges!, offset);
    this.searchPerformed = true;
});

Then('the search result is undefined', function (this: ChangeTracksWorld) {
    assert.ok(this.searchPerformed, 'No search performed');
    assert.strictEqual(this.searchResult, undefined,
        `Expected undefined, got ${JSON.stringify(this.searchResult)}`);
});

Then('the search result is {int} to {int}', function (
    this: ChangeTracksWorld, start: number, end: number
) {
    assert.ok(this.searchPerformed, 'No search performed');
    assert.ok(this.searchResult !== undefined, 'Search result is undefined');
    assert.strictEqual(this.searchResult!.start, start,
        `Expected start ${start}, got ${this.searchResult!.start}`);
    assert.strictEqual(this.searchResult!.end, end,
        `Expected end ${end}, got ${this.searchResult!.end}`);
});

// ── Decorator hidden offset Then steps ──
// The Given/When steps for markup text and decorate modes are already
// defined in decoration-fast.steps.ts. These Then steps access
// this.decoratorInstance which is populated by those existing steps.

Then('hidden offset count is {int}', function (this: ChangeTracksWorld, expected: number) {
    assert.ok(this.decoratorInstance, 'No decorator — run a decorate step first');
    const offsets = this.decoratorInstance!.getHiddenOffsets();
    assert.strictEqual(offsets.length, expected,
        `Expected ${expected} hidden offsets, got ${offsets.length}: ${JSON.stringify(offsets)}`);
});

Then('hidden offset {int} is {int} to {int}', function (
    this: ChangeTracksWorld, index: number, start: number, end: number
) {
    assert.ok(this.decoratorInstance, 'No decorator — run a decorate step first');
    const offsets = this.decoratorInstance!.getHiddenOffsets();
    assert.ok(index < offsets.length,
        `Index ${index} out of range (${offsets.length} offsets): ${JSON.stringify(offsets)}`);
    assert.strictEqual(offsets[index].start, start,
        `Offset ${index} start: expected ${start}, got ${offsets[index].start}`);
    assert.strictEqual(offsets[index].end, end,
        `Offset ${index} end: expected ${end}, got ${offsets[index].end}`);
});
