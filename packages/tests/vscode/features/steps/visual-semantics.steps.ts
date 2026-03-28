/**
 * @fast tier step definitions for visual semantics tests (VS1).
 *
 * These tests run in-process via cucumber-js (no VS Code launch).
 * A vscode mock is installed before importing visual-semantics
 * so that `require('vscode')` resolves to lightweight stubs.
 */

// ── MUST be first: install vscode mock before any vscode-dependent imports ──
import { installVscodeMock } from './vscode-mock';
installVscodeMock();

import { When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { ChangeType, ChangeStatus } from '@changedown/core';
import { CHANGE_COLORS, AUTHOR_PALETTE, getChangeStyle } from 'changedown-vscode/internals';
import type { ChangeStyleInfo, ThemeColor } from 'changedown-vscode/internals';
import type { ChangeDownWorld } from './world';

// ── Extend World with visual semantics test state ────────────────────

declare module './world' {
    interface ChangeDownWorld {
        changeStyle?: ChangeStyleInfo;
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────

Before({ tags: '@fast and @VS1' }, function (this: ChangeDownWorld) {
    this.changeStyle = undefined;
});

// ── Helpers ──────────────────────────────────────────────────────────

const CHANGE_TYPE_MAP: Record<string, ChangeType> = {
    insertion: ChangeType.Insertion,
    deletion: ChangeType.Deletion,
    substitution: ChangeType.Substitution,
    highlight: ChangeType.Highlight,
    comment: ChangeType.Comment,
};

const CHANGE_STATUS_MAP: Record<string, ChangeStatus> = {
    proposed: ChangeStatus.Proposed,
    accepted: ChangeStatus.Accepted,
    rejected: ChangeStatus.Rejected,
};

// ── Then steps: color palette ────────────────────────────────────────

Then('the color palette has entry {string}', function (this: ChangeDownWorld, typeName: string) {
    assert.ok(
        (CHANGE_COLORS as Record<string, unknown>)[typeName],
        `CHANGE_COLORS should have "${typeName}" entry`
    );
});

Then('insertion foreground has light and dark variants', function () {
    assert.ok(CHANGE_COLORS.insertion.light, 'insertion should have light color');
    assert.ok(CHANGE_COLORS.insertion.dark, 'insertion should have dark color');
});

Then('deletion foreground has light and dark variants', function () {
    assert.ok(CHANGE_COLORS.deletion.light, 'deletion should have light color');
    assert.ok(CHANGE_COLORS.deletion.dark, 'deletion should have dark color');
});

Then('the author palette has {int} entries', function (this: ChangeDownWorld, expected: number) {
    assert.strictEqual(AUTHOR_PALETTE.length, expected);
});

Then('each author palette entry has light and dark variants', function () {
    for (const entry of AUTHOR_PALETTE) {
        assert.ok(entry.light, 'Author palette entry should have light color');
        assert.ok(entry.dark, 'Author palette entry should have dark color');
    }
});

// ── When steps: getChangeStyle ───────────────────────────────────────

When('I get the change style for {string} with status {string}', function (
    this: ChangeDownWorld, typeName: string, statusName: string
) {
    const type = CHANGE_TYPE_MAP[typeName.toLowerCase()];
    assert.ok(type !== undefined, `Unknown change type "${typeName}"`);
    const status = CHANGE_STATUS_MAP[statusName.toLowerCase()];
    assert.ok(status !== undefined, `Unknown status "${statusName}"`);
    this.changeStyle = getChangeStyle(type, status);
});

When('I get the change style for {string} with status {string} and move role {string}', function (
    this: ChangeDownWorld, typeName: string, statusName: string, moveRole: string
) {
    const type = CHANGE_TYPE_MAP[typeName.toLowerCase()];
    assert.ok(type !== undefined, `Unknown change type "${typeName}"`);
    const status = CHANGE_STATUS_MAP[statusName.toLowerCase()];
    assert.ok(status !== undefined, `Unknown status "${statusName}"`);
    this.changeStyle = getChangeStyle(type, status, moveRole as 'from' | 'to');
});

// ── Then steps: style assertions ─────────────────────────────────────

Then('the CSS class is {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.changeStyle, 'No change style computed');
    assert.strictEqual(this.changeStyle.cssClass, expected);
});

Then('the CSS class contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.changeStyle, 'No change style computed');
    assert.ok(
        this.changeStyle.cssClass.includes(expected),
        `CSS class "${this.changeStyle.cssClass}" does not contain "${expected}"`
    );
});

Then('the HTML tag is {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.changeStyle, 'No change style computed');
    assert.strictEqual(this.changeStyle.htmlTag, expected);
});

Then('strikethrough is {word}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.changeStyle, 'No change style computed');
    assert.strictEqual(this.changeStyle.strikethrough, expected === 'true');
});

Then('the foreground matches the insertion color', function (this: ChangeDownWorld) {
    assert.ok(this.changeStyle, 'No change style computed');
    assert.deepStrictEqual(this.changeStyle.foreground, CHANGE_COLORS.insertion);
});

Then('the foreground matches the move color', function (this: ChangeDownWorld) {
    assert.ok(this.changeStyle, 'No change style computed');
    assert.deepStrictEqual(this.changeStyle.foreground, CHANGE_COLORS.move as ThemeColor);
});
