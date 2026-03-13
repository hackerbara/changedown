import { describe, it, expect } from 'vitest';
import { extractThreadEntries, formatThreadLines, formatAnsiWithThreads } from 'changetracks/internals';
import { buildViewDocument, initHashline, type ThreeZoneDocument } from '@changetracks/core';

// ─── extractThreadEntries ───────────────────────────────────────────────────

describe('extractThreadEntries', () => {
  it('returns empty map when no footnotes exist', () => {
    const content = 'Hello world\nNo changes here.';
    const result = extractThreadEntries(content);
    expect(result.size).toBe(0);
  });

  it('returns empty map when footnotes have no thread replies', () => {
    const content = [
      'Some {++added text++}[^ct-1] here.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | ins | proposed',
      '    reason: adding context',
    ].join('\n');
    const result = extractThreadEntries(content);
    expect(result.size).toBe(0);
  });

  it('extracts a single thread reply', () => {
    const content = [
      'Some {++added text++}[^ct-1] here.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | ins | proposed',
      '    reason: adding context',
      '    @bob 2026-02-27: Looks good to me',
    ].join('\n');
    const result = extractThreadEntries(content);
    expect(result.size).toBe(1);
    const entries = result.get('ct-1')!;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      author: '@bob',
      date: '2026-02-27',
      text: 'Looks good to me',
    });
  });

  it('extracts multiple thread replies for one change', () => {
    const content = [
      'Some {~~old~>new~~}[^ct-1] here.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | sub | proposed',
      '    reason: improving clarity',
      '    @bob 2026-02-27: Why this change?',
      '    @alice 2026-02-27: The original was ambiguous',
      '    @bob 2026-02-27: OK makes sense',
    ].join('\n');
    const result = extractThreadEntries(content);
    expect(result.size).toBe(1);
    const entries = result.get('ct-1')!;
    expect(entries).toHaveLength(3);
    expect(entries[0].author).toBe('@bob');
    expect(entries[0].text).toBe('Why this change?');
    expect(entries[1].author).toBe('@alice');
    expect(entries[1].text).toBe('The original was ambiguous');
    expect(entries[2].author).toBe('@bob');
    expect(entries[2].text).toBe('OK makes sense');
  });

  it('extracts thread replies from multiple changes', () => {
    const content = [
      'First {++addition++}[^ct-1] and second {--deletion--}[^ct-2].',
      '',
      '[^ct-1]: @alice | 2026-02-27 | ins | proposed',
      '    reason: adding info',
      '    @bob 2026-02-27: Agreed',
      '[^ct-2]: @alice | 2026-02-27 | del | proposed',
      '    reason: removing redundancy',
      '    @carol 2026-02-27: Are you sure?',
      '    @alice 2026-02-27: Yes, confirmed duplicate',
    ].join('\n');
    const result = extractThreadEntries(content);
    expect(result.size).toBe(2);
    expect(result.get('ct-1')!).toHaveLength(1);
    expect(result.get('ct-2')!).toHaveLength(2);
  });

  it('handles AI agent authors in thread replies', () => {
    const content = [
      'Some {++text++}[^ct-1] here.',
      '',
      '[^ct-1]: @ai:claude-opus-4.6 | 2026-02-27 | ins | proposed',
      '    reason: improvement',
      '    @human:alice 2026-02-27: Please reconsider this',
      '    @ai:claude-opus-4.6 2026-02-27: You are right, let me revise',
    ].join('\n');
    const result = extractThreadEntries(content);
    const entries = result.get('ct-1')!;
    expect(entries).toHaveLength(2);
    expect(entries[0].author).toBe('@human:alice');
    expect(entries[1].author).toBe('@ai:claude-opus-4.6');
  });

  it('ignores metadata lines that are not thread replies', () => {
    const content = [
      'Some {++text++}[^ct-1] here.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | ins | proposed',
      '    reason: fixing typo',
      '    context: "some text with {changed}"',
      '    approved: @bob 2026-02-27',
      '    @carol 2026-02-27: One small nit',
    ].join('\n');
    const result = extractThreadEntries(content);
    const entries = result.get('ct-1')!;
    expect(entries).toHaveLength(1);
    expect(entries[0].author).toBe('@carol');
  });
});

// ─── formatThreadLines ──────────────────────────────────────────────────────

