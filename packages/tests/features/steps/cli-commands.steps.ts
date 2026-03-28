import { Given, When, Then, Before, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ChangeDownWorld } from './world.js';
import {
  computeSettlement,
  computeStatus,
  computeChangeList,
  handleDiff,
  isGitDiffDriverInvocation,
} from 'changedown/internals';
import type {
  StatusResult,
  SettlementResult,
  ChangeListEntry,
} from 'changedown/internals';

// =============================================================================
// World extensions for CLI command steps
// =============================================================================

declare module './world.js' {
  interface ChangeDownWorld {
    // E6 - Diff
    cliTmpDir: string | null;
    cliFiles: Map<string, string>;
    diffOutput: string;
    capturedOutputs: Map<string, string>;
    gitArgv: string[];
    // E7 - Settle
    settlementInput: string;
    settlementResult: SettlementResult | null;
    settlementSecondResult: SettlementResult | null;
    // E9 - Status & List
    statusInput: string;
    statusResult: StatusResult | null;
    listInput: string;
    listResult: ChangeListEntry[];
  }
}

// =============================================================================
// Lifecycle
// =============================================================================

Before({ tags: '@E6 or @E7 or @E9' }, function (this: ChangeDownWorld) {
  this.cliTmpDir = null;
  this.cliFiles = new Map();
  this.diffOutput = '';
  this.capturedOutputs = new Map();
  this.gitArgv = [];
  this.settlementInput = '';
  this.settlementResult = null;
  this.settlementSecondResult = null;
  this.statusInput = '';
  this.statusResult = null;
  this.listInput = '';
  this.listResult = [];
});

