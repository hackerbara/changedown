/**
 * @fast tier step definitions for decoration tests (D3–D6).
 *
 * These tests run in-process via cucumber-js (no VS Code launch).
 * A vscode mock is installed before importing EditorDecorator/SpyEditor
 * so that `require('vscode')` resolves to lightweight stubs.
 */

// ── MUST be first: install vscode mock before any vscode-dependent imports ──
import { installVscodeMock, resetDecorationTypeCounter } from './vscode-mock';
installVscodeMock();

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser, ChangeType, VirtualDocument } from '@changedown/core';
import type { ChangeNode } from '@changedown/core';
import { EditorDecorator } from 'changedown-vscode/internals';
import { SpyEditor, RecordedDecoration } from '../../helpers/SpyEditor';
import type { ChangeDownWorld } from './world';

// ── Extend World with decoration test state ─────────────────────────

declare module './world' {
    interface ChangeDownWorld {
        decoratorInstance?: EditorDecorator;
        decoratorStyle?: 'foreground' | 'background';
        decoratorAuthorColors?: 'auto' | 'always' | 'never';
        spyEditor?: SpyEditor;
        decorationText?: string;
        parsedDoc?: VirtualDocument;
        manualChanges?: ChangeNode[];
    }
}

// ── Lifecycle ───────────────────────────────────────────────────────

Before({ tags: '@fast and (@D3 or @D4 or @D5 or @D6 or @D7 or @D8 or @D9 or @D10)' }, function (this: ChangeDownWorld) {
    resetDecorationTypeCounter();
    this.decoratorStyle = 'foreground';
    this.decoratorAuthorColors = 'auto';
    this.decoratorInstance = undefined;
    this.spyEditor = undefined;
    this.decorationText = undefined;
    this.parsedDoc = undefined;
    this.manualChanges = undefined;
});

// ── Helpers ─────────────────────────────────────────────────────────

function getOrCreateDecorator(world: ChangeDownWorld): EditorDecorator {
    if (!world.decoratorInstance) {
        world.decoratorInstance = new EditorDecorator(
            world.decoratorStyle ?? 'foreground',
            world.decoratorAuthorColors ?? 'auto'
        );
    }
    return world.decoratorInstance;
}

function resolveDecorationArray(spy: SpyEditor, name: string): RecordedDecoration[] {
    const map: Record<string, () => RecordedDecoration[]> = {
        insertions: () => spy.insertions,
        deletions: () => spy.deletions,
        substitutionOriginals: () => spy.substitutionOriginals,
        substitutionModifieds: () => spy.substitutionModifieds,
        highlights: () => spy.highlights,
        comments: () => spy.comments,
        hiddens: () => spy.hiddens,
        unfolded: () => spy.unfolded,
        commentIcons: () => spy.commentIcons,
        activeHighlights: () => spy.activeHighlights,
        moveFroms: () => spy.moveFroms,
        moveTos: () => spy.moveTos,
    };
    const getter = map[name];
    assert.ok(getter, `Unknown decoration array "${name}". Valid: ${Object.keys(map).join(', ')}`);
    return getter();
}

// ── Given steps ─────────────────────────────────────────────────────

Given('markup text {string}', function (this: ChangeDownWorld, text: string) {
    this.decorationText = text;
});

Given('markup text:', function (this: ChangeDownWorld, docString: string) {
    this.decorationText = docString;
});

Given('decorator style {string}', function (this: ChangeDownWorld, style: string) {
    assert.ok(style === 'foreground' || style === 'background', `Invalid style: ${style}`);
    this.decoratorStyle = style;
    // Force re-creation of decorator
    if (this.decoratorInstance) {
        this.decoratorInstance.dispose();
        this.decoratorInstance = undefined;
    }
});

Given('author colors mode {string}', function (this: ChangeDownWorld, mode: string) {
    assert.ok(mode === 'auto' || mode === 'always' || mode === 'never', `Invalid author colors mode: ${mode}`);
    this.decoratorAuthorColors = mode;
    if (this.decoratorInstance) {
        this.decoratorInstance.dispose();
        this.decoratorInstance = undefined;
    }
});

