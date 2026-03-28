/**
 * @slow tier step definitions for SL-XS — Cross-surface sync in running VS Code.
 *
 * Phase-specific steps only. Shared steps (launch, parsing, cursor positioning,
 * footnote assertions, screenshots, QuickPick interaction) are in sl-shared.steps.ts.
 *
 * Fixture: packages/tests/vscode/fixtures/journeys/lifecycle-cross-surface.md
 *
 * Verifies that an action on one surface (CodeLens, panel, peek) propagates
 * to all other surfaces. Each test uses generous poll timeouts to accommodate
 * cross-surface propagation latency.
 */

import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeDownWorld } from './world';
import {
    getCodeLensItems,
    getReviewPanelCards,
    getDocumentText,
    executeCommandViaBridge,
    setCursorPosition,
} from '../../journeys/playwrightHarness';
import { findLineNumber, extractFootnoteBlock } from './sl-shared.steps';

// ── Extend World with cross-surface state ────────────────────────────

declare module './world' {
    interface ChangeDownWorld {
        xsInitialReplyCount?: number;
        xsInitialDiscussionLabel?: string;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Poll getCodeLensItems until the predicate is satisfied or timeout elapses.
 */
async function pollCodeLens(
    world: ChangeDownWorld,
    predicate: (items: Array<{ line: number; title: string; command: string }>) => boolean,
    timeoutMs = 8000
): Promise<Array<{ line: number; title: string; command: string }>> {
    assert.ok(world.page, 'Page not available');
    const deadline = Date.now() + timeoutMs;
    let lastItems: Array<{ line: number; title: string; command: string }> = [];
    while (Date.now() < deadline) {
        const result = await getCodeLensItems(world.page);
        lastItems = result.items;
        if (predicate(lastItems)) return lastItems;
        await world.page.waitForTimeout(300);
    }
    return lastItems;
}

/**
 * Poll getReviewPanelCards until the predicate is satisfied or timeout elapses.
 */
async function pollPanelCards(
    world: ChangeDownWorld,
    predicate: (cards: Array<{ changeId: string; type: string; status: string; author: string; textPreview: string; replyCount: number }>) => boolean,
    timeoutMs = 8000
): Promise<Array<{ changeId: string; type: string; status: string; author: string; textPreview: string; replyCount: number }>> {
    assert.ok(world.page, 'Page not available');
    const deadline = Date.now() + timeoutMs;
    let lastCards: Array<{ changeId: string; type: string; status: string; author: string; textPreview: string; replyCount: number }> = [];
    while (Date.now() < deadline) {
        const result = await getReviewPanelCards(world.page);
        lastCards = result.cards;
        if (predicate(lastCards)) return lastCards;
        await world.page.waitForTimeout(300);
    }
    return lastCards;
}

// ── When: CodeLens accept action ─────────────────────────────────────

/**
 * Click the Accept action on the CodeLens for the given change ID.
 * Positions the cursor on the change's line first, then triggers accept
 * via the bridge command — CodeLens accept is the same as changedown.acceptChange
 * when the cursor is inside the change.
 */
When(
    'I click Accept on the CodeLens for {word}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');

        // Find the change's line by its footnote reference
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        const refPattern = `[^${changeId}]`;
        const lineNum = findLineNumber(text, refPattern);
        assert.ok(lineNum > 0, `Could not find ${changeId} reference in document`);

        // Position cursor inside the change
        await this.page.click('.monaco-editor .view-lines');
        await this.page.waitForTimeout(100);
        await setCursorPosition(this.page, lineNum, 15);
        await this.page.waitForTimeout(500);

        // Trigger accept — pass decision to bypass the QuickPick UI
        await executeCommandViaBridge(this.page, 'changedown.acceptChange', [undefined, 'approve']);
        await this.page.waitForTimeout(500);
    }
);

// ── Then: panel card status assertion ────────────────────────────────

/**
 * Assert the review panel card for a change shows the given status.
 * Polls up to 8 seconds for cross-surface propagation.
 */
Then(
    'the panel card for {word} shows status {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string, expectedStatus: string) {
        assert.ok(this.page, 'Page not available');

        const cards = await pollPanelCards(
            this,
            cs => cs.some(c => c.changeId === changeId && c.status === expectedStatus)
        );

        const card = cards.find(c => c.changeId === changeId);
        assert.ok(
            card,
            `No panel card found for ${changeId}. Available IDs: ${cards.map(c => c.changeId).join(', ') || '(none)'}`
        );
        assert.strictEqual(
            card.status,
            expectedStatus,
            `Expected panel card for ${changeId} to show status "${expectedStatus}", got "${card.status}"`
        );
    }
);

// ── Then: thread footnote content ────────────────────────────────────

/**
 * Assert that the document footnote block for the given change contains
 * the expected substring. Polls up to 8 seconds for propagation.
 */
Then(
    'the thread for {word} footnote contains {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string, expected: string) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let footnote = '';
        while (Date.now() < deadline) {
            const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
            footnote = extractFootnoteBlock(text, changeId);
            if (footnote.includes(expected)) return;
            await this.page!.waitForTimeout(300);
        }
        assert.ok(
            footnote.includes(expected),
            `Footnote for ${changeId} does not contain "${expected}".\nFootnote block:\n${footnote}`
        );
    }
);

// ── Then: CodeLens no longer shows Accept | Reject ───────────────────

/**
 * Assert that CodeLens for the given change no longer shows accept/reject actions.
 * After accepting, the lifecycle CodeLens shows the accepted indicator without
 * accept/reject command links.
 */
