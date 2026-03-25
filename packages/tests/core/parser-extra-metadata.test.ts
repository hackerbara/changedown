import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, parseForFormat } from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

describe('parseFootnoteDefinitions extraMetadata (ADR-A 1b)', () => {
  it('preserves image-dimensions as structured imageDimensions', () => {
    const text = [
      '{==![photo](media/a.png)==}[^ct-1]',
      '',
      '[^ct-1]: @system | 2026-03-14 | image | proposed',
      '    image-dimensions: 2.5in x 1.8in',
    ].join('\n');
    const doc = parseForFormat(text);
    const changes = doc.getChanges();
    const node = changes.find(c => c.id === 'ct-1');
    expect(node).toBeDefined();
    expect(node!.metadata?.imageDimensions).toEqual({
      widthIn: 2.5,
      heightIn: 1.8,
    });
  });

  it('preserves image-float and other image-* keys in imageMetadata', () => {
    const text = [
      '{==![photo](media/a.png)==}[^ct-1]',
      '',
      '[^ct-1]: @system | 2026-03-14 | image | proposed',
      '    image-dimensions: 4.0in x 3.0in',
      '    image-float: anchor',
      '    image-h-anchor: column',
      '    image-wrap: square',
    ].join('\n');
    const doc = parseForFormat(text);
    const node = doc.getChanges().find(c => c.id === 'ct-1');
    expect(node!.metadata?.imageMetadata).toEqual({
      'image-float': 'anchor',
      'image-h-anchor': 'column',
      'image-wrap': 'square',
    });
  });

  it('does not capture recognized patterns as extraMetadata', () => {
    const text = [
      '{++added++}[^ct-1]',
      '',
      '[^ct-1]: @alice | 2026-03-14 | ins | proposed',
      '    reason: important fix',
      '    approved: @bob 2026-03-15T10:00:00Z "looks good"',
      '    image-dimensions: 1.0in x 1.0in',
    ].join('\n');
    const doc = parseForFormat(text);
    const node = doc.getChanges().find(c => c.id === 'ct-1');
    // reason and approved should be parsed by their existing patterns, not captured as extraMetadata
    expect(node!.metadata?.approvals).toBeDefined();
    // image-dimensions should still be captured via extraMetadata
    expect(node!.metadata?.imageDimensions).toEqual({
      widthIn: 1.0,
      heightIn: 1.0,
    });
  });

  it('does not steal discussion continuation lines containing colons', () => {
    const text = [
      '{++added++}[^ct-1]',
      '',
      '[^ct-1]: @alice | 2026-03-14 | ins | proposed',
      '    @bob 2026-03-15: First line of comment',
      '    note: this is a continuation of the comment above',
    ].join('\n');
    const doc = parseForFormat(text);
    const node = doc.getChanges().find(c => c.id === 'ct-1');
    // The "note: this..." line should be a continuation of Bob's comment, not extraMetadata
    expect(node!.metadata?.discussion).toBeDefined();
    expect(node!.metadata!.discussion![0].text).toContain('note: this is a continuation');
    expect(node!.metadata?.imageDimensions).toBeUndefined();
  });
});
