/**
 * Step definitions for KB1 keyboard fidelity testing.
 *
 * TIER: @slow (Playwright + VS Code Electron)
 *
 * These steps exercise REAL keyboard input via Playwright's keyboard API,
 * going through the full VS Code pipeline: keydown → Monaco →
 * onDidChangeTextDocument → selection confirmation gate → tracking mode.
 *
 * Only defines steps that DON'T exist in interaction.steps.ts or tracking.steps.ts.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ChangeDownWorld } from './world';
import { getDocumentText, executeCommandViaBridge, updateSettingDirect } from '../../journeys/playwrightHarness';

// Helper: build getDocumentText options with instanceId for parallel-safe reads
function docOpts(world: ChangeDownWorld): { instanceId?: string } {
    return { instanceId: world.instance?.instanceId };
}

// Fixture baseline cache — keyed by fixture filename
const fixtureBaselineCache = new Map<string, string>();

function getFixtureBaseline(fixtureName?: string): string {
    const name = fixtureName ?? 'kb-spike.md';
    let baseline = fixtureBaselineCache.get(name);
    if (!baseline) {
        const fixturePath = path.resolve(
            __dirname, '..', '..', '..', 'fixtures', 'journeys', name
        );
        baseline = fs.readFileSync(fixturePath, 'utf-8');
        fixtureBaselineCache.set(name, baseline);
    }
    return baseline;
}

// Count CriticMarkup markers in the baseline fixture (for "new" marker assertions)
function countMarkersInBaseline(type: 'insertion' | 'deletion', fixtureName?: string): number {
    const baseline = getFixtureBaseline(fixtureName);
    const pattern = type === 'insertion' ? /\{\+\+/g : /\{--/g;
    return (baseline.match(pattern) || []).length;
}

// ── Given steps ────────────────────────────────────────────

/**
 * Reset editor content to fixture baseline. Essential for scenario isolation
 * when sharing a VS Code instance across @destructive scenarios.
 */
Given('the editor is reset to the fixture', { timeout: 15000 }, async function (
    this: ChangeDownWorld
) {
    assert.ok(this.page, 'Page not available');
    const baseline = getFixtureBaseline(this.fixtureFile);

    // Reset content via bridge command (runs in extension host, avoids Monaco API)
    const inputPath = path.join(os.tmpdir(), 'changedown-test-reset-input.json');
    fs.writeFileSync(inputPath, JSON.stringify({ content: baseline }));
    await executeCommandViaBridge(this.page, 'ChangeDown: Test Reset Document');
    await this.page.waitForTimeout(500);

    // Verify reset succeeded
    const resultPath = path.join(os.tmpdir(), 'changedown-test-reset.json');
    if (fs.existsSync(resultPath)) {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        assert.ok(result.ok, `Failed to reset document: ${result.error}`);
    }

    // Reset settings to defaults AFTER document reset (avoids interfering with command palette)
    await updateSettingDirect(this.page, 'changedown.editBoundary.pauseThresholdMs', 2000);
    await updateSettingDirect(this.page, 'changedown.editBoundary.breakOnNewline', true);
});

/**
 * Ensure tracking mode is ON, regardless of current state.
 * Reads the document header first — if already tracked, returns immediately
 * (avoids unnecessary toggles and bridge timeouts). Only toggles when needed.
 */