Given('a change of type {string} by {string} at offset {int} to {int}', function (
    this: ChangeDownWorld, typeName: string, author: string, start: number, end: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    const typeMap: Record<string, ChangeType> = {
        insertion: ChangeType.Insertion,
        deletion: ChangeType.Deletion,
        substitution: ChangeType.Substitution,
        highlight: ChangeType.Highlight,
        comment: ChangeType.Comment,
    };
    const type = typeMap[typeName.toLowerCase()];
    assert.ok(type !== undefined, `Unknown change type "${typeName}"`);
    this.manualChanges.push({
        id: `cn-${start}`,
        type,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start, end },
        metadata: { author },
        level: 0, anchored: false,
    });
});

Given('a change of type {string} with no author at offset {int} to {int}', function (
    this: ChangeDownWorld, typeName: string, start: number, end: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    const typeMap: Record<string, ChangeType> = {
        insertion: ChangeType.Insertion,
        deletion: ChangeType.Deletion,
        substitution: ChangeType.Substitution,
        highlight: ChangeType.Highlight,
        comment: ChangeType.Comment,
    };
    const type = typeMap[typeName.toLowerCase()];
    assert.ok(type !== undefined, `Unknown change type "${typeName}"`);
    this.manualChanges.push({
        id: `cn-${start}`,
        type,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start, end },
        level: 0, anchored: false,
    });
});

Given('a substitution by {string} at offset {int} to {int} with originalRange {int}-{int} and modifiedRange {int}-{int}', function (
    this: ChangeDownWorld, author: string,
    start: number, end: number,
    origStart: number, origEnd: number,
    modStart: number, modEnd: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: `cn-${start}`,
        type: ChangeType.Substitution,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start, end },
        originalRange: { start: origStart, end: origEnd },
        modifiedRange: { start: modStart, end: modEnd },
        metadata: { author },
        level: 0, anchored: false,
    });
});

Given('a move-from change at offset {int} to {int} with content {int} to {int}', function (
    this: ChangeDownWorld, start: number, end: number, contentStart: number, contentEnd: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Deletion,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start: contentStart, end: contentEnd },
        moveRole: 'from',
        groupId: 'cn-1',
        level: 0, anchored: false,
    });
});

Given('a move-to change at offset {int} to {int} with content {int} to {int}', function (
    this: ChangeDownWorld, start: number, end: number, contentStart: number, contentEnd: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Insertion,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start: contentStart, end: contentEnd },
        moveRole: 'to',
        groupId: 'cn-1',
        level: 0, anchored: false,
    });
});

Given('a move-from change by {string} at offset {int} to {int} with content {int} to {int}', function (
    this: ChangeDownWorld, author: string, start: number, end: number, contentStart: number, contentEnd: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Deletion,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start: contentStart, end: contentEnd },
        moveRole: 'from',
        groupId: 'cn-1',
        metadata: { author },
        level: 0, anchored: false,
    });
});

Given('a move-to change by {string} at offset {int} to {int} with content {int} to {int}', function (
    this: ChangeDownWorld, author: string, start: number, end: number, contentStart: number, contentEnd: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Insertion,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start: contentStart, end: contentEnd },
        moveRole: 'to',
        groupId: 'cn-1',
        metadata: { author },
        level: 0, anchored: false,
    });
});

Given('a normal deletion at offset {int} to {int} with content {int} to {int}', function (
    this: ChangeDownWorld, start: number, end: number, contentStart: number, contentEnd: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Deletion,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start: contentStart, end: contentEnd },
        level: 0, anchored: false,
    });
});

Given('a sidecar substitution with original {string} modified {string} at offset {int}', function (
    this: ChangeDownWorld, originalTextRaw: string, modifiedTextRaw: string, startOffset: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    // Interpret \n escape sequences from Gherkin string parameters
    const originalText = originalTextRaw.replace(/\\n/g, '\n');
    const modifiedText = modifiedTextRaw.replace(/\\n/g, '\n');
    const contentLength = modifiedText.length;
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Substitution,
        status: 'Pending' as any,
        range: { start: startOffset, end: startOffset + contentLength },
        contentRange: { start: startOffset, end: startOffset + contentLength },
        originalText,
        modifiedText,
        level: 0, anchored: false,
    });
});

