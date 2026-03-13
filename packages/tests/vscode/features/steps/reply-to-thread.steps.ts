/**
 * @fast tier step definitions for LV3 — Reply to thread.
 *
 * Tests reply-to-thread logic as pure functions (no VS Code launch).
 * For L2 footnotes: uses findFootnoteBlock + findDiscussionInsertionIndex
 * to locate insertion point, then splices in a formatted discussion line.
 * For L1 changes: promotes to L2 via promoteToLevel2, then appends the reply.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    CriticMarkupParser,
    scanMaxCtId,
    promoteToLevel2,
    ensureL2,
    findFootnoteBlock,
    findDiscussionInsertionIndex,
} from '@changetracks/core';
import type { TextEdit } from '@changetracks/core';
import type { ChangeTracksWorld } from './world';
import { applyEdit, TEST_DATE } from './test-utils';

// ── Extend World with reply state ─────────────────────────────────

declare module './world' {
    interface ChangeTracksWorld {
        replyDocText?: string;
        replyResultText?: string;
    }
}

// ── Lifecycle ─────────────────────────────────────────────────────

Before({ tags: '@fast and @LV3' }, function (this: ChangeTracksWorld) {
    this.replyDocText = undefined;
    this.replyResultText = undefined;
});

// ── Pure helpers ──────────────────────────────────────────────────

/**
 * Format a reply as a footnote discussion entry with deterministic date.
 * Mirrors footnote-writer.ts:formatReply() but uses fixed date for tests.
 */
function formatReplyLine(author: string, text: string): string {
    const lines = text.split('\n');
    const first = `\n    @${author} ${TEST_DATE}: ${lines[0]}`;
    const rest = lines.slice(1).map(l => `    ${l}`).join('\n');
    return rest ? `${first}\n${rest}` : first;
}

/**
 * Insert a reply into an existing L2 footnote block.
 * Uses core's findFootnoteBlock + findDiscussionInsertionIndex to locate
 * the correct insertion point, then uses shared applyEdit for the splice.
 */
function insertReplyIntoFootnote(docText: string, changeId: string, author: string, replyText: string): string {
    const lines = docText.split('\n');
    const block = findFootnoteBlock(lines, changeId);
    assert.ok(block, `No footnote block found for ${changeId}`);

    const insertAfterLine = findDiscussionInsertionIndex(lines, block.headerLine, block.blockEnd);
    const replyLine = formatReplyLine(author, replyText);

    // Calculate offset at end of insertAfterLine
    const offset = lines.slice(0, insertAfterLine + 1).join('\n').length;
    const edit: TextEdit = { offset, length: 0, newText: replyLine };
    return applyEdit(docText, edit);
}

// ── Step definitions ─────────────────────────────────────────────

Given('a reply document with text:', function (this: ChangeTracksWorld, docString: string) {
    this.replyDocText = docString;
});

When('I reply to {word} with {string}', function (this: ChangeTracksWorld, changeId: string, replyText: string) {
    assert.ok(this.replyDocText !== undefined, 'Document text not set — call "a reply document with text:" first');
    const text = replyText.replace(/\\n/g, '\n');
    this.replyResultText = insertReplyIntoFootnote(this.replyDocText, changeId, 'bob', text);
});

When('I reply to the L1 change with {string}', function (this: ChangeTracksWorld, replyText: string) {
    assert.ok(this.replyDocText !== undefined, 'Document text not set — call "a reply document with text:" first');

    // Parse document to find the L1 change
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(this.replyDocText);
    const changes = vdoc.getChanges();
    const l1Index = changes.findIndex(c => c.level === 1);
    assert.ok(l1Index >= 0, 'No L1 change found in document');

    // Allocate a new ct-ID
    const maxId = scanMaxCtId(this.replyDocText);
    const newId = `ct-${maxId + 1}`;

    // Promote L1 to L2: removes inline comment, adds [^ct-N] ref and footnote definition
    let result = promoteToLevel2(this.replyDocText, l1Index, newId);

    // Append the reply as a discussion line in the new footnote
    result = insertReplyIntoFootnote(result, newId, 'bob', replyText);

    this.replyResultText = result;
});

