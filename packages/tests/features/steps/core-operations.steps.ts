import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeTracksWorld } from './world.js';
import {
  CriticMarkupParser,
  computeAccept,
  computeReject,
  computeFootnoteStatusEdits,
  computeApprovalLineEdit,
  computeSettledText,
  settleAcceptedChangesOnly,
  parseFootnotes,
  initHashline,
  computeLineHash,
  formatHashLines,
  parseLineRef,
  validateLineRef,
  HashlineMismatchError,
  defaultNormalizer,
  normalizedIndexOf,
  collapseWhitespace,
  whitespaceCollapsedFind,
  whitespaceCollapsedIsAmbiguous,
  type TextEdit,
  type ChangeNode,
} from '@changetracks/core';

// =============================================================================
// Shared state extensions on the World class
// =============================================================================
// We store additional per-scenario state directly on the world instance
// using type augmentation via declaration merging.

declare module './world.js' {
  interface ChangeTracksWorld {
    footnoteMap: Map<string, any> | null;
    lastHash: string;
    formattedOutput: string;
    parsedRef: { line: number; hash: string } | null;
    fileLines: string[];
    validationPassed: boolean;
    normalizedText: string;
    normalizedIndex: number;
    collapsedText: string;
    wsMatch: { index: number; length: number; originalText: string } | null;
    resultText: string;
    statusEdits: TextEdit[];
    approvalEdit: TextEdit | null;
    settledContent: string;
    settledIds: string[];
    settledText: string;
  }
}

// =============================================================================
// C8 - Footnote Parsing Steps
// =============================================================================

Given('the footnote parser is initialized', function (this: ChangeTracksWorld) {
  this.footnoteMap = null;
});

When('I parse footnotes from:', function (this: ChangeTracksWorld, content: string) {
  this.footnoteMap = parseFootnotes(content);
});

Then('the footnote map has {int} entry/entries', function (this: ChangeTracksWorld, count: number) {
  assert.ok(this.footnoteMap, 'Footnote map not initialized');
  assert.equal(this.footnoteMap.size, count);
});

Then(
  'footnote {string} has author {string}',
  function (this: ChangeTracksWorld, id: string, expected: string) {
    assert.ok(this.footnoteMap, 'Footnote map not initialized');
    const fn = this.footnoteMap.get(id);
    assert.ok(fn, `Footnote "${id}" not found`);
    assert.equal(fn.author, expected);
  },
);

Then(
  'footnote {string} has date {string}',
  function (this: ChangeTracksWorld, id: string, expected: string) {
    assert.ok(this.footnoteMap, 'Footnote map not initialized');
    const fn = this.footnoteMap.get(id);
    assert.ok(fn, `Footnote "${id}" not found`);
    assert.equal(fn.date, expected);
  },
);

Then(
  'footnote {string} has type {string}',
  function (this: ChangeTracksWorld, id: string, expected: string) {
    assert.ok(this.footnoteMap, 'Footnote map not initialized');
    const fn = this.footnoteMap.get(id);
    assert.ok(fn, `Footnote "${id}" not found`);
    assert.equal(fn.type, expected);
  },
);

Then(
  'footnote {string} has status {string}',
  function (this: ChangeTracksWorld, id: string, expected: string) {
    assert.ok(this.footnoteMap, 'Footnote map not initialized');
    const fn = this.footnoteMap.get(id);
    assert.ok(fn, `Footnote "${id}" not found`);
    assert.equal(fn.status, expected);
  },
);

Then(
  'footnote {string} has reason {string}',
  function (this: ChangeTracksWorld, id: string, expected: string) {
    assert.ok(this.footnoteMap, 'Footnote map not initialized');
    const fn = this.footnoteMap.get(id);
    assert.ok(fn, `Footnote "${id}" not found`);
    assert.equal(fn.reason, expected);
  },
);

Then(
  'footnote {string} has reply count {int}',
  function (this: ChangeTracksWorld, id: string, expected: number) {
    assert.ok(this.footnoteMap, 'Footnote map not initialized');
    const fn = this.footnoteMap.get(id);
    assert.ok(fn, `Footnote "${id}" not found`);
    assert.equal(fn.replyCount, expected);
  },
);

