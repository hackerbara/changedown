import { describe, it, expect } from 'vitest';
import { buildViewSurfaceMap, viewAwareFind } from '@changedown/core/internals';

describe('buildViewSurfaceMap', () => {
  it('returns original text when no footnote refs present', () => {
    const result = buildViewSurfaceMap('Hello world.');
    expect(result.surface).toBe('Hello world.');
    // Each character maps 1:1, plus end sentinel
    expect(result.toRaw).toHaveLength(13); // 12 chars + 1 sentinel
  });

  it('strips [^cn-N] footnote refs', () => {
    const result = buildViewSurfaceMap('Hello[^cn-1] world.');
    expect(result.surface).toBe('Hello world.');
  });

  it('strips [^cn-N.M] dotted footnote refs', () => {
    const result = buildViewSurfaceMap('Hello[^cn-1.2] world.');
    expect(result.surface).toBe('Hello world.');
  });

  it('strips multiple footnote refs', () => {
    const result = buildViewSurfaceMap('A[^cn-1] B[^cn-2] C.');
    expect(result.surface).toBe('A B C.');
  });

  it('position map correctly maps back to raw positions', () => {
    const raw = 'Hello[^cn-1] world.';
    const result = buildViewSurfaceMap(raw);
    // 'Hello world.' where ' world.' starts at surface index 5
    // In raw text, ' world.' starts at index 12 (after '[^cn-1]')
    expect(result.toRaw[5]).toBe(12);
  });
});

describe('viewAwareFind', () => {
  it('finds text that spans across a footnote ref', () => {
    const raw = 'The quick[^cn-1] brown fox.';
    const result = viewAwareFind(raw, 'quick brown');
    expect(result).not.toBe(null);
    expect(result!.index).toBe(4); // 'quick' starts at 4
    // rawText includes the footnote ref
    expect(result!.rawText.includes('[^cn-1]')).toBeTruthy();
    expect(result!.rawText).toBe('quick[^cn-1] brown');
  });

  it('returns null when target not found', () => {
    const result = viewAwareFind('Hello world.', 'xyz');
    expect(result).toBeNull();
  });

  it('returns null when target is ambiguous', () => {
    const result = viewAwareFind('the[^cn-1] cat and the[^cn-2] cat', 'the cat');
    expect(result).toBeNull();
  });

  it('matches simple text without footnote refs', () => {
    const result = viewAwareFind('Hello world.', 'world');
    expect(result).not.toBe(null);
    expect(result!.index).toBe(6);
    expect(result!.length).toBe(5);
    expect(result!.rawText).toBe('world');
  });
});
