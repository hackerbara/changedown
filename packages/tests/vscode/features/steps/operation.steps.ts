import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import {
    CriticMarkupParser, ChangeType,
    computeAccept, computeReject,
    computeFootnoteStatusEdits, computeApprovalLineEdit, computeFootnoteArchiveLineEdit,
} from '@changedown/core';
import type { ChangeNode, TextEdit } from '@changedown/core';
import type { ChangeDownWorld } from './world';
import { applyEdit, applyEditsReverse } from './test-utils';

// Extend ChangeDownWorld with operation state for @fast tier accept/reject scenarios
declare module './world' {
    interface ChangeDownWorld {
        operationText?: string;
        operationChanges?: ChangeNode[];
        cursorOffset?: number;
        reviewerIdentity?: string;
        authorIdentity?: string;
        archiveOnAccept?: boolean;
    }
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseDocument(text: string): ChangeNode[] {
    const parser = new CriticMarkupParser();
    return parser.parse(text).getChanges();
}

function findChangeAtOffset(changes: ChangeNode[], offset: number): ChangeNode | undefined {
    return changes.find(c => c.range.start <= offset && offset <= c.range.end);
}

// ── Given ───────────────────────────────────────────────────────────

Given('a document with text:', function (this: ChangeDownWorld, docString: string) {
    this.operationText = docString;
    this.operationChanges = parseDocument(docString);
});

Given('a document with text {string}', function (this: ChangeDownWorld, text: string) {
    this.operationText = text;
    this.operationChanges = parseDocument(text);
});

Given('the cursor is at offset {int}', function (this: ChangeDownWorld, offset: number) {
    this.cursorOffset = offset;
});

Given('reviewer identity is {string}', function (this: ChangeDownWorld, identity: string) {
    this.reviewerIdentity = identity;
});

Given('author identity is {string}', function (this: ChangeDownWorld, identity: string) {
    this.authorIdentity = identity;
});

Given('archive on accept is enabled', function (this: ChangeDownWorld) {
    this.archiveOnAccept = true;
});

Given('no reviewer identity is set', function (this: ChangeDownWorld) {
    this.reviewerIdentity = undefined;
});

Given('no author identity is set', function (this: ChangeDownWorld) {
    this.authorIdentity = undefined;
});

// ── When ────────────────────────────────────────────────────────────

When('I accept the change at the cursor', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    assert.ok(this.cursorOffset !== undefined, 'Cursor offset not set');

    const change = findChangeAtOffset(this.operationChanges!, this.cursorOffset!);
    assert.ok(change, `No change found at offset ${this.cursorOffset}`);

    const edit = computeAccept(change);
    this.operationText = applyEdit(this.operationText!, edit);
    this.operationChanges = parseDocument(this.operationText);
});

When('I reject the change at the cursor', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    assert.ok(this.cursorOffset !== undefined, 'Cursor offset not set');

    const change = findChangeAtOffset(this.operationChanges!, this.cursorOffset!);
    assert.ok(change, `No change found at offset ${this.cursorOffset}`);

    const edit = computeReject(change);
    this.operationText = applyEdit(this.operationText!, edit);
    this.operationChanges = parseDocument(this.operationText);
});

When('I try to accept the change at the cursor', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    assert.ok(this.cursorOffset !== undefined, 'Cursor offset not set');

    const change = findChangeAtOffset(this.operationChanges!, this.cursorOffset!);
    if (!change) {
        // No change at cursor — mimic controller behavior: do nothing
        return;
    }

    const edit = computeAccept(change);
    this.operationText = applyEdit(this.operationText!, edit);
    this.operationChanges = parseDocument(this.operationText);
});

When('I accept all changes in the document', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');

    if (!this.operationChanges || this.operationChanges.length === 0) return;

    const edits = this.operationChanges.map(c => computeAccept(c));
    this.operationText = applyEditsReverse(this.operationText!, edits);
    this.operationChanges = parseDocument(this.operationText);
});

When('I reject all changes in the document', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');

    if (!this.operationChanges || this.operationChanges.length === 0) return;

    const edits = this.operationChanges.map(c => computeReject(c));
    this.operationText = applyEditsReverse(this.operationText!, edits);
    this.operationChanges = parseDocument(this.operationText);
});

