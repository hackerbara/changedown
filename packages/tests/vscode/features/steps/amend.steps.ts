/**
 * @fast tier step definitions for LV5 — Amend own comment.
 *
 * Tests amend logic as pure functions (no VS Code launch).
 * Same-author can amend their inline text and the footnote records
 * revision history (revised + previous lines).
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    computeAmendEdits as coreComputeAmendEdits,
} from '@changetracks/core';
import type { AmendResult } from '@changetracks/core';
import type { ChangeTracksWorld } from './world';
import { TEST_DATE } from './test-utils';

// ── Extend World with amend state ────────────────────────────────────

declare module './world' {
    interface ChangeTracksWorld {
        amendDocText?: string;
        amendResultText?: string;
        amendAuthor?: string;
        amendError?: string;
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────

Before({ tags: '@fast and @LV5' }, function (this: ChangeTracksWorld) {
    this.amendDocText = undefined;
    this.amendResultText = undefined;
    this.amendAuthor = undefined;
    this.amendError = undefined;
});

// ── Constants ────────────────────────────────────────────────────────

const PROPOSED_INSERTION_DOC = `Hello {++world++}[^ct-1]

[^ct-1]: @alice | 2026-03-09 | insertion | proposed
    reason: Initial insertion`;

// ── Step definitions ─────────────────────────────────────────────────

Given('an amend document with text:', function (this: ChangeTracksWorld, docString: string) {
    this.amendDocText = docString;
});

Given('current amend author is {string}', function (this: ChangeTracksWorld, author: string) {
    this.amendAuthor = author;
});

Given('an amend document with a proposed insertion ct-1 by {string}', function (this: ChangeTracksWorld, _author: string) {
    // Use the fixture with the given author (alice is the default fixture author)
    this.amendDocText = PROPOSED_INSERTION_DOC;
});

When('I amend {word} inline text to {string} with reason {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    newText: string,
    reason: string,
) {
    assert.ok(this.amendDocText !== undefined, 'Document text not set');
    assert.ok(this.amendAuthor, 'Amend author not set');

    const result: AmendResult = coreComputeAmendEdits(this.amendDocText, changeId, {
        newText,
        reason,
        author: this.amendAuthor,
        date: TEST_DATE,
    });

    if (result.isError) {
        this.amendError = result.error;
        return;
    }

    this.amendResultText = result.text;
});

When('I try to amend {word}', function (this: ChangeTracksWorld, changeId: string) {
    assert.ok(this.amendDocText !== undefined, 'Document text not set');
    assert.ok(this.amendAuthor, 'Amend author not set');

    const result: AmendResult = coreComputeAmendEdits(this.amendDocText, changeId, {
        newText: 'dummy',
        author: this.amendAuthor,
        date: TEST_DATE,
    });

    if (result.isError) {
        if (result.error.includes('same-author') || result.error.includes('not the original author')) {
            this.amendError = 'same-author';
        } else {
            this.amendError = result.error;
        }
        return;
    }

    this.amendResultText = result.text;
});

When('I try to amend {word} with new text {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    newText: string,
) {
    assert.ok(this.amendDocText !== undefined, 'Document text not set');
    assert.ok(this.amendAuthor, 'Amend author not set');

    const result: AmendResult = coreComputeAmendEdits(this.amendDocText, changeId, {
        newText,
        author: this.amendAuthor,
        date: TEST_DATE,
    });

    if (result.isError) {
        this.amendError = result.error;
        return;
    }

    this.amendResultText = result.text;
});

When('I amend {word} again to {string} with reason {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    newText: string,
    reason: string,
) {
    // Chain amend on the previous result
    const baseText = this.amendResultText ?? this.amendDocText;
    assert.ok(baseText !== undefined, 'No document text to amend');
    assert.ok(this.amendAuthor, 'Amend author not set');

    const result: AmendResult = coreComputeAmendEdits(baseText, changeId, {
        newText,
        reason,
        author: this.amendAuthor,
        date: TEST_DATE,
    });

    if (result.isError) {
        this.amendError = result.error;
        return;
    }

    this.amendResultText = result.text;
});

Then('the amend result inline markup contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.amendResultText, 'No amend result — run an amend action first');
    assert.ok(
        this.amendResultText.includes(expected),
        `Amend result does not contain "${expected}".\nFull result:\n${this.amendResultText}`
    );
});

Then('the amend result footnote contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.amendResultText, 'No amend result — run an amend action first');

    // Extract footnote section (everything from first [^ct- definition onward)
    const lines = this.amendResultText.split('\n');
    const footnoteStart = lines.findIndex(l => /^\[\^ct-\d+\]:/.test(l));
    assert.ok(footnoteStart >= 0, `No footnote found in amend result.\nResult:\n${this.amendResultText}`);
    const footnoteText = lines.slice(footnoteStart).join('\n');
    assert.ok(
        footnoteText.includes(expected),
        `Amend result footnote does not contain "${expected}".\nFootnote:\n${footnoteText}`
    );
});

Then('the amend is rejected with {string}', function (this: ChangeTracksWorld, expectedError: string) {
    assert.ok(this.amendError, 'Expected amend error but none was set');
    assert.ok(
        this.amendError.includes(expectedError),
        `Expected amend error containing "${expectedError}", got "${this.amendError}"`
    );
});
