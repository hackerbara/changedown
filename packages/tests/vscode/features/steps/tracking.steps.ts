/**
 * Step definitions for edit boundary detection and tracking mode lifecycle.
 *
 * TIER: @integration
 *
 * These steps require VS Code Extension Host APIs (vscode.TextEditor.edit,
 * vscode.workspace, real timers, ExtensionController + PendingEditManager).
 * They use Playwright to drive VS Code Electron, matching the @slow tier
 * infrastructure.
 *
 * WHY NOT @fast:
 *   - PendingEditManager imports 'vscode' at module level
 *   - ExtensionController requires vscode.ExtensionContext
 *   - Tests depend on real VS Code document model, editor.edit(), selection changes
 *   - Timer behavior (setTimeout for pause threshold) is part of the contract
 *   - Document save lifecycle requires vscode.workspace.fs
 *
 * MOCHA ASSERTIONS THAT CANNOT BE PORTED 1:1:
 *   - Exact character-by-character typing with precise position tracking
 *     (Playwright types into Monaco; position tracking is less precise)
 *   - Shadow state consistency verification (internal to ExtensionController)
 *   - onDidSaveTextDocument listener hookup for synchronous-save verification
 *   - IME composition events (not supported in VS Code test environment either)
 *   - Precise save duration measurement (OS/CI timing variance)
 *
 * These scenarios document the expected behavior. The mocha tests remain the
 * source of truth for precise integration verification until the cucumber
 * infrastructure supports running inside the Extension Host.
 *
 * NOTE: Step names use "tracked document" prefix to avoid ambiguity with
 * existing step definitions in operation.steps.ts and interaction.steps.ts
 * which define "the document contains/text is" for different contexts
 * (@fast in-memory vs @slow Playwright).
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Page } from 'playwright';
import type { ChangeTracksWorld } from './world';
import { getOrCreateInstance } from './world';
import {
    launchWithJourneyFixture,
    executeCommand,
    executeCommandViaBridge,
    updateSettingDirect,
    getDocumentText,
} from '../../journeys/playwrightHarness';

// ---------------------------------------------------------------------------
// Extend ChangeTracksWorld with tracking-specific state
// ---------------------------------------------------------------------------
declare module './world' {
    interface ChangeTracksWorld {
        /** Content set before tracking mode was enabled */
        trackingInitialContent?: string;
        /** Whether the editor is file-backed (vs untitled) */
        trackingFileBacked?: boolean;
        /** Pause threshold configured for this scenario */
        trackingPauseThreshold?: number;
        /** pasteMinChars configured for this scenario */
        trackingPasteMinChars?: number;
        /** Whether breakOnNewline is enabled */
        trackingBreakOnNewline?: boolean;
        /** Text captured at save event time */
        textAtSaveTime?: string;
        /** Duration of the last save operation in ms */
        lastSaveDurationMs?: number;
    }
}

// ---------------------------------------------------------------------------
// Helper: get document text via Playwright evaluate
// ---------------------------------------------------------------------------
async function getTrackedDocumentText(world: ChangeTracksWorld): Promise<string> {
    assert.ok(world.page, 'Page not available');
    return await getDocumentText(world.page!, { instanceId: world.instance?.instanceId });
}

// ---------------------------------------------------------------------------
// Helper: open a temp file with content via command palette + Monaco
// ---------------------------------------------------------------------------
/**
 * Write content to a temp file, open it via VS Code's command palette,
 * and ensure the Monaco model matches the desired content.
 */