Given('a sidecar substitution with only modifiedText {string} at offset {int} to {int}', function (
    this: ChangeDownWorld, modifiedText: string, start: number, end: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Substitution,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start, end },
        modifiedText,
        level: 0, anchored: false,
    });
});

Given('a sidecar substitution with only originalText {string} at offset {int} to {int}', function (
    this: ChangeDownWorld, originalText: string, start: number, end: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Substitution,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start, end },
        originalText,
        level: 0, anchored: false,
    });
});

Given('a sidecar insertion with modifiedText {string} at offset {int} to {int}', function (
    this: ChangeDownWorld, modifiedText: string, start: number, end: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Insertion,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start, end },
        modifiedText,
        level: 0, anchored: false,
    });
});

Given('a sidecar deletion with originalText {string} at offset {int} to {int}', function (
    this: ChangeDownWorld, originalText: string, start: number, end: number
) {
    if (!this.manualChanges) this.manualChanges = [];
    this.manualChanges.push({
        id: 'cn-1',
        type: ChangeType.Deletion,
        status: 'Pending' as any,
        range: { start, end },
        contentRange: { start, end },
        originalText,
        level: 0, anchored: false,
    });
});

// ── When steps ──────────────────────────────────────────────────────

When('I decorate in markup mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(0, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, true, this.decorationText!, true);
});

When('I decorate in markup mode with cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, this.parsedDoc, true, this.decorationText!, true);
});

When('I decorate in smart view mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, false, this.decorationText!);
});

When('I decorate in smart view mode with cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, this.parsedDoc, false, this.decorationText!);
});

When('I decorate in final mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'settled', this.decorationText!);
});

When('I decorate in final mode with cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'settled', this.decorationText!);
});

When('I decorate in original mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'raw', this.decorationText!);
});

When('I decorate in original mode with cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'raw', this.decorationText!);
});

When('I decorate in review mode with showDelimiters off', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'review', this.decorationText!, false);
});

When('I decorate in review mode with showDelimiters off and cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'review', this.decorationText!, false);
});

When('I decorate in review mode with showDelimiters on', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'review', this.decorationText!, true);
});

When('I decorate in review mode with showDelimiters on and cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'review', this.decorationText!, true);
});

// ── showDelimiters step definitions (smart view mode with cursor) ──

When('I decorate in smart view mode with showDelimiters on and cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'changes', this.decorationText!, true);
});

When('I decorate in smart view mode with showDelimiters on', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'changes', this.decorationText!, true);
});

When('I decorate in final mode with showDelimiters on', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'settled', this.decorationText!, true);
});

When('I decorate in original mode with showDelimiters on', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    const decorator = getOrCreateDecorator(this);
    const parser = new CriticMarkupParser();
    this.parsedDoc = parser.parse(this.decorationText!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, this.parsedDoc, 'raw', this.decorationText!, true);
});

When('I decorate the manual changes in markup mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, doc, true, this.decorationText!, true);
});

When('I decorate the manual changes in markup mode with cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, doc, true, this.decorationText!, true);
});

When('I decorate the manual changes in smart view mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, doc, false, this.decorationText!);
});

When('I decorate the manual changes in smart view mode with cursor at {int}:{int}', function (
    this: ChangeDownWorld, line: number, char: number
) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    this.spyEditor = new SpyEditor(line, char);
    decorator.decorate(this.spyEditor, doc, false, this.decorationText!);
});

When('I decorate the manual changes in final mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, doc, 'settled', this.decorationText!);
});

When('I decorate the manual changes in original mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    this.spyEditor = new SpyEditor(99, 0);
    decorator.decorate(this.spyEditor, doc, 'raw', this.decorationText!);
});

// ── When steps: re-decorate (reuse existing spy to detect stale decorations) ──

