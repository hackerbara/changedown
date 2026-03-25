import { describe, it, expect } from 'vitest';
import { parseFootnotes } from '../src/footnote-parser.js';

describe('footnote-parser image-dimensions', () => {
  it('parses image-dimensions from ins footnote', () => {
    const content = `Some text

[^ct-1]: @alice | 2026-03-14 | ins | proposed
    image-dimensions: 2.5in x 1.8in
`;
    const footnotes = parseFootnotes(content);
    const fn = footnotes.get('ct-1');
    expect(fn).toBeDefined();
    expect(fn!.imageDimensions).toEqual({ widthIn: 2.5, heightIn: 1.8 });
  });

  it('parses image-dimensions from image-type footnote', () => {
    const content = `![alt](media/hash.png)

[^ct-2]: @system | 2026-03-14 | image | proposed
    image-dimensions: 4.0in x 3.0in
`;
    const footnotes = parseFootnotes(content);
    const fn = footnotes.get('ct-2');
    expect(fn).toBeDefined();
    expect(fn!.type).toBe('image');
    expect(fn!.imageDimensions).toEqual({ widthIn: 4.0, heightIn: 3.0 });
  });

  it('returns undefined imageDimensions when not present', () => {
    const content = `[^ct-3]: @alice | 2026-03-14 | ins | proposed\n`;
    const footnotes = parseFootnotes(content);
    const fn = footnotes.get('ct-3');
    expect(fn).toBeDefined();
    expect(fn!.imageDimensions).toBeUndefined();
  });

  it('parses image-dimensions alongside reason', () => {
    const content = `[^ct-4]: @alice | 2026-03-14 | ins | proposed
    reason: added diagram
    image-dimensions: 6.5in x 4.2in
`;
    const footnotes = parseFootnotes(content);
    const fn = footnotes.get('ct-4');
    expect(fn!.reason).toBe('added diagram');
    expect(fn!.imageDimensions).toEqual({ widthIn: 6.5, heightIn: 4.2 });
  });

  it('handles fractional inch values', () => {
    const content = `[^ct-5]: @alice | 2026-03-14 | image | proposed
    image-dimensions: 0.3333333333333333in x 0.3333333333333333in
`;
    const footnotes = parseFootnotes(content);
    const fn = footnotes.get('ct-5');
    expect(fn!.imageDimensions!.widthIn).toBeCloseTo(0.333, 3);
    expect(fn!.imageDimensions!.heightIn).toBeCloseTo(0.333, 3);
  });
});

describe('footnote-parser imageMetadata bag', () => {
  it('parses image-* metadata keys into imageMetadata bag', () => {
    const content = `Some image text

[^ct-1]: @alice | 2026-03-14 | ins | proposed
    image-dimensions: 2.5in x 1.8in
    image-float: anchor
    image-h-anchor: column
    image-h-offset: 914400
    image-v-anchor: paragraph
    image-v-offset: 457200
    image-wrap: wrapSquare
    image-wrap-side: bothSides
    image-z: background
    image-dist: 0 0 114300 114300
`;
    const footnotes = parseFootnotes(content);
    const fn = footnotes.get('ct-1');
    expect(fn).toBeDefined();
    // image-dimensions goes to its own field
    expect(fn!.imageDimensions).toEqual({ widthIn: 2.5, heightIn: 1.8 });
    // all other image-* keys go to imageMetadata bag
    expect(fn!.imageMetadata).toBeDefined();
    expect(fn!.imageMetadata!['image-float']).toBe('anchor');
    expect(fn!.imageMetadata!['image-h-anchor']).toBe('column');
    expect(fn!.imageMetadata!['image-h-offset']).toBe('914400');
    expect(fn!.imageMetadata!['image-v-anchor']).toBe('paragraph');
    expect(fn!.imageMetadata!['image-v-offset']).toBe('457200');
    expect(fn!.imageMetadata!['image-wrap']).toBe('wrapSquare');
    expect(fn!.imageMetadata!['image-wrap-side']).toBe('bothSides');
    expect(fn!.imageMetadata!['image-z']).toBe('background');
    expect(fn!.imageMetadata!['image-dist']).toBe('0 0 114300 114300');
  });

  it('parses merge-detected into imageMetadata bag', () => {
    const content = `[^ct-2]: @alice | 2026-03-14 | ins | proposed
    merge-detected: 3
`;
    const footnotes = parseFootnotes(content);
    const fn = footnotes.get('ct-2');
    expect(fn).toBeDefined();
    expect(fn!.imageMetadata).toBeDefined();
    expect(fn!.imageMetadata!['merge-detected']).toBe('3');
  });

  it('returns undefined imageMetadata when no image-* keys present', () => {
    const content = `[^ct-3]: @alice | 2026-03-14 | ins | proposed
    reason: just a text change
`;
    const footnotes = parseFootnotes(content);
    const fn = footnotes.get('ct-3');
    expect(fn).toBeDefined();
    expect(fn!.imageMetadata).toBeUndefined();
  });
});