Then(
  'footnote {string} has start line {int}',
  function (this: ChangeTracksWorld, id: string, expected: number) {
    assert.ok(this.footnoteMap, 'Footnote map not initialized');
    const fn = this.footnoteMap.get(id);
    assert.ok(fn, `Footnote "${id}" not found`);
    assert.equal(fn.startLine, expected);
  },
);

Then(
  'footnote {string} has end line {int}',
  function (this: ChangeTracksWorld, id: string, expected: number) {
    assert.ok(this.footnoteMap, 'Footnote map not initialized');
    const fn = this.footnoteMap.get(id);
    assert.ok(fn, `Footnote "${id}" not found`);
    assert.equal(fn.endLine, expected);
  },
);

// =============================================================================
// C8 Level 2 - Full Parser Metadata Steps
// =============================================================================
// These steps verify Level 2 metadata fields (approvals, rejections,
// request-changes, context, revisions, discussion, resolution) on
// ChangeNode.metadata, populated by CriticMarkupParser.parse().

// --- Approvals ---

Then(
  'change {int} has {int} approval(s)',
  function (this: ChangeTracksWorld, changeIdx: number, count: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.approvals?.length ?? 0, count);
  },
);

Then(
  'change {int} approval {int} has author {string}',
  function (this: ChangeTracksWorld, changeIdx: number, approvalIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const a = c.metadata?.approvals?.[approvalIdx - 1];
    assert.ok(a, `No approval at index ${approvalIdx}`);
    assert.strictEqual(a.author, expected);
  },
);

Then(
  'change {int} approval {int} has date {string}',
  function (this: ChangeTracksWorld, changeIdx: number, approvalIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const a = c.metadata?.approvals?.[approvalIdx - 1];
    assert.ok(a, `No approval at index ${approvalIdx}`);
    assert.strictEqual(a.date, expected);
  },
);

Then(
  'change {int} approval {int} has reason {string}',
  function (this: ChangeTracksWorld, changeIdx: number, approvalIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const a = c.metadata?.approvals?.[approvalIdx - 1];
    assert.ok(a, `No approval at index ${approvalIdx}`);
    assert.strictEqual(a.reason, expected);
  },
);

Then(
  'change {int} approval {int} has no reason',
  function (this: ChangeTracksWorld, changeIdx: number, approvalIdx: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const a = c.metadata?.approvals?.[approvalIdx - 1];
    assert.ok(a, `No approval at index ${approvalIdx}`);
    assert.strictEqual(a.reason, undefined);
  },
);

Then(
  'change {int} has no approvals',
  function (this: ChangeTracksWorld, changeIdx: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.approvals, undefined);
  },
);

// --- Rejections ---

Then(
  'change {int} has {int} rejection(s)',
  function (this: ChangeTracksWorld, changeIdx: number, count: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.rejections?.length ?? 0, count);
  },
);

Then(
  'change {int} rejection {int} has author {string}',
  function (this: ChangeTracksWorld, changeIdx: number, rejIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const r = c.metadata?.rejections?.[rejIdx - 1];
    assert.ok(r, `No rejection at index ${rejIdx}`);
    assert.strictEqual(r.author, expected);
  },
);

Then(
  'change {int} rejection {int} has date {string}',
  function (this: ChangeTracksWorld, changeIdx: number, rejIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const r = c.metadata?.rejections?.[rejIdx - 1];
    assert.ok(r, `No rejection at index ${rejIdx}`);
    assert.strictEqual(r.date, expected);
  },
);

Then(
  'change {int} rejection {int} has reason {string}',
  function (this: ChangeTracksWorld, changeIdx: number, rejIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const r = c.metadata?.rejections?.[rejIdx - 1];
    assert.ok(r, `No rejection at index ${rejIdx}`);
    assert.strictEqual(r.reason, expected);
  },
);

// --- Request-Changes ---

Then(
  'change {int} has {int} request-change(s)',
  function (this: ChangeTracksWorld, changeIdx: number, count: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.requestChanges?.length ?? 0, count);
  },
);

Then(
  'change {int} request-change {int} has author {string}',
  function (this: ChangeTracksWorld, changeIdx: number, rcIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const rc = c.metadata?.requestChanges?.[rcIdx - 1];
    assert.ok(rc, `No request-change at index ${rcIdx}`);
    assert.strictEqual(rc.author, expected);
  },
);

Then(
  'change {int} request-change {int} has date {string}',
  function (this: ChangeTracksWorld, changeIdx: number, rcIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const rc = c.metadata?.requestChanges?.[rcIdx - 1];
    assert.ok(rc, `No request-change at index ${rcIdx}`);
    assert.strictEqual(rc.date, expected);
  },
);

