/**
 * Step definitions for PB-25: Comment insertion with tracking mode ON.
 *
 * TIER: @slow (Playwright + VS Code Electron)
 *
 * These steps exercise the REAL addComment() code path in controller.ts
 * by invoking the "ChangeTracks: Insert Comment" command via the command palette
 * and interacting with the VS Code Quick Input widget. This is critical for
 * PB-25 because the bug was in addComment() not setting isApplyingTrackedEdit,
 * which caused onDidChangeTextDocument to wrap footnote edits in {++...++}.
 *
 * The save-criticmarkup.steps.ts steps ("I add a footnoted comment" etc.) use
 * editor.executeEdits() via Monaco API, which bypasses addComment() entirely
 * and therefore cannot test the PB-25 fix.
 *
 * ENVIRONMENT CONSTRAINT: VS Code 1.109+ disables nodeIntegration in the
 * renderer. All page.evaluate calls use Monaco API (globalThis.monaco) or
 * DOM queries — never require('vscode').
 */

import { Given, When } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { ChangeTracksWorld } from './world';
import { getOrCreateInstance } from './world';
import {
    launchWithJourneyFixture,
    executeCommand,
    executeCommandViaBridge,
} from '../../journeys/playwrightHarness';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURE_NAME = 'tracking-mode-test.md';
const PANEL_STATE_PATH = path.join(os.tmpdir(), 'changetracks-test-state.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Query the controller's tracking state via the bridge command.
 * Returns the trackingEnabled boolean, or null on failure.
 */
async function isTrackingEnabled(page: import('playwright').Page): Promise<boolean | null> {
    const beforeTs = Date.now();
    // Dismiss any open dialogs before querying
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await executeCommandViaBridge(page, 'changetracks._testQueryPanelState');
    await page.waitForTimeout(600);
    try {
        if (!fs.existsSync(PANEL_STATE_PATH)) return null;
        const raw = fs.readFileSync(PANEL_STATE_PATH, 'utf8');
        const state = JSON.parse(raw);
        if (state.timestamp < beforeTs) return null;
        return state.trackingEnabled;
    } catch {
        return null;
    }
}

/**
 * Ensure tracking mode is ON. Queries the current state and only toggles
 * if tracking is currently OFF. This is idempotent — safe to call regardless
 * of the prior state left by previous scenarios.
 *
 * After toggling, the controller writes a tracking header to the document
 * asynchronously. We poll for confirmation rather than doing a single check,
 * because the context key update and header write can lag behind the command.
 */
async function ensureTrackingEnabled(page: import('playwright').Page): Promise<void> {
    const tracking = await isTrackingEnabled(page);
    if (tracking === false || tracking === null) {
        await executeCommandViaBridge(page, 'ChangeTracks: Toggle Tracking');
        await page.waitForTimeout(500);
    }
    // Poll for tracking state confirmation with timeout.
    // The toggle command writes a tracking header asynchronously, so the
    // context key and bridge file update can lag behind.
    const deadline = Date.now() + 5000;
    let verified: boolean | null = null;
    while (Date.now() < deadline) {
        verified = await isTrackingEnabled(page);
        if (verified === true) return;
        await page.waitForTimeout(200);
    }
    assert.strictEqual(verified, true,
        `Failed to enable tracking mode after 5s of polling. Last state: ${verified}`);
}

// ---------------------------------------------------------------------------
// Given steps — self-contained scenario setup
// ---------------------------------------------------------------------------

/**
 * Composite Given: opens the fixture, resets editor content to the original
 * fixture text, and ensures tracking mode is ON. This creates a deterministic
 * starting state regardless of what previous scenarios left behind.
 *
 * The fixture "tracking-mode-test.md" contains:
 *   <!-- ctrcks.com/v1: tracked -->
 *   # Tracking Mode Test
 *
 *   This is a clean document for testing tracking mode.
 *   ...
 */
Given(
    'a fresh tracking-mode editor with the fixture content',
    { timeout: 60000 },
    async function (this: ChangeTracksWorld) {
        // 1. Get or reuse the shared VS Code instance
        this.fixtureFile = FIXTURE_NAME;
        this.instance = await getOrCreateInstance(
            FIXTURE_NAME,
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;

        // 2. Dismiss any stale overlays
        await this.page!.keyboard.press('Escape');
        await this.page!.waitForTimeout(200);
        await this.page!.keyboard.press('Escape');
        await this.page!.waitForTimeout(200);

        // 3. Reset the editor content to the original fixture text.
        //    Use _testResetDocument bridge command which sets isApplyingTrackedEdit
        //    to suppress tracking during reset (unlike model.setValue which triggers
        //    onDidChangeTextDocument with tracking active).
        // __dirname at runtime: packages/tests/vscode/out/features/steps/
        const TEST_PKG_ROOT = path.resolve(__dirname, '../../..');
        const MONOREPO_ROOT = path.resolve(TEST_PKG_ROOT, '../../..');
        let fixtureContent: string;
        try {
            const { execSync } = require('child_process');
            fixtureContent = execSync(
                `git show HEAD:"packages/tests/vscode/fixtures/journeys/${FIXTURE_NAME}"`,
                { cwd: MONOREPO_ROOT, encoding: 'utf8' }
            );
        } catch {
            // Fallback: read from disk (the @destructive hook should have restored it)
            const fixturePath = path.resolve(TEST_PKG_ROOT, 'fixtures/journeys', FIXTURE_NAME);
            fixtureContent = fs.readFileSync(fixturePath, 'utf8');
        }

        // Reset via bridge command (runs in extension host, suppresses tracking)
        const inputPath = path.join(os.tmpdir(), 'changetracks-test-reset-input.json');
        fs.writeFileSync(inputPath, JSON.stringify({ content: fixtureContent }));
        await executeCommandViaBridge(this.page!, 'ChangeTracks: Test Reset Document');
        await this.page!.waitForTimeout(500);

        // Verify reset succeeded
        const resultPath = path.join(os.tmpdir(), 'changetracks-test-reset.json');
        if (fs.existsSync(resultPath)) {
            const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
            assert.ok(result.ok, `Failed to reset document: ${result.error}`);
        }

        // 4. Focus the editor
        await this.page!.click('.monaco-editor .view-lines').catch(() => {});
        await this.page!.waitForTimeout(200);

        // 5. Ensure tracking mode is ON (idempotent)
        await ensureTrackingEnabled(this.page!);
    }
);

// ---------------------------------------------------------------------------
// When steps — addComment via real VS Code command + Quick Input
// ---------------------------------------------------------------------------

/**
 * Select text in the editor, invoke the real "ChangeTracks: Insert Comment"
 * command via the command palette, type comment text into the Quick Input
 * widget, and submit. This exercises controller.addComment() including the
 * isApplyingTrackedEdit guard that prevents PB-25.
 *
 * The flow:
 *   1. Use Monaco API to find `targetText` and set editor selection
 *   2. Dismiss any stale overlays (Escape)
 *   3. Open command palette and execute "ChangeTracks: Insert Comment"
 *   4. Wait for Quick Input widget to appear (.quick-input-widget visible)
 *   5. Type comment text into the Quick Input input field
 *   6. Press Enter to submit
 *   7. Wait for the edit to settle
 */
When(
    'I invoke Add Comment on selection {string} with text {string}',
    { timeout: 30000 },
    async function (this: ChangeTracksWorld, targetText: string, commentText: string) {
        assert.ok(this.page, 'Page not available');

        // 1. Find target text and select it via Monaco API
        const found = await this.page!.evaluate(`(() => {
            const editors = globalThis.monaco?.editor?.getEditors?.();
            if (!editors || editors.length === 0) return false;
            // Find the file:// editor (not Untitled or output panels)
            const editor = editors.find(e => {
                const uri = e.getModel()?.uri?.toString() ?? '';
                return uri.startsWith('file://');
            }) ?? editors[0];
            const model = editor.getModel();
            if (!model) return false;
            const text = model.getValue();
            const idx = text.indexOf(${JSON.stringify(targetText)});
            if (idx === -1) return false;
            const startPos = model.getPositionAt(idx);
            const endPos = model.getPositionAt(idx + ${targetText.length});
            editor.setSelection({
                startLineNumber: startPos.lineNumber,
                startColumn: startPos.column,
                endLineNumber: endPos.lineNumber,
                endColumn: endPos.column
            });
            editor.focus();
            return true;
        })()`);
        assert.ok(found, `Target text "${targetText}" not found in document — Monaco API unavailable or editor not found`);
        await this.page!.waitForTimeout(300);

        // 2. Dismiss any stale overlays
        await this.page!.keyboard.press('Escape');
        await this.page!.waitForTimeout(200);

        // 3. Execute "ChangeTracks: Insert Comment" via command palette.
        //    executeCommand opens the palette, types the command name, and presses Enter.
        //    After the command runs, addComment() calls showInputBox() which opens
        //    the Quick Input widget.
        await executeCommand(this.page!, 'ChangeTracks: Insert Comment');

        // 4. Wait for the Quick Input widget to become visible.
        //    VS Code renders showInputBox() as a .quick-input-widget element.
        //    The widget takes focus automatically.
        try {
            await this.page!.waitForSelector('.quick-input-widget:not([style*="display: none"])', {
                timeout: 5000,
                state: 'visible',
            });
        } catch {
            // Fallback: the Quick Input was already visible from executeCommand
            // or has a different structure. Try to detect it via the input element.
            const hasInput = await this.page!.$('.quick-input-widget input[type="text"]');
            assert.ok(hasInput, 'Quick Input widget did not appear after Insert Comment command');
        }
        await this.page!.waitForTimeout(300);

        // 5. Type comment text into the Quick Input.
        //    The input field inside .quick-input-widget should have focus.
        await this.page!.keyboard.type(commentText, { delay: 30 });
        await this.page!.waitForTimeout(200);

        // 6. Press Enter to submit the comment text
        await this.page!.keyboard.press('Enter');
        await this.page!.waitForTimeout(1000);

        // 7. Dismiss any remaining overlays
        await this.page!.keyboard.press('Escape');
        await this.page!.waitForTimeout(300);
    }
);

/**
 * Variant: invoke Add Comment at cursor position (no selection) with the
 * real VS Code command. Cursor must be positioned before calling this step.
 */
When(
    'I invoke Add Comment at cursor with text {string}',
    { timeout: 30000 },
    async function (this: ChangeTracksWorld, commentText: string) {
        assert.ok(this.page, 'Page not available');

        // Dismiss any stale overlays and focus editor
        await this.page!.keyboard.press('Escape');
        await this.page!.waitForTimeout(200);
        await this.page!.click('.monaco-editor .view-lines').catch(() => {});
        await this.page!.waitForTimeout(200);

        // Execute "ChangeTracks: Insert Comment" via command palette
        await executeCommand(this.page!, 'ChangeTracks: Insert Comment');

        // Wait for Quick Input widget
        try {
            await this.page!.waitForSelector('.quick-input-widget:not([style*="display: none"])', {
                timeout: 5000,
                state: 'visible',
            });
        } catch {
            const hasInput = await this.page!.$('.quick-input-widget input[type="text"]');
            assert.ok(hasInput, 'Quick Input widget did not appear after Insert Comment command');
        }
        await this.page!.waitForTimeout(300);

        // Type comment text and submit
        await this.page!.keyboard.type(commentText, { delay: 30 });
        await this.page!.waitForTimeout(200);
        await this.page!.keyboard.press('Enter');
        await this.page!.waitForTimeout(1000);

        // Dismiss any remaining overlays
        await this.page!.keyboard.press('Escape');
        await this.page!.waitForTimeout(300);
    }
);
