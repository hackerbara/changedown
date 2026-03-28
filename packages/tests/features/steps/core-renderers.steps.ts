import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeDownWorld } from './world.js';

// ─── Core imports ───────────────────────────────────────────────────────────

import {
  promoteToLevel1,
  promoteToLevel2,
  compactToLevel1,
  compactToLevel0,
  buildViewDocument,
  formatAnsi,
  formatPlainText,
  initHashline,
  findUniqueMatch,
  checkCriticMarkupOverlap,
  guardOverlap,
  defaultNormalizer,
  type ViewOptions,
  type ThreeZoneViewName,
} from '@changedown/core';

// ─── ANSI helpers ───────────────────────────────────────────────────────────

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Strip three-zone margin (line number + gutter) from each line.
 * Lines look like " 1 │ content" or " 1 ┃ content".
 * Also strips the deliberation header (everything before the ─── separator line).
 */
function stripMargin(str: string): string {
  const lines = str.split('\n');

  // Find the separator line (──────) and skip everything up to and including it
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^─+$/.test(lines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }

  // Skip blank line after separator
  if (startIdx < lines.length && lines[startIdx].trim() === '') {
    startIdx++;
  }

  return lines
    .slice(startIdx)
    .map(line => {
      const m = line.match(/^\s*\d+\s+[│┃]\s?(.*)/);
      return m ? m[1] : line;
    })
    .join('\n');
}

/** Default ViewOptions for tests */
const testViewOptions: ViewOptions = {
  filePath: 'test.md',
  trackingStatus: 'tracked',
  protocolMode: 'classic',
  defaultView: 'review',
  viewPolicy: 'suggest',
};

/** Ensure hashline wasm is initialized (idempotent) */
let _hashlineInit: Promise<void> | null = null;
function ensureHashline(): Promise<void> {
  if (!_hashlineInit) _hashlineInit = initHashline();
  return _hashlineInit;
}

// ─── Shared state on World ──────────────────────────────────────────────────
// We store intermediate results on the World so steps can share data.

declare module './world.js' {
  interface ChangeDownWorld {
    /** CriticMarkup text for core-level (non-MCP) tests */
    coreText: string;
    /** Result of a level-promotion / descent / render operation */
    coreResult: string;
    /** Raw ANSI render output (before stripping) */
    coreAnsiRaw: string;
    /** Meta-view rendered output */
    coreMetaOutput: string;
    /** findUniqueMatch result */
    matchResult: {
      index: number;
      length: number;
      originalText: string;
      wasNormalized: boolean;
      wasSettledMatch?: boolean;
    } | null;
    /** Error captured from findUniqueMatch / guardOverlap */
    matchError: Error | null;
    /** checkCriticMarkupOverlap result */
    overlapResult: { changeType: string } | null;
    /** Whether guardOverlap threw */
    guardError: Error | null;
  }
}

// =============================================================================
// C13: Level promotion & descent steps
// =============================================================================

Given(
  'a CriticMarkup text {string}',
  function (this: ChangeDownWorld, text: string) {
    this.coreText = text;
  },
);

Given(
  'a CriticMarkup text:',
  function (this: ChangeDownWorld, text: string) {
    this.coreText = text;
  },
);

When(
  'I promote change {int} to Level 1 with metadata {string}',
  function (this: ChangeDownWorld, index: number, metadata: string) {
    this.coreResult = promoteToLevel1(this.coreText, index, metadata);
  },
);

When(
  'I promote change {int} to Level 2 with id {string}',
  function (this: ChangeDownWorld, index: number, id: string) {
    this.coreResult = promoteToLevel2(this.coreText, index, id);
  },
);

When(
  'I compact change {string} to Level 1',
  function (this: ChangeDownWorld, changeId: string) {
    this.coreResult = compactToLevel1(this.coreText, changeId);
  },
);

When(
  'I compact change {int} to Level 0',
  function (this: ChangeDownWorld, index: number) {
    this.coreResult = compactToLevel0(this.coreText, index);
  },
);

Then(
  'the result is {string}',
  function (this: ChangeDownWorld, expected: string) {
    assert.strictEqual(this.coreResult, expected);
  },
);

