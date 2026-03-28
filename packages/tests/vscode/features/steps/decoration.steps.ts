import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import type { ChangeDownWorld } from './world';
import {
    executeCommandViaBridge,
    setCursorPosition,
    getDecorationCounts,
    getDocumentText,
} from '../../journeys/playwrightHarness';
import { resolveViewName, VIEW_NAMES } from '@changedown/core';
import type { ViewName } from '@changedown/core';

// Note: getEditorText uses textContent (includes CSS-hidden text).
// For assertions that need to respect display:none, use hasHiddenSpans
// or getVisibleEditorText instead.

import type { Page } from 'playwright';

// ── View mode steps ──────────────────────────────────────────────────

/** Canonical view names for cycling. Delegates to core's VIEW_NAMES. */
export const VIEW_MODE_ORDER: readonly ViewName[] = VIEW_NAMES;

/**
 * Track the current view mode per shared VS Code instance.
 * Key = fixture tag (or 'default'), value = current mode.
 * Needed because scenarios sharing an instance (launch batching)
 * don't reset view mode between them, but each Cucumber World
 * is fresh.
 */
export const instanceViewMode = new Map<string, string>();

export function getInstanceKey(world: ChangeDownWorld): string {
    return world.fixtureFile ?? 'default';
}

// Note: instanceViewMode must NOT be cleared per scenario — the VS Code
// instance retains its actual view mode between scenarios. Clearing the map
// makes the test assume 'review' as the starting mode, but the VS Code
// instance is in whatever mode the previous scenario left it in, causing
// the toggle count calculation to be wrong.

When('I switch to {string} view mode', { timeout: 20000 }, async function (this: ChangeDownWorld, viewMode: string) {
    assert.ok(this.page, 'Page not available');
    const canonical = resolveViewName(viewMode);
    assert.ok(
        canonical !== undefined,
        `Unknown view mode: "${viewMode}". Pass a canonical name (${VIEW_MODE_ORDER.join(', ')}) or alias (all-markup, simple, final, original).`
    );

    const key = getInstanceKey(this);
    const currentMode = instanceViewMode.get(key) ?? 'review'; // default is review (first canonical name)

    if (currentMode === canonical) {
        // Already in the target mode — nothing to do
        this.currentViewMode = canonical;
        return;
    }

    // Calculate how many toggles to get from current → target
    const currentIdx = VIEW_MODE_ORDER.indexOf(currentMode as ViewName);
    const targetIdx = VIEW_MODE_ORDER.indexOf(canonical);
    const toggles = (targetIdx - currentIdx + VIEW_MODE_ORDER.length) % VIEW_MODE_ORDER.length;

    for (let i = 0; i < toggles; i++) {
        await executeCommandViaBridge(this.page, 'ChangeDown: Toggle Smart View');
        await this.page.waitForTimeout(600);
    }

    instanceViewMode.set(key, canonical);
    this.currentViewMode = canonical;
    await this.page.waitForTimeout(500);
});

// ── Cursor positioning relative to changes ───────────────────────────

/**
 * Map change type names to their opening CriticMarkup delimiters.
 * Used to dynamically locate the change in the document text.
 */
const CHANGE_DELIMITERS: Record<string, string> = {
    insertion: '{++',
    deletion: '{--',
    substitution: '{~~',
    highlight: '{==',
    comment: '{>>',
};

/**
 * Find the 0-based line and column that is inside the first occurrence
 * of the given delimiter in the document text. Returns a position
 * 3 characters past the delimiter start (inside the content).
 */
function findChangePosition(text: string, delimiter: string): [number, number] | null {
    const idx = text.indexOf(delimiter);
    if (idx === -1) return null;

    // Target offset: 3 chars past the delimiter start puts cursor inside the content
    // (all CriticMarkup opening delimiters are 3 chars: {++, {--, {~~, {==, {>>)
    const targetOffset = idx + 3;

    let line = 0;
    let col = 0;
    for (let i = 0; i < targetOffset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            col = 0;
        } else {
            col++;
        }
    }
    return [line, col];
}

