import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeTracksWorld } from './world.js';
import {
  settledLine,
  computeSettledLineHash,
  formatTrackedHashLines,
  formatTrackedHeader,
  initHashline,
} from '@changetracks/core';

// =============================================================================
// Shared state extensions on the World class
// =============================================================================

declare module './world.js' {
  interface ChangeTracksWorld {
    htInput: string;
    htSettledOutput: string;
    htHash: string;
    htStoredHashes: Map<string, string>;
    htFormatted: string;
    htHeader: string;
    htHashlineInitialized: boolean;
  }
}

// =============================================================================
// settledLine steps
// =============================================================================

Given('the settled line input is {string}', function (this: ChangeTracksWorld, text: string) {
  this.htInput = text;
});

Given('the settled line input is:', function (this: ChangeTracksWorld, text: string) {
  this.htInput = text;
});

When('I compute the settled line output', function (this: ChangeTracksWorld) {
  this.htSettledOutput = settledLine(this.htInput);
});

Then('the settled line output is {string}', function (this: ChangeTracksWorld, expected: string) {
  assert.equal(this.htSettledOutput, expected);
});

Then('the settled line output is:', function (this: ChangeTracksWorld, expected: string) {
  assert.equal(this.htSettledOutput, expected);
});

Then('the settled line output is empty', function (this: ChangeTracksWorld) {
  assert.equal(this.htSettledOutput, '');
});

// =============================================================================
// computeSettledLineHash steps
// =============================================================================

Given('the hashline module is ready', async function (this: ChangeTracksWorld) {
  if (!this.htHashlineInitialized) {
    await initHashline();
    this.htHashlineInitialized = true;
  }
  if (!this.htStoredHashes) {
    this.htStoredHashes = new Map();
  }
});

When(
  'I compute the settled hash at index {int} for {string}',
  function (this: ChangeTracksWorld, idx: number, text: string) {
    this.htHash = computeSettledLineHash(idx, text);
  },
);

When(
  'I compute the settled hash at index {int} for:',
  function (this: ChangeTracksWorld, idx: number, text: string) {
    this.htHash = computeSettledLineHash(idx, text);
  },
);

Then('the settled hash is a valid 2-char hex string', function (this: ChangeTracksWorld) {
  assert.match(this.htHash, /^[0-9a-f]{2}$/);
});

When(
  'I store the settled hash as {string}',
  function (this: ChangeTracksWorld, label: string) {
    if (!this.htStoredHashes) {
      this.htStoredHashes = new Map();
    }
    this.htStoredHashes.set(label, this.htHash);
  },
);

Then(
  'the settled hash differs from stored {string}',
  function (this: ChangeTracksWorld, label: string) {
    const stored = this.htStoredHashes.get(label);
    assert.ok(stored !== undefined, `No stored hash with label "${label}"`);
    assert.notEqual(this.htHash, stored, `Expected hashes to differ but both are "${this.htHash}"`);
  },
);

Then(
  'the settled hash equals stored {string}',
  function (this: ChangeTracksWorld, label: string) {
    const stored = this.htStoredHashes.get(label);
    assert.ok(stored !== undefined, `No stored hash with label "${label}"`);
    assert.equal(this.htHash, stored, `Expected hashes to be equal but got "${this.htHash}" vs "${stored}"`);
  },
);

// =============================================================================
// formatTrackedHashLines steps
// =============================================================================

When(
  'I format tracked hash lines for {string}',
  function (this: ChangeTracksWorld, content: string) {
    const unescaped = content.replace(/\\n/g, '\n');
    this.htFormatted = formatTrackedHashLines(unescaped);
  },
);

When(
  'I format tracked hash lines for:',
  function (this: ChangeTracksWorld, content: string) {
    this.htFormatted = formatTrackedHashLines(content);
  },
);

When(
  'I format tracked hash lines with startLine {int} for {string}',
  function (this: ChangeTracksWorld, startLine: number, content: string) {
    const unescaped = content.replace(/\\n/g, '\n');
    this.htFormatted = formatTrackedHashLines(unescaped, { startLine });
  },
);

When(
  'I format tracked hash lines with startLine {int} for:',
  function (this: ChangeTracksWorld, startLine: number, content: string) {
    this.htFormatted = formatTrackedHashLines(content, { startLine });
  },
);

Then(
  'the tracked output has {int} lines',
  function (this: ChangeTracksWorld, expected: number) {
    const lines = this.htFormatted.split('\n');
    assert.equal(lines.length, expected);
  },
);

