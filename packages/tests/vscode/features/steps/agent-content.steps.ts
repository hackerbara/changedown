/**
 * Step definitions for agent content tests (VA1-VA5).
 *
 * Extends parser.steps.ts and operation.steps.ts with agent-specific
 * assertions: footnote IDs, metadata, discussion threads, authors,
 * move roles, grouped changes, and pattern-matching in document text.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'assert';
import { CriticMarkupParser, ChangeType, ChangeStatus } from '@changetracks/core';
import type { ChangeTracksWorld } from './world';

// ── Extend World with agent-content state ──────────────────────────

declare module './world' {
    interface ChangeTracksWorld {
        /** Reparse operationText into operationChanges (used after multi-step edits) */
        reparseOperation?: () => void;
    }
}

// ── Parser-tier Then steps for agent content ───────────────────────

Then('change {int} has id {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist (only ${changes.length} changes found)`);
    assert.strictEqual(change.id, expected, `Change ${index}: expected id "${expected}", got "${change.id}"`);
});

Then('change {int} has level {int}', function (this: ChangeTracksWorld, index: number, expected: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.level, expected, `Change ${index}: expected level ${expected}, got ${change.level}`);
});

Then('change {int} id starts with {string}', function (this: ChangeTracksWorld, index: number, prefix: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.ok(change.id.startsWith(prefix), `Change ${index}: expected id to start with "${prefix}", got "${change.id}"`);
});

Then('change {int} has author {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.metadata?.author, expected, `Change ${index}: expected author "${expected}", got "${change.metadata?.author}"`);
});

Then('change {int} has no author', function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.metadata?.author, undefined, `Change ${index}: expected no author, got "${change.metadata?.author}"`);
});

Then('change {int} has date {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.metadata?.date, expected, `Change ${index}: expected date "${expected}", got "${change.metadata?.date}"`);
});

Then('change {int} has no date', function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.metadata?.date, undefined, `Change ${index}: expected no date, got "${change.metadata?.date}"`);
});

Then('change {int} has groupId {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.groupId, expected, `Change ${index}: expected groupId "${expected}", got "${change.groupId}"`);
});

Then('change {int} has moveRole {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.moveRole, expected, `Change ${index}: expected moveRole "${expected}", got "${change.moveRole}"`);
});

Then('change {int} has {int} discussion entries', function (this: ChangeTracksWorld, index: number, count: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.ok(change.metadata?.discussion, `Change ${index}: expected discussion array`);
    assert.strictEqual(
        change.metadata!.discussion!.length,
        count,
        `Change ${index}: expected ${count} discussion entries, got ${change.metadata!.discussion!.length}`
    );
});

Then('change {int} discussion entry {int} has author {string}', function (
    this: ChangeTracksWorld, changeIndex: number, entryIndex: number, expected: string
) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[changeIndex - 1];
    assert.ok(change, `Change ${changeIndex} does not exist`);
    assert.ok(change.metadata?.discussion, `Change ${changeIndex}: no discussion`);
    const entry = change.metadata!.discussion![entryIndex - 1];
    assert.ok(entry, `Discussion entry ${entryIndex} does not exist`);
    assert.strictEqual(entry.author, expected, `Discussion entry ${entryIndex}: expected author "${expected}", got "${entry.author}"`);
});

Then('change {int} discussion entry {int} has depth {int}', function (
    this: ChangeTracksWorld, changeIndex: number, entryIndex: number, expected: number
) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[changeIndex - 1];
    assert.ok(change, `Change ${changeIndex} does not exist`);
    assert.ok(change.metadata?.discussion, `Change ${changeIndex}: no discussion`);
    const entry = change.metadata!.discussion![entryIndex - 1];
    assert.ok(entry, `Discussion entry ${entryIndex} does not exist`);
    assert.strictEqual(entry.depth, expected, `Discussion entry ${entryIndex}: expected depth ${expected}, got ${entry.depth}`);
});

Then('change {int} discussion includes author {string}', function (
    this: ChangeTracksWorld, changeIndex: number, expected: string
) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[changeIndex - 1];
    assert.ok(change, `Change ${changeIndex} does not exist`);
    assert.ok(change.metadata?.discussion, `Change ${changeIndex}: no discussion`);
    const authors = change.metadata!.discussion!.map(d => d.author);
    assert.ok(authors.includes(expected), `Discussion authors [${authors.join(', ')}] do not include "${expected}"`);
});

