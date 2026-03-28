import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeDownWorld } from './world.js';
import {
  computeCommittedLine,
  computeCommittedView,
  formatCommittedOutput,
  initHashline,
  computeLineHash,
  type FootnoteStatus,
  type CommittedLineResult,
  type CommittedViewResult,
} from '@changedown/core';

// =============================================================================
// Per-scenario state via WeakMap (avoids polluting the shared World interface)
// =============================================================================

const committedLineInput = new WeakMap<ChangeDownWorld, string>();
const footnoteMap = new WeakMap<ChangeDownWorld, Map<string, FootnoteStatus>>();
const committedLineResult = new WeakMap<ChangeDownWorld, CommittedLineResult>();
const committedViewRawText = new WeakMap<ChangeDownWorld, string>();
const committedViewResult = new WeakMap<ChangeDownWorld, CommittedViewResult>();
const formattedCommittedOutput = new WeakMap<ChangeDownWorld, string>();

// =============================================================================
// Background
// =============================================================================

Given(
  'the committed-text hashline module is initialized',
  async function (this: ChangeDownWorld) {
    await initHashline();
  },
);

// =============================================================================
// computeCommittedLine: Given steps
// =============================================================================

Given(
  'a committed-text input {string}',
  function (this: ChangeDownWorld, input: string) {
    committedLineInput.set(this, input);
  },
);

Given(
  'no footnote statuses',
  function (this: ChangeDownWorld) {
    footnoteMap.set(this, new Map<string, FootnoteStatus>());
  },
);

Given(
  'footnote status {string} is {string} type {string}',
  function (this: ChangeDownWorld, id: string, status: string, type: string) {
    let map = footnoteMap.get(this);
    if (!map) {
      map = new Map<string, FootnoteStatus>();
      footnoteMap.set(this, map);
    }
    map.set(id, { status: status as 'proposed' | 'accepted' | 'rejected', type });
  },
);

// =============================================================================
// computeCommittedLine: When step
// =============================================================================

When(
  'I compute the committed line',
  function (this: ChangeDownWorld) {
    const input = committedLineInput.get(this);
    assert.ok(input !== undefined, 'No committed-text input set');
    const fns = footnoteMap.get(this) ?? new Map<string, FootnoteStatus>();
    committedLineResult.set(this, computeCommittedLine(input, fns));
  },
);

// =============================================================================
// computeCommittedLine: Then steps
// =============================================================================

Then(
  'the committed text is {string}',
  function (this: ChangeDownWorld, expected: string) {
    const result = committedLineResult.get(this);
    assert.ok(result, 'No committed line result');
    assert.strictEqual(result.text, expected);
  },
);

Then(
  'the committed flag is {string}',
  function (this: ChangeDownWorld, expected: string) {
    const result = committedLineResult.get(this);
    assert.ok(result, 'No committed line result');
    assert.strictEqual(result.flag, expected);
  },
);

Then(
  'the committed changeIds are empty',
  function (this: ChangeDownWorld) {
    const result = committedLineResult.get(this);
    assert.ok(result, 'No committed line result');
    assert.deepStrictEqual(result.changeIds, []);
  },
);

Then(
  'the committed changeIds include {string}',
  function (this: ChangeDownWorld, expected: string) {
    const result = committedLineResult.get(this);
    assert.ok(result, 'No committed line result');
    assert.ok(
      result.changeIds.includes(expected),
      `Expected changeIds to include "${expected}" but got: ${JSON.stringify(result.changeIds)}`,
    );
  },
);

// =============================================================================
// computeCommittedView: Given steps
// =============================================================================

Given(
  'a committed-view raw text:',
  function (this: ChangeDownWorld, rawText: string) {
    committedViewRawText.set(this, rawText);
  },
);

Given(
  'a committed-view raw text {string}',
  function (this: ChangeDownWorld, rawText: string) {
    // Handle escape sequences for inline strings
    const unescaped = rawText.replace(/\\n/g, '\n');
    committedViewRawText.set(this, unescaped);
  },
);

// =============================================================================
// computeCommittedView: When steps
// =============================================================================

