/**
 * @slow tier step definitions for SL-TH — Comment thread lifecycle in running VS Code.
 *
 * Phase-specific steps only. Shared steps (launch, parsing, cursor positioning,
 * footnote assertions, screenshots, view mode) are in sl-shared.steps.ts.
 *
 * Fixture: packages/tests/vscode/fixtures/journeys/lifecycle-threads.md
 */

import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeDownWorld } from './world';
import {
    getCommentThreads,
    getDocumentText,
    executeCommandViaBridge,
    setCursorPosition,
} from '../../journeys/playwrightHarness';
import { findLineNumber, extractFootnoteBlock } from './sl-shared.steps';

// ── Then: comment thread existence ──────────────────────────────────

Then(
    'comment threads exist for {word}, {word}, {word}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, id1: string, id2: string, id3: string) {
        assert.ok(this.page, 'Page not available');
        const { threads } = await getCommentThreads(this.page);
        const ids = threads.map(t => t.changeId);
        for (const id of [id1, id2, id3]) {
            assert.ok(
                ids.includes(id),
                `Expected thread for ${id} to exist. Found thread IDs: [${ids.join(', ')}]`
            );
        }
    }
);

// ── Then: thread count ───────────────────────────────────────────────

Then(
    'the thread count is {int}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, expected: number) {
        assert.ok(this.page, 'Page not available');
        // Poll briefly in case threads are still updating after a view mode switch
        const deadline = Date.now() + 5000;
        let count = -1;
        while (Date.now() < deadline) {
            const result = await getCommentThreads(this.page);
            count = result.count;
            if (count === expected) return;
            await this.page!.waitForTimeout(300);
        }
        assert.strictEqual(count, expected, `Expected thread count ${expected}, got ${count}`);
    }
);

// ── Then: discussion comment count ───────────────────────────────────

Then(
    'the thread for {word} has {int} discussion comment(s)',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string, expectedCount: number) {
        assert.ok(this.page, 'Page not available');
        const { threads } = await getCommentThreads(this.page);
        const thread = threads.find(t => t.changeId === changeId);
        assert.ok(
            thread !== undefined,
            `No thread found for ${changeId}. Available: [${threads.map(t => t.changeId).join(', ')}]`
        );
        assert.strictEqual(
            thread.commentCount,
            expectedCount,
            `Expected ${expectedCount} discussion comment(s) for ${changeId}, got ${thread.commentCount}`
        );
    }
);

// ── Then: thread state ───────────────────────────────────────────────

Then(
    'the thread for {word} has state {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string, expectedState: string) {
        assert.ok(this.page, 'Page not available');
        const { threads } = await getCommentThreads(this.page);
        const thread = threads.find(t => t.changeId === changeId);
        assert.ok(
            thread !== undefined,
            `No thread found for ${changeId}. Available: [${threads.map(t => t.changeId).join(', ')}]`
        );
        assert.strictEqual(
            thread.state,
            expectedState,
            `Expected thread state "${expectedState}" for ${changeId}, got "${thread.state}"`
        );
    }
);

// ── When: open comment thread for a change ───────────────────────────

When(
    'I open the comment thread for {word}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        // Find the line containing the footnote reference marker and position cursor there
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        const refPattern = `[^${changeId}]`;
        const lineNum = findLineNumber(text, refPattern);
        assert.ok(lineNum > 0, `Could not find ${changeId} reference in document`);
        await this.page.click('.monaco-editor .view-lines');
        await this.page.waitForTimeout(100);
        await setCursorPosition(this.page, lineNum, 15);
        await this.page.waitForTimeout(500);
        // Trigger the comment peek widget via bridge command
        await executeCommandViaBridge(this.page, 'changedown.openCommentThread');
        await this.page.waitForTimeout(1000);
    }
);

// ── When: type in reply box ───────────────────────────────────────────

When(
    'I type {string} in the reply box',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, text: string) {
        assert.ok(this.page, 'Page not available');
        // The comment peek widget reply textarea
        const replyBox = await this.page.$(
            '.review-widget textarea, .comment-widget textarea, .comment-thread-widget textarea'
        );
        if (replyBox) {
            await replyBox.focus();
            await replyBox.fill(text);
        } else {
            // Fallback: try clicking an active textarea and typing
            await this.page.keyboard.type(text);
        }
        await this.page.waitForTimeout(300);
    }
);

// ── When: click Reply button ──────────────────────────────────────────

When(
    'I click the Reply button',
    { timeout: 15000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');
        // Look for Submit/Reply button in the comment peek widget
        const replyBtn = await this.page.$(
            '.review-widget .action-label[title*="Reply"], ' +
            '.comment-widget .action-label[title*="Reply"], ' +
            '.comment-thread-widget .action-label[title*="Submit"], ' +
            '.comment-thread-widget button[title*="Reply"]'
        );
        if (replyBtn) {
            await replyBtn.click();
        } else {
            // Fallback: submit via keyboard shortcut (Ctrl+Enter in comment widgets)
            await this.page.keyboard.press('Control+Enter');
        }
        await this.page.waitForTimeout(1000);
    }
);

// ── When: execute command on a change ID ─────────────────────────────

When(
    'I execute {string} on {word}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, command: string, changeId: string) {
        assert.ok(this.page, 'Page not available');
        // Position cursor inside the change so context commands operate on the right change
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        const refPattern = `[^${changeId}]`;
        const lineNum = findLineNumber(text, refPattern);
        assert.ok(lineNum > 0, `Could not find ${changeId} reference in document`);
        await this.page.click('.monaco-editor .view-lines');
        await this.page.waitForTimeout(100);
        await setCursorPosition(this.page, lineNum, 15);
        await this.page.waitForTimeout(300);
        // Execute the command via bridge
        await executeCommandViaBridge(this.page, command);
        await this.page.waitForTimeout(500);
    }
);

// ── Then: footnote does NOT contain ──────────────────────────────────

Then(
    'the document footnote for {word} does not contain {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string, unexpected: string) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 5000;
        let footnote = '';
        while (Date.now() < deadline) {
            const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
            footnote = extractFootnoteBlock(text, changeId);
            if (!footnote.includes(unexpected)) return;
            await this.page!.waitForTimeout(300);
        }
        assert.ok(
            !footnote.includes(unexpected),
            `Footnote for ${changeId} unexpectedly contains "${unexpected}".\nFootnote block:\n${footnote}`
        );
    }
);