Given('tracking mode is definitely enabled', { timeout: 15000 }, async function (
    this: ChangeDownWorld
) {
    assert.ok(this.page, 'Page not available');

    // Check BOTH the document header AND the controller state via bridge.
    // After @destructive scenarios, the controller's _trackingMode can be
    // out of sync with the document header (tracking mode contamination).
    const text = await getDocumentText(this.page, docOpts(this));
    const headerMatch = text.match(/<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/);
    const headerSaysTracked = headerMatch?.[1] === 'tracked';

    // Query actual controller state via bridge command
    const statePath = path.join(os.tmpdir(), 'changedown-test-state.json');
    try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    await executeCommandViaBridge(this.page, 'ChangeDown: Test Query Panel State');
    await this.page.waitForTimeout(300);

    let controllerSaysTracked = false;
    try {
        if (fs.existsSync(statePath)) {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            controllerSaysTracked = !!state.trackingEnabled;
        }
    } catch { /* ignore read errors */ }

    if (headerSaysTracked && controllerSaysTracked) {
        // Both agree tracking is on — nothing to do
        return;
    }

    // Mismatch or tracking is off — toggle until both agree
    await executeCommandViaBridge(this.page, 'ChangeDown: Toggle Tracking');
    await this.page.waitForTimeout(500);

    // Verify tracking is now on
    const afterText = await getDocumentText(this.page, docOpts(this));
    const afterMatch = afterText.match(/<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/);
    if (afterMatch?.[1] !== 'tracked') {
        // Toggle went the wrong way — toggle again
        await executeCommandViaBridge(this.page, 'ChangeDown: Toggle Tracking');
        await this.page.waitForTimeout(500);
    }
});

/**
 * Set a changedown setting via the _testUpdateSetting bridge command.
 * Writes input to a temp file, invokes the command via command palette,
 * then reads the result file to confirm success.
 */
Given('the setting {string} is {word}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, settingKey: string, value: string
) {
    assert.ok(this.page, 'Page not available');

    const parsedValue = value === 'true' ? true : value === 'false' ? false : parseInt(value, 10);

    // Modify settings.json directly — bypasses command palette fuzzy-match issues
    await updateSettingDirect(this.page, `changedown.${settingKey}`, parsedValue);
});

// ── When steps — keyboard input ────────────────────────────

/**
 * Type text character by character using real Playwright keyboard events.
 * This is the core of KB1: each character fires a separate keydown → Monaco →
 * onDidChangeTextDocument event through the full VS Code pipeline.
 */
When('I type {string} character by character', { timeout: 30000 }, async function (
    this: ChangeDownWorld, text: string
) {
    assert.ok(this.page, 'Page not available');
    // Dismiss any stale notifications/dialogs that may have stolen focus
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(200);
    // Ensure editor has DOM focus WITHOUT moving cursor (clicking .view-lines
    // repositions the cursor to the click point, breaking cursor positioning)
    await this.page.evaluate(`(() => {
        const textarea = document.querySelector('.monaco-editor textarea.inputarea');
        if (textarea) textarea.focus();
    })()`);
    await this.page.waitForTimeout(100);
    // Type with per-character delay
    await this.page.keyboard.type(text, { delay: 30 });
    await this.page.waitForTimeout(100);
});

/**
 * Press a key N times with specified gaps between presses.
 * Used for testing backspace/delete coalescing behavior.
 */
When('I press {string} {int} times with {int}ms gaps', { timeout: 30000 }, async function (
    this: ChangeDownWorld, key: string, count: number, gapMs: number
) {
    assert.ok(this.page, 'Page not available');
    for (let i = 0; i < count; i++) {
        await this.page.keyboard.press(key);
        if (i < count - 1) {
            await this.page.waitForTimeout(gapMs);
        }
    }
    await this.page.waitForTimeout(100);
});

/**
 * Press a key N times with minimal gaps.
 */
When('I press {string} {int} times', { timeout: 30000 }, async function (
    this: ChangeDownWorld, key: string, count: number
) {
    assert.ok(this.page, 'Page not available');
    for (let i = 0; i < count; i++) {
        await this.page.keyboard.press(key);
        await this.page.waitForTimeout(30);
    }
    await this.page.waitForTimeout(100);
});

/**
 * Wait for the configured pause threshold to fire and crystallize pending text.
 * Reads the configured threshold from world state (set by "the pause threshold is"
 * step) or defaults to 2000ms (the test launch default).
 */
When('I wait for the pause threshold', { timeout: 35000 }, async function (
    this: ChangeDownWorld
) {
    assert.ok(this.page, 'Page not available');
    const threshold = (this as any).trackingPauseThreshold ?? 2000;
    // Wait threshold + 500ms buffer for async crystallization
    await this.page.waitForTimeout(threshold + 500);
});

/**
 * Wait for immediate crystallization (deletions/substitutions).
 * Polls document for CriticMarkup appearance, max 5 seconds.
 */
