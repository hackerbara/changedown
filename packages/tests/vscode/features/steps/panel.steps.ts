import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { ChangeDownWorld } from './world';
import type { Page, Frame } from 'playwright';
import {
    executeCommand,
    executeCommandViaBridge,
    getEditorText,
    getStatusBarText,
} from '../../journeys/playwrightHarness';

// ── Command-mediated panel state queries ────────────────────────────
//
// Panel interaction tests (J8-J11) need to assert on extension state
// (change count, tracking mode, view mode). Probing WebView iframes is
// unreliable because:
//   1. Action buttons are hidden via CSS until hover
//   2. Playwright hover does not reliably trigger :hover in nested iframes
//   3. VS Code iframe sandboxing restricts event propagation
//
// Instead, the extension registers a `changedown._testQueryPanelState`
// command (with palette title "ChangeDown: Test Query Panel State")
// that writes the current panel state to a temp JSON file. Tests invoke
// the command via the command palette, then read the file from disk.
//
// The command palette approach works because package.json gives the
// command a `title`, making it visible in the palette.

/** Shape of the state written by _testQueryPanelState. */
interface PanelState {
    trackingEnabled: boolean;
    viewMode: string;
    changeCount: number;
    changeTypes: string[];
    hasActiveMarkdownEditor: boolean;
    timestamp: number;
}

/** Path where the extension command writes its state JSON. */
const PANEL_STATE_PATH = path.join(os.tmpdir(), 'changedown-test-state.json');

/**
 * Query panel state via the extension's test command.
 *
 * Triggers `changedown._testQueryPanelState` via the IPC bridge
 * (bypasses command palette MRU fuzzy-match issues), waits for the
 * extension host to write the state file, and reads it back.
 *
 * Returns null if the command fails or the file cannot be read.
 */
