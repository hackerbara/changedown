/**
 * Step definitions for EB3: save-preserves-criticmarkup scenarios.
 *
 * TIER: @integration
 *
 * These steps require VS Code Extension Host + Playwright. They test that
 * CriticMarkup is preserved across save operations under various panel
 * state transitions.
 *
 * IMPORTANT: All document mutations use extension host bridge commands
 * (_testResetDocument, _testSelectAndReplace) instead of globalThis.monaco,
 * because Monaco API is unreliable in the Playwright renderer process.
 *
 * Approaches used:
 *   - Bridge commands: executeCommandViaBridge() for document edits
 *   - Command palette: executeCommand() for VS Code commands
 *   - Filesystem: fs.readFileSync/writeFileSync from test runner
 *   - Keyboard: Meta+S for save, etc.
 *
 * STEP NAMING: Uses unique prefixes to avoid conflicts with existing steps:
 *   - "the on-disk file contains" (vs tracking.steps "the saved file contains")
 *   - "the live document contains" (vs operation.steps "the document text contains")
 *   - "the panel shows tracking" (registered ONCE as Then, also works as Given)
 *   - "the controller state shows tracking" (unique)
 *   - "I press Cmd+S to save" (vs tracking.steps "I save the document")
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import type { ChangeDownWorld } from './world';
import { getOrCreateInstance } from './world';
import {
    launchWithJourneyFixture,
    executeCommand,
    executeCommandViaBridge,
    getDocumentText,
} from '../../journeys/playwrightHarness';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMP_DIR = os.tmpdir();
const PANEL_STATE_PATH = path.join(TEMP_DIR, 'changedown-test-state.json');
const FIXTURE_NAME = 'tracking-mode-test.md';
const CRITICMARKUP_FIXTURE = 'journey-save-criticmarkup.md';

// At runtime __dirname = out/features/steps/ (compiled from packages/tests/vscode/)
const PACKAGE_ROOT = path.resolve(__dirname, '../../..');
const FIXTURES_DIR = path.resolve(PACKAGE_ROOT, 'fixtures/journeys');
const FIXTURE_FILE_PATH = path.resolve(FIXTURES_DIR, FIXTURE_NAME);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PanelState {
    trackingEnabled: boolean;
    viewMode: string;
    changeCount: number;
    changeTypes: string[];
    hasActiveMarkdownEditor: boolean;
    timestamp: number;
}

async function queryEB3PanelState(world: ChangeDownWorld): Promise<PanelState | null> {
    assert.ok(world.page, 'Page not available');

    // Dismiss any open dialogs/palettes before querying
    await world.page!.keyboard.press('Escape');
    await world.page!.waitForTimeout(200);

    const beforeTs = Date.now();
    await executeCommand(world.page!, 'ChangeDown: Test Query Panel State');
    await world.page!.waitForTimeout(600);
    try {
        if (!fs.existsSync(PANEL_STATE_PATH)) return null;
        const raw = fs.readFileSync(PANEL_STATE_PATH, 'utf8');
        const state = JSON.parse(raw) as PanelState;
        if (state.timestamp < beforeTs) return null;
        return state;
    } catch {
        return null;
    }
}

/**
 * Read the CriticMarkup fixture content.
 * Resolves from the journeys fixture directory.
 */
function readCriticMarkupFixtureContent(): string {
    const fixturePath = path.resolve(FIXTURES_DIR, CRITICMARKUP_FIXTURE);
    if (!fs.existsSync(fixturePath)) {
        throw new Error(`Fixture not found: ${fixturePath}`);
    }
    return fs.readFileSync(fixturePath, 'utf8');
}

/**
 * Set the editor content via the _testResetDocument bridge command.
 * Runs in the extension host process — reliable, unlike globalThis.monaco
 * which is often undefined in the Playwright renderer.
 */
async function setEditorContent(world: ChangeDownWorld, content: string): Promise<void> {
    assert.ok(world.page, 'Page not available');
    const inputPath = path.join(os.tmpdir(), 'changedown-test-reset-input.json');
    fs.writeFileSync(inputPath, JSON.stringify({ content }));
    await executeCommandViaBridge(world.page!, 'ChangeDown: Test Reset Document');
    await world.page!.waitForTimeout(500);

    // Verify reset succeeded
    const resultPath = path.join(os.tmpdir(), 'changedown-test-reset.json');
    if (fs.existsSync(resultPath)) {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        assert.ok(result.ok, `Failed to reset document: ${result.error}`);
    }
}

/**
 * Restore the fixture file from git.
 * Does NOT use the command palette (which can leave the palette open on failure).
 * The subsequent setEditorContent + save will overwrite the model anyway.
 */
