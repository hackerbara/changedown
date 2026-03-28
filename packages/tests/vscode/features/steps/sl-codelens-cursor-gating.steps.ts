/**
 * @slow tier step definitions for CL4 — cursor-gated CodeLens in running VS Code.
 *
 * Tests CodeLens visibility in a live VS Code instance via Playwright.
 * Companion to the @fast codelens-cursor-gating.steps.ts which tests
 * createCodeLenses() directly with mock cursor state.
 *
 * Feature: CL4-slow-codelens-cursor-gating.feature
 * Fixture: packages/tests/vscode/fixtures/journeys/codelens-cursor-gating.md
 */

import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeDownWorld } from './world';
import {
    getCodeLensCount,
    setCursorPosition,
    updateSettingDirect,
} from '../../journeys/playwrightHarness';

// ── When steps ───────────────────────────────────────────────────────

When(
    'I place the cursor on line {int} column {int}',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, line: number, column: number) {
        assert.ok(this.page, 'Page not available');
        await setCursorPosition(this.page, line, column);
        // Allow cursor notification to reach LSP and trigger CodeLens refresh
        await this.page.waitForTimeout(1500);
    }
);

When(
    'I set codeLensMode to {string}',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, mode: string) {
        assert.ok(this.page, 'Page not available');
        await updateSettingDirect(this.page, 'changedown.codeLensMode', mode);
        // Allow setting change to propagate to LSP and trigger CodeLens refresh
        await this.page.waitForTimeout(2000);
    }
);

// ── Then steps ───────────────────────────────────────────────────────

Then(
    'CodeLens items are visible',
    { timeout: 15000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let count = 0;
        while (Date.now() < deadline) {
            count = await getCodeLensCount(this.page);
            if (count > 0) return;
            await this.page.waitForTimeout(300);
        }
        assert.ok(count > 0, `Expected CodeLens items to be visible, but found ${count}`);
    }
);

Then(
    'no CodeLens items are visible',
    { timeout: 15000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');
        // Wait for any pending refresh to complete, then assert absence
        await this.page.waitForTimeout(1500);
        const count = await getCodeLensCount(this.page);
        assert.strictEqual(count, 0, `Expected 0 CodeLens items but found ${count}`);
    }
);

Then(
    'at least {int} CodeLens items are visible',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, minCount: number) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let count = 0;
        while (Date.now() < deadline) {
            count = await getCodeLensCount(this.page);
            if (count >= minCount) return;
            await this.page.waitForTimeout(300);
        }
        assert.ok(
            count >= minCount,
            `Expected at least ${minCount} CodeLens items, but found ${count}`
        );
    }
);
