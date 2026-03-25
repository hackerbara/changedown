import { describe, it, expect, beforeAll } from 'vitest';
import assert from 'node:assert';
import { initHashline, buildReviewDocument } from '@changetracks/core/internals';

beforeAll(async () => { await initHashline(); });

describe('buildReviewDocument', () => {
  it('includes CriticMarkup in content spans with correct types', () => {
    const content = 'Use {~~REST~>GraphQL~~}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | sub | proposed\n    reason: paradigm shift';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.view).toBe('review');
    const spans = doc.lines[0].content;
    expect(spans.some(s => s.type === 'plain' && s.text === 'Use ')).toBeTruthy();
    expect(spans.some(s => s.type === 'sub_old')).toBeTruthy();
    expect(spans.some(s => s.type === 'sub_new')).toBeTruthy();
    expect(spans.some(s => s.type === 'anchor')).toBeTruthy();
  });

  it('includes full metadata in Zone 3', () => {
    const content = 'Hello[^ct-1].\n\n[^ct-1]: @alice | 2026-01-01 | ins | proposed\n    reason: greeting';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const meta = doc.lines[0].metadata;
    expect(meta).toHaveLength(1);
    expect(meta[0].changeId).toBe('ct-1');
    expect(meta[0].author).toBe('@alice');
    expect(meta[0].reason).toBe('greeting');
    expect(meta[0].status).toBe('proposed');
  });

  it('sets P flag for lines with pending proposals', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].margin.flags).toStrictEqual(['P']);
  });

  it('strips footnote section from output lines', () => {
    const content = 'Content.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    for (const line of doc.lines) {
      const text = line.content.map(s => s.text).join('');
      expect(text.includes('[^ct-1]:')).toBe(false);
    }
  });

  it('renders footnote ref anchors with caret (matching raw file format)', () => {
    const content = 'Hello[^ct-1] world.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    const anchorSpan = spans.find(s => s.type === 'anchor');
    expect(anchorSpan).toBeTruthy();
    expect(anchorSpan!.text).toBe('[^ct-1]');
    // Ensure no bare [ct-1] (without caret) is produced
    const allText = spans.map(s => s.text).join('');
    expect(allText.match(/\[ct-1\](?!\.\d)/)).toBe(null);
  });

  it('populates header with correct counts', () => {
    const content = 'A[^ct-1]. B[^ct-2].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed\n[^ct-2]: @human | 2026-01-01 | del | accepted';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.header.counts.proposed).toBe(1);
    expect(doc.header.counts.accepted).toBe(1);
  });

  it('handles insertions with correct span types', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    expect(spans.some(s => s.type === 'delimiter' && s.text === '{++')).toBeTruthy();
    expect(spans.some(s => s.type === 'insertion' && s.text === 'world')).toBeTruthy();
    expect(spans.some(s => s.type === 'delimiter' && s.text === '++}')).toBeTruthy();
  });

  it('handles deletions with correct span types', () => {
    const content = 'Hello {--world--}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | del | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    expect(spans.some(s => s.type === 'delimiter' && s.text === '{--')).toBeTruthy();
    expect(spans.some(s => s.type === 'deletion' && s.text === 'world')).toBeTruthy();
    expect(spans.some(s => s.type === 'delimiter' && s.text === '--}')).toBeTruthy();
  });

  it('handles highlights with correct span types', () => {
    const content = 'Hello {==world==}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | highlight | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    expect(spans.some(s => s.type === 'delimiter' && s.text === '{==')).toBeTruthy();
    expect(spans.some(s => s.type === 'highlight' && s.text === 'world')).toBeTruthy();
    expect(spans.some(s => s.type === 'delimiter' && s.text === '==}')).toBeTruthy();
  });

  it('handles comments with correct span types', () => {
    const content = 'Hello {>>a note<<}.\n';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    expect(spans.some(s => s.type === 'delimiter' && s.text === '{>>')).toBeTruthy();
    expect(spans.some(s => s.type === 'comment' && s.text === 'a note')).toBeTruthy();
    expect(spans.some(s => s.type === 'delimiter' && s.text === '<<}')).toBeTruthy();
  });

  it('handles substitutions with all sub-spans', () => {
    const content = '{~~old~>new~~}[^ct-1]\n\n[^ct-1]: @ai:test | 2026-01-01 | sub | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    expect(spans.some(s => s.type === 'delimiter' && s.text === '{~~')).toBeTruthy();
    expect(spans.some(s => s.type === 'sub_old' && s.text === 'old')).toBeTruthy();
    expect(spans.some(s => s.type === 'sub_arrow' && s.text === '~>')).toBeTruthy();
    expect(spans.some(s => s.type === 'sub_new' && s.text === 'new')).toBeTruthy();
    expect(spans.some(s => s.type === 'delimiter' && s.text === '~~}')).toBeTruthy();
  });

  it('sets A flag for lines with accepted changes', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | accepted';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].margin.flags).toStrictEqual(['A']);
  });

  it('sets no flags for lines without footnote refs', () => {
    const content = 'Plain text without changes.\n';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].margin.flags).toStrictEqual([]);
  });

  it('handles content with no CriticMarkup', () => {
    const content = 'Just plain text.\nSecond line.';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0].content).toHaveLength(1);
    expect(doc.lines[0].content[0].type).toBe('plain');
    expect(doc.lines[0].content[0].text).toBe('Just plain text.');
  });

  it('skips blank line before footnote section', () => {
    const content = 'Line one.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    // Should only have the first content line (blank separator and footnote section stripped)
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].content[0].text).toBe('Line one.');
  });

  it('handles multiple footnote refs on one line', () => {
    const content = '{++A++}[^ct-1] and {--B--}[^ct-2].\n\n[^ct-1]: @alice | 2026-01-01 | ins | proposed\n[^ct-2]: @bob | 2026-01-01 | del | rejected';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const anchors = doc.lines[0].content.filter(s => s.type === 'anchor');
    expect(anchors).toHaveLength(2);
    expect(anchors[0].text).toBe('[^ct-1]');
    expect(anchors[1].text).toBe('[^ct-2]');
    // Metadata should include both
    expect(doc.lines[0].metadata).toHaveLength(2);
    // P flag takes priority when there are mixed statuses
    expect(doc.lines[0].margin.flags).toStrictEqual(['P']);
  });

  it('computes margin hash and line number', () => {
    const content = 'Hello world.\n';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    expect(doc.lines[0].margin.lineNumber).toBe(1);
    expect(typeof doc.lines[0].margin.hash).toBe('string');
    expect(doc.lines[0].margin.hash).toHaveLength(2);
  });

  it('sets rawLineNumber equal to margin lineNumber in review view', () => {
    const content = 'Line 1.\nLine 2.\nLine 3.';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    for (const line of doc.lines) {
      expect(line.rawLineNumber).toBe(line.margin.lineNumber);
    }
  });

  // ─── Committed hash tests ─────────────────────────────────────────────────

  it('stores committed hash in sessionHashes for lines with proposals', () => {
    const content = 'Hello {++an insertion++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const hashes = doc.lines[0].sessionHashes!;
    assert.ok(hashes.committed !== undefined, 'committed hash should be defined');
    assert.notStrictEqual(hashes.committed, hashes.raw,
      'committed hash should differ from raw hash (CriticMarkup stripped)');
  });

  it('committed hash is present for lines without proposals', () => {
    // Two-line doc: line 1 has CriticMarkup, line 2 is plain
    const content = 'Hello {++world++}[^ct-1].\nPlain line here.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    // Line 2 (index 1) has no CriticMarkup
    const hashes = doc.lines[1].sessionHashes!;
    assert.ok(hashes.committed !== undefined, 'committed hash should be defined for plain lines');
    // For a plain line the committed text equals the raw text, but committed hash
    // is computed in the committed-view context (different neighbor lines) so it
    // may or may not equal the raw hash. The key property is that it IS defined.
    // Actually: raw hash uses raw lines array, committed hash uses committed lines array.
    // The context differs, so they CAN differ even for identical line text.
    // What we really verify: committed hash is present and is a 2-char hex string.
    assert.strictEqual(hashes.committed!.length, 2, 'committed hash should be 2 hex chars');
  });

  it('margin hash is the committed hash, not the raw hash', () => {
    const content = 'Hello {++an insertion++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const line = doc.lines[0];
    const hashes = line.sessionHashes!;
    assert.strictEqual(line.margin.hash, hashes.committed,
      'margin.hash should use the committed hash');
  });

  it('entirely-pending-insertion line falls back to raw hash', () => {
    // A line that is ENTIRELY a pending insertion: committed view strips it entirely
    const content = '{++new text++}[^ct-1]\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const line = doc.lines[0];
    const hashes = line.sessionHashes!;
    assert.strictEqual(hashes.committed, undefined,
      'committed hash should be undefined for entirely-pending line');
    assert.strictEqual(line.margin.hash, hashes.raw,
      'margin.hash should fall back to raw hash');
  });
});
