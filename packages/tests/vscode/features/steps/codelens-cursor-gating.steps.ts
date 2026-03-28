/**
 * @fast tier step definitions for CL4 — CodeLens cursor-gated mode.
 *
 * Tests createCodeLenses() directly with mock cursor state (no LSP server).
 */

import { When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser } from '@changedown/core';
import { createCodeLenses } from '@changedown/lsp-server';
import type { CodeLensMode, CursorState } from '@changedown/lsp-server';
import type { CodeLens } from 'vscode-languageserver';
import type { ChangeDownWorld } from './world';

// ── Extend World ─────────────────────────────────────────────────────

declare module './world' {
    interface ChangeDownWorld {
        codeLensResult?: CodeLens[];
    }
}

Before({ tags: '@fast and @CL4' }, function (this: ChangeDownWorld) {
    this.codeLensResult = undefined;
});

// ── Helpers ──────────────────────────────────────────────────────────

function parseAndComputeLenses(
    text: string,
    mode: CodeLensMode,
    cursorState?: CursorState
): CodeLens[] {
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(text);
    return createCodeLenses(vdoc.getChanges(), text, 'review', mode, cursorState);
}

function findChangeLineAndId(text: string, changeId: string): { line: number; id: string } {
    const parser = new CriticMarkupParser();
    const vdoc = parser.parse(text);
    const change = vdoc.getChanges().find(c => c.id === changeId);
    assert.ok(change, `Change ${changeId} not found`);
    // Compute line from offset
    const before = text.slice(0, change.range.start);
    const line = (before.match(/\n/g) || []).length;
    return { line, id: changeId };
}

// ── When steps ───────────────────────────────────────────────────────

When('I compute CodeLens with mode {string}', function (this: ChangeDownWorld, mode: string) {
    assert.ok(this.lifecycleDocText !== undefined, 'Document text not set');
    this.codeLensResult = parseAndComputeLenses(this.lifecycleDocText, mode as CodeLensMode);
});

When('I compute CodeLens with mode {string} and cursor inside {string}',
    function (this: ChangeDownWorld, mode: string, changeId: string) {
        assert.ok(this.lifecycleDocText !== undefined, 'Document text not set');
        const { line, id } = findChangeLineAndId(this.lifecycleDocText, changeId);
        this.codeLensResult = parseAndComputeLenses(
            this.lifecycleDocText,
            mode as CodeLensMode,
            { line, changeId: id }
        );
    }
);

When('I compute CodeLens with mode {string} and cursor on line {int} outside changes',
    function (this: ChangeDownWorld, mode: string, line: number) {
        assert.ok(this.lifecycleDocText !== undefined, 'Document text not set');
        this.codeLensResult = parseAndComputeLenses(
            this.lifecycleDocText,
            mode as CodeLensMode,
            { line }
        );
    }
);

// ── Then steps ───────────────────────────────────────────────────────

Then('the CodeLens array is empty', function (this: ChangeDownWorld) {
    assert.ok(this.codeLensResult !== undefined, 'No CodeLens result computed');
    assert.strictEqual(this.codeLensResult.length, 0,
        `Expected empty array, got ${this.codeLensResult.length} items: ${this.codeLensResult.map(l => l.command?.title).join(', ')}`);
});

Then('the CodeLens array has {int} items', function (this: ChangeDownWorld, count: number) {
    assert.ok(this.codeLensResult !== undefined, 'No CodeLens result computed');
    assert.strictEqual(this.codeLensResult.length, count,
        `Expected ${count} items, got ${this.codeLensResult.length}: ${this.codeLensResult.map(l => l.command?.title).join(', ')}`);
});

Then('CodeLens {int} title starts with {string}', function (this: ChangeDownWorld, index: number, prefix: string) {
    assert.ok(this.codeLensResult !== undefined, 'No CodeLens result computed');
    assert.ok(index < this.codeLensResult.length, `Index ${index} out of range (${this.codeLensResult.length} items)`);
    const title = this.codeLensResult[index].command?.title ?? '';
    assert.ok(title.startsWith(prefix),
        `CodeLens[${index}] title "${title}" does not start with "${prefix}"`);
});

Then('CodeLens {int} title contains {string}', function (this: ChangeDownWorld, index: number, expected: string) {
    assert.ok(this.codeLensResult !== undefined, 'No CodeLens result computed');
    assert.ok(index < this.codeLensResult.length, `Index ${index} out of range (${this.codeLensResult.length} items)`);
    const title = this.codeLensResult[index].command?.title ?? '';
    assert.ok(title.includes(expected),
        `CodeLens[${index}] title "${title}" does not contain "${expected}"`);
});

Then('a CodeLens title contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.codeLensResult !== undefined, 'No CodeLens result computed');
    const found = this.codeLensResult.some(l => (l.command?.title ?? '').includes(expected));
    assert.ok(found,
        `No CodeLens title contains "${expected}". Titles: ${this.codeLensResult.map(l => l.command?.title).join(', ')}`);
});

Then('no CodeLens title starts with {string}', function (this: ChangeDownWorld, prefix: string) {
    assert.ok(this.codeLensResult !== undefined, 'No CodeLens result computed');
    const found = this.codeLensResult.find(l => (l.command?.title ?? '').startsWith(prefix));
    assert.ok(!found,
        `Found CodeLens starting with "${prefix}": "${found?.command?.title}"`);
});

Then('a CodeLens for {word} title contains {string}',
    function (this: ChangeDownWorld, changeId: string, expected: string) {
        assert.ok(this.codeLensResult !== undefined, 'No CodeLens result computed');
        const matching = this.codeLensResult.filter(l => {
            const args = l.command?.arguments;
            return args && args[0] === changeId;
        });
        assert.ok(matching.length > 0,
            `No CodeLens found for ${changeId}. All args: ${this.codeLensResult.map(l => l.command?.arguments?.[0]).join(', ')}`);
        const found = matching.some(l => (l.command?.title ?? '').includes(expected));
        assert.ok(found,
            `No CodeLens for ${changeId} contains "${expected}". Titles: ${matching.map(l => l.command?.title).join(', ')}`);
    }
);
