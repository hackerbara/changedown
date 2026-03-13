import * as assert from 'node:assert';
import { initHashline, buildChangesDocument } from '@changetracks/core/internals';

before(async () => { await initHashline(); });

describe('buildChangesDocument', () => {
  it('produces committed text with no CriticMarkup', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.view, 'changes');
    assert.strictEqual(doc.lines[0].content[0].text, 'Hello .');
    assert.ok(doc.lines[0].content[0].type === 'plain');
  });

  it('sets P flag for lines with pending proposals', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.deepStrictEqual(doc.lines[0].margin.flags, ['P']);
  });

  it('sets A flag for lines with accepted changes', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | accepted';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.lines[0].content[0].text, 'Hello world.');
    assert.deepStrictEqual(doc.lines[0].margin.flags, ['A']);
  });

  it('includes change IDs in metadata', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.lines[0].metadata.length, 1);
    assert.strictEqual(doc.lines[0].metadata[0].changeId, 'ct-1');
  });

  it('excludes footnote definition lines', () => {
    const content = 'Content.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.lines.length, 1);
    assert.strictEqual(doc.lines[0].content[0].text, 'Content.');
  });

  it('carries sessionHashes with committed hash', () => {
    const content = 'Hello.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.ok(doc.lines[0].sessionHashes);
    assert.ok(doc.lines[0].sessionHashes!.committed);
    assert.ok(doc.lines[0].sessionHashes!.raw);
  });
});