Then(
  'the result contains {string}',
  function (this: ChangeDownWorld, expected: string) {
    assert.ok(
      this.coreResult.includes(expected),
      `Expected result to contain "${expected}" but got:\n${this.coreResult}`,
    );
  },
);

// =============================================================================
// C14: ANSI renderer steps
// =============================================================================

When(
  'I render with ANSI in {string} view',
  async function (this: ChangeDownWorld, view: string) {
    await ensureHashline();
    // Map old view names to new three-zone ViewName
    const viewName: ThreeZoneViewName =
      (view === 'markup' || view === 'smart') ? 'review' : view as ThreeZoneViewName;
    const doc = buildViewDocument(this.coreText, viewName, testViewOptions);
    const ansiOpts: { showMarkup?: boolean } = {};
    if (view === 'markup') ansiOpts.showMarkup = true;
    this.coreAnsiRaw = formatAnsi(doc, ansiOpts);
    this.coreResult = stripAnsi(this.coreAnsiRaw);
  },
);

When(
  'I render with ANSI using Unicode strikethrough',
  async function (this: ChangeDownWorld) {
    await ensureHashline();
    const doc = buildViewDocument(this.coreText, 'review', testViewOptions);
    this.coreAnsiRaw = formatAnsi(doc, { useUnicodeStrikethrough: true });
    this.coreResult = stripAnsi(this.coreAnsiRaw);
  },
);

Then(
  'the stripped ANSI output is {string}',
  function (this: ChangeDownWorld, expected: string) {
    // Strip the three-zone header and margin (line numbers + gutter) for
    // exact content comparison against the expected plain text.
    const contentOnly = stripMargin(this.coreResult);
    assert.strictEqual(contentOnly, expected);
  },
);

Then(
  'the stripped ANSI output contains {string}',
  function (this: ChangeDownWorld, expected: string) {
    assert.ok(
      this.coreResult.includes(expected),
      `Expected stripped output to contain "${expected}" but got:\n${this.coreResult}`,
    );
  },
);

Then(
  'the stripped ANSI output does not contain {string}',
  function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(
      !this.coreResult.includes(unexpected),
      `Expected stripped output NOT to contain "${unexpected}" but it does`,
    );
  },
);

Then(
  'the raw ANSI output contains green escape code',
  function (this: ChangeDownWorld) {
    assert.ok(this.coreAnsiRaw.includes('\x1b[32m'), 'Expected green ANSI escape');
  },
);

Then(
  'the raw ANSI output contains red escape code',
  function (this: ChangeDownWorld) {
    assert.ok(this.coreAnsiRaw.includes('\x1b[31m'), 'Expected red ANSI escape');
  },
);

Then(
  'the raw ANSI output contains strikethrough escape code',
  function (this: ChangeDownWorld) {
    assert.ok(this.coreAnsiRaw.includes('\x1b[9m'), 'Expected ANSI strikethrough escape');
  },
);

Then(
  'the raw ANSI output contains yellow background escape code',
  function (this: ChangeDownWorld) {
    assert.ok(this.coreAnsiRaw.includes('\x1b[43m'), 'Expected yellow background ANSI escape');
  },
);

Then(
  'the raw ANSI output contains yellow escape code',
  function (this: ChangeDownWorld) {
    assert.ok(this.coreAnsiRaw.includes('\x1b[33m'), 'Expected yellow ANSI escape');
  },
);

Then(
  'the raw ANSI output contains dim escape code',
  function (this: ChangeDownWorld) {
    assert.ok(this.coreAnsiRaw.includes('\x1b[2m'), 'Expected dim ANSI escape');
  },
);

Then(
  'the raw ANSI output contains Unicode combining strikethrough',
  function (this: ChangeDownWorld) {
    assert.ok(this.coreAnsiRaw.includes('\u0336'), 'Expected Unicode combining strikethrough U+0336');
  },
);

Then(
  'the raw ANSI output does not contain ANSI strikethrough escape code',
  function (this: ChangeDownWorld) {
    assert.ok(!this.coreAnsiRaw.includes('\x1b[9m'), 'Did not expect ANSI strikethrough escape');
  },
);