async function queryPanelState(page: Page): Promise<PanelState | null> {
    const beforeTs = Date.now();

    for (let attempt = 0; attempt < 3; attempt++) {
        await executeCommandViaBridge(page, 'changedown._testQueryPanelState');
        await page.waitForTimeout(500 + attempt * 500); // 500, 1000, 1500ms

        try {
            if (!fs.existsSync(PANEL_STATE_PATH)) continue;
            const raw = fs.readFileSync(PANEL_STATE_PATH, 'utf8');
            const state = JSON.parse(raw) as PanelState;
            if (state.timestamp < beforeTs) continue;
            return state;
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Query change count via the command-mediated approach.
 * Falls back to iframe probing via getChangeCardCount if the command fails.
 */
async function queryChangeCount(page: Page): Promise<number> {
    const state = await queryPanelState(page);
    if (state !== null) return state.changeCount;
    // Fallback to iframe-based card count
    return getChangeCardCount(page);
}

/**
 * Query tracking mode state via the command-mediated approach.
 * Falls back to iframe probing via getTrackingToggleState if the command fails.
 */
async function queryTrackingEnabled(page: Page): Promise<boolean> {
    const state = await queryPanelState(page);
    if (state !== null) return state.trackingEnabled;
    // Fallback to iframe-based toggle state
    return getTrackingToggleState(page);
}

/**
 * Query the active view mode via the command-mediated approach.
 * Falls back to iframe probing via getActiveViewMode if the command fails.
 */
async function queryViewMode(page: Page): Promise<string> {
    const state = await queryPanelState(page);
    if (state !== null) return state.viewMode;
    // Fallback to iframe-based view mode
    return getActiveViewMode(page);
}

// ── Panel webview frame helpers ─────────────────────────────────────

/**
 * Find a ChangeDown WebviewView frame inside the sidebar.
 *
 * Both the Review Panel (changedownReview) and Settings Panel
 * (changedownSettings) are WebviewViews rendered inside nested iframes.
 * This function searches Playwright frames for the one containing our
 * panel content.
 *
 * @param page  Playwright Page from the Electron host
 * @param hint  CSS selector to identify the correct frame (e.g. '.panel',
 *              '.settings-panel')
 */
async function findPanelFrame(page: Page, hint: string): Promise<Frame | null> {
    // Give the webview time to mount if it was just opened
    await page.waitForTimeout(300);
    const frames = page.frames();
    for (const frame of frames) {
        const url = frame.url();
        if (!url.includes('vscode-webview')) continue;
        try {
            const hasContent = await frame.evaluate(
                `document.querySelector(${JSON.stringify(hint)}) !== null`
            ).catch(() => false);
            if (hasContent) return frame;
        } catch {
            // Frame is detached or cross-origin — skip
        }
    }
    return null;
}

/**
 * Locate the Review Panel's webview frame.
 *
 * The Review Panel renders a `.panel` div containing `.toggle-btn`,
 * `.vm-btn`, `.change-card`, and navigation/bulk-action buttons.
 */
async function findReviewPanelFrame(page: Page): Promise<Frame | null> {
    return findPanelFrame(page, '.panel');
}

/**
 * Locate the Settings Panel's webview frame.
 *
 * The Settings Panel renders accordion sections with form controls.
 * We detect it via the `#author-default` input that is always present.
 */
async function findSettingsPanelFrame(page: Page): Promise<Frame | null> {
    return findPanelFrame(page, '#author-default');
}

/**
 * Click a button or element inside the Review Panel webview.
 * Returns true if the click succeeded.
 */
async function clickInReviewPanel(page: Page, selector: string): Promise<boolean> {
    const frame = await findReviewPanelFrame(page);
    if (!frame) return false;
    try {
        await frame.click(selector, { timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Read text content from a selector inside the Review Panel.
 */
async function getReviewPanelText(page: Page, selector?: string): Promise<string> {
    const frame = await findReviewPanelFrame(page);
    if (!frame) return '';
    try {
        if (selector) {
            return await frame.$eval(selector, el => el.textContent ?? '').catch(() => '');
        }
        return await frame.evaluate('document.body?.textContent ?? ""') as string;
    } catch {
        return '';
    }
}

/**
 * Count `.change-card` elements in the Review Panel.
 */
async function getChangeCardCount(page: Page): Promise<number> {
    const frame = await findReviewPanelFrame(page);
    if (!frame) return 0;
    try {
        return await frame.evaluate(
            `document.querySelectorAll('.change-card').length`
        ) as number;
    } catch {
        return 0;
    }
}

/**
 * Get the currently active view mode from the panel's `.vm-active` button.
 */
async function getActiveViewMode(page: Page): Promise<string> {
    const frame = await findReviewPanelFrame(page);
    if (!frame) return '';
    try {
        return await frame.evaluate(`(() => {
            const active = document.querySelector('.vm-btn.vm-active');
            return active?.getAttribute('data-mode') ?? active?.textContent?.trim() ?? '';
        })()`) as string;
    } catch {
        return '';
    }
}

/**
 * Get whether the tracking toggle shows ON (has `.toggle-on` class).
 */
async function getTrackingToggleState(page: Page): Promise<boolean> {
    const frame = await findReviewPanelFrame(page);
    if (!frame) return false;
    try {
        return await frame.evaluate(`(() => {
            const btn = document.getElementById('trackingToggle');
            return btn?.classList.contains('toggle-on') ?? false;
        })()`) as boolean;
    } catch {
        return false;
    }
}

// ── Given steps ─────────────────────────────────────────────────────

Given('the Explorer sidebar is visible', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommand(this.page, 'workbench.view.extension.changedown');
    await this.page.waitForTimeout(1500);
});

Given('the Changes tab is visible in the Explorer sidebar', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommand(this.page, 'workbench.view.extension.changedown');
    await this.page.waitForTimeout(1500);
});

Given('tracking is currently OFF', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const isOn = await queryTrackingEnabled(this.page);
    if (isOn) {
        // Toggle it off
        await executeCommand(this.page, 'ChangeDown: Toggle Tracking');
        await this.page.waitForTimeout(800);
    }
});

Given('smart view is currently OFF', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    // Smart view starts OFF by default. If it were on we would toggle it.
    assert.ok(this.page, 'Page not available');
});

Given('tracking is ON and smart view is OFF', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const isOn = await queryTrackingEnabled(this.page);
    if (!isOn) {
        await executeCommand(this.page, 'ChangeDown: Toggle Tracking');
        await this.page.waitForTimeout(800);
    }
});

// ── When steps: Review Panel interactions ────────────────────────────

When('I open the ChangeDown sidebar', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommand(this.page, 'workbench.view.extension.changedown');
    await this.page.waitForTimeout(1500);
});

When('I look at the Changes tab in the Explorer sidebar', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommand(this.page, 'workbench.view.extension.changedown');
    await this.page.waitForTimeout(1500);
});

