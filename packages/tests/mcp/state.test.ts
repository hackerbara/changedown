import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '@changetracks/mcp/internals';
import { rerecordState } from 'changetracks/engine';
import { initHashline } from '@changetracks/core';
import type { ChangeTracksConfig } from '@changetracks/mcp/internals';

describe('SessionState', () => {
  let state: SessionState;

  beforeEach(() => {
    state = new SessionState();
  });

  it('returns "ct-1" for a file with no existing IDs', () => {
    const id = state.getNextId('/tmp/test.md', 'Just plain text.');
    expect(id).toBe('ct-1');
  });

  it('returns "ct-4" for a file with existing ct-1, ct-2, ct-3', () => {
    const text = 'Text [^ct-1] and [^ct-2] and [^ct-3] here.';
    const id = state.getNextId('/tmp/test.md', text);
    expect(id).toBe('ct-4');
  });

  it('increments on subsequent calls without re-scanning', () => {
    const text = 'Text [^ct-1] and [^ct-2] and [^ct-3] here.';
    const id1 = state.getNextId('/tmp/test.md', text);
    expect(id1).toBe('ct-4');

    const id2 = state.getNextId('/tmp/test.md', text);
    expect(id2).toBe('ct-5');

    const id3 = state.getNextId('/tmp/test.md', text);
    expect(id3).toBe('ct-6');
  });

  it('tracks different files independently', () => {
    const textA = 'File A [^ct-5] content.';
    const textB = 'File B [^ct-2] content.';

    const idA = state.getNextId('/tmp/a.md', textA);
    expect(idA).toBe('ct-6');

    const idB = state.getNextId('/tmp/b.md', textB);
    expect(idB).toBe('ct-3');
  });

  it('resetFile clears cache and re-scans on next call', () => {
    const text1 = 'Text [^ct-3] here.';
    const id1 = state.getNextId('/tmp/test.md', text1);
    expect(id1).toBe('ct-4');

    // Simulate external change: file now has ct-10
    state.resetFile('/tmp/test.md');

    const text2 = 'Text [^ct-3] and [^ct-10] here.';
    const id2 = state.getNextId('/tmp/test.md', text2);
    expect(id2).toBe('ct-11');
  });

  it('resetFile is a no-op for unknown files', () => {
    // Should not throw
    state.resetFile('/tmp/unknown.md');
  });
});

describe('SessionState.beginGroup with knownMaxId', () => {
  let state: SessionState;

  beforeEach(() => {
    state = new SessionState();
  });

  it('uses knownMaxId to avoid ID collision on fresh session', () => {
    // Simulates a project with existing [^ct-5] footnotes scanned from files
    const groupId = state.beginGroup('Test group', undefined, 5);
    expect(groupId).toBe('ct-6');
  });

  it('uses knownMaxId even when other files have higher IDs', () => {
    // Edit one file with high IDs (file-local)
    const text = 'Text [^ct-10] here.';
    state.getNextId('/tmp/file.md', text); // ct-11

    // Start group with knownMaxId=5 (from the files we're ABOUT to edit in the group)
    // This should use knownMaxId, NOT the counter from the unrelated file
    const groupId = state.beginGroup('Test group', undefined, 5);
    expect(groupId).toBe('ct-6');
  });

  it('child IDs use the correct parent when knownMaxId prevents collision', () => {
    const groupId = state.beginGroup('Test group', undefined, 5);
    expect(groupId).toBe('ct-6');

    const childId = state.getNextId('/tmp/file.md', 'plain text');
    expect(childId).toBe('ct-6.1');
  });

  it('knownMaxId=0 has no effect (same as omitting)', () => {
    const groupId = state.beginGroup('Test group', undefined, 0);
    expect(groupId).toBe('ct-1');
  });

  it('cross-file contamination fix: editing unrelated file does not affect beginGroup', () => {
    // Regression test for the bug where editing a file with high IDs
    // (e.g., session-ses_3b5f-kimi-opencode.md with ct-8923) in the same
    // MCP session caused beginGroup() to allocate ct-8924 instead of ct-1

    // Step 1: Edit an unrelated file with very high IDs
    const sessionText = 'Session file [^ct-8923] content.';
    const sessionId = state.getNextId('/tmp/session.md', sessionText);
    expect(sessionId).toBe('ct-8924'); // Correctly continues from 8923

    // Step 2: Start a group for DIFFERENT files
    // After fix: returns ct-1 (independent of the unrelated session file)
    const groupId = state.beginGroup('Test group');
    expect(groupId).toBe('ct-1');

    // Step 3: Edit a new file within the group
    const newFileText = 'New file with no existing IDs.';
    const childId = state.getNextId('/tmp/newfile.md', newFileText);
    expect(childId).toBe('ct-1.1');

    // Each file's numbering is independent - no cross-contamination!
  });
});

