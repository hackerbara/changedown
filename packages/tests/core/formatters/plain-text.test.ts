import { describe, it, expect } from 'vitest';
import { formatPlainText, ThreeZoneDocument } from '@changetracks/core/internals';

describe('formatPlainText', () => {
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

  it('formats review view with hashline margin + CriticMarkup + metadata', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: ['P'] },
        content: [
          { type: 'plain', text: 'Use ' },
          { type: 'delimiter', text: '{~~' },
          { type: 'sub_old', text: 'REST' },
          { type: 'sub_arrow', text: '~>' },
          { type: 'sub_new', text: 'GraphQL' },
          { type: 'delimiter', text: '~~}' },
          { type: 'anchor', text: '[^ct-1]' },
          { type: 'plain', text: '.' },
        ],
        metadata: [{ changeId: 'ct-1', author: '@alice', reason: 'paradigm', status: 'proposed' }],
        rawLineNumber: 1,
      }],
    };
    const output = formatPlainText(doc);
    expect(output.includes('1:a3 P|')).toBeTruthy();
    expect(output.includes('{~~REST~>GraphQL~~}')).toBeTruthy();
    expect(output.includes('[^ct-1]')).toBeTruthy();
    expect(output.includes('{>>ct-1 @alice: paradigm<<}')).toBeTruthy();
  });

  it('formats changes view with committed text + change IDs only', () => {
    const doc: ThreeZoneDocument = {
      view: 'changes',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: ['P'] },
        content: [{ type: 'plain', text: 'Use REST.' }],
        metadata: [{ changeId: 'ct-1' }],
        rawLineNumber: 1,
      }],
    };
    const output = formatPlainText(doc);
    expect(output.includes('1:a3 P|')).toBeTruthy();
    expect(output.includes('Use REST.')).toBeTruthy();
    expect(output.includes('{>>ct-1<<}')).toBeTruthy();
  });

  it('formats settled view with clean text and no metadata', () => {
    const doc: ThreeZoneDocument = {
      view: 'settled',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'a3', flags: [] },
        content: [{ type: 'plain', text: 'Use GraphQL.' }],
        metadata: [],
        rawLineNumber: 1,
      }],
    };
    const output = formatPlainText(doc);
    expect(output.includes('1:a3  |')).toBeTruthy();
    expect(output.includes('Use GraphQL.')).toBeTruthy();
    expect(!output.includes('{>>')).toBeTruthy();
  });

  it('formats header with status counts and authors', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: { ...baseHeader, counts: { proposed: 2, accepted: 1, rejected: 0 }, authors: ['@alice', '@bob'] },
      lines: [],
    };
    const output = formatPlainText(doc);
    expect(output.includes('test.md')).toBeTruthy();
    expect(output.includes('proposed: 2')).toBeTruthy();
    expect(output.includes('accepted: 1')).toBeTruthy();
    expect(output.includes('@alice')).toBeTruthy();
  });

  it('formats multiple metadata entries on one line', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'b7', flags: ['P'] },
        content: [
          { type: 'plain', text: 'Hello ' },
          { type: 'delimiter', text: '{++' },
          { type: 'insertion', text: 'world' },
          { type: 'delimiter', text: '++}' },
          { type: 'anchor', text: '[^ct-1]' },
          { type: 'plain', text: ' ' },
          { type: 'delimiter', text: '{--' },
          { type: 'deletion', text: 'old' },
          { type: 'delimiter', text: '--}' },
          { type: 'anchor', text: '[^ct-2]' },
        ],
        metadata: [
          { changeId: 'ct-1', author: '@alice', reason: 'add greeting', status: 'proposed' },
          { changeId: 'ct-2', author: '@bob', reason: 'remove cruft', status: 'proposed' },
        ],
        rawLineNumber: 1,
      }],
    };
    const output = formatPlainText(doc);
    expect(output.includes('{>>ct-1 @alice: add greeting<<}')).toBeTruthy();
    expect(output.includes('{>>ct-2 @bob: remove cruft<<}')).toBeTruthy();
  });

  it('includes reply count in review view metadata', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'c2', flags: ['P'] },
        content: [{ type: 'plain', text: 'Some text.' }],
        metadata: [{ changeId: 'ct-1', author: '@alice', reason: 'fix typo', replyCount: 3, status: 'proposed' }],
        rawLineNumber: 1,
      }],
    };
    const output = formatPlainText(doc);
    expect(output.includes('3 replies')).toBeTruthy();
  });

  it('includes line range in header when present', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: { ...baseHeader, lineRange: { start: 10, end: 20, total: 100 } },
      lines: [],
    };
    const output = formatPlainText(doc);
    expect(output.includes('lines: 10-20 of 100')).toBeTruthy();
  });

  it('includes thread count in header when nonzero', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: { ...baseHeader, threadCount: 5 },
      lines: [],
    };
    const output = formatPlainText(doc);
    expect(output.includes('threads: 5')).toBeTruthy();
  });

  it('pads line numbers for multi-digit documents', () => {
    const doc: ThreeZoneDocument = {
      view: 'settled',
      header: baseHeader,
      lines: [
        {
          margin: { lineNumber: 1, hash: 'aa', flags: [] },
          content: [{ type: 'plain', text: 'First.' }],
          metadata: [],
          rawLineNumber: 1,
        },
        {
          margin: { lineNumber: 100, hash: 'bb', flags: [] },
          content: [{ type: 'plain', text: 'Last.' }],
          metadata: [],
          rawLineNumber: 100,
        },
      ],
    };
    const output = formatPlainText(doc);
    // Line 1 should be padded to 3 digits to match line 100
    expect(output.includes('  1:aa  |')).toBeTruthy();
    expect(output.includes('100:bb  |')).toBeTruthy();
  });

  it('handles empty document with no lines', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [],
    };
    const output = formatPlainText(doc);
    // Should have header but no line content
    expect(output.includes('test.md')).toBeTruthy();
    expect(output.includes('---')).toBeTruthy();
  });

  it('singular reply for count of 1', () => {
    const doc: ThreeZoneDocument = {
      view: 'review',
      header: baseHeader,
      lines: [{
        margin: { lineNumber: 1, hash: 'd4', flags: ['P'] },
        content: [{ type: 'plain', text: 'Text.' }],
        metadata: [{ changeId: 'ct-1', author: '@alice', reason: 'note', replyCount: 1, status: 'proposed' }],
        rawLineNumber: 1,
      }],
    };
    const output = formatPlainText(doc);
    expect(output.includes('1 reply')).toBeTruthy();
    expect(!output.includes('1 replies')).toBeTruthy();
  });
});