Then(
  'change {int} request-change {int} has reason {string}',
  function (this: ChangeTracksWorld, changeIdx: number, rcIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const rc = c.metadata?.requestChanges?.[rcIdx - 1];
    assert.ok(rc, `No request-change at index ${rcIdx}`);
    assert.strictEqual(rc.reason, expected);
  },
);

// --- Context ---

Then(
  'change {int} has context {string}',
  function (this: ChangeTracksWorld, changeIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.context, expected);
  },
);

Then(
  'change {int} has no context',
  function (this: ChangeTracksWorld, changeIdx: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.context, undefined);
  },
);

// --- Revisions ---

Then(
  'change {int} has {int} revision(s)',
  function (this: ChangeTracksWorld, changeIdx: number, count: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.revisions?.length ?? 0, count);
  },
);

Then(
  'change {int} has no revisions',
  function (this: ChangeTracksWorld, changeIdx: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.revisions, undefined);
  },
);

Then(
  'change {int} revision {int} has label {string}',
  function (this: ChangeTracksWorld, changeIdx: number, revIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const r = c.metadata?.revisions?.[revIdx - 1];
    assert.ok(r, `No revision at index ${revIdx}`);
    assert.strictEqual(r.label, expected);
  },
);

Then(
  'change {int} revision {int} has author {string}',
  function (this: ChangeTracksWorld, changeIdx: number, revIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const r = c.metadata?.revisions?.[revIdx - 1];
    assert.ok(r, `No revision at index ${revIdx}`);
    assert.strictEqual(r.author, expected);
  },
);

Then(
  'change {int} revision {int} has date {string}',
  function (this: ChangeTracksWorld, changeIdx: number, revIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const r = c.metadata?.revisions?.[revIdx - 1];
    assert.ok(r, `No revision at index ${revIdx}`);
    assert.strictEqual(r.date, expected);
  },
);

Then(
  'change {int} revision {int} has text {string}',
  function (this: ChangeTracksWorld, changeIdx: number, revIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const r = c.metadata?.revisions?.[revIdx - 1];
    assert.ok(r, `No revision at index ${revIdx}`);
    assert.strictEqual(r.text, expected);
  },
);

// --- Discussion ---

Then(
  'change {int} has {int} discussion comment(s)',
  function (this: ChangeTracksWorld, changeIdx: number, count: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.discussion?.length ?? 0, count);
  },
);

Then(
  'change {int} has no discussion',
  function (this: ChangeTracksWorld, changeIdx: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.discussion, undefined);
  },
);

Then(
  'change {int} discussion {int} has author {string}',
  function (this: ChangeTracksWorld, changeIdx: number, discIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const d = c.metadata?.discussion?.[discIdx - 1];
    assert.ok(d, `No discussion comment at index ${discIdx}`);
    assert.strictEqual(d.author, expected);
  },
);

Then(
  'change {int} discussion {int} has date {string}',
  function (this: ChangeTracksWorld, changeIdx: number, discIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const d = c.metadata?.discussion?.[discIdx - 1];
    assert.ok(d, `No discussion comment at index ${discIdx}`);
    assert.strictEqual(d.date, expected);
  },
);

Then(
  'change {int} discussion {int} has text {string}',
  function (this: ChangeTracksWorld, changeIdx: number, discIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const d = c.metadata?.discussion?.[discIdx - 1];
    assert.ok(d, `No discussion comment at index ${discIdx}`);
    assert.strictEqual(d.text, expected);
  },
);

Then(
  'change {int} discussion {int} has multiline text:',
  function (this: ChangeTracksWorld, changeIdx: number, discIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const d = c.metadata?.discussion?.[discIdx - 1];
    assert.ok(d, `No discussion comment at index ${discIdx}`);
    assert.strictEqual(d.text, expected);
  },
);

Then(
  'change {int} discussion {int} has depth {int}',
  function (this: ChangeTracksWorld, changeIdx: number, discIdx: number, expected: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const d = c.metadata?.discussion?.[discIdx - 1];
    assert.ok(d, `No discussion comment at index ${discIdx}`);
    assert.strictEqual(d.depth, expected);
  },
);

