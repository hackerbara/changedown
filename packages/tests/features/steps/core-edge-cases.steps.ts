import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeTracksWorld } from './world.js';
import {
  nextChange,
  previousChange,
  getCommentSyntax,
  wrapLineComment,
  stripLineComment,
  parseOp,
  computeSettledText,
  settledLine,
  type CommentSyntax,
  type ChangeNode,
  type ParsedOp,
  type StrippedLine,
} from '@changetracks/core';

// =============================================================================
// Per-scenario state via WeakMap (avoids polluting the shared World interface)
// =============================================================================

const navResult = new WeakMap<ChangeTracksWorld, ChangeNode | null>();
const commentSyntaxResult = new WeakMap<ChangeTracksWorld, CommentSyntax | undefined>();
const wrappedLineResult = new WeakMap<ChangeTracksWorld, string>();
const stripResult = new WeakMap<ChangeTracksWorld, StrippedLine | null>();
const parsedOpResult = new WeakMap<ChangeTracksWorld, ParsedOp>();
const opError = new WeakMap<ChangeTracksWorld, Error>();
const settledLineResult = new WeakMap<ChangeTracksWorld, string>();
const singleLineInput = new WeakMap<ChangeTracksWorld, string>();
const groupMembersResult = new WeakMap<ChangeTracksWorld, ChangeNode[]>();

// =============================================================================
// C16 — Navigation: Given/When steps
// =============================================================================

Given(
  'the markup text {string}',
  function (this: ChangeTracksWorld, text: string) {
    this.lastText = text.replace(/\\n/g, '\n');
  },
);

Given(
  'the markup text with footnotes:',
  function (this: ChangeTracksWorld, docString: string) {
    this.lastText = docString;
  },
);

When(
  'I parse the markup',
  function (this: ChangeTracksWorld) {
    this.lastDoc = this.parser.parse(this.lastText);
  },
);

When(
  'I navigate to the next change from position {int}',
  function (this: ChangeTracksWorld, position: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    navResult.set(this, nextChange(this.lastDoc, position));
  },
);

When(
  'I navigate to the previous change from position {int}',
  function (this: ChangeTracksWorld, position: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    navResult.set(this, previousChange(this.lastDoc, position));
  },
);

// C16 — Navigation: Then steps

Then(
  'the navigated change has modified text {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const change = navResult.get(this);
    assert.ok(change !== null && change !== undefined, 'Expected a non-null change');
    assert.equal(change.modifiedText, expected);
  },
);

Then(
  'the navigated change has original text {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const change = navResult.get(this);
    assert.ok(change !== null && change !== undefined, 'Expected a non-null change');
    assert.equal(change.originalText, expected);
  },
);

Then(
  'the navigated change is null',
  function (this: ChangeTracksWorld) {
    const change = navResult.get(this);
    assert.equal(change, null);
  },
);

// =============================================================================
// C17 — Comment syntax steps
// =============================================================================

When(
  'I get comment syntax for {string}',
  function (this: ChangeTracksWorld, languageId: string) {
    commentSyntaxResult.set(this, getCommentSyntax(languageId));
  },
);

Then(
  'the comment prefix is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const syntax = commentSyntaxResult.get(this);
    assert.ok(syntax !== undefined, 'Expected defined comment syntax');
    assert.equal(syntax.line, expected);
  },
);

Then(
  'the comment syntax is undefined',
  function (this: ChangeTracksWorld) {
    const syntax = commentSyntaxResult.get(this);
    assert.equal(syntax, undefined);
  },
);

When(
  'I wrap {string} as deletion with tag {string} for language {string}',
  function (this: ChangeTracksWorld, code: string, tag: string, linePrefix: string) {
    const unescaped = code.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    const result = wrapLineComment(unescaped, tag, { line: linePrefix }, true);
    wrappedLineResult.set(this, result);
  },
);

When(
  'I wrap {string} as insertion with tag {string} for language {string}',
  function (this: ChangeTracksWorld, code: string, tag: string, linePrefix: string) {
    const unescaped = code.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    const result = wrapLineComment(unescaped, tag, { line: linePrefix }, false);
    wrappedLineResult.set(this, result);
  },
);

