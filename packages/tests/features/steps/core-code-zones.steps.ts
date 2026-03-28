import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeDownWorld } from './world.js';
import {
  findCodeZones,
  tryMatchFenceOpen,
  tryMatchFenceClose,
  skipInlineCode,
  type CodeZone,
} from '@changedown/core';

// =============================================================================
// Per-scenario state via declaration merging
// =============================================================================

declare module './world.js' {
  interface ChangeDownWorld {
    czInput: string;
    czZones: CodeZone[];
    czFenceOpenResult: { markerCode: number; length: number; nextPos: number } | null;
    czFenceCloseResult: number;
    czSkipResult: number;
  }
}

// =============================================================================
// Given — set up input text for code zones tests
// =============================================================================

Given('the code zones input is {string}', function (this: ChangeDownWorld, text: string) {
  this.czInput = text.replace(/\\n/g, '\n');
});

Given('the code zones input is:', function (this: ChangeDownWorld, text: string) {
  this.czInput = text;
});

// =============================================================================
// When — findCodeZones
// =============================================================================

When('I find code zones', function (this: ChangeDownWorld) {
  this.czZones = findCodeZones(this.czInput);
});

// =============================================================================
// Then — code zone count and properties
// =============================================================================

Then('the code zones count is {int}', function (this: ChangeDownWorld, expected: number) {
  assert.equal(this.czZones.length, expected,
    `Expected ${expected} code zones but got ${this.czZones.length}`);
});

Then('code zone {int} has type {string}', function (this: ChangeDownWorld, idx: number, expected: string) {
  const zone = this.czZones[idx - 1];
  assert.ok(zone, `No code zone at index ${idx}`);
  assert.equal(zone.type, expected);
});

Then('code zone {int} starts at {int}', function (this: ChangeDownWorld, idx: number, expected: number) {
  const zone = this.czZones[idx - 1];
  assert.ok(zone, `No code zone at index ${idx}`);
  assert.equal(zone.start, expected);
});

Then('code zone {int} ends at {int}', function (this: ChangeDownWorld, idx: number, expected: number) {
  const zone = this.czZones[idx - 1];
  assert.ok(zone, `No code zone at index ${idx}`);
  assert.equal(zone.end, expected);
});

// =============================================================================
// When/Then — tryMatchFenceOpen
// =============================================================================

When('I try to match fence open at position {int}', function (this: ChangeDownWorld, pos: number) {
  this.czFenceOpenResult = tryMatchFenceOpen(this.czInput, pos);
});

Then('the fence open result is null', function (this: ChangeDownWorld) {
  assert.equal(this.czFenceOpenResult, null);
});

Then('the fence open marker code is {int}', function (this: ChangeDownWorld, expected: number) {
  assert.ok(this.czFenceOpenResult, 'Expected fence open result to be non-null');
  assert.equal(this.czFenceOpenResult!.markerCode, expected);
});

Then('the fence open length is {int}', function (this: ChangeDownWorld, expected: number) {
  assert.ok(this.czFenceOpenResult, 'Expected fence open result to be non-null');
  assert.equal(this.czFenceOpenResult!.length, expected);
});

Then('the fence open nextPos is {int}', function (this: ChangeDownWorld, expected: number) {
  assert.ok(this.czFenceOpenResult, 'Expected fence open result to be non-null');
  assert.equal(this.czFenceOpenResult!.nextPos, expected);
});

// =============================================================================
// When/Then — tryMatchFenceClose
// =============================================================================

When(
  'I try to match fence close at position {int} with marker {int} and length {int}',
  function (this: ChangeDownWorld, pos: number, marker: number, len: number) {
    this.czFenceCloseResult = tryMatchFenceClose(this.czInput, pos, marker, len);
  },
);

Then('the fence close result is {int}', function (this: ChangeDownWorld, expected: number) {
  assert.equal(this.czFenceCloseResult, expected);
});

// =============================================================================
// When/Then — skipInlineCode
// =============================================================================

When('I skip inline code at position {int}', function (this: ChangeDownWorld, pos: number) {
  this.czSkipResult = skipInlineCode(this.czInput, pos);
});

Then('the skip result is {int}', function (this: ChangeDownWorld, expected: number) {
  assert.equal(this.czSkipResult, expected);
});