async function resetFixtureFile(): Promise<void> {
    try {
        // PACKAGE_ROOT = packages/tests/vscode/; fixtures are at fixtures/journeys/
        execSync(`git checkout -- "fixtures/journeys/${FIXTURE_NAME}"`, {
            cwd: PACKAGE_ROOT,
        });
    } catch {
        // File might not be tracked yet — that's OK
    }
}

/**
 * Dismiss any open overlays (command palette, dialogs, notifications)
 * and focus the editor. Essential before any keyboard-based operations.
 */
async function ensureCleanEditorFocus(page: import('playwright').Page): Promise<void> {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // Click the editor to ensure it has focus
    await page.click('.monaco-editor .view-lines').catch(() => {});
    await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
// Given steps — editor setup
// ---------------------------------------------------------------------------

Given(
    'a blank file-backed markdown document',
    { timeout: 60000 },
    async function (this: ChangeDownWorld) {
        // Get or reuse the shared VS Code instance
        this.instance = await getOrCreateInstance(
            FIXTURE_NAME,
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;
        this.fixtureFile = FIXTURE_NAME;

        // Restore fixture on disk from git
        await resetFixtureFile();

        // Dismiss any overlays and focus editor
        await ensureCleanEditorFocus(this.page!);

        // Replace content with blank markdown (no tracking header)
        const blankContent = '# Test Document\n\nSome content here.\n';
        await setEditorContent(this, blankContent);

        // Save the blank content to disk so on-disk reads work
        await this.page!.keyboard.press('Meta+s');
        await this.page!.waitForTimeout(800);

        // Ensure tracking is OFF for blank file scenarios
        const state = await queryEB3PanelState(this);
        if (state && state.trackingEnabled) {
            await executeCommand(this.page!, 'ChangeDown: Toggle Tracking');
            await this.page!.waitForTimeout(500);
        }
    }
);

Given(
    'a blank file-backed markdown document with tracking header',
    { timeout: 60000 },
    async function (this: ChangeDownWorld) {
        this.instance = await getOrCreateInstance(
            FIXTURE_NAME,
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;
        this.fixtureFile = FIXTURE_NAME;

        await resetFixtureFile();
        await ensureCleanEditorFocus(this.page!);

        const trackedContent = '<!-- changedown.com/v1: tracked -->\n# Test Document\n\nSome content here.\n';
        await setEditorContent(this, trackedContent);

        // Save so on-disk and model are in sync
        await this.page!.keyboard.press('Meta+s');
        await this.page!.waitForTimeout(800);
    }
);

Given(
    'a tracked file-backed document with CriticMarkup',
    { timeout: 60000 },
    async function (this: ChangeDownWorld) {
        this.instance = await getOrCreateInstance(
            FIXTURE_NAME,
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;
        this.fixtureFile = FIXTURE_NAME;

        await resetFixtureFile();
        await ensureCleanEditorFocus(this.page!);

        // Load the CriticMarkup fixture content and set it in the editor
        const criticContent = readCriticMarkupFixtureContent();
        await setEditorContent(this, criticContent);

        // Save so on-disk matches
        await this.page!.keyboard.press('Meta+s');
        await this.page!.waitForTimeout(800);

        // Ensure tracking is ON (file has tracking header)
        const state = await queryEB3PanelState(this);
        if (state && !state.trackingEnabled) {
            await executeCommand(this.page!, 'ChangeDown: Toggle Tracking');
            await this.page!.waitForTimeout(500);
        }
    }
);

// ---------------------------------------------------------------------------
// Then steps — panel and controller state assertions
//
// NOTE: In Cucumber, Given/When/Then share one step registry.
// Register each pattern ONCE with Then — it works for Given/And too.
// ---------------------------------------------------------------------------

Then(
    'the panel shows tracking is enabled',
    { timeout: 10000 },
    async function (this: ChangeDownWorld) {
        const state = await queryEB3PanelState(this);
        assert.ok(state, 'Failed to query panel state');
        assert.strictEqual(state.trackingEnabled, true,
            'Panel shows tracking disabled, expected enabled');
    }
);

Then(
    'the panel shows tracking is disabled',
    { timeout: 10000 },
    async function (this: ChangeDownWorld) {
        const state = await queryEB3PanelState(this);
        assert.ok(state, 'Failed to query panel state');
        assert.strictEqual(state.trackingEnabled, false,
            'Panel shows tracking enabled, expected disabled');
    }
);

Then(
    'the controller state shows tracking is enabled',
    { timeout: 10000 },
    async function (this: ChangeDownWorld) {
        const state = await queryEB3PanelState(this);
        assert.ok(state, 'Failed to query controller state');
        assert.strictEqual(state.trackingEnabled, true,
            'Controller state shows tracking disabled, expected enabled');
    }
);

Then(
    'the controller state shows tracking is disabled',
    { timeout: 10000 },
    async function (this: ChangeDownWorld) {
        const state = await queryEB3PanelState(this);
        assert.ok(state, 'Failed to query controller state');
        assert.strictEqual(state.trackingEnabled, false,
            'Controller state shows tracking enabled, expected disabled');
    }
);

// ---------------------------------------------------------------------------
// When steps — save via keyboard shortcut
// ---------------------------------------------------------------------------

When(
    'I press Cmd+S to save',
    { timeout: 10000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');
        // Dismiss any overlays and focus editor before saving
        await ensureCleanEditorFocus(this.page!);
        // Save via keyboard shortcut
        await this.page!.keyboard.press('Meta+s');
        await this.page!.waitForTimeout(500);
    }
);

// ---------------------------------------------------------------------------
// When steps — comment insertion via bridge commands
// ---------------------------------------------------------------------------

When(
    'I add a comment {string} highlighting {string} in the document',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, commentText: string, targetText: string) {
        assert.ok(this.page, 'Page not available');
        const replacement = `{==${targetText}==}{>> ${commentText} <<}`;

        // Use _testSelectAndReplace bridge: find target text and replace atomically
        const inputPath = path.join(os.tmpdir(), 'changedown-test-select-replace-input.json');
        const resultPath = path.join(os.tmpdir(), 'changedown-test-select-replace.json');
        try { fs.unlinkSync(resultPath); } catch { /* ignore */ }
        fs.writeFileSync(inputPath, JSON.stringify({ target: targetText, replacement }));
        await executeCommandViaBridge(this.page!, 'changedown._testSelectAndReplace');

        // Poll for result
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            await this.page!.waitForTimeout(100);
            try {
                if (fs.existsSync(resultPath)) {
                    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
                    if (result.ok) break;
                    throw new Error(`add comment failed: ${result.error}`);
                }
            } catch (e: any) {
                if (e.message.startsWith('add comment')) throw e;
            }
        }
        await this.page!.waitForTimeout(300);
    }
);

When(
    'I add a footnoted comment {string} highlighting {string} in the document',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, commentText: string, targetText: string) {
        assert.ok(this.page, 'Page not available');
        const inputPath = path.join(os.tmpdir(), 'changedown-test-select-replace-input.json');
        const resultPath = path.join(os.tmpdir(), 'changedown-test-select-replace.json');

        // Read current document text to compute next cn-N ID
        const text = await getDocumentText(this.page!, { instanceId: this.instance?.instanceId });
        const idMatches = text.match(/\[\^cn-(\d+)\]/g);
        let maxId = 0;
        if (idMatches) {
            for (const m of idMatches) {
                const n = parseInt(m.match(/\d+/)![0], 10);
                if (n > maxId) maxId = n;
            }
        }
        const newId = `cn-${maxId + 1}`;

        const inlinePart = `{==${targetText}==}{>> ${commentText} <<}[^${newId}]`;
        const footnote = `\n\n[^${newId}]: @human | 2026-03-01 | comment | proposed\n    ${commentText}`;

        // Edit 1: Replace the target text with inline markup
        try { fs.unlinkSync(resultPath); } catch { /* ignore */ }
        fs.writeFileSync(inputPath, JSON.stringify({ target: targetText, replacement: inlinePart }));
        await executeCommandViaBridge(this.page!, 'changedown._testSelectAndReplace');

        // Poll for edit 1 result
        let deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            await this.page!.waitForTimeout(100);
            try {
                if (fs.existsSync(resultPath)) {
                    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
                    if (result.ok) break;
                    throw new Error(`footnoted comment edit 1 failed: ${result.error}`);
                }
            } catch (e: any) {
                if (e.message.startsWith('footnoted comment')) throw e;
            }
        }

        // Edit 2: Append footnote at end of document
        // Read updated text to find the end position
        const updatedText = await getDocumentText(this.page!, { instanceId: this.instance?.instanceId });
        const lastLineIndex = updatedText.split('\n').length - 1;
        const lastLineText = updatedText.split('\n')[lastLineIndex];

        try { fs.unlinkSync(resultPath); } catch { /* ignore */ }
        fs.writeFileSync(inputPath, JSON.stringify({
            startLine: lastLineIndex,
            startCharacter: lastLineText.length,
            endLine: lastLineIndex,
            endCharacter: lastLineText.length,
            replacement: footnote,
        }));
        await executeCommandViaBridge(this.page!, 'changedown._testSelectAndReplace');

        // Poll for edit 2 result
        deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            await this.page!.waitForTimeout(100);
            try {
                if (fs.existsSync(resultPath)) {
                    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
                    if (result.ok) break;
                    throw new Error(`footnoted comment edit 2 failed: ${result.error}`);
                }
            } catch (e: any) {
                if (e.message.startsWith('footnoted comment')) throw e;
            }
        }
        await this.page!.waitForTimeout(300);
    }
);