Then(
  'change {int} discussion {int} has label {string}',
  function (this: ChangeTracksWorld, changeIdx: number, discIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const d = c.metadata?.discussion?.[discIdx - 1];
    assert.ok(d, `No discussion comment at index ${discIdx}`);
    assert.strictEqual(d.label, expected);
  },
);

// --- Resolution ---

Then(
  'change {int} has resolution type {string}',
  function (this: ChangeTracksWorld, changeIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.ok(c.metadata?.resolution, `Change ${changeIdx} has no resolution`);
    assert.strictEqual(c.metadata.resolution.type, expected);
  },
);

Then(
  'change {int} has no resolution',
  function (this: ChangeTracksWorld, changeIdx: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.resolution, undefined);
  },
);

Then(
  'change {int} resolution has author {string}',
  function (this: ChangeTracksWorld, changeIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const res = c.metadata?.resolution;
    assert.ok(res, `Change ${changeIdx} has no resolution`);
    assert.strictEqual(res.type, 'resolved', 'Resolution author only exists on resolved type');
    assert.strictEqual((res as any).author, expected);
  },
);

Then(
  'change {int} resolution has date {string}',
  function (this: ChangeTracksWorld, changeIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const res = c.metadata?.resolution;
    assert.ok(res, `Change ${changeIdx} has no resolution`);
    assert.strictEqual(res.type, 'resolved', 'Resolution date only exists on resolved type');
    assert.strictEqual((res as any).date, expected);
  },
);

Then(
  'change {int} resolution has reason {string}',
  function (this: ChangeTracksWorld, changeIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const res = c.metadata?.resolution;
    assert.ok(res, `Change ${changeIdx} has no resolution`);
    assert.strictEqual(res.reason, expected);
  },
);

Then(
  'change {int} resolution has no reason',
  function (this: ChangeTracksWorld, changeIdx: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    const res = c.metadata?.resolution;
    assert.ok(res, `Change ${changeIdx} has no resolution`);
    assert.strictEqual(res.reason, undefined);
  },
);

// --- Metadata author / date / comment ---

Then(
  'change {int} has metadata author {string}',
  function (this: ChangeTracksWorld, changeIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.author, expected);
  },
);

Then(
  'change {int} has metadata date {string}',
  function (this: ChangeTracksWorld, changeIdx: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.date, expected);
  },
);

Then(
  'change {int} has no metadata comment',
  function (this: ChangeTracksWorld, changeIdx: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[changeIdx - 1];
    assert.ok(c, `No change at index ${changeIdx}`);
    assert.strictEqual(c.metadata?.comment, undefined);
  },
);

// =============================================================================
// C9 - Hashline Computation Steps
// =============================================================================

Given('the hashline module is initialized', async function (this: ChangeTracksWorld) {
  await initHashline();
  this.lastHash = '';
  this.formattedOutput = '';
  this.parsedRef = null;
  this.fileLines = [];
  this.validationPassed = false;
});

When(
  'I compute the hash of {string} at index {int}',
  function (this: ChangeTracksWorld, content: string, idx: number) {
    // Handle escape sequences in test strings
    const unescaped = content.replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    this.lastHash = computeLineHash(idx, unescaped);
  },
);

Then(
  'the hash is a valid 2-char hex string',
  function (this: ChangeTracksWorld) {
    assert.match(this.lastHash, /^[0-9a-f]{2}$/);
  },
);

Then(
  'the hash of {string} at index {int} equals the hash of {string} at index {int}',
  function (
    this: ChangeTracksWorld,
    content1: string,
    idx1: number,
    content2: string,
    idx2: number,
  ) {
    const c1 = content1.replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    const c2 = content2.replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    const h1 = computeLineHash(idx1, c1);
    const h2 = computeLineHash(idx2, c2);
    assert.equal(h1, h2);
  },
);

Then(
  'the hash of {string} at index {int} does not equal the hash of {string} at index {int}',
  function (
    this: ChangeTracksWorld,
    content1: string,
    idx1: number,
    content2: string,
    idx2: number,
  ) {
    const c1 = content1.replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    const c2 = content2.replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    const h1 = computeLineHash(idx1, c1);
    const h2 = computeLineHash(idx2, c2);
    assert.notEqual(h1, h2);
  },
);

When(
  'I format hash lines for {string}',
  function (this: ChangeTracksWorld, content: string) {
    const unescaped = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    this.formattedOutput = formatHashLines(unescaped);
  },
);

