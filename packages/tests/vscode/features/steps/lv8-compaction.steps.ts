/**
 * @fast tier step definitions for LV8 — Compaction in VS Code.
 *
 * Tests compaction logic as pure functions (no VS Code launch).
 * Compaction is explicit, never automatic. Guards enforce:
 * - Cannot compact proposed changes
 * - Warning on unresolved discussion threads
 */

import { When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    CriticMarkupParser,
    ChangeStatus,
    compactToLevel1,
    compactToLevel0,
} from '@changedown/core';
import type { ChangeNode } from '@changedown/core';
import type { ChangeDownWorld } from './world';
import { findChangeById } from './test-utils';

// ── Extend World with LV8 compaction state ──────────────────────────

declare module './world' {
    interface ChangeDownWorld {
        lv8ResultText?: string;
        lv8Error?: string;
        lv8Warning?: string;
    }
}

// ── Lifecycle ───────────────────────────────────────────────────────

Before({ tags: '@fast and @LV8' }, function (this: ChangeDownWorld) {
    this.lv8ResultText = undefined;
    this.lv8Error = undefined;
    this.lv8Warning = undefined;
});

// ── Pure compaction helpers ──────────────────────────────────────────

/**
 * Check whether a change can be compacted.
 * Returns an error message if compaction is blocked, or null if allowed.
 */
function canCompact(change: ChangeNode): string | null {
    if (change.status === ChangeStatus.Proposed) {
        return 'still proposed';
    }
    return null;
}

/**
 * Check whether compacting a change should produce a warning.
 * Returns a warning message if there is an unresolved discussion, or null.
 */
function compactionWarning(change: ChangeNode): string | null {
    if (change.metadata?.discussion && change.metadata.discussion.length > 0) {
        if (!change.metadata.resolution || change.metadata.resolution.type !== 'resolved') {
            return 'unresolved discussion';
        }
    }
    return null;
}

/**
 * Compact a change fully using core's two-step level descent (L2→L1→L0),
 * then find the change index post-L1 for the L1→L0 step.
 */
function compactFully(text: string, changeId: string): string {
    // Step 1: L2 → L1 (footnote → inline comment)
    const l1Text = compactToLevel1(text, changeId);

    // Step 2: L1 → L0 (remove inline comment)
    // compactToLevel0 takes a change index, so re-parse to find it
    const parser = new CriticMarkupParser();
    const doc = parser.parse(l1Text);
    const changes = doc.getChanges();
    const changeIndex = changes.findIndex(c => c.id === changeId);
    if (changeIndex < 0) return l1Text;

    return compactToLevel0(l1Text, changeIndex);
}

// ── Step definitions ────────────────────────────────────────────────

When('I compact {word} to L1', function (this: ChangeDownWorld, changeId: string) {
    assert.ok(this.lifecycleDocText !== undefined, 'Document text not set — use "a lifecycle document with text:" first');

    const change = findChangeById(this.lifecycleDocText!, changeId);
    assert.ok(change, `Change ${changeId} not found in document`);

    const error = canCompact(change);
    if (error) {
        this.lv8Error = error;
        return;
    }

    this.lv8ResultText = compactToLevel1(this.lifecycleDocText!, changeId);
});

When('I compact {word} fully', function (this: ChangeDownWorld, changeId: string) {
    assert.ok(this.lifecycleDocText !== undefined, 'Document text not set — use "a lifecycle document with text:" first');

    const change = findChangeById(this.lifecycleDocText!, changeId);
    assert.ok(change, `Change ${changeId} not found in document`);

    const error = canCompact(change);
    if (error) {
        this.lv8Error = error;
        return;
    }

    this.lv8ResultText = compactFully(this.lifecycleDocText!, changeId);
});

When('I try to compact {word}', function (this: ChangeDownWorld, changeId: string) {
    assert.ok(this.lifecycleDocText !== undefined, 'Document text not set — use "a lifecycle document with text:" first');

    const change = findChangeById(this.lifecycleDocText!, changeId);
    assert.ok(change, `Change ${changeId} not found in document`);

    const error = canCompact(change);
    if (error) {
        this.lv8Error = error;
        return;
    }

    const warning = compactionWarning(change);
    if (warning) {
        this.lv8Warning = warning;
        return;
    }

    this.lv8ResultText = compactToLevel1(this.lifecycleDocText!, changeId);
});

// ── Then: assertions on compaction result ────────────────────────────

Then('the compaction result contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.lv8ResultText, 'No compaction result — run a compaction action first');
    assert.ok(
        this.lv8ResultText.includes(expected),
        `Expected compaction result to contain "${expected}" but got:\n${this.lv8ResultText}`
    );
});

Then('the compaction result does not contain {string}', function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(this.lv8ResultText, 'No compaction result — run a compaction action first');
    assert.ok(
        !this.lv8ResultText.includes(unexpected),
        `Expected compaction result NOT to contain "${unexpected}" but it was found in:\n${this.lv8ResultText}`
    );
});

Then('compaction is blocked with {string}', function (this: ChangeDownWorld, expectedError: string) {
    assert.ok(this.lv8Error, 'Expected compaction to be blocked but no error was set');
    assert.ok(
        this.lv8Error.includes(expectedError),
        `Expected compaction error containing "${expectedError}", got "${this.lv8Error}"`
    );
});

Then('a warning is shown about {string}', function (this: ChangeDownWorld, expectedWarning: string) {
    assert.ok(this.lv8Warning, 'Expected compaction warning but none was set');
    assert.ok(
        this.lv8Warning.includes(expectedWarning),
        `Expected compaction warning containing "${expectedWarning}", got "${this.lv8Warning}"`
    );
});