// ---------------------------------------------------------------------------
// When steps — external tool (MCP) file modifications
// These write directly to the file on disk (bypassing VS Code).
// ---------------------------------------------------------------------------

When(
    'an external tool appends CriticMarkup to the file:',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, docString: string) {
        const current = fs.readFileSync(FIXTURE_FILE_PATH, 'utf8');
        fs.writeFileSync(FIXTURE_FILE_PATH, current + '\n' + docString + '\n', 'utf8');
    }
);

When(
    'an external tool writes a full change with footnote to the file:',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, docString: string) {
        const current = fs.readFileSync(FIXTURE_FILE_PATH, 'utf8');
        fs.writeFileSync(FIXTURE_FILE_PATH, current + '\n' + docString + '\n', 'utf8');
    }
);

When(
    'an external tool appends a new change before footnotes:',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, docString: string) {
        const current = fs.readFileSync(FIXTURE_FILE_PATH, 'utf8');
        const footnoteIdx = current.indexOf('\n[^cn-');
        if (footnoteIdx === -1) {
            fs.writeFileSync(FIXTURE_FILE_PATH, current + '\n' + docString + '\n', 'utf8');
        } else {
            const before = current.slice(0, footnoteIdx);
            const after = current.slice(footnoteIdx);
            fs.writeFileSync(FIXTURE_FILE_PATH, before + '\n\n' + docString + after, 'utf8');
        }
    }
);