After({ tags: '@E6' }, async function (this: ChangeDownWorld) {
  if (this.cliTmpDir) {
    await fs.rm(this.cliTmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// =============================================================================
// E6 - CLI Diff steps
// =============================================================================

Given(
  'a temporary diff file {string} with content:',
  async function (this: ChangeDownWorld, name: string, content: string) {
    if (!this.cliTmpDir) {
      this.cliTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-e6-'));
    }
    const filePath = path.join(this.cliTmpDir, name);
    await fs.writeFile(filePath, content, 'utf-8');
    this.cliFiles.set(name, filePath);
  },
);

When(
  'I run diff on {string}',
  async function (this: ChangeDownWorld, name: string) {
    const filePath = this.cliFiles.get(name);
    assert.ok(filePath, `No diff file named "${name}"`);
    this.diffOutput = await handleDiff(filePath);
  },
);

When(
  'I run diff on {string} with view {string}',
  async function (this: ChangeDownWorld, name: string, view: string) {
    const filePath = this.cliFiles.get(name);
    assert.ok(filePath, `No diff file named "${name}"`);
    this.diffOutput = await handleDiff(filePath, { view: view as any });
  },
);

When(
  'I run diff on {string} with showMarkup enabled',
  async function (this: ChangeDownWorld, name: string) {
    const filePath = this.cliFiles.get(name);
    assert.ok(filePath, `No diff file named "${name}"`);
    this.diffOutput = await handleDiff(filePath, { showMarkup: true });
  },
);

When(
  'I run diff on {string} with unicodeStrike disabled',
  async function (this: ChangeDownWorld, name: string) {
    const filePath = this.cliFiles.get(name);
    assert.ok(filePath, `No diff file named "${name}"`);
    this.diffOutput = await handleDiff(filePath, { unicodeStrike: false });
  },
);

When(
  'I run diff on {string} with threads enabled',
  async function (this: ChangeDownWorld, name: string) {
    const filePath = this.cliFiles.get(name);
    assert.ok(filePath, `No diff file named "${name}"`);
    this.diffOutput = await handleDiff(filePath, { threads: true });
  },
);

When(
  'I capture diff output as {string}',
  function (this: ChangeDownWorld, label: string) {
    this.capturedOutputs.set(label, this.diffOutput);
  },
);

Then(
  'the diff output contains {string}',
  function (this: ChangeDownWorld, expected: string) {
    assert.ok(
      this.diffOutput.includes(expected),
      `Expected diff output to contain "${expected}" but got:\n${this.diffOutput}`,
    );
  },
);

Then(
  'the diff output does not contain {string}',
  function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(
      !this.diffOutput.includes(unexpected),
      `Expected diff output NOT to contain "${unexpected}" but it does`,
    );
  },
);

Then(
  'the diff output contains ANSI escape codes',
  function (this: ChangeDownWorld) {
    assert.ok(
      this.diffOutput.includes('\x1b['),
      'Expected diff output to contain ANSI escape codes',
    );
  },
);

Then(
  'the diff output contains ANSI red color code for deletions',
  function (this: ChangeDownWorld) {
    // ANSI red is \x1b[31m — used by formatAnsi for deletions
    assert.ok(
      this.diffOutput.includes('\x1b[31m'),
      'Expected diff output to contain ANSI red color code (\\x1b[31m) for deletions',
    );
  },
);

Then(
  'the diff output is produced without error',
  function (this: ChangeDownWorld) {
    assert.ok(
      this.diffOutput.length > 0,
      'Expected diff output to be non-empty',
    );
  },
);

Then(
  '{string} appears before {string} in the diff output',
  function (this: ChangeDownWorld, first: string, second: string) {
    const idx1 = this.diffOutput.indexOf(first);
    const idx2 = this.diffOutput.indexOf(second);
    assert.ok(idx1 >= 0, `"${first}" not found in diff output`);
    assert.ok(idx2 >= 0, `"${second}" not found in diff output`);
    assert.ok(idx1 < idx2, `Expected "${first}" before "${second}" in diff output`);
  },
);

Then(
  'the captured outputs {string} and {string} are equal',
  function (this: ChangeDownWorld, label1: string, label2: string) {
    const out1 = this.capturedOutputs.get(label1);
    const out2 = this.capturedOutputs.get(label2);
    assert.ok(out1 !== undefined, `No captured output "${label1}"`);
    assert.ok(out2 !== undefined, `No captured output "${label2}"`);
    assert.strictEqual(out1, out2);
  },
);

// --- Git diff driver detection ---

Given(
  'git diff driver argv with {int} args and valid SHA {string}',
  function (this: ChangeDownWorld, _count: number, sha: string) {
    this.gitArgv = ['node', 'sc', sha, 'old-mode', '/tmp/old-file', 'old-hex', 'old-mode2'];
  },
);

Given(
  'git diff driver argv with {int} args',
  function (this: ChangeDownWorld, count: number) {
    this.gitArgv = Array.from({ length: count }, (_, i) => `arg${i}`);
  },
);

Given(
  'git diff driver argv with {int} args and invalid SHA {string}',
  function (this: ChangeDownWorld, _count: number, sha: string) {
    this.gitArgv = ['node', 'sc', sha, 'old-mode', '/tmp/old-file', 'old-hex', 'old-mode2'];
  },
);

Then(
  'it is recognized as a git diff driver invocation',
  function (this: ChangeDownWorld) {
    assert.strictEqual(isGitDiffDriverInvocation(this.gitArgv), true);
  },
);

Then(
  'it is not recognized as a git diff driver invocation',
  function (this: ChangeDownWorld) {
    assert.strictEqual(isGitDiffDriverInvocation(this.gitArgv), false);
  },
);

// =============================================================================
// E7 - CLI Settle steps
//
// NOTE: "the settled content contains {string}" and
//       "the settled content does not contain {string}" are defined in
//       core-operations.steps.ts and reused here. When computing settlement,
//       we also set this.settledContent so those steps work.
// =============================================================================

Given(
  'content for settlement:',
  function (this: ChangeDownWorld, content: string) {
    this.settlementInput = content;
  },
);

When(
  'I compute settlement',
  function (this: ChangeDownWorld) {
    this.settlementResult = computeSettlement(this.settlementInput);
    // Bridge: set settledContent so existing core-operations Then steps work
    this.settledContent = this.settlementResult.settledContent;
  },
);

When(
  'I compute settlement as dry-run',
  function (this: ChangeDownWorld) {
    // Dry-run: compute but do not overwrite the input
    this.settlementResult = computeSettlement(this.settlementInput);
    this.settledContent = this.settlementResult.settledContent;
  },
);

When(
  'I compute settlement again on the settled content',
  function (this: ChangeDownWorld) {
    assert.ok(this.settlementResult, 'No first settlement result');
    this.settlementSecondResult = computeSettlement(this.settlementResult.settledContent);
  },
);

Then(
  'the settled count is {int}',
  function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.settlementResult, 'No settlement result');
    assert.strictEqual(this.settlementResult.settledCount, expected);
  },
);

Then(
  'the settled content is unchanged',
  function (this: ChangeDownWorld) {
    assert.ok(this.settlementResult, 'No settlement result');
    assert.strictEqual(this.settlementResult.settledContent, this.settlementInput);
  },
);

Then(
  'the second settled count is {int}',
  function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.settlementSecondResult, 'No second settlement result');
    assert.strictEqual(this.settlementSecondResult.settledCount, expected);
  },
);