Then(
  'the raw ANSI output contains Unicode combining strikethrough for {string}',
  function (this: ChangeDownWorld, text: string) {
    // Each character of the text should have U+0336 combining overlay
    for (const ch of text) {
      assert.ok(
        this.coreAnsiRaw.includes(ch + '\u0336'),
        `Expected "${ch}" to have Unicode combining strikethrough`,
      );
    }
  },
);

Then(
  'the raw ANSI output does not contain Unicode combining strikethrough for {string}',
  function (this: ChangeDownWorld, text: string) {
    // None of the characters should have U+0336
    for (const ch of text) {
      assert.ok(
        !this.coreAnsiRaw.includes(ch + '\u0336'),
        `Did not expect "${ch}" to have Unicode combining strikethrough`,
      );
    }
  },
);

// ── Meta view steps ─────────────────────────────────────────────────────────

When(
  'I render meta view for {string}',
  async function (this: ChangeDownWorld, name: string) {
    await ensureHashline();
    const filePath = this.files.get(name);
    assert.ok(filePath, `No file named "${name}" in this scenario`);
    // Read file content from disk
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(filePath, 'utf-8');
    const doc = buildViewDocument(content, 'review', {
      ...testViewOptions,
      filePath: name,
    });
    this.coreMetaOutput = formatPlainText(doc);
  },
);

Then(
  'the meta output contains {string}',
  function (this: ChangeDownWorld, expected: string) {
    assert.ok(
      this.coreMetaOutput.includes(expected),
      `Expected meta output to contain "${expected}" but got:\n${this.coreMetaOutput}`,
    );
  },
);

Then(
  'the meta output does not contain {string}',
  function (this: ChangeDownWorld, unexpected: string) {
    assert.ok(
      !this.coreMetaOutput.includes(unexpected),
      `Expected meta output NOT to contain "${unexpected}" but it does:\n${this.coreMetaOutput}`,
    );
  },
);

// =============================================================================
// C15: Text matching steps
// =============================================================================

Given(
  'a document text {string}',
  function (this: ChangeDownWorld, text: string) {
    this.coreText = text;
    this.matchResult = null;
    this.matchError = null;
    this.overlapResult = null;
    this.guardError = null;
  },
);

Given(
  'a document text:',
  function (this: ChangeDownWorld, text: string) {
    this.coreText = text;
    this.matchResult = null;
    this.matchError = null;
    this.overlapResult = null;
    this.guardError = null;
  },
);

Given(
  'a document text with smart right single quote {string}',
  function (this: ChangeDownWorld, rest: string) {
    // Replace ASCII apostrophe with RIGHT SINGLE QUOTATION MARK (U+2019)
    // The feature says: Sublime's => Sublime\u2019s
    this.coreText = rest.replace(/'/g, '\u2019');
    this.matchResult = null;
    this.matchError = null;
  },
);

Given(
  'a document text with NBSP between {string} and {string}',
  function (this: ChangeDownWorld, before: string, after: string) {
    this.coreText = before + '\u00A0' + after;
    this.matchResult = null;
    this.matchError = null;
  },
);

Given(
  'a document text with double-space and newline-joined {string}',
  function (this: ChangeDownWorld, phrase: string) {
    // Builds "hello  world and hello\nworld" for ambiguous whitespace test
    this.coreText = phrase.replace(/ /g, '  ') + ' and ' + phrase.replace(/ /g, '\n');
    this.matchResult = null;
    this.matchError = null;
  },
);

Given(
  'a document text with two smart-quoted {string}',
  function (this: ChangeDownWorld, phrase: string) {
    // Builds "Sublime\u2019s and Sublime\u2019s"
    const smartPhrase = phrase.replace(/'/g, '\u2019');
    this.coreText = smartPhrase + ' and ' + smartPhrase;
    this.matchResult = null;
    this.matchError = null;
  },
);

Given(
  'a document text with trailing-space newline {string} and {string}',
  function (this: ChangeDownWorld, firstLine: string, secondLine: string) {
    // Builds text like "ground truth; \nprojections derive current state."
    // The first line has a trailing space that is significant for the test.
    this.coreText = firstLine + '\n' + secondLine;
    this.matchResult = null;
    this.matchError = null;
  },
);

When(
  'I search for {string}',
  function (this: ChangeDownWorld, target: string) {
    try {
      this.matchResult = findUniqueMatch(this.coreText, target);
      this.matchError = null;
    } catch (err) {
      this.matchError = err as Error;
      this.matchResult = null;
    }
  },
);

When(
  'I search for {string} with normalizer',
  function (this: ChangeDownWorld, target: string) {
    try {
      this.matchResult = findUniqueMatch(this.coreText, target, defaultNormalizer);
      this.matchError = null;
    } catch (err) {
      this.matchError = err as Error;
      this.matchResult = null;
    }
  },
);

When(
  'I search for collapsed {string}',
  function (this: ChangeDownWorld, target: string) {
    // Process escaped newlines: the feature file can't embed real newlines in a
    // quoted string, so we accept literal "\\n" and convert to real newlines.
    const processed = target.replace(/\\n/g, '\n');
    try {
      this.matchResult = findUniqueMatch(this.coreText, processed, defaultNormalizer);
      this.matchError = null;
    } catch (err) {
      this.matchError = err as Error;
      this.matchResult = null;
    }
  },
);

When(
  'I search for {string} without normalizer',
  function (this: ChangeDownWorld, target: string) {
    try {
      this.matchResult = findUniqueMatch(this.coreText, target);
      this.matchError = null;
    } catch (err) {
      this.matchError = err as Error;
      this.matchResult = null;
    }
  },
);

Then(
  'the match index is {int}',
  function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.matchResult, 'No match result available');
    assert.strictEqual(this.matchResult!.index, expected);
  },
);

