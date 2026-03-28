import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeDownWorld } from './world.js';
import { annotateSidecar, type AnnotationMetadata } from '@changedown/core';

// =============================================================================
// Shared state extensions on the World class
// =============================================================================

declare module './world.js' {
  interface ChangeDownWorld {
    scOldText: string;
    scNewText: string;
    scLanguage: string;
    scMetadata: AnnotationMetadata | undefined;
    scResult: string | undefined;
  }
}

// =============================================================================
// Given — set original sidecar text
// =============================================================================

Given('the original sidecar text is {string}', function (this: ChangeDownWorld, text: string) {
  this.scOldText = text.replace(/\\n/g, '\n');
  this.scMetadata = undefined;
});

Given('the original sidecar text:', function (this: ChangeDownWorld, text: string) {
  this.scOldText = text;
  this.scMetadata = undefined;
});

// =============================================================================
// Given — set language
// =============================================================================

Given('the sidecar language is {string}', function (this: ChangeDownWorld, lang: string) {
  this.scLanguage = lang;
});

// =============================================================================
// Given — set metadata
// =============================================================================

Given('the sidecar metadata author is {string}', function (this: ChangeDownWorld, author: string) {
  if (!this.scMetadata) this.scMetadata = {};
  this.scMetadata.author = author;
});

Given('the sidecar metadata date is {string}', function (this: ChangeDownWorld, date: string) {
  if (!this.scMetadata) this.scMetadata = {};
  this.scMetadata.date = date;
});

// =============================================================================
// When — apply annotateSidecar
// =============================================================================

When(
  'the sidecar text is changed to {string} for language {string}',
  function (this: ChangeDownWorld, text: string, lang: string) {
    this.scNewText = text.replace(/\\n/g, '\n');
    this.scLanguage = lang;
    this.scResult = annotateSidecar(this.scOldText, this.scNewText, lang, this.scMetadata);
  },
);

When('the sidecar text is changed to:', function (this: ChangeDownWorld, text: string) {
  this.scNewText = text;
  this.scResult = annotateSidecar(this.scOldText, text, this.scLanguage, this.scMetadata);
});

// =============================================================================
// Then — assertions
// =============================================================================

Then('the sidecar result is undefined', function (this: ChangeDownWorld) {
  assert.equal(this.scResult, undefined);
});

Then('the sidecar result equals the new text', function (this: ChangeDownWorld) {
  assert.equal(this.scResult, this.scNewText);
});

Then('the sidecar result contains {string}', function (this: ChangeDownWorld, expected: string) {
  assert.ok(this.scResult !== undefined, 'Expected sidecar result to be defined');
  assert.ok(
    this.scResult!.includes(expected),
    `Expected sidecar output to contain "${expected}" but got:\n${this.scResult}`,
  );
});

Then('the sidecar result does not contain {string}', function (this: ChangeDownWorld, unexpected: string) {
  assert.ok(this.scResult !== undefined, 'Expected sidecar result to be defined');
  assert.ok(
    !this.scResult!.includes(unexpected),
    `Expected sidecar output NOT to contain "${unexpected}" but got:\n${this.scResult}`,
  );
});
