import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, buildChangesDocument } from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

describe('buildChangesDocument', () => {
  it('produces committed text with no CriticMarkup', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.view).toBe('changes');
    expect(doc.lines[0].content[0].text).toBe('Hello .');
    expect(doc.lines[0].content[0].type === 'plain').toBeTruthy();
  });

  it('sets P flag for lines with pending proposals', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].margin.flags).toStrictEqual(['P']);
  });

  it('sets A flag for lines with accepted changes', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | accepted';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].content[0].text).toBe('Hello world.');
    expect(doc.lines[0].margin.flags).toStrictEqual(['A']);
  });

  it('includes change IDs in metadata', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].metadata).toHaveLength(1);
    expect(doc.lines[0].metadata[0].changeId).toBe('ct-1');
  });

  it('excludes footnote definition lines', () => {
    const content = 'Content.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].content[0].text).toBe('Content.');
  });

  it('carries sessionHashes with committed hash', () => {
    const content = 'Hello.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildChangesDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].sessionHashes).toBeTruthy();
    expect(doc.lines[0].sessionHashes!.committed).toBeTruthy();
    expect(doc.lines[0].sessionHashes!.raw).toBeTruthy();
  });
});