describe('SessionState lifecycle', () => {
  let state: SessionState;

  beforeEach(() => {
    state = new SessionState();
  });

  it('recordAfterRead stores lastReadView', () => {
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'a1', settled: 'a1', committed: 'a1', rawLineNum: 1 },
    ], 'raw content');
    expect(state.getLastReadView('test.md')).toBe('review');
  });

  it('recordAfterRead stores content fingerprint', () => {
    state.recordAfterRead('test.md', 'settled', [], 'content A');
    expect(state.isStale('test.md', 'content A')).toBe(false);
    expect(state.isStale('test.md', 'content B')).toBe(true);
  });

  it('rerecordAfterWrite clears ID counter cache', () => {
    const id1 = state.getNextId('test.md', 'some text with [^ct-3]: in it');
    expect(id1).toBe('ct-4');
    state.rerecordAfterWrite('test.md', 'some text without footnotes', []);
    const id2 = state.getNextId('test.md', 'some text without footnotes');
    expect(id2).toBe('ct-1');
  });

  it('rerecordAfterWrite preserves lastReadView', () => {
    state.recordAfterRead('test.md', 'changes', [], 'original');
    state.rerecordAfterWrite('test.md', 'modified', [
      { line: 1, raw: 'b2', settled: 'b2', committed: 'b2', rawLineNum: 1 },
    ]);
    expect(state.getLastReadView('test.md')).toBe('changes');
  });

  it('rerecordAfterWrite updates hashes', () => {
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'a1', settled: 'a1', committed: 'a1', rawLineNum: 1 },
    ], 'original');
    state.rerecordAfterWrite('test.md', 'modified', [
      { line: 1, raw: 'b2', settled: 'b2', committed: 'b2', rawLineNum: 1 },
    ]);
    const hashes = state.getRecordedHashes('test.md');
    expect(hashes?.[0]?.raw).toBe('b2');
  });

  it('resolveHash uses committed hash for review view (backward compat, no suppliedHash)', () => {
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', settledView: 'sv1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1);
    expect(resolved).toEqual({ match: true, rawLineNum: 1, view: 'review' });
  });

  it('resolveHash uses settledView hash for settled view (backward compat, no suppliedHash)', () => {
    state.recordAfterRead('test.md', 'settled', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', settledView: 'sv1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1);
    expect(resolved).toEqual({ match: true, rawLineNum: 1, view: 'settled' });
  });

  it('resolveHash uses raw hash for raw view (backward compat, no suppliedHash)', () => {
    state.recordAfterRead('test.md', 'raw', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', settledView: 'sv1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1);
    expect(resolved).toEqual({ match: true, rawLineNum: 1, view: 'raw' });
  });

  it('resolveHash returns match:true when suppliedHash matches review view committed hash', () => {
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', settledView: 'sv1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1, 'c1');
    expect(resolved).toEqual({ match: true, rawLineNum: 1, view: 'review' });
  });

  it('resolveHash returns match:false when suppliedHash does not match review view committed hash', () => {
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', settledView: 'sv1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1, 'wrong-hash');
    expect(resolved).toEqual({ match: false, expectedHash: 'c1', view: 'review' });
  });

  it('resolveHash returns match:true when suppliedHash matches settled view settledView hash', () => {
    state.recordAfterRead('test.md', 'settled', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', settledView: 'sv1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1, 'sv1');
    expect(resolved).toEqual({ match: true, rawLineNum: 1, view: 'settled' });
  });

  it('resolveHash returns match:false when suppliedHash does not match settled view hash', () => {
    state.recordAfterRead('test.md', 'settled', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', settledView: 'sv1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1, 'c1');
    expect(resolved).toEqual({ match: false, expectedHash: 'sv1', view: 'settled' });
  });

  it('resolveHash returns match:true when suppliedHash matches raw view hash', () => {
    state.recordAfterRead('test.md', 'raw', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', settledView: 'sv1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1, 'r1');
    expect(resolved).toEqual({ match: true, rawLineNum: 1, view: 'raw' });
  });

  it('resolveHash returns undefined when no session state for file', () => {
    const resolved = state.resolveHash('unknown.md', 1, 'somehash');
    expect(resolved).toBeUndefined();
  });

  it('resolveHash returns undefined when line not found', () => {
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 99, 'c1');
    expect(resolved).toBeUndefined();
  });

  it('resolveHash falls back to raw hash when committed is absent in review view', () => {
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'r1', settled: 's1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1, 'r1');
    expect(resolved).toEqual({ match: true, rawLineNum: 1, view: 'review' });
  });

  it('resolveHash falls back to settled hash when settledView is absent in settled view', () => {
    state.recordAfterRead('test.md', 'settled', [
      { line: 1, raw: 'r1', settled: 's1', rawLineNum: 1 },
    ], 'content');
    const resolved = state.resolveHash('test.md', 1, 's1');
    expect(resolved).toEqual({ match: true, rawLineNum: 1, view: 'settled' });
  });

  it('getLastReadView returns undefined for unread files', () => {
    expect(state.getLastReadView('unknown.md')).toBeUndefined();
  });
});