When(
  'I format hash lines for {string} starting at line {int}',
  function (this: ChangeTracksWorld, content: string, startLine: number) {
    const unescaped = content.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    this.formattedOutput = formatHashLines(unescaped, startLine);
  },
);

Then(
  'the formatted output has {int} lines',
  function (this: ChangeTracksWorld, expected: number) {
    const lines = this.formattedOutput.split('\n');
    assert.equal(lines.length, expected);
  },
);

Then(
  'the formatted output line {int} is a valid hashline for {string}',
  function (this: ChangeTracksWorld, lineNum: number, content: string) {
    const lines = this.formattedOutput.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    const line = lines[lineNum - 1];
    // Validate format: N:HH|content
    assert.match(line, /^\d+:[0-9a-f]{2}\|/);
    assert.ok(line.endsWith(content), `Expected line to end with "${content}" but got: "${line}"`);
  },
);

Then(
  'the formatted output line {int} starts with {string}',
  function (this: ChangeTracksWorld, lineNum: number, prefix: string) {
    const lines = this.formattedOutput.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    assert.ok(
      lines[lineNum - 1].startsWith(prefix),
      `Expected line ${lineNum} to start with "${prefix}" but got: "${lines[lineNum - 1]}"`,
    );
  },
);

When(
  'I parse line ref {string}',
  function (this: ChangeTracksWorld, ref: string) {
    this.parsedRef = parseLineRef(ref);
  },
);

Then('the parsed line is {int}', function (this: ChangeTracksWorld, expected: number) {
  assert.ok(this.parsedRef, 'No parsed ref available');
  assert.equal(this.parsedRef.line, expected);
});

Then(
  'the parsed hash is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(this.parsedRef, 'No parsed ref available');
    assert.equal(this.parsedRef.hash, expected);
  },
);

Then(
  'parsing line ref {string} throws an invalid ref error',
  function (this: ChangeTracksWorld, ref: string) {
    assert.throws(() => parseLineRef(ref), /invalid.*ref/i);
  },
);

Then(
  'parsing line ref {string} throws a line-must-be-positive error',
  function (this: ChangeTracksWorld, ref: string) {
    assert.throws(() => parseLineRef(ref), /line.*must be >= 1/i);
  },
);

Given(
  'file lines {string} and {string}',
  function (this: ChangeTracksWorld, line1: string, line2: string) {
    this.fileLines = [line1, line2];
  },
);

When(
  'I validate line ref {int} against the file lines',
  function (this: ChangeTracksWorld, lineNum: number) {
    const hash = computeLineHash(lineNum - 1, this.fileLines[lineNum - 1], this.fileLines);
    validateLineRef({ line: lineNum, hash }, this.fileLines);
    this.validationPassed = true;
  },
);

When(
  'I validate line ref {int} with uppercase hash against the file lines',
  function (this: ChangeTracksWorld, lineNum: number) {
    const hash = computeLineHash(lineNum - 1, this.fileLines[lineNum - 1], this.fileLines).toUpperCase();
    validateLineRef({ line: lineNum, hash }, this.fileLines);
    this.validationPassed = true;
  },
);

Then('the validation passes', function (this: ChangeTracksWorld) {
  assert.ok(this.validationPassed, 'Validation did not pass');
});

Then(
  'validating line ref {int} against the file lines throws an Error',
  function (this: ChangeTracksWorld, lineNum: number) {
    assert.throws(
      () => validateLineRef({ line: lineNum, hash: 'ff' }, this.fileLines),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  },
);

// =============================================================================
// C10 - Unicode Normalization Steps
// =============================================================================

When(
  'I normalize {string}',
  function (this: ChangeTracksWorld, input: string) {
    // Process escape sequences for unicode
    const unescaped = unescapeUnicode(input);
    this.normalizedText = defaultNormalizer(unescaped);
  },
);

Then(
  'the normalized text is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const unescaped = unescapeUnicode(expected);
    assert.equal(this.normalizedText, unescaped);
  },
);

When(
  'I find {string} in {string}',
  function (this: ChangeTracksWorld, target: string, text: string) {
    const t = unescapeUnicode(target);
    const s = unescapeUnicode(text);
    this.normalizedIndex = normalizedIndexOf(s, t);
  },
);

Then(
  'the normalized index is {int}',
  function (this: ChangeTracksWorld, expected: number) {
    assert.equal(this.normalizedIndex, expected);
  },
);

