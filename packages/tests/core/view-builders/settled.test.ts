import assert from 'node:assert';
import { initHashline, buildSettledDocument } from '@changetracks/core/internals';

before(async () => { await initHashline(); });

describe('buildSettledDocument', () => {
  it('produces settled text with all changes applied', () => {
    const content = 'Hello {++world++}.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md',
      trackingStatus: 'tracked',
      protocolMode: 'classic',
      defaultView: 'review',
      viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.view, 'settled');
    assert.strictEqual(doc.lines.length, 1);
    assert.deepStrictEqual(doc.lines[0].content, [{ type: 'plain', text: 'Hello world.' }]);
    assert.deepStrictEqual(doc.lines[0].margin.flags, []);
    assert.deepStrictEqual(doc.lines[0].metadata, []);
  });

  it('resolves substitutions to new text', () => {
    const content = 'Use {~~REST~>GraphQL~~}.';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.lines[0].content[0].text, 'Use GraphQL.');
  });

  it('removes deletions', () => {
    const content = 'Hello {--cruel --}world.';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.lines[0].content[0].text, 'Hello world.');
  });

  it('carries rawLineNumber for session binding', () => {
    const content = 'Line one.\n{++Line two.++}\nLine three.';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.lines.length, 3);
    assert.strictEqual(doc.lines[0].rawLineNumber, 1);
    assert.strictEqual(doc.lines[1].rawLineNumber, 2);
    assert.strictEqual(doc.lines[2].rawLineNumber, 3);
  });

  it('populates sessionHashes for CLI state recording', () => {
    const content = 'Hello world.';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.ok(doc.lines[0].sessionHashes);
    assert.ok(doc.lines[0].sessionHashes!.settledView);
  });
});
