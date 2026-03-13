import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ChangeTracksWorld } from './world';
import { getOrCreateInstance } from './world';

// Journey helpers (compiled to out/)
import {
    launchWithJourneyFixture,
    executeCommandViaBridge,
    setCursorPosition,
    getStatusBarText,
    getCodeLensCount,
    getDecorationCounts,
    getDocumentText,
    getCommentGutterIconCount,
    getCommentResolvedCounts,
    waitForChanges,
    getCursorLineViaBridge,
} from '../../journeys/playwrightHarness';
import { instanceViewMode, getInstanceKey, VIEW_MODE_ORDER } from './decoration.steps';

// ── Given steps ──────────────────────────────────────────────────────

Given('I open {string} in VS Code', { timeout: 60000 }, async function (this: ChangeTracksWorld, fixture: string) {
    this.fixtureFile = fixture;
    this.instance = await getOrCreateInstance(fixture, (name) => launchWithJourneyFixture(name));
    this.page = this.instance.page;
});

Given('the ChangeTracks extension is active', { timeout: 15000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available — call "I open {fixture} in VS Code" first');
    // Extension is active if decorations or status bar show ChangeTracks
    const status = await getStatusBarText(this.page);
    const deco = await getDecorationCounts(this.page);
    assert.ok(
        status.includes('ChangeTracks') || status.includes('change') || deco.total > 0,
        `Extension does not appear active. Status: "${status}", decorations: ${deco.total}`
    );
});

/**
 * Idempotently ensure tracking mode is ON, regardless of current state.
 * Reads the document header (source of truth for tracking state) first.
 * If already tracked, does nothing. If not, toggles once and verifies.
 * This avoids the bug where toggling a fixture that already has tracking ON
 * (header `<!-- ctrcks.com/v1: tracked -->`) would turn it OFF.
 */
Given('tracking mode is enabled', { timeout: 15000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');

    // Read the header to check current tracking state
    const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
    const headerMatch = text.match(/<!--\s*ctrcks\.com\/v1:\s*(tracked|untracked)\s*-->/);

    if (headerMatch?.[1] === 'tracked') {
        // Already tracked — do nothing
        return;
    }

    // Not tracked (or no header yet) — toggle once
    await executeCommandViaBridge(this.page, 'ChangeTracks: Toggle Tracking');
    await this.page.waitForTimeout(500);

    // Verify tracking is now on
    const afterText = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
    const afterMatch = afterText.match(/<!--\s*ctrcks\.com\/v1:\s*(tracked|untracked)\s*-->/);
    if (afterMatch?.[1] !== 'tracked') {
        // Toggle went the wrong way — toggle again
        await executeCommandViaBridge(this.page, 'ChangeTracks: Toggle Tracking');
        await this.page.waitForTimeout(500);
    }
});

// NOTE: "a tracking-mode editor with content {string}" is defined in tracking.steps.ts
// (which stores trackingInitialContent for later assertions). Do NOT duplicate here.

// ── When steps ───────────────────────────────────────────────────────

/**
 * Section 11: Wait for LSP change data before asserting decorations.
 * Use before "Then inline decorations are visible" and similar steps in @slow tests.
 */
When('I wait for changes to load', { timeout: 15000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    const result = await waitForChanges(this.page);
    assert.ok(result.ready, `Changes did not load within timeout. Check LSP connection.`);
});

When('I execute {string}', { timeout: 10000 }, async function (this: ChangeTracksWorld, command: string) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, command);
    await this.page.waitForTimeout(500);
});

When('I accept the change at cursor', { timeout: 10000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    this.lastBulkOperation = false;
    const before = await getDecorationCounts(this.page);
    this.decorationCountBefore = before.total;
    await executeCommandViaBridge(this.page, 'ChangeTracks: Accept Change');
    await this.page.waitForTimeout(800);
});

When('I reject the change at cursor', { timeout: 10000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    this.lastBulkOperation = false;
    const before = await getDecorationCounts(this.page);
    this.decorationCountBefore = before.total;
    await executeCommandViaBridge(this.page, 'ChangeTracks: Reject Change');
    await this.page.waitForTimeout(800);
});

When('I accept all changes', { timeout: 10000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    this.lastBulkOperation = true;
    await executeCommandViaBridge(this.page, 'ChangeTracks: Accept All Changes');
    await this.page.waitForTimeout(1000);
});