When(
  'I collapse whitespace in {string}',
  function (this: ChangeTracksWorld, input: string) {
    const unescaped = input.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    this.collapsedText = collapseWhitespace(unescaped);
  },
);

Then(
  'the collapsed text is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.equal(this.collapsedText, expected);
  },
);

When(
  'I find {string} in {string} with whitespace collapsing',
  function (this: ChangeTracksWorld, target: string, text: string) {
    const t = target.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    const s = text.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    this.wsMatch = whitespaceCollapsedFind(s, t) ?? null;
  },
);

Then(
  'the whitespace-collapsed match index is {int}',
  function (this: ChangeTracksWorld, expected: number) {
    assert.ok(this.wsMatch, 'No whitespace-collapsed match found');
    assert.equal(this.wsMatch.index, expected);
  },
);

Then(
  'the whitespace-collapsed match length is {int}',
  function (this: ChangeTracksWorld, expected: number) {
    assert.ok(this.wsMatch, 'No whitespace-collapsed match found');
    assert.equal(this.wsMatch.length, expected);
  },
);

Then(
  'the whitespace-collapsed match is null',
  function (this: ChangeTracksWorld) {
    assert.equal(this.wsMatch, null);
  },
);

Then(
  '{string} in {string} is not ambiguous under whitespace collapsing',
  function (this: ChangeTracksWorld, target: string, text: string) {
    assert.equal(whitespaceCollapsedIsAmbiguous(text, target), false);
  },
);

Then(
  '{string} in {string} is ambiguous under whitespace collapsing',
  function (this: ChangeTracksWorld, target: string, text: string) {
    assert.equal(whitespaceCollapsedIsAmbiguous(text, target), true);
  },
);

// =============================================================================
// C11 - Accept/Reject Steps
// =============================================================================

Given('the parser is initialized', function (this: ChangeTracksWorld) {
  this.parser = new CriticMarkupParser();
  this.resultText = '';
});

// NOTE: "When I parse the text" is defined in core-parser.steps.ts (Task 3).
// We reuse it -- it sets this.lastDoc via this.parser.parse(this.lastText).

// NOTE: "Given the text {string}" is defined in core-parser.steps.ts (Task 3).
// We use "the text is {string}" (with "is") to avoid collision.

Given(
  'the text is {string}',
  function (this: ChangeTracksWorld, text: string) {
    this.lastText = text;
  },
);

Given('the text is:', function (this: ChangeTracksWorld, text: string) {
  this.lastText = text;
});

When('I accept change {int}', function (this: ChangeTracksWorld, index: number) {
  assert.ok(this.lastDoc, 'No parsed document available');
  const changes = this.lastDoc.getChanges();
  assert.ok(index < changes.length, `Change index ${index} out of range (${changes.length} changes)`);
  const edit = computeAccept(changes[index]);
  // Apply edit to current text (use resultText if we've already applied changes, otherwise lastText)
  const text = this.resultText || this.lastText;
  this.resultText = applyEdit(text, edit);
});

When('I reject change {int}', function (this: ChangeTracksWorld, index: number) {
  assert.ok(this.lastDoc, 'No parsed document available');
  const changes = this.lastDoc.getChanges();
  assert.ok(index < changes.length, `Change index ${index} out of range (${changes.length} changes)`);
  const edit = computeReject(changes[index]);
  const text = this.resultText || this.lastText;
  this.resultText = applyEdit(text, edit);
});

When('I accept all changes', function (this: ChangeTracksWorld) {
  assert.ok(this.lastDoc, 'No parsed document available');
  const changes = this.lastDoc.getChanges();
  // Process in reverse document order to preserve ranges
  const edits = [...changes]
    .sort((a, b) => b.range.start - a.range.start)
    .map(computeAccept);
  let text = this.lastText;
  for (const edit of edits) {
    text = applyEdit(text, edit);
  }
  this.resultText = text;
});

When('I reject all changes', function (this: ChangeTracksWorld) {
  assert.ok(this.lastDoc, 'No parsed document available');
  const changes = this.lastDoc.getChanges();
  // Process in reverse document order to preserve ranges
  const edits = [...changes]
    .sort((a, b) => b.range.start - a.range.start)
    .map(computeReject);
  let text = this.lastText;
  for (const edit of edits) {
    text = applyEdit(text, edit);
  }
  this.resultText = text;
});

