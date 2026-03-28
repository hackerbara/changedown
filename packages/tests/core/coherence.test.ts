import { describe, it, expect, beforeAll } from 'vitest';
import { VirtualDocument, ChangeType, ChangeStatus, parseProjectConfig } from '@changedown/core';
import { FootnoteNativeParser, initHashline } from '@changedown/core/internals';
import type { UnresolvedDiagnostic } from '@changedown/core';

describe('VirtualDocument coherence', () => {
  it('defaults coherenceRate to 100 and unresolvedDiagnostics to empty', () => {
    const doc = new VirtualDocument([]);
    expect(doc.coherenceRate).toBe(100);
    expect(doc.unresolvedDiagnostics).toEqual([]);
  });

  it('accepts coherenceRate and unresolvedDiagnostics in constructor', () => {
    const diags: UnresolvedDiagnostic[] = [{
      changeId: 'cn-5',
      expectedText: 'Protocol overview',
      actualLineContent: 'Security architecture',
      attemptedPaths: ['hash', 'relocation', 'context', 'replay'],
    }];
    const doc = new VirtualDocument([], 85, diags);
    expect(doc.coherenceRate).toBe(85);
    expect(doc.unresolvedDiagnostics).toHaveLength(1);
    expect(doc.unresolvedDiagnostics[0].changeId).toBe('cn-5');
  });

  it('computes unresolved count from changes', () => {
    const changes = [
      { id: 'cn-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 10, end: 20 }, contentRange: { start: 10, end: 20 },
        level: 2 as const, anchored: true },
      { id: 'cn-2', type: ChangeType.Deletion, status: ChangeStatus.Proposed,
        range: { start: 0, end: 0 }, contentRange: { start: 0, end: 0 },
        level: 2 as const, anchored: false },
    ];
    const doc = new VirtualDocument(changes, 50, []);
    expect(doc.coherenceRate).toBe(50);
    expect(doc.getUnresolvedChanges()).toHaveLength(1);
    expect(doc.getUnresolvedChanges()[0].id).toBe('cn-2');
  });

  it('excludes L0 inline changes from getUnresolvedChanges', () => {
    const changes = [
      { id: 'cn-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 0, end: 5 }, contentRange: { start: 0, end: 5 },
        level: 0 as const, anchored: false },
    ];
    const doc = new VirtualDocument(changes, 100, []);
    expect(doc.getUnresolvedChanges()).toHaveLength(0);
  });

  it('excludes L1 overlay nodes from getUnresolvedChanges', () => {
    const changes = [
      { id: 'cn-pending', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
        range: { start: 0, end: 5 }, contentRange: { start: 0, end: 5 },
        level: 1 as const, anchored: false },
    ];
    const doc = new VirtualDocument(changes, 100, []);
    expect(doc.getUnresolvedChanges()).toHaveLength(0);
  });
});

describe('coherence config', () => {
  it('defaults coherence threshold to 98', () => {
    const config = parseProjectConfig({});
    expect(config.coherence.threshold).toBe(98);
  });

  it('parses threshold from config object', () => {
    const config = parseProjectConfig({ coherence: { threshold: 90 } });
    expect(config.coherence.threshold).toBe(90);
  });

  it('clamps threshold to 0-100 range', () => {
    expect(parseProjectConfig({ coherence: { threshold: -5 } }).coherence.threshold).toBe(0);
    expect(parseProjectConfig({ coherence: { threshold: 150 } }).coherence.threshold).toBe(100);
  });
});

describe('parser-computed coherenceRate and resolvedText', () => {
  beforeAll(async () => { await initHashline(); });

  const parser = new FootnoteNativeParser();

  it('coherenceRate is 100 and resolvedText is undefined when all anchors are correct', () => {
    // Hash 7b is the correct hash for "Hello world." at line 1.
    // The insertion text "Hello " appears in the body, so the match succeeds.
    const text = [
      'Hello world.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b {++Hello ++}',
    ].join('\n');
    const doc = parser.parse(text);
    expect(doc.coherenceRate).toBe(100);
    expect(doc.resolvedText).toBeUndefined();
  });

  it('coherenceRate is less than 100 when the parser produces an unresolved node', () => {
    // Hash ff is wrong for "Hello world." and the inserted text "xyzzy "
    // does not appear in the body, so Phase A fails and Phase B (replay)
    // cannot find the text either — the change stays anchored:false.
    const text = [
      'Hello world.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:ff {++xyzzy ++}',
    ].join('\n');
    const doc = parser.parse(text);
    expect(doc.coherenceRate).toBeLessThan(100);
    // The single change is unresolved, so rate is 0/1 = 0
    expect(doc.coherenceRate).toBe(0);
    expect(doc.getUnresolvedChanges()).toHaveLength(1);
  });

  it('coherenceRate reflects partial resolution when some nodes resolve and some do not', () => {
    // cn-1: correct hash + text present → resolves
    // cn-2: wrong hash + inserted text absent from body → unresolved
    // Expected rate: 1/2 = 50
    const text = [
      'Hello world.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b {++Hello ++}',
      '',
      '[^cn-2]: @alice | 2026-03-20 | ins | proposed',
      '    1:ff {++missing ++}',
    ].join('\n');
    const doc = parser.parse(text);
    expect(doc.coherenceRate).toBe(50);
    expect(doc.getUnresolvedChanges()).toHaveLength(1);
    expect(doc.getUnresolvedChanges()[0].id).toBe('cn-2');
  });

  it('resolvedText is defined when replay produces fresh anchors for stale-hash changes', () => {
    // cn-1 records insertion of "very " with wrong hash ff and a contextual
    // edit-op that references the pre-cn-2 body ("lazy"). After cn-2 changes
    // "lazy" to "sleepy", the contextual match on the current body fails.
    // The scrub replay traces the edit history, resolves cn-1's position, and
    // emits a fresh anchor with the updated LINE:HASH — triggering resolvedText.
    const text = [
      'The very very sleepy dog.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:ff The {++very ++}very lazy dog.',
      '',
      '[^cn-2]: @bob | 2026-03-21 | sub | proposed',
      '    1:ee The very very {~~lazy~>sleepy~~} dog.',
    ].join('\n');
    const doc = parser.parse(text);
    expect(doc.resolvedText).toBeDefined();
    // The resolved text must differ from the input (anchors were updated)
    expect(doc.resolvedText).not.toBe(text);
    // cn-1 is resolved via replay
    const ct1 = doc.getChanges().find(c => c.id === 'cn-1');
    expect(ct1?.anchored).toBe(true);
    expect(ct1?.resolutionPath).toBe('replay');
  });

  it('resolvedText is undefined when all anchors are fresh (no stale hashes to update)', () => {
    // Both changes have correct hashes — Phase A resolves them without replay.
    // No scrub replay runs, freshAnchors is empty, resolvedText stays undefined.
    const text = [
      'Hello world.',
      '',
      '[^cn-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:7b {++Hello ++}',
    ].join('\n');
    const doc = parser.parse(text);
    expect(doc.resolvedText).toBeUndefined();
  });
});