When('I re-decorate the manual changes in final mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    assert.ok(this.spyEditor, 'No spy editor — run an initial decorate step first');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    decorator.decorate(this.spyEditor, doc, 'settled', this.decorationText!);
});

When('I re-decorate the manual changes in original mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    assert.ok(this.spyEditor, 'No spy editor — run an initial decorate step first');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    decorator.decorate(this.spyEditor, doc, 'raw', this.decorationText!);
});

When('I re-decorate the manual changes in markup mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    assert.ok(this.spyEditor, 'No spy editor — run an initial decorate step first');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    decorator.decorate(this.spyEditor, doc, true, this.decorationText!, true);
});

When('I re-decorate the manual changes in smart view mode', function (this: ChangeDownWorld) {
    assert.ok(this.decorationText !== undefined, 'No markup text set');
    assert.ok(this.manualChanges && this.manualChanges.length > 0, 'No manual changes set');
    assert.ok(this.spyEditor, 'No spy editor — run an initial decorate step first');
    const decorator = getOrCreateDecorator(this);
    const doc = new VirtualDocument(this.manualChanges!);
    decorator.decorate(this.spyEditor, doc, false, this.decorationText!);
});

// ── Then steps: count assertions ────────────────────────────────────

Then('{word} count is {int}', function (this: ChangeDownWorld, arrayName: string, expected: number) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    const decorations = resolveDecorationArray(this.spyEditor, arrayName);
    assert.strictEqual(
        decorations.length,
        expected,
        `${arrayName}: expected ${expected} decorations, got ${decorations.length}. ` +
        `Ranges: ${decorations.map(d =>
            `(${d.range.start.line}:${d.range.start.character})-(${d.range.end.line}:${d.range.end.character})`
        ).join(', ')}`
    );
});

Then('{word} is empty', function (this: ChangeDownWorld, arrayName: string) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    const decorations = resolveDecorationArray(this.spyEditor, arrayName);
    assert.strictEqual(
        decorations.length,
        0,
        `${arrayName}: expected 0 decorations, got ${decorations.length}. ` +
        `Ranges: ${decorations.map(d =>
            `(${d.range.start.line}:${d.range.start.character})-(${d.range.end.line}:${d.range.end.character})`
        ).join(', ')}`
    );
});

// ── Then steps: range assertions ────────────────────────────────────

Then('{word} has range {int}:{int} to {int}:{int}', function (
    this: ChangeDownWorld, arrayName: string,
    startLine: number, startChar: number, endLine: number, endChar: number
) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    const decorations = resolveDecorationArray(this.spyEditor, arrayName);
    const match = decorations.find(d =>
        d.range.start.line === startLine &&
        d.range.start.character === startChar &&
        d.range.end.line === endLine &&
        d.range.end.character === endChar
    );
    if (!match) {
        const actual = decorations.map(d =>
            `(${d.range.start.line}:${d.range.start.character})-(${d.range.end.line}:${d.range.end.character})`
        ).join(', ');
        assert.fail(
            `${arrayName}: expected range (${startLine}:${startChar})-(${endLine}:${endChar}) not found in [${actual}]`
        );
    }
});

Then('{word} has point range {int}:{int}', function (
    this: ChangeDownWorld, arrayName: string, line: number, char: number
) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    const decorations = resolveDecorationArray(this.spyEditor, arrayName);
    const match = decorations.find(d =>
        d.range.start.line === line &&
        d.range.start.character === char &&
        d.range.end.line === line &&
        d.range.end.character === char
    );
    if (!match) {
        const actual = decorations.map(d =>
            `(${d.range.start.line}:${d.range.start.character})-(${d.range.end.line}:${d.range.end.character})`
        ).join(', ');
        assert.fail(
            `${arrayName}: expected point range (${line}:${char}) not found in [${actual}]`
        );
    }
});

// ── Then steps: hover message assertions ────────────────────────────