Then(
  'the match length is {int}',
  function (this: ChangeDownWorld, expected: number) {
    assert.ok(this.matchResult, 'No match result available');
    assert.strictEqual(this.matchResult!.length, expected);
  },
);

Then(
  'the match original text is {string}',
  function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.matchResult, 'No match result available');
    assert.strictEqual(this.matchResult!.originalText, expected);
  },
);

Then(
  'the match original text contains the smart quote',
  function (this: ChangeDownWorld) {
    assert.ok(this.matchResult, 'No match result available');
    assert.ok(
      this.matchResult!.originalText.includes('\u2019'),
      `Expected original text to contain smart quote (U+2019) but got: ${this.matchResult!.originalText}`,
    );
  },
);

Then(
  'the match original text contains {string}',
  function (this: ChangeDownWorld, expected: string) {
    assert.ok(this.matchResult, 'No match result available');
    assert.ok(
      this.matchResult!.originalText.includes(expected),
      `Expected original text to contain "${expected}" but got: ${this.matchResult!.originalText}`,
    );
  },
);

Then(
  'the match was not normalized',
  function (this: ChangeDownWorld) {
    assert.ok(this.matchResult, 'No match result available');
    assert.strictEqual(this.matchResult!.wasNormalized, false);
  },
);

Then(
  'the match was normalized',
  function (this: ChangeDownWorld) {
    assert.ok(this.matchResult, 'No match result available');
    assert.strictEqual(this.matchResult!.wasNormalized, true);
  },
);

Then(
  'the match was a settled match',
  function (this: ChangeDownWorld) {
    assert.ok(this.matchResult, 'No match result available');
    assert.strictEqual((this.matchResult as any).wasSettledMatch, true);
  },
);

Then(
  'the search throws a not-found error',
  function (this: ChangeDownWorld) {
    assert.ok(this.matchError, 'Expected an error but none was thrown');
    assert.match(this.matchError!.message, /not found/i);
  },
);

Then(
  'the search throws an ambiguous error',
  function (this: ChangeDownWorld) {
    assert.ok(this.matchError, 'Expected an error but none was thrown');
    assert.match(this.matchError!.message, /multiple|ambiguous/i);
  },
);

// ── Overlap detection steps ─────────────────────────────────────────────────

When(
  'I check overlap at index {int} length {int}',
  function (this: ChangeDownWorld, index: number, length: number) {
    this.overlapResult = checkCriticMarkupOverlap(this.coreText, index, length);
  },
);

When(
  'I check overlap at the position of {string}',
  function (this: ChangeDownWorld, target: string) {
    const idx = this.coreText.indexOf(target);
    assert.ok(idx !== -1, `Target "${target}" not found in text`);
    this.overlapResult = checkCriticMarkupOverlap(this.coreText, idx, target.length);
  },
);

