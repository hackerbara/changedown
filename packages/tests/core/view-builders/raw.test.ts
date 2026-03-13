import * as assert from 'node:assert';
import { initHashline, buildRawDocument } from '@changetracks/core/internals';

describe('buildRawDocument', () => {
  before(async () => { await initHashline(); });

  it('includes all lines including footnotes', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildRawDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.view, 'raw');
    assert.strictEqual(doc.lines.length, 3);
    assert.strictEqual(doc.lines[0].content[0].text, 'Hello {++world++}[^ct-1].');
    assert.ok(doc.lines[0].content[0].type === 'plain');
  });

  it('has no flags or metadata', () => {
    const content = 'Hello.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildRawDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    for (const line of doc.lines) {
      assert.deepStrictEqual(line.margin.flags, []);
      assert.deepStrictEqual(line.metadata, []);
    }
  });

  it('lineNumber equals rawLineNumber', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const doc = buildRawDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    for (const line of doc.lines) {
      assert.strictEqual(line.margin.lineNumber, line.rawLineNumber);
    }
  });
});
