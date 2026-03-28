/**
 * @fast tier step definitions for LV9 — Lifecycle journey tests.
 *
 * Journey tests chain multiple lifecycle operations in-process.
 * Each step modifies the document text using core functions and
 * passes the result to the next step via world state.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    CriticMarkupParser,
    applyReview,
    computeReplyEdit,
    computeResolutionEdit,
    computeAmendEdits,
    computeSupersedeResult,
    ensureL2,
    compactToLevel1,
    compactToLevel0,
    findFootnoteBlock,
    parseFootnoteHeader,
} from '@changedown/core';
import type { ChangeDownWorld } from './world';
import { applyEdit } from './test-utils';

// ── Extend World with journey state ─────────────────────────────────

declare module './world' {
    interface ChangeDownWorld {
        journeyDocText?: string;
        journeyAmendError?: string;
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────

Before({ tags: '@fast and @LV9' }, function (this: ChangeDownWorld) {
    this.journeyDocText = undefined;
    this.journeyAmendError = undefined;
});

// ── Helpers ──────────────────────────────────────────────────────────

function getFootnoteStatus(text: string, changeId: string): string {
    const lines = text.split('\n');
    const block = findFootnoteBlock(lines, changeId);
    assert.ok(block, `No footnote block found for ${changeId}`);
    const header = parseFootnoteHeader(lines[block.headerLine]);
    assert.ok(header, `Malformed footnote header for ${changeId}`);
    return header.status;
}

function getFootnoteText(text: string, changeId: string): string {
    const lines = text.split('\n');
    const block = findFootnoteBlock(lines, changeId);
    assert.ok(block, `No footnote block found for ${changeId}`);
    return lines.slice(block.headerLine, block.blockEnd + 1).join('\n');
}

// ── Given ────────────────────────────────────────────────────────────

Given('a journey document with text:', function (this: ChangeDownWorld, docString: string) {
    this.journeyDocText = docString;
});

// ── When: operations ─────────────────────────────────────────────────

When('{word} replies to {word} with {string}', function (
    this: ChangeDownWorld,
    author: string,
    changeId: string,
    text: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const result = computeReplyEdit(this.journeyDocText, changeId, {
        text,
        author: author.replace(/^@/, ''),
    });
    assert.ok(!result.isError, `Reply failed: ${result.isError ? result.error : ''}`);
    if (!result.isError) {
        this.journeyDocText = result.text;
    }
});

When('{word} replies to the L0 change with {string}', function (
    this: ChangeDownWorld,
    author: string,
    text: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    // Find the L0 change
    const parser = new CriticMarkupParser();
    const doc = parser.parse(this.journeyDocText);
    const changes = doc.getChanges();
    const l0 = changes.find(c => c.level === 0);
    assert.ok(l0, 'No L0 change found');

    // Promote to L2 first
    const promoted = ensureL2(this.journeyDocText, l0.range.start, {
        author: author.replace(/^@/, ''),
        type: 'ins',
    });
    this.journeyDocText = promoted.text;

    // Then reply
    const result = computeReplyEdit(this.journeyDocText, promoted.changeId, {
        text,
        author: author.replace(/^@/, ''),
    });
    assert.ok(!result.isError, `Reply failed: ${result.isError ? result.error : ''}`);
    if (!result.isError) {
        this.journeyDocText = result.text;
    }
});

When('{word} accepts {word} with reason {string}', function (
    this: ChangeDownWorld,
    author: string,
    changeId: string,
    reason: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const result = applyReview(
        this.journeyDocText,
        changeId,
        'approve',
        reason,
        author.replace(/^@/, ''),
    );
    assert.ok(!('error' in result), `Accept failed: ${'error' in result ? result.error : ''}`);
    if ('updatedContent' in result) {
        this.journeyDocText = result.updatedContent;
    }
});

When('{word} rejects {word} with reason {string}', function (
    this: ChangeDownWorld,
    author: string,
    changeId: string,
    reason: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const result = applyReview(
        this.journeyDocText,
        changeId,
        'reject',
        reason,
        author.replace(/^@/, ''),
    );
    assert.ok(!('error' in result), `Reject failed: ${'error' in result ? result.error : ''}`);
    if ('updatedContent' in result) {
        this.journeyDocText = result.updatedContent;
    }
});

When('{word} requests changes on {word} with {string}', function (
    this: ChangeDownWorld,
    author: string,
    changeId: string,
    reason: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const result = applyReview(
        this.journeyDocText,
        changeId,
        'request_changes',
        reason,
        author.replace(/^@/, ''),
    );
    assert.ok(!('error' in result), `Request-changes failed: ${'error' in result ? result.error : ''}`);
    if ('updatedContent' in result) {
        this.journeyDocText = result.updatedContent;
    }
});

When('{word} resolves {word}', function (
    this: ChangeDownWorld,
    author: string,
    changeId: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const edit = computeResolutionEdit(this.journeyDocText, changeId, {
        author: author.replace(/^@/, ''),
    });
    assert.ok(edit, `Cannot resolve ${changeId}`);
    this.journeyDocText = applyEdit(this.journeyDocText, edit);
});

When('{word} amends {word} to {string} with reason {string}', function (
    this: ChangeDownWorld,
    author: string,
    changeId: string,
    newText: string,
    reason: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const result = computeAmendEdits(this.journeyDocText, changeId, {
        newText,
        reason,
        author: author.replace(/^@/, ''),
    });
    if (result.isError) {
        this.journeyAmendError = result.error;
        return;
    }
    this.journeyDocText = result.text;
});

When('{word} tries to amend {word} to {string}', function (
    this: ChangeDownWorld,
    author: string,
    changeId: string,
    newText: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const result = computeAmendEdits(this.journeyDocText, changeId, {
        newText,
        author: author.replace(/^@/, ''),
    });
    if (result.isError) {
        this.journeyAmendError = result.error;
        return;
    }
    this.journeyDocText = result.text;
});

When('{word} supersedes {word} with {string} and reason {string}', async function (
    this: ChangeDownWorld,
    author: string,
    changeId: string,
    newText: string,
    reason: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');

    // Let computeSupersedeResult derive oldText internally from the rejected change.
    // After body reversion, the original text is back in the body — the internal
    // derivation (rejectedChange.originalText) is correct for all change types.
    const result = await computeSupersedeResult(this.journeyDocText, changeId, {
        newText,
        reason,
        author: author.replace(/^@/, ''),
    });
    assert.ok(!result.isError, `Supersede failed: ${result.isError ? result.error : ''}`);
    if (!result.isError) {
        this.journeyDocText = result.text;
    }
});

When('I compact {word} fully in the journey', function (
    this: ChangeDownWorld,
    changeId: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    // L2 -> L1
    let result = compactToLevel1(this.journeyDocText, changeId);
    // L1 -> L0: compactToLevel0 takes a change index, so re-parse to find it
    const parser = new CriticMarkupParser();
    const doc = parser.parse(result);
    const changes = doc.getChanges();
    // After L2->L1 the change no longer has its original ID in most cases,
    // but we can try to find it. If not found, just return the L1 result.
    const idx = changes.findIndex(c => c.id === changeId);
    if (idx >= 0) {
        result = compactToLevel0(result, idx);
    } else if (changes.length > 0) {
        // The change ID is gone after L2->L1 compaction (inline comment replaces footnote).
        // Find the change at level 1 that corresponds to our compacted change.
        const l1Idx = changes.findIndex(c => c.level === 1);
        if (l1Idx >= 0) {
            result = compactToLevel0(result, l1Idx);
        }
    }
    this.journeyDocText = result;
});

// ── Then: assertions ─────────────────────────────────────────────────

Then('the journey footnote for {word} contains {string}', function (
    this: ChangeDownWorld,
    changeId: string,
    expected: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const footnote = getFootnoteText(this.journeyDocText, changeId);
    assert.ok(
        footnote.includes(expected),
        `Footnote for ${changeId} does not contain "${expected}".\nFootnote:\n${footnote}`
    );
});

Then('the journey footnote for {word} has status {string}', function (
    this: ChangeDownWorld,
    changeId: string,
    expectedStatus: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const status = getFootnoteStatus(this.journeyDocText, changeId);
    assert.equal(
        status,
        expectedStatus,
        `Expected status "${expectedStatus}" for ${changeId}, got "${status}"`
    );
});

Then('the journey document text contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    assert.ok(
        this.journeyDocText.includes(expected),
        `Journey document does not contain "${expected}".\nDocument:\n${this.journeyDocText}`
    );
});

Then('the journey document text does not contain {string}', function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    assert.ok(
        !this.journeyDocText.includes(unexpected),
        `Journey document should NOT contain "${unexpected}" but it does`
    );
});

Then('the journey document contains {int} changes', function (
    this: ChangeDownWorld,
    expectedCount: number,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const parser = new CriticMarkupParser();
    const doc = parser.parse(this.journeyDocText);
    const count = doc.getChanges().length;
    assert.equal(count, expectedCount, `Expected ${expectedCount} changes, found ${count}`);
});

Then('the journey document contains a footnote reference', function (this: ChangeDownWorld) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    assert.ok(
        /\[\^cn-\d+\]/.test(this.journeyDocText),
        'Document does not contain a footnote reference'
    );
});

Then('the journey document contains a footnote block for {word}', function (
    this: ChangeDownWorld,
    changeId: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const pattern = new RegExp(`^\\[\\^${changeId}\\]:`, 'm');
    assert.ok(
        pattern.test(this.journeyDocText),
        `Document does not contain a footnote block for ${changeId}`
    );
});

Then('the journey document has {int} changes with status {string}', function (
    this: ChangeDownWorld,
    expectedCount: number,
    expectedStatus: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const parser = new CriticMarkupParser();
    const doc = parser.parse(this.journeyDocText);
    const changes = doc.getChanges();
    const matching = changes.filter(c => {
        try {
            const status = getFootnoteStatus(this.journeyDocText!, c.id);
            return status === expectedStatus;
        } catch {
            return false;
        }
    });
    assert.equal(
        matching.length,
        expectedCount,
        `Expected ${expectedCount} changes with status "${expectedStatus}", found ${matching.length}`
    );
});

Then('the journey document has {int} change with status {string}', function (
    this: ChangeDownWorld,
    expectedCount: number,
    expectedStatus: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const parser = new CriticMarkupParser();
    const doc = parser.parse(this.journeyDocText);
    const changes = doc.getChanges();
    const matching = changes.filter(c => {
        try {
            const status = getFootnoteStatus(this.journeyDocText!, c.id);
            return status === expectedStatus;
        } catch {
            return false;
        }
    });
    assert.equal(
        matching.length,
        expectedCount,
        `Expected ${expectedCount} change(s) with status "${expectedStatus}", found ${matching.length}`
    );
});

Then('the journey amend is rejected with {string}', function (
    this: ChangeDownWorld,
    expectedError: string,
) {
    assert.ok(this.journeyAmendError, 'Expected amend error but none was set');
    assert.ok(
        this.journeyAmendError.includes(expectedError),
        `Expected error containing "${expectedError}", got "${this.journeyAmendError}"`
    );
});

Then('a new {word} change exists in the journey document', function (
    this: ChangeDownWorld,
    changeId: string,
) {
    assert.ok(this.journeyDocText !== undefined, 'Journey document not set');
    const pattern = new RegExp(`\\[\\^${changeId}\\]:`);
    assert.ok(
        pattern.test(this.journeyDocText),
        `No footnote definition for ${changeId} found in document`
    );
});