Then(
  'the resulting text is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.equal(this.resultText, expected);
  },
);

Then(
  'the resulting text contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(
      this.resultText.includes(expected),
      `Expected result to contain "${expected}" but got: "${this.resultText}"`,
    );
  },
);

Then(
  'the resulting text does not contain {string}',
  function (this: ChangeTracksWorld, unexpected: string) {
    assert.ok(
      !this.resultText.includes(unexpected),
      `Expected result NOT to contain "${unexpected}" but it does: "${this.resultText}"`,
    );
  },
);

// --- Footnote status edits ---

When(
  'I compute footnote status edits for {string} to {string}',
  function (this: ChangeTracksWorld, changeId: string, newStatus: string) {
    this.statusEdits = computeFootnoteStatusEdits(
      this.lastText,
      [changeId],
      newStatus as 'accepted' | 'rejected',
    );
  },
);

When('I apply the status edits', function (this: ChangeTracksWorld) {
  // Apply edits in reverse offset order to preserve positions
  const sorted = [...this.statusEdits].sort((a, b) => b.offset - a.offset);
  let text = this.lastText;
  for (const edit of sorted) {
    text = applyEdit(text, edit);
  }
  this.resultText = text;
});

Then(
  'the footnote status edits are empty',
  function (this: ChangeTracksWorld) {
    assert.equal(this.statusEdits.length, 0);
  },
);

// --- Multiline resulting text assertion ---

Then('the resulting text is:', function (this: ChangeTracksWorld, expected: string) {
  assert.equal(this.resultText, expected);
});

// --- Approval line edit steps ---

When(
  'I compute approval line edit for {string} as {string} by {string} on {string}',
  function (this: ChangeTracksWorld, changeId: string, decision: string, author: string, date: string) {
    this.approvalEdit = computeApprovalLineEdit(
      this.lastText,
      changeId,
      decision as 'accepted' | 'rejected',
      { author, date },
    );
  },
);

When('I apply the approval edit', function (this: ChangeTracksWorld) {
  assert.ok(this.approvalEdit !== null, 'No approval edit to apply (was null)');
  this.resultText = applyEdit(this.lastText, this.approvalEdit!);
});

Then('the approval edit is null', function (this: ChangeTracksWorld) {
  assert.equal(this.approvalEdit, null);
});

// =============================================================================
// C12 - Settlement Steps
// =============================================================================

When(
  'I compute settled text for {string}',
  function (this: ChangeTracksWorld, input: string) {
    const unescaped = input.replace(/\\n/g, '\n');
    this.settledText = computeSettledText(unescaped);
  },
);

When(
  'I compute settled text for:',
  function (this: ChangeTracksWorld, input: string) {
    this.settledText = computeSettledText(input);
  },
);

Then(
  'the settled text is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const unescaped = expected.replace(/\\n/g, '\n');
    assert.equal(this.settledText, unescaped);
  },
);

When(
  'I settle accepted changes in:',
  function (this: ChangeTracksWorld, input: string) {
    const result = settleAcceptedChangesOnly(input);
    this.settledContent = result.settledContent;
    this.settledIds = result.settledIds;
  },
);

Then(
  'the settled content contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(
      this.settledContent.includes(expected),
      `Expected settled content to contain "${expected}" but got:\n${this.settledContent}`,
    );
  },
);

Then(
  'the settled content does not contain {string}',
  function (this: ChangeTracksWorld, unexpected: string) {
    assert.ok(
      !this.settledContent.includes(unexpected),
      `Expected settled content NOT to contain "${unexpected}" but it does`,
    );
  },
);

Then(
  'the settled IDs include {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(
      this.settledIds.includes(expected),
      `Expected settled IDs to include "${expected}" but got: ${JSON.stringify(this.settledIds)}`,
    );
  },
);

Then(
  'the settled IDs are empty',
  function (this: ChangeTracksWorld) {
    assert.equal(this.settledIds.length, 0);
  },
);

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Apply a TextEdit to a source string, producing the resulting text.
 */
function applyEdit(text: string, edit: TextEdit): string {
  return text.substring(0, edit.offset) + edit.newText + text.substring(edit.offset + edit.length);
}

/**
 * Unescape unicode escape sequences like \uXXXX in test strings.
 */
function unescapeUnicode(str: string): string {
  return str.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}
