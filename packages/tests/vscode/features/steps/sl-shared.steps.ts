/**
 * Shared step definitions for SL-* (Wave 3 lifecycle) @slow scenarios.
 *
 * These steps are used by multiple SL-* feature files and must only be
 * defined once to avoid Cucumber duplicate step errors.
 *
 * Steps:
 *   - VS Code is launched with fixture {string}
 *   - the extension has finished parsing
 *   - I open the Review Panel
 *   - CodeLens is enabled
 *   - I capture evidence screenshot {string}
 *   - I select QuickPick item {string}
 *   - I type {string} in the InputBox
 *   - an InputBox appears
 *   - I press Escape to cancel
 *   - the document footnote for {word} contains {string}
 *   - the footnote status for {word} is still {string}
 *   - I position cursor inside {word} insertion {string}  (generic)
 *   - I position cursor inside {word} insertion            (no text)
 *   - the current reviewer identity is {string}
 *   - I set view mode to {string}
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeTracksWorld } from './world';
import { getOrCreateInstance } from './world';
import {
    launchWithJourneyFixture,
    executeCommandViaBridge,
    getDocumentText,
    setCursorPosition,
    selectQuickPickItem,
    typeInInputBox,
    dismissQuickInput,
    captureEvidence,
    updateSettingDirect,
    waitForChanges,
} from '../../journeys/playwrightHarness';

// ── Extend World with shared SL state ───────────────────────────────

declare module './world' {
    interface ChangeTracksWorld {
        slScenarioTag?: string;
        slReviewerIdentity?: string;
    }
}

// ── Helpers (exported for use in per-phase step files) ──────────────

/**
 * Find the 1-based line number of a line containing the given text.
 * Returns 0 if not found.
 */
export function findLineNumber(text: string, substring: string): number {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(substring)) {
            return i + 1;
        }
    }
    return 0;
}

/**
 * Extract the full footnote block for a change ID from document text.
 */
export function extractFootnoteBlock(text: string, changeId: string): string {
    const lines = text.split('\n');
    const headerPattern = `[^${changeId}]:`;
    const headerIdx = lines.findIndex(l => l.startsWith(headerPattern));
    if (headerIdx < 0) return '';

    let endIdx = headerIdx + 1;
    while (endIdx < lines.length) {
        const line = lines[endIdx];
        if (line.startsWith('[^') || (line.trim() === '' && endIdx > headerIdx + 1)) {
            break;
        }
        endIdx++;
    }
    return lines.slice(headerIdx, endIdx).join('\n');
}

/**
 * Extract the status field from a footnote header line.
 */
export function extractFootnoteStatusFromDoc(text: string, changeId: string): string {
    const lines = text.split('\n');
    const headerPattern = `[^${changeId}]:`;
    const headerLine = lines.find(l => l.startsWith(headerPattern));
    if (!headerLine) return '';
    const parts = headerLine.split('|');
    return parts.length >= 4 ? parts[3].trim() : '';
}

/**
 * Position cursor inside a change by finding text and using setCursorPosition.
 */
export async function positionCursorAtText(
    world: ChangeTracksWorld,
    searchText: string,
    column = 15
): Promise<void> {
    assert.ok(world.page, 'Page not available');
    const text = await getDocumentText(world.page, { instanceId: world.instance?.instanceId });
    const lineNum = findLineNumber(text, searchText);
    assert.ok(lineNum > 0, `Could not find line containing "${searchText}" in document`);
    await world.page.click('.monaco-editor .view-lines');
    await world.page.waitForTimeout(100);
    await setCursorPosition(world.page, lineNum, column);
    await world.page.waitForTimeout(300);
}

// ── Background steps ────────────────────────────────────────────────

Given(
    'VS Code is launched with fixture {string}',
    { timeout: 60000 },
    async function (this: ChangeTracksWorld, fixture: string) {
        this.fixtureFile = fixture;
        this.instance = await getOrCreateInstance(
            fixture,
            (name) => launchWithJourneyFixture(name)
        );
        this.page = this.instance.page;
    }
);

Given(
    'the extension has finished parsing',
    { timeout: 15000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available — launch VS Code first');
        const result = await waitForChanges(this.page);
        if (!result.ready) {
            console.warn('[SL] waitForChanges timed out — proceeding anyway');
        }
    }
);

Given(
    'I open the Review Panel',
    { timeout: 15000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        await executeCommandViaBridge(this.page, 'changetracks.openReviewPanel');
        await this.page.waitForTimeout(1500);
    }
);

Given(
    'CodeLens is enabled',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        await updateSettingDirect(this.page, 'changetracks.codeLensMode', 'always');
        await this.page.waitForTimeout(500);
    }
);