Then('change {int} has {int} approvals', function (this: ChangeTracksWorld, index: number, count: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.ok(change.metadata?.approvals, `Change ${index}: expected approvals array`);
    assert.strictEqual(
        change.metadata!.approvals!.length,
        count,
        `Change ${index}: expected ${count} approvals, got ${change.metadata!.approvals!.length}`
    );
});

Then('change {int} approval {int} has author {string}', function (
    this: ChangeTracksWorld, changeIndex: number, approvalIndex: number, expected: string
) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[changeIndex - 1];
    assert.ok(change, `Change ${changeIndex} does not exist`);
    assert.ok(change.metadata?.approvals, `Change ${changeIndex}: no approvals`);
    const approval = change.metadata!.approvals![approvalIndex - 1];
    assert.ok(approval, `Approval ${approvalIndex} does not exist`);
    assert.strictEqual(approval.author, expected, `Approval ${approvalIndex}: expected author "${expected}", got "${approval.author}"`);
});

Then('change {int} approval {int} has date {string}', function (
    this: ChangeTracksWorld, changeIndex: number, approvalIndex: number, expected: string
) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[changeIndex - 1];
    assert.ok(change, `Change ${changeIndex} does not exist`);
    assert.ok(change.metadata?.approvals, `Change ${changeIndex}: no approvals`);
    const approval = change.metadata!.approvals![approvalIndex - 1];
    assert.ok(approval, `Approval ${approvalIndex} does not exist`);
    assert.strictEqual(approval.date, expected, `Approval ${approvalIndex}: expected date "${expected}", got "${approval.date}"`);
});

Then('change {int} has context {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.strictEqual(change.metadata?.context, expected, `Change ${index}: expected context "${expected}", got "${change.metadata?.context}"`);
});

Then('change {int} has resolution type {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.ok(change.metadata?.resolution, `Change ${index}: expected resolution metadata`);
    assert.strictEqual(
        change.metadata!.resolution!.type,
        expected,
        `Change ${index}: expected resolution type "${expected}", got "${change.metadata!.resolution!.type}"`
    );
});

Then('change {int} has resolution author {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.ok(change.metadata?.resolution, `Change ${index}: no resolution`);
    assert.strictEqual(
        (change.metadata!.resolution! as any).author,
        expected,
        `Change ${index}: expected resolution author "${expected}"`
    );
});

Then('change {int} has resolution reason {string}', function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.ok(change.metadata?.resolution, `Change ${index}: no resolution`);
    assert.strictEqual(
        (change.metadata!.resolution! as any).reason,
        expected,
        `Change ${index}: expected resolution reason "${expected}"`
    );
});

Then('change {int} has {int} revisions', function (this: ChangeTracksWorld, index: number, count: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[index - 1];
    assert.ok(change, `Change ${index} does not exist`);
    assert.ok(change.metadata?.revisions, `Change ${index}: expected revisions array`);
    assert.strictEqual(
        change.metadata!.revisions!.length,
        count,
        `Change ${index}: expected ${count} revisions, got ${change.metadata!.revisions!.length}`
    );
});

Then('change {int} revision {int} has text {string}', function (
    this: ChangeTracksWorld, changeIndex: number, revIndex: number, expected: string
) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes[changeIndex - 1];
    assert.ok(change, `Change ${changeIndex} does not exist`);
    assert.ok(change.metadata?.revisions, `Change ${changeIndex}: no revisions`);
    const rev = change.metadata!.revisions![revIndex - 1];
    assert.ok(rev, `Revision ${revIndex} does not exist`);
    assert.strictEqual(rev.text, expected, `Revision ${revIndex}: expected text "${expected}", got "${rev.text}"`);
});

// ── Operation-tier: count occurrences of a pattern ──────────────────

Then('the document text matches {string} exactly {int} times', function (
    this: ChangeTracksWorld, pattern: string, count: number
) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    const matches = this.operationText!.match(new RegExp(pattern, 'g')) || [];
    assert.strictEqual(
        matches.length,
        count,
        `Expected pattern "${pattern}" to match ${count} times, but found ${matches.length} in:\n${this.operationText}`
    );
});

Then('the document text starts with {string}', function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    assert.ok(
        this.operationText!.startsWith(expected),
        `Expected document to start with "${expected}" but got:\n${this.operationText!.substring(0, expected.length + 20)}`
    );
});

Then('the document line starting with {string} contains {string}', function (
    this: ChangeTracksWorld, lineStart: string, expected: string
) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    const line = this.operationText!.split('\n').find(l => l.startsWith(lineStart));
    assert.ok(line, `No line starting with "${lineStart}" found in:\n${this.operationText}`);
    assert.ok(
        line!.includes(expected),
        `Line starting with "${lineStart}" does not contain "${expected}". Line: "${line}"`
    );
});