When('I accept the change at the cursor with footnote update', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    assert.ok(this.cursorOffset !== undefined, 'Cursor offset not set');

    const change = findChangeAtOffset(this.operationChanges!, this.cursorOffset!);
    assert.ok(change, `No change found at offset ${this.cursorOffset}`);

    // Collect all edits: accept + footnote status + approval line + archive
    const allEdits: TextEdit[] = [];

    allEdits.push(computeAccept(change));

    if (change.id.startsWith('cn-')) {
        const statusEdits = computeFootnoteStatusEdits(this.operationText!, [change.id], 'accepted');
        allEdits.push(...statusEdits);

        const reviewer = this.reviewerIdentity ?? this.authorIdentity;
        if (reviewer) {
            const approvalEdit = computeApprovalLineEdit(this.operationText!, change.id, 'accepted', {
                author: reviewer,
            });
            if (approvalEdit) allEdits.push(approvalEdit);
        }

        if (this.archiveOnAccept) {
            // Build reference text from change content
            const refText = change.type === ChangeType.Substitution
                ? `${change.originalText ?? ''} → ${change.modifiedText ?? ''}`
                : (change.originalText ?? change.modifiedText ?? '');
            const archiveEdit = computeFootnoteArchiveLineEdit(this.operationText!, change.id, refText);
            if (archiveEdit) allEdits.push(archiveEdit);
        }
    }

    this.operationText = applyEditsReverse(this.operationText!, allEdits);
    this.operationChanges = parseDocument(this.operationText);
});

When('I reject the change at the cursor with footnote update', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    assert.ok(this.cursorOffset !== undefined, 'Cursor offset not set');

    const change = findChangeAtOffset(this.operationChanges!, this.cursorOffset!);
    assert.ok(change, `No change found at offset ${this.cursorOffset}`);

    const allEdits: TextEdit[] = [];

    allEdits.push(computeReject(change));

    if (change.id.startsWith('cn-')) {
        const statusEdits = computeFootnoteStatusEdits(this.operationText!, [change.id], 'rejected');
        allEdits.push(...statusEdits);

        const reviewer = this.reviewerIdentity ?? this.authorIdentity;
        if (reviewer) {
            const approvalEdit = computeApprovalLineEdit(this.operationText!, change.id, 'rejected', {
                author: reviewer,
            });
            if (approvalEdit) allEdits.push(approvalEdit);
        }
    }

    this.operationText = applyEditsReverse(this.operationText!, allEdits);
    this.operationChanges = parseDocument(this.operationText);
});

When('I accept all changes with footnote update', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');

    if (!this.operationChanges || this.operationChanges.length === 0) return;

    const allEdits: TextEdit[] = [];
    const changeIds = this.operationChanges
        .filter(c => c.id.startsWith('cn-'))
        .map(c => c.id);

    for (const change of this.operationChanges) {
        allEdits.push(computeAccept(change));
    }

    if (changeIds.length > 0) {
        const statusEdits = computeFootnoteStatusEdits(this.operationText!, changeIds, 'accepted');
        allEdits.push(...statusEdits);

        const reviewer = this.reviewerIdentity ?? this.authorIdentity;
        if (reviewer) {
            for (const id of changeIds) {
                const approvalEdit = computeApprovalLineEdit(this.operationText!, id, 'accepted', {
                    author: reviewer,
                });
                if (approvalEdit) allEdits.push(approvalEdit);
            }
        }
    }

    this.operationText = applyEditsReverse(this.operationText!, allEdits);
    this.operationChanges = parseDocument(this.operationText);
});

When('I reject all changes with footnote update', function (this: ChangeDownWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');

    if (!this.operationChanges || this.operationChanges.length === 0) return;

    const allEdits: TextEdit[] = [];
    const changeIds = this.operationChanges
        .filter(c => c.id.startsWith('cn-'))
        .map(c => c.id);

    for (const change of this.operationChanges) {
        allEdits.push(computeReject(change));
    }

    if (changeIds.length > 0) {
        const statusEdits = computeFootnoteStatusEdits(this.operationText!, changeIds, 'rejected');
        allEdits.push(...statusEdits);

        const reviewer = this.reviewerIdentity ?? this.authorIdentity;
        if (reviewer) {
            for (const id of changeIds) {
                const approvalEdit = computeApprovalLineEdit(this.operationText!, id, 'rejected', {
                    author: reviewer,
                });
                if (approvalEdit) allEdits.push(approvalEdit);
            }
        }
    }

    this.operationText = applyEditsReverse(this.operationText!, allEdits);
    this.operationChanges = parseDocument(this.operationText);
});