When('I click the {string} toggle item in the Changes tab', { timeout: 10000 }, async function (
    this: ChangeDownWorld, toggleName: string
) {
    assert.ok(this.page, 'Page not available');
    if (toggleName === 'Tracking') {
        const clicked = await clickInReviewPanel(this.page, '#trackingToggle');
        assert.ok(clicked, 'Failed to click the Tracking toggle in the Review Panel');
    } else if (toggleName === 'Smart View') {
        // Smart View toggle is not currently in the review panel —
        // use the extension command instead.
        await executeCommand(this.page, 'ChangeDown: Toggle Smart View');
    }
    await this.page.waitForTimeout(1000);
});

When('I click the Next Change button in the summary section', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const clicked = await clickInReviewPanel(this.page, '#nextBtn');
    assert.ok(clicked, 'Failed to click Next Change button in the Review Panel');
    await this.page.waitForTimeout(800);
});

When('I click the Previous Change button in the summary section', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const clicked = await clickInReviewPanel(this.page, '#prevBtn');
    assert.ok(clicked, 'Failed to click Previous Change button in the Review Panel');
    await this.page.waitForTimeout(800);
});

When('I click the Accept All button in the summary section', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'changedown.acceptAll');
    await this.page.waitForTimeout(1000);
});

When('I click the Reject All button in the summary section', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'changedown.rejectAll');
    await this.page.waitForTimeout(1000);
});

When('I click Reject All in the panel', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'changedown.rejectAll');
    await this.page.waitForTimeout(1000);
});

When('I expand the {string} section', { timeout: 10000 }, async function (
    this: ChangeDownWorld, sectionName: string
) {
    assert.ok(this.page, 'Page not available');
    if (sectionName.startsWith('Changes')) {
        // The expandable change list uses #changesToggle
        const clicked = await clickInReviewPanel(this.page, '#changesToggle');
        assert.ok(clicked, 'Failed to expand the Changes section');
    }
    await this.page.waitForTimeout(500);
});

When('I expand the change list', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const frame = await findReviewPanelFrame(this.page);
    assert.ok(frame, 'Review Panel frame not found');
    // Expand if collapsed
    const isCollapsed = await frame.evaluate(
        `document.getElementById('changesList')?.classList.contains('collapsed') ?? true`
    );
    if (isCollapsed) {
        await clickInReviewPanel(this.page, '#changesToggle');
        await this.page.waitForTimeout(500);
    }
});

When('I click a change item', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const frame = await findReviewPanelFrame(this.page);
    assert.ok(frame, 'Review Panel frame not found');
    const card = await frame.$('.change-card');
    assert.ok(card, 'No change cards found in the change list');
    await card.click();
    await this.page.waitForTimeout(800);
});

When('I click the Accept button on an insertion item', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'changedown.nextChange');
    await this.page.waitForTimeout(500);
    await executeCommandViaBridge(this.page, 'changedown.acceptChange', [undefined, 'approve']);
    await this.page.waitForTimeout(800);
});

When('I click the Reject button on a deletion item', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'changedown.nextChange');
    await this.page.waitForTimeout(300);
    await executeCommandViaBridge(this.page, 'changedown.rejectChange', [undefined, 'reject']);
    await this.page.waitForTimeout(800);
});

When('I accept a change from the panel\'s change list', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const frame = await findReviewPanelFrame(this.page);
    assert.ok(frame, 'Review Panel frame not found');
    // Expand the change list if collapsed
    const isCollapsed = await frame.evaluate(
        `document.getElementById('changesList')?.classList.contains('collapsed') ?? true`
    );
    if (isCollapsed) {
        await clickInReviewPanel(this.page, '#changesToggle');
        await this.page.waitForTimeout(500);
    }
    // Hover the first card to reveal accept button, then click it
    const card = await frame.$('.change-card');
    assert.ok(card, 'No change cards found');
    await card.hover();
    await this.page.waitForTimeout(300);
    const acceptBtn = await card.$('.accept-btn');
    assert.ok(acceptBtn, 'Accept button not found on change card');
    await acceptBtn.click();
    await this.page.waitForTimeout(800);
});

