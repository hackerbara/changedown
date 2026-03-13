import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeTracksWorld } from './world.js';
import { annotateMarkdown } from '@changetracks/core';

// =============================================================================
// Shared state extensions on the World class
// =============================================================================

declare module './world.js' {
  interface ChangeTracksWorld {
    mdOldText: string;
    mdNewText: string;
    mdResult: string;
  }
}

// =============================================================================
// Given — set original markdown text
// =============================================================================

Given('the original markdown text:', function (this: ChangeTracksWorld, text: string) {
  this.mdOldText = text;
});

Given('the original markdown text is {string}', function (this: ChangeTracksWorld, text: string) {
  this.mdOldText = text;
});

// =============================================================================
// When — apply annotateMarkdown
// =============================================================================

When('the text is changed to:', function (this: ChangeTracksWorld, text: string) {
  this.mdNewText = text;
  this.mdResult = annotateMarkdown(this.mdOldText, text);
});

When('the markdown text is changed to {string}', function (this: ChangeTracksWorld, text: string) {
  this.mdNewText = text;
  this.mdResult = annotateMarkdown(this.mdOldText, text);
});

// =============================================================================
// Then — assert on annotated output
// =============================================================================

Then('the annotated markdown output is:', function (this: ChangeTracksWorld, expected: string) {
  assert.equal(this.mdResult, expected);
});

Then('the annotated markdown output is {string}', function (this: ChangeTracksWorld, expected: string) {
  assert.equal(this.mdResult, expected);
});

Then('the annotated markdown output contains:', function (this: ChangeTracksWorld, expected: string) {
  assert.ok(
    this.mdResult.includes(expected),
    `Expected output to contain:\n${expected}\n\nBut got:\n${this.mdResult}`,
  );
});

Then('the annotated markdown output contains {string}', function (this: ChangeTracksWorld, expected: string) {
  assert.ok(
    this.mdResult.includes(expected),
    `Expected output to contain "${expected}" but got: "${this.mdResult}"`,
  );
});

Then('the annotated markdown output does not contain {string}', function (this: ChangeTracksWorld, unexpected: string) {
  assert.ok(
    !this.mdResult.includes(unexpected),
    `Expected output NOT to contain "${unexpected}" but got: "${this.mdResult}"`,
  );
});
