/**
 * L3 tracking witness steps.
 *
 * These steps intentionally exercise the real VS Code extension host and
 * keyboard path. The target behavior is that once an L2 document has been
 * promoted to L3, subsequent tracked edits are serialized as footnote-native
 * L3 edit-op lines rather than inline L2 CriticMarkup in the body.
 */

import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Page } from 'playwright';
import { ChangeType, initHashline, parseForFormat } from '@changedown/core';
import { buildDecorationPlan, VIEW_PRESETS } from '@changedown/core/host';
import type { ChangeDownWorld } from './world';
import { executeCommandViaBridge, getDocumentText } from '../../journeys/playwrightHarness';

interface L3BaselineShape {
    textLength: number;
    bodyLength: number;
    maxTopLevelId: number;
    topLevelCount: number;
    l3EditOpCount: number;
}

interface TestChangeShape {
    id?: string;
    type?: string;
    status?: string;
    resolved?: boolean;
    anchored?: boolean;
    range?: { start: number; end: number };
    contentRange?: { start: number; end: number };
    resolutionPath?: string;
    deletionSeamOffset?: number;
}

type L3World = ChangeDownWorld & { complexL3Baseline?: L3BaselineShape };

const INLINE_DELIMITERS = ['{++', '{--', '{~~', '{==', '{>>'];
const L3_EDIT_OP_PATTERN = /^ {4}\d+:[0-9a-fA-F]{2,}\s+.*$/gm;

function docOpts(world: ChangeDownWorld): { expectedFilename?: string; instanceId?: string } {
    return {
        expectedFilename: world.fixtureFile,
        instanceId: world.instance?.instanceId,
    };
}

async function readActiveDocument(world: ChangeDownWorld): Promise<string> {
    assert.ok(world.page, 'Page not available');
    const text = await getDocumentText(world.page, docOpts(world));
    assert.ok(text.length > 0, 'getDocumentText returned empty');
    return text;
}

function splitBody(text: string): string {
    const footnoteStart = text.search(/^\[\^cn-\d+(?:\.\d+)?\]:/m);
    return footnoteStart >= 0 ? text.slice(0, footnoteStart) : text;
}

function topLevelChangeIds(text: string): number[] {
    const ids: number[] = [];
    const re = /^\[\^cn-(\d+)\]:/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        ids.push(Number(m[1]));
    }
    return ids;
}

function countL3EditOps(text: string): number {
    return (text.match(L3_EDIT_OP_PATTERN) ?? []).length;
}

function l3EditOpLines(text: string): string[] {
    return Array.from(text.matchAll(L3_EDIT_OP_PATTERN), m => m[0]);
}

function duplicateValues(values: number[]): number[] {
    const seen = new Set<number>();
    const duplicates = new Set<number>();
    for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return Array.from(duplicates).sort((a, b) => a - b);
}

function describeShape(text: string): {
    textLength: number;
    bodyLength: number;
    topLevelCount: number;
    maxTopLevelId: number;
    l3EditOpCount: number;
    inlineDelimiter?: string;
} {
    const body = splitBody(text);
    const ids = topLevelChangeIds(text);
    return {
        textLength: text.length,
        bodyLength: body.length,
        topLevelCount: ids.length,
        maxTopLevelId: ids.length > 0 ? Math.max(...ids) : 0,
        l3EditOpCount: countL3EditOps(text),
        inlineDelimiter: INLINE_DELIMITERS.find(delimiter => body.includes(delimiter)),
    };
}

function snippetAround(text: string, needle: string, radius = 180): string {
    const index = text.indexOf(needle);
    if (index < 0) return '';
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + needle.length + radius);
    return text.slice(start, end);
}

async function waitForPositionResult(page: Page, resultPath: string, description: string): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        try {
            if (fs.existsSync(resultPath)) {
                const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
                assert.ok(result.ok, `${description}: ${result.error ?? 'unknown error'}`);
                return;
            }
        } catch {
            // File may be mid-write; poll again.
        }
        await page.waitForTimeout(100);
    }
    assert.fail(`${description}: timed out waiting for bridge result`);
}

async function queryPanelState(world: ChangeDownWorld): Promise<Record<string, unknown>> {
    assert.ok(world.page, 'Page not available');
    const statePath = path.join(os.tmpdir(), 'changedown-test-state.json');
    try { fs.unlinkSync(statePath); } catch { /* ignore */ }
    await executeCommandViaBridge(world.page, 'changedown._testQueryPanelState');

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        try {
            if (fs.existsSync(statePath)) {
                return JSON.parse(fs.readFileSync(statePath, 'utf8'));
            }
        } catch {
            // File may be mid-write; poll again.
        }
        await world.page.waitForTimeout(100);
    }
    assert.fail('Timed out waiting for changedown._testQueryPanelState result');
}