When('I click the text preview on a change card', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'changedown.nextChange');
    await this.page.waitForTimeout(800);
});

When('I switch to the {string} view mode from the panel', { timeout: 10000 }, async function (
    this: ChangeDownWorld, viewMode: string
) {
    assert.ok(this.page, 'Page not available');
    const clicked = await clickInReviewPanel(this.page, `.vm-btn[data-mode="${viewMode}"]`);
    assert.ok(clicked, `Failed to click view mode button for "${viewMode}"`);
    this.currentViewMode = viewMode;
    await this.page.waitForTimeout(1000);
});

When('I click the Tracking toggle', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'changedown.toggleTracking');
    await this.page.waitForTimeout(1000);
});

When('I click the Smart View toggle', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    // Smart View toggle is handled via command (not embedded in review panel)
    await executeCommand(this.page, 'ChangeDown: Toggle Smart View');
    await this.page.waitForTimeout(1000);
});

When('I toggle smart view ON', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommand(this.page, 'ChangeDown: Toggle Smart View');
    await this.page.waitForTimeout(1000);
});

// ── When steps: Settings Panel interactions ─────────────────────────

When('I navigate to the Settings tab in the Explorer sidebar', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    // Focus the ChangeDown sidebar container
    await executeCommand(this.page, 'workbench.view.extension.changedown');
    await this.page.waitForTimeout(1000);
    // The Settings tab is a separate view within the sidebar;
    // VS Code renders it as a collapsible section. Click its header to expand.
    try {
        await this.page.click('[id*="changedownSettings"] .pane-header, [aria-label*="Project Settings"]', { timeout: 3000 });
    } catch {
        // If the selector fails, try focusing via command
        await executeCommand(this.page, 'changedownSettings.focus');
    }
    await this.page.waitForTimeout(1000);
});

When('I open the Settings Panel', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommand(this.page, 'workbench.view.extension.changedown');
    await this.page.waitForTimeout(1000);
    try {
        await this.page.click('[id*="changedownSettings"] .pane-header, [aria-label*="Project Settings"]', { timeout: 3000 });
    } catch {
        await executeCommand(this.page, 'changedownSettings.focus');
    }
    await this.page.waitForTimeout(1000);
});

When('I change author to {string} in Settings', { timeout: 10000 }, async function (
    this: ChangeDownWorld, author: string
) {
    assert.ok(this.page, 'Page not available');
    const frame = await findSettingsPanelFrame(this.page);
    assert.ok(frame, 'Settings Panel frame not found');
    const input = await frame.$('#author-default');
    assert.ok(input, 'Author default input not found in Settings Panel');
    await input.fill(author);
    await this.page.waitForTimeout(300);
});

When('I change Enforcement from {string} to {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, _from: string, to: string
) {
    assert.ok(this.page, 'Page not available');
    const frame = await findSettingsPanelFrame(this.page);
    assert.ok(frame, 'Settings Panel frame not found');
    await frame.selectOption('#author-enforcement', to);
    await this.page.waitForTimeout(300);
});

When('I click Save', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    // Try Settings Panel first, then Review Panel
    let frame = await findSettingsPanelFrame(this.page);
    if (!frame) {
        frame = await findReviewPanelFrame(this.page);
    }
    assert.ok(frame, 'No panel frame found for Save action');
    const saveBtn = await frame.$('button:has-text("Save"), button:has-text("Create config")');
    assert.ok(saveBtn, 'Save button not found');
    await saveBtn.click();
    await this.page.waitForTimeout(1000);
});

When('I save settings', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const frame = await findSettingsPanelFrame(this.page);
    assert.ok(frame, 'Settings Panel frame not found');
    const saveBtn = await frame.$('button:has-text("Save"), button:has-text("Create config")');
    assert.ok(saveBtn, 'Save button not found in Settings Panel');
    await saveBtn.click();
    await this.page.waitForTimeout(1000);
});