Then('no line in the document matches {string}', function (this: ChangeTracksWorld, pattern: string) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    const re = new RegExp(pattern);
    const lines = this.operationText!.split('\n');
    for (const line of lines) {
        assert.ok(!re.test(line), `Line "${line}" matches pattern "${pattern}" but should not`);
    }
});

// ── Change-by-id lookup on parse result ─────────────────────────────

Then('change with id {string} has status {string}', function (
    this: ChangeTracksWorld, id: string, statusName: string
) {
    assert.ok(this.parseResult, 'No parse result');
    const STATUS_MAP: Record<string, ChangeStatus> = {
        proposed: ChangeStatus.Proposed,
        accepted: ChangeStatus.Accepted,
        rejected: ChangeStatus.Rejected,
    };
    const expectedStatus = STATUS_MAP[statusName.toLowerCase()];
    assert.ok(expectedStatus !== undefined, `Unknown status "${statusName}"`);
    const changes = this.parseResult.getChanges();
    const change = changes.find(c => c.id === id);
    assert.ok(change, `No change with id "${id}" found`);
    assert.strictEqual(change!.status, expectedStatus, `Change ${id}: expected status "${statusName}", got "${change!.status}"`);
});

Then('change with id {string} has author {string}', function (
    this: ChangeTracksWorld, id: string, expected: string
) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const change = changes.find(c => c.id === id);
    assert.ok(change, `No change with id "${id}" found`);
    assert.strictEqual(change!.metadata?.author, expected, `Change ${id}: expected author "${expected}", got "${change!.metadata?.author}"`);
});

// ── Filtering assertions on parsed changes ──────────────────────────

Then('there are {int} substitutions', function (this: ChangeTracksWorld, count: number) {
    assert.ok(this.parseResult, 'No parse result');
    const subs = this.parseResult.getChanges().filter(c => c.type === ChangeType.Substitution);
    assert.strictEqual(subs.length, count, `Expected ${count} substitutions, got ${subs.length}`);
});

Then('there are {int} insertions', function (this: ChangeTracksWorld, count: number) {
    assert.ok(this.parseResult, 'No parse result');
    const ins = this.parseResult.getChanges().filter(c => c.type === ChangeType.Insertion);
    assert.strictEqual(ins.length, count, `Expected ${count} insertions, got ${ins.length}`);
});

Then('all changes share group prefix {string}', function (this: ChangeTracksWorld, prefix: string) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    for (const change of changes) {
        assert.ok(
            change.id.startsWith(prefix),
            `Expected change id "${change.id}" to start with "${prefix}"`
        );
    }
});

// ── Cross-surface: re-parse operationText and assert ─────────────────

When('I re-parse the document text', function (this: ChangeTracksWorld) {
    assert.ok(this.operationText !== undefined, 'Document text not set');
    const parser = new CriticMarkupParser();
    this.parseResult = parser.parse(this.operationText!);
});

Then('{int} inline changes remain', function (this: ChangeTracksWorld, expected: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const inlineChanges = changes.filter(c => !c.settled);
    assert.strictEqual(
        inlineChanges.length,
        expected,
        `Expected ${expected} inline changes, got ${inlineChanges.length}`
    );
});

Then('{int} settled changes exist', function (this: ChangeTracksWorld, expected: number) {
    assert.ok(this.parseResult, 'No parse result');
    const changes = this.parseResult.getChanges();
    const settled = changes.filter(c => c.settled);
    assert.strictEqual(
        settled.length,
        expected,
        `Expected ${expected} settled changes, got ${settled.length}`
    );
});

Then('the settled change has status {string}', function (this: ChangeTracksWorld, statusName: string) {
    assert.ok(this.parseResult, 'No parse result');
    const STATUS_MAP: Record<string, ChangeStatus> = {
        proposed: ChangeStatus.Proposed,
        accepted: ChangeStatus.Accepted,
        rejected: ChangeStatus.Rejected,
    };
    const expected = STATUS_MAP[statusName.toLowerCase()];
    assert.ok(expected !== undefined, `Unknown status "${statusName}"`);
    const settled = this.parseResult.getChanges().filter(c => c.settled);
    assert.ok(settled.length > 0, 'No settled changes found');
    assert.strictEqual(settled[0].status, expected, `Settled change: expected status "${statusName}", got "${settled[0].status}"`);
});