When('I move the cursor {word} the {word} change', { timeout: 10000 }, async function (
    this: ChangeDownWorld, position: string, changeType: string
) {
    assert.ok(this.page, 'Page not available');

    if (position === 'outside') {
        // Move cursor to line 0, column 0 (before any changes)
        await setCursorPosition(this.page, 0, 0);
    } else if (position === 'inside') {
        const delimiter = CHANGE_DELIMITERS[changeType];
        assert.ok(delimiter, `Unknown change type for cursor positioning: "${changeType}"`);

        // Read the document text dynamically to find the change position
        const opts = { expectedFilename: this.fixtureFile, instanceId: this.instance?.instanceId };
        const doc = await getDocumentText(this.page, opts);
        assert.ok(doc.length > 0, 'getDocumentText returned empty — cannot locate change position');

        const pos = findChangePosition(doc, delimiter);
        assert.ok(pos, `Could not find ${changeType} delimiter "${delimiter}" in document text`);

        await setCursorPosition(this.page, pos[0], pos[1]);
    }
    await this.page.waitForTimeout(500);
});

// ── Helper: detect display:none decorations via computed style ───────

/**
 * Check if any spans in the editor have computed display:none.
 * VS Code's decoration CSS injection uses class-based styles, not
 * inline styles, so we must check getComputedStyle.
 */
async function hasHiddenSpans(page: Page): Promise<boolean> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        const result = await page.evaluate(`(() => {
            var viewLines = document.querySelector('.monaco-editor .view-lines');
            if (!viewLines) return false;
            var spans = viewLines.querySelectorAll('span');
            for (var i = 0; i < spans.length; i++) {
                var cs = getComputedStyle(spans[i]);
                if (cs.display === 'none') return true;
            }
            return false;
        })()`).catch(() => false);
        if (result) return true;
        await page.waitForTimeout(200);
    }
    return false;
}

/**
 * Get the visible text in the editor (respects CSS display:none).
 * Walks visible leaf spans, skipping display:none elements.
 * Normalizes U+00A0 (non-breaking space) to regular space — Monaco
 * renders all spaces as NBSP in DOM textContent to prevent browser
 * whitespace collapsing.
 * Polls with a deadline for Monaco decoration re-render settling.
 */
async function getVisibleEditorText(page: Page): Promise<string> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        const result = await page.evaluate(`(() => {
            var el = document.querySelector('.monaco-editor .view-lines');
            if (!el) return '';
            var lines = el.querySelectorAll('.view-line');
            var parts = [];
            for (var i = 0; i < lines.length; i++) {
                var spans = lines[i].querySelectorAll('span');
                var lineText = '';
                for (var j = 0; j < spans.length; j++) {
                    var cs = getComputedStyle(spans[j]);
                    if (cs.display !== 'none' && spans[j].children.length === 0) {
                        lineText += spans[j].textContent;
                    }
                }
                if (lineText.length > 0) parts.push(lineText);
            }
            return parts.join('\\n').replace(/\\u00a0/g, ' ');
        })()`).catch(() => '');
        const text = result as string;
        if (text.trim().length > 0) return text;
        await page.waitForTimeout(200);
    }
    return '';
}

// ── Decoration assertions ────────────────────────────────────────────

Then('decorations are visible on the {word} change', { timeout: 5000 }, async function (
    this: ChangeDownWorld, changeType: string
) {
    assert.ok(this.page, 'Page not available');
    const deco = await getDecorationCounts(this.page);
    assert.ok(deco.total > 0, `No decorations found for ${changeType} change`);
});

Then('strikethrough is applied', { timeout: 5000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const deco = await getDecorationCounts(this.page);
    assert.ok(deco.withStrikethrough > 0, 'No strikethrough decorations found');
});