Then(
  'there is no overlap',
  function (this: ChangeDownWorld) {
    assert.strictEqual(this.overlapResult, null, 'Expected no overlap but got one');
  },
);

Then(
  'the overlap change type is {string}',
  function (this: ChangeDownWorld, expectedType: string) {
    assert.ok(this.overlapResult, 'Expected overlap result but got null');
    assert.strictEqual(this.overlapResult!.changeType, expectedType);
  },
);

When(
  'I guard overlap at index {int} length {int}',
  function (this: ChangeDownWorld, index: number, length: number) {
    try {
      guardOverlap(this.coreText, index, length);
      this.guardError = null;
    } catch (err) {
      this.guardError = err as Error;
    }
  },
);

Then(
  'no error is thrown',
  function (this: ChangeDownWorld) {
    assert.strictEqual(this.guardError, null, `Expected no error but got: ${this.guardError?.message}`);
  },
);

Then(
  'the guard throws an overlap error',
  function (this: ChangeDownWorld) {
    assert.ok(this.guardError, 'Expected guardOverlap to throw but it did not');
    assert.match(this.guardError!.message, /overlaps with proposed change/);
  },
);

// =============================================================================
// C27: Diagnostic confusable detection steps
// =============================================================================

/**
 * Unescape unicode escape sequences like \uXXXX in test strings.
 */
function unescapeUnicodeC27(str: string): string {
  return str.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

Given(
  'a document text with em dash {string}',
  function (this: ChangeDownWorld, text: string) {
    this.coreText = unescapeUnicodeC27(text);
    this.matchResult = null;
    this.matchError = null;
  },
);

Given(
  'a document text with smart quotes {string}',
  function (this: ChangeDownWorld, text: string) {
    this.coreText = unescapeUnicodeC27(text);
    this.matchResult = null;
    this.matchError = null;
  },
);

Given(
  'a document text with en dash {string}',
  function (this: ChangeDownWorld, text: string) {
    this.coreText = unescapeUnicodeC27(text);
    this.matchResult = null;
    this.matchError = null;
  },
);

Given(
  'a document text with ellipsis {string}',
  function (this: ChangeDownWorld, text: string) {
    this.coreText = unescapeUnicodeC27(text);
    this.matchResult = null;
    this.matchError = null;
  },
);

Then(
  'the search throws a confusable error mentioning {string} and {string}',
  function (this: ChangeDownWorld, name1: string, name2: string) {
    assert.ok(this.matchError, 'Expected an error but none was thrown');
    assert.ok(
      this.matchError!.message.includes('Unicode mismatch'),
      `Expected error to mention "Unicode mismatch" but got: ${this.matchError!.message}`,
    );
    assert.ok(
      this.matchError!.message.includes(name1),
      `Expected error to mention "${name1}" but got: ${this.matchError!.message}`,
    );
    assert.ok(
      this.matchError!.message.includes(name2),
      `Expected error to mention "${name2}" but got: ${this.matchError!.message}`,
    );
  },
);

Then(
  'the search throws a confusable error mentioning {string}',
  function (this: ChangeDownWorld, name: string) {
    assert.ok(this.matchError, 'Expected an error but none was thrown');
    assert.ok(
      this.matchError!.message.includes('Unicode mismatch'),
      `Expected error to mention "Unicode mismatch" but got: ${this.matchError!.message}`,
    );
    assert.ok(
      this.matchError!.message.includes(name),
      `Expected error to mention "${name}" but got: ${this.matchError!.message}`,
    );
  },
);

Then(
  'the error includes codepoint {string}',
  function (this: ChangeDownWorld, codepoint: string) {
    assert.ok(this.matchError, 'Expected an error but none was thrown');
    assert.ok(
      this.matchError!.message.includes(codepoint),
      `Expected error to include "${codepoint}" but got: ${this.matchError!.message}`,
    );
  },
);

Then(
  'the error includes copy-pasteable file text',
  function (this: ChangeDownWorld) {
    assert.ok(this.matchError, 'Expected an error but none was thrown');
    // The error should contain the actual file text with the confusable characters
    assert.ok(
      this.matchError!.message.includes('Copy the exact text from file'),
      `Expected error to include copy-pasteable text section but got: ${this.matchError!.message}`,
    );
  },
);