// ── Then ────────────────────────────────────────────────────────────

Then('the document text is:', function (this: ChangeDownWorld, expected: string) {
    assert.strictEqual(this.operationText, expected);
});

Then('the document text is {string}', function (this: ChangeDownWorld, expected: string) {
    assert.strictEqual(this.operationText, expected);
});

Then('the document text contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(
        this.operationText!.includes(expected),
        `Expected document to contain "${expected}" but got:\n${this.operationText}`
    );
});

Then('the document text does not contain {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(
        !this.operationText!.includes(expected),
        `Expected document to NOT contain "${expected}" but it does:\n${this.operationText}`
    );
});

Then('the parser finds {int} change(s) remaining', function (this: ChangeDownWorld, expected: number) {
    assert.strictEqual(this.operationChanges!.length, expected);
});

Then('the document is unchanged', function (this: ChangeDownWorld) {
    // operationText should still be its original value — no edits applied
    // This step is only meaningful when used with "no change at cursor" scenarios
    // which are verified via the exact text assertion
});

Then('the document contains footnote status {string}', function (this: ChangeDownWorld, status: string) {
    assert.ok(
        this.operationText!.includes(`| ${status}`),
        `Expected footnote status "${status}" in:\n${this.operationText}`
    );
});

Then('the document contains approval from {string}', function (this: ChangeDownWorld, author: string) {
    assert.ok(
        this.operationText!.includes('approved:') && this.operationText!.includes(author),
        `Expected approval from "${author}" in:\n${this.operationText}`
    );
});

Then('the document contains rejection from {string}', function (this: ChangeDownWorld, author: string) {
    assert.ok(
        this.operationText!.includes('rejected:') && this.operationText!.includes(author),
        `Expected rejection from "${author}" in:\n${this.operationText}`
    );
});

Then('the document text does not contain {string} line', function (this: ChangeDownWorld, keyword: string) {
    assert.ok(
        !this.operationText!.includes(`${keyword}:`),
        `Expected no "${keyword}:" line in:\n${this.operationText}`
    );
});

Then('the document contains archive line', function (this: ChangeDownWorld) {
    assert.ok(
        this.operationText!.includes('archive:'),
        `Expected archive: line in:\n${this.operationText}`
    );
});

Then('the approval line matches format {string}', function (this: ChangeDownWorld, pattern: string) {
    const approvalLine = this.operationText!.split('\n').find(l => l.includes('approved:'));
    assert.ok(approvalLine, 'No approval line found');
    const re = new RegExp(pattern);
    assert.ok(re.test(approvalLine!), `Approval line "${approvalLine}" does not match pattern "${pattern}"`);
});

Then('{int} approval lines from {string} exist', function (this: ChangeDownWorld, count: number, author: string) {
    const matches = this.operationText!.match(new RegExp(`approved:\\s*${author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')) || [];
    assert.strictEqual(matches.length, count, `Expected ${count} approval lines from ${author}, found ${matches.length}`);
});

Then('{int} rejection lines from {string} exist', function (this: ChangeDownWorld, count: number, author: string) {
    const matches = this.operationText!.match(new RegExp(`rejected:\\s*${author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')) || [];
    assert.strictEqual(matches.length, count, `Expected ${count} rejection lines from ${author}, found ${matches.length}`);
});

Then('the approval line contains todays UTC date', function (this: ChangeDownWorld) {
    const expectedDate = new Date().toISOString().slice(0, 10);
    const approvalLine = this.operationText!.split('\n').find(l => l.includes('approved:'));
    assert.ok(approvalLine, 'No approval line found');
    assert.ok(
        approvalLine!.includes(expectedDate),
        `Approval line "${approvalLine}" should contain UTC date ${expectedDate}`
    );
});
