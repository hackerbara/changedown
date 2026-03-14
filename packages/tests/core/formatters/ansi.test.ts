import { describe, it, expect } from 'vitest';
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
    expect(!plain.includes(':a3')).toBeTruthy();
    expect(plain.includes('1')).toBeTruthy();
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
    expect(output.includes('\x1b[31m')).toBeTruthy();
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
    expect(output.includes('\x1b[32m')).toBeTruthy();
    expect(stripAnsi(output).includes('Hello world.')).toBeTruthy();
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
    expect(output.includes('\x1b[31m')).toBeTruthy();
    expect(output.includes('\x1b[9m')).toBeTruthy();
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
    expect(!plain.includes('{~~')).toBeTruthy();
    expect(!plain.includes('~~}')).toBeTruthy();
    expect(plain.includes('REST')).toBeTruthy();
    expect(plain.includes('GraphQL')).toBeTruthy();
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
    expect(plain.includes('{~~')).toBeTruthy();
    expect(plain.includes('~~}')).toBeTruthy();
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
    expect(output.includes('\x1b[2m')).toBeTruthy();
    expect(stripAnsi(output).includes('@alice')).toBeTruthy();
    expect(stripAnsi(output).includes('2 replies')).toBeTruthy();
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
    expect(output.includes('\x1b[32m')).toBeTruthy();
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
    expect(output.includes('\x1b[2m')).toBeTruthy();
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
    expect(output.includes('\x1b[31m')).toBeTruthy();
    expect(output.includes('\x1b[9m')).toBeTruthy();
    // sub_new uses green
    expect(output.includes('\x1b[32m')).toBeTruthy();
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
    expect(output.includes('\x1b[43m')).toBeTruthy();
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
    expect(output.includes('\x1b[2m')).toBeTruthy();
    expect(output.includes('\x1b[3m')).toBeTruthy();
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
    expect(!plain.includes('[^ct-1]')).toBeTruthy();
    expect(plain.includes('Hello world.')).toBeTruthy();
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
    expect(plain.includes('test.md')).toBeTruthy();
    expect(plain.includes('2 proposed')).toBeTruthy();
    expect(plain.includes('1 accepted')).toBeTruthy();
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
    expect(plain.includes('1 reply')).toBeTruthy();
    expect(!plain.includes('1 replies')).toBeTruthy();
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
    expect(plain.includes('\u2192') || plain.includes('→')).toBeTruthy();
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
    expect(line1).toBeTruthy();
    expect(line10).toBeTruthy();
    // Both gutter-to-content distances should be equal
    const gutterEnd1 = line1!.indexOf('│') !== -1 ? line1!.indexOf('│') : line1!.indexOf('┃');
    const gutterEnd10 = line10!.indexOf('│') !== -1 ? line10!.indexOf('│') : line10!.indexOf('┃');
    expect(gutterEnd1).toBe(gutterEnd10);
  });
});