describe('formatThreadLines', () => {
  it('produces one output line per thread entry', () => {
    const entries = [
      { author: '@bob', date: '2026-02-27', text: 'Looks good' },
      { author: '@alice', date: '2026-02-27', text: 'Thanks' },
    ];
    const lines = formatThreadLines(entries, 3);
    expect(lines).toHaveLength(2);
  });

  it('includes author, date, and text in each line', () => {
    const entries = [
      { author: '@bob', date: '2026-02-27', text: 'Looks good' },
    ];
    const lines = formatThreadLines(entries, 3);
    expect(lines[0]).toContain('@bob');
    expect(lines[0]).toContain('2026-02-27');
    expect(lines[0]).toContain('Looks good');
  });

  it('uses ANSI formatting codes', () => {
    const entries = [
      { author: '@alice', date: '2026-02-27', text: 'Hello' },
    ];
    const lines = formatThreadLines(entries, 2);
    // Should contain ANSI escape codes
    expect(lines[0]).toContain('\x1b[');
  });
});

// ─── formatAnsiWithThreads ──────────────────────────────────────────────────

describe('formatAnsiWithThreads', () => {
  // Helper to build a ThreeZoneDocument from content
  async function buildDoc(content: string): Promise<ThreeZoneDocument> {
    await initHashline();
    return buildViewDocument(content, 'review', {
      filePath: 'test.md',
      trackingStatus: 'tracked',
      protocolMode: 'classic',
      defaultView: 'review',
      viewPolicy: 'suggest',
    });
  }

  it('returns base output when threads option is false', async () => {
    const content = [
      'Some {++added text++}[^ct-1] here.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | ins | proposed',
      '    reason: adding context',
      '    @bob 2026-02-27: Looks good',
    ].join('\n');
    const doc = await buildDoc(content);

    const withoutThreads = formatAnsiWithThreads(doc, content, {
      threads: false,
    });
    const withThreadsUndefined = formatAnsiWithThreads(doc, content, {});

    // Both should produce the same output (no thread expansion)
    expect(withoutThreads).toBe(withThreadsUndefined);
    // Neither should contain the thread reply text inline (it's in metadata summary only)
    // The reply count shows in the metadata, but the full text does not
  });

  it('expands thread replies when threads option is true', async () => {
    const content = [
      'Some {++added text++}[^ct-1] here.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | ins | proposed',
      '    reason: adding context',
      '    @bob 2026-02-27: Looks good to me',
    ].join('\n');
    const doc = await buildDoc(content);

    const output = formatAnsiWithThreads(doc, content, {
      threads: true,
    });

    // The expanded output should contain the thread reply text
    expect(output).toContain('Looks good to me');
    expect(output).toContain('@bob');
  });

  it('does not expand threads for lines without replies', async () => {
    const content = [
      'Some {++added text++}[^ct-1] here.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | ins | proposed',
      '    reason: no replies on this one',
    ].join('\n');
    const doc = await buildDoc(content);

    const withThreads = formatAnsiWithThreads(doc, content, {
      threads: true,
    });
    const withoutThreads = formatAnsiWithThreads(doc, content, {
      threads: false,
    });

    // With no replies to expand, output should be the same
    expect(withThreads).toBe(withoutThreads);
  });

  it('expands threads on the correct lines for multi-change files', async () => {
    const content = [
      'Line one.',
      'Has {++change one++}[^ct-1] here.',
      'No change here.',
      'Has {--change two--}[^ct-2] here.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | ins | proposed',
      '    reason: first change',
      '    @bob 2026-02-27: Reply to first',
      '[^ct-2]: @alice | 2026-02-27 | del | proposed',
      '    reason: second change',
      '    @carol 2026-02-27: Reply to second',
    ].join('\n');
    const doc = await buildDoc(content);

    const output = formatAnsiWithThreads(doc, content, {
      threads: true,
    });

    // Both thread replies should be present
    expect(output).toContain('Reply to first');
    expect(output).toContain('Reply to second');

    // Thread reply for ct-1 should appear before thread reply for ct-2
    const idx1 = output.indexOf('Reply to first');
    const idx2 = output.indexOf('Reply to second');
    expect(idx1).toBeLessThan(idx2);
  });

  it('includes multiple replies in order', async () => {
    const content = [
      'Text {~~old~>new~~}[^ct-1] end.',
      '',
      '[^ct-1]: @alice | 2026-02-27 | sub | proposed',
      '    reason: improving wording',
      '    @bob 2026-02-27: First reply',
      '    @carol 2026-02-27: Second reply',
      '    @alice 2026-02-27: Third reply',
    ].join('\n');
    const doc = await buildDoc(content);

    const output = formatAnsiWithThreads(doc, content, {
      threads: true,
    });

    const idx1 = output.indexOf('First reply');
    const idx2 = output.indexOf('Second reply');
    const idx3 = output.indexOf('Third reply');
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });
});