function stableAnchorDigest(state: Record<string, unknown>): string {
    const changes = Array.isArray(state.changes) ? state.changes as TestChangeShape[] : [];
    return JSON.stringify(changes.map(c => ({
        id: c.id,
        type: c.type,
        status: c.status,
        resolved: c.resolved,
        anchored: c.anchored,
        range: c.range,
        contentRange: c.contentRange,
        resolutionPath: c.resolutionPath,
        deletionSeamOffset: c.deletionSeamOffset,
    })));
}

function summarizeAnchorState(state: Record<string, unknown>): string {
    const changes = Array.isArray(state.changes) ? state.changes as TestChangeShape[] : [];
    const unresolved = changes.filter(c => c.resolved === false);
    const examples = unresolved.slice(0, 8).map(c => {
        const r = c.range ? `${c.range.start}-${c.range.end}` : 'no-range';
        return `${c.id}:${c.type}:${r}:${c.resolutionPath ?? 'no-path'}`;
    }).join(', ');
    return `changeCount=${String(state.changeCount)}, unresolved=${unresolved.length}` +
        (examples ? `, unresolvedExamples=[${examples}]` : '');
}

async function positionCursor(
    world: ChangeDownWorld,
    input: { location: 'start' | 'end' } | { target: string; position: 'before' | 'after' }
): Promise<void> {
    assert.ok(world.page, 'Page not available');
    const inputPath = path.join(os.tmpdir(), 'changedown-test-position-cursor-input.json');
    const resultPath = path.join(os.tmpdir(), 'changedown-test-position-cursor.json');
    try { fs.unlinkSync(resultPath); } catch { /* ignore */ }
    fs.writeFileSync(inputPath, JSON.stringify(input));
    await executeCommandViaBridge(world.page, 'changedown._testPositionCursor');
    await waitForPositionResult(world.page, resultPath, `Failed to position cursor ${JSON.stringify(input)}`);
}

async function focusEditorTextarea(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await page.evaluate(`(() => {
        const textarea = document.querySelector('.monaco-editor textarea.inputarea');
        if (textarea) textarea.focus();
    })()`);
    await page.waitForTimeout(100);
}

When('I record the current complex L3 document shape', { timeout: 15000 }, async function (this: L3World) {
    const samples: Array<{ atMs: number; shape: ReturnType<typeof describeShape>; preview: string }> = [];
    const start = Date.now();
    let stableCleanSamples = 0;
    let text = '';
    let shape: ReturnType<typeof describeShape> | undefined;

    const deadline = start + 5000;
    while (Date.now() < deadline) {
        text = await readActiveDocument(this);
        shape = describeShape(text);
        samples.push({
            atMs: Date.now() - start,
            shape,
            preview: splitBody(text).slice(0, 220),
        });

        if (!shape.inlineDelimiter && shape.l3EditOpCount > 0) {
            stableCleanSamples += 1;
            if (stableCleanSamples >= 3) break;
        } else {
            stableCleanSamples = 0;
        }
        await this.page!.waitForTimeout(250);
    }

    assert.ok(shape, 'No document shape samples were collected');

    if (stableCleanSamples < 3 || shape.inlineDelimiter || shape.l3EditOpCount === 0) {
        console.log('  [L3T] unstable/non-L3 baseline samples:');
        for (const sample of samples.slice(-12)) {
            console.log(
                `  [L3T] sample +${sample.atMs}ms len=${sample.shape.textLength} body=${sample.shape.bodyLength} ` +
                `topLevel=${sample.shape.topLevelCount} maxCn=${sample.shape.maxTopLevelId} ` +
                `editOps=${sample.shape.l3EditOpCount} bodyInline=${sample.shape.inlineDelimiter ?? 'none'} ` +
                `preview=${JSON.stringify(sample.preview)}`
            );
        }
        assert.fail(
            `Baseline did not settle into stable L3: stableCleanSamples=${stableCleanSamples}, ` +
            `lastInline=${shape.inlineDelimiter ?? 'none'}, lastEditOps=${shape.l3EditOpCount}`
        );
    }

    this.complexL3Baseline = {
        textLength: shape.textLength,
        bodyLength: shape.bodyLength,
        maxTopLevelId: shape.maxTopLevelId,
        topLevelCount: shape.topLevelCount,
        l3EditOpCount: shape.l3EditOpCount,
    };

    console.log(
        `  [L3T] baseline stable: len=${shape.textLength}, body=${shape.bodyLength}, ` +
        `topLevel=${shape.topLevelCount}, maxCn=${shape.maxTopLevelId}, editOps=${shape.l3EditOpCount}`
    );
});