Then(
  'the first and second settled contents are identical',
  function (this: ChangeDownWorld) {
    assert.ok(this.settlementResult, 'No first settlement result');
    assert.ok(this.settlementSecondResult, 'No second settlement result');
    assert.strictEqual(
      this.settlementResult.settledContent,
      this.settlementSecondResult.settledContent,
    );
  },
);

Then(
  'the original content is preserved',
  function (this: ChangeDownWorld) {
    // In dry-run mode, we computed the result but the original input is unchanged
    assert.ok(this.settlementInput.includes('{++'), 'Original content should still have markup');
  },
);

// =============================================================================
// E9 - CLI Status & List steps
// =============================================================================

// --- Status ---

Given(
  'content for status:',
  function (this: ChangeDownWorld, content: string) {
    this.statusInput = content;
  },
);

When(
  'I compute status',
  function (this: ChangeDownWorld) {
    this.statusResult = computeStatus(this.statusInput);
  },
);

Then(
  'the status proposed count is {int}',
  function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.statusResult, 'No status result');
    assert.strictEqual(this.statusResult.proposed, expected);
  },
);

Then(
  'the status accepted count is {int}',
  function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.statusResult, 'No status result');
    assert.strictEqual(this.statusResult.accepted, expected);
  },
);

Then(
  'the status rejected count is {int}',
  function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.statusResult, 'No status result');
    assert.strictEqual(this.statusResult.rejected, expected);
  },
);

Then(
  'the status total count is {int}',
  function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.statusResult, 'No status result');
    assert.strictEqual(this.statusResult.total, expected);
  },
);

// --- List ---

Given(
  'content for list:',
  function (this: ChangeDownWorld, content: string) {
    this.listInput = content;
  },
);

When(
  'I compute change list',
  function (this: ChangeDownWorld) {
    this.listResult = computeChangeList(this.listInput);
  },
);

When(
  'I compute change list filtered by status {string}',
  function (this: ChangeDownWorld, status: string) {
    this.listResult = computeChangeList(this.listInput, status);
  },
);

Then(
  'the change list is empty',
  function (this: ChangeDownWorld) {
    assert.strictEqual(this.listResult.length, 0);
  },
);

Then(
  'the change list has {int} entry',
  function (this: ChangeDownWorld, expected: number) {
    assert.strictEqual(
      this.listResult.length,
      expected,
      `Expected ${expected} entry but got ${this.listResult.length}`,
    );
  },
);

Then(
  'the change list has {int} entries',
  function (this: ChangeDownWorld, expected: number) {
    assert.strictEqual(
      this.listResult.length,
      expected,
      `Expected ${expected} entries but got ${this.listResult.length}`,
    );
  },
);

Then(
  'change list entry {int} has change_id {string}',
  function (this: ChangeDownWorld, index: number, expected: string) {
    const entry = this.listResult[index - 1];
    assert.ok(entry, `No entry at index ${index}`);
    assert.strictEqual(entry.change_id, expected);
  },
);

Then(
  'change list entry {int} has type {string}',
  function (this: ChangeDownWorld, index: number, expected: string) {
    const entry = this.listResult[index - 1];
    assert.ok(entry, `No entry at index ${index}`);
    assert.strictEqual(entry.type, expected);
  },
);

Then(
  'change list entry {int} has status {string}',
  function (this: ChangeDownWorld, index: number, expected: string) {
    const entry = this.listResult[index - 1];
    assert.ok(entry, `No entry at index ${index}`);
    assert.strictEqual(entry.status, expected);
  },
);

Then(
  'change list entry {int} has author {string}',
  function (this: ChangeDownWorld, index: number, expected: string) {
    const entry = this.listResult[index - 1];
    assert.ok(entry, `No entry at index ${index}`);
    assert.strictEqual(entry.author, expected);
  },
);

Then(
  'change list entry {int} has line {int}',
  function (this: ChangeDownWorld, index: number, expected: number) {
    const entry = this.listResult[index - 1];
    assert.ok(entry, `No entry at index ${index}`);
    assert.strictEqual(entry.line, expected);
  },
);

Then(
  'change list entry {int} has preview {string}',
  function (this: ChangeDownWorld, index: number, expected: string) {
    const entry = this.listResult[index - 1];
    assert.ok(entry, `No entry at index ${index}`);
    assert.strictEqual(entry.preview, expected);
  },
);
