import * as assert from 'node:assert';
import {
  computeCommittedLine,
  computeCommittedView,
  formatCommittedOutput,
  initHashline,
  computeLineHash,
  type FootnoteStatus,
} from '@changetracks/core/internals';

describe('computeCommittedLine', () => {
  // Helper to build footnote maps quickly
  function fn(entries: [string, 'proposed' | 'accepted' | 'rejected', string][]): Map<string, FootnoteStatus> {
    const map = new Map<string, FootnoteStatus>();
    for (const [id, status, type] of entries) {
      map.set(id, { status, type });
    }
    return map;
  }

  const empty = new Map<string, FootnoteStatus>();

  it('passes plain text unchanged', () => {
    const result = computeCommittedLine('Hello world', empty);
    assert.deepStrictEqual(result, { text: 'Hello world', flag: '', changeIds: [] });
  });

  it('removes pending insertion, sets flag P', () => {
    const footnotes = fn([['ct-1', 'proposed', 'ins']]);
    const result = computeCommittedLine('Before {++added text++}[^ct-1] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before  after', flag: 'P', changeIds: ['ct-1'] });
  });

  it('keeps accepted insertion text, removes delimiters, sets flag A', () => {
    const footnotes = fn([['ct-1', 'accepted', 'ins']]);
    const result = computeCommittedLine('Before {++added text++}[^ct-1] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before added text after', flag: 'A', changeIds: ['ct-1'] });
  });

  it('keeps text for pending deletion (revert), sets flag P', () => {
    const footnotes = fn([['ct-2', 'proposed', 'del']]);
    const result = computeCommittedLine('Before {--removed--}[^ct-2] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before removed after', flag: 'P', changeIds: ['ct-2'] });
  });

  it('removes text for accepted deletion, sets flag A', () => {
    const footnotes = fn([['ct-2', 'accepted', 'del']]);
    const result = computeCommittedLine('Before {--removed--}[^ct-2] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before  after', flag: 'A', changeIds: ['ct-2'] });
  });

  it('shows old text for pending substitution, sets flag P', () => {
    const footnotes = fn([['ct-3', 'proposed', 'sub']]);
    const result = computeCommittedLine('Before {~~old~>new~~}[^ct-3] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before old after', flag: 'P', changeIds: ['ct-3'] });
  });

  it('shows new text for accepted substitution, sets flag A', () => {
    const footnotes = fn([['ct-3', 'accepted', 'sub']]);
    const result = computeCommittedLine('Before {~~old~>new~~}[^ct-3] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before new after', flag: 'A', changeIds: ['ct-3'] });
  });

  it('shows content for highlight, no flag set', () => {
    const footnotes = fn([['ct-4', 'proposed', 'highlight']]);
    const result = computeCommittedLine('Before {==highlighted==}[^ct-4] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before highlighted after', flag: '', changeIds: [] });
  });

  it('removes comments', () => {
    const result = computeCommittedLine('Text {>>this is a comment<<} more', empty);
    assert.deepStrictEqual(result, { text: 'Text  more', flag: '', changeIds: [] });
  });

  it('gives P priority when line has both proposed and accepted changes', () => {
    const footnotes = fn([
      ['ct-1', 'accepted', 'ins'],
      ['ct-2', 'proposed', 'del'],
    ]);
    const result = computeCommittedLine(
      '{++added++}[^ct-1] middle {--deleted--}[^ct-2]',
      footnotes,
    );
    // accepted insertion: keep "added"; proposed deletion: keep "deleted" (revert)
    assert.strictEqual(result.text, 'added middle deleted');
    assert.strictEqual(result.flag, 'P');
    assert.ok(result.changeIds.includes('ct-1'));
    assert.ok(result.changeIds.includes('ct-2'));
  });

  it('removes rejected insertion, no flag', () => {
    const footnotes = fn([['ct-5', 'rejected', 'ins']]);
    const result = computeCommittedLine('Before {++nope++}[^ct-5] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before  after', flag: '', changeIds: ['ct-5'] });
  });

  it('treats unknown change ID as proposed (flag P)', () => {
    // ct-99 is NOT in the footnotes map
    const result = computeCommittedLine('Before {++mystery++}[^ct-99] after', empty);
    assert.deepStrictEqual(result, { text: 'Before  after', flag: 'P', changeIds: ['ct-99'] });
  });

  it('treats bare CriticMarkup without footnote ref as proposed (flag P)', () => {
    const result = computeCommittedLine('Before {++bare insertion++} after', empty);
    assert.deepStrictEqual(result, { text: 'Before  after', flag: 'P', changeIds: [] });
  });

  it('shows old text for rejected substitution (revert)', () => {
    const footnotes = fn([['ct-6', 'rejected', 'sub']]);
    const result = computeCommittedLine('{~~old~>new~~}[^ct-6]', footnotes);
    assert.deepStrictEqual(result, { text: 'old', flag: '', changeIds: ['ct-6'] });
  });

  it('keeps text for rejected deletion', () => {
    const footnotes = fn([['ct-7', 'rejected', 'del']]);
    const result = computeCommittedLine('{--kept--}[^ct-7]', footnotes);
    assert.deepStrictEqual(result, { text: 'kept', flag: '', changeIds: ['ct-7'] });
  });

  it('removes standalone footnote refs', () => {
    const result = computeCommittedLine('text [^ct-1] more', empty);
    assert.strictEqual(result.text, 'text  more');
  });

  it('handles dotted IDs (ct-N.M)', () => {
    const footnotes = fn([['ct-5.1', 'accepted', 'del']]);
    const result = computeCommittedLine('Before {--cut--}[^ct-5.1] after', footnotes);
    assert.deepStrictEqual(result, { text: 'Before  after', flag: 'A', changeIds: ['ct-5.1'] });
  });

  it('handles highlight with attached comment', () => {
    const footnotes = fn([['ct-8', 'proposed', 'highlight']]);
    const result = computeCommittedLine('{==important==}{>>note<<}[^ct-8]', footnotes);
    assert.strictEqual(result.text, 'important');
    assert.strictEqual(result.flag, '');
  });

  it('handles bare substitution without footnote ref as proposed', () => {
    const result = computeCommittedLine('Before {~~old~>new~~} after', empty);
    assert.deepStrictEqual(result, { text: 'Before old after', flag: 'P', changeIds: [] });
  });

  it('handles bare deletion without footnote ref as proposed (keeps text)', () => {
    const result = computeCommittedLine('Before {--removed--} after', empty);
    assert.deepStrictEqual(result, { text: 'Before removed after', flag: 'P', changeIds: [] });
  });
});

