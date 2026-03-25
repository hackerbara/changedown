import { describe, it, expect, beforeAll } from 'vitest';
import { parseForFormat, ChangeType, initHashline, stripFootnoteBlocks, neutralizeEditOpLine } from '@changetracks/core/internals';

describe('parseForFormat', () => {
  beforeAll(async () => { await initHashline(); });

  it('parses L2 text with CriticMarkupParser', () => {
    const l2 = 'Hello {++beautiful ++}world\n\n[^ct-1]: @a | 2026-01-01 | ins | proposed';
    const doc = parseForFormat(l2);
    const changes = doc.getChanges();
    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe(ChangeType.Insertion);
    // L2: range !== contentRange (delimiters present in body)
    expect(changes[0].range.start).not.toBe(changes[0].contentRange.start);
  });

  it('parses L3 text with FootnoteNativeParser', () => {
    const l3 = [
      '<!-- ctrcks.com/v1: tracked -->',
      'Hello world',
      '',
      '[^ct-1]: @a | 2026-01-01 | ins | proposed',
      '    4:b4 {++beautiful ++}',
    ].join('\n');
    const doc = parseForFormat(l3);
    const changes = doc.getChanges();
    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe(ChangeType.Insertion);
    // L3: range === contentRange (no delimiters in body)
    expect(changes[0].range.start).toBe(changes[0].contentRange.start);
  });

  it('returns empty changes for plain text (no CriticMarkup)', () => {
    const plain = 'Just some plain text.';
    const doc = parseForFormat(plain);
    expect(doc.getChanges().length).toBe(0);
  });
});

describe('stripFootnoteBlocks', () => {
  it('removes a single footnote block by ID', () => {
    const text = [
      'Hello world',
      '',
      '[^ct-1]: @a | 2026-01-01 | ins | accepted',
      '    1:b4 world',
      '[^ct-2]: @a | 2026-01-01 | del | proposed',
      '    1:c5 ',
    ].join('\n');
    const result = stripFootnoteBlocks(text, ['ct-1']);
    expect(result).toContain('[^ct-2]');
    expect(result).not.toContain('[^ct-1]');
    expect(result).toContain('Hello world');
  });

  it('removes multiple footnote blocks', () => {
    const text = [
      'Body text',
      '',
      '[^ct-1]: @a | 2026-01-01 | ins | accepted',
      '    1:b4 text',
      '[^ct-2]: @a | 2026-01-01 | del | rejected',
      '    1:c5 ',
    ].join('\n');
    const result = stripFootnoteBlocks(text, ['ct-1', 'ct-2']);
    expect(result.trim()).toBe('Body text');
  });

  it('returns text unchanged when IDs not found', () => {
    const text = 'Hello world\n\n[^ct-1]: @a | 2026-01-01 | ins | proposed\n    1:b4 world';
    const result = stripFootnoteBlocks(text, ['ct-99']);
    expect(result).toBe(text);
  });
});

describe('neutralizeEditOpLine', () => {
  it('replaces edit-op line with settled log line containing extracted content', () => {
    const text = [
      'Hello world',
      '',
      '[^ct-1]: @a | 2026-01-01 | ins | accepted',
      '    1:b4 {++world++}',
    ].join('\n');
    const result = neutralizeEditOpLine(text, 'ct-1');
    expect(result).not.toContain('{++world++}');
    expect(result).toContain('settled: "world"');
    expect(result).toContain('[^ct-1]:'); // header preserved
  });

  it('replaces edit-op line with settled log line for deletion', () => {
    const text = [
      'Hello',
      '',
      '[^ct-1]: @a | 2026-01-01 | del | rejected',
      '    1:b4 {--removed--}',
    ].join('\n');
    const result = neutralizeEditOpLine(text, 'ct-1');
    expect(result).not.toContain('{--removed--}');
    expect(result).toContain('settled:');
  });

  it('returns text unchanged when ID not found', () => {
    const text = 'Hello\n\n[^ct-1]: @a | 2026-01-01 | ins | proposed\n    1:b4 {++world++}';
    const result = neutralizeEditOpLine(text, 'ct-99');
    expect(result).toBe(text);
  });
});
