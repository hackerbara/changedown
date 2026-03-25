import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeTracksWorld } from './world.js';
import {
  applyProposeChange,
  applySingleOperation,
  appendFootnote,
  extractLineRange,
  replaceUnique,
  stripRefsFromContent,
} from '@changetracks/core';

// =============================================================================
// Per-scenario state via WeakMap (avoids polluting the shared World interface)
// =============================================================================

/** Document text for file-ops scenarios */
const fileOpsDoc = new WeakMap<ChangeTracksWorld, string>();
/** Result of applyProposeChange / applySingleOperation */
const fileOpsResult = new WeakMap<ChangeTracksWorld, { modifiedText: string; changeType: string }>();
/** Error captured from a file-ops call */
const fileOpsError = new WeakMap<ChangeTracksWorld, Error>();
/** Result of appendFootnote */
const footnoteResult = new WeakMap<ChangeTracksWorld, string>();
/** Lines array for extractLineRange */
const fileOpsLines = new WeakMap<ChangeTracksWorld, string[]>();
/** Result of extractLineRange */
const lineRangeResult = new WeakMap<ChangeTracksWorld, { content: string; startOffset: number; endOffset: number }>();
/** Result of replaceUnique */
const replaceResult = new WeakMap<ChangeTracksWorld, string>();
/** Content string for stripRefsFromContent */
const refsContent = new WeakMap<ChangeTracksWorld, string>();
/** Result of stripRefsFromContent */
const refsResult = new WeakMap<ChangeTracksWorld, { cleaned: string; refs: string[] }>();

// =============================================================================
// Given steps
// =============================================================================

Given(
  'a file-ops document {string}',
  function (this: ChangeTracksWorld, text: string) {
    fileOpsDoc.set(this, text);
  },
);

Given(
  'a file-ops document with existing footnotes:',
  function (this: ChangeTracksWorld, text: string) {
    fileOpsDoc.set(this, text);
  },
);

Given(
  'a file-ops document with refs:',
  function (this: ChangeTracksWorld, text: string) {
    fileOpsDoc.set(this, text);
  },
);

Given(
  'file-ops lines {string}, {string}, {string}',
  function (this: ChangeTracksWorld, l1: string, l2: string, l3: string) {
    fileOpsLines.set(this, [l1, l2, l3]);
  },
);

Given(
  'a file-ops content {string}',
  function (this: ChangeTracksWorld, text: string) {
    refsContent.set(this, text);
  },
);

// =============================================================================
// When steps — applyProposeChange
// =============================================================================