Then('delimiters are hidden via display:none', { timeout: 20000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    // Wait for decoration batches to settle after view mode switch
    await this.page.waitForTimeout(1000);
    const hidden = await hasHiddenSpans(this.page);
    assert.ok(hidden, 'No hidden (display:none) decorations found');
});

Then('delimiters are visible', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const hidden = await hasHiddenSpans(this.page);
    // In all-markup mode, delimiters should NOT be hidden
    assert.ok(!hidden, 'Delimiters are hidden but should be visible in all-markup mode');
});

Then('no hidden decorations exist', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    const hidden = await hasHiddenSpans(this.page);
    assert.ok(!hidden, 'Unexpected hidden decorations found');
});

Then('the text {string} is visible in the editor', { timeout: 10000 }, async function (
    this: ChangeDownWorld, text: string
) {
    assert.ok(this.page, 'Page not available');
    const visibleText = await getVisibleEditorText(this.page);
    assert.ok(visibleText.includes(text), `Text "${text}" not visible in editor. Got: "${visibleText.substring(0, 200)}..."`);
});

Then('the text {string} is not visible in the editor', { timeout: 10000 }, async function (
    this: ChangeDownWorld, text: string
) {
    assert.ok(this.page, 'Page not available');
    const visibleText = await getVisibleEditorText(this.page);
    assert.ok(!visibleText.includes(text), `Text "${text}" is visible in editor but should be hidden`);
});

/**
 * Composite baseline assertion. The baseline name encodes:
 *   {changeType}-{viewMode}-{cursorState}
 *
 * Each baseline defines what decorations, visibility, and CSS
 * properties are expected.
 */
Then('the {word} decoration in {word} with cursor {word} matches the baseline', { timeout: 10000 },
    async function (this: ChangeDownWorld, changeType: string, viewMode: string, cursorState: string) {
        assert.ok(this.page, 'Page not available');
        const baselineName = `${changeType}-${viewMode}-${cursorState}`;
        const assertFn = DECORATION_BASELINES[baselineName];
        assert.ok(assertFn, `No baseline defined for "${baselineName}". Add it to DECORATION_BASELINES.`);
        await assertFn(this.page);
    }
);

// ── Baseline definitions ─────────────────────────────────────────────
// Each baseline is a function that asserts the expected decoration state.
// These are the canonical "what correct looks like" reference.

type BaselineAssertion = (page: Page) => Promise<void>;

