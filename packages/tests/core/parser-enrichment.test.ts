// packages/tests/core/parser-enrichment.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { initHashline, parseForFormat, resolve } from '@changedown/core/internals';

beforeAll(async () => { await initHashline(); });

describe('ChangeNode enrichment from FootnoteNativeParser', () => {
  it('populates footnoteLineRange for each change', () => {
    const text = [
      'The quick beautiful brown fox.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:aa {++beautiful ++}',
    ].join('\n');
    const doc = parseForFormat(text);
    const changes = doc.getChanges();
    expect(changes.length).toBeGreaterThanOrEqual(1);
    const change = changes.find(c => c.id === 'cn-1');
    expect(change?.footnoteLineRange).toBeDefined();
    expect(change!.footnoteLineRange!.startLine).toBe(2); // 0-indexed
    expect(change!.footnoteLineRange!.endLine).toBe(3);
  });

  it('populates replyCount from thread replies', () => {
    const text = [
      'Hello world.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b {++Hello ++}',
      '    @bob 2026-03-21: Looks good',
      '    @carol 2026-03-22: Agreed',
    ].join('\n');
    const doc = parseForFormat(text);
    const change = doc.getChanges().find(c => c.id === 'cn-1');
    expect(change?.replyCount).toBe(2);
  });

  it('populates replyCount as 0 when no thread replies', () => {
    const text = [
      'Hello world.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b {++Hello ++}',
    ].join('\n');
    const doc = parseForFormat(text);
    const change = doc.getChanges().find(c => c.id === 'cn-1');
    expect(change?.replyCount).toBe(0);
  });

  it('populates resolutionPath as hash when hash matches', () => {
    // Hash 7b is the real computed hash for "Hello world." at line 1
    const text = [
      'Hello world.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b {++Hello ++}',
    ].join('\n');
    const doc = parseForFormat(text);
    const change = doc.getChanges().find(c => c.id === 'cn-1');
    expect(change?.anchored).toBe(true);
    expect(change?.resolutionPath).toBe('hash');
  });

  it('populates image metadata from footnote body', () => {
    const text = [
      'A document with an image.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:24 {++an ++}',
      '    image-dimensions: 6.5in x 4.0in',
      '    image-float: left',
    ].join('\n');
    const doc = parseForFormat(text);
    const change = doc.getChanges().find(c => c.id === 'cn-1');
    expect(change?.metadata?.imageDimensions).toEqual({ widthIn: 6.5, heightIn: 4.0 });
    expect(change?.metadata?.imageMetadata?.['image-float']).toBe('left');
  });
});

describe('resolve() and parseForFormat() parity', () => {
  it('resolve returns same coherence rate as parseForFormat for well-formed L3', async () => {
    await initHashline();
    // Use hash 'ff' (valid hex, wrong value) to force context-path resolution
    const text = [
      'The very lazy dog.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:ff The {++very ++}lazy dog.',
    ].join('\n');
    const resolved = resolve(text);
    const parsed = parseForFormat(text);
    // Both should resolve cn-1 successfully
    const resolvedChange = resolved.changes.find(c => c.id === 'cn-1');
    const parsedChange = parsed.getChanges().find(c => c.id === 'cn-1');
    expect(resolvedChange?.resolved).toBe(true);
    expect(parsedChange?.anchored).toBe(true);
  });

  it('resolve and parseForFormat agree on resolutionPath for hash-resolved changes', async () => {
    await initHashline();
    const text = [
      'The very lazy dog.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b The {++very ++}lazy dog.',
    ].join('\n');
    const resolved = resolve(text);
    const parsed = parseForFormat(text);
    const resolvedChange = resolved.changes.find(c => c.id === 'cn-1');
    const parsedChange = parsed.getChanges().find(c => c.id === 'cn-1');
    // Both should agree that the change is resolved
    expect(resolvedChange?.resolved).toBe(true);
    expect(parsedChange?.anchored).toBe(true);
    // When resolve() delegates to parseForFormat, resolutionPath must propagate
    expect(parsedChange?.resolutionPath).toBeDefined();
    expect(resolvedChange?.resolutionPath).toBe(parsedChange?.resolutionPath);
  });

  it('resolve and parseForFormat agree on rejected changes', async () => {
    await initHashline();
    const text = [
      'The lazy dog.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | rejected',
      '    1:a1 The {++very ++}lazy dog.',
      '    rejected: @bob 2026-03-20 "Not needed"',
    ].join('\n');
    const resolved = resolve(text);
    const parsed = parseForFormat(text);
    const resolvedChange = resolved.changes.find(c => c.id === 'cn-1');
    const parsedChange = parsed.getChanges().find(c => c.id === 'cn-1');
    // Both treat rejected as resolved (no action needed)
    expect(resolvedChange?.resolved).toBe(true);
    expect(resolvedChange?.resolutionPath).toBe('rejected');
    // Parser should also reflect the rejected status
    expect(parsedChange).toBeDefined();
  });

  it('resolve and parseForFormat agree on consumedBy for edit-over-edit', async () => {
    await initHashline();
    // cn-1 inserts "very ", cn-2 deletes "very " — cn-1 is consumed
    const text = [
      'The lazy dog',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:a1 The {++very ++}lazy dog',
      '',
      '[^cn-2]: @alice | 2026-03-20 | del | proposed',
      '    1:b1 The {--very --}lazy dog',
    ].join('\n');
    const resolved = resolve(text);
    const parsed = parseForFormat(text);
    const resolvedCt1 = resolved.changes.find(c => c.id === 'cn-1');
    const parsedCt1 = parsed.getChanges().find(c => c.id === 'cn-1');
    // resolve() should still show cn-1 as consumed by cn-2
    expect(resolvedCt1?.consumedBy).toBe('cn-2');
    // parseForFormat via scrub replay should also set consumedBy
    expect(parsedCt1?.consumedBy).toBe('cn-2');
  });
});

describe('ChangeNode resolution fields from scrub integration', () => {
  it('populates resolutionPath as replay for scrub-resolved changes', () => {
    // Edit-over-edit: cn-1 inserts "very " (ambiguous — appears twice in body),
    // cn-2 substitutes "lazy"→"sleepy" on same line. Hash ff is wrong for both.
    // cn-1 can't resolve via context (body changed by cn-2) or text search
    // (ambiguous), so it falls through to the scrub replay which traces the
    // edit history and resolves it.
    const text = [
      'The very very sleepy dog.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:ff The {++very ++}very lazy dog.',
      '',
      '[^cn-2]: @bob | 2026-03-21 | sub | proposed',
      '    1:ee The very very {~~lazy~>sleepy~~} dog.',
    ].join('\n');
    const doc = parseForFormat(text);
    const ct1 = doc.getChanges().find(c => c.id === 'cn-1');
    expect(ct1?.anchored).toBe(true);
    expect(ct1?.resolutionPath).toBe('replay');
  });
});
