/**
 * @fast tier step definitions for LV4 — Thread resolution.
 *
 * Tests resolve/unresolve logic as pure functions (no VS Code launch).
 * Parses document text with CriticMarkupParser, builds resolution-aware
 * threads from changes, and simulates resolve/unresolve by calling core
 * functions (computeResolutionEdit, computeUnresolveEdit).
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    CriticMarkupParser,
    computeResolutionEdit,
    computeUnresolveEdit,
} from '@changetracks/core';
import type { ChangeNode } from '@changetracks/core';
import type { ChangeTracksWorld } from './world';
import { applyEdit, extractFootnoteStatus } from './test-utils';
import { buildThreadDataForChanges, type ThreadData } from './lifecycle-viewer.steps';

// ── Resolution-aware thread type ────────────────────────────────────

export interface ResolutionThreadData extends ThreadData {
    state: 'Resolved' | 'Unresolved';
}

// ── Extend World with resolution state ──────────────────────────────

declare module './world' {
    interface ChangeTracksWorld {
        resolutionDocText?: string;
        resolutionResultText?: string;
        resolutionThreads?: ResolutionThreadData[];
    }
}

// ── Lifecycle ───────────────────────────────────────────────────────

Before({ tags: '@fast and @LV4' }, function (this: ChangeTracksWorld) {
    this.resolutionDocText = undefined;
    this.resolutionResultText = undefined;
    this.resolutionThreads = undefined;
});

// ── Fixture documents ───────────────────────────────────────────────

const PROPOSED_WITH_DISCUSSION = `Hello {++world++}[^ct-1]

[^ct-1]: @alice | 2026-03-09 | insertion | proposed
    reason: Added for clarity
    @bob 2026-03-09: Looks good`;

const RESOLVED_INSERTION = `Hello {++world++}[^ct-1]

[^ct-1]: @alice | 2026-03-09 | insertion | proposed
    reason: Added for clarity
    resolved: @carol 2026-03-09`;

const ACCEPTED_WITH_DISCUSSION = `Hello {++world++}[^ct-1]

[^ct-1]: @alice | 2026-03-09 | insertion | accepted
    approved: @bob 2026-03-09
    @carol 2026-03-09: Has this been tested?`;

// ── Pure helpers ────────────────────────────────────────────────────

/**
 * Build resolution-aware threads from parsed ChangeNodes.
 * Extends buildThreadDataForChanges with a state property derived
 * from the change's metadata.resolution field.
 */
function buildResolutionThreads(changes: ChangeNode[]): ResolutionThreadData[] {
    const baseThreads = buildThreadDataForChanges(changes);
    return baseThreads.map((thread, idx) => {
        const change = changes.filter(c => c.level >= 1)[idx];
        const resolution = change?.metadata?.resolution;
        const state: 'Resolved' | 'Unresolved' =
            resolution?.type === 'resolved' ? 'Resolved' : 'Unresolved';
        return { ...thread, state };
    });
}

/**
 * Parse document text and build resolution-aware threads.
 */
function parseAndBuildThreads(text: string): ResolutionThreadData[] {
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(text);
    return buildResolutionThreads(vdoc.getChanges());
}

// ── Step definitions ────────────────────────────────────────────────

Given('a resolution document with a proposed insertion ct-1 with discussion', function (this: ChangeTracksWorld) {
    this.resolutionDocText = PROPOSED_WITH_DISCUSSION;
});

Given('a resolution document with a resolved insertion ct-1', function (this: ChangeTracksWorld) {
    this.resolutionDocText = RESOLVED_INSERTION;
});

Given('a resolution document with an accepted insertion ct-1 with unresolved discussion', function (this: ChangeTracksWorld) {
    this.resolutionDocText = ACCEPTED_WITH_DISCUSSION;
});

When('I resolve the thread for {word}', function (this: ChangeTracksWorld, changeId: string) {
    assert.ok(this.resolutionDocText !== undefined, 'Document text not set');
    const edit = computeResolutionEdit(this.resolutionDocText, changeId, {
        author: 'bob',
        date: '2026-03-09',
    });
    assert.ok(edit, `computeResolutionEdit returned null for ${changeId}`);
    this.resolutionResultText = applyEdit(this.resolutionDocText, edit);
    this.resolutionThreads = parseAndBuildThreads(this.resolutionResultText);
});

When('I build resolution threads', function (this: ChangeTracksWorld) {
    assert.ok(this.resolutionDocText !== undefined, 'Document text not set');
    this.resolutionResultText = this.resolutionDocText;
    this.resolutionThreads = parseAndBuildThreads(this.resolutionDocText);
});

When('I unresolve the thread for {word}', function (this: ChangeTracksWorld, changeId: string) {
    assert.ok(this.resolutionDocText !== undefined, 'Document text not set');
    const edit = computeUnresolveEdit(this.resolutionDocText, changeId);
    assert.ok(edit, `computeUnresolveEdit returned null for ${changeId}`);
    this.resolutionResultText = applyEdit(this.resolutionDocText, edit);
    this.resolutionThreads = parseAndBuildThreads(this.resolutionResultText);
});

Then('the thread state for {word} is {string}', function (this: ChangeTracksWorld, changeId: string, expectedState: string) {
    assert.ok(this.resolutionThreads, 'No resolution threads built');
    const thread = this.resolutionThreads.find(t => t.id === changeId);
    assert.ok(thread, `No thread found for ${changeId}. Available: ${this.resolutionThreads.map(t => t.id).join(', ') || '(none)'}`);
    assert.strictEqual(
        thread.state,
        expectedState,
        `Expected thread state "${expectedState}" for ${changeId}, got "${thread.state}"`
    );
});

Then('the resolution result footnote contains {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.resolutionResultText, 'No resolution result');
    assert.ok(
        this.resolutionResultText.includes(expected),
        `Resolution result does not contain "${expected}".\nFull result:\n${this.resolutionResultText}`
    );
});

Then('the resolution result footnote does not contain {string}', function (this: ChangeTracksWorld, unexpected: string) {
    assert.ok(this.resolutionResultText, 'No resolution result');
    assert.ok(
        !this.resolutionResultText.includes(unexpected),
        `Resolution result unexpectedly contains "${unexpected}".\nFull result:\n${this.resolutionResultText}`
    );
});

Then('a resolution thread exists for {string}', function (this: ChangeTracksWorld, changeId: string) {
    assert.ok(this.resolutionThreads, 'No resolution threads built');
    const thread = this.resolutionThreads.find(t => t.id === changeId);
    assert.ok(thread, `No thread found for ${changeId}. Available: ${this.resolutionThreads.map(t => t.id).join(', ') || '(none)'}`);
});

Then('the resolution footnote status is {string}', function (this: ChangeTracksWorld, expectedStatus: string) {
    assert.ok(this.resolutionResultText, 'No resolution result');
    const actual = extractFootnoteStatus(this.resolutionResultText);
    assert.strictEqual(
        actual,
        expectedStatus,
        `Expected footnote status "${expectedStatus}", got "${actual}"`
    );
});