Then(
  'the wrapped line is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = wrappedLineResult.get(this);
    assert.ok(result !== undefined, 'No wrapped line result');
    const unescaped = expected.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    assert.equal(result, unescaped);
  },
);

When(
  'I strip {string} with prefix {string}',
  function (this: ChangeTracksWorld, line: string, prefix: string) {
    const result = stripLineComment(line, { line: prefix });
    stripResult.set(this, result);
  },
);

Then(
  'the stripped code is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = stripResult.get(this);
    assert.ok(result !== null, 'Expected non-null strip result');
    assert.equal(result!.code, expected);
  },
);

Then(
  'the stripped tag is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = stripResult.get(this);
    assert.ok(result !== null, 'Expected non-null strip result');
    assert.equal(result!.tag, expected);
  },
);

Then(
  'the stripped line is a deletion',
  function (this: ChangeTracksWorld) {
    const result = stripResult.get(this);
    assert.ok(result !== null, 'Expected non-null strip result');
    assert.equal(result!.isDeletion, true);
  },
);

Then(
  'the stripped line is not a deletion',
  function (this: ChangeTracksWorld) {
    const result = stripResult.get(this);
    assert.ok(result !== null, 'Expected non-null strip result');
    assert.equal(result!.isDeletion, false);
  },
);

Then(
  'the strip result is null',
  function (this: ChangeTracksWorld) {
    const result = stripResult.get(this);
    assert.equal(result, null);
  },
);

// =============================================================================
// C18 — Op parser steps
// =============================================================================

When(
  'I parse the op {string}',
  function (this: ChangeTracksWorld, opString: string) {
    parsedOpResult.set(this, parseOp(opString));
  },
);

When(
  'I parse the op {string} expecting an error',
  function (this: ChangeTracksWorld, opString: string) {
    try {
      parseOp(opString);
      assert.fail('Expected parseOp to throw but it did not');
    } catch (err) {
      opError.set(this, err as Error);
    }
  },
);

Then(
  'the op type is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = parsedOpResult.get(this);
    assert.ok(result, 'No parsed op result');
    assert.equal(result.type, expected);
  },
);

Then(
  'the op old text is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = parsedOpResult.get(this);
    assert.ok(result, 'No parsed op result');
    assert.equal(result.oldText, expected);
  },
);

Then(
  'the op new text is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = parsedOpResult.get(this);
    assert.ok(result, 'No parsed op result');
    assert.equal(result.newText, expected);
  },
);

Then(
  'the op reasoning is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = parsedOpResult.get(this);
    assert.ok(result, 'No parsed op result');
    assert.equal(result.reasoning, expected);
  },
);

Then(
  'the op has no reasoning',
  function (this: ChangeTracksWorld) {
    const result = parsedOpResult.get(this);
    assert.ok(result, 'No parsed op result');
    assert.equal(result.reasoning, undefined);
  },
);

Then(
  'the op error matches {string}',
  function (this: ChangeTracksWorld, pattern: string) {
    const err = opError.get(this);
    assert.ok(err, 'No error was captured');
    assert.ok(
      err.message.includes(pattern),
      `Expected error message to include "${pattern}" but got: "${err.message}"`,
    );
  },
);

// =============================================================================
// C19 — Move operations steps
// NOTE: "there are {int} changes", "change {int} is type {string}",
//       "change {int} has original text", "change {int} has modified text"
//       are defined in core-parser.steps.ts (Task 3) — reused here.
// =============================================================================

Then(
  'change {int} has move role {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const changes = this.lastDoc.getChanges();
    assert.ok(index >= 1 && index <= changes.length, `Change index ${index} out of range`);
    assert.equal(changes[index - 1].moveRole, expected);
  },
);

Then(
  'change {int} has no move role',
  function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const changes = this.lastDoc.getChanges();
    assert.ok(index >= 1 && index <= changes.length, `Change index ${index} out of range`);
    assert.equal(changes[index - 1].moveRole, undefined);
  },
);

Then(
  'change {int} has group id {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const changes = this.lastDoc.getChanges();
    assert.ok(index >= 1 && index <= changes.length, `Change index ${index} out of range`);
    assert.equal(changes[index - 1].groupId, expected);
  },
);