Then('the complex L3 parsed anchors have settled', { timeout: 20000 }, async function (this: L3World) {
    assert.ok(this.page, 'Page not available');

    const samples: Array<{ atMs: number; digest: string; state: Record<string, unknown> }> = [];
    const start = Date.now();
    let previousDigest = '';
    let stableSamples = 0;
    let lastState: Record<string, unknown> | undefined;

    const deadline = start + 12000;
    while (Date.now() < deadline) {
        const state = await queryPanelState(this);
        const digest = stableAnchorDigest(state);
        samples.push({ atMs: Date.now() - start, digest, state });
        lastState = state;

        if (digest === previousDigest) {
            stableSamples += 1;
        } else {
            stableSamples = 1;
            previousDigest = digest;
        }

        const changeCount = typeof state.changeCount === 'number' ? state.changeCount : 0;
        const unresolvedCount = typeof state.unresolvedCount === 'number' ? state.unresolvedCount : 0;
        // Require several spaced samples so we do not pass during the transient
        // “looks placed” phase before final anchor resolution settles.
        if (stableSamples >= 4 && changeCount > 0 && unresolvedCount === 0 && Date.now() - start >= 2500) {
            console.log(`  [L3T] anchor state settled: ${summarizeAnchorState(state)}`);
            return;
        }

        await this.page.waitForTimeout(750);
    }

    console.log('  [L3T] anchor-state samples did not settle cleanly:');
    for (const sample of samples.slice(-10)) {
        console.log(`  [L3T] sample +${sample.atMs}ms ${summarizeAnchorState(sample.state)}`);
    }
    assert.fail(
        'Complex L3 parsed anchors did not settle with zero unresolved changes. ' +
        (lastState ? summarizeAnchorState(lastState) : 'no state captured')
    );
});

Then('L3 deletion ghost refs are anchored at deletion seams', { timeout: 10000 }, async function (this: L3World) {
    await initHashline();
    const text = await readActiveDocument(this);
    const doc = parseForFormat(text);
    const changes = doc.getChanges();
    const plan = buildDecorationPlan(changes, text, VIEW_PRESETS.working, -1);
    const failures: string[] = [];

    for (const change of changes) {
        if (change.type !== ChangeType.Deletion || change.deletionSeamOffset === undefined) continue;

        const expectedOffset = change.range.start + change.deletionSeamOffset;
        const ghostRef = plan.ghostRefs.find(ref => ref.renderAfter?.contentText === `[^${change.id}]`);
        if (!ghostRef) {
            failures.push(`${change.id}: missing ghost ref`);
            continue;
        }
        if (ghostRef.range.start !== expectedOffset || ghostRef.range.end !== expectedOffset) {
            const context = text.slice(
                Math.max(0, change.range.start - 30),
                Math.min(text.length, change.range.end + 30),
            ).replace(/\s+/g, ' ');
            failures.push(
                `${change.id}: ghostRef=${ghostRef.range.start}-${ghostRef.range.end}, ` +
                `expected seam=${expectedOffset}, range=${change.range.start}-${change.range.end}, ` +
                `seamOffset=${change.deletionSeamOffset}, context=${JSON.stringify(context)}`,
            );
        }
    }

    if (failures.length > 0) {
        console.log(`  [L3T] deletion ghost-ref seam failures: ${failures.slice(0, 8).join(' | ')}`);
        assert.fail(`L3 deletion ghost refs are not seam-anchored:\n${failures.join('\n')}`);
    }

    console.log(
        `  [L3T] deletion ghost refs seam-anchored: ` +
        `${changes.filter(c => c.type === ChangeType.Deletion && c.deletionSeamOffset !== undefined).length} contextual deletions checked`,
    );
});

Then('the active complex L3 document reports tracking enabled', { timeout: 15000 }, async function (this: L3World) {
    const state = await queryPanelState(this);
    const text = await readActiveDocument(this);
    const body = splitBody(text);
    const inlineDelimiter = INLINE_DELIMITERS.find(delimiter => body.includes(delimiter));
    const ids = topLevelChangeIds(text);

    console.log(
        `  [L3T] panel state after load: trackingEnabled=${String(state.trackingEnabled)}, ` +
        `view=${String(state.view)}, changeCount=${String(state.changeCount)}, ` +
        `topLevel=${ids.length}, editOps=${countL3EditOps(text)}, bodyInline=${inlineDelimiter ?? 'none'}`
    );

    const failures: string[] = [];
    if (state.trackingEnabled !== true) {
        failures.push(`controller reports trackingEnabled=${String(state.trackingEnabled)} for a tracked L3 document`);
    }
    if (inlineDelimiter) {
        failures.push(`querying panel state left body with inline CriticMarkup delimiter ${JSON.stringify(inlineDelimiter)}`);
    }
    if (countL3EditOps(text) === 0) {
        failures.push('document has no L3 edit-op lines after querying panel state');
    }

    if (failures.length > 0) {
        console.log(`  [L3T] panel state raw: ${JSON.stringify(state)}`);
        console.log(`  [L3T] body preview: ${JSON.stringify(body.slice(0, 500))}`);
        assert.fail(failures.join('\n'));
    }
});