Then(
  'the tracked output line {int} matches single hash format',
  function (this: ChangeTracksWorld, lineNum: number) {
    const lines = this.htFormatted.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    const line = lines[lineNum - 1];
    // Single hash format: LINE:HH|content (no dot in hash section)
    assert.match(
      line,
      /^\s*\d+:[0-9a-f]{2}\|/,
      `Expected single hash format but got: "${line}"`,
    );
    assert.doesNotMatch(
      line,
      /^\s*\d+:[0-9a-f]{2}\.[0-9a-f]{2}\|/,
      `Line has dual hash format when single was expected: "${line}"`,
    );
  },
);

// Alias for "tracked output line N matches ..." when used without "the"
Then(
  'tracked output line {int} matches single hash format',
  function (this: ChangeTracksWorld, lineNum: number) {
    const lines = this.htFormatted.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    const line = lines[lineNum - 1];
    assert.match(line, /^\s*\d+:[0-9a-f]{2}\|/, `Expected single hash format but got: "${line}"`);
    assert.doesNotMatch(line, /^\s*\d+:[0-9a-f]{2}\.[0-9a-f]{2}\|/, `Line has dot-separated format when single was expected: "${line}"`);
  },
);

Then(
  'all tracked output lines have pipe delimiters',
  function (this: ChangeTracksWorld) {
    const lines = this.htFormatted.split('\n');
    for (let i = 0; i < lines.length; i++) {
      assert.ok(lines[i].includes('|'), `Line ${i + 1} missing pipe delimiter: "${lines[i]}"`);
    }
  },
);

Then(
  'the tracked output line {int} starts with number {int}',
  function (this: ChangeTracksWorld, lineNum: number, expectedNum: number) {
    const lines = this.htFormatted.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    const line = lines[lineNum - 1].trimStart();
    assert.ok(
      line.startsWith(`${expectedNum}:`),
      `Expected line ${lineNum} to start with "${expectedNum}:" but got: "${line}"`,
    );
  },
);

Then(
  'the tracked output line {int} contains {string}',
  function (this: ChangeTracksWorld, lineNum: number, expected: string) {
    const lines = this.htFormatted.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    assert.ok(
      lines[lineNum - 1].includes(expected),
      `Expected line ${lineNum} to contain "${expected}" but got: "${lines[lineNum - 1]}"`,
    );
  },
);

Then(
  'the tracked output line {int} starts with a space-padded number',
  function (this: ChangeTracksWorld, lineNum: number) {
    const lines = this.htFormatted.split('\n');
    assert.ok(lineNum >= 1 && lineNum <= lines.length, `Line ${lineNum} out of range`);
    const line = lines[lineNum - 1];
    // Space-padded means the line starts with at least one space before the digit
    assert.match(
      line,
      /^ +\d+:/,
      `Expected line ${lineNum} to start with space-padded number but got: "${line}"`,
    );
  },
);

// =============================================================================
// formatTrackedHeader steps
// =============================================================================

When(
  'I format tracked header for file {string} with content {string}',
  function (this: ChangeTracksWorld, filePath: string, content: string) {
    const unescaped = content.replace(/\\n/g, '\n');
    this.htHeader = formatTrackedHeader(filePath, unescaped);
  },
);

When(
  'I format tracked header for file {string} with content:',
  function (this: ChangeTracksWorld, filePath: string, content: string) {
    this.htHeader = formatTrackedHeader(filePath, content);
  },
);

When(
  'I format tracked header for file {string} with status {string} and content {string}',
  function (this: ChangeTracksWorld, filePath: string, status: string, content: string) {
    const unescaped = content.replace(/\\n/g, '\n');
    this.htHeader = formatTrackedHeader(filePath, unescaped, status);
  },
);

When(
  'I format tracked header for file {string} with status {string} and content:',
  function (this: ChangeTracksWorld, filePath: string, status: string, content: string) {
    this.htHeader = formatTrackedHeader(filePath, content, status);
  },
);

Then(
  'the tracked header contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    assert.ok(
      this.htHeader.includes(expected),
      `Expected header to contain "${expected}" but got:\n${this.htHeader}`,
    );
  },
);

Then(
  'the tracked header does not contain {string}',
  function (this: ChangeTracksWorld, unexpected: string) {
    assert.ok(
      !this.htHeader.includes(unexpected),
      `Expected header NOT to contain "${unexpected}" but it does:\n${this.htHeader}`,
    );
  },
);