When('I wait for crystallization', { timeout: 10000 }, async function (
    this: ChangeDownWorld
) {
    assert.ok(this.page, 'Page not available');
    const baseline = getFixtureBaseline(this.fixtureFile);
    const baselineMarkerCount = (baseline.match(/\{\+\+|\{--|\{~~/g) || []).length;

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const text = await getDocumentText(this.page, docOpts(this));
        const currentMarkerCount = (text.match(/\{\+\+|\{--|\{~~/g) || []).length;
        if (currentMarkerCount > baselineMarkerCount) return;
        await this.page.waitForTimeout(200);
    }
    // If crystallization didn't happen within 5s, let the Then step fail with diagnostics
});

/**
 * Position cursor at a specific line and column via Monaco API (1-based).
 * Unlike the interaction.steps "I position the cursor at line N column M" which uses
 * Go-to-Line keyboard shortcut (fragile in headless Playwright), this uses the
 * Monaco editor.setPosition API directly.
 */
When('I set the cursor to line {int} column {int}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, line: number, col: number
) {
    assert.ok(this.page, 'Page not available');
    // Click editor to ensure Playwright DOM focus
    await this.page.click('.monaco-editor .view-lines');
    await this.page.waitForTimeout(300);
    // Use Ctrl+G (Go to Line) to navigate — Playwright sends real keyboard events
    await this.page.keyboard.press('Control+g');
    await this.page.waitForTimeout(300);
    await this.page.keyboard.type(`${line}`, { delay: 50 });
    await this.page.waitForTimeout(200);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(300);
    // Press Home to go to column 1, then ArrowRight to reach target column
    await this.page.keyboard.press('Home');
    for (let i = 1; i < col; i++) {
        await this.page.keyboard.press('ArrowRight');
    }
    await this.page.waitForTimeout(200);
});

/**
 * Position cursor at the end of a specific line.
 */
When('I position the cursor at the end of line {int}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, line: number
) {
    assert.ok(this.page, 'Page not available');
    // Dismiss any lingering dialogs/overlays before positioning
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(200);
    // Use keyboard navigation (Ctrl+G → Go to Line) — avoids Monaco API
    // Force click to bypass actionability check (overlays from previous scenarios)
    await this.page.click('.monaco-editor .view-lines', { force: true });
    await this.page.waitForTimeout(200);
    await this.page.keyboard.press('Control+g');
    await this.page.waitForTimeout(300);
    await this.page.keyboard.type(`${line}`, { delay: 50 });
    await this.page.waitForTimeout(200);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(300);
    // End key to go to end of the line
    await this.page.keyboard.press('End');
    await this.page.waitForTimeout(200);
});

/**
 * Position cursor right before a specific string in the document.
 * Uses Extension Host bridge command for reliable positioning.
 */
When('I position the cursor right before {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, target: string
) {
    assert.ok(this.page, 'Page not available');
    const inputPath = path.join(os.tmpdir(), 'changedown-test-position-cursor-input.json');
    const statePath = path.join(os.tmpdir(), 'changedown-test-position-cursor.json');
    try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    fs.writeFileSync(inputPath, JSON.stringify({ target, position: 'before' }));
    await executeCommandViaBridge(this.page, 'ChangeDown: Test Position Cursor');
    // Poll for result
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        try {
            if (fs.existsSync(statePath)) {
                const result = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                assert.ok(result.ok, `Failed to position cursor before "${target}": ${result.error}`);
                break;
            }
        } catch { /* not ready */ }
        await this.page.waitForTimeout(100);
    }
    // Focus textarea for subsequent keyboard events
    await this.page.evaluate(`(() => {
        const textarea = document.querySelector('.monaco-editor textarea.inputarea');
        if (textarea) textarea.focus();
    })()`);
    await this.page.waitForTimeout(200);
});

/**
 * Position cursor right after a specific string in the document.
 * Uses Extension Host bridge command for reliable positioning.
 */
When('I position the cursor right after {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, target: string
) {
    assert.ok(this.page, 'Page not available');
    const inputPath = path.join(os.tmpdir(), 'changedown-test-position-cursor-input.json');
    const statePath = path.join(os.tmpdir(), 'changedown-test-position-cursor.json');
    try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    fs.writeFileSync(inputPath, JSON.stringify({ target, position: 'after' }));
    await executeCommandViaBridge(this.page, 'ChangeDown: Test Position Cursor');
    // Poll for result
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        try {
            if (fs.existsSync(statePath)) {
                const result = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                assert.ok(result.ok, `Failed to position cursor after "${target}": ${result.error}`);
                console.log(`  [DIAG] positioned right after ${JSON.stringify(target)}: line=${result.line} col=${result.col}`);
                break;
            }
        } catch { /* not ready */ }
        await this.page.waitForTimeout(100);
    }
    // Focus textarea for subsequent keyboard events
    await this.page.evaluate(`(() => {
        const textarea = document.querySelector('.monaco-editor textarea.inputarea');
        if (textarea) textarea.focus();
    })()`);
    await this.page.waitForTimeout(200);
});

