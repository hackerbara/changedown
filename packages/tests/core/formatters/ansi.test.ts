import assert from 'node:assert';
import { formatAnsi, ThreeZoneDocument } from '@changetracks/core/internals';

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatAnsi', () => {
  const baseHeader = {
    filePath: 'test.md',
    trackingStatus: 'tracked' as const,
    protocolMode: 'classic',
    defaultView: 'review' as const,
    viewPolicy: 'suggest',
    counts: { proposed: 1, accepted: 0, rejected: 0 },
    authors: ['@alice'],
    threadCount: 0,
  };

  it('does NOT show hashlines to humans', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: ['P'] },
        content: [{ type: 'plain', text: 'Hello.' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    const plain = stripAnsi(output);
    assert.ok(!plain.includes(':a3'), 'hash should not appear in ANSI output');
    assert.ok(plain.includes('1'), 'line number should appear');
  });

  it('shows colored gutter for P flag', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: ['P'] },
        content: [{ type: 'plain', text: 'Hello.' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    assert.ok(output.includes('\x1b[31m'), 'P flag should use red');
  });

  it('colors insertion spans green', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [
          { type: 'plain', text: 'Hello ' },
          { type: 'insertion', text: 'world' },
          { type: 'plain', text: '.' },
        ],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    assert.ok(output.includes('\x1b[32m'), 'insertion should use green');
    assert.ok(stripAnsi(output).includes('Hello world.'));
  });

  it('colors deletion spans red with strikethrough', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [{ type: 'deletion', text: 'removed' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    assert.ok(output.includes('\x1b[31m'), 'deletion should use red');
    assert.ok(output.includes('\x1b[9m'), 'deletion should use strikethrough');
  });

  it('hides delimiters by default (visual cues mode)', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [
          { type: 'delimiter', text: '{~~' },
          { type: 'sub_old', text: 'REST' },
          { type: 'sub_arrow', text: '~>' },
          { type: 'sub_new', text: 'GraphQL' },
          { type: 'delimiter', text: '~~}' },
        ],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc, { showMarkup: false });
    const plain = stripAnsi(output);
    assert.ok(!plain.includes('{~~'), 'delimiters should be hidden');
    assert.ok(!plain.includes('~~}'), 'delimiters should be hidden');
    assert.ok(plain.includes('REST'), 'old text should be visible');
    assert.ok(plain.includes('GraphQL'), 'new text should be visible');
  });

  it('shows delimiters when showMarkup=true', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [
          { type: 'delimiter', text: '{~~' },
          { type: 'sub_old', text: 'REST' },
          { type: 'sub_arrow', text: '~>' },
          { type: 'sub_new', text: 'GraphQL' },
          { type: 'delimiter', text: '~~}' },
        ],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc, { showMarkup: true });
    const plain = stripAnsi(output);
    assert.ok(plain.includes('{~~'), 'delimiters should be visible');
    assert.ok(plain.includes('~~}'), 'delimiters should be visible');
  });

  it('dims metadata in Zone 3', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [{ type: 'plain', text: 'Content.' }],
        metadata: [{ changeId: 'ct-1', author: '@alice', reason: 'fix', replyCount: 2 }],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    assert.ok(output.includes('\x1b[2m'), 'metadata should use dim');
    assert.ok(stripAnsi(output).includes('@alice'));
    assert.ok(stripAnsi(output).includes('2 replies'));
  });

  it('shows green gutter for A flag', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: ['A'] },
        content: [{ type: 'plain', text: 'Accepted line.' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    assert.ok(output.includes('\x1b[32m'), 'A flag should use green');
  });

  it('shows dim gutter for clean lines (no flags)', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [{ type: 'plain', text: 'Clean line.' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    // Dim gutter character should be present
    assert.ok(output.includes('\x1b[2m'), 'clean gutter should use dim');
  });

  it('renders sub_old with red strikethrough and sub_new with green', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [
          { type: 'sub_old', text: 'REST' },
          { type: 'sub_arrow', text: '~>' },
          { type: 'sub_new', text: 'GraphQL' },
        ],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    // sub_old uses red+strikethrough
    assert.ok(output.includes('\x1b[31m'), 'sub_old should use red');
    assert.ok(output.includes('\x1b[9m'), 'sub_old should use strikethrough');
    // sub_new uses green
    assert.ok(output.includes('\x1b[32m'), 'sub_new should use green');
  });

  it('renders highlight with yellow background', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [{ type: 'highlight', text: 'important' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    assert.ok(output.includes('\x1b[43m'), 'highlight should use yellow background');
  });

  it('renders comment as dim italic', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [{ type: 'comment', text: 'a note' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    assert.ok(output.includes('\x1b[2m'), 'comment should use dim');
    assert.ok(output.includes('\x1b[3m'), 'comment should use italic');
  });

  it('hides anchor spans (agent-facing only)', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [
          { type: 'plain', text: 'Hello' },
          { type: 'anchor', text: '[^ct-1]' },
          { type: 'plain', text: ' world.' },
        ],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    const plain = stripAnsi(output);
    assert.ok(!plain.includes('[^ct-1]'), 'anchor should be hidden');
    assert.ok(plain.includes('Hello world.'), 'surrounding text should be intact');
  });

  it('renders header with file path and counts', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: {
        ...baseHeader,
        counts: { proposed: 2, accepted: 1, rejected: 0 },
      },
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [{ type: 'plain', text: 'Text.' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    const plain = stripAnsi(output);
    assert.ok(plain.includes('test.md'), 'header should show file path');
    assert.ok(plain.includes('2 proposed'), 'header should show proposed count');
    assert.ok(plain.includes('1 accepted'), 'header should show accepted count');
  });

  it('renders metadata with singular reply count', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [{ type: 'plain', text: 'Content.' }],
        metadata: [{ changeId: 'ct-1', author: '@bob', reason: 'typo', replyCount: 1 }],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    const plain = stripAnsi(output);
    assert.ok(plain.includes('1 reply'), 'singular reply count');
    assert.ok(!plain.includes('1 replies'), 'should not say "1 replies"');
  });

  it('renders sub_arrow as dim arrow symbol', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [
          { type: 'sub_old', text: 'old' },
          { type: 'sub_arrow', text: '~>' },
          { type: 'sub_new', text: 'new' },
        ],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatAnsi(doc);
    const plain = stripAnsi(output);
    // sub_arrow renders as a visual arrow, not the raw ~>
    assert.ok(plain.includes('\u2192') || plain.includes('→'), 'sub_arrow should render as arrow');
  });

  it('pads line numbers to consistent width', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [
        {
          margin: { lineNumber: 1, hash: 'a3', flags: [] },
          content: [{ type: 'plain', text: 'Line one.' }],
          metadata: [],
          rawLineNumber: 1,
        },
        {
          margin: { lineNumber: 10, hash: 'b4', flags: [] },
          content: [{ type: 'plain', text: 'Line ten.' }],
          metadata: [],
          rawLineNumber: 10,
        },
      ],
    };
    const output = formatAnsi(doc);
    const plain = stripAnsi(output);
    // Line 1 should be padded to match width of "10"
    const lines = plain.split('\n');
    const line1 = lines.find(l => l.includes('Line one.'));
    const line10 = lines.find(l => l.includes('Line ten.'));
    assert.ok(line1, 'line 1 should exist');
    assert.ok(line10, 'line 10 should exist');
    // Both gutter-to-content distances should be equal
    const gutterEnd1 = line1!.indexOf('│') !== -1 ? line1!.indexOf('│') : line1!.indexOf('┃');
    const gutterEnd10 = line10!.indexOf('│') !== -1 ? line10!.indexOf('│') : line10!.indexOf('┃');
    assert.strictEqual(gutterEnd1, gutterEnd10, 'gutter alignment should be consistent');
  });
});
