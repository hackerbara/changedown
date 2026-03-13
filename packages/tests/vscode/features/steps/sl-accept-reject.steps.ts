/**
 * @slow tier step definitions for SL-AR — Accept/reject with reason in VS Code.
 *
 * Phase-specific steps only. Shared steps (launch, parsing, cursor positioning,
 * footnote assertions, screenshots) are in sl-shared.steps.ts.
 *
 * Fixture: packages/tests/vscode/fixtures/journeys/lifecycle-accept-reason.md
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeTracksWorld } from './world';
import {
    waitForQuickPick,
    updateSettingDirect,
} from '../../journeys/playwrightHarness';

// ── Given: configuration ─────────────────────────────────────────────

Given(
    'reasonRequired is set to false',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        await updateSettingDirect(this.page, 'changetracks.reasonRequired', false);
    }
);

Given(
    'reasonRequired is set to true',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        await updateSettingDirect(this.page, 'changetracks.reasonRequired', true);
    }
);

// ── Then: QuickPick assertions ──────────────────────────────────────

Then(
    'a QuickPick appears with items {string}, {string}, {string}',
    { timeout: 15000 },
    async function (this: ChangeTracksWorld, item1: string, item2: string, item3: string) {
        assert.ok(this.page, 'Page not available');
        const items = await waitForQuickPick(this.page, 10000);
        const expected = [item1, item2, item3];
        for (const label of expected) {
            assert.ok(
                items.some(i => i.includes(label)),
                `QuickPick item "${label}" not found. Available: ${JSON.stringify(items)}`
            );
        }
    }
);

// ── Then: InputBox variant assertions ───────────────────────────────

Then(
    'an InputBox appears with prompt containing {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, promptText: string) {
        assert.ok(this.page, 'Page not available');
        await this.page.waitForSelector('.quick-input-widget[style*="display: flex"]', { timeout: 8000 });
        const prompt = await this.page.evaluate(`(() => {
            const widget = document.querySelector('.quick-input-widget');
            if (!widget) return '';
            const title = widget.querySelector('.quick-input-title');
            const desc = widget.querySelector('.quick-input-message');
            const placeholder = widget.querySelector('input[type="text"]');
            return (title?.textContent ?? '') + ' ' +
                   (desc?.textContent ?? '') + ' ' +
                   (placeholder?.getAttribute('placeholder') ?? '');
        })()`) as string;
        assert.ok(
            prompt.includes(promptText),
            `InputBox prompt does not contain "${promptText}". Got: "${prompt.trim()}"`
        );
    }
);

Then(
    'an InputBox appears (not a QuickPick)',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        await this.page.waitForSelector('.quick-input-widget[style*="display: flex"] input[type="text"]', { timeout: 8000 });
        const hasListItems = await this.page.evaluate(`(() => {
            const rows = document.querySelectorAll('.quick-input-list .monaco-list-row');
            return rows.length > 0;
        })()`) as boolean;
        assert.ok(
            !hasListItems,
            'Expected a plain InputBox (no QuickPick list items) but found list items'
        );
    }
);

// ── When: empty submission ──────────────────────────────────────────

When(
    'I press Enter without typing (empty submission)',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        const input = await this.page.$('.quick-input-widget input[type="text"]');
        assert.ok(input, 'InputBox input not found');
        await input.focus();
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(500);
    }
);

// ── Then: validation error ──────────────────────────────────────────

Then(
    'the InputBox shows validation error {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, expectedError: string) {
        assert.ok(this.page, 'Page not available');
        const errorText = await this.page.evaluate(`(() => {
            const msg = document.querySelector('.quick-input-message');
            const entry = document.querySelector('.quick-input-entry .monaco-inputbox .message');
            return (msg?.textContent ?? '') + ' ' + (entry?.textContent ?? '');
        })()`) as string;
        assert.ok(
            errorText.includes(expectedError),
            `Expected validation error "${expectedError}" but got: "${errorText.trim()}"`
        );
    }
);
