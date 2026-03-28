/**
 * @fast tier step definitions for preview rendering tests (PRV1).
 *
 * These tests run in-process via cucumber-js (no VS Code launch).
 * buildReplacements, findFenceZones, containsCriticMarkup, and
 * renderFenceWithCriticMarkup are pure functions with no vscode dependency.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser } from '@changedown/core';
import { buildReplacements, findFenceZones, containsCriticMarkup, renderFenceWithCriticMarkup } from 'changedown-vscode/internals';
import type { PreviewOptions } from 'changedown-vscode/internals';
import type { ChangeDownWorld } from './world';

// ── Extend World with preview test state ─────────────────────────────

declare module './world' {
    interface ChangeDownWorld {
        previewSourceText?: string;
        previewOptions?: PreviewOptions;
        previewResult?: string;
        fenceZones?: Array<{ start: number; end: number; lang: string }>;
        codeText?: string;
        fenceLanguage?: string;
        fenceResult?: string;
    }
}

// ── Default options ──────────────────────────────────────────────────

const defaultOpts: PreviewOptions = {
    showFootnotes: true,
    showComments: true,
    metadataDetail: 'badge',
};

// ── Given steps ──────────────────────────────────────────────────────

Given('preview source text {string}', function (this: ChangeDownWorld, text: string) {
    this.previewSourceText = text;
    this.previewOptions = { ...defaultOpts };
});

Given('preview source text:', function (this: ChangeDownWorld, docString: string) {
    this.previewSourceText = docString;
    this.previewOptions = { ...defaultOpts };
});

Given('preview option showComments is false', function (this: ChangeDownWorld) {
    if (!this.previewOptions) this.previewOptions = { ...defaultOpts };
    this.previewOptions.showComments = false;
});

Given('preview option metadataDetail is {string}', function (this: ChangeDownWorld, detail: string) {
    if (!this.previewOptions) this.previewOptions = { ...defaultOpts };
    this.previewOptions.metadataDetail = detail as 'badge' | 'summary' | 'projected';
});

Given('preview option authorColors is {string}', function (this: ChangeDownWorld, mode: string) {
    if (!this.previewOptions) this.previewOptions = { ...defaultOpts };
    this.previewOptions.authorColors = mode as 'auto' | 'always' | 'never';
});

Given('code text {string}', function (this: ChangeDownWorld, text: string) {
    this.codeText = text;
});

Given('fence language {string}', function (this: ChangeDownWorld, lang: string) {
    this.fenceLanguage = lang;
});

// ── When steps ───────────────────────────────────────────────────────

When('I build preview replacements', function (this: ChangeDownWorld) {
    assert.ok(this.previewSourceText !== undefined, 'No preview source text set');
    const parser = new CriticMarkupParser();
    const doc = parser.parse(this.previewSourceText!);
    this.previewResult = buildReplacements(
        this.previewSourceText!,
        doc.getChanges(),
        this.previewOptions ?? defaultOpts
    );
});

When('I find fence zones', function (this: ChangeDownWorld) {
    assert.ok(this.previewSourceText !== undefined, 'No preview source text set');
    this.fenceZones = findFenceZones(this.previewSourceText!);
});

When('I render the fence with CriticMarkup', function (this: ChangeDownWorld) {
    assert.ok(this.codeText !== undefined, 'No code text set');
    this.fenceResult = renderFenceWithCriticMarkup(
        this.codeText!,
        this.fenceLanguage ?? ''
    );
});

// ── Then steps: preview HTML assertions ──────────────────────────────

Then('the preview HTML contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.previewResult !== undefined, 'No preview result — run "I build preview replacements" first');
    assert.ok(
        this.previewResult!.includes(expected),
        `Expected preview HTML to contain "${expected}" but it does not.\nActual (first 500 chars): ${this.previewResult!.substring(0, 500)}`
    );
});

Then('the preview HTML does not contain {string}', function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(this.previewResult !== undefined, 'No preview result');
    assert.ok(
        !this.previewResult!.includes(unexpected),
        `Expected preview HTML to NOT contain "${unexpected}" but it does.\nActual (first 500 chars): ${this.previewResult!.substring(0, 500)}`
    );
});

Then('the preview HTML starts with {string}', function (this: ChangeDownWorld, prefix: string) {
    assert.ok(this.previewResult !== undefined, 'No preview result');
    assert.ok(
        this.previewResult!.startsWith(prefix),
        `Expected preview HTML to start with "${prefix}" but starts with "${this.previewResult!.substring(0, 50)}"`
    );
});

Then('the preview HTML ends with {string}', function (this: ChangeDownWorld, suffix: string) {
    assert.ok(this.previewResult !== undefined, 'No preview result');
    assert.ok(
        this.previewResult!.endsWith(suffix),
        `Expected preview HTML to end with "${suffix}" but ends with "${this.previewResult!.substring(this.previewResult!.length - 50)}"`
    );
});

Then('the preview HTML contains {string} or {string}', function (this: ChangeDownWorld, option1: string, option2: string) {
    assert.ok(this.previewResult !== undefined, 'No preview result');
    assert.ok(
        this.previewResult!.includes(option1) || this.previewResult!.includes(option2),
        `Expected preview HTML to contain "${option1}" or "${option2}" but contains neither.\nActual (first 500 chars): ${this.previewResult!.substring(0, 500)}`
    );
});

// ── Then steps: fence zone assertions ────────────────────────────────

Then('{int} fence zone(s) is/are found', function (this: ChangeDownWorld, count: number) {
    assert.ok(this.fenceZones !== undefined, 'No fence zones — run "I find fence zones" first');
    assert.strictEqual(
        this.fenceZones!.length,
        count,
        `Expected ${count} fence zone(s), got ${this.fenceZones!.length}`
    );
});

Then('fence zone {int} starts at or before the first code fence', function (this: ChangeDownWorld, index: number) {
    assert.ok(this.fenceZones !== undefined, 'No fence zones');
    assert.ok(this.previewSourceText !== undefined, 'No preview source text');
    const zone = this.fenceZones![index - 1];
    assert.ok(zone, `Fence zone ${index} does not exist`);
    const firstFencePos = this.previewSourceText!.indexOf('```');
    assert.ok(
        zone.start <= firstFencePos,
        `Fence zone ${index} start (${zone.start}) should be <= first fence position (${firstFencePos})`
    );
});

Then('fence zone {int} ends at or after the last code fence', function (this: ChangeDownWorld, index: number) {
    assert.ok(this.fenceZones !== undefined, 'No fence zones');
    assert.ok(this.previewSourceText !== undefined, 'No preview source text');
    const zone = this.fenceZones![index - 1];
    assert.ok(zone, `Fence zone ${index} does not exist`);
    const lastFencePos = this.previewSourceText!.lastIndexOf('```') + 3;
    assert.ok(
        zone.end >= lastFencePos,
        `Fence zone ${index} end (${zone.end}) should be >= last fence end position (${lastFencePos})`
    );
});

// ── Then steps: per-author color assertions ──────────────────────────

Then('the preview HTML has at least {int} distinct author color styles', function (this: ChangeDownWorld, minCount: number) {
    assert.ok(this.previewResult !== undefined, 'No preview result');
    const styleMatches = this.previewResult!.match(/style="color:\s*[^"]+"/g) ?? [];
    const colors = new Set(styleMatches);
    assert.ok(
        colors.size >= minCount,
        `Expected ${minCount}+ distinct author colors, got ${colors.size}. Found: ${[...colors].join(', ')}`
    );
});

Then('the preview HTML <del> tags do not have per-author color', function (this: ChangeDownWorld) {
    assert.ok(this.previewResult !== undefined, 'No preview result');
    const delMatch = this.previewResult!.match(/<del class="cn-del[^"]*"[^>]*>/);
    assert.ok(delMatch, 'Expected a <del> tag in the output');
    assert.ok(
        !delMatch![0].includes('style="color:'),
        `Deletion tag should not have per-author color, but found: ${delMatch![0]}`
    );
});

// ── Then steps: containsCriticMarkup assertions ──────────────────────

Then('containsCriticMarkup returns true', function (this: ChangeDownWorld) {
    assert.ok(this.codeText !== undefined, 'No code text set');
    assert.ok(containsCriticMarkup(this.codeText!), `Expected containsCriticMarkup("${this.codeText}") to return true`);
});

Then('containsCriticMarkup returns false', function (this: ChangeDownWorld) {
    assert.ok(this.codeText !== undefined, 'No code text set');
    assert.ok(!containsCriticMarkup(this.codeText!), `Expected containsCriticMarkup("${this.codeText}") to return false`);
});

// ── Then steps: fence rendering assertions ───────────────────────────

Then('the fence HTML contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.fenceResult !== undefined, 'No fence result — run "I render the fence with CriticMarkup" first');
    assert.ok(
        this.fenceResult!.includes(expected),
        `Expected fence HTML to contain "${expected}" but it does not.\nActual: ${this.fenceResult}`
    );
});
