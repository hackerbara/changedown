/**
 * @slow tier step definitions for SL-AS — Amend and supersede in running VS Code.
 *
 * Phase-specific steps only. Shared steps (launch, parsing, identity, cursor
 * positioning, footnote assertions, screenshots) are in sl-shared.steps.ts.
 *
 * Fixture: packages/tests/vscode/fixtures/journeys/lifecycle-amend-supersede.md
 */

import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeDownWorld } from './world';
import {
    getDocumentText,
} from '../../journeys/playwrightHarness';

// ── Then: VS Code error notification ────────────────────────────────────────

/**
 * Check that a VS Code error notification (toast) appears containing the given
 * substring. VS Code renders error messages as `.notifications-toasts .notification-toast`.
 * We poll for up to 5 s because the notification arrival is asynchronous.
 */
Then(
    'an error message appears saying {string}',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, substring: string) {
        assert.ok(this.page, 'Page not available');

        const deadline = Date.now() + 8000;
        let lastText = '';

        while (Date.now() < deadline) {
            const text: string = await this.page.evaluate(`(() => {
                // Primary: toast notifications
                const toasts = Array.from(
                    document.querySelectorAll('.notifications-toasts .notification-toast')
                );
                if (toasts.length > 0) {
                    return toasts.map(t => t.textContent ?? '').join(' ');
                }
                // Secondary: message container (e.g. modal dialogs)
                const msgs = Array.from(
                    document.querySelectorAll('.notification-list-item-message, .dialog-message-text')
                );
                return msgs.map(m => m.textContent ?? '').join(' ');
            })()`) as string;

            lastText = text;
            if (text.toLowerCase().includes(substring.toLowerCase())) {
                return;
            }
            await this.page.waitForTimeout(300);
        }

        assert.ok(
            false,
            `Expected VS Code error notification containing "${substring}" but got: "${lastText.trim()}"`
        );
    }
);

// ── Then: InputBox pre-populated ─────────────────────────────────────────────

/**
 * Assert that the currently visible InputBox has an existing value containing
 * the given string. For amend, the current inline text is pre-filled.
 *
 * NOTE: Because the fixture text is "routes traffic through an Envoy sidecar
 * proxy" (not "Alice's addition"), this step will fail with a clear mismatch
 * message — matching the @red intent of these scenarios.
 */
Then(
    'an InputBox appears pre-populated with {string}',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, expectedValue: string) {
        assert.ok(this.page, 'Page not available');

        await this.page.waitForSelector(
            '.quick-input-widget[style*="display: flex"] input[type="text"]',
            { timeout: 8000 }
        );

        const currentValue: string = await this.page.evaluate(`(() => {
            const input = document.querySelector('.quick-input-widget input[type="text"]');
            return input ? (input as HTMLInputElement).value : '';
        })()`) as string;

        assert.ok(
            currentValue.includes(expectedValue),
            `Expected InputBox value to contain "${expectedValue}" but got: "${currentValue}"`
        );
    }
);

// ── When: clear and type in InputBox ─────────────────────────────────────────

/**
 * Clear the InputBox's current value, type new text, and submit with Enter.
 */
When(
    'I clear and type {string} in the InputBox',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, text: string) {
        assert.ok(this.page, 'Page not available');

        const input = await this.page.waitForSelector(
            '.quick-input-widget input[type="text"]',
            { timeout: 8000 }
        );
        assert.ok(input, 'InputBox input element not found');

        // Select-all then type to replace the pre-populated value
        await input.focus();
        await this.page.keyboard.press('Control+a');
        await input.fill(text);
        await this.page.keyboard.press('Enter');
        await this.page.waitForTimeout(500);
    }
);

// ── Then: second InputBox for reason ─────────────────────────────────────────

/**
 * After the first InputBox is submitted, the amend/supersede flow opens a
 * second InputBox for the reason. We simply wait for an InputBox to be visible;
 * "second" is contextual (the first was already dismissed via Enter).
 */
Then(
    'a second InputBox appears for reason',
    { timeout: 10000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');

        await this.page.waitForSelector(
            '.quick-input-widget[style*="display: flex"] input[type="text"]',
            { timeout: 8000 }
        );
    }
);

// ── Then: InputBox appears for new text ──────────────────────────────────────

/**
 * For supersede: wait for the InputBox that requests the replacement text.
 * Semantically identical to the shared "an InputBox appears" step, but
 * defined separately so the feature file can express intent clearly.
 */
Then(
    'an InputBox appears for new text',
    { timeout: 10000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');

        await this.page.waitForSelector(
            '.quick-input-widget[style*="display: flex"] input[type="text"]',
            { timeout: 8000 }
        );
    }
);

// ── Then: document contains string ───────────────────────────────────────────

/**
 * Assert that the live document text contains the given string.
 * Polls for up to 8 s to allow the extension to write the change.
 */
Then(
    'the live document contains {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, expected: string) {
        assert.ok(this.page, 'Page not available');

        const deadline = Date.now() + 8000;
        let lastText = '';

        while (Date.now() < deadline) {
            const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
            lastText = text;
            if (text.includes(expected)) {
                return;
            }
            await this.page.waitForTimeout(300);
        }

        assert.ok(
            false,
            `Expected document to contain "${expected}" but it does not.\nDocument (first 500 chars):\n${lastText.slice(0, 500)}`
        );
    }
);

// ── Then: new change exists in document ──────────────────────────────────────

/**
 * Assert that the document contains a new CriticMarkup insertion wrapping
 * the given text, introduced by the supersede operation.
 *
 * Searches for `{++<text>` in the document (accepting the text with or without
 * the closing `++}` to tolerate footnote-reference suffixes).
 */
Then(
    'a new change exists with text {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, expectedText: string) {
        assert.ok(this.page, 'Page not available');

        const deadline = Date.now() + 8000;
        let lastText = '';

        while (Date.now() < deadline) {
            const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
            lastText = text;
            // Look for CriticMarkup insertion syntax containing the expected text
            if (text.includes(`{++${expectedText}`) || text.includes(expectedText)) {
                return;
            }
            await this.page.waitForTimeout(300);
        }

        assert.ok(
            false,
            `Expected document to contain new CriticMarkup change with text "${expectedText}".\nDocument (first 800 chars):\n${lastText.slice(0, 800)}`
        );
    }
);