When(
  'I apply propose-change substituting {string} with {string} as {string} by {string}',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, changeId: string, author: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    try {
      const result = await applyProposeChange({ text, oldText, newText, changeId, author });
      fileOpsResult.set(this, result);
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

When(
  'I apply propose-change substituting {string} with {string} as {string} by {string} with reasoning {string}',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, changeId: string, author: string, reasoning: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    try {
      const result = await applyProposeChange({ text, oldText, newText, changeId, author, reasoning });
      fileOpsResult.set(this, result);
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

When(
  'I apply propose-change substituting {string} with {string} as {string} by {string} expecting an error',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, changeId: string, author: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    try {
      await applyProposeChange({ text, oldText, newText, changeId, author });
      assert.fail('Expected applyProposeChange to throw but it did not');
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

When(
  'I apply propose-change deleting {string} as {string} by {string}',
  async function (this: ChangeTracksWorld, oldText: string, changeId: string, author: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    try {
      const result = await applyProposeChange({ text, oldText, newText: '', changeId, author });
      fileOpsResult.set(this, result);
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

When(
  'I apply propose-change inserting {string} after {string} as {string} by {string}',
  async function (this: ChangeTracksWorld, newText: string, insertAfter: string, changeId: string, author: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    try {
      const result = await applyProposeChange({ text, oldText: '', newText, changeId, author, insertAfter });
      fileOpsResult.set(this, result);
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

When(
  'I apply propose-change with empty old and new text as {string} by {string} expecting an error',
  async function (this: ChangeTracksWorld, changeId: string, author: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    try {
      await applyProposeChange({ text, oldText: '', newText: '', changeId, author });
      assert.fail('Expected applyProposeChange to throw but it did not');
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

When(
  'I apply propose-change inserting {string} without anchor as {string} by {string} expecting an error',
  async function (this: ChangeTracksWorld, newText: string, changeId: string, author: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    try {
      await applyProposeChange({ text, oldText: '', newText, changeId, author });
      assert.fail('Expected applyProposeChange to throw but it did not');
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

// =============================================================================
// When steps — appendFootnote
// =============================================================================

When(
  'I append footnote {string}',
  function (this: ChangeTracksWorld, footnoteBlock: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    // Unescape \n sequences from the Gherkin string parameter
    const unescaped = footnoteBlock.replace(/\\n/g, '\n');
    footnoteResult.set(this, appendFootnote(text, unescaped));
  },
);

// =============================================================================
// When steps — extractLineRange
// =============================================================================

When(
  'I extract line range {int} to {int}',
  function (this: ChangeTracksWorld, start: number, end: number) {
    const lines = fileOpsLines.get(this);
    assert.ok(lines, 'No file-ops lines set');
    try {
      lineRangeResult.set(this, extractLineRange(lines, start, end));
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

When(
  'I extract line range {int} to {int} expecting an error',
  function (this: ChangeTracksWorld, start: number, end: number) {
    const lines = fileOpsLines.get(this);
    assert.ok(lines, 'No file-ops lines set');
    try {
      extractLineRange(lines, start, end);
      assert.fail('Expected extractLineRange to throw but it did not');
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

// =============================================================================
// When steps — replaceUnique
// =============================================================================

When(
  'I replace-unique {string} with {string}',
  function (this: ChangeTracksWorld, target: string, replacement: string) {
    const text = fileOpsDoc.get(this);
    assert.ok(text !== undefined, 'No file-ops document set');
    try {
      replaceResult.set(this, replaceUnique(text, target, replacement));
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

// =============================================================================
// When steps — applySingleOperation
// =============================================================================

When(
  'I apply single-operation substituting {string} with {string} as {string} by {string}',
  async function (this: ChangeTracksWorld, oldText: string, newText: string, changeId: string, author: string) {
    const fileContent = fileOpsDoc.get(this);
    assert.ok(fileContent !== undefined, 'No file-ops document set');
    try {
      const result = await applySingleOperation({ fileContent, oldText, newText, changeId, author });
      fileOpsResult.set(this, result);
    } catch (err) {
      fileOpsError.set(this, err as Error);
    }
  },
);

// =============================================================================
// When steps — stripRefsFromContent
// =============================================================================

When(
  'I strip refs from the content',
  function (this: ChangeTracksWorld) {
    const content = refsContent.get(this);
    assert.ok(content !== undefined, 'No file-ops content set');
    refsResult.set(this, stripRefsFromContent(content));
  },
);

// =============================================================================
// Then steps — applyProposeChange / applySingleOperation results
// =============================================================================

Then(
  'the file-ops change type is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = fileOpsResult.get(this);
    assert.ok(result, 'No file-ops result available');
    assert.equal(result.changeType, expected);
  },
);

Then(
  'the file-ops output contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = fileOpsResult.get(this);
    assert.ok(result, 'No file-ops result available');
    assert.ok(
      result.modifiedText.includes(expected),
      `Expected file-ops output to contain "${expected}" but got:\n${result.modifiedText}`,
    );
  },
);

// =============================================================================
// Then steps — error assertions
// =============================================================================

Then(
  'the file-ops error message matches {string}',
  function (this: ChangeTracksWorld, pattern: string) {
    const err = fileOpsError.get(this);
    assert.ok(err, 'Expected a file-ops error but none was captured');
    const regex = new RegExp(pattern, 'i');
    assert.ok(
      regex.test(err.message),
      `Expected error message to match /${pattern}/i but got: "${err.message}"`,
    );
  },
);

// =============================================================================
// Then steps — appendFootnote results
// =============================================================================

Then(
  'the file-ops footnote result is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = footnoteResult.get(this);
    assert.ok(result !== undefined, 'No footnote result available');
    const unescaped = expected.replace(/\\n/g, '\n');
    assert.equal(result, unescaped);
  },
);

Then(
  'the file-ops footnote result contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = footnoteResult.get(this);
    assert.ok(result !== undefined, 'No footnote result available');
    assert.ok(
      result.includes(expected),
      `Expected footnote result to contain "${expected}" but got:\n${result}`,
    );
  },
);

Then(
  'the file-ops footnote result ends with {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = footnoteResult.get(this);
    assert.ok(result !== undefined, 'No footnote result available');
    assert.ok(
      result.endsWith(expected),
      `Expected footnote result to end with "${expected}" but got:\n${result}`,
    );
  },
);

// =============================================================================
// Then steps — extractLineRange results
// =============================================================================

Then(
  'the extracted content is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = lineRangeResult.get(this);
    assert.ok(result, 'No line range result available');
    const unescaped = expected.replace(/\\n/g, '\n');
    assert.equal(result.content, unescaped);
  },
);

Then(
  'the extracted start offset is {int}',
  function (this: ChangeTracksWorld, expected: number) {
    const result = lineRangeResult.get(this);
    assert.ok(result, 'No line range result available');
    assert.equal(result.startOffset, expected);
  },
);

Then(
  'the extracted end offset is {int}',
  function (this: ChangeTracksWorld, expected: number) {
    const result = lineRangeResult.get(this);
    assert.ok(result, 'No line range result available');
    assert.equal(result.endOffset, expected);
  },
);

// =============================================================================
// Then steps — replaceUnique results
// =============================================================================

Then(
  'the file-ops replace result is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = replaceResult.get(this);
    assert.ok(result !== undefined, 'No replace result available');
    assert.equal(result, expected);
  },
);

// =============================================================================
// Then steps — stripRefsFromContent results
// =============================================================================

Then(
  'the stripped content is {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = refsResult.get(this);
    assert.ok(result, 'No strip-refs result available');
    assert.equal(result.cleaned, expected);
  },
);

Then(
  'the stripped refs are {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const result = refsResult.get(this);
    assert.ok(result, 'No strip-refs result available');
    assert.deepEqual(result.refs, [expected]);
  },
);

Then(
  'the stripped refs are {string} and {string}',
  function (this: ChangeTracksWorld, ref1: string, ref2: string) {
    const result = refsResult.get(this);
    assert.ok(result, 'No strip-refs result available');
    assert.deepEqual(result.refs, [ref1, ref2]);
  },
);

Then(
  'the stripped refs list is empty',
  function (this: ChangeTracksWorld) {
    const result = refsResult.get(this);
    assert.ok(result, 'No strip-refs result available');
    assert.deepEqual(result.refs, []);
  },
);
