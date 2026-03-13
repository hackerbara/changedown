import * as assert from 'node:assert';
import { initHashline, buildReviewDocument } from '@changetracks/core/internals';

before(async () => { await initHashline(); });

describe('buildReviewDocument', () => {
  it('includes CriticMarkup in content spans with correct types', () => {
    const content = 'Use {~~REST~>GraphQL~~}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | sub | proposed\n    reason: paradigm shift';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.view, 'review');
    const spans = doc.lines[0].content;
    assert.ok(spans.some(s => s.type === 'plain' && s.text === 'Use '));
    assert.ok(spans.some(s => s.type === 'sub_old'));
    assert.ok(spans.some(s => s.type === 'sub_new'));
    assert.ok(spans.some(s => s.type === 'anchor'));
  });

  it('includes full metadata in Zone 3', () => {
    const content = 'Hello[^ct-1].\n\n[^ct-1]: @alice | 2026-01-01 | ins | proposed\n    reason: greeting';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const meta = doc.lines[0].metadata;
    assert.strictEqual(meta.length, 1);
    assert.strictEqual(meta[0].changeId, 'ct-1');
    assert.strictEqual(meta[0].author, '@alice');
    assert.strictEqual(meta[0].reason, 'greeting');
    assert.strictEqual(meta[0].status, 'proposed');
  });

  it('sets P flag for lines with pending proposals', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.deepStrictEqual(doc.lines[0].margin.flags, ['P']);
  });

  it('strips footnote section from output lines', () => {
    const content = 'Content.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    for (const line of doc.lines) {
      const text = line.content.map(s => s.text).join('');
      assert.ok(!text.includes('[^ct-1]:'), 'footnote definitions should be stripped');
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
    assert.ok(anchorSpan, 'should have an anchor span');
    assert.strictEqual(anchorSpan!.text, '[^ct-1]');
    // Ensure no bare [ct-1] (without caret) is produced
    const allText = spans.map(s => s.text).join('');
    assert.ok(!allText.match(/\[ct-1\](?!\.\d)/), 'should not produce bare [ct-1] without caret');
  });

  it('populates header with correct counts', () => {
    const content = 'A[^ct-1]. B[^ct-2].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed\n[^ct-2]: @human | 2026-01-01 | del | accepted';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.header.counts.proposed, 1);
    assert.strictEqual(doc.header.counts.accepted, 1);
  });

  it('handles insertions with correct span types', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '{++'));
    assert.ok(spans.some(s => s.type === 'insertion' && s.text === 'world'));
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '++}'));
  });

  it('handles deletions with correct span types', () => {
    const content = 'Hello {--world--}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | del | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '{--'));
    assert.ok(spans.some(s => s.type === 'deletion' && s.text === 'world'));
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '--}'));
  });

  it('handles highlights with correct span types', () => {
    const content = 'Hello {==world==}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | highlight | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '{=='));
    assert.ok(spans.some(s => s.type === 'highlight' && s.text === 'world'));
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '==}'));
  });

  it('handles comments with correct span types', () => {
    const content = 'Hello {>>a note<<}.\n';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '{>>'));
    assert.ok(spans.some(s => s.type === 'comment' && s.text === 'a note'));
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '<<}'));
  });

  it('handles substitutions with all sub-spans', () => {
    const content = '{~~old~>new~~}[^ct-1]\n\n[^ct-1]: @ai:test | 2026-01-01 | sub | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const spans = doc.lines[0].content;
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '{~~'));
    assert.ok(spans.some(s => s.type === 'sub_old' && s.text === 'old'));
    assert.ok(spans.some(s => s.type === 'sub_arrow' && s.text === '~>'));
    assert.ok(spans.some(s => s.type === 'sub_new' && s.text === 'new'));
    assert.ok(spans.some(s => s.type === 'delimiter' && s.text === '~~}'));
  });

  it('sets A flag for lines with accepted changes', () => {
    const content = 'Hello {++world++}[^ct-1].\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | accepted';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.deepStrictEqual(doc.lines[0].margin.flags, ['A']);
  });

  it('sets no flags for lines without footnote refs', () => {
    const content = 'Plain text without changes.\n';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.deepStrictEqual(doc.lines[0].margin.flags, []);
  });

  it('handles content with no CriticMarkup', () => {
    const content = 'Just plain text.\nSecond line.';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.lines.length, 2);
    assert.strictEqual(doc.lines[0].content.length, 1);
    assert.strictEqual(doc.lines[0].content[0].type, 'plain');
    assert.strictEqual(doc.lines[0].content[0].text, 'Just plain text.');
  });

  it('skips blank line before footnote section', () => {
    const content = 'Line one.\n\n[^ct-1]: @ai:test | 2026-01-01 | ins | proposed';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    // Should only have the first content line (blank separator and footnote section stripped)
    assert.strictEqual(doc.lines.length, 1);
    assert.strictEqual(doc.lines[0].content[0].text, 'Line one.');
  });

  it('handles multiple footnote refs on one line', () => {
    const content = '{++A++}[^ct-1] and {--B--}[^ct-2].\n\n[^ct-1]: @alice | 2026-01-01 | ins | proposed\n[^ct-2]: @bob | 2026-01-01 | del | rejected';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    const anchors = doc.lines[0].content.filter(s => s.type === 'anchor');
    assert.strictEqual(anchors.length, 2);
    assert.strictEqual(anchors[0].text, '[^ct-1]');
    assert.strictEqual(anchors[1].text, '[^ct-2]');
    // Metadata should include both
    assert.strictEqual(doc.lines[0].metadata.length, 2);
    // P flag takes priority when there are mixed statuses
    assert.deepStrictEqual(doc.lines[0].margin.flags, ['P']);
  });

  it('computes margin hash and line number', () => {
    const content = 'Hello world.\n';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    assert.strictEqual(doc.lines[0].margin.lineNumber, 1);
    assert.strictEqual(typeof doc.lines[0].margin.hash, 'string');
    assert.strictEqual(doc.lines[0].margin.hash.length, 2);
  });

  it('sets rawLineNumber equal to margin lineNumber in review view', () => {
    const content = 'Line 1.\nLine 2.\nLine 3.';
    const doc = buildReviewDocument(content, {
      filePath: 'test.md', trackingStatus: 'tracked',
      protocolMode: 'classic', defaultView: 'review', viewPolicy: 'suggest',
    });
    for (const line of doc.lines) {
      assert.strictEqual(line.rawLineNumber, line.margin.lineNumber);
    }
  });
});
