import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ChangeTracksWorld } from './world.js';
import {
  compact,
  type CompactedDocument,
} from '@changetracks/core';

// =============================================================================
// World extensions for compaction steps
// =============================================================================

declare module './world.js' {
  interface ChangeTracksWorld {
    compactionResult: CompactedDocument | null;
    l3Text: string;
  }
}

// =============================================================================
// Given steps — construct L3 documents
// =============================================================================

Given('an L3 document with 2 accepted and 1 proposed change', function (this: ChangeTracksWorld) {
  this.l3Text = [
    'The quick beautiful brown fox jumps happily over the lazy dog.',
    '',
    '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
    '    1:a1 The quick {++beautiful ++}brown fox jumps happily over the lazy dog.',
    '[^ct-2]: @bob | 2026-03-20 | ins | accepted',
    '    1:b2 The quick beautiful brown fox jumps {++happily ++}over the lazy dog.',
    '[^ct-3]: @carol | 2026-03-21 | ins | proposed',
    '    1:c3 The quick beautiful brown fox jumps happily over the {++lazy ++}dog.',
  ].join('\n');
});

Given('an L3 document with 1 proposed insertion', function (this: ChangeTracksWorld) {
  this.l3Text = [
    'The quick beautiful brown fox.',
    '',
    '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
    '    1:a1 The quick {++beautiful ++}brown fox.',
  ].join('\n');
});

Given('an L3 document with a supersede chain ct-1 to ct-2', function (this: ChangeTracksWorld) {
  this.l3Text = [
    'The quick newer brown fox.',
    '',
    '[^ct-1]: @alice | 2026-03-15 | sub | accepted',
    '    1:a1 The quick {~~new~>newer~~} brown fox.',
    '[^ct-2]: @alice | 2026-03-17 | sub | accepted',
    '    supersedes: ct-1',
    '    1:a1 The quick {~~newer~>newest~~} brown fox.',
  ].join('\n');
});

Given('an L3 document that has already been compacted once', async function (this: ChangeTracksWorld) {
  // Start with a document, compact it once to produce a boundary
  const original = [
    'The quick beautiful brown fox.',
    '',
    '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
    '    1:a1 The quick {++beautiful ++}brown fox.',
  ].join('\n');

  const firstResult = await compact(original, {
    targets: 'all-decided',
    undecidedPolicy: 'accept',
  });

  // Store the already-compacted text for the next step
  this.l3Text = firstResult.text;
});

Given('new decided changes exist after the first compaction', function (this: ChangeTracksWorld) {
  // Add a new decided change to the already-compacted document.
  // We need to append before the compaction-boundary.
  // The compacted doc looks like:
  //   The quick beautiful brown fox.
  //   [^ct-2]: compaction-boundary
  //
  // We insert a new footnote before the boundary.
  const lines = this.l3Text.split('\n');
  const boundaryIdx = lines.findIndex(l => l.includes('compaction-boundary'));
  assert.ok(boundaryIdx >= 0, 'expected compaction-boundary to exist');

  // Insert new decided change before boundary
  const newFootnote = [
    '[^ct-3]: @bob | 2026-03-21 | ins | accepted',
    '    1:b3 The quick beautiful {++amazing ++}brown fox.',
  ];

  // Also update body to reflect the new accepted change
  lines[0] = 'The quick beautiful amazing brown fox.';

  lines.splice(boundaryIdx, 0, ...newFootnote);
  this.l3Text = lines.join('\n');
});

Given('an L3 document with 1 accepted change', function (this: ChangeTracksWorld) {
  this.l3Text = [
    'Some text here.',
    '',
    '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
    '    1:a1 Some {++text ++}here.',
  ].join('\n');
});

// =============================================================================
// When steps — invoke compact()
// =============================================================================

When('I compact all decided changes', async function (this: ChangeTracksWorld) {
  this.compactionResult = await compact(this.l3Text, {
    targets: 'all-decided',
    undecidedPolicy: 'accept',
  });
});

When('I compact with undecided policy {string}', async function (this: ChangeTracksWorld, policy: string) {
  assert.ok(policy === 'accept' || policy === 'reject', `policy must be "accept" or "reject", got "${policy}"`);
  this.compactionResult = await compact(this.l3Text, {
    targets: ['ct-1'],
    undecidedPolicy: policy,
  });
});

When('I compact ct-2', async function (this: ChangeTracksWorld) {
  this.compactionResult = await compact(this.l3Text, {
    targets: ['ct-2'],
    undecidedPolicy: 'accept',
  });
});

When('I compact the new decided changes', async function (this: ChangeTracksWorld) {
  this.compactionResult = await compact(this.l3Text, {
    targets: 'all-decided',
    undecidedPolicy: 'accept',
  });
});

When(
  'I compact with boundary metadata note {string}',
  async function (this: ChangeTracksWorld, note: string) {
    this.compactionResult = await compact(this.l3Text, {
      targets: 'all-decided',
      undecidedPolicy: 'accept',
      boundaryMeta: { note },
    });
  },
);

// =============================================================================
// Then steps — assertions
// =============================================================================

Then('the decided footnotes are removed', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  assert.ok(result, 'compactionResult must exist');
  assert.ok(!result.text.includes('[^ct-1]:'), 'ct-1 footnote must be removed');
  assert.ok(!result.text.includes('[^ct-2]:'), 'ct-2 footnote must be removed');
});

Then('the proposed footnote is preserved', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  assert.ok(result.text.includes('[^ct-3]:'), 'ct-3 proposed footnote must be preserved');
});

Then('a compaction-boundary footnote exists', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  assert.ok(result.text.includes('compaction-boundary'), 'compaction-boundary must exist');
});

Then('the insertion text remains in the body', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  assert.ok(result.text.includes('beautiful'), 'inserted text "beautiful" must remain in body');
});

Then('the footnote is removed', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  assert.ok(!result.text.includes('[^ct-1]:'), 'ct-1 footnote must be removed');
});

Then('the insertion text is removed from the body', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  assert.ok(!result.text.includes('beautiful'), 'inserted text "beautiful" must be removed from body');
  assert.ok(result.text.includes('The quick brown fox.'), 'body must revert to original');
});

Then('both ct-1 and ct-2 are compacted', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  assert.ok(result.compactedIds.includes('ct-1'), 'ct-1 must be in compactedIds');
  assert.ok(result.compactedIds.includes('ct-2'), 'ct-2 must be in compactedIds');
  assert.ok(!result.text.includes('[^ct-1]:'), 'ct-1 footnote must be removed');
  assert.ok(!result.text.includes('[^ct-2]:'), 'ct-2 footnote must be removed');
});

Then('the compacted file is self-sufficient', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  assert.ok(result.verification.valid, 'verification must pass (no dangling refs)');
  assert.strictEqual(result.verification.danglingRefs.length, 0, 'no dangling refs');
});

Then('two compaction-boundary footnotes exist', function (this: ChangeTracksWorld) {
  const result = this.compactionResult!;
  const boundaryMatches = result.text.match(/compaction-boundary/g);
  assert.ok(boundaryMatches, 'compaction-boundary matches must exist');
  assert.strictEqual(boundaryMatches.length, 2, 'exactly two compaction-boundary entries');
});

Then('the boundary footnote contains {string}', function (this: ChangeTracksWorld, expected: string) {
  const result = this.compactionResult!;
  assert.ok(result.text.includes(expected), `boundary must contain "${expected}"`);
});