When('I reply again to {word} with {string} as {string}', function (
    this: ChangeTracksWorld,
    changeId: string,
    replyText: string,
    author: string,
) {
    // Chain reply on the previous result text
    const baseText = this.replyResultText ?? this.replyDocText;
    assert.ok(baseText !== undefined, 'No document text to reply to');
    const authorBare = author.replace(/^["@]/g, '').replace(/"$/, '');
    this.replyResultText = insertReplyIntoFootnote(baseText, changeId, authorBare, replyText);
});

When('I reply to the L0 change at offset {int} with {string}', function (
    this: ChangeTracksWorld,
    offset: number,
    replyText: string,
) {
    assert.ok(this.replyDocText !== undefined, 'Document text not set');

    // Promote L0 to L2 via ensureL2
    const promoted = ensureL2(this.replyDocText, offset, {
        author: 'alice',
        type: 'ins',
    });
    assert.ok(promoted.promoted, 'Expected L0 change to be promoted to L2');

    // Append the reply
    this.replyResultText = insertReplyIntoFootnote(promoted.text, promoted.changeId, 'bob', replyText);
});

Then('the reply result footnote for {word} contains {string}', function (this: ChangeTracksWorld, changeId: string, expected: string) {
    assert.ok(this.replyResultText, 'No reply result — run a reply action first');

    // Extract the footnote block for the given change ID
    const lines = this.replyResultText.split('\n');
    const block = findFootnoteBlock(lines, changeId);
    assert.ok(block, `No footnote block found for ${changeId} in result`);

    // Collect all lines in the block
    const blockLines = lines.slice(block.headerLine, block.blockEnd + 1).join('\n');
    assert.ok(
        blockLines.includes(expected),
        `Footnote block for ${changeId} does not contain "${expected}".\nBlock:\n${blockLines}`
    );
});

Then('the reply result contains a footnote reference', function (this: ChangeTracksWorld) {
    assert.ok(this.replyResultText, 'No reply result — run a reply action first');
    assert.ok(
        /\[\^ct-\d+\]/.test(this.replyResultText) &&
        // Ensure there's an inline ref (not just the definition)
        /\[\^ct-\d+\][^:]/.test(this.replyResultText),
        `Reply result does not contain a footnote reference.\nResult:\n${this.replyResultText}`
    );
});

Then('the reply result contains a footnote block', function (this: ChangeTracksWorld) {
    assert.ok(this.replyResultText, 'No reply result — run a reply action first');
    assert.ok(
        /^\[\^ct-\d+\]:/m.test(this.replyResultText),
        `Reply result does not contain a footnote definition block.\nResult:\n${this.replyResultText}`
    );
});

Then('the reply result footnote contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.replyResultText, 'No reply result — run a reply action first');

    // Find the first footnote block in the result
    const lines = this.replyResultText.split('\n');
    const footnoteStartIdx = lines.findIndex(l => /^\[\^ct-\d+\]:/.test(l));
    assert.ok(footnoteStartIdx >= 0, `No footnote found in reply result.\nResult:\n${this.replyResultText}`);

    // Collect all footnote lines (header + indented body)
    const footnoteLines: string[] = [lines[footnoteStartIdx]];
    for (let i = footnoteStartIdx + 1; i < lines.length; i++) {
        if (lines[i].trim() === '' || /^[\t ]/.test(lines[i])) {
            footnoteLines.push(lines[i]);
        } else {
            break;
        }
    }
    const footnoteText = footnoteLines.join('\n');
    assert.ok(
        footnoteText.includes(expected),
        `Footnote does not contain "${expected}".\nFootnote:\n${footnoteText}`
    );
});
