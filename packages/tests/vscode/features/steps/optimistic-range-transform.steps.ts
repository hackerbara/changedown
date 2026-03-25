/**
 * Step definitions for ORT-1: Optimistic range transform.
 *
 * TIER: @fast (pure functions, no VS Code required)
 */

// ── MUST be first: install vscode mock before any vscode-dependent imports ──
import { installVscodeMock } from './vscode-mock';
installVscodeMock();

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeTracksWorld } from './world';

// Import via the internals barrel (the only way test package resolves extension modules).
// transformRange and transformCachedDecorations live in range-transform.ts which has
// no vscode-languageclient dependency, so they load cleanly in @fast tests.
import {
    transformRange,
    transformCachedDecorations,
    setCachedDecorationData,
    getCachedDecorationData,
    invalidateDecorationCache,
} from 'changetracks-vscode/internals';

// ---------------------------------------------------------------------------
// State for transformRange unit tests
// ---------------------------------------------------------------------------
declare module './world' {
    interface ChangeTracksWorld {
        ortRange?: { start: number; end: number };
        ortTransformResult?: boolean;
    }
}

Given(
    'a range from offset {int} to {int}',
    function (this: ChangeTracksWorld, start: number, end: number) {
        this.ortRange = { start, end };
    }
);

When(
    'an edit inserts {int} characters at offset {int}',
    function (this: ChangeTracksWorld, count: number, offset: number) {
        assert.ok(this.ortRange, 'Range not set');
        // Insert: rangeLength=0, text.length=count → delta=count
        transformRange(this.ortRange!, offset, offset, count);
    }
);

When(
    'an edit deletes {int} characters at offset {int}',
    function (this: ChangeTracksWorld, count: number, offset: number) {
        assert.ok(this.ortRange, 'Range not set');
        // Delete: rangeLength=count, text.length=0 → delta=-count
        const editEnd = offset + count;
        transformRange(this.ortRange!, offset, editEnd, -count);
    }
);

Then(
    'the range is from offset {int} to {int}',
    function (this: ChangeTracksWorld, expectedStart: number, expectedEnd: number) {
        assert.ok(this.ortRange, 'Range not set');
        assert.strictEqual(this.ortRange!.start, expectedStart,
            `start: expected ${expectedStart}, got ${this.ortRange!.start}`);
        assert.strictEqual(this.ortRange!.end, expectedEnd,
            `end: expected ${expectedEnd}, got ${this.ortRange!.end}`);
    }
);

// ---------------------------------------------------------------------------
// transformCachedDecorations integration
// ---------------------------------------------------------------------------

Given(
    'cached decoration data for {string} with ranges {int}-{int} and {int}-{int}',
    function (this: ChangeTracksWorld, uri: string, s1: number, e1: number, s2: number, e2: number) {
        const nodes = [
            { id: 'test-1', type: 0, status: 0, range: { start: s1, end: e1 }, contentRange: { start: s1, end: e1 }, level: 0 as const, anchored: false },
            { id: 'test-2', type: 0, status: 0, range: { start: s2, end: e2 }, contentRange: { start: s2, end: e2 }, level: 0 as const, anchored: false },
        ] as any[];
        setCachedDecorationData(uri, nodes, 1);
    }
);

Given(
    'no cached decoration data for {string}',
    function (this: ChangeTracksWorld, uri: string) {
        invalidateDecorationCache(uri);
    }
);

When(
    'transformCachedDecorations is called with an insert of {int} chars at offset {int}',
    function (this: ChangeTracksWorld, count: number, offset: number) {
        const uri = 'file:///test.md';
        // Simulate a TextDocumentContentChangeEvent for an insert
        const contentChanges = [{
            rangeOffset: offset,
            rangeLength: 0,
            text: 'x'.repeat(count),
            range: { start: { line: 0, character: offset }, end: { line: 0, character: offset } },
        }] as any[];
        this.ortTransformResult = transformCachedDecorations(uri, contentChanges, 2);
    }
);

When(
    'transformCachedDecorations is called with a delete of {int} chars at offset {int}',
    function (this: ChangeTracksWorld, count: number, offset: number) {
        const uri = 'file:///test.md';
        const contentChanges = [{
            rangeOffset: offset,
            rangeLength: count,
            text: '',
            range: { start: { line: 0, character: offset }, end: { line: 0, character: offset + count } },
        }] as any[];
        this.ortTransformResult = transformCachedDecorations(uri, contentChanges, 2);
    }
);

Then(
    'the cached ranges are {int}-{int} and {int}-{int}',
    function (this: ChangeTracksWorld, s1: number, e1: number, s2: number, e2: number) {
        const cached = getCachedDecorationData('file:///test.md');
        assert.ok(cached, 'No cached data');
        const changes = cached!.changes;
        assert.strictEqual(changes.length, 2, `Expected 2 nodes, got ${changes.length}`);
        assert.strictEqual(changes[0].range.start, s1);
        assert.strictEqual(changes[0].range.end, e1);
        assert.strictEqual(changes[1].range.start, s2);
        assert.strictEqual(changes[1].range.end, e2);
    }
);

Then(
    'transformCachedDecorations returns false',
    function (this: ChangeTracksWorld) {
        assert.strictEqual(this.ortTransformResult, false);
    }
);
