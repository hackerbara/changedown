/**
 * @fast tier step definitions for LV6 — Supersede change.
 *
 * Tests supersede logic as pure functions (no VS Code launch).
 * A different author can atomically reject a proposed change and
 * propose a replacement, linking both via supersedes/superseded-by.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    computeSupersedeResult as coreSupersedeResult,
    ChangeType,
} from '@changetracks/core';
import type { SupersedeResult } from '@changetracks/core';
import type { ChangeTracksWorld } from './world';
import { extractFootnoteStatus, extractFootnoteBlock, findChangeById } from './test-utils';

// -- Extend World with supersede state ------------------------------------

declare module './world' {
    interface ChangeTracksWorld {
        supersedeDocText?: string;
        supersedeResultText?: string;
        supersedeAuthor?: string;
        supersedeError?: string;
    }
}

// -- Lifecycle ------------------------------------------------------------

Before({ tags: '@fast and @LV6' }, function (this: ChangeTracksWorld) {
    this.supersedeDocText = undefined;
    this.supersedeResultText = undefined;
    this.supersedeAuthor = undefined;
    this.supersedeError = undefined;
});

// -- Step definitions -----------------------------------------------------

Given('a supersede document with text:', function (this: ChangeTracksWorld, docString: string) {
    this.supersedeDocText = docString;
});

Given('supersede author is {string}', function (this: ChangeTracksWorld, author: string) {
    this.supersedeAuthor = author;
});

When('I supersede {word} with {string} and reason {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    newText: string,
    reason: string,
) {
    assert.ok(this.supersedeDocText !== undefined, 'Document text not set');
    assert.ok(this.supersedeAuthor, 'Supersede author not set');

    // Extract the text that will remain after rejection to use as oldText
    // for the replacement proposal. For substitutions, rejection keeps the
    // original text (before ~>). For insertions, rejection removes the text
    // entirely, so oldText is empty and we use insertAfter instead.
    const change = findChangeById(this.supersedeDocText, changeId);
    assert.ok(change, `Change ${changeId} not found in document`);

    let oldText: string | undefined;
    let insertAfter: string | undefined;
    if (change.type === ChangeType.Substitution) {
        // After rejecting a substitution, the original text remains
        oldText = change.originalText ?? '';
    } else if (change.type === ChangeType.Insertion) {
        // After rejecting an insertion, the text is removed entirely;
        // use text before the change as insertAfter anchor
        const beforeChange = this.supersedeDocText.slice(
            Math.max(0, change.range.start - 20),
            change.range.start,
        );
        insertAfter = beforeChange;
    }

    const result: SupersedeResult = coreSupersedeResult(
        this.supersedeDocText,
        changeId,
        {
            newText,
            oldText,
            reason,
            author: this.supersedeAuthor,
            insertAfter,
        },
    );

    if (result.isError) {
        throw new Error(`Supersede failed: ${result.error}`);
    }

    this.supersedeResultText = result.text;
});

When('I try to supersede {word} with {string} and reason {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    newText: string,
    reason: string,
) {
    assert.ok(this.supersedeDocText !== undefined, 'Document text not set');
    assert.ok(this.supersedeAuthor, 'Supersede author not set');

    // Compute oldText/insertAfter same as the success path so we reach
    // the actual validation logic (e.g. same-author guard) instead of
    // failing on missing anchor parameters.
    let oldText: string | undefined;
    let insertAfter: string | undefined;
    try {
        const change = findChangeById(this.supersedeDocText, changeId);
        if (change) {
            if (change.type === ChangeType.Substitution) {
                oldText = change.originalText ?? '';
            } else if (change.type === ChangeType.Insertion) {
                const beforeChange = this.supersedeDocText.slice(
                    Math.max(0, change.range.start - 20),
                    change.range.start,
                );
                insertAfter = beforeChange;
            }
        }
    } catch {
        // If change not found, let coreSupersedeResult handle the error
    }

    const result: SupersedeResult = coreSupersedeResult(
        this.supersedeDocText,
        changeId,
        {
            newText,
            oldText,
            reason,
            author: this.supersedeAuthor,
            insertAfter,
        },
    );

    if (result.isError) {
        this.supersedeError = result.error;
        return;
    }

    this.supersedeResultText = result.text;
});

Then('the supersede result footnote status for {word} is {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    expectedStatus: string,
) {
    assert.ok(this.supersedeResultText, 'No supersede result -- run a supersede action first');
    const status = extractFootnoteStatus(this.supersedeResultText, changeId);
    assert.equal(
        status,
        expectedStatus,
        `Expected footnote status "${expectedStatus}" for ${changeId}, got "${status}".\nResult:\n${this.supersedeResultText}`,
    );
});

Then('a new change exists in the supersede result with text {string}', function (
    this: ChangeTracksWorld,
    expectedText: string,
) {
    assert.ok(this.supersedeResultText, 'No supersede result -- run a supersede action first');
    assert.ok(
        this.supersedeResultText.includes(expectedText),
        `Supersede result does not contain "${expectedText}".\nFull result:\n${this.supersedeResultText}`,
    );
});

Then('the new change supersede result footnote contains {string}', function (
    this: ChangeTracksWorld,
    expected: string,
) {
    assert.ok(this.supersedeResultText, 'No supersede result -- run a supersede action first');

    // Find the NEW footnote (ct-2, since ct-1 is the original)
    // Scan for all footnote IDs and pick the one that isn't ct-1
    const footnotePattern = /\[(\^ct-\d+)\]:/g;
    const ids: string[] = [];
    let match;
    while ((match = footnotePattern.exec(this.supersedeResultText)) !== null) {
        ids.push(match[1].replace('^', ''));
    }
    const newId = ids.find(id => id !== 'ct-1');
    assert.ok(newId, `No new footnote found (only found: ${ids.join(', ')}).\nResult:\n${this.supersedeResultText}`);

    // Extract specifically the new change's footnote block
    const block = extractFootnoteBlock(this.supersedeResultText, newId);
    assert.ok(block, `No footnote block found for ${newId}.\nResult:\n${this.supersedeResultText}`);
    assert.ok(
        block.includes(expected),
        `New change (${newId}) footnote does not contain "${expected}".\nBlock:\n${block}`,
    );
});

Then('the supersede is rejected', function (this: ChangeTracksWorld) {
    assert.ok(this.supersedeError, 'Expected supersede to be rejected but no error was set');
});

Then('the supersede is rejected with {string}', function (this: ChangeTracksWorld, expectedError: string) {
    assert.ok(this.supersedeError, 'Expected supersede to be rejected but no error was set');
    assert.ok(
        this.supersedeError.includes(expectedError),
        `Expected supersede error containing "${expectedError}", got "${this.supersedeError}"`,
    );
});

Then('the supersede result footnote for {word} contains {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    expected: string,
) {
    assert.ok(this.supersedeResultText, 'No supersede result -- run a supersede action first');
    const block = extractFootnoteBlock(this.supersedeResultText, changeId);
    assert.ok(block, `No footnote block found for ${changeId}`);
    assert.ok(
        block.includes(expected),
        `Footnote for ${changeId} does not contain "${expected}".\nBlock:\n${block}`,
    );
});