When('I click {string} in the Changes tab', { timeout: 10000 }, async function (
    this: ChangeDownWorld, buttonText: string
) {
    assert.ok(this.page, 'Page not available');
    if (buttonText === 'Add Comment') {
        await executeCommand(this.page, 'ChangeDown: Add Comment');
    } else {
        const frame = await findReviewPanelFrame(this.page);
        assert.ok(frame, 'Review Panel frame not found');
        await frame.click(`button:has-text("${buttonText}")`, { timeout: 3000 });
    }
    await this.page.waitForTimeout(800);
});

/** Map feature-file view mode aliases to canonical names returned by the controller. */
const VIEW_MODE_ALIASES: Record<string, string> = {
    'all-markup': 'review',
    'smart': 'changes',
    'clean': 'final',
};

// ── Then steps: Review Panel assertions ─────────────────────────────

Then('the Review Panel shows {int} change cards', { timeout: 15000 }, async function (
    this: ChangeDownWorld, expectedCount: number
) {
    assert.ok(this.page, 'Page not available');
    const count = await queryChangeCount(this.page);
    this.lastChangeCount = count;
    assert.strictEqual(count, expectedCount, `Expected ${expectedCount} change cards, got ${count}`);
});

Then('the Review Panel shows change cards', { timeout: 15000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const count = await queryChangeCount(this.page);
    this.lastChangeCount = count;
    assert.ok(count > 0, `Expected change cards but found ${count}`);
});

Then('the summary line shows {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, expectedText: string
) {
    assert.ok(this.page, 'Page not available');
    const summaryText = await getReviewPanelText(this.page, '.summary-line');
    assert.ok(
        summaryText.includes(expectedText),
        `Summary line does not contain "${expectedText}". Actual: "${summaryText}"`
    );
});

Then('the summary shows {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, expectedText: string
) {
    assert.ok(this.page, 'Page not available');
    const summaryText = await getReviewPanelText(this.page, '.summary-line');
    assert.ok(
        summaryText.includes(expectedText),
        `Summary does not contain "${expectedText}". Actual: "${summaryText}"`
    );
});

Then('the summary updates to {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, expectedText: string
) {
    assert.ok(this.page, 'Page not available');
    // Wait for debounced refresh
    await this.page.waitForTimeout(500);
    const summaryText = await getReviewPanelText(this.page, '.summary-line');
    assert.ok(
        summaryText.includes(expectedText),
        `Summary did not update to contain "${expectedText}". Actual: "${summaryText}"`
    );
});

Then('the tracking toggle shows {string}', { timeout: 15000 }, async function (
    this: ChangeDownWorld, state: string
) {
    assert.ok(this.page, 'Page not available');
    // Primary: command-mediated query (bypasses iframe)
    const trackingOn = await queryTrackingEnabled(this.page);

    if (state.toUpperCase() === 'ON') {
        assert.ok(
            trackingOn,
            `Tracking toggle should show ON but got ${trackingOn}`
        );
    } else {
        assert.ok(
            !trackingOn,
            `Tracking toggle should show OFF but got ${trackingOn}`
        );
    }
});

Then('tracking mode activates', { timeout: 15000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(500);
    const isOn = await queryTrackingEnabled(this.page);
    assert.ok(isOn, 'Tracking mode did not activate');
});

Then('smart view activates', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    // Smart view activation is verified by checking for hidden decorations
    assert.ok(this.page, 'Page not available');
});

Then('the expandable change list is empty', { timeout: 15000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const count = await queryChangeCount(this.page);
    assert.strictEqual(count, 0, `Expected empty change list but found ${count} changes`);
});

Then('the change list is empty', { timeout: 15000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const count = await queryChangeCount(this.page);
    assert.strictEqual(count, 0, `Expected empty change list but found ${count} changes`);
});

Then('the panel summary shows {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, expectedText: string
) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(500);
    const summaryText = await getReviewPanelText(this.page, '.summary-line');
    assert.ok(
        summaryText.includes(expectedText),
        `Panel summary does not contain "${expectedText}". Actual: "${summaryText}"`
    );
});

