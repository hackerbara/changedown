/**
 * @fast tier step definitions for LV2 — Accept/reject with reason.
 *
 * Tests computeApprovalLineEdit + computeFootnoteStatusEdits as pure
 * functions (no VS Code launch). Validates reason handling, reviewer
 * identity resolution, and request-changes semantics.
 *
 * Reuses "reviewer identity is {string}" from operation.steps.ts which
 * stores the value (including "@" prefix) on this.reviewerIdentity.
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { computeApprovalLineEdit, computeFootnoteStatusEdits } from '@changedown/core';
import type { ChangeDownWorld } from './world';
import { applyEditsReverse, extractFootnoteStatus } from './test-utils';

// ── Extend World with review-reason state ────────────────────────────
// Note: reviewerIdentity is already declared in operation.steps.ts

declare module './world' {
    interface ChangeDownWorld {
        reasonRequired?: boolean;
        reviewResultText?: string;
        reviewDocText?: string;
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────

Before({ tags: '@fast and @LV2' }, function (this: ChangeDownWorld) {
    this.reviewerIdentity = undefined;
    this.reasonRequired = undefined;
    this.reviewResultText = undefined;
    this.reviewDocText = undefined;
});

// ── Fixture document ─────────────────────────────────────────────────

const PROPOSED_INSERTION_DOC = `Hello {++world++}[^cn-1]

[^cn-1]: @alice | 2026-03-09 | insertion | proposed`;

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Strip leading "@" from identity string for the API.
 * The existing "reviewer identity is" step stores "@bob" as-is;
 * computeApprovalLineEdit prepends "@" to opts.author internally.
 */
function stripAtPrefix(identity: string): string {
    return identity.replace(/^@/, '');
}

function performReview(
    docText: string,
    changeId: string,
    status: 'accepted' | 'rejected' | 'request-changes',
    author: string,
    reason?: string
): string {
    const approvalEdit = computeApprovalLineEdit(docText, changeId, status, {
        author,
        date: '2026-03-09',
        reason,
    });

    const statusEdits = computeFootnoteStatusEdits(docText, [changeId], status);

    const edits = [...statusEdits];
    if (approvalEdit) edits.push(approvalEdit);

    return applyEditsReverse(docText, edits);
}

// ── Step definitions ─────────────────────────────────────────────────
// "reviewer identity is {string}" is reused from operation.steps.ts.

Given('a review document with a proposed insertion {word}', function (this: ChangeDownWorld, _changeId: string) {
    this.reviewDocText = PROPOSED_INSERTION_DOC;
});

Given('reason is not required for human harness', function (this: ChangeDownWorld) {
    this.reasonRequired = false;
});

Given('changedown.reviewerIdentity is set to {string}', function (this: ChangeDownWorld, identity: string) {
    this.reviewerIdentity = identity.startsWith('@') ? identity : `@${identity}`;
});

When('I accept {word} with reason {string}', function (this: ChangeDownWorld, changeId: string, reason: string) {
    assert.ok(this.reviewDocText, 'Document text not set');
    assert.ok(this.reviewerIdentity, 'Reviewer identity not set');
    this.reviewResultText = performReview(
        this.reviewDocText, changeId, 'accepted', stripAtPrefix(this.reviewerIdentity), reason
    );
});

When('I accept {word} without reason', function (this: ChangeDownWorld, changeId: string) {
    assert.ok(this.reviewDocText, 'Document text not set');
    assert.ok(this.reviewerIdentity, 'Reviewer identity not set');
    assert.ok(
        this.reasonRequired !== true,
        'Reason is required for this harness but "without reason" was called — check scenario setup'
    );
    this.reviewResultText = performReview(
        this.reviewDocText, changeId, 'accepted', stripAtPrefix(this.reviewerIdentity)
    );
});

When('I reject {word} with reason {string}', function (this: ChangeDownWorld, changeId: string, reason: string) {
    assert.ok(this.reviewDocText, 'Document text not set');
    assert.ok(this.reviewerIdentity, 'Reviewer identity not set');
    this.reviewResultText = performReview(
        this.reviewDocText, changeId, 'rejected', stripAtPrefix(this.reviewerIdentity), reason
    );
});

When('I request changes on {word} with reason {string}', function (this: ChangeDownWorld, changeId: string, reason: string) {
    assert.ok(this.reviewDocText, 'Document text not set');
    assert.ok(this.reviewerIdentity, 'Reviewer identity not set');
    this.reviewResultText = performReview(
        this.reviewDocText, changeId, 'request-changes', stripAtPrefix(this.reviewerIdentity), reason
    );
});

Then('the review result footnote contains {string}', function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.reviewResultText, 'No review result — run a review action first');
    assert.ok(
        this.reviewResultText.includes(expected),
        `Review result does not contain "${expected}".\nFull result:\n${this.reviewResultText}`
    );
});

Then('the review result footnote does not contain quotes', function (this: ChangeDownWorld) {
    assert.ok(this.reviewResultText, 'No review result — run a review action first');
    const lines = this.reviewResultText.split('\n');
    const reviewLine = lines.find(l => l.trim().startsWith('approved:') || l.trim().startsWith('rejected:'));
    assert.ok(reviewLine, `No approval/rejection line found.\nFull result:\n${this.reviewResultText}`);
    assert.ok(
        !reviewLine.includes('"'),
        `Approval line contains quotes but should not.\nLine: ${reviewLine}`
    );
});

Then('the review result footnote status is {string}', function (this: ChangeDownWorld, expectedStatus: string) {
    assert.ok(this.reviewResultText, 'No review result — run a review action first');
    const actual = extractFootnoteStatus(this.reviewResultText);
    assert.strictEqual(
        actual,
        expectedStatus,
        `Expected footnote status "${expectedStatus}", got "${actual}".\nFull result:\n${this.reviewResultText}`
    );
});

Then('the review result approval line author is {string}', function (this: ChangeDownWorld, expectedAuthor: string) {
    assert.ok(this.reviewResultText, 'No review result — run a review action first');
    const lines = this.reviewResultText.split('\n');
    const approvalLine = lines.find(l => l.trim().startsWith('approved:') || l.trim().startsWith('rejected:'));
    assert.ok(approvalLine, `No approval/rejection line found.\nFull result:\n${this.reviewResultText}`);
    assert.ok(
        approvalLine.includes(expectedAuthor),
        `Approval line does not contain "${expectedAuthor}".\nLine: ${approvalLine}`
    );
});
