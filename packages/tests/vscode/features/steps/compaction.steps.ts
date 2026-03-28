/**
 * @fast tier step definitions for compaction tests (CMP1).
 *
 * Tests the core compactToLevel1 / compactToLevel0 functions from @changedown/core.
 * No VS Code dependency — pure in-process tests.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { compactToLevel1 } from '@changedown/core';
import type { ChangeDownWorld } from './world';

// ── Extend ChangeDownWorld with compaction state ────────────────────

declare module './world' {
    interface ChangeDownWorld {
        compactionText?: string;
        compactionResult?: string;
    }
}

// ── Given ────────────────────────────────────────────────────────────

Given('a compaction document with text:', function (this: ChangeDownWorld, docString: string) {
    this.compactionText = docString;
});

// ── When ─────────────────────────────────────────────────────────────

When('I compact change {string} to Level 1', function (this: ChangeDownWorld, changeId: string) {
    assert.ok(this.compactionText !== undefined, 'Compaction text not set');
    this.compactionResult = compactToLevel1(this.compactionText!, changeId);
});

// ── Then ─────────────────────────────────────────────────────────────

Then('the compacted document contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.compactionResult !== undefined, 'Compaction result not set — call "I compact change" first');
    assert.ok(
        this.compactionResult!.includes(expected),
        `Expected document to contain "${expected}" but got:\n${this.compactionResult}`
    );
});

Then('the compacted document does not contain {string}', function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(this.compactionResult !== undefined, 'Compaction result not set — call "I compact change" first');
    assert.ok(
        !this.compactionResult!.includes(unexpected),
        `Expected document NOT to contain "${unexpected}" but it was found in:\n${this.compactionResult}`
    );
});