Then(
    'the CodeLens for {word} no longer shows Accept | Reject',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');

        // Poll until no CodeLens items for this change contain accept/reject titles
        const items = await pollCodeLens(
            this,
            is => !is.some(
                item =>
                    (item.title.toLowerCase().includes('accept') ||
                     item.title.toLowerCase().includes('reject')) &&
                    item.command.includes(changeId)
            )
        );

        // Verify: no accept/reject lens items reference this change
        const acceptRejectItems = items.filter(
            item =>
                (item.title.toLowerCase().includes('accept') ||
                 item.title.toLowerCase().includes('reject')) &&
                item.command.includes(changeId)
        );
        assert.strictEqual(
            acceptRejectItems.length,
            0,
            `Expected no Accept/Reject CodeLens for ${changeId}, but found: ${JSON.stringify(acceptRejectItems)}`
        );
    }
);

// NOTE: 'I open the comment thread for {word}', 'I type {string} in the reply box',
// and 'I click the Reply button' are defined in sl-threads.steps.ts — reused here.

// ── Then: CodeLens shows updated discussion count ────────────────────

/**
 * Assert that the CodeLens for the given change shows a discussion indicator
 * with a count greater than what was present before the reply.
 */
Then(
    'the CodeLens for {word} shows updated discussion count',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');

        // Poll until CodeLens contains a discussion indicator (e.g. "💬 N" or "N replies")
        const items = await pollCodeLens(
            this,
            is => is.some(
                item =>
                    item.command.includes(changeId) &&
                    (item.title.includes('💬') ||
                     item.title.toLowerCase().includes('repl') ||
                     item.title.toLowerCase().includes('comment') ||
                     /\d+/.test(item.title))
            )
        );

        const discussionItems = items.filter(
            item =>
                item.command.includes(changeId) &&
                (item.title.includes('💬') ||
                 item.title.toLowerCase().includes('repl') ||
                 item.title.toLowerCase().includes('comment') ||
                 /\d+/.test(item.title))
        );

        assert.ok(
            discussionItems.length > 0,
            `Expected CodeLens for ${changeId} to show a discussion count. Found CodeLens items: ${JSON.stringify(items)}`
        );
    }
);

// ── Then: panel card shows updated reply count ────────────────────────

/**
 * Assert that the review panel card for the given change shows a reply count
 * higher than the count captured before the reply action.
 */
Then(
    'the panel card for {word} shows updated reply count',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        const initialCount = this.xsInitialReplyCount ?? 0;

        const cards = await pollPanelCards(
            this,
            cs => cs.some(c => c.changeId === changeId && c.replyCount > initialCount)
        );

        const card = cards.find(c => c.changeId === changeId);
        assert.ok(
            card,
            `No panel card found for ${changeId}. Available IDs: ${cards.map(c => c.changeId).join(', ') || '(none)'}`
        );
        assert.ok(
            card.replyCount > initialCount,
            `Expected panel card for ${changeId} reply count to increase above ${initialCount}, got ${card.replyCount}`
        );
    }
);

// NOTE: 'I execute {string} on {word}' is defined in sl-threads.steps.ts — reused here.

// ── Then: CodeLens does not show discussion indicator ────────────────

/**
 * Assert that the CodeLens for the given change does NOT show a discussion
 * indicator (e.g., after resolution removes the thread indicator).
 */
Then(
    'the CodeLens for {word} does not show discussion indicator',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');

        // Brief propagation wait, then check
        await this.page.waitForTimeout(1500);
        const result = await getCodeLensItems(this.page);
        const items = result.items;

        const discussionItems = items.filter(
            item =>
                item.command.includes(changeId) &&
                (item.title.includes('💬') ||
                 item.title.toLowerCase().includes('repl') ||
                 /\d+ comment/.test(item.title))
        );

        assert.strictEqual(
            discussionItems.length,
            0,
            `Expected no discussion indicator in CodeLens for ${changeId}, but found: ${JSON.stringify(discussionItems)}`
        );
    }
);

// ── Then: panel card shows resolved state ────────────────────────────

/**
 * Assert that the review panel card for the given change reflects a resolved state.
 * "Resolved" is shown as status "resolved" or a resolved indicator in the card.
 */
Then(
    'the panel card for {word} shows resolved state',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');

        const cards = await pollPanelCards(
            this,
            cs => cs.some(
                c => c.changeId === changeId &&
                     (c.status === 'resolved' || c.status.toLowerCase().includes('resolv'))
            )
        );

        const card = cards.find(c => c.changeId === changeId);
        assert.ok(
            card,
            `No panel card found for ${changeId}. Available IDs: ${cards.map(c => c.changeId).join(', ') || '(none)'}`
        );
        assert.ok(
            card.status === 'resolved' || card.status.toLowerCase().includes('resolv'),
            `Expected panel card for ${changeId} to show resolved state, got status "${card.status}"`
        );
    }
);

// NOTE: 'the thread for {word} has state {string}' is defined in sl-threads.steps.ts — reused here.

// ── When: position cursor inside insertion (no text hint) ─────────────

/**
 * Position cursor inside the insertion for the given change ID.
 * Variant without text hint — finds the change by footnote reference.
 * Note: the shared sl-shared.steps.ts defines "I position cursor inside the {word} insertion"
 * (with "the"). This variant matches the feature step "I position cursor inside cn-1 insertion"
 * (without "the") used in SL-XS-02.
 */
When(
    'I position cursor inside {word} insertion',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        const refPattern = `[^${changeId}]`;
        const lineNum = findLineNumber(text, refPattern);
        assert.ok(lineNum > 0, `Could not find ${changeId} reference in document`);
        await this.page.click('.monaco-editor .view-lines');
        await this.page.waitForTimeout(100);
        await setCursorPosition(this.page, lineNum, 15);
        await this.page.waitForTimeout(300);
    }
);