When('I insert {string} after {string}', { timeout: 15000 }, async function (
    this: ChangeDownWorld,
    insertedText: string,
    target: string
) {
    assert.ok(this.page, 'Page not available');
    await positionCursor(this, { target, position: 'after' });
    await focusEditorTextarea(this.page);
    await this.page.keyboard.type(insertedText, { delay: 30 });
    await this.page.waitForTimeout(300);

    const immediateText = await readActiveDocument(this);
    assert.ok(
        immediateText.includes(`${target}${insertedText}`) || immediateText.includes(insertedText),
        `Inserted text ${JSON.stringify(insertedText)} did not appear immediately after keyboard input`
    );
});

When('I force the pending ChangeDown edit to flush', { timeout: 12000 }, async function (this: ChangeDownWorld) {
    assert.ok(this.page, 'Page not available');

    // The harness default pause threshold is 2000ms. Wait for that boundary,
    // then move the cursor away to trigger any selection/cursor-boundary flushes.
    await this.page.waitForTimeout(2600);
    await positionCursor(this, { location: 'end' });
    await this.page.waitForTimeout(1200);
});

Then('the tracked edit for {string} stays L3 footnote-native', { timeout: 20000 }, async function (
    this: L3World,
    insertedText: string
) {
    assert.ok(this.page, 'Page not available');
    const baseline = this.complexL3Baseline;
    assert.ok(baseline, 'Missing complex L3 baseline; call the record step first');

    let finalText = '';
    let finalBody = '';
    let finalIds: number[] = [];
    let matchingEditOps: string[] = [];
    let bodyInlineDelimiter: string | undefined;
    let hasFreshTopLevelId = false;

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        finalText = await readActiveDocument(this);
        finalBody = splitBody(finalText);
        finalIds = topLevelChangeIds(finalText);
        matchingEditOps = l3EditOpLines(finalText).filter(line => line.includes(insertedText));
        bodyInlineDelimiter = INLINE_DELIMITERS.find(delimiter => finalBody.includes(delimiter));
        hasFreshTopLevelId = finalIds.some(id => id > baseline.maxTopLevelId);

        if (!bodyInlineDelimiter && matchingEditOps.length > 0 && hasFreshTopLevelId) {
            break;
        }
        await this.page.waitForTimeout(300);
    }

    const duplicateTopLevelIds = duplicateValues(finalIds);
    const failures: string[] = [];

    if (!finalText.includes(insertedText)) {
        failures.push(`document no longer contains inserted text ${JSON.stringify(insertedText)}`);
    }

    if (bodyInlineDelimiter) {
        failures.push(`document body contains inline L2 delimiter ${JSON.stringify(bodyInlineDelimiter)}`);
    }

    if (finalBody.includes(`{++${insertedText}++}`)) {
        failures.push(`inserted text was serialized as inline L2 insertion in the body: {++${insertedText}++}`);
    }

    if (matchingEditOps.length === 0) {
        failures.push(`no L3 edit-op line contains ${JSON.stringify(insertedText)}`);
    }

    if (!hasFreshTopLevelId) {
        failures.push(`no fresh top-level cn id above baseline max cn-${baseline.maxTopLevelId}`);
    }

    if (duplicateTopLevelIds.length > 0) {
        failures.push(`duplicate top-level cn ids present: ${duplicateTopLevelIds.map(id => `cn-${id}`).join(', ')}`);
    }

    if (failures.length > 0) {
        const insertedSnippet = snippetAround(finalText, insertedText);
        const delimiterSnippet = bodyInlineDelimiter ? snippetAround(finalBody, bodyInlineDelimiter) : '';
        console.log('  [L3T] failure diagnostics');
        console.log(`  [L3T] baseline maxCn=${baseline.maxTopLevelId}, topLevel=${baseline.topLevelCount}, editOps=${baseline.l3EditOpCount}`);
        console.log(
            `  [L3T] final len=${finalText.length}, body=${finalBody.length}, topLevel=${finalIds.length}, ` +
            `maxCn=${finalIds.length ? Math.max(...finalIds) : 0}, editOps=${countL3EditOps(finalText)}`
        );
        console.log(`  [L3T] matching edit-op lines: ${JSON.stringify(matchingEditOps.slice(0, 5))}`);
        console.log(`  [L3T] snippet around inserted text: ${JSON.stringify(insertedSnippet)}`);
        if (delimiterSnippet) {
            console.log(`  [L3T] snippet around first body delimiter: ${JSON.stringify(delimiterSnippet)}`);
        }
        assert.fail(failures.join('\n'));
    }
});