When(
  'I compute the committed view',
  function (this: ChangeDownWorld) {
    const rawText = committedViewRawText.get(this);
    assert.ok(rawText !== undefined, 'No committed-view raw text set');
    committedViewResult.set(this, computeCommittedView(rawText));
  },
);

When(
  'I format the committed output for {string} with tracking {string}',
  function (this: ChangeDownWorld, filePath: string, trackingStatus: string) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result to format');
    formattedCommittedOutput.set(
      this,
      formatCommittedOutput(view, { filePath, trackingStatus }),
    );
  },
);

// =============================================================================
// computeCommittedView: Then steps
// =============================================================================

Then(
  'the committed view has {int} lines',
  function (this: ChangeDownWorld, expected: number) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.strictEqual(view.lines.length, expected);
  },
);

Then(
  'committed view line numbers are sequential with no gaps',
  function (this: ChangeDownWorld) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    const lineNums = view.lines.map(l => l.committedLineNum);
    for (let i = 1; i < lineNums.length; i++) {
      assert.strictEqual(
        lineNums[i],
        lineNums[i - 1] + 1,
        `Gap between line ${lineNums[i - 1]} and ${lineNums[i]}`,
      );
    }
  },
);

Then(
  'committed-to-raw mapping {int} is raw {int}',
  function (this: ChangeDownWorld, committedNum: number, rawNum: number) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.strictEqual(view.committedToRaw.get(committedNum), rawNum);
  },
);

Then(
  'raw-to-committed mapping {int} is committed {int}',
  function (this: ChangeDownWorld, rawNum: number, committedNum: number) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.strictEqual(view.rawToCommitted.get(rawNum), committedNum);
  },
);

Then(
  'all committed hashes are 2-char lowercase hex',
  function (this: ChangeDownWorld) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    for (const line of view.lines) {
      assert.match(line.hash, /^[0-9a-f]{2}$/);
    }
  },
);

Then(
  'the committed summary has {int} proposed',
  function (this: ChangeDownWorld, expected: number) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.strictEqual(view.summary.proposed, expected);
  },
);

Then(
  'the committed summary has {int} accepted',
  function (this: ChangeDownWorld, expected: number) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.strictEqual(view.summary.accepted, expected);
  },
);

Then(
  'the committed summary has {int} rejected',
  function (this: ChangeDownWorld, expected: number) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.strictEqual(view.summary.rejected, expected);
  },
);

Then(
  'the committed summary has {int} clean lines',
  function (this: ChangeDownWorld, expected: number) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.strictEqual(view.summary.clean, expected);
  },
);

Then(
  'no committed view line starts with a footnote ref',
  function (this: ChangeDownWorld) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    for (const line of view.lines) {
      assert.ok(
        !line.text.match(/^\[\^cn-/),
        `Unexpected footnote ref in committed text: ${line.text}`,
      );
    }
  },
);

Then(
  'no committed view line contains {string}',
  function (this: ChangeDownWorld, unexpected: string) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    for (const line of view.lines) {
      assert.ok(
        !line.text.includes(unexpected),
        `Unexpected content in committed text: ${line.text}`,
      );
    }
  },
);

Then(
  'the committed view line count equals the raw line count',
  function (this: ChangeDownWorld) {
    const view = committedViewResult.get(this);
    const rawText = committedViewRawText.get(this);
    assert.ok(view, 'No committed view result');
    assert.ok(rawText !== undefined, 'No raw text');
    const rawLineCount = rawText.split('\n').length;
    assert.strictEqual(view.lines.length, rawLineCount);
  },
);

Then(
  'all committed view lines have empty flag',
  function (this: ChangeDownWorld) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    for (const line of view.lines) {
      assert.strictEqual(line.flag, '', `Line ${line.committedLineNum} has non-empty flag "${line.flag}"`);
    }
  },
);

Then(
  'all committed view lines have empty changeIds',
  function (this: ChangeDownWorld) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    for (const line of view.lines) {
      assert.deepStrictEqual(
        line.changeIds,
        [],
        `Line ${line.committedLineNum} has changeIds: ${JSON.stringify(line.changeIds)}`,
      );
    }
  },
);