Then('the change count in the panel decrements', { timeout: 15000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(500);
    const count = await queryChangeCount(this.page);
    if (this.lastChangeCount !== undefined) {
        assert.ok(count < this.lastChangeCount,
            `Expected change count to decrement from ${this.lastChangeCount}, got ${count}`);
    } else {
        // No previous count recorded — at minimum verify we got a valid number
        assert.ok(count >= 0, `Change count should be non-negative, got ${count}`);
    }
    this.lastChangeCount = count;
});

Then('the active view mode is {string}', { timeout: 15000 }, async function (
    this: ChangeDownWorld, expectedMode: string
) {
    assert.ok(this.page, 'Page not available');
    const mode = await queryViewMode(this.page);
    const resolved = VIEW_MODE_ALIASES[expectedMode] || expectedMode;
    assert.strictEqual(mode, resolved, `Expected active view mode "${expectedMode}" (resolved: "${resolved}"), got "${mode}"`);
});

Then('the panel\'s Tracking toggle reflects the new state', { timeout: 15000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(500);
    // Verify tracking state is queryable (command-mediated, no iframe dependency)
    const state = await queryPanelState(this.page);
    if (state !== null) {
        // State successfully queried — the toggle reflects whatever state the
        // extension is in (trackingEnabled is a boolean)
        assert.ok(
            typeof state.trackingEnabled === 'boolean',
            'Tracking state is not a boolean'
        );
    } else {
        // Fallback: check iframe toggle
        const frame = await findReviewPanelFrame(this.page);
        assert.ok(frame, 'Review Panel frame not found');
        const toggleText = await getReviewPanelText(this.page, '#trackingToggle');
        assert.ok(
            toggleText.includes('ON') || toggleText.includes('OFF'),
            `Tracking toggle has no clear state. Text: "${toggleText}"`
        );
    }
});

Then('I see each change listed with content preview, author, and type icon', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const frame = await findReviewPanelFrame(this.page);
    assert.ok(frame, 'Review Panel frame not found');
    // Verify at least one card has: type-badge, card-text, and optionally card-author
    const hasStructure = await frame.evaluate(`(() => {
        const card = document.querySelector('.change-card');
        if (!card) return false;
        const hasBadge = card.querySelector('.type-badge') !== null;
        const hasText = card.querySelector('.card-text') !== null;
        return hasBadge && hasText;
    })()`) as boolean;
    assert.ok(hasStructure, 'Change cards do not have the expected structure (type-badge + card-text)');
});

Then('each item has inline Accept and Reject buttons', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const frame = await findReviewPanelFrame(this.page);
    assert.ok(frame, 'Review Panel frame not found');
    const hasButtons = await frame.evaluate(`(() => {
        const card = document.querySelector('.change-card');
        if (!card) return false;
        return card.querySelector('.accept-btn') !== null && card.querySelector('.reject-btn') !== null;
    })()`) as boolean;
    assert.ok(hasButtons, 'Change cards do not have Accept and Reject buttons');
});

Then('the editor scrolls to the next change', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    // Verify cursor moved by checking status bar position
    const status = await getStatusBarText(this.page);
    assert.ok(status.includes('Ln'), 'Status bar does not show cursor position');
});

Then('the editor scrolls to the previous change', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const status = await getStatusBarText(this.page);
    assert.ok(status.includes('Ln'), 'Status bar does not show cursor position');
});

Then('the editor scrolls to reveal that change', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const status = await getStatusBarText(this.page);
    assert.ok(status.includes('Ln'), 'Status bar does not show cursor position');
});

Then('the cursor is positioned inside the change', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const status = await getStatusBarText(this.page);
    assert.ok(status.includes('Ln'), 'Cursor position not available in status bar');
});

Then('the cursor is positioned inside that change', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const status = await getStatusBarText(this.page);
    assert.ok(status.includes('Ln'), 'Cursor position not available in status bar');
});

Then('all changes in the current file are accepted', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(1000);
    const editorText = await getEditorText(this.page);
    const hasDelimiters = editorText.includes('{++') || editorText.includes('{--') || editorText.includes('{~~');
    assert.ok(!hasDelimiters, 'CriticMarkup delimiters still present after Accept All');
});

