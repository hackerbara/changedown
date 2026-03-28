/**
 * @fast tier step definitions for ENS — ensureL2 promotion.
 *
 * Tests the core ensureL2() function that promotes L0 changes to L2
 * by inserting [^cn-N] refs and appending footnote definitions.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    CriticMarkupParser,
    ensureL2,
} from '@changedown/core';
import type { EnsureL2Result } from '@changedown/core';
import type { ChangeDownWorld } from './world';

// ── Extend World with ensureL2 state ────────────────────────────────

declare module './world' {
    interface ChangeDownWorld {
        ensureL2DocText?: string;
        ensureL2Result?: EnsureL2Result;
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────

Before({ tags: '@fast and @ENS' }, function (this: ChangeDownWorld) {
    this.ensureL2DocText = undefined;
    this.ensureL2Result = undefined;
});

// ── Step definitions ─────────────────────────────────────────────────

Given('an ensureL2 document with text:', function (this: ChangeDownWorld, docString: string) {
    this.ensureL2DocText = docString;
});

When('I call ensureL2 on the change at offset {int}', function (this: ChangeDownWorld, offset: number) {
    assert.ok(this.ensureL2DocText !== undefined, 'Document text not set');
    this.ensureL2Result = ensureL2(this.ensureL2DocText, offset, {
        author: 'alice',
        type: 'ins',
    });
});

When('I call ensureL2 on the change containing {string}', function (this: ChangeDownWorld, searchText: string) {
    assert.ok(this.ensureL2DocText !== undefined, 'Document text not set');
    // Find the offset of the search text within the document
    const offset = this.ensureL2DocText.indexOf(searchText);
    assert.ok(offset >= 0, `Text "${searchText}" not found in document`);
    this.ensureL2Result = ensureL2(this.ensureL2DocText, offset, {
        author: 'alice',
        type: 'ins',
    });
});

When('I call ensureL2 on the change at offset {int} with author {string} and date {string}', function (
    this: ChangeDownWorld,
    offset: number,
    author: string,
    _date: string,
) {
    assert.ok(this.ensureL2DocText !== undefined, 'Document text not set');
    this.ensureL2Result = ensureL2(this.ensureL2DocText, offset, {
        author,
        type: 'ins',
    });
});

Then('the ensureL2 result text contains a footnote reference', function (this: ChangeDownWorld) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    assert.ok(
        /\[\^cn-\d+\][^:]/.test(this.ensureL2Result.text) || /\[\^cn-\d+\]$/.test(this.ensureL2Result.text),
        `Result text does not contain a footnote reference.\nText:\n${this.ensureL2Result.text}`
    );
});

Then('the ensureL2 result text contains a footnote block starting with {string}', function (
    this: ChangeDownWorld,
    expected: string,
) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    assert.ok(
        this.ensureL2Result.text.includes(expected),
        `Result text does not contain "${expected}".\nText:\n${this.ensureL2Result.text}`
    );
});

Then('the ensureL2 result changeId is {string}', function (this: ChangeDownWorld, expectedId: string) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    assert.equal(this.ensureL2Result.changeId, expectedId);
});

Then('the ensureL2 result promoted is true', function (this: ChangeDownWorld) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    assert.strictEqual(this.ensureL2Result.promoted, true);
});

Then('the ensureL2 result promoted is false', function (this: ChangeDownWorld) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    assert.strictEqual(this.ensureL2Result.promoted, false);
});

Then('the ensureL2 result text is unchanged', function (this: ChangeDownWorld) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    assert.ok(this.ensureL2DocText !== undefined, 'Original doc text not set');
    assert.equal(this.ensureL2Result.text, this.ensureL2DocText);
});

Then('the ensureL2 result text contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    assert.ok(
        this.ensureL2Result.text.includes(expected),
        `Result text does not contain "${expected}".\nText:\n${this.ensureL2Result.text}`
    );
});

Then('the ensureL2 result text matches {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    assert.ok(
        this.ensureL2Result.text.includes(expected),
        `Result text does not contain "${expected}".\nText:\n${this.ensureL2Result.text}`
    );
});

Then('the ensureL2 footnote block for {word} contains today\'s date', function (
    this: ChangeDownWorld,
    changeId: string,
) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const lines = this.ensureL2Result.text.split('\n');
    const headerPattern = new RegExp(`^\\[\\^${changeId}\\]:`);
    const headerIdx = lines.findIndex(l => headerPattern.test(l));
    assert.ok(headerIdx >= 0, `No footnote block found for ${changeId}`);

    const blockLines: string[] = [lines[headerIdx]];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        if (/^[\t ]/.test(lines[i]) || lines[i].trim() === '') {
            blockLines.push(lines[i]);
        } else {
            break;
        }
    }
    const blockText = blockLines.join('\n');
    assert.ok(
        blockText.includes(today),
        `Footnote block for ${changeId} does not contain today's date "${today}".\nBlock:\n${blockText}`
    );
});

Then('the ensureL2 footnote block for {word} contains {string}', function (
    this: ChangeDownWorld,
    changeId: string,
    expected: string,
) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    const lines = this.ensureL2Result.text.split('\n');
    const headerPattern = new RegExp(`^\\[\\^${changeId}\\]:`);
    const headerIdx = lines.findIndex(l => headerPattern.test(l));
    assert.ok(headerIdx >= 0, `No footnote block found for ${changeId}`);

    const blockLines: string[] = [lines[headerIdx]];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        if (/^[\t ]/.test(lines[i]) || lines[i].trim() === '') {
            blockLines.push(lines[i]);
        } else {
            break;
        }
    }
    const blockText = blockLines.join('\n');
    assert.ok(
        blockText.includes(expected),
        `Footnote block for ${changeId} does not contain "${expected}".\nBlock:\n${blockText}`
    );
});

Then('only the {string} change has a footnote reference in the ensureL2 result', function (
    this: ChangeDownWorld,
    expectedChange: string,
) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    const text = this.ensureL2Result.text;
    // The promoted change should have [^cn-N] after its closing delimiter
    // Parse to verify
    const parser = new CriticMarkupParser();
    const doc = parser.parse(text);
    const changes = doc.getChanges();

    const promoted = changes.filter(c => c.level !== 0);
    assert.equal(promoted.length, 1, `Expected exactly 1 promoted change, found ${promoted.length}`);
    // Verify the promoted change contains the expected text
    const promotedText = text.substring(promoted[0].contentRange.start, promoted[0].contentRange.end);
    assert.ok(
        promotedText.includes(expectedChange),
        `Promoted change contains "${promotedText}", expected "${expectedChange}"`
    );
});

Then('the {string} and {string} changes remain L0 in the ensureL2 result', function (
    this: ChangeDownWorld,
    change1: string,
    change2: string,
) {
    assert.ok(this.ensureL2Result, 'No ensureL2 result');
    const parser = new CriticMarkupParser();
    const doc = parser.parse(this.ensureL2Result.text);
    const changes = doc.getChanges();

    const l0Changes = changes.filter(c => c.level === 0);
    const l0Texts = l0Changes.map(c =>
        this.ensureL2Result!.text.substring(c.contentRange.start, c.contentRange.end)
    );

    assert.ok(
        l0Texts.some(t => t.includes(change1)),
        `"${change1}" is not an L0 change. L0 changes: ${l0Texts.join(', ')}`
    );
    assert.ok(
        l0Texts.some(t => t.includes(change2)),
        `"${change2}" is not an L0 change. L0 changes: ${l0Texts.join(', ')}`
    );
});