Then(
  'each committed hash matches computeLineHash for its text and index',
  function (this: ChangeDownWorld) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    // Mirror the two-pass approach: collect all committed texts, then hash with allLines
    const allCommittedTexts = view.lines.map(l => l.text);
    for (const line of view.lines) {
      const expectedHash = computeLineHash(line.committedLineNum - 1, line.text, allCommittedTexts);
      assert.strictEqual(
        line.hash,
        expectedHash,
        `Hash mismatch on committed line ${line.committedLineNum}: got "${line.hash}", expected "${expectedHash}"`,
      );
    }
  },
);

Then(
  'committed view line {int} has flag {string}',
  function (this: ChangeDownWorld, lineNum: number, expected: string) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.ok(lineNum >= 1 && lineNum <= view.lines.length, `Line ${lineNum} out of range`);
    assert.strictEqual(view.lines[lineNum - 1].flag, expected);
  },
);

Then(
  'committed view line {int} changeIds include {string}',
  function (this: ChangeDownWorld, lineNum: number, expected: string) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.ok(lineNum >= 1 && lineNum <= view.lines.length, `Line ${lineNum} out of range`);
    assert.ok(
      view.lines[lineNum - 1].changeIds.includes(expected),
      `Expected line ${lineNum} changeIds to include "${expected}" but got: ${JSON.stringify(view.lines[lineNum - 1].changeIds)}`,
    );
  },
);

Then(
  'committed view line {int} has text {string}',
  function (this: ChangeDownWorld, lineNum: number, expected: string) {
    const view = committedViewResult.get(this);
    assert.ok(view, 'No committed view result');
    assert.ok(lineNum >= 1 && lineNum <= view.lines.length, `Line ${lineNum} out of range`);
    assert.strictEqual(view.lines[lineNum - 1].text, expected);
  },
);

// =============================================================================
// formatCommittedOutput: Then steps
// =============================================================================

Then(
  'the formatted committed output line {int} is {string}',
  function (this: ChangeDownWorld, lineNum: number, expected: string) {
    const output = formattedCommittedOutput.get(this);
    assert.ok(output, 'No formatted committed output');
    const lines = output.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    assert.strictEqual(lines[lineNum - 1], expected);
  },
);

Then(
  'the formatted committed output line {int} starts with {string}',
  function (this: ChangeDownWorld, lineNum: number, prefix: string) {
    const output = formattedCommittedOutput.get(this);
    assert.ok(output, 'No formatted committed output');
    const lines = output.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    assert.ok(
      lines[lineNum - 1].startsWith(prefix),
      `Expected line ${lineNum} to start with "${prefix}" but got: "${lines[lineNum - 1]}"`,
    );
  },
);

Then(
  'the formatted committed output has {int} hashline content lines',
  function (this: ChangeDownWorld, expected: number) {
    const output = formattedCommittedOutput.get(this);
    assert.ok(output, 'No formatted committed output');
    const lines = output.split('\n');
    const contentLines = lines.filter(l => l.match(/^\s*\d+:[0-9a-f]{2}/));
    assert.strictEqual(contentLines.length, expected);
  },
);

Then(
  'the formatted committed output contains {string}',
  function (this: ChangeDownWorld, expected: string) {
    const output = formattedCommittedOutput.get(this);
    assert.ok(output, 'No formatted committed output');
    assert.ok(
      output.includes(expected),
      `Expected formatted output to contain "${expected}" but got:\n${output}`,
    );
  },
);

Then(
  'the formatted committed output has a line containing {string} with flag {string}',
  function (this: ChangeDownWorld, text: string, flag: string) {
    const output = formattedCommittedOutput.get(this);
    assert.ok(output, 'No formatted committed output');
    const lines = output.split('\n');
    const matchingLine = lines.find(l => l.includes(text));
    assert.ok(matchingLine, `No formatted line contains "${text}"`);
    assert.ok(
      matchingLine.includes(flag),
      `Line containing "${text}" does not include flag "${flag}": ${matchingLine}`,
    );
  },
);
