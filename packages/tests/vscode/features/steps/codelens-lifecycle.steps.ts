/**
 * @fast tier step definitions for CL3 — CodeLens lifecycle state indicators.
 *
 * Tests indicator-building logic as pure functions (no LSP server).
 * Mirrors the logic added to code-lens.ts createCodeLenses().
 */

import { When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser } from '@changedown/core';
import { buildLifecycleIndicator } from '@changedown/lsp-server';
import type { ChangeDownWorld } from './world';

// ── Extend World with CodeLens indicator state ──────────────────────

declare module './world' {
    interface ChangeDownWorld {
        codeLensIndicators?: Map<string, string>;
    }
}

Before({ tags: '@fast and @CL3' }, function (this: ChangeDownWorld) {
    this.codeLensIndicators = undefined;
});

// ── Step definitions ────────────────────────────────────────────────

When('I compute CodeLens indicators', async function (this: ChangeDownWorld) {
    assert.ok(this.lifecycleDocText !== undefined, 'Document text not set');
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(this.lifecycleDocText);
    const changes = vdoc.getChanges();

    this.codeLensIndicators = new Map();
    for (const change of changes) {
        if (change.level < 1) continue;
        const indicator = buildLifecycleIndicator(change);
        this.codeLensIndicators.set(change.id, indicator);
    }
});

Then('the indicator for {word} contains {string}', function (this: ChangeDownWorld, changeId: string, expected: string) {
    assert.ok(this.codeLensIndicators, 'No indicators computed');
    const indicator = this.codeLensIndicators.get(changeId);
    assert.ok(indicator !== undefined, `No indicator found for ${changeId}. Available: ${[...this.codeLensIndicators.keys()].join(', ')}`);
    assert.ok(
        indicator.includes(expected),
        `Indicator for ${changeId} does not contain "${expected}". Got: "${indicator}"`
    );
});

Then('the indicator for {word} does not contain {string}', function (this: ChangeDownWorld, changeId: string, unexpected: string) {
    assert.ok(this.codeLensIndicators, 'No indicators computed');
    const indicator = this.codeLensIndicators.get(changeId) ?? '';
    assert.ok(
        !indicator.includes(unexpected),
        `Indicator for ${changeId} should not contain "${unexpected}". Got: "${indicator}"`
    );
});