const DECORATION_BASELINES: Record<string, BaselineAssertion> = {
    // ── Insertions ─────────────────────────────────────────────────
    'insertion-all-markup-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Insertion should have decorations in all-markup');
        const hidden = await hasHiddenSpans(page);
        assert.ok(!hidden, 'No delimiters should be hidden in all-markup');
    },
    'insertion-all-markup-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Insertion should have decorations when cursor inside');
        const hidden = await hasHiddenSpans(page);
        assert.ok(!hidden, 'Delimiters should still be visible when cursor inside in all-markup');
    },
    'insertion-simple-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Insertion should have content decorations in simple');
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Delimiters should be hidden in simple view');
        // Content check: delimiters hidden, inserted text visible
        const visibleText = await getVisibleEditorText(page);
        assert.ok(!visibleText.includes('{++'), 'Insertion delimiter {++ should be hidden in simple view');
        assert.ok(!visibleText.includes('++}'), 'Insertion delimiter ++} should be hidden in simple view');
        assert.ok(visibleText.includes('inserted phrase'), `Inserted text "inserted phrase" should be visible in simple view. visibleText(first 200)=${JSON.stringify(visibleText.substring(0, 200))}`);
    },
    'insertion-simple-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Insertion should have decorations when cursor inside');
    },
    'insertion-final-outside': async (page: Page) => {
        // Final view hides delimiters + deletion content via display:none CSS class.
        // Verify hidden spans exist (same mechanism as simple view).
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Final view should have hidden spans (delimiters hidden)');
        // Content check: delimiters hidden, inserted text visible (final = accepted, insertions stay)
        const visibleText = await getVisibleEditorText(page);
        assert.ok(!visibleText.includes('{++'), 'Insertion delimiter {++ should be hidden in final view');
        assert.ok(!visibleText.includes('++}'), 'Insertion delimiter ++} should be hidden in final view');
        assert.ok(visibleText.includes('inserted phrase'), `Inserted text "inserted phrase" should be visible in final view. visibleText(first 300)=${JSON.stringify(visibleText.substring(0, 300))}`);
    },
    'insertion-original-outside': async (page: Page) => {
        // Original view hides entire insertion (it didn't exist originally).
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Original view should have hidden spans (insertions hidden)');
    },

    // ── Deletions ──────────────────────────────────────────────────
    'deletion-all-markup-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Deletion should have decorations in all-markup');
        assert.ok(deco.withStrikethrough > 0, 'Deletion should have strikethrough in all-markup');
        const hidden = await hasHiddenSpans(page);
        assert.ok(!hidden, 'No delimiters hidden in all-markup');
    },
    'deletion-all-markup-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Deletion should have decorations');
        assert.ok(deco.withStrikethrough > 0, 'Deletion should have strikethrough');
    },
    'deletion-simple-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Deletion should have content decorations');
        assert.ok(deco.withStrikethrough > 0, 'Deletion should have strikethrough in simple');
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Delimiters should be hidden in simple view');
        // Content check: delimiters hidden, deleted text visible (simple shows all content with strikethrough)
        const visibleText = await getVisibleEditorText(page);
        assert.ok(!visibleText.includes('{--'), 'Deletion delimiter {-- should be hidden in simple view');
        assert.ok(!visibleText.includes('--}'), 'Deletion delimiter --} should be hidden in simple view');
        assert.ok(visibleText.includes('deleted phrase'), `Deleted text "deleted phrase" should be visible (with strikethrough) in simple view. visibleText(first 300)=${JSON.stringify(visibleText.substring(0, 300))}`);
    },
    'deletion-simple-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Deletion should have decorations when cursor inside');
    },
    'deletion-final-outside': async (page: Page) => {
        // Final view hides entire deletion (accepted = removed).
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Final view should have hidden spans (deletions hidden)');
        // Content check: delimiters hidden, deleted text also hidden (final = accepted, deletions removed)
        const visibleText = await getVisibleEditorText(page);
        assert.ok(!visibleText.includes('{--'), 'Deletion delimiter {-- should be hidden in final view');
        assert.ok(!visibleText.includes('--}'), 'Deletion delimiter --} should be hidden in final view');
        assert.ok(!visibleText.includes('deleted phrase'), 'Deleted text "deleted phrase" should be hidden in final view (accepted = removed)');
    },
    'deletion-original-outside': async (page: Page) => {
        // Original view shows deletion content, hides delimiters.
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Original view should have hidden spans (delimiters hidden)');
    },

    // ── Substitutions ──────────────────────────────────────────────
    'substitution-all-markup-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Substitution should have decorations');
        assert.ok(deco.withStrikethrough > 0, 'Substitution old text should have strikethrough');
    },
    'substitution-all-markup-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Substitution should have decorations');
    },
    'substitution-simple-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Substitution should have decorations in simple');
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Delimiters should be hidden in simple view');
        // Content check: delimiters hidden, both old and new text visible
        const visibleText = await getVisibleEditorText(page);
        assert.ok(!visibleText.includes('{~~'), 'Substitution delimiter {~~ should be hidden in simple view');
        assert.ok(!visibleText.includes('~>'), 'Substitution separator ~> should be hidden in simple view');
        assert.ok(!visibleText.includes('~~}'), 'Substitution delimiter ~~} should be hidden in simple view');
        assert.ok(visibleText.includes('old phrase'), `Old text "old phrase" should be visible in simple view. visibleText(first 300)=${JSON.stringify(visibleText.substring(0, 300))}`);
        assert.ok(visibleText.includes('new phrase'), `New text "new phrase" should be visible in simple view. visibleText(first 300)=${JSON.stringify(visibleText.substring(0, 300))}`);
    },
    'substitution-simple-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Substitution should have decorations');
    },
    'substitution-final-outside': async (page: Page) => {
        // Final view hides old text + delimiters + separator, shows new text.
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Final view should have hidden spans (old text + delimiters hidden)');
    },
    'substitution-original-outside': async (page: Page) => {
        // Original view shows old text, hides separator + new text + delimiters.
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Original view should have hidden spans (new text + delimiters hidden)');
    },

    // ── Highlights ─────────────────────────────────────────────────
    'highlight-all-markup-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Highlight should have decorations');
    },
    'highlight-all-markup-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Highlight should have decorations');
    },
    'highlight-simple-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Highlight should have decorations in simple');
        const hidden = await hasHiddenSpans(page);
        assert.ok(hidden, 'Highlight delimiters should be hidden in simple');
        // Content check: delimiters hidden, highlighted text visible
        const visibleText = await getVisibleEditorText(page);
        assert.ok(!visibleText.includes('{=='), 'Highlight delimiter {== should be hidden in simple view');
        assert.ok(!visibleText.includes('==}'), 'Highlight delimiter ==} should be hidden in simple view');
        assert.ok(visibleText.includes('highlighted phrase'), `Highlighted text "highlighted phrase" should be visible in simple view. visibleText(first 300)=${JSON.stringify(visibleText.substring(0, 300))}`);
    },
    'highlight-simple-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Highlight should have decorations');
    },

    // ── Comments ───────────────────────────────────────────────────
    'comment-all-markup-outside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Comment should have decorations');
    },
    'comment-all-markup-inside': async (page: Page) => {
        const deco = await getDecorationCounts(page);
        assert.ok(deco.total > 0, 'Comment should have decorations');
    },
};

