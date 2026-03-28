/**
 * @fast tier step definitions for DOCX preview tests (DOCX2).
 *
 * These tests run in-process via cucumber-js (no VS Code launch).
 * buildAnnotationCards is a pure function with no vscode dependency.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser } from '@changedown/core';
import { buildAnnotationCards, renderMarkdownToHtml, buildLoadingHtml, buildErrorHtml, buildChoiceHtml, buildPreviewHtml } from 'changedown-vscode/internals';
import type { AnnotationCard, ImportStats } from 'changedown-vscode/internals';
import type { ChangeDownWorld } from './world';

// -- Extend World with DOCX preview test state ----------------------------

declare module './world' {
    interface ChangeDownWorld {
        docxPreviewSource?: string;
        annotationCards?: AnnotationCard[];
        docxPreviewMarkdown?: string;
        docxPreviewHtml?: string;
        docxFileName?: string;
        docxExistingMdName?: string;
        webviewHtml?: string;
        previewBodyHtml?: string;
        previewAnnotations?: AnnotationCard[];
        previewStats?: ImportStats;
    }
}

// -- Given steps ----------------------------------------------------------

Given('docx preview source text {string}', function (this: ChangeDownWorld, text: string) {
    this.docxPreviewSource = text;
});

// -- When steps -----------------------------------------------------------

When('I extract comment pairs', function (this: ChangeDownWorld) {
    assert.ok(this.docxPreviewSource !== undefined, 'No docx preview source text set');
    const parser = new CriticMarkupParser();
    const doc = parser.parse(this.docxPreviewSource!);
    this.annotationCards = buildAnnotationCards(doc.getChanges(), this.docxPreviewSource!);
});

// -- Then steps: count assertions -----------------------------------------

Then('there is {int} comment pair(s)', function (this: ChangeDownWorld, count: number) {
    assert.ok(this.annotationCards !== undefined, 'No annotation cards — run "I extract comment pairs" first');
    assert.strictEqual(
        this.annotationCards!.length,
        count,
        `Expected ${count} annotation card(s), got ${this.annotationCards!.length}`
    );
});

Then('there are {int} comment pair(s)', function (this: ChangeDownWorld, count: number) {
    assert.ok(this.annotationCards !== undefined, 'No annotation cards — run "I extract comment pairs" first');
    assert.strictEqual(
        this.annotationCards!.length,
        count,
        `Expected ${count} annotation card(s), got ${this.annotationCards!.length}`
    );
});

// -- Then steps: property assertions --------------------------------------

Then('comment pair {int} has highlightText {string}', function (this: ChangeDownWorld, index: number, expected: string) {
    assert.ok(this.annotationCards !== undefined, 'No annotation cards');
    const card = this.annotationCards![index];
    assert.ok(card, `Annotation card ${index} does not exist (have ${this.annotationCards!.length})`);
    assert.strictEqual(
        card.textPreview,
        expected,
        `Expected annotation card ${index} textPreview to be "${expected}", got "${card.textPreview}"`
    );
});

Then('comment pair {int} has commentText {string}', function (this: ChangeDownWorld, index: number, expected: string) {
    assert.ok(this.annotationCards !== undefined, 'No annotation cards');
    const card = this.annotationCards![index];
    assert.ok(card, `Annotation card ${index} does not exist (have ${this.annotationCards!.length})`);
    assert.strictEqual(
        card.commentText,
        expected,
        `Expected annotation card ${index} commentText to be "${expected}", got "${card.commentText}"`
    );
});

Then('comment pair {int} has no highlightText', function (this: ChangeDownWorld, index: number) {
    assert.ok(this.annotationCards !== undefined, 'No annotation cards');
    const card = this.annotationCards![index];
    assert.ok(card, `Annotation card ${index} does not exist (have ${this.annotationCards!.length})`);
    // Standalone comments have no highlight text — textPreview holds the comment content
    assert.strictEqual(
        card.type,
        'comment',
        `Expected annotation card ${index} to be a standalone comment (type 'comment'), got type "${card.type}"`
    );
});

Then('comment pair {int} has a pairId matching {string}', function (this: ChangeDownWorld, index: number, prefix: string) {
    assert.ok(this.annotationCards !== undefined, 'No annotation cards');
    const card = this.annotationCards![index];
    assert.ok(card, `Annotation card ${index} does not exist (have ${this.annotationCards!.length})`);
    assert.ok(
        card.pairId.startsWith(prefix),
        `Expected annotation card ${index} pairId to start with "${prefix}", got "${card.pairId}"`
    );
});

// -- Given steps: markdown preview ----------------------------------------

Given('docx preview markdown {string}', function (this: ChangeDownWorld, text: string) {
    this.docxPreviewMarkdown = text.replace(/\\n/g, '\n');
});

// -- When steps: markdown rendering ---------------------------------------

When('I render markdown to preview HTML', function (this: ChangeDownWorld) {
    assert.ok(this.docxPreviewMarkdown !== undefined, 'No markdown set');
    this.docxPreviewHtml = renderMarkdownToHtml(this.docxPreviewMarkdown!);
});

// -- Then steps: docx preview HTML assertions -----------------------------

Then('the docx preview HTML contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.docxPreviewHtml !== undefined, 'No preview HTML generated');
    assert.ok(this.docxPreviewHtml!.includes(expected),
        `Expected docx preview HTML to contain "${expected}" but got:\n${this.docxPreviewHtml}`);
});

// ── Webview HTML generation steps ────────────────────────────────────

Given('a docx file named {string}', function (this: ChangeDownWorld, name: string) {
    this.docxFileName = name;
});

Given('an existing markdown file {string}', function (this: ChangeDownWorld, name: string) {
    this.docxExistingMdName = name;
});

Given('a docx preview with body {string}', function (this: ChangeDownWorld, html: string) {
    this.previewBodyHtml = html;
    this.previewAnnotations = [];
    this.previewStats = { insertions: 0, deletions: 0, substitutions: 0, comments: 0, authors: [] };
});

Given('a comment pair with pairId {string} and text {string} by {string}', function (this: ChangeDownWorld, id: string, text: string, author: string) {
    if (!this.previewAnnotations) this.previewAnnotations = [];
    this.previewAnnotations.push({
        pairId: id,
        changeId: id,
        type: 'comment',
        author,
        status: 'proposed',
        textPreview: text,
        commentText: text,
        approvalCount: 0,
        rejectionCount: 0,
        hasDiscussion: false,
    });
});

Given('import stats of {int} insertions, {int} deletion, {int} substitutions by {string}', function (this: ChangeDownWorld, ins: number, del: number, sub: number, author: string) {
    this.previewStats = { insertions: ins, deletions: del, substitutions: sub, comments: this.previewAnnotations?.filter(a => a.type === 'comment').length ?? 0, authors: [author] };
});

When('I build loading HTML', function (this: ChangeDownWorld) {
    assert.ok(this.docxFileName, 'No docx file name set');
    this.webviewHtml = buildLoadingHtml(this.docxFileName!);
});

When('I build error HTML with message {string}', function (this: ChangeDownWorld, msg: string) {
    assert.ok(this.docxFileName, 'No docx file name set');
    this.webviewHtml = buildErrorHtml(this.docxFileName!, msg);
});

When('I build choice HTML', function (this: ChangeDownWorld) {
    assert.ok(this.docxFileName, 'No docx file name set');
    assert.ok(this.docxExistingMdName, 'No existing md name set');
    this.webviewHtml = buildChoiceHtml(this.docxFileName!, this.docxExistingMdName!);
});

When('I build preview HTML', function (this: ChangeDownWorld) {
    assert.ok(this.previewBodyHtml !== undefined, 'No preview body HTML set');
    this.webviewHtml = buildPreviewHtml({
        fileName: this.docxFileName ?? 'test.docx',
        bodyHtml: this.previewBodyHtml!,
        annotations: this.previewAnnotations ?? [],
        stats: this.previewStats ?? { insertions: 0, deletions: 0, substitutions: 0, comments: 0, authors: [] },
        currentViewMode: 'allMarkup',
    });
});

When('I build preview HTML with view mode {string}', function (this: ChangeDownWorld, viewMode: string) {
    assert.ok(this.previewBodyHtml !== undefined, 'No preview body HTML set');
    this.webviewHtml = buildPreviewHtml({
        fileName: this.docxFileName ?? 'test.docx',
        bodyHtml: this.previewBodyHtml!,
        annotations: this.previewAnnotations ?? [],
        stats: this.previewStats ?? { insertions: 0, deletions: 0, substitutions: 0, comments: 0, authors: [] },
        currentViewMode: viewMode,
    });
});

When('I render markdown to preview HTML in {string} mode', function (this: ChangeDownWorld, viewMode: string) {
    assert.ok(this.docxPreviewMarkdown !== undefined, 'No markdown set');
    this.docxPreviewHtml = renderMarkdownToHtml(this.docxPreviewMarkdown!, false, viewMode);
});

Then('the webview HTML contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.webviewHtml !== undefined, 'No webview HTML generated');
    assert.ok(this.webviewHtml!.includes(expected),
        `Expected webview HTML to contain "${expected}" but got:\n${this.webviewHtml!.substring(0, 500)}...`);
});

Then('the docx preview HTML does not contain {string}', function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(this.docxPreviewHtml !== undefined, 'No preview HTML generated');
    assert.ok(!this.docxPreviewHtml!.includes(unexpected),
        `Expected docx preview HTML NOT to contain "${unexpected}" but it was found in:\n${this.docxPreviewHtml!.substring(0, 500)}...`);
});