/**
 * Select text by string search (no line number required).
 * Uses Extension Host bridge command for reliable selection.
 */
When('I select the text {string}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, target: string
) {
    assert.ok(this.page, 'Page not available');
    const inputPath = path.join(os.tmpdir(), 'changedown-test-select-text-input.json');
    const statePath = path.join(os.tmpdir(), 'changedown-test-select-text.json');
    try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    fs.writeFileSync(inputPath, JSON.stringify({ target }));
    await executeCommandViaBridge(this.page, 'ChangeDown: Test Select Text');
    // Poll for result
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        try {
            if (fs.existsSync(statePath)) {
                const result = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                assert.ok(result.ok, `Failed to select text "${target}": ${result.error}`);
                break;
            }
        } catch { /* not ready */ }
        await this.page.waitForTimeout(100);
    }
    // Focus textarea for subsequent keyboard events (e.g., Backspace to delete)
    await this.page.evaluate(`(() => {
        const textarea = document.querySelector('.monaco-editor textarea.inputarea');
        if (textarea) textarea.focus();
    })()`);
    await this.page.waitForTimeout(200);
});

/**
 * Select a specific word/phrase on a given line using keyboard navigation.
 * Reads document text via bridge to compute column, then uses Ctrl+G + Home +
 * ArrowRight + Shift+ArrowRight for reliable selection without Monaco API.
 */
When('I select {string} on line {int}', { timeout: 15000 }, async function (
    this: ChangeDownWorld, target: string, line: number
) {
    assert.ok(this.page, 'Page not available');
    // 1. Read document to find target column on the given line
    const text = await getDocumentText(this.page, docOpts(this));
    const lines = text.split('\n');
    assert.ok(line >= 1 && line <= lines.length, `Line ${line} out of range (1-${lines.length})`);
    const lineContent = lines[line - 1]; // 1-based → 0-indexed
    const colIdx = lineContent.indexOf(target);
    assert.ok(colIdx >= 0, `"${target}" not found on line ${line}: "${lineContent}"`);

    // 2. Click editor to ensure Playwright DOM focus
    await this.page.click('.monaco-editor .view-lines');
    await this.page.waitForTimeout(200);

    // 3. Navigate to the target line (Ctrl+G = Go to Line on macOS)
    await this.page.keyboard.press('Control+g');
    await this.page.waitForTimeout(300);
    await this.page.keyboard.type(`${line}`, { delay: 50 });
    await this.page.waitForTimeout(200);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(300);

    // 4. Home to go to column 1, then ArrowRight to reach the target column
    await this.page.keyboard.press('Home');
    for (let i = 0; i < colIdx; i++) {
        await this.page.keyboard.press('ArrowRight');
    }
    await this.page.waitForTimeout(100);

    // 5. Shift+ArrowRight to select the target text
    for (let i = 0; i < target.length; i++) {
        await this.page.keyboard.press('Shift+ArrowRight');
    }
    await this.page.waitForTimeout(200);
});

/**
 * Click at a specific line/column position in the editor.
 * Uses _testPositionCursor bridge command to position the cursor (which also
 * reveals the line), then clicks the editor to simulate a real mouse event.
 * This avoids globalThis.monaco which is unavailable in some Playwright contexts.
 */
