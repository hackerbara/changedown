/**
 * Visual regression step definitions for VIS1 feature.
 *
 * Wraps the existing screenshotHelper (pixelmatch-based golden comparison)
 * and launchVSCode (Playwright Electron launcher) so that visual regression
 * tests run as Cucumber scenarios alongside the rest of the BDD suite.
 *
 * Scenarios tagged @visual are selected by `npm run test:visual`.
 * Set UPDATE_GOLDEN=1 to promote actual screenshots to golden baselines.
 */

import { Given, Then, After } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeDownWorld } from './world';
import {
    launchVSCode,
    closeVSCode,
} from '../../visual/launchVSCode';
import {
    captureEditorScreenshot,
    assertScreenshotMatches,
    updateGolden,
    ensureDirectories,
} from '../../visual/screenshotHelper';

// ── Given steps ──────────────────────────────────────────────────────

/**
 * Open a visual fixture in VS Code (dark theme, default).
 * Visual fixtures live in fixtures/visual/.
 */
Given(
    'VS Code is open with visual fixture {string}',
    { timeout: 60000 },
    async function (this: ChangeDownWorld, fixture: string) {
        this.fixtureFile = fixture;
        this.instance = await launchVSCode(fixture);
        this.page = this.instance.page;
        this.currentViewMode = 'all-markup';
    }
);

/**
 * Open a visual fixture with the light colour theme.
 */
Given(
    'VS Code is open with visual fixture {string} using light theme',
    { timeout: 60000 },
    async function (this: ChangeDownWorld, fixture: string) {
        this.fixtureFile = fixture;
        this.instance = await launchVSCode(fixture, { theme: 'light' });
        this.page = this.instance.page;
        this.currentViewMode = 'all-markup';
    }
);

// ── When steps ───────────────────────────────────────────────────────
// "I press {string}" and "I wait {int} milliseconds" are defined in
// interaction.steps.ts and shared across all tiers.

// ── Then steps ───────────────────────────────────────────────────────

/**
 * Capture a screenshot and compare against the golden baseline.
 *
 * When UPDATE_GOLDEN=1, the actual screenshot is promoted to golden
 * instead of compared. This matches the old `--update` flag behaviour.
 */
Then(
    'the editor screenshot matches golden {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, goldenName: string) {
        assert.ok(this.page, 'Page not available');
        ensureDirectories();

        // Allow decorations to settle before capturing
        await this.page.waitForTimeout(1000);

        await captureEditorScreenshot(this.page, goldenName);

        if (process.env.UPDATE_GOLDEN === '1') {
            updateGolden(goldenName);
        } else {
            assertScreenshotMatches(goldenName, 0.5);
        }
    }
);

// ── Cleanup ──────────────────────────────────────────────────────────

/**
 * Close the VS Code instance after each @visual scenario.
 * Visual tests each get their own instance (no launch batching) because
 * different fixtures, themes, and isolated scroll/mutation state make
 * sharing impractical for pixel-perfect comparison.
 */
After({ tags: '@visual' }, async function (this: ChangeDownWorld) {
    if (this.instance) {
        await closeVSCode(this.instance).catch(() => {});
        this.instance = undefined;
        this.page = undefined;
    }
});