Then('{word} at index {int} has hover containing {string}', function (
    this: ChangeDownWorld, arrayName: string, index: number, expectedText: string
) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    const decorations = resolveDecorationArray(this.spyEditor, arrayName);
    const dec = decorations[index];
    assert.ok(dec, `${arrayName} at index ${index} does not exist (length: ${decorations.length})`);
    assert.ok(dec.hoverMessage, `${arrayName} at index ${index} has no hoverMessage`);
    assert.ok(
        (dec.hoverMessage as any).value.includes(expectedText),
        `${arrayName} hover at index ${index} does not contain "${expectedText}". Actual: "${(dec.hoverMessage as any).value}"`
    );
});

Then('{word} at index {int} has no hover message', function (
    this: ChangeDownWorld, arrayName: string, index: number
) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    const decorations = resolveDecorationArray(this.spyEditor, arrayName);
    const dec = decorations[index];
    assert.ok(dec, `${arrayName} at index ${index} does not exist`);
    assert.strictEqual(dec.hoverMessage, undefined,
        `${arrayName} at index ${index}: expected no hoverMessage, got "${(dec.hoverMessage as any)?.value}"`);
});

// ── Then steps: total calls assertion (for author coloring) ─────────

Then('total setDecorations calls is {int}', function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    assert.strictEqual(
        this.spyEditor.getAllCalls().length,
        expected,
        `Expected ${expected} setDecorations calls, got ${this.spyEditor.getAllCalls().length}`
    );
});

Then('author decoration call {int} has {int} ranges', function (
    this: ChangeDownWorld, callIndex: number, expected: number
) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    const allCalls = this.spyEditor.getAllCalls();
    assert.ok(callIndex < allCalls.length, `Call index ${callIndex} out of range (${allCalls.length} calls)`);
    assert.strictEqual(
        allCalls[callIndex][1].length,
        expected,
        `Call ${callIndex}: expected ${expected} ranges, got ${allCalls[callIndex][1].length}`
    );
});

// ── Then steps: hiddens length assertion (for view mode comparison) ─

Then('hiddens length is greater than {int}', function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.spyEditor, 'No spy editor — run a decorate step first');
    assert.ok(
        this.spyEditor.hiddens.length > expected,
        `hiddens: expected length > ${expected}, got ${this.spyEditor.hiddens.length}`
    );
});

// ── Then steps: parser assertions (used in some D3 tests) ───────────

Then('the parser finds {int} change(s) in the decoration text', function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.parsedDoc, 'No parsed document — run a decorate step first');
    assert.strictEqual(this.parsedDoc.getChanges().length, expected);
});

Then('parsed change {int} is type {word}', function (this: ChangeDownWorld, index: number, typeName: string) {
    assert.ok(this.parsedDoc, 'No parsed document');
    const typeMap: Record<string, ChangeType> = {
        Insertion: ChangeType.Insertion,
        Deletion: ChangeType.Deletion,
        Substitution: ChangeType.Substitution,
        Highlight: ChangeType.Highlight,
        Comment: ChangeType.Comment,
    };
    const expectedType = typeMap[typeName];
    assert.ok(expectedType !== undefined, `Unknown type "${typeName}"`);
    assert.strictEqual(this.parsedDoc!.getChanges()[index - 1].type, expectedType);
});

Then('parsed change {int} has author {string}', function (this: ChangeDownWorld, index: number, expected: string) {
    assert.ok(this.parsedDoc, 'No parsed document');
    assert.strictEqual(this.parsedDoc!.getChanges()[index - 1].metadata?.author, expected);
});

Then('parsed change {int} has metadata comment {string}', function (this: ChangeDownWorld, index: number, expected: string) {
    assert.ok(this.parsedDoc, 'No parsed document');
    assert.strictEqual(this.parsedDoc!.getChanges()[index - 1].metadata?.comment, expected);
});

// ── Module export assertions (CL2 dedup) ────────────────────────────

Then('the module {string} does not export {string}', function (
    _moduleName: string, exportName: string
) {
    const mod = require('changedown-vscode/internals');
    assert.strictEqual(mod[exportName], undefined,
        `Expected "${exportName}" to NOT be exported from "${_moduleName}"`);
});
