import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, buildRawDocument } from '@changetracks/core/internals';

describe('buildRawDocument', () => {
  beforeAll(async () => { await initHashline(); });

  it('includes all lines including footnotes', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildRawDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.view).toBe('raw');
    expect(doc.lines).toHaveLength(3);
    expect(doc.lines[0].content[0].text).toBe('Hello {++world++}[^ct-1].');
    expect(doc.lines[0].content[0].type === 'plain').toBeTruthy();
  });

  it('has no flags or metadata', () => {
    const content = 'Hello.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildRawDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    for (const line of doc.lines) {
      expect(line.margin.flags).toStrictEqual([]);
      expect(line.metadata).toStrictEqual([]);
    }
  });

  it('lineNumber equals rawLineNumber', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const doc = buildRawDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    for (const line of doc.lines) {
      expect(line.margin.lineNumber).toBe(line.rawLineNumber);
    }
  });
});