Given(
    'the current reviewer identity is {string}',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld, identity: string) {
        assert.ok(this.page, 'Page not available');
        this.slReviewerIdentity = identity;
        const cleanId = identity.replace(/^@/, '');
        await updateSettingDirect(this.page, 'changetracks.reviewerIdentity', cleanId);
        await this.page.waitForTimeout(300);
    }
);

// ── Cursor positioning (generic, parameterized) ─────────────────────

When(
    'I position cursor inside the {word} insertion {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, _changeId: string, textHint: string) {
        await positionCursorAtText(this, textHint);
    }
);

When(
    'I position cursor inside the {word} insertion',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        // Find the footnote reference to locate the change's line
        const refPattern = `[^${changeId}]`;
        const lineNum = findLineNumber(text, refPattern);
        assert.ok(lineNum > 0, `Could not find ${changeId} reference in document`);
        await this.page.click('.monaco-editor .view-lines');
        await this.page.waitForTimeout(100);
        await setCursorPosition(this.page, lineNum, 15);
        await this.page.waitForTimeout(300);
    }
);

When(
    'I position cursor inside the {word} substitution',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        const refPattern = `[^${changeId}]`;
        const lineNum = findLineNumber(text, refPattern);
        assert.ok(lineNum > 0, `Could not find ${changeId} reference in document`);
        await this.page.click('.monaco-editor .view-lines');
        await this.page.waitForTimeout(100);
        await setCursorPosition(this.page, lineNum, 15);
        await this.page.waitForTimeout(300);
    }
);

When(
    'I position cursor inside the {word} highlight',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        const refPattern = `[^${changeId}]`;
        const lineNum = findLineNumber(text, refPattern);
        assert.ok(lineNum > 0, `Could not find ${changeId} reference in document`);
        await this.page.click('.monaco-editor .view-lines');
        await this.page.waitForTimeout(100);
        await setCursorPosition(this.page, lineNum, 15);
        await this.page.waitForTimeout(300);
    }
);

// ── QuickPick / InputBox interaction ────────────────────────────────

When(
    'I select QuickPick item {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, label: string) {
        assert.ok(this.page, 'Page not available');
        await selectQuickPickItem(this.page, label);
        await this.page.waitForTimeout(500);
    }
);

When(
    'I type {string} in the InputBox',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, text: string) {
        assert.ok(this.page, 'Page not available');
        await typeInInputBox(this.page, text);
        await this.page.waitForTimeout(1000);
    }
);

Then(
    'an InputBox appears',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        await this.page.waitForSelector('.quick-input-widget[style*="display: flex"] input[type="text"]', { timeout: 8000 });
    }
);

When(
    'I press Escape to cancel',
    { timeout: 5000 },
    async function (this: ChangeTracksWorld) {
        assert.ok(this.page, 'Page not available');
        await dismissQuickInput(this.page);
        await this.page.waitForTimeout(500);
    }
);

// ── View mode ───────────────────────────────────────────────────────

When(
    'I set view mode to {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, mode: string) {
        assert.ok(this.page, 'Page not available');
        await updateSettingDirect(this.page, 'changetracks.viewMode', mode);
        await this.page.waitForTimeout(500);
    }
);

// ── Document footnote assertions ────────────────────────────────────

Then(
    'the document footnote for {word} contains {string}',
    { timeout: 15000 },
    async function (this: ChangeTracksWorld, changeId: string, expected: string) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let footnote = '';
        while (Date.now() < deadline) {
            const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
            footnote = extractFootnoteBlock(text, changeId);
            if (footnote.includes(expected)) return;
            await this.page!.waitForTimeout(300);
        }
        assert.ok(
            footnote.includes(expected),
            `Footnote for ${changeId} does not contain "${expected}".\nFootnote block:\n${footnote}`
        );
    }
);

Then(
    'the footnote status for {word} is still {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, changeId: string, expectedStatus: string) {
        assert.ok(this.page, 'Page not available');
        const text = await getDocumentText(this.page, { instanceId: this.instance?.instanceId });
        const actual = extractFootnoteStatusFromDoc(text, changeId);
        assert.strictEqual(
            actual,
            expectedStatus,
            `Expected footnote status for ${changeId} to be "${expectedStatus}", got "${actual}"`
        );
    }
);

// ── Evidence screenshots ────────────────────────────────────────────

Then(
    'I capture evidence screenshot {string}',
    { timeout: 10000 },
    async function (this: ChangeTracksWorld, stepName: string) {
        assert.ok(this.page, 'Page not available');
        await captureEvidence(this.page, 'SL', 'lifecycle', stepName);
    }
);
