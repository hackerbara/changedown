/**
 * @slow tier step definitions for SL-CL — CodeLens lifecycle indicators in running VS Code.
 *
 * Phase-specific steps only. Shared steps (launch, parsing, CodeLens enable,
 * view mode, screenshots) are in sl-shared.steps.ts.
 *
 * Fixture: packages/tests/vscode/fixtures/journeys/lifecycle-codelens.md
 */

import { Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeDownWorld } from './world';
import { getCodeLensItems } from '../../journeys/playwrightHarness';

// ── Helper ───────────────────────────────────────────────────────────

/**
 * Retrieve all CodeLens items associated with a specific change ID.
 * The bridge returns { line, title, command } per item.
 * Items reference change IDs in their title or command string.
 */
async function getCodeLensForChange(
    world: ChangeDownWorld,
    changeId: string
): Promise<Array<{ line: number; title: string; command: string }>> {
    assert.ok(world.page, 'Page not available');
    const { items } = await getCodeLensItems(world.page);
    return items.filter(
        item => item.title.includes(changeId) || item.command.includes(changeId)
    );
}

// ── Step definitions ─────────────────────────────────────────────────

Then(
    'the CodeLens for {word} shows {string}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string, expected: string) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let items: Array<{ line: number; title: string; command: string }> = [];
        while (Date.now() < deadline) {
            items = await getCodeLensForChange(this, changeId);
            if (items.some(item => item.title.includes(expected))) return;
            await this.page!.waitForTimeout(300);
        }
        const titles = items.map(i => i.title);
        assert.ok(
            titles.some(t => t.includes(expected)),
            `No CodeLens for ${changeId} contains "${expected}". Found titles: ${JSON.stringify(titles)}`
        );
    }
);

Then(
    'the CodeLens for {word} does not contain discussion indicator',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        // Allow a brief settle period then assert absence
        await this.page.waitForTimeout(500);
        const items = await getCodeLensForChange(this, changeId);
        const titles = items.map(i => i.title);
        const hasDiscussion = titles.some(t => t.includes('💬') || t.includes('replies') || t.includes('reply'));
        assert.ok(
            !hasDiscussion,
            `CodeLens for ${changeId} should not contain a discussion indicator. Found titles: ${JSON.stringify(titles)}`
        );
    }
);

Then(
    'the CodeLens for {word} contains discussion indicator',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let items: Array<{ line: number; title: string; command: string }> = [];
        while (Date.now() < deadline) {
            items = await getCodeLensForChange(this, changeId);
            const titles = items.map(i => i.title);
            if (titles.some(t => t.includes('💬') || t.includes('replies') || t.includes('reply'))) return;
            await this.page!.waitForTimeout(300);
        }
        const titles = items.map(i => i.title);
        assert.ok(
            false,
            `CodeLens for ${changeId} does not contain a discussion indicator. Found titles: ${JSON.stringify(titles)}`
        );
    }
);

Then(
    'the CodeLens for {word} shows reply count of {int}',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string, expectedCount: number) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let items: Array<{ line: number; title: string; command: string }> = [];
        while (Date.now() < deadline) {
            items = await getCodeLensForChange(this, changeId);
            const titles = items.map(i => i.title);
            if (titles.some(t => t.includes(`💬${expectedCount}`) || t.includes(`💬 ${expectedCount}`))) return;
            await this.page!.waitForTimeout(300);
        }
        const titles = items.map(i => i.title);
        assert.ok(
            false,
            `CodeLens for ${changeId} does not show reply count of ${expectedCount}. Found titles: ${JSON.stringify(titles)}`
        );
    }
);

Then(
    'the CodeLens for {word} contains request-changes indicator',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let items: Array<{ line: number; title: string; command: string }> = [];
        while (Date.now() < deadline) {
            items = await getCodeLensForChange(this, changeId);
            const titles = items.map(i => i.title);
            if (titles.some(t => t.includes('⚠') || t.includes('request-changes'))) return;
            await this.page!.waitForTimeout(300);
        }
        const titles = items.map(i => i.title);
        assert.ok(
            false,
            `CodeLens for ${changeId} does not contain a request-changes indicator. Found titles: ${JSON.stringify(titles)}`
        );
    }
);

Then(
    'the CodeLens for {word} contains amendment indicator',
    { timeout: 15000 },
    async function (this: ChangeDownWorld, changeId: string) {
        assert.ok(this.page, 'Page not available');
        const deadline = Date.now() + 8000;
        let items: Array<{ line: number; title: string; command: string }> = [];
        while (Date.now() < deadline) {
            items = await getCodeLensForChange(this, changeId);
            const titles = items.map(i => i.title);
            if (titles.some(t => t.includes('✎') || t.includes('amended') || t.includes('revised'))) return;
            await this.page!.waitForTimeout(300);
        }
        const titles = items.map(i => i.title);
        assert.ok(
            false,
            `CodeLens for ${changeId} does not contain an amendment indicator. Found titles: ${JSON.stringify(titles)}`
        );
    }
);

Then(
    'no CodeLens items exist for the document',
    { timeout: 15000 },
    async function (this: ChangeDownWorld) {
        assert.ok(this.page, 'Page not available');
        // Allow view mode change to propagate
        await this.page.waitForTimeout(800);
        const { count } = await getCodeLensItems(this.page);
        assert.strictEqual(
            count,
            0,
            `Expected 0 CodeLens items but found ${count}`
        );
    }
);

Then(
    'CodeLens items exist for {word}, {word}, {word}, {word}',
    { timeout: 15000 },
    async function (
        this: ChangeDownWorld,
        id1: string,
        id2: string,
        id3: string,
        id4: string
    ) {
        assert.ok(this.page, 'Page not available');
        const changeIds = [id1, id2, id3, id4];
        const deadline = Date.now() + 8000;
        let missing: string[] = [];
        while (Date.now() < deadline) {
            const { items } = await getCodeLensItems(this.page);
            missing = changeIds.filter(
                id => !items.some(item => item.title.includes(id) || item.command.includes(id))
            );
            if (missing.length === 0) return;
            await this.page!.waitForTimeout(300);
        }
        assert.ok(
            missing.length === 0,
            `CodeLens items missing for change IDs: ${missing.join(', ')}`
        );
    }
);
