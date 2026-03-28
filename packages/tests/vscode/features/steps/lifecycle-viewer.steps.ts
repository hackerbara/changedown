/**
 * @fast tier step definitions for LV1 -- cn-ID lifecycle viewer.
 *
 * Tests the thread-building logic as pure functions (no VS Code Comment API).
 * Parses document text with CriticMarkupParser, then builds ThreadData[]
 * using the extracted pure functions from thread-data.ts.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser } from '@changedown/core';
import { buildThreadDataForChanges } from 'changedown-vscode/internals';
import type { CommentData, ThreadData } from 'changedown-vscode/internals';
import type { ChangeDownWorld } from './world';

// Re-export types and builder so other step files can import them
export type { CommentData, ThreadData };
export { buildThreadDataForChanges };

// ── Extend World with lifecycle viewer state ────────────────────────

declare module './world' {
    interface ChangeDownWorld {
        lifecycleThreads?: ThreadData[];
        lifecycleDocText?: string;
        lifecycleViewMode?: string;
    }
}

// ── Lifecycle ───────────────────────────────────────────────────────

Before({ tags: '@fast and (@LV1 or @LV7)' }, function (this: ChangeDownWorld) {
    this.lifecycleThreads = undefined;
    this.lifecycleDocText = undefined;
    this.lifecycleViewMode = undefined;
});

// ── Step definitions ────────────────────────────────────────────────

Given('a lifecycle document with text:', function (this: ChangeDownWorld, docString: string) {
    this.lifecycleDocText = docString;
});

When('I build comment threads', async function (this: ChangeDownWorld) {
    assert.ok(this.lifecycleDocText !== undefined, 'Document text not set — call "a document with text:" first');
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(this.lifecycleDocText);
    const changes = vdoc.getChanges();
    this.lifecycleThreads = buildThreadDataForChanges(changes, this.lifecycleViewMode);
});

Then('a thread exists for {string}', function (this: ChangeDownWorld, threadId: string) {
    assert.ok(this.lifecycleThreads, 'No threads built — call "I build comment threads" first');
    const thread = this.lifecycleThreads.find(t => t.id === threadId);
    assert.ok(thread, `No thread found for id "${threadId}". Available: ${this.lifecycleThreads.map(t => t.id).join(', ') || '(none)'}`);
});

Then('the thread label is {string}', function (this: ChangeDownWorld, expectedLabel: string) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.ok(this.lifecycleThreads.length > 0, 'No threads exist');
    const thread = this.lifecycleThreads[0];
    assert.strictEqual(thread.label, expectedLabel, `Expected label "${expectedLabel}", got "${thread.label}"`);
});

Then('the first comment body contains {string}', function (this: ChangeDownWorld, expectedText: string) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.ok(this.lifecycleThreads.length > 0, 'No threads exist');
    const thread = this.lifecycleThreads[0];
    assert.ok(thread.comments.length > 0, 'Thread has no comments');
    const firstBody = thread.comments[0].body;
    assert.ok(
        firstBody.includes(expectedText),
        `First comment body does not contain "${expectedText}". Got: "${firstBody}"`
    );
});

Then('no threads exist', async function (this: ChangeDownWorld) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.strictEqual(this.lifecycleThreads.length, 0, `Expected 0 threads, got ${this.lifecycleThreads.length}`);
});

Then('the thread has {int} comments', function (this: ChangeDownWorld, expectedCount: number) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.ok(this.lifecycleThreads.length > 0, 'No threads exist');
    const thread = this.lifecycleThreads[0];
    assert.strictEqual(
        thread.comments.length,
        expectedCount,
        `Expected ${expectedCount} comments, got ${thread.comments.length}. Comments:\n${thread.comments.map((c, i) => `  [${i}] ${c.author}: ${c.body}`).join('\n')}`
    );
});

Then('comment {int} author is {string}', function (this: ChangeDownWorld, commentIndex: number, expectedAuthor: string) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.ok(this.lifecycleThreads.length > 0, 'No threads exist');
    const thread = this.lifecycleThreads[0];
    // comment index is 1-based in Gherkin, but maps to 0-based + 1 in the comments array
    // (comment 1 = summary, comment 2 = first discussion entry, etc.)
    const idx = commentIndex - 1;
    assert.ok(idx < thread.comments.length, `Comment ${commentIndex} does not exist (only ${thread.comments.length} comments)`);
    assert.strictEqual(thread.comments[idx].author, expectedAuthor, `Comment ${commentIndex}: expected author "${expectedAuthor}", got "${thread.comments[idx].author}"`);
});

Then('comment {int} body contains {string}', function (this: ChangeDownWorld, commentIndex: number, expectedText: string) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.ok(this.lifecycleThreads.length > 0, 'No threads exist');
    const thread = this.lifecycleThreads[0];
    const idx = commentIndex - 1;
    assert.ok(idx < thread.comments.length, `Comment ${commentIndex} does not exist (only ${thread.comments.length} comments)`);
    assert.ok(
        thread.comments[idx].body.includes(expectedText),
        `Comment ${commentIndex} body does not contain "${expectedText}". Got: "${thread.comments[idx].body}"`
    );
});

Then('the last comment body contains {string}', function (this: ChangeDownWorld, expectedText: string) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.ok(this.lifecycleThreads.length > 0, 'No threads exist');
    const thread = this.lifecycleThreads[0];
    assert.ok(thread.comments.length > 0, 'Thread has no comments');
    const lastBody = thread.comments[thread.comments.length - 1].body;
    assert.ok(
        lastBody.includes(expectedText),
        `Last comment body does not contain "${expectedText}". Got: "${lastBody}"`
    );
});

Then('{int} thread exists', function (this: ChangeDownWorld, expectedCount: number) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.strictEqual(
        this.lifecycleThreads.length,
        expectedCount,
        `Expected ${expectedCount} thread(s), got ${this.lifecycleThreads.length}`
    );
});

// ── LV7: View mode surface visibility ──────────────────────────────

Given('view mode is {string}', function (this: ChangeDownWorld, mode: string) {
    this.lifecycleViewMode = mode;
});

Then('{int} threads exist with gutter presence', function (this: ChangeDownWorld, expectedCount: number) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.strictEqual(
        this.lifecycleThreads.length,
        expectedCount,
        `Expected ${expectedCount} thread(s) with gutter presence, got ${this.lifecycleThreads.length}`
    );
});

Then('no threads are visible', function (this: ChangeDownWorld) {
    assert.ok(this.lifecycleThreads, 'No threads built');
    assert.strictEqual(
        this.lifecycleThreads.length,
        0,
        `Expected 0 visible threads, got ${this.lifecycleThreads.length}`
    );
});
