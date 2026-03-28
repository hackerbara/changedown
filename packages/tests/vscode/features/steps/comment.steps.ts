/**
 * @fast tier step definitions for comment insertion tests (COM1).
 *
 * Tests the core insertComment function from @changedown/core.
 * No VS Code dependency — pure in-process text transformation tests.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { insertComment } from '@changedown/core';
import type { TextEdit } from '@changedown/core';
import type { ChangeDownWorld } from './world';

// ── Extend ChangeDownWorld with comment insertion state ─────────────

declare module './world' {
    interface ChangeDownWorld {
        commentDocText?: string;
        commentCursorOffset?: number;
        commentSelectionStart?: number;
        commentSelectionEnd?: number;
        commentSelectedText?: string;
        commentResultText?: string;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

function applyEdit(text: string, edit: TextEdit): string {
    return text.substring(0, edit.offset) + edit.newText + text.substring(edit.offset + edit.length);
}

// ── Given ────────────────────────────────────────────────────────────

Given('a comment document with text {string}', function (this: ChangeDownWorld, text: string) {
    this.commentDocText = text;
    this.commentResultText = undefined;
    this.commentSelectionStart = undefined;
    this.commentSelectionEnd = undefined;
    this.commentSelectedText = undefined;
});

Given('no text is selected', function (this: ChangeDownWorld) {
    this.commentSelectionStart = undefined;
    this.commentSelectionEnd = undefined;
    this.commentSelectedText = undefined;
});

Given('the comment cursor is at offset {int}', function (this: ChangeDownWorld, offset: number) {
    this.commentCursorOffset = offset;
});

Given('text is selected from offset {int} to offset {int}', function (this: ChangeDownWorld, start: number, end: number) {
    assert.ok(this.commentDocText !== undefined, 'Comment document text not set');
    this.commentSelectionStart = start;
    this.commentSelectionEnd = end;
    this.commentSelectedText = this.commentDocText!.substring(start, end);
    this.commentCursorOffset = end; // cursor is at the end of selection
});

// ── When ─────────────────────────────────────────────────────────────

When('I insert comment {string}', function (this: ChangeDownWorld, commentText: string) {
    assert.ok(this.commentDocText !== undefined, 'Comment document text not set');
    assert.ok(this.commentCursorOffset !== undefined, 'Comment cursor offset not set');

    let edit: TextEdit;
    if (this.commentSelectionStart !== undefined && this.commentSelectionEnd !== undefined) {
        edit = insertComment(
            commentText,
            this.commentCursorOffset!,
            { start: this.commentSelectionStart!, end: this.commentSelectionEnd! },
            this.commentSelectedText!
        );
    } else {
        edit = insertComment(commentText, this.commentCursorOffset!);
    }

    this.commentResultText = applyEdit(this.commentDocText!, edit);
});

When('I insert another comment at offset {int} with text {string}', function (
    this: ChangeDownWorld, offset: number, commentText: string
) {
    assert.ok(this.commentResultText !== undefined, 'No previous comment result to build on');

    const edit = insertComment(commentText, offset);
    this.commentResultText = applyEdit(this.commentResultText!, edit);
});

// ── Then ─────────────────────────────────────────────────────────────

Then('the comment result text contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.commentResultText !== undefined, 'No comment result text');
    assert.ok(
        this.commentResultText!.includes(expected),
        `Expected result to contain "${expected}" but got: ${this.commentResultText}`
    );
});

Then('the comment result text contains at least {int} comment marker(s)', function (
    this: ChangeDownWorld, minCount: number
) {
    assert.ok(this.commentResultText !== undefined, 'No comment result text');
    const matches = this.commentResultText!.match(/\{>>/g) || [];
    assert.ok(
        matches.length >= minCount,
        `Expected at least ${minCount} comment markers, found ${matches.length} in: ${this.commentResultText}`
    );
});
