import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, buildSettledDocument } from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

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
    expect(doc.view).toBe('settled');
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].content).toStrictEqual([{ type: 'plain', text: 'Hello world.' }]);
    expect(doc.lines[0].margin.flags).toStrictEqual([]);
    expect(doc.lines[0].metadata).toStrictEqual([]);
  });

  it('resolves substitutions to new text', () => {
    const content = 'Use {~~REST~>GraphQL~~}.';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].content[0].text).toBe('Use GraphQL.');
  });

  it('removes deletions', () => {
    const content = 'Hello {--cruel --}world.';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].content[0].text).toBe('Hello world.');
  });

  it('carries rawLineNumber for session binding', () => {
    const content = 'Line one.\n{++Line two.++}\nLine three.';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines).toHaveLength(3);
    expect(doc.lines[0].rawLineNumber).toBe(1);
    expect(doc.lines[1].rawLineNumber).toBe(2);
    expect(doc.lines[2].rawLineNumber).toBe(3);
  });

  it('populates sessionHashes for CLI state recording', () => {
    const content = 'Hello world.';
    const doc = buildSettledDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].sessionHashes).toBeTruthy();
    expect(doc.lines[0].sessionHashes!.settledView).toBeTruthy();
  });
});