When('I click at line {int} column {int}', { timeout: 10000 }, async function (
    this: ChangeDownWorld, line: number, col: number
) {
    assert.ok(this.page, 'Page not available');

    // Position cursor via bridge command (0-based line/character)
    const inputPath = path.join(os.tmpdir(), 'changedown-test-position-cursor-input.json');
    const resultPath = path.join(os.tmpdir(), 'changedown-test-position-cursor.json');
    try { fs.unlinkSync(resultPath); } catch { /* ignore */ }
    fs.writeFileSync(inputPath, JSON.stringify({ line: line - 1, character: col - 1 }));
    await executeCommandViaBridge(this.page, 'ChangeDown: Test Position Cursor');

    // Poll for result
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        try {
            if (fs.existsSync(resultPath)) {
                const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
                assert.ok(result.ok, `Failed to position cursor at line ${line} col ${col}: ${result.error}`);
                break;
            }
        } catch { /* not ready */ }
        await this.page.waitForTimeout(100);
    }

    // Click the editor to trigger mouse-event side effects (e.g., flush pending edits)
    await this.page.click('.monaco-editor .view-lines', { force: true });
    await this.page.waitForTimeout(200);
});

// ── Then steps — assertions ────────────────────────────────

/**
 * Assert the document contains exactly N NEW insertions (above baseline).
 * Subtracts the fixture's baseline insertion count.
 * Uses regex pattern because the feature file contains literal "(s)" which
 * Cucumber expressions would interpret as an optional group.
 */
