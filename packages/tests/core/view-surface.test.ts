import * as assert from 'node:assert';
import { buildViewSurfaceMap, viewAwareFind } from '@changetracks/core/internals';

describe('buildViewSurfaceMap', () => {
  it('returns original text when no footnote refs present', () => {
    const result = buildViewSurfaceMap('Hello world.');
    assert.strictEqual(result.surface, 'Hello world.');
    // Each character maps 1:1, plus end sentinel
    assert.strictEqual(result.toRaw.length, 13); // 12 chars + 1 sentinel
  });

  it('strips [^ct-N] footnote refs', () => {
    const result = buildViewSurfaceMap('Hello[^ct-1] world.');
    assert.strictEqual(result.surface, 'Hello world.');
  });

  it('strips [^ct-N.M] dotted footnote refs', () => {
    const result = buildViewSurfaceMap('Hello[^ct-1.2] world.');
    assert.strictEqual(result.surface, 'Hello world.');
  });

  it('strips multiple footnote refs', () => {
    const result = buildViewSurfaceMap('A[^ct-1] B[^ct-2] C.');
    assert.strictEqual(result.surface, 'A B C.');
  });

  it('position map correctly maps back to raw positions', () => {
    const raw = 'Hello[^ct-1] world.';
    const result = buildViewSurfaceMap(raw);
    // 'Hello world.' where ' world.' starts at surface index 5
    // In raw text, ' world.' starts at index 12 (after '[^ct-1]')
    assert.strictEqual(result.toRaw[5], 12);
  });
});

describe('viewAwareFind', () => {
  it('finds text that spans across a footnote ref', () => {
    const raw = 'The quick[^ct-1] brown fox.';
    const result = viewAwareFind(raw, 'quick brown');
    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.index, 4); // 'quick' starts at 4
    // rawText includes the footnote ref
    assert.ok(result!.rawText.includes('[^ct-1]'));
    assert.strictEqual(result!.rawText, 'quick[^ct-1] brown');
  });

  it('returns null when target not found', () => {
    const result = viewAwareFind('Hello world.', 'xyz');
    assert.strictEqual(result, null);
  });

  it('returns null when target is ambiguous', () => {
    const result = viewAwareFind('the[^ct-1] cat and the[^ct-2] cat', 'the cat');
    assert.strictEqual(result, null);
  });

  it('matches simple text without footnote refs', () => {
    const result = viewAwareFind('Hello world.', 'world');
    assert.notStrictEqual(result, null);
    assert.strictEqual(result!.index, 6);
    assert.strictEqual(result!.length, 5);
    assert.strictEqual(result!.rawText, 'world');
  });
});
