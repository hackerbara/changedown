/**
 * @fast tier step definitions for PNL5 — Review panel lifecycle actions.
 *
 * Tests the card-building logic as pure functions (no VS Code launch).
 * Parses document text with CriticMarkupParser, builds ChangeCardData[]
 * using the production buildCardData() from review-panel.ts.
 */

import { When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser } from '@changetracks/core';
import { generateReviewHtml, buildCardData } from 'changetracks-vscode/internals';
import type { ChangeCardData, ReviewPanelState } from 'changetracks-vscode/internals';
import type { ChangeTracksWorld } from './world';

// ── Extend World with panel lifecycle state ─────────────────────────

declare module './world' {
    interface ChangeTracksWorld {
        panelCards?: ChangeCardData[];
    }
}

// ── Lifecycle ───────────────────────────────────────────────────────

Before({ tags: '@fast and @PNL5' }, function (this: ChangeTracksWorld) {
    this.panelCards = undefined;
    this.settingsHtml = undefined;
});

// ── Step definitions ────────────────────────────────────────────────

// Note: "Given a lifecycle document with text:" is defined in lifecycle-viewer.steps.ts
// and sets this.lifecycleDocText. We reuse that Given step.

When('I build the review panel state', function (this: ChangeTracksWorld) {
    assert.ok(this.lifecycleDocText !== undefined, 'Document text not set — use "a lifecycle document with text:" first');
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(this.lifecycleDocText);
    const changes = vdoc.getChanges();
    this.panelCards = buildCardData(changes, this.lifecycleDocText);
});

When('I build the review panel HTML', function (this: ChangeTracksWorld) {
    assert.ok(this.lifecycleDocText !== undefined, 'Document text not set — use "a lifecycle document with text:" first');
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(this.lifecycleDocText);
    const changes = vdoc.getChanges();
    const cards = buildCardData(changes, this.lifecycleDocText);

    const state: ReviewPanelState = {
        trackingEnabled: false,
        viewMode: 'review',
        changes: cards,
        hasActiveMarkdownEditor: true,
        activeFilter: 'all',
        activeGrouping: 'flat',
        activeSorting: 'document-order',
    };

    // Store in settingsHtml so the existing "the HTML contains" step works
    this.settingsHtml = generateReviewHtml(state, 'test-nonce');
});

Then('the card for {word} shows type {string}', function (this: ChangeTracksWorld, cardId: string, expected: string) {
    assert.ok(this.panelCards, 'No panel cards built — call "I build the review panel state" first');
    const card = this.panelCards.find(c => c.id === cardId);
    assert.ok(card, `No card found for id "${cardId}". Available: ${this.panelCards.map(c => c.id).join(', ') || '(none)'}`);
    assert.strictEqual(card.type, expected, `Expected type "${expected}", got "${card.type}"`);
});

Then('the card for {word} shows status {string}', function (this: ChangeTracksWorld, cardId: string, expected: string) {
    assert.ok(this.panelCards, 'No panel cards built');
    const card = this.panelCards.find(c => c.id === cardId);
    assert.ok(card, `No card found for id "${cardId}"`);
    assert.strictEqual(card.status, expected, `Expected status "${expected}", got "${card.status}"`);
});

Then('the card for {word} shows author {string}', function (this: ChangeTracksWorld, cardId: string, expected: string) {
    assert.ok(this.panelCards, 'No panel cards built');
    const card = this.panelCards.find(c => c.id === cardId);
    assert.ok(card, `No card found for id "${cardId}"`);
    assert.strictEqual(card.author, expected, `Expected author "${expected}", got "${card.author}"`);
});

Then('the card for {word} shows reply count {int}', function (this: ChangeTracksWorld, cardId: string, expected: number) {
    assert.ok(this.panelCards, 'No panel cards built');
    const card = this.panelCards.find(c => c.id === cardId);
    assert.ok(card, `No card found for id "${cardId}"`);
    assert.strictEqual(card.replyCount, expected, `Expected reply count ${expected}, got ${card.replyCount}`);
});

Then('the HTML does not contain {string}', function (this: ChangeTracksWorld, unwanted: string) {
    assert.ok(this.settingsHtml, 'No HTML generated');
    assert.ok(
        !this.settingsHtml.includes(unwanted),
        `HTML should not contain "${unwanted}" but it does`
    );
});