Then(
  'change {int} has no group id',
  function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const changes = this.lastDoc.getChanges();
    assert.ok(index >= 1 && index <= changes.length, `Change index ${index} out of range`);
    assert.equal(changes[index - 1].groupId, undefined);
  },
);

When(
  'I get group members for {string}',
  function (this: ChangeTracksWorld, groupId: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    groupMembersResult.set(this, this.lastDoc.getGroupMembers(groupId));
  },
);

Then(
  'the group has {int} members',
  function (this: ChangeTracksWorld, expected: number) {
    const members = groupMembersResult.get(this);
    assert.ok(members !== undefined, 'No group members result');
    assert.equal(members.length, expected);
  },
);

// =============================================================================
// C20 — Settled text / tilde-arrow steps
// NOTE: "the settled text is {string}" is defined in core-operations.steps.ts
//       (Task 4) — it reads from this.settledText, so we write to that field.
// =============================================================================

When(
  'I compute the settled text',
  function (this: ChangeTracksWorld) {
    // Store on this.settledText so the existing "the settled text is {string}"
    // step from core-operations.steps.ts can read it.
    (this as any).settledText = computeSettledText(this.lastText);
  },
);

Then(
  'the settled text contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = (this as any).settledText as string;
    assert.ok(result !== undefined, 'No settled text result');
    assert.ok(
      result.includes(expected),
      `Expected settled text to contain "${expected}" but got: "${result}"`,
    );
  },
);

// settledLine steps (unique to C20, no conflicts)

Given(
  'the single line {string}',
  function (this: ChangeTracksWorld, line: string) {
    singleLineInput.set(this, line);
  },
);

When(
  'I compute the settled line',
  function (this: ChangeTracksWorld) {
    const line = singleLineInput.get(this);
    assert.ok(line !== undefined, 'No single line input');
    settledLineResult.set(this, settledLine(line));
  },
);

Then(
  'the settled line is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = settledLineResult.get(this);
    assert.ok(result !== undefined, 'No settled line result');
    assert.equal(result, expected);
  },
);

// =============================================================================
// C13 — Level & Inline Metadata assertions
// =============================================================================

Then(
  'change {int} has level {int}',
  function (this: ChangeTracksWorld, index: number, expected: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.equal(c.level, expected);
  },
);

Then(
  'change {int} has inline author {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.ok(c.inlineMetadata, `Change ${index} has no inlineMetadata`);
    assert.equal(c.inlineMetadata.author, expected);
  },
);

Then(
  'change {int} has inline date {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.ok(c.inlineMetadata, `Change ${index} has no inlineMetadata`);
    assert.equal(c.inlineMetadata.date, expected);
  },
);

Then(
  'change {int} has inline type {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.ok(c.inlineMetadata, `Change ${index} has no inlineMetadata`);
    assert.equal(c.inlineMetadata.type, expected);
  },
);

Then(
  'change {int} has inline status {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.ok(c.inlineMetadata, `Change ${index} has no inlineMetadata`);
    assert.equal(c.inlineMetadata.status, expected);
  },
);

Then(
  'change {int} has inline free text {string}',
  function (this: ChangeTracksWorld, index: number, expected: string) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.ok(c.inlineMetadata, `Change ${index} has no inlineMetadata`);
    assert.equal(c.inlineMetadata.freeText, expected);
  },
);

Then(
  'change {int} has no inline metadata',
  function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.equal(c.inlineMetadata, undefined);
  },
);

// =============================================================================
// C8 — Settled ref detection assertions
// =============================================================================

Then(
  'change {int} is settled',
  function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.equal(c.settled, true, `Expected change ${index} to be settled but settled=${c.settled}`);
  },
);

Then(
  'change {int} is not settled',
  function (this: ChangeTracksWorld, index: number) {
    assert.ok(this.lastDoc, 'No parsed document available');
    const c = this.lastDoc.getChanges()[index - 1];
    assert.ok(c, `No change at index ${index}`);
    assert.ok(c.settled === undefined || c.settled === false, `Expected change ${index} to not be settled but settled=${c.settled}`);
  },
);
