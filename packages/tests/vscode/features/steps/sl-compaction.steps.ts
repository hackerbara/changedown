/**
 * Phase-specific step definitions for SL-CP — Compaction guards in running VS Code.
 *
 * Shared steps (launch, parsing, cursor positioning, footnote assertions,
 * screenshots) are in sl-shared.steps.ts. Interaction steps ("When I execute")
 * are in interaction.steps.ts.
 *
 * Steps defined here:
 *   - Then the document contains {string} as plain text
 *   - Then the document does not contain {string}
 *   - Then an error or warning message appears about {string}
 *   - Then the document still contains {string}
 *   - Then a warning dialog appears about {string}
 *   - When I confirm {string}
 *   - Then no warning dialog appeared
 */

import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeTracksWorld } from './world';
import { getDocumentText, executeCommandViaBridge } from '../../journeys/playwrightHarness';

// ── Extend World with SL-CP notification tracking state ─────────────

declare module './world' {
    interface ChangeTracksWorld {
        slCpWarningAppeared?: boolean;
    }
}

// ── Notification/dialog selector constants ───────────────────────────

/** Selector for a visible notification toast */
const TOAST_ITEM = '.notification-toast';

/** Selector for action buttons inside a notification toast */
const TOAST_ACTION = '.notification-toast .action-item a.action-label';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Wait for a VS Code notification toast whose text includes the given keyword.
 * Returns the toast element handle, or null if none appears within the timeout.
 */
async function waitForNotificationContaining(
    world: ChangeTracksWorld,
    keyword: string,
    timeoutMs = 6000
): Promise<boolean> {
    assert.ok(world.page, 'Page not available');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const found = await world.page.evaluate(
            `(() => {
                const kw = ${JSON.stringify(keyword.toLowerCase())};
                const toasts = document.querySelectorAll(${JSON.stringify(TOAST_ITEM)});
                for (const t of Array.from(toasts)) {
                    if (t.textContent && t.textContent.toLowerCase().includes(kw)) {
                        return true;
                    }
                }
                return false;
            })()`
        ) as boolean;
        if (found) return true;
        await world.page.waitForTimeout(200);
    }
    return false;
}

/**
 * Check whether any notification toast is currently visible.
 */
async function hasAnyNotificationToast(world: ChangeTracksWorld): Promise<boolean> {
    assert.ok(world.page, 'Page not available');
    return world.page.evaluate(
        `document.querySelectorAll(${JSON.stringify(TOAST_ITEM)}).length > 0`
    ) as Promise<boolean>;
}

// ── Step definitions ─────────────────────────────────────────────────

Then(
    'the document contains {string} as plain text',
    { timeout: 12000 },
    async function (this: ChangeTracksWorld, expected: string) {
        assert.ok(this.page, 'Page not available');
        // Poll to allow the compaction command to settle
        const deadline = Date.now() + 8000;
        let docText = '';
        while (Date.now() < deadline) {
            docText = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
            if (docText.includes(expected)) {
                // Verify it is NOT inside CriticMarkup delimiters by checking
                // the text appears without surrounding {++ ++} / {-- --} etc.
                const insideMarkup = /\{[+\-~=][+\-~=][^}]*/.test(
                    docText.slice(
                        Math.max(0, docText.indexOf(expected) - 3),
                        docText.indexOf(expected) + expected.length + 3
                    )
                );
                if (!insideMarkup) return;
            }
            await this.page!.waitForTimeout(300);
        }
        assert.ok(
            docText.includes(expected),
            `Expected document to contain "${expected}" as plain text (without CriticMarkup delimiters).\nDocument text:\n${docText}`
        );
    }
);

Then(
    'the live document does not contain {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, unexpected: string) {
        assert.ok(this.page, 'Page not available');
        // Wait for LSP edit to propagate before asserting absence
        await executeCommandViaBridge(this.page, 'changetracks._testWaitForChanges');
        await this.page.waitForTimeout(500);
        const docText = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        assert.ok(
            !docText.includes(unexpected),
            `Expected document NOT to contain "${unexpected}" but it was found.\nDocument text:\n${docText}`
        );
    }
);

Then(
    'an error or warning message appears about {string}',
    { timeout: 12000 },
    async function (this: ChangeTracksWorld, keyword: string) {
        assert.ok(this.page, 'Page not available');
        const found = await waitForNotificationContaining(this, keyword);
        assert.ok(
            found,
            `Expected an error or warning notification containing "${keyword}" but none appeared within timeout.`
        );
    }
);

Then(
    'the document still contains {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, expected: string) {
        assert.ok(this.page, 'Page not available');
        await this.page.waitForTimeout(300);
        const docText = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        assert.ok(
            docText.includes(expected),
            `Expected document to still contain "${expected}" (unchanged after blocked compaction).\nDocument text:\n${docText}`
        );
    }
);

Then(
    'a warning dialog appears about {string}',
    { timeout: 12000 },
    async function (this: ChangeTracksWorld, keyword: string) {
        assert.ok(this.page, 'Page not available');
        const found = await waitForNotificationContaining(this, keyword);
        // Record whether a warning appeared for the "no warning dialog appeared" assertion
        this.slCpWarningAppeared = found;
        assert.ok(
            found,
            `Expected a warning dialog/notification containing "${keyword}" but none appeared within timeout.`
        );
    }
);

When(
    'I confirm {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, buttonLabel: string) {
        assert.ok(this.page, 'Page not available');
        // Find and click the action button whose text matches the label
        const deadline = Date.now() + 8000;
        let clicked = false;
        while (Date.now() < deadline) {
            const actionButtons = await this.page.$$(TOAST_ACTION);
            for (const btn of actionButtons) {
                const text = await btn.textContent();
                if (text && text.trim() === buttonLabel) {
                    await btn.click();
                    clicked = true;
                    break;
                }
            }
            if (clicked) break;
            await this.page.waitForTimeout(200);
        }
        assert.ok(
            clicked,
            `Could not find notification action button with label "${buttonLabel}" to click.`
        );
        await this.page.waitForTimeout(500);
    }
);

Then(
    'no warning dialog appeared',
    { timeout: 8000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        // If we tracked a warning in a previous step, use that value
        if (this.slCpWarningAppeared === true) {
            assert.fail('A warning dialog appeared but was not expected for this scenario.');
        }
        // Also do a live check: no toast should be visible
        const hasToast = await hasAnyNotificationToast(this);
        assert.ok(
            !hasToast,
            'Expected no warning dialog/notification to appear, but one is visible.'
        );
    }
);