When('I reject all changes', { timeout: 10000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    this.lastBulkOperation = true;
    await executeCommandViaBridge(this.page, 'ChangeTracks: Reject All Changes');
    await this.page.waitForTimeout(1000);
});

When('I navigate to the next change', { timeout: 5000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'ChangeTracks: Next Change');
    await this.page.waitForTimeout(500);
});

When('I navigate to the previous change', { timeout: 5000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'ChangeTracks: Previous Change');
    await this.page.waitForTimeout(500);
});

When('I toggle Smart View', { timeout: 15000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    await executeCommandViaBridge(this.page, 'ChangeTracks: Toggle Smart View');
    await this.page.waitForTimeout(500);

    // Update view mode tracking — Toggle Smart View cycles through all 4 modes
    const key = getInstanceKey(this);
    const current = instanceViewMode.get(key) ?? 'review';
    const currentIdx = VIEW_MODE_ORDER.indexOf(current as any);
    const next = VIEW_MODE_ORDER[(currentIdx + 1) % VIEW_MODE_ORDER.length];
    instanceViewMode.set(key, next);
    this.currentViewMode = next;
});

When('I position the cursor at line {int} column {int}', { timeout: 5000 }, async function (
    this: ChangeTracksWorld, line: number, col: number
) {
    assert.ok(this.page, 'Page not available');
    // Ensure editor has DOM focus before keyboard-based cursor positioning
    await this.page.click('.monaco-editor .view-lines');
    await this.page.waitForTimeout(200);
    await setCursorPosition(this.page, line, col);
    await this.page.waitForTimeout(300);
});

When('I type {string} into the editor', { timeout: 15000 }, async function (this: ChangeTracksWorld, text: string) {
    assert.ok(this.page, 'Page not available');
    // Focus the editor
    await this.page.click('.monaco-editor .view-lines');
    await this.page.waitForTimeout(200);
    // Type with per-character delay to trigger onDidChangeTextDocument
    await this.page.keyboard.type(text, { delay: 30 });
    await this.page.waitForTimeout(500);
});

When('I paste {string} into the editor', { timeout: 10000 }, async function (this: ChangeTracksWorld, text: string) {
    assert.ok(this.page, 'Page not available');
    // Focus editor
    await this.page.click('.monaco-editor .view-lines');
    await this.page.waitForTimeout(200);
    // Set clipboard via bridge command (navigator.clipboard throws NotAllowedError in Electron)
    const inputPath = path.join(os.tmpdir(), 'changetracks-test-paste-input.json');
    fs.writeFileSync(inputPath, JSON.stringify({ text }));
    await executeCommandViaBridge(this.page, 'ChangeTracks: Test Paste Clipboard');
    await this.page.waitForTimeout(200);
    // Paste via keyboard shortcut
    await this.page.keyboard.press('Meta+v');
    await this.page.waitForTimeout(500);
});