describe('per-view hash retention', () => {
  let state: SessionState;

  beforeEach(() => {
    state = new SessionState();
  });

  it('resolves coordinates from a previously-read view after reading a different view', () => {
    // Read in 'changes' view: line 5 has committed hash 'c5', rawLineNum 7
    state.recordAfterRead('test.md', 'changes', [
      { line: 5, raw: 'r7', settled: 's7', committed: 'c5', rawLineNum: 7 },
    ], 'content');

    // Read in 'raw' view: line 7 has raw hash 'r7', rawLineNum 7
    state.recordAfterRead('test.md', 'raw', [
      { line: 7, raw: 'r7', settled: 's7', rawLineNum: 7 },
    ], 'content');

    // Now resolve using changes-view coordinates (line 5, hash 'c5')
    // Before fix: this would fail because raw view overwrote the hash table
    const resolved = state.resolveHash('test.md', 5, 'c5');
    expect(resolved).toEqual({ match: true, rawLineNum: 7, view: 'changes' });
  });

  it('resolves coordinates from raw view even after reading settled view', () => {
    state.recordAfterRead('test.md', 'raw', [
      { line: 3, raw: 'r3', settled: 's3', rawLineNum: 3 },
    ], 'content');

    state.recordAfterRead('test.md', 'settled', [
      { line: 2, raw: 'r3', settled: 's3', settledView: 'sv2', rawLineNum: 3 },
    ], 'content');

    // Resolve using raw-view coordinates
    const resolved = state.resolveHash('test.md', 3, 'r3');
    expect(resolved).toEqual({ match: true, rawLineNum: 3, view: 'raw' });
  });

  it('invalidates all view tables when file content changes', () => {
    state.recordAfterRead('test.md', 'changes', [
      { line: 5, raw: 'r7', settled: 's7', committed: 'c5', rawLineNum: 7 },
    ], 'content A');

    // Read with different content — old tables should be invalidated
    state.recordAfterRead('test.md', 'raw', [
      { line: 7, raw: 'r7new', settled: 's7new', rawLineNum: 7 },
    ], 'content B');

    // Old changes-view hash should NOT match (content changed)
    const resolved = state.resolveHash('test.md', 5, 'c5');
    expect(resolved).toBeUndefined();
  });

  it('updates lastReadView to the most recent read', () => {
    state.recordAfterRead('test.md', 'changes', [], 'content');
    state.recordAfterRead('test.md', 'settled', [], 'content');
    expect(state.getLastReadView('test.md')).toBe('settled');
  });

  it('rerecordAfterWrite clears all view tables and stores current view', () => {
    state.recordAfterRead('test.md', 'changes', [
      { line: 5, raw: 'r7', settled: 's7', committed: 'c5', rawLineNum: 7 },
    ], 'content');
    state.recordAfterRead('test.md', 'raw', [
      { line: 7, raw: 'r7', settled: 's7', rawLineNum: 7 },
    ], 'content');

    // Write clears all and records new table under lastReadView
    state.rerecordAfterWrite('test.md', 'new content', [
      { line: 7, raw: 'r7new', settled: 's7new', rawLineNum: 7 },
    ]);

    // Old changes-view coordinates should not resolve
    const oldResolved = state.resolveHash('test.md', 5, 'c5');
    expect(oldResolved).toBeUndefined();

    // New raw-view coordinates should resolve
    const newResolved = state.resolveHash('test.md', 7, 'r7new');
    expect(newResolved).toEqual({ match: true, rawLineNum: 7, view: 'raw' });
  });

  it('returns match:false with error context from lastReadView when no view matches', () => {
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', rawLineNum: 1 },
    ], 'content');

    const resolved = state.resolveHash('test.md', 1, 'wrong-hash');
    // Should still return match:false with the lastReadView's expected hash for the error message
    expect(resolved).toEqual({ match: false, expectedHash: 'c1', view: 'review' });
  });
});

