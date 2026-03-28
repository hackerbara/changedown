/**
 * Step definitions for OVR1 — Accept overlap with highlight+comment.
 *
 * Phase-specific steps only. Shared steps (launch, parsing, cursor positioning,
 * footnote assertions, screenshots, execute command) are in sl-shared.steps.ts
 * and interaction.steps.ts.
 *
 * Fixture: packages/tests/vscode/fixtures/journeys/accept-overlap-highlight-comment.md
 */

import { Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeDownWorld } from './world';

// ── Then: no error notification ──────────────────────────────────────

/**
 * Assert that no VS Code error notification toast is visible.
 * Waits briefly for any notification to appear, then asserts absence.
 * This catches the "overlapping ranges are not allowed" error from
 * workspace.applyEdit as well as any other error notifications.
 */
Then(
    'no error notification appeared',
    { timeout: 8000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');
        // Wait a moment for any notification to potentially appear
        await this.page.waitForTimeout(1500);
        const errorTexts = await this.page.evaluate(`(() => {
            const toasts = document.querySelectorAll('.notifications-toasts .notification-toast');
            const errors = [];
            for (const toast of toasts) {
                const severity = toast.querySelector('.codicon-error, .codicon-warning');
                if (severity) {
                    errors.push(toast.textContent || '');
                }
            }
            return errors;
        })()`) as string[];
        assert.strictEqual(
            errorTexts.length,
            0,
            `Expected no error notifications but found ${errorTexts.length}: ${JSON.stringify(errorTexts)}`
        );
    }
);