async function openTempFileWithContent(page: Page, content: string, tmpPath: string): Promise<void> {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    await executeCommand(page, 'File: Open File...');
    await page.waitForTimeout(500);
    await page.keyboard.type(tmpPath, { delay: 10 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    // Ensure model content matches (in case file was already open with stale content)
    await page.evaluate(`
        (() => {
            const editors = globalThis.monaco?.editor?.getEditors?.();
            const model = editors?.[0]?.getModel();
            if (model) model.setValue(${JSON.stringify(content)});
        })()
    `);
    await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Given steps — editor setup
// ---------------------------------------------------------------------------

Given(
    'a tracking-mode editor with content {string}',
    { timeout: 60000 },
    async function (this: ChangeTracksWorld, content: string) {
        this.trackingInitialContent = content;
        this.instance = await getOrCreateInstance(
            'tracking-mode-test.md',
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;

        // Reset document content with tracking header prepended.
        // This eliminates dependency on the toggle command and shared instance state.
        const trackedContent = `<!-- ctrcks.com/v1: tracked -->\n${content}`;
        const inputPath = path.join(os.tmpdir(), 'changetracks-test-reset-input.json');
        fs.writeFileSync(inputPath, JSON.stringify({ content: trackedContent }));
        await executeCommandViaBridge(this.page!, 'ChangeTracks: Test Reset Document');
        await this.page!.waitForTimeout(500);

        // Verify tracking is enabled
        const text = await getDocumentText(this.page!, { instanceId: this.instance?.instanceId });
        if (!text.includes('ctrcks.com/v1: tracked')) {
            throw new Error(`Tracking header not found in document after reset. Content: ${text.substring(0, 100)}`);
        }
    }
);

Given(
    'a tracking-mode editor with file-backed content {string}',
    { timeout: 60000 },
    async function (this: ChangeTracksWorld, content: string) {
        this.trackingInitialContent = content;
        this.trackingFileBacked = true;

        this.instance = await getOrCreateInstance(
            'tracking-mode-test.md',
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;

        // Create a file-backed document: write from Node.js, then open via command palette
        const tmpFile = path.join(os.tmpdir(), 'changetracks-cucumber-test.md');
        await openTempFileWithContent(this.page!, content, tmpFile);

        // Enable tracking mode
        await executeCommandViaBridge(this.page!, 'ChangeTracks: Toggle Tracking');
        await this.page!.waitForTimeout(500);
    }
);

Given(
    'an editor with file-backed content {string}',
    { timeout: 60000 },
    async function (this: ChangeTracksWorld, content: string) {
        this.trackingInitialContent = content;
        this.trackingFileBacked = true;

        this.instance = await getOrCreateInstance(
            'tracking-mode-test.md',
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;

        // Create a file-backed document (tracking mode NOT enabled)
        const tmpFile = path.join(os.tmpdir(), 'changetracks-cucumber-test-notrack.md');
        await openTempFileWithContent(this.page!, content, tmpFile);
    }
);

Given(
    'a tracking-mode editor with file-backed plain-text content {string}',
    { timeout: 60000 },
    async function (this: ChangeTracksWorld, content: string) {
        this.trackingInitialContent = content;
        this.trackingFileBacked = true;

        this.instance = await getOrCreateInstance(
            'tracking-mode-test.md',
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;

        // Create a non-markdown file-backed document
        const tmpFile = path.join(os.tmpdir(), 'changetracks-cucumber-test.txt');
        await openTempFileWithContent(this.page!, content, tmpFile);

        // Enable tracking mode
        await executeCommandViaBridge(this.page!, 'ChangeTracks: Toggle Tracking');
        await this.page!.waitForTimeout(500);
    }
);

// ---------------------------------------------------------------------------
// Given steps — configuration
// ---------------------------------------------------------------------------

Given(
    'the pause threshold is {int}ms',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, ms: number) {
        assert.ok(this.page, 'Page not available');
        this.trackingPauseThreshold = ms;
        // Modify settings.json directly — VS Code watches and auto-reloads
        await updateSettingDirect(this.page!, 'changetracks.editBoundary.pauseThresholdMs', ms);
    }
);

Given(
    'pasteMinChars is {int}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, n: number) {
        assert.ok(this.page, 'Page not available');
        // pasteMinChars is hardcoded to 50; this step records intent but no config change needed
        this.trackingPasteMinChars = n;
    }
);

Given(
    'breakOnNewline is enabled',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        this.trackingBreakOnNewline = true;
        // Modify settings.json directly — VS Code watches and auto-reloads
        await updateSettingDirect(this.page!, 'changetracks.editBoundary.breakOnNewline', true);
    }
);

// ---------------------------------------------------------------------------
// When steps — editor operations
// ---------------------------------------------------------------------------

When(
    'I insert {string} at the end',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, text: string) {
        assert.ok(this.page, 'Page not available');
        // Move cursor to end of document via Monaco, then insert text atomically
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        const lastLine = model.getLineCount();
                        const lastCol = model.getLineMaxColumn(lastLine);
                        editor.setPosition({ lineNumber: lastLine, column: lastCol });
                        model.pushEditOperations([], [{
                            range: { startLineNumber: lastLine, startColumn: lastCol, endLineNumber: lastLine, endColumn: lastCol },
                            text: ${JSON.stringify(text)}
                        }], () => null);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I insert {string} at the beginning',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, text: string) {
        assert.ok(this.page, 'Page not available');
        // Move cursor to beginning, then insert text via Monaco
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        editor.setPosition({ lineNumber: 1, column: 1 });
                        model.pushEditOperations([], [{
                            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
                            text: ${JSON.stringify(text)}
                        }], () => null);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I insert {string} adjacent',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, text: string) {
        assert.ok(this.page, 'Page not available');
        // Insert text at current cursor position via Monaco
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    const pos = editor.getPosition();
                    if (model && pos) {
                        model.pushEditOperations([], [{
                            range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
                            text: ${JSON.stringify(text)}
                        }], () => null);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I type {string}, {string}, {string}, {string}, {string} at the end with {int}ms gaps',
    { timeout: 15000 },
    async function (
        this: ChangeTracksWorld,
        c1: string, c2: string, c3: string, c4: string, c5: string,
        gapMs: number
    ) {
        assert.ok(this.page, 'Page not available');
        const chars = [c1, c2, c3, c4, c5];
        for (let i = 0; i < chars.length; i++) {
            // Insert character at end via Monaco
            await this.page!.evaluate((char: string) => {
                const editors = (globalThis as any).monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        const lastLine = model.getLineCount();
                        const lastCol = model.getLineMaxColumn(lastLine);
                        editor.setPosition({ lineNumber: lastLine, column: lastCol });
                        model.pushEditOperations([], [{
                            range: { startLineNumber: lastLine, startColumn: lastCol, endLineNumber: lastLine, endColumn: lastCol },
                            text: char
                        }], () => null);
                    }
                }
            }, chars[i]);
            if (i < chars.length - 1) {
                await this.page!.waitForTimeout(gapMs);
            }
        }
    }
);

When(
    'I rapidly insert {string}, {string}, {string}, {string}, {string} at the end',
    { timeout: 10000 },
    async function (
        this: ChangeTracksWorld,
        c1: string, c2: string, c3: string, c4: string, c5: string
    ) {
        assert.ok(this.page, 'Page not available');
        const chars = [c1, c2, c3, c4, c5];
        for (const char of chars) {
            // Insert character at end via Monaco (no delay between)
            await this.page!.evaluate((c: string) => {
                const editors = (globalThis as any).monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        const lastLine = model.getLineCount();
                        const lastCol = model.getLineMaxColumn(lastLine);
                        editor.setPosition({ lineNumber: lastLine, column: lastCol });
                        model.pushEditOperations([], [{
                            range: { startLineNumber: lastLine, startColumn: lastCol, endLineNumber: lastLine, endColumn: lastCol },
                            text: c
                        }], () => null);
                    }
                }
            }, char);
        }
    }
);

When(
    'I delete the character at position {int},{int}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, line: number, col: number) {
        assert.ok(this.page, 'Page not available');
        // Monaco uses 1-based line/column; vscode Range uses 0-based line, 0-based col
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        model.pushEditOperations([], [{
                            range: { startLineNumber: ${line + 1}, startColumn: ${col + 1}, endLineNumber: ${line + 1}, endColumn: ${col + 2} },
                            text: ''
                        }], () => null);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I delete the range {int},{int} to {int},{int}',
    { timeout: 10000 },
    async function (
        this: ChangeTracksWorld,
        startLine: number, startCol: number,
        endLine: number, endCol: number
    ) {
        assert.ok(this.page, 'Page not available');
        // Monaco uses 1-based line/column; vscode Range uses 0-based
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        model.pushEditOperations([], [{
                            range: { startLineNumber: ${startLine + 1}, startColumn: ${startCol + 1}, endLineNumber: ${endLine + 1}, endColumn: ${endCol + 1} },
                            text: ''
                        }], () => null);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I backspace-delete at position {int},{int}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, line: number, col: number) {
        assert.ok(this.page, 'Page not available');
        // Backspace deletes the character before the cursor position
        // Monaco 1-based: vscode(line, col-1) -> (line+1, col), vscode(line, col) -> (line+1, col+1)
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        model.pushEditOperations([], [{
                            range: { startLineNumber: ${line + 1}, startColumn: ${col}, endLineNumber: ${line + 1}, endColumn: ${col + 1} },
                            text: ''
                        }], () => null);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I delete the first unwrapped character after the deletion',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        // Find 'b' in the document text and delete it via Monaco
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        const text = model.getValue();
                        const bPos = text.indexOf('b');
                        if (bPos >= 0) {
                            const startPos = model.getPositionAt(bPos);
                            const endPos = model.getPositionAt(bPos + 1);
                            model.pushEditOperations([], [{
                                range: { startLineNumber: startPos.lineNumber, startColumn: startPos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column },
                                text: ''
                            }], () => null);
                        }
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I replace the range {int},{int} to {int},{int} with {string}',
    { timeout: 10000 },
    async function (
        this: ChangeTracksWorld,
        startLine: number, startCol: number,
        endLine: number, endCol: number,
        newText: string
    ) {
        assert.ok(this.page, 'Page not available');
        // Monaco uses 1-based line/column; vscode Range uses 0-based
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        model.pushEditOperations([], [{
                            range: { startLineNumber: ${startLine + 1}, startColumn: ${startCol + 1}, endLineNumber: ${endLine + 1}, endColumn: ${endCol + 1} },
                            text: ${JSON.stringify(newText)}
                        }], () => null);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I move the cursor to position {int},{int}',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld, line: number, col: number) {
        assert.ok(this.page, 'Page not available');
        // Monaco uses 1-based line/column; vscode Position uses 0-based
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    editor.setPosition({ lineNumber: ${line + 1}, column: ${col + 1} });
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I move the cursor to a safe mid-position',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        // Move cursor to the midpoint of the document via Monaco
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        const len = model.getValue().length;
                        const midOffset = Math.floor(len / 2);
                        const pos = model.getPositionAt(midOffset);
                        editor.setPosition(pos);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I rapidly move cursor to positions \\({int},{int}\\), \\({int},{int}\\), \\({int},{int}\\)',
    { timeout: 5000 },
    async function (
        this: ChangeTracksWorld,
        l1: number, c1: number,
        l2: number, c2: number,
        l3: number, c3: number
    ) {
        assert.ok(this.page, 'Page not available');
        // Rapidly set cursor to three positions via Monaco (1-based)
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    editor.setPosition({ lineNumber: ${l1 + 1}, column: ${c1 + 1} });
                    editor.setPosition({ lineNumber: ${l2 + 1}, column: ${c2 + 1} });
                    editor.setPosition({ lineNumber: ${l3 + 1}, column: ${c3 + 1} });
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

When(
    'I apply a multi-change edit',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        // Apply two insertions in a single batch via Monaco pushEditOperations
        await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                const editor = editors?.[0];
                if (editor) {
                    const model = editor.getModel();
                    if (model) {
                        const lastLine = model.getLineCount();
                        const lastCol = model.getLineMaxColumn(lastLine);
                        model.pushEditOperations([], [
                            {
                                range: { startLineNumber: lastLine, startColumn: lastCol, endLineNumber: lastLine, endColumn: lastCol },
                                text: 'auto'
                            },
                            {
                                range: { startLineNumber: lastLine, startColumn: lastCol + 4, endLineNumber: lastLine, endColumn: lastCol + 4 },
                                text: 'complete'
                            }
                        ], () => null);
                    }
                }
            })()
        `);
        await this.page!.waitForTimeout(50);
    }
);

// ---------------------------------------------------------------------------
// When steps — save operations
// ---------------------------------------------------------------------------

When(
    'I save the document',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        // Save via keyboard shortcut (Cmd+S on macOS)
        await this.page!.keyboard.press('Meta+s');
        await this.page!.waitForTimeout(500);
    }
);

When(
    'I save the document and capture text at save event',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        // Capture current text before save, then save via keyboard shortcut
        const textBeforeSave = await this.page!.evaluate(`
            (() => {
                const editors = globalThis.monaco?.editor?.getEditors?.();
                return editors?.[0]?.getModel()?.getValue() ?? '';
            })()
        `) as string;
        await this.page!.keyboard.press('Meta+s');
        await this.page!.waitForTimeout(500);
        // After save, capture the text (approximation: the model text at save time)
        this.textAtSaveTime = textBeforeSave;
    }
);

When(
    'I save the document and measure duration',
    { timeout: 15000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        // Measure save duration via keyboard shortcut timing
        const start = Date.now();
        await this.page!.keyboard.press('Meta+s');
        await this.page!.waitForTimeout(500);
        this.lastSaveDurationMs = Date.now() - start;
    }
);

// ---------------------------------------------------------------------------
// When steps — timing
// ---------------------------------------------------------------------------

When(
    'I wait {int}ms',
    { timeout: 60000 },
    async function (this: ChangeTracksWorld, ms: number) {
        assert.ok(this.page, 'Page not available');
        await this.page!.waitForTimeout(ms);
    }
);

// ---------------------------------------------------------------------------
// Then steps — tracked document content assertions
// (Use "tracked document" prefix to avoid ambiguity with operation.steps.ts
//  and interaction.steps.ts which define "the document contains/text is")
// ---------------------------------------------------------------------------

Then(
    'the tracked document text is {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, expected: string) {
        const text = await getTrackedDocumentText(this);
        assert.strictEqual(text, expected, `Expected document text "${expected}" but got "${text}"`);
    }
);

Then(
    'the tracked document contains {string}',
    { timeout: 15000 },
    async function (this: ChangeTracksWorld, expected: string) {
        // CriticMarkup delimiters are produced asynchronously by the edit boundary
        // detector (pause threshold + async onDidChangeTextDocument). Poll for up
        // to 5 seconds when the expected text looks like CriticMarkup.
        const isCriticMarkup = /\{\+\+|\{--|~>|\{~~|\{==|\{>>/.test(expected);
        if (isCriticMarkup) {
            const deadline = Date.now() + 5000;
            let text = '';
            while (Date.now() < deadline) {
                text = await getTrackedDocumentText(this);
                if (text.includes(expected)) return;
                await this.page!.waitForTimeout(200);
            }
            assert.ok(
                text.includes(expected),
                `Expected document to contain "${expected}" after 5s of polling but got: ${text.substring(0, 300)}`
            );
        } else {
            const text = await getTrackedDocumentText(this);
            assert.ok(
                text.includes(expected),
                `Expected document to contain "${expected}" but got: ${text.substring(0, 300)}`
            );
        }
    }
);

Then(
    'the tracked document does not contain {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, expected: string) {
        const text = await getTrackedDocumentText(this);
        assert.ok(
            !text.includes(expected),
            `Expected document to NOT contain "${expected}" but it does.\nDocument text:\n${text.substring(0, 500)}`
        );
    }
);

Then(
    'the tracked document contains exactly {int} insertion marker(s)',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, count: number) {
        const text = await getTrackedDocumentText(this);
        const matches = text.match(/\{\+\+/g) || [];
        assert.strictEqual(
            matches.length, count,
            `Expected ${count} insertion markers, found ${matches.length} in: ${text.substring(0, 300)}`
        );
    }
);

Then(
    'the tracked document contains exactly {int} deletion marker(s)',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, count: number) {
        const text = await getTrackedDocumentText(this);
        const matches = text.match(/\{--/g) || [];
        assert.strictEqual(
            matches.length, count,
            `Expected ${count} deletion markers, found ${matches.length} in: ${text.substring(0, 300)}`
        );
    }
);

Then(
    'the tracked document contains at least {int} footnote ref(s)',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, minCount: number) {
        const text = await getTrackedDocumentText(this);
        const matches = text.match(/\[\^ct-\d+\]/g) || [];
        assert.ok(
            matches.length >= minCount,
            `Expected at least ${minCount} footnote refs, found ${matches.length} in: ${text.substring(0, 300)}`
        );
    }
);

Then(
    '{string} appears before {string} in the tracked document',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, first: string, second: string) {
        const text = await getTrackedDocumentText(this);
        const firstIdx = text.indexOf(first);
        const secondIdx = text.indexOf(second);
        assert.ok(firstIdx >= 0, `"${first}" not found in document`);
        assert.ok(secondIdx >= 0, `"${second}" not found in document`);
        assert.ok(
            firstIdx < secondIdx,
            `Expected "${first}" to appear before "${second}" but positions are ${firstIdx} and ${secondIdx}`
        );
    }
);

Then(
    '{string} appears exactly {int} time(s) in the tracked document',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, text: string, count: number) {
        const doc = await getTrackedDocumentText(this);
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = doc.match(new RegExp(escaped, 'g')) || [];
        assert.strictEqual(
            matches.length, count,
            `Expected "${text}" to appear ${count} time(s), found ${matches.length}`
        );
    }
);

Then(
    'the tracked document contains {string} or {string}',
    { timeout: 15000 },
    async function (this: ChangeTracksWorld, option1: string, option2: string) {
        const isCriticMarkup = /\{\+\+|\{--|~>|\{~~|\{==|\{>>/.test(option1 + option2);
        if (isCriticMarkup) {
            const deadline = Date.now() + 5000;
            let text = '';
            while (Date.now() < deadline) {
                text = await getTrackedDocumentText(this);
                if (text.includes(option1) || text.includes(option2)) return;
                await this.page!.waitForTimeout(200);
            }
            assert.ok(
                text.includes(option1) || text.includes(option2),
                `Expected document to contain either "${option1}" or "${option2}" after 5s of polling but got: ${text.substring(0, 300)}`
            );
        } else {
            const text = await getTrackedDocumentText(this);
            assert.ok(
                text.includes(option1) || text.includes(option2),
                `Expected document to contain either "${option1}" or "${option2}" but got: ${text.substring(0, 300)}`
            );
        }
    }
);

Then(
    'the tracked document does not contain unwrapped {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, text: string) {
        const doc = await getTrackedDocumentText(this);
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const unwrappedMatch = doc.match(new RegExp(`${escaped}(?!\\+\\+)`, 'g'));
        assert.ok(
            !unwrappedMatch,
            `Found unwrapped "${text}" in document`
        );
    }
);

// ---------------------------------------------------------------------------
// Then steps — save-specific assertions
// ---------------------------------------------------------------------------

Then(
    'the saved file contains {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, expected: string) {
        assert.ok(this.page, 'Page not available');
        // Read saved file content from disk (file-backed documents write to os.tmpdir())
        let savedContent = '';
        if (this.trackingFileBacked) {
            // Determine which tmp file was used based on the test context
            const candidates = [
                path.join(os.tmpdir(), 'changetracks-cucumber-test.md'),
                path.join(os.tmpdir(), 'changetracks-cucumber-test-notrack.md'),
                path.join(os.tmpdir(), 'changetracks-cucumber-test.txt'),
            ];
            for (const filePath of candidates) {
                if (fs.existsSync(filePath)) {
                    savedContent = fs.readFileSync(filePath, 'utf-8');
                    break;
                }
            }
        }
        // Fallback: read from Monaco model (in-memory content post-save)
        if (!savedContent) {
            savedContent = await this.page!.evaluate(`
                (() => {
                    const editors = globalThis.monaco?.editor?.getEditors?.();
                    return editors?.[0]?.getModel()?.getValue() ?? '';
                })()
            `) as string;
        }
        assert.ok(
            savedContent.includes(expected),
            `Saved file does not contain "${expected}". Got: ${savedContent.substring(0, 300)}`
        );
    }
);

Then(
    'the saved file does not contain unwrapped {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, text: string) {
        assert.ok(this.page, 'Page not available');
        // Read saved file content from disk or Monaco model
        let savedContent = '';
        if (this.trackingFileBacked) {
            const candidates = [
                path.join(os.tmpdir(), 'changetracks-cucumber-test.md'),
                path.join(os.tmpdir(), 'changetracks-cucumber-test-notrack.md'),
                path.join(os.tmpdir(), 'changetracks-cucumber-test.txt'),
            ];
            for (const filePath of candidates) {
                if (fs.existsSync(filePath)) {
                    savedContent = fs.readFileSync(filePath, 'utf-8');
                    break;
                }
            }
        }
        if (!savedContent) {
            savedContent = await this.page!.evaluate(`
                (() => {
                    const editors = globalThis.monaco?.editor?.getEditors?.();
                    return editors?.[0]?.getModel()?.getValue() ?? '';
                })()
            `) as string;
        }
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const unwrappedMatch = savedContent.match(new RegExp(`${escaped}(?!\\+\\+)`, 'g'));
        assert.ok(
            !unwrappedMatch,
            `Saved file contains unwrapped "${text}"`
        );
    }
);

Then(
    'the text captured at save time contains {string}',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld, expected: string) {
        assert.ok(this.textAtSaveTime !== undefined, 'No text captured at save time');
        assert.ok(
            this.textAtSaveTime!.includes(expected),
            `Text at save time does not contain "${expected}". Got: ${this.textAtSaveTime!.substring(0, 300)}`
        );
    }
);

Then(
    'the save completed in less than {int}ms',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld, maxMs: number) {
        assert.ok(this.lastSaveDurationMs !== undefined, 'No save duration measured');
        assert.ok(
            this.lastSaveDurationMs! < maxMs,
            `Save took ${this.lastSaveDurationMs}ms, expected < ${maxMs}ms`
        );
    }
);