Then(/^the document contains exactly (\d+) new insertion\(s\)$/, { timeout: 15000 }, async function (
    this: ChangeDownWorld, countStr: string
) {
    const count = parseInt(countStr, 10);
    assert.ok(this.page, 'Page not available');
    const baselineCount = countMarkersInBaseline('insertion', this.fixtureFile);

    // Poll for up to 5s for async crystallization
    const deadline = Date.now() + 5000;
    let actualNew = 0;
    while (Date.now() < deadline) {
        const text = await getDocumentText(this.page, docOpts(this));
        const totalCount = (text.match(/\{\+\+/g) || []).length;
        actualNew = totalCount - baselineCount;
        if (actualNew >= count) break;
        await this.page.waitForTimeout(200);
    }

    assert.strictEqual(
        actualNew, count,
        `Expected ${count} new insertion(s), found ${actualNew} (baseline: ${baselineCount})`
    );
});

/**
 * Assert the document contains exactly N NEW deletions (above baseline).
 * Uses regex pattern because the feature file contains literal "(s)".
 */
Then(/^the document contains exactly (\d+) new deletion\(s\)$/, { timeout: 15000 }, async function (
    this: ChangeDownWorld, countStr: string
) {
    const count = parseInt(countStr, 10);
    assert.ok(this.page, 'Page not available');
    const baselineCount = countMarkersInBaseline('deletion', this.fixtureFile);

    const deadline = Date.now() + 5000;
    let actualNew = 0;
    while (Date.now() < deadline) {
        const text = await getDocumentText(this.page, docOpts(this));
        const totalCount = (text.match(/\{--/g) || []).length;
        actualNew = totalCount - baselineCount;
        if (actualNew >= count) break;
        await this.page.waitForTimeout(200);
    }

    assert.strictEqual(
        actualNew, count,
        `Expected ${count} new deletion(s), found ${actualNew} (baseline: ${baselineCount})`
    );
});

/**
 * Select text and type replacement using Find dialog + keyboard typing.
 * Phase 1: Ctrl+F opens Find, type target to select it, Escape closes Find
 *          (leaves editor selection on the matched text — native VS Code behavior)
 * Phase 2: Type replacement via keyboard (first keystroke replaces selection)
 *
 * This is the most reliable approach because it uses VS Code's own Find
 * functionality to create the selection, ensuring Monaco's textarea handler
 * sees the selection for the subsequent keyboard replacement.
 */
When('I select the text {string} and type {string}', { timeout: 20000 }, async function (
    this: ChangeDownWorld, target: string, replacement: string
) {
    assert.ok(this.page, 'Page not available');

    // Phase 1: Use Find dialog to select the target text
    // Open Find widget
    await this.page.keyboard.press('Meta+f');
    await this.page.waitForTimeout(300);

    // Clear any previous search text and type the target
    await this.page.keyboard.press('Meta+a');
    await this.page.keyboard.type(target, { delay: 10 });
    await this.page.waitForTimeout(300);

    // Press Enter to find and highlight the first match
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(200);

    // Close Find widget — selection remains on the matched text
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);

    // Phase 2: Type replacement via keyboard
    // The editor now has the found text selected. Typing replaces the selection.
    await this.page.keyboard.type(replacement, { delay: 30 });
    await this.page.waitForTimeout(300);
});

/**
 * Assert a string is still present unchanged in the document.
 */
Then('{string} remains unchanged', { timeout: 5000 }, async function (
    this: ChangeDownWorld, expected: string
) {
    assert.ok(this.page, 'Page not available');
    const text = await getDocumentText(this.page, docOpts(this));
    assert.ok(
        text.includes(expected),
        `Expected "${expected}" to remain unchanged in document but it was not found`
    );
});

/**
 * Assert the document contains a tracked newline insertion.
 * Matches {++...++} containing a newline character.
 */
Then('the document text contains a tracked newline insertion', { timeout: 15000 }, async function (
    this: ChangeDownWorld
) {
    assert.ok(this.page, 'Page not available');
    const deadline = Date.now() + 5000;
    let text = '';
    while (Date.now() < deadline) {
        text = await getDocumentText(this.page, docOpts(this));
        // Check for insertion markup that spans a newline
        if (/\{\+\+[^+]*\n[^+]*\+\+\}/.test(text)) return;
        await this.page.waitForTimeout(200);
    }
    assert.ok(false,
        `Expected a tracked newline insertion ({++...\\n...++}) but none found in: ${text.substring(0, 300)}`
    );
});

/**
 * Assert a single insertion block contains both substrings.
 * Used for breakOnNewline=false where "before\nafter" stays in one block.
 */
Then('the document text matches insertion containing {string} and {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, str1: string, str2: string) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 5000;
        let text = '';
        while (Date.now() < deadline) {
            text = await getDocumentText(this.page, docOpts(this));
            // Extract all insertion blocks
            const blocks = text.match(/\{\+\+[\s\S]*?\+\+\}/g) || [];
            for (const block of blocks) {
                if (block.includes(str1) && block.includes(str2)) return;
            }
            await this.page.waitForTimeout(200);
        }
        const blocks = text.match(/\{\+\+[\s\S]*?\+\+\}/g) || [];
        console.log(`[DIAG breakOnNewline=false] Found ${blocks.length} insertion blocks:`);
        blocks.forEach((b, i) => console.log(`  block[${i}]: ${JSON.stringify(b.substring(0, 100))}`));
        console.log(`[DIAG] Full text (first 500 chars): ${JSON.stringify(text.substring(0, 500))}`);
        assert.ok(false,
            `Expected a single insertion block containing both "${str1}" and "${str2}" but none found`
        );
    }
);

/**
 * Assert ordering of two strings in the document.
 */
Then('{string} appears before {string}', { timeout: 5000 }, async function (
    this: ChangeDownWorld, first: string, second: string
) {
    assert.ok(this.page, 'Page not available');
    const text = await getDocumentText(this.page, docOpts(this));
    const firstIdx = text.indexOf(first);
    const secondIdx = text.indexOf(second);
    assert.ok(firstIdx >= 0, `"${first}" not found in document`);
    assert.ok(secondIdx >= 0, `"${second}" not found in document`);
    assert.ok(firstIdx < secondIdx,
        `Expected "${first}" before "${second}" but positions are ${firstIdx} and ${secondIdx}`
    );
});

// NOTE: "the document text contains {string}" and "the document text does not contain {string}"
// are defined in operation.steps.ts. For KB1 scenarios, use "the document contains {string}"
// from interaction.steps.ts which provides Playwright-based polling with CriticMarkup awareness.
