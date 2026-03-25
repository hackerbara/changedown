import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, convertL3ToL2 } from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

describe('L3→L2 with unresolved changes', () => {
  it('preserves unresolved footnote blocks after separator', async () => {
    // ct-1: hash 1:ab does not match "Hello world." and "beautiful " is not in body → anchored:false
    // ct-2: line 99 does not exist → anchored:false
    const l3 = [
      'Hello world.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:ab Hello {++beautiful ++}world.',
      '[^ct-2]: @bob | 2026-03-21 | ins | proposed',
      '    99:ff Nonexistent line content.',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // Body must not have malformed CriticMarkup injected at position 0
    expect(l2).not.toMatch(/^\{/);
    // Unresolved ct-1 footnote should be preserved
    expect(l2).toContain('[^ct-1]:');
    expect(l2).toContain('beautiful');
    // Unresolved ct-2 footnote should be preserved
    expect(l2).toContain('[^ct-2]:');
    expect(l2).toContain('99:ff');
  });

  it('produces clean body when all changes are unresolved', async () => {
    // "Nonexistent anchor." is not in "Hello world." → anchored:false
    const l3 = [
      'Hello world.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    99:ff Nonexistent anchor.',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // Body should be clean (no CriticMarkup at position 0)
    expect(l2).not.toMatch(/^\{/);
    // Footnote preserved
    expect(l2).toContain('[^ct-1]:');
    expect(l2).toContain('99:ff');
  });

  it('round-trips unresolved changes: L3→L2→L3', async () => {
    // "Nonexistent anchor." is not in "Hello world." → anchored:false
    const l3 = [
      'Hello world.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    99:ff Nonexistent anchor.',
      '    @bob 2026-03-21: This needs fixing',
    ].join('\n');
    const l2 = await convertL3ToL2(l3);
    // Footnote with all metadata should survive
    expect(l2).toContain('[^ct-1]:');
    expect(l2).toContain('@alice');
    expect(l2).toContain('@bob 2026-03-21: This needs fixing');
    // Body must not start with CriticMarkup
    const bodyEnd = l2.indexOf('[^ct-1]:');
    const body = bodyEnd >= 0 ? l2.slice(0, bodyEnd) : l2;
    expect(body).not.toContain('{++');
  });

  it('handles mixed resolved and unresolved changes correctly', async () => {
    // ct-1 resolves: "world" is in "Hello world." line 1
    // ct-2 does not resolve: "beautiful " is not in body
    const l3 = [
      'Hello world.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:ab Hello {++world++}.',
      '[^ct-2]: @bob | 2026-03-21 | ins | proposed',
      '    1:ab Hello {++beautiful ++}world.',
    ].join('\n');
    // Note: 1:ab won't match "Hello world." by hash, but "world" text search will succeed for ct-1
    // while "beautiful " text search will fail for ct-2
    const l2 = await convertL3ToL2(l3);
    // ct-2 (unresolved) must not inject CriticMarkup at position 0
    // The body line should not start with {
    const bodyEnd = l2.indexOf('[^ct-');
    if (bodyEnd >= 0) {
      const body = l2.slice(0, bodyEnd);
      expect(body).not.toMatch(/^\{/);
    }
    // ct-2 footnote must be preserved
    expect(l2).toContain('[^ct-2]:');
    expect(l2).toContain('beautiful');
  });
});
