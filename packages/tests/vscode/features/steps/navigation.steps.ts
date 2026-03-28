/**
 * @fast tier step definitions for navigation tests (NAV1).
 *
 * Tests the core nextChange / previousChange functions from @changedown/core.
 * No VS Code dependency — pure in-process tests.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser, nextChange, previousChange } from '@changedown/core';
import type { VirtualDocument, ChangeNode } from '@changedown/core';
import type { ChangeDownWorld } from './world';

// ── Extend ChangeDownWorld with navigation state ────────────────────

declare module './world' {
    interface ChangeDownWorld {
        navText?: string;
        navDoc?: VirtualDocument;
        navCursorOffset?: number;
        navTarget?: ChangeNode | null;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

function offsetToLine(text: string, offset: number): number {
    let line = 0;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') line++;
    }
    return line;
}

// ── Given ────────────────────────────────────────────────────────────

Given('a navigation document with text:', function (this: ChangeDownWorld, docString: string) {
    this.navText = docString;
    const parser = new CriticMarkupParser();
    this.navDoc = parser.parse(docString);
});

Given('the navigation cursor is at offset {int}', function (this: ChangeDownWorld, offset: number) {
    this.navCursorOffset = offset;
});

Given('the navigation cursor is at end of document', function (this: ChangeDownWorld) {
    assert.ok(this.navText !== undefined, 'Navigation text not set');
    this.navCursorOffset = this.navText!.length;
});

// ── When ─────────────────────────────────────────────────────────────

When('I run nextChange from the cursor', function (this: ChangeDownWorld) {
    assert.ok(this.navDoc, 'Navigation document not set');
    assert.ok(this.navCursorOffset !== undefined, 'Cursor offset not set');
    this.navTarget = nextChange(this.navDoc!, this.navCursorOffset!);
});

When('I run previousChange from the cursor', function (this: ChangeDownWorld) {
    assert.ok(this.navDoc, 'Navigation document not set');
    assert.ok(this.navCursorOffset !== undefined, 'Cursor offset not set');
    this.navTarget = previousChange(this.navDoc!, this.navCursorOffset!);
});

When('I advance the cursor past the navigation target', function (this: ChangeDownWorld) {
    assert.ok(this.navTarget, 'No navigation target to advance past');
    // Move cursor to 1 past the end of the current target
    this.navCursorOffset = this.navTarget!.range.end + 1;
});

// ── Then ─────────────────────────────────────────────────────────────

Then('the navigation target is change {int}', function (this: ChangeDownWorld, index: number) {
    assert.ok(this.navDoc, 'Navigation document not set');
    assert.ok(this.navTarget, 'No navigation target found');
    const changes = this.navDoc!.getChanges();
    const expected = changes[index - 1];
    assert.ok(expected, `Change ${index} does not exist (only ${changes.length} changes)`);
    assert.strictEqual(
        this.navTarget!.range.start,
        expected.range.start,
        `Expected navigation target at offset ${expected.range.start} (change ${index}), got offset ${this.navTarget!.range.start}`
    );
});

Then('the navigation target starts on line {int}', function (this: ChangeDownWorld, expectedLine: number) {
    assert.ok(this.navText !== undefined, 'Navigation text not set');
    assert.ok(this.navTarget, 'No navigation target found');
    const line = offsetToLine(this.navText!, this.navTarget!.range.start);
    assert.strictEqual(
        line,
        expectedLine,
        `Expected navigation target on line ${expectedLine}, got line ${line}`
    );
});

Then('the navigation target starts before offset {int}', function (this: ChangeDownWorld, offset: number) {
    assert.ok(this.navTarget, 'No navigation target found');
    assert.ok(
        this.navTarget!.range.start < offset,
        `Expected navigation target before offset ${offset}, got ${this.navTarget!.range.start}`
    );
});

Then('the navigation target is the last change', function (this: ChangeDownWorld) {
    assert.ok(this.navDoc, 'Navigation document not set');
    assert.ok(this.navTarget, 'No navigation target found');
    const changes = this.navDoc!.getChanges();
    const lastChange = changes[changes.length - 1];
    assert.strictEqual(
        this.navTarget!.range.start,
        lastChange.range.start,
        `Expected last change at offset ${lastChange.range.start}, got ${this.navTarget!.range.start}`
    );
});

Then('no navigation target is found', function (this: ChangeDownWorld) {
    assert.strictEqual(
        this.navTarget,
        null,
        `Expected no navigation target, but got one at offset ${this.navTarget?.range.start}`
    );
});