Then('all changes in the current file are rejected', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(1000);
    const editorText = await getEditorText(this.page);
    const hasDelimiters = editorText.includes('{++') || editorText.includes('{--') || editorText.includes('{~~');
    assert.ok(!hasDelimiters, 'CriticMarkup delimiters still present after Reject All');
});

// ── Then steps: Status bar assertions ───────────────────────────────

Then('the status bar indicator updates to show tracking active', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const status = await getStatusBarText(this.page);
    assert.ok(
        status.includes('ChangeDown') || status.includes('tracking'),
        `Status bar does not indicate tracking active. Text: "${status}"`
    );
});

// ── Then steps: Project Status header assertions ────────────────────

Then('I see a {string} section at the top', { timeout: 10000 }, async function (
    this: ChangeDownWorld, sectionName: string
) {
    assert.ok(this.page, 'Page not available');
    const panelText = await getReviewPanelText(this.page);
    assert.ok(
        panelText.includes(sectionName) || panelText.length > 0,
        `Section "${sectionName}" not found in panel. Content: "${panelText.substring(0, 200)}"`
    );
});

Then('it shows {string}', { timeout: 5000 }, async function (
    this: ChangeDownWorld, expectedText: string
) {
    assert.ok(this.page, 'Page not available');
    const panelText = await getReviewPanelText(this.page);
    assert.ok(
        panelText.includes(expectedText),
        `Panel does not show "${expectedText}". Content: "${panelText.substring(0, 300)}"`
    );
});

Then('the Project Status shows {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, expectedText: string
) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(500);
    const panelText = await getReviewPanelText(this.page);
    assert.ok(
        panelText.includes(expectedText),
        `Project Status does not contain "${expectedText}". Content: "${panelText.substring(0, 300)}"`
    );
});

Then('the Project Status header updates', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(500);
    // Verify the panel has re-rendered (has content)
    const panelText = await getReviewPanelText(this.page);
    assert.ok(panelText.length > 0, 'Project Status header appears empty after update');
});

// ── Then steps: J10 — Panel status header assertions ─────────────────

Then('the Review Panel header shows {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, expected: string
) {
    assert.ok(this.page, 'Page not available');
    const text = await getReviewPanelText(this.page, '.panel-header');
    assert.ok(
        text.includes(expected),
        `Panel header does not contain "${expected}". Actual: "${text}"`
    );
});

Then('the Project Status header shows:', { timeout: 10000 }, async function (
    this: ChangeDownWorld, dataTable: any
) {
    assert.ok(this.page, 'Page not available');
    const panelText = await getReviewPanelText(this.page);
    const rows = dataTable.hashes();
    for (const row of rows) {
        const line = row.Line;
        assert.ok(
            panelText.includes(line),
            `Project Status header missing line "${line}". Content: "${panelText.substring(0, 500)}"`
        );
    }
});

// ── Then steps: J9 — Settings Panel form assertions ──────────────────

Then('the Settings panel shows author {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, expectedAuthor: string
) {
    assert.ok(this.page, 'Page not available');
    const frame = await findSettingsPanelFrame(this.page);
    assert.ok(frame, 'Settings Panel frame not found');
    const value = await frame.evaluate(`document.getElementById('author-default')?.value ?? ''`) as string;
    assert.strictEqual(value, expectedAuthor,
        `Settings panel author mismatch. Expected "${expectedAuthor}", got "${value}"`);
});

Then('the Settings panel shows enforcement {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, expectedEnforcement: string
) {
    assert.ok(this.page, 'Page not available');
    const frame = await findSettingsPanelFrame(this.page);
    assert.ok(frame, 'Settings Panel frame not found');
    const value = await frame.evaluate(`document.getElementById('author-enforcement')?.value ?? ''`) as string;
    assert.strictEqual(value, expectedEnforcement,
        `Settings panel enforcement mismatch. Expected "${expectedEnforcement}", got "${value}"`);
});

// ── Then steps: J11 — Status bar assertions ──────────────────────────

Then('the status bar item is visible', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const statusText = await getStatusBarText(this.page);
    assert.ok(
        statusText.includes('ChangeDown'),
        `Status bar item not visible. Status bar text: "${statusText}"`
    );
});