When('I wait for edit boundary detection', { timeout: 15000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    // Snapshot current marker count
    const beforeText = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
    const beforeCount = (beforeText.match(/\{\+\+|\{--|\{~~/g) || []).length;

    // Poll for new markers (crystallization happened) or timeout
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        await this.page.waitForTimeout(300);
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        const currentCount = (text.match(/\{\+\+|\{--|\{~~/g) || []).length;
        if (currentCount > beforeCount) return; // New marker appeared
    }
    // If no new marker appeared, that's OK — the Then step will assert the expected state.
});

/**
 * Bare "I type" — types text into the currently focused element (editor or dialog).
 * Unlike "I type {string} into the editor", this does NOT click the editor first,
 * so it works for find/replace dialogs and other focused inputs.
 */
When('I type {string}', { timeout: 15000 }, async function (this: ChangeTracksWorld, text: string) {
    assert.ok(this.page, 'Page not available');
    await this.page.keyboard.type(text, { delay: 30 });
    await this.page.waitForTimeout(300);
});

/**
 * Press a keyboard key or shortcut (e.g., "Meta+z", "ArrowLeft", "Tab", "Escape").
 * Uses Playwright's keyboard.press which supports modifier combinations.
 */
When('I press {string}', { timeout: 5000 }, async function (this: ChangeTracksWorld, key: string) {
    assert.ok(this.page, 'Page not available');
    // Ensure editor has DOM focus without moving cursor — after Go-to-Line
    // or command palette, focus can be on a non-editor element
    await this.page.evaluate(`(() => {
        const textarea = document.querySelector('.monaco-editor textarea.inputarea');
        if (textarea) textarea.focus();
    })()`);
    await this.page.waitForTimeout(100);
    await this.page.keyboard.press(key);
    await this.page.waitForTimeout(300);
});

When('I select from line {int} column {int} to line {int} column {int}', { timeout: 10000 }, async function (
    this: ChangeTracksWorld,
    startLine: number, startCol: number,
    endLine: number, endCol: number
) {
    assert.ok(this.page, 'Page not available');
    // Use keyboard-based positioning for reliable selection:
    // 1. Navigate to start position via Ctrl+G (Go to Line)
    await this.page.click('.monaco-editor .view-lines');
    await this.page.waitForTimeout(100);
    await setCursorPosition(this.page, startLine, startCol);
    await this.page.waitForTimeout(200);
    // 2. Select from start to end using Shift+Arrow keys
    const lineDelta = endLine - startLine;
    const colDelta = endCol - startCol;
    if (lineDelta === 0) {
        // Same line — use Shift+ArrowRight
        for (let i = 0; i < colDelta; i++) {
            await this.page.keyboard.press('Shift+ArrowRight');
        }
    } else {
        // Multi-line selection via Shift+Down then adjust column
        for (let i = 0; i < lineDelta; i++) {
            await this.page.keyboard.press('Shift+ArrowDown');
        }
        // Adjust column position (Shift+Home then Shift+Right to endCol)
        await this.page.keyboard.press('Shift+Home');
        for (let i = 0; i < endCol; i++) {
            await this.page.keyboard.press('Shift+ArrowRight');
        }
    }
    await this.page.waitForTimeout(200);
});

/**
 * Wait for a specific number of milliseconds. Used by timing-sensitive
 * tracking mode scenarios to test edit boundary detection thresholds.
 */
When('I wait {int} milliseconds', { timeout: 35000 }, async function (this: ChangeTracksWorld, ms: number) {
    assert.ok(this.page, 'Page not available');
    await this.page.waitForTimeout(ms);
});

/**
 * Switch to a different fixture file within the SAME VS Code instance.
 * Uses Quick Open (Meta+P) to switch tabs without launching a new window.
 * The fixture must already be in the workspace (i.e., in the fixtures/journeys/ folder
 * that was opened with the initial VS Code launch).
 */
When('I switch to fixture {string}', { timeout: 15000 }, async function (this: ChangeTracksWorld, fixture: string) {
    assert.ok(this.page, 'Page not available');
    // Open Quick Open (Cmd+P / Ctrl+P)
    await this.page.keyboard.press(process.platform === 'darwin' ? 'Meta+p' : 'Control+p');
    await this.page.waitForTimeout(500);
    // Type the fixture filename
    await this.page.keyboard.type(fixture, { delay: 30 });
    await this.page.waitForTimeout(500);
    // Select the first match
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(1000);
});

// ── Then steps ───────────────────────────────────────────────────────

When('I record the cursor line', { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        const cursorLine = await getCursorLineViaBridge(this.page);
        assert.ok(cursorLine > 0, 'Could not query cursor position');
        this.lastCursorLine = cursorLine;
    }
);

Then('the cursor moved to a different line', { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        const cursorLine = await getCursorLineViaBridge(this.page);
        assert.ok(cursorLine > 0, 'Could not query cursor position');
        assert.ok(this.lastCursorLine !== undefined,
            'Cannot assert cursor moved — "I record the cursor line" was never called');
        assert.notStrictEqual(cursorLine, this.lastCursorLine,
            `Cursor should have moved but stayed at line ${cursorLine}`);
        this.lastCursorLine = cursorLine;
    }
);

Then('a diff editor is open', { timeout: 15000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        const hasDiffEditor = await this.page.evaluate(`(() => {
            const diffElements = document.querySelectorAll('.monaco-diff-editor');
            return diffElements.length > 0;
        })()`);
        assert.ok(hasDiffEditor, 'Expected a diff editor to be open after Show Diff command');
    }
);

Then('the status bar shows {string}', { timeout: 5000 }, async function (this: ChangeTracksWorld, text: string) {
    assert.ok(this.page, 'Page not available');
    const status = await getStatusBarText(this.page);
    assert.ok(status.includes(text), `Status bar does not contain "${text}". Actual: "${status}"`);
});

Then('inline decorations are visible', { timeout: 10000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    const deco = await getDecorationCounts(this.page);
    assert.ok(deco.total > 0, `No inline decorations found (total: ${deco.total})`);
});

Then('CodeLens elements are present', { timeout: 5000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    const count = await getCodeLensCount(this.page);
    assert.ok(count > 0, `No CodeLens elements found (count: ${count})`);
});

Then('the editor text contains {string}', { timeout: 10000 }, async function (this: ChangeTracksWorld, text: string) {
    assert.ok(this.page, 'Page not available');
    const opts = { expectedFilename: this.fixtureFile, instanceId: this.instance?.instanceId };
    const doc = await getDocumentText(this.page, opts);
    assert.ok(doc.length > 0, 'getDocumentText returned empty — Monaco API unavailable');
    assert.ok(doc.includes(text), `Editor text does not contain "${text}"`);
});

Then('the editor text does not contain {string}', { timeout: 10000 }, async function (this: ChangeTracksWorld, text: string) {
    assert.ok(this.page, 'Page not available');
    const opts = { expectedFilename: this.fixtureFile, instanceId: this.instance?.instanceId };
    const doc = await getDocumentText(this.page, opts);
    assert.ok(doc.length > 0, 'getDocumentText returned empty — Monaco API unavailable');
    assert.ok(!doc.includes(text), `Editor text should not contain "${text}"`);
});

Then('the document contains {string}', { timeout: 15000 }, async function (this: ChangeTracksWorld, text: string) {
    assert.ok(this.page, 'Page not available');
    const opts = { expectedFilename: this.fixtureFile, instanceId: this.instance?.instanceId };

    // CriticMarkup delimiters are produced asynchronously by the edit boundary
    // detector (pause threshold + async onDidChangeTextDocument). Poll for up
    // to 5 seconds when the expected text looks like CriticMarkup.
    const isCriticMarkup = /\{\+\+|\{--|~>|\{~~|\{==|\{>>/.test(text);
    if (isCriticMarkup) {
        const deadline = Date.now() + 5000;
        let doc = '';
        while (Date.now() < deadline) {
            doc = await getDocumentText(this.page, opts);
            if (doc.includes(text)) return;
            await this.page.waitForTimeout(200);
        }
        assert.ok(doc.length > 0, 'getDocumentText returned empty — Monaco API unavailable. Cannot verify document content.');
        console.log(`[DIAG] getDocumentText returned (${doc.length} chars): ${JSON.stringify(doc.slice(0, 300))}`);
        assert.ok(doc.includes(text), `Document does not contain "${text}" after 5s of polling`);
    } else {
        const doc = await getDocumentText(this.page, opts);
        assert.ok(doc.length > 0, 'getDocumentText returned empty — Monaco API unavailable. Cannot verify document content.');
        if (!doc.includes(text)) {
            console.log(`[DIAG] getDocumentText returned (${doc.length} chars): ${JSON.stringify(doc.slice(0, 300))}`);
        }
        assert.ok(doc.includes(text), `Document does not contain "${text}"`);
    }
});

Then('the document does not contain {string}', { timeout: 10000 }, async function (this: ChangeTracksWorld, text: string) {
    assert.ok(this.page, 'Page not available');
    const opts = { expectedFilename: this.fixtureFile, instanceId: this.instance?.instanceId };
    const doc = await getDocumentText(this.page, opts);
    assert.ok(doc.length > 0, 'getDocumentText returned empty — Monaco API unavailable. Cannot verify document content.');
    assert.ok(!doc.includes(text), `Document unexpectedly contains "${text}"`);
});

Then('{int} comment gutter icons are visible', { timeout: 5000 }, async function (this: ChangeTracksWorld, count: number) {
    assert.ok(this.page, 'Page not available');
    const actual = await getCommentGutterIconCount(this.page);
    assert.strictEqual(actual, count, `Expected ${count} comment gutter icons, got ${actual}`);
});

Then('no decorations are visible', { timeout: 5000 }, async function (this: ChangeTracksWorld) {
    assert.ok(this.page, 'Page not available');
    const deco = await getDecorationCounts(this.page);
    assert.strictEqual(deco.total, 0, `Expected 0 decorations but found ${deco.total}`);
});

/**
 * Cross-surface consistency check.
 * After an accept/reject operation, verify that editor, panel, and comments
 * all reflect the same state.
 */
Then('all surfaces reflect the change was {word}', { timeout: 15000 }, async function (
    this: ChangeTracksWorld, operation: string
) {
    assert.ok(this.page, 'Page not available');

    // 1. Editor: decorations should reflect the operation
    const deco = await getDecorationCounts(this.page);

    // 2. CodeLens: should reflect current state
    let codeLensCount = await getCodeLensCount(this.page);

    // 3. Comments: check resolved state
    const commentCounts = await getCommentResolvedCounts(this.page);

    // Assert based on operation type
    if (this.lastBulkOperation) {
        // After accept-all or reject-all, no decorations should remain.
        // VS Code refreshes CodeLens and decorations asynchronously, so poll
        // with a 5-second deadline instead of reading a single snapshot.
        let pollDeco = deco;
        const decoDeadline = Date.now() + 5000;
        while (pollDeco.total > 0 && Date.now() < decoDeadline) {
            await this.page!.waitForTimeout(200);
            pollDeco = await getDecorationCounts(this.page!);
        }

        let pollCodeLens = codeLensCount;
        const clDeadline = Date.now() + 5000;
        while (pollCodeLens > 0 && Date.now() < clDeadline) {
            await this.page!.waitForTimeout(200);
            pollCodeLens = await getCodeLensCount(this.page!);
        }

        let pollComments = commentCounts;
        const cmDeadline = Date.now() + 5000;
        while (pollComments.unresolved > 0 && Date.now() < cmDeadline) {
            await this.page!.waitForTimeout(200);
            pollComments = await getCommentResolvedCounts(this.page!);
        }

        assert.strictEqual(pollDeco.total, 0,
            `Expected 0 decorations after ${operation}-all, got ${pollDeco.total}`);
        assert.strictEqual(pollCodeLens, 0,
            `Expected 0 CodeLens after ${operation}-all, got ${pollCodeLens}`);
        // After bulk operation, all comments should be resolved (no unresolved changes remain)
        assert.strictEqual(pollComments.unresolved, 0,
            `Expected 0 unresolved comments after ${operation}-all, got ${pollComments.unresolved}`);

        // Update outer vars for the log line below
        deco.total = pollDeco.total;
        deco.withStrikethrough = pollDeco.withStrikethrough;
        codeLensCount = pollCodeLens;
        commentCounts.resolved = pollComments.resolved;
        commentCounts.unresolved = pollComments.unresolved;
    } else if (operation === 'accepted' || operation === 'rejected') {
        // After single accept/reject, decoration count should have decreased
        if (this.decorationCountBefore !== undefined) {
            assert.ok(deco.total < this.decorationCountBefore,
                `Decoration count should decrease after single ${operation}. Before: ${this.decorationCountBefore}, after: ${deco.total}`);
        }
    }

    // Log for debugging (keep existing behavior)
    console.log(`  Surface check (${operation}): Editor: ${deco.total} deco | CodeLens: ${codeLensCount} | Comments: ${commentCounts.resolved} resolved, ${commentCounts.unresolved} unresolved`);
});

Then('hovering shows text containing {string}', { timeout: 15000 },
    async function (this: ChangeTracksWorld, expected: string) {
        assert.ok(this.page, 'Page not available');

        // Trigger hover at cursor position via Extension Host bridge.
        // Mouse-based hover is unreliable in Playwright — all HVR2 scenarios
        // returned empty hover content with the old mouse.move approach.
        await executeCommandViaBridge(this.page, 'editor.action.showHover');
        await this.page.waitForTimeout(800);

        let hoverContent = await this.page.evaluate(`(() => {
            const hover = document.querySelector('.monaco-hover-content');
            return hover?.textContent || '';
        })()`) as string;

        if (!hoverContent.includes(expected)) {
            // Retry once — hover rendering can be async
            await this.page.waitForTimeout(500);
            hoverContent = await this.page.evaluate(`(() => {
                const hover = document.querySelector('.monaco-hover-content');
                return hover?.textContent || '';
            })()`) as string;
        }

        assert.ok(hoverContent.includes(expected),
            `Expected hover to contain "${expected}", got: "${hoverContent}"`);
    }
);