describe('computeCommittedView', () => {
  before(async () => {
    await initHashline();
  });

  it('produces sequential line numbers with no gaps when pending insertion is removed', () => {
    const rawText = [
      '# Title',
      '{++This line is pending++}[^ct-1]',
      'Clean line.',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const result = computeCommittedView(rawText);

    // The pending insertion line should be skipped (entire line is pending markup, committed text is empty)
    // Footnote lines should be excluded
    // Remaining: line 1 ("# Title"), line 3 ("Clean line."), line 4 ("")
    const lineNums = result.lines.map(l => l.committedLineNum);
    assert.deepStrictEqual(lineNums, [1, 2, 3]);

    // No gaps
    for (let i = 1; i < lineNums.length; i++) {
      assert.strictEqual(lineNums[i], lineNums[i - 1] + 1);
    }
  });

  it('builds correct committed-to-raw line mapping', () => {
    const rawText = [
      '# Title',                                      // raw 1 → committed 1
      '{++pending insertion++}[^ct-1]',                // raw 2 → skipped
      'Clean line.',                                   // raw 3 → committed 2
      '',                                              // raw 4 → committed 3
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed', // footnote → excluded
    ].join('\n');

    const result = computeCommittedView(rawText);

    // committed 1 = raw 1, committed 2 = raw 3, committed 3 = raw 4
    assert.strictEqual(result.committedToRaw.get(1), 1);
    assert.strictEqual(result.committedToRaw.get(2), 3);
    assert.strictEqual(result.committedToRaw.get(3), 4);

    // reverse mapping
    assert.strictEqual(result.rawToCommitted.get(1), 1);
    assert.strictEqual(result.rawToCommitted.get(3), 2);
    assert.strictEqual(result.rawToCommitted.get(4), 3);
  });

  it('committed hashes are 2 lowercase hex chars', () => {
    const rawText = '# Title\nSome content\nAnother line';

    const result = computeCommittedView(rawText);

    for (const line of result.lines) {
      assert.match(line.hash, /^[0-9a-f]{2}$/);
    }
  });

  it('computes correct summary counts', () => {
    const rawText = [
      '# Title',
      '{++new text++}[^ct-1]',
      '{--old text--}[^ct-2]',
      'Clean line.',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
      '[^ct-2]: @alice | 2026-02-17 | del | accepted',
    ].join('\n');

    const result = computeCommittedView(rawText);

    assert.strictEqual(result.summary.proposed, 1);
    assert.strictEqual(result.summary.accepted, 1);
    assert.strictEqual(result.summary.rejected, 0);
  });

  it('excludes footnote definition lines from committed output', () => {
    const rawText = [
      '# Title',
      'Some text {++added++}[^ct-1]',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
      '    reason: clarity improvement',
    ].join('\n');

    const result = computeCommittedView(rawText);

    // No line should contain footnote definition content
    for (const line of result.lines) {
      assert.ok(!line.text.match(/^\[\^ct-/), `Unexpected footnote ref in committed text: ${line.text}`);
      assert.ok(!line.text.includes('reason: clarity improvement'), `Unexpected metadata in committed text: ${line.text}`);
    }
  });

  it('returns identical view for clean file (no CriticMarkup)', () => {
    const rawText = '# Title\nFirst line.\nSecond line.\n';
    const rawLines = rawText.split('\n');

    const result = computeCommittedView(rawText);

    // Same number of lines (including the trailing empty line from split)
    assert.strictEqual(result.lines.length, rawLines.length);

    // Same text content
    for (let i = 0; i < result.lines.length; i++) {
      assert.strictEqual(result.lines[i].text, rawLines[i]);
      assert.strictEqual(result.lines[i].flag, '');
      assert.deepStrictEqual(result.lines[i].changeIds, []);
    }

    // Summary: all clean
    assert.strictEqual(result.summary.proposed, 0);
    assert.strictEqual(result.summary.accepted, 0);
    assert.strictEqual(result.summary.rejected, 0);
    assert.strictEqual(result.summary.clean, rawLines.length);
  });

  it('hashes match computeLineHash for committed text', () => {
    const rawText = '# Title\nSome content here\nThird line';

    const result = computeCommittedView(rawText);

    // Mirror the two-pass approach: collect all committed texts, then hash with allLines
    const allCommittedTexts = result.lines.map(l => l.text);
    for (const line of result.lines) {
      const expectedHash = computeLineHash(line.committedLineNum - 1, line.text, allCommittedTexts);
      assert.strictEqual(line.hash, expectedHash);
    }
  });

  it('sets flag P for lines with proposed changes', () => {
    const rawText = [
      'Before {++added++}[^ct-1] after',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const result = computeCommittedView(rawText);

    const firstLine = result.lines[0];
    assert.strictEqual(firstLine.flag, 'P');
    assert.ok(firstLine.changeIds.includes('ct-1'));
  });

  it('sets flag A for lines with accepted changes', () => {
    const rawText = [
      'Before {++added++}[^ct-1] after',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | accepted',
    ].join('\n');

    const result = computeCommittedView(rawText);

    const firstLine = result.lines[0];
    assert.strictEqual(firstLine.flag, 'A');
    assert.strictEqual(firstLine.text, 'Before added after');
  });

  it('counts clean lines in summary', () => {
    const rawText = [
      '# Title',
      'Clean line one.',
      'Clean line two.',
    ].join('\n');

    const result = computeCommittedView(rawText);

    assert.strictEqual(result.summary.clean, 3);
    assert.strictEqual(result.summary.proposed, 0);
  });
});

describe('formatCommittedOutput', () => {
  before(async () => {
    await initHashline();
  });

  it('produces correctly formatted output with header and aligned lines', () => {
    const rawText = [
      '# Title',
      'Clean line.',
    ].join('\n');

    const view = computeCommittedView(rawText);
    const output = formatCommittedOutput(view, { filePath: 'test.md', trackingStatus: 'tracked' });

    // Header lines
    const lines = output.split('\n');
    assert.match(lines[0], /^## file: test\.md$/);
    assert.match(lines[1], /^## view: committed/);

    // Content lines should have line number, hash, flag, pipe, content
    const contentLines = lines.filter(l => l.match(/^\s*\d+:[0-9a-f]{2}/));
    assert.strictEqual(contentLines.length, 2);

    // Check format: " N:HH |content"
    for (const cl of contentLines) {
      assert.match(cl, /^\s*\d+:[0-9a-f]{2}\s?\|/);
    }
  });

  it('includes change summary in header', () => {
    const rawText = [
      'Before {++added++}[^ct-1] after',
      'Clean line.',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const view = computeCommittedView(rawText);
    const output = formatCommittedOutput(view, { filePath: 'test.md', trackingStatus: 'tracked' });

    // Header should mention change counts
    assert.ok(output.includes('1P'), 'Output should include change summary with 1P');
  });

  it('shows P flag on lines with proposed changes', () => {
    const rawText = [
      'Before {~~old~>new~~}[^ct-1] after',
      '',
      '[^ct-1]: @alice | 2026-02-17 | sub | proposed',
    ].join('\n');

    const view = computeCommittedView(rawText);
    const output = formatCommittedOutput(view, { filePath: 'test.md', trackingStatus: 'tracked' });

    const lines = output.split('\n');
    const firstContentLine = lines.find(l => l.includes('Before old after'));
    assert.ok(firstContentLine, 'Should find line with committed text');
    assert.ok(firstContentLine!.includes('P'), 'Line should include P flag');
  });

  it('shows A flag on lines with accepted changes', () => {
    const rawText = [
      'Before {++added++}[^ct-1] after',
      '',
      '[^ct-1]: @alice | 2026-02-17 | ins | accepted',
    ].join('\n');

    const view = computeCommittedView(rawText);
    const output = formatCommittedOutput(view, { filePath: 'test.md', trackingStatus: 'tracked' });

    const lines = output.split('\n');
    const firstContentLine = lines.find(l => l.includes('Before added after'));
    assert.ok(firstContentLine, 'Should find line with committed text');
    assert.ok(firstContentLine!.includes('A'), 'Line should include A flag');
  });
});