When(
    'an external tool appends to the footnote section:',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, docString: string) {
        const current = fs.readFileSync(FIXTURE_FILE_PATH, 'utf8');
        fs.writeFileSync(FIXTURE_FILE_PATH, current + '\n' + docString + '\n', 'utf8');
    }
);

// ---------------------------------------------------------------------------
// When steps — waiting for file watcher + revert
// ---------------------------------------------------------------------------

When(
    'I wait for external file change to propagate',
    { timeout: 15000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');
        // Wait for file watcher to detect the change
        await this.page!.waitForTimeout(2000);
        // Force VS Code to reload from disk
        await executeCommand(this.page!, 'File: Revert File');
        await this.page!.waitForTimeout(500);
    }
);

// ---------------------------------------------------------------------------
// Then steps — live document content assertions (buffer, not disk)
// Uses getDocumentText which reads via bridge command (temp file IPC)
// ---------------------------------------------------------------------------

Then(
    'the live document contains {string}',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, expected: string) {
        assert.ok(this.page, 'Page not available');
        const text = await getDocumentText(this.page!, { instanceId: this.instance?.instanceId });
        assert.ok(text.length > 0, 'getDocumentText returned empty');
        assert.ok(text.includes(expected),
            `Live document does not contain "${expected}". Got: ${text.substring(0, 500)}`);
    }
);

Then(
    'the live document does not contain {string}',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, unexpected: string) {
        assert.ok(this.page, 'Page not available');
        const text = await getDocumentText(this.page!, { instanceId: this.instance?.instanceId });
        assert.ok(text.length > 0, 'getDocumentText returned empty');
        assert.ok(!text.includes(unexpected),
            `Live document unexpectedly contains "${unexpected}"`);
    }
);

// ---------------------------------------------------------------------------
// Then steps — on-disk file content assertions
// Reads directly from the filesystem (no page.evaluate needed)
// ---------------------------------------------------------------------------

Then(
    'the on-disk file contains {string}',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, expected: string) {
        const content = fs.readFileSync(FIXTURE_FILE_PATH, 'utf8');
        assert.ok(content.length > 0, 'On-disk file content is empty');
        assert.ok(content.includes(expected),
            `On-disk file does not contain "${expected}". Got: ${content.substring(0, 500)}`);
    }
);

Then(
    'the on-disk file does not contain {string}',
    { timeout: 10000 },
    async function (this: ChangeDownWorld, unexpected: string) {
        const content = fs.readFileSync(FIXTURE_FILE_PATH, 'utf8');
        assert.ok(!content.includes(unexpected),
            `On-disk file unexpectedly contains "${unexpected}"`);
    }
);