// ── Color decoration assertions for author-leak regression ──────────

/**
 * Count spans in the editor that have computed color matching known
 * change colors (insertion green, deletion red, move purple, author palette).
 * Returns the count of such colored spans.
 */
async function countColoredTextSpans(page: Page): Promise<number> {
    const count = await page.evaluate(`(() => {
        var viewLines = document.querySelector('.monaco-editor .view-lines');
        if (!viewLines) return 0;
        var spans = viewLines.querySelectorAll('span');
        var colorSet = new Set([
            // Insertion colors
            'rgb(30, 130, 76)', 'rgb(102, 187, 106)',
            // Deletion colors
            'rgb(192, 57, 43)', 'rgb(239, 83, 80)',
            // Move colors
            'rgb(142, 68, 173)', 'rgb(206, 147, 216)',
            // Author palette
            'rgb(230, 126, 34)', 'rgb(255, 183, 77)',
            'rgb(22, 160, 133)', 'rgb(77, 182, 172)',
            'rgb(41, 128, 185)', 'rgb(100, 181, 246)',
        ]);
        var count = 0;
        for (var i = 0; i < spans.length; i++) {
            var cs = getComputedStyle(spans[i]);
            if (colorSet.has(cs.color)) count++;
        }
        return count;
    })()`).catch(() => 0);
    return count as number;
}

Then('decorations include colored spans for change types', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    // Allow brief settling
    await this.page.waitForTimeout(500);
    const count = await countColoredTextSpans(this.page);
    assert.ok(count > 0, `Expected colored decoration spans in editor, found ${count}`);
});

Then('no colored text decorations remain', { timeout: 10000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');
    // Allow brief settling after view mode switch
    await this.page.waitForTimeout(500);
    const count = await countColoredTextSpans(this.page);
    assert.strictEqual(count, 0, `Expected 0 colored decoration spans in final/original mode, found ${count}`);
});