describe('rerecordState: review view computes committed hashes', () => {
  const config: ChangeTracksConfig = {
    hashline: { enabled: true, auto_remap: false },
    tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: true },
    author: { default: 'Test Author', enforcement: 'optional' },
    hooks: { enforcement: 'optional', exclude: [] },
    matching: { mode: 'standard' },
    settlement: { auto_on_approve: false, auto_on_reject: false },
  };

  // Content with CriticMarkup: line 2 has a pending insertion
  const criticContent = [
    '<!-- ctrcks.com/v1: tracked -->',
    'Line one with {++inserted phrase++} here.',
    'Line two is plain.',
  ].join('\n');

  it('stores committed hashes for review view after rerecordState', async () => {
    await initHashline();
    const state = new SessionState();

    // Record an initial read in review view so lastReadView = 'review'
    state.recordAfterRead('test.md', 'review', [
      { line: 1, raw: 'r1', settled: 's1', committed: 'c1', rawLineNum: 1 },
      { line: 2, raw: 'r2', settled: 's2', committed: 'c2', rawLineNum: 2 },
      { line: 3, raw: 'r3', settled: 's3', committed: 'c3', rawLineNum: 3 },
    ], 'original content');

    // Call rerecordState with CriticMarkup content
    await rerecordState(state, 'test.md', criticContent, config);

    // Hashes should have been re-recorded
    const hashes = state.getRecordedHashes('test.md');
    expect(hashes).toBeDefined();
    expect(hashes!.length).toBeGreaterThan(0);

    // All hashes should include committed field (not undefined)
    for (const h of hashes!) {
      expect(h.committed).toBeDefined();
    }
  });

  it('committed hash differs from raw hash for line with CriticMarkup', async () => {
    await initHashline();
    const state = new SessionState();

    state.recordAfterRead('test.md', 'review', [], 'original');

    await rerecordState(state, 'test.md', criticContent, config);

    const hashes = state.getRecordedHashes('test.md');
    expect(hashes).toBeDefined();

    // Line 2 (1-indexed) has CriticMarkup — its committed hash should differ from raw hash
    // because committed strips the markup and reverts the pending insertion
    const line2 = hashes!.find(h => h.line === 2);
    expect(line2).toBeDefined();
    expect(line2!.committed).toBeDefined();
    expect(line2!.committed).not.toBe(line2!.raw);
  });

  it('raw view does not compute committed hashes', async () => {
    await initHashline();
    const state = new SessionState();

    // Record a read in raw view — committed hashes should NOT be computed
    state.recordAfterRead('test.md', 'raw', [], 'original');

    await rerecordState(state, 'test.md', criticContent, config);

    const hashes = state.getRecordedHashes('test.md');
    expect(hashes).toBeDefined();

    // Raw view: no committed field expected
    for (const h of hashes!) {
      expect(h.committed).toBeUndefined();
    }
  });
});
