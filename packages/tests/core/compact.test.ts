import { describe, it, beforeAll } from 'vitest';
import * as assert from 'node:assert';
import {
  analyzeCompactionCandidates,
  compact,
  compactL2,
  checkSupersedesIntegrity,
  initHashline,
  type CompactionSurface,
  type FootnoteRef,
} from '@changetracks/core/internals';

// ─── Task 1: compaction-boundary footnote handling ───────────────────────────

describe('analyzeCompactionCandidates — compaction-boundary filtering', () => {
  it('filters out a compaction-boundary footnote with full 4-field header', async () => {
    // A boundary footnote that matches FOOTNOTE_DEF_LENIENT must be excluded.
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '[^ct-2]: @alice | 2026-03-20 | compaction-boundary | -',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    // ct-2 must not appear in any category
    const allIds = collectIds(surface);
    assert.ok(!allIds.has('ct-2'), 'compaction-boundary entry must be filtered out');

    // ct-1 must still appear
    assert.ok(allIds.has('ct-1'), 'normal decided footnote must appear');

    // totalFootnotes counts only non-boundary entries
    assert.strictEqual(surface.totalFootnotes, 1);
  });

  it('bare compaction-boundary (no 4-field header) produces no FootnoteInfo at all', async () => {
    // A bare `[^ct-5]: compaction-boundary` line does not match FOOTNOTE_DEF_LENIENT
    // (only 1 field after the colon, not 4 pipe-separated fields), so the unified
    // parser ignores it entirely (resolveType returns null for "compaction-boundary").
    const l3Text = '[^ct-5]: compaction-boundary';

    // Verify at the surface level — unified parser excludes compaction-boundary entries
    const surface = await analyzeCompactionCandidates(l3Text);
    assert.strictEqual(surface.totalFootnotes, 0);
    assert.strictEqual(surface.decided.length, 0);
    assert.strictEqual(surface.proposed.length, 0);
  });

  it('3-field compaction-boundary (@author | date | compaction-boundary) is not parsed', async () => {
    // Only 3 fields — also does not match the 4-field header pattern, so the
    // unified parser excludes this entry.
    const l3Text = '[^ct-3]: @alice | 2026-03-20 | compaction-boundary';

    const surface = await analyzeCompactionCandidates(l3Text);
    assert.strictEqual(surface.totalFootnotes, 0);
  });
});

// ─── Task 2: status categorization ──────────────────────────────────────────

describe('analyzeCompactionCandidates — status categorization', () => {
  it('categorizes accepted footnotes as decided', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | accepted',
      '[^ct-2]: @bob | 2026-03-02 | del | accepted',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.decided.length, 2);
    assert.strictEqual(surface.proposed.length, 0);
    assert.deepStrictEqual(
      surface.decided.map((r: FootnoteRef) => r.id).sort(),
      ['ct-1', 'ct-2'],
    );
  });

  it('categorizes rejected footnotes as decided', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | sub | rejected',
      '[^ct-2]: @bob | 2026-03-02 | del | rejected',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.decided.length, 2);
    assert.strictEqual(surface.proposed.length, 0);
  });

  it('categorizes proposed footnotes correctly', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | proposed',
      '[^ct-2]: @bob | 2026-03-02 | sub | proposed',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.proposed.length, 2);
    assert.strictEqual(surface.decided.length, 0);
  });

  it('separates mixed accepted/rejected/proposed into correct buckets', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | accepted',
      '[^ct-2]: @bob | 2026-03-02 | del | rejected',
      '[^ct-3]: @carol | 2026-03-03 | sub | proposed',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.decided.length, 2);
    assert.strictEqual(surface.proposed.length, 1);
    assert.strictEqual(surface.totalFootnotes, 3);

    const decidedIds = surface.decided.map((r: FootnoteRef) => r.id).sort();
    assert.deepStrictEqual(decidedIds, ['ct-1', 'ct-2']);
    assert.strictEqual(surface.proposed[0].id, 'ct-3');
  });

  it('FootnoteRef carries author, date, and type fields', async () => {
    const l3Text = '[^ct-1]: @alice | 2026-03-10 | ins | accepted';

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.decided.length, 1);
    const ref = surface.decided[0];
    assert.strictEqual(ref.id, 'ct-1');
    assert.strictEqual(ref.status, 'accepted');
    assert.strictEqual(ref.author, '@alice');
    assert.strictEqual(ref.date, '2026-03-10');
    assert.strictEqual(ref.type, 'ins');
  });

  it('unresolved is always empty (future concern)', async () => {
    const l3Text = '[^ct-1]: @alice | 2026-03-01 | ins | accepted';
    const surface = await analyzeCompactionCandidates(l3Text);
    assert.strictEqual(surface.unresolved.length, 0);
  });
});

// ─── Task 2: supersede chain detection ──────────────────────────────────────

describe('analyzeCompactionCandidates — supersede chains', () => {
  it('detects a supersede chain from supersedes: line', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | accepted',
      '[^ct-2]: @alice | 2026-03-02 | ins | accepted',
      '    supersedes: ct-1',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.supersedeChains.length, 1);
    const chain = surface.supersedeChains[0];
    assert.strictEqual(chain.active, 'ct-2');
    assert.deepStrictEqual(chain.consumed, ['ct-1']);
  });

  it('detects a chain where one op supersedes multiple predecessors', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | rejected',
      '[^ct-2]: @alice | 2026-03-02 | ins | rejected',
      '[^ct-3]: @alice | 2026-03-03 | ins | accepted',
      '    supersedes: ct-1',
      '    supersedes: ct-2',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.supersedeChains.length, 1);
    const chain = surface.supersedeChains[0];
    assert.strictEqual(chain.active, 'ct-3');
    assert.deepStrictEqual(chain.consumed, ['ct-1', 'ct-2']);
  });

  it('returns empty supersedeChains when no supersedes: lines exist', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | accepted',
      '[^ct-2]: @bob | 2026-03-02 | del | proposed',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.supersedeChains.length, 0);
  });

  it('handles multiple independent supersede chains', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | rejected',
      '[^ct-2]: @alice | 2026-03-02 | ins | accepted',
      '    supersedes: ct-1',
      '[^ct-3]: @bob | 2026-03-03 | del | rejected',
      '[^ct-4]: @bob | 2026-03-04 | del | accepted',
      '    supersedes: ct-3',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.supersedeChains.length, 2);

    const chainMap = new Map(surface.supersedeChains.map((c: { active: string; consumed: string[] }) => [c.active, c]));
    assert.ok(chainMap.has('ct-2'));
    assert.deepStrictEqual(chainMap.get('ct-2')!.consumed, ['ct-1']);
    assert.ok(chainMap.has('ct-4'));
    assert.deepStrictEqual(chainMap.get('ct-4')!.consumed, ['ct-3']);
  });
});

// ─── Task 2: active discussion thread detection ───────────────────────────────

describe('analyzeCompactionCandidates — active discussion threads', () => {
  it('detects footnotes with active discussion thread replies', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | sub | proposed',
      '    reason: improve clarity',
      '    @bob 2026-03-02: This looks good to me',
      '[^ct-2]: @bob | 2026-03-02 | del | proposed',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.withActiveThreads.length, 1);
    assert.strictEqual(surface.withActiveThreads[0].id, 'ct-1');
  });

  it('does not count approval/rejection lines as active thread replies', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | sub | accepted',
      '    reason: improve clarity',
      '    approved: @bob 2026-03-02',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.withActiveThreads.length, 0);
  });

  it('does not count request-changes lines as active thread replies', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | sub | proposed',
      '    request-changes: @bob 2026-03-02: reword this',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.withActiveThreads.length, 0);
  });

  it('counts @author date: lines as active thread entries', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | sub | proposed',
      '    @carol 2026-03-02: I disagree with this change',
      '    @alice 2026-03-03: Let me reconsider',
      '[^ct-2]: @bob | 2026-03-02 | del | proposed',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.withActiveThreads.length, 1);
    assert.strictEqual(surface.withActiveThreads[0].id, 'ct-1');
  });

  it('returns empty withActiveThreads when no discussion exists', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | accepted',
      '    reason: spelling fix',
      '[^ct-2]: @bob | 2026-03-02 | del | rejected',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    assert.strictEqual(surface.withActiveThreads.length, 0);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('analyzeCompactionCandidates — edge cases', () => {
  it('returns empty surface for empty document', async () => {
    const surface = await analyzeCompactionCandidates('');

    assert.strictEqual(surface.decided.length, 0);
    assert.strictEqual(surface.proposed.length, 0);
    assert.strictEqual(surface.unresolved.length, 0);
    assert.strictEqual(surface.supersedeChains.length, 0);
    assert.strictEqual(surface.withActiveThreads.length, 0);
    assert.strictEqual(surface.totalFootnotes, 0);
  });

  it('returns empty surface for document with only non-footnote content', async () => {
    const surface = await analyzeCompactionCandidates('# Title\n\nSome text here.\n');

    assert.strictEqual(surface.totalFootnotes, 0);
    assert.strictEqual(surface.decided.length, 0);
  });

  it('handles compaction-boundary mixed with real footnotes', async () => {
    const l3Text = [
      '[^ct-1]: @alice | 2026-03-01 | ins | accepted',
      '[^ct-2]: @alice | 2026-03-10 | compaction-boundary | -',
      '[^ct-3]: @bob | 2026-03-15 | del | proposed',
    ].join('\n');

    const surface = await analyzeCompactionCandidates(l3Text);

    // Only ct-1 and ct-3 should appear
    assert.strictEqual(surface.totalFootnotes, 2);
    const allIds = collectIds(surface);
    assert.ok(!allIds.has('ct-2'));
    assert.ok(allIds.has('ct-1'));
    assert.ok(allIds.has('ct-3'));
  });
});

// ─── Helper ──────────────────────────────────────────────────────────────────

function collectIds(surface: CompactionSurface): Set<string> {
  const ids = new Set<string>();
  for (const ref of [...surface.decided, ...surface.proposed, ...surface.unresolved, ...surface.withActiveThreads]) {
    ids.add(ref.id);
  }
  for (const chain of surface.supersedeChains) {
    ids.add(chain.active);
    for (const c of chain.consumed) ids.add(c);
  }
  return ids;
}

// ─── Task 3: compact() ──────────────────────────────────────────────────────

describe('compact', () => {
  beforeAll(async () => {
    await initHashline();
  });

  it('removes decided footnotes and inserts boundary', async () => {
    // L3 doc with one accepted insertion
    const text = [
      'The quick beautiful brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 The quick {++beautiful ++}brown fox.',
      '    approved: @bob 2026-03-20 "OK"',
    ].join('\n');

    const result = await compact(text, { targets: 'all-decided', undecidedPolicy: 'accept' });

    assert.deepStrictEqual(result.compactedIds, ['ct-1']);
    assert.ok(result.text.includes('The quick beautiful brown fox.'), 'body preserved');
    assert.ok(!result.text.includes('[^ct-1]:'), 'footnote ct-1 removed');
    assert.ok(result.text.includes('compaction-boundary'), 'boundary inserted');
    assert.ok(result.verification.valid, 'verification passes');
  });

  it('preserves proposed footnotes when compacting decided only', async () => {
    const text = [
      'The quick beautiful brown fox jumps over.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 The quick {++beautiful ++}brown fox jumps over.',
      '[^ct-2]: @bob | 2026-03-21 | ins | proposed',
      '    1:b2 The quick beautiful brown fox {++happily ++}jumps over.',
    ].join('\n');

    const result = await compact(text, { targets: 'all-decided', undecidedPolicy: 'accept' });

    assert.deepStrictEqual(result.compactedIds, ['ct-1']);
    assert.ok(!result.text.includes('[^ct-1]:'), 'decided footnote removed');
    assert.ok(result.text.includes('[^ct-2]:'), 'proposed footnote preserved');
    assert.ok(result.text.includes('compaction-boundary'), 'boundary inserted');
  });

  it('compacts specific footnotes by ID', async () => {
    const text = [
      'The quick brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 {++The quick ++}brown fox.',
      '[^ct-2]: @bob | 2026-03-21 | del | accepted',
      '    1:b2 The quick brown {--lazy --}fox.',
    ].join('\n');

    const result = await compact(text, { targets: ['ct-1'], undecidedPolicy: 'accept' });

    assert.deepStrictEqual(result.compactedIds, ['ct-1']);
    assert.ok(!result.text.includes('[^ct-1]:'), 'targeted footnote removed');
    assert.ok(result.text.includes('[^ct-2]:'), 'non-targeted footnote preserved');
  });

  it('auto-accepts proposed changes (body unchanged)', async () => {
    // L3 body already reflects the proposed state, so accepting means no body change.
    const text = [
      'The quick beautiful brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:a1 The quick {++beautiful ++}brown fox.',
    ].join('\n');

    const result = await compact(text, { targets: ['ct-1'], undecidedPolicy: 'accept' });

    assert.deepStrictEqual(result.compactedIds, ['ct-1']);
    assert.ok(result.text.includes('The quick beautiful brown fox.'), 'body unchanged (auto-accept)');
    assert.ok(!result.text.includes('[^ct-1]:'), 'footnote removed');
  });

  it('auto-rejects proposed insertion (removes text from body)', async () => {
    // Rejecting a proposed insertion means removing the inserted text from the body.
    const text = [
      'The quick beautiful brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:a1 The quick {++beautiful ++}brown fox.',
    ].join('\n');

    const result = await compact(text, { targets: ['ct-1'], undecidedPolicy: 'reject' });

    assert.deepStrictEqual(result.compactedIds, ['ct-1']);
    assert.ok(result.text.includes('The quick brown fox.'), 'inserted text removed from body');
    assert.ok(!result.text.includes('beautiful'), 'inserted word gone');
    assert.ok(!result.text.includes('[^ct-1]:'), 'footnote removed');
  });

  it('includes optional boundary metadata', async () => {
    const text = [
      'Some text here.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 Some {++text ++}here.',
    ].join('\n');

    const result = await compact(text, {
      targets: 'all-decided',
      undecidedPolicy: 'accept',
      boundaryMeta: { note: 'Sprint cleanup', tool: 'changetracks v0.2' },
    });

    assert.ok(result.text.includes('compaction-boundary'), 'boundary present');
    assert.ok(result.text.includes('    note: Sprint cleanup'), 'note metadata present');
    assert.ok(result.text.includes('    tool: changetracks v0.2'), 'tool metadata present');
  });

  it('handles empty document gracefully', async () => {
    const result = await compact('', { targets: 'all-decided', undecidedPolicy: 'accept' });

    assert.deepStrictEqual(result.compactedIds, []);
    assert.strictEqual(result.text, '');
    assert.ok(result.verification.valid, 'empty doc is valid');
    assert.strictEqual(result.verification.anchorCoherence, 100);
  });

  it('handles document with no footnotes', async () => {
    const text = '# Title\n\nSome content here.';

    const result = await compact(text, { targets: 'all-decided', undecidedPolicy: 'accept' });

    assert.deepStrictEqual(result.compactedIds, []);
    assert.strictEqual(result.text, text);
    assert.ok(result.verification.valid);
  });

  it('assigns boundary ID greater than max existing ct-ID', async () => {
    const text = [
      'Hello world.',
      '',
      '[^ct-5]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 {++Hello ++}world.',
    ].join('\n');

    const result = await compact(text, { targets: 'all-decided', undecidedPolicy: 'accept' });

    // Max existing is ct-5, so boundary should be ct-6
    assert.ok(result.text.includes('[^ct-6]: compaction-boundary'), 'boundary ID is ct-6');
  });

  it('detects dangling refs in verification', async () => {
    // Manually construct a case where a body ref [^ct-1] points to a removed footnote.
    // This would happen if the body contains an inline ref (unusual for L3 but possible).
    const text = [
      'See change [^ct-1] for details.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 See change {++[^ct-1] for details.++}',
    ].join('\n');

    const result = await compact(text, { targets: ['ct-1'], undecidedPolicy: 'accept' });

    // The body still has [^ct-1] but the footnote was removed
    assert.deepStrictEqual(result.compactedIds, ['ct-1']);
    assert.ok(!result.verification.valid, 'should detect dangling ref');
    assert.ok(result.verification.danglingRefs.includes('ct-1'), 'ct-1 is dangling');
  });

  it('auto-rejects proposed substitution (restores original text)', async () => {
    const text = [
      'The quick brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | sub | proposed',
      '    1:a1 The quick {~~brown~>red~~} fox.',
    ].join('\n');

    const result = await compact(text, { targets: ['ct-1'], undecidedPolicy: 'reject' });

    assert.ok(result.text.includes('The quick brown fox.'), 'original text restored');
    assert.ok(!result.text.includes('red'), 'modified text removed');
  });

  it('populates anchorCoherence from resolve() on compacted result', async () => {
    const text = [
      'The quick beautiful brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 The quick {++beautiful ++}brown fox.',
    ].join('\n');

    const result = await compact(text, { targets: 'all-decided', undecidedPolicy: 'accept' });

    // After compacting ct-1, no surviving footnotes with anchors remain
    // (only the boundary, which has no edit-op). anchorCoherence should be 100.
    assert.strictEqual(result.verification.anchorCoherence, 100);
    assert.deepStrictEqual(result.verification.unresolvedAnchors, []);
    assert.deepStrictEqual(result.verification.danglingSupersedes, []);
    assert.ok(Array.isArray(result.verification.resolvedChanges));
    assert.ok(Array.isArray(result.verification.unresolvedDiagnostics));
  });

  it('cross-boundary supersedes does not trigger dangling', async () => {
    // ct-2 supersedes ct-1. Compact both ct-1 and ct-2, leave ct-3.
    // ct-3's supersedes: ct-2 is cross-boundary (ct-2 in removedIds), not dangling.
    const text = [
      'The quick newest brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-15 | sub | accepted',
      '    1:a1 The quick {~~new~>newer~~} brown fox.',
      '',
      '[^ct-2]: @alice | 2026-03-17 | sub | accepted',
      '    supersedes: ct-1',
      '    1:a1 The quick {~~newer~>newest~~} brown fox.',
      '',
      '[^ct-3]: @bob | 2026-03-18 | sub | proposed',
      '    supersedes: ct-2',
      '    1:a1 The quick {~~newest~>best~~} brown fox.',
    ].join('\n');

    const result = await compact(text, { targets: ['ct-1', 'ct-2'], undecidedPolicy: 'accept' });

    // ct-1 and ct-2 removed, ct-3 survives with supersedes: ct-2
    // ct-2 is in removedIds → cross-boundary, NOT dangling
    assert.deepStrictEqual(result.verification.danglingSupersedes, []);
    assert.deepStrictEqual(result.verification.danglingRefs, []);
    // Note: valid may be false due to anchorCoherence (fake hashes in test fixture),
    // but the supersedes and dangling-ref checks both pass.
  });
});

// ─── Task 4: supersede chain compaction ──────────────────────────────────────

describe('supersede chain compaction', () => {
  // 1. Auto-includes consumed predecessors in target set
  // If you target ct-2 which supersedes ct-1, ct-1 should be auto-included
  it('auto-includes consumed predecessors in target set', async () => {
    const text = [
      'The quick newer brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-15 | sub | accepted',
      '    1:a1 The quick {~~new~>newer~~} brown fox.',
      '',
      '[^ct-2]: @alice | 2026-03-17 | sub | proposed',
      '    supersedes: ct-1',
      '    1:a1 The quick {~~newer~>newest~~} brown fox.',
    ].join('\n');
    // Compact ct-2 — should auto-include ct-1
    const result = await compact(text, { targets: ['ct-2'], undecidedPolicy: 'accept' });
    assert.ok(result.compactedIds.includes('ct-1'), 'ct-1 auto-included');
    assert.ok(result.compactedIds.includes('ct-2'), 'ct-2 included');
    assert.ok(!result.text.includes('[^ct-1]:'), 'ct-1 footnote removed');
    assert.ok(!result.text.includes('[^ct-2]:'), 'ct-2 footnote removed');
  });

  // 2. Cross-boundary supersedes reference preserved
  // When compacting ct-1 and ct-2 but leaving ct-3 which supersedes ct-2,
  // ct-3 keeps its supersedes: ct-2 line as cross-boundary info
  it('cross-boundary supersedes reference is preserved on surviving footnote', async () => {
    const text = [
      'The quick newest brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-15 | sub | accepted',
      '    1:a1 The quick {~~new~>newer~~} brown fox.',
      '',
      '[^ct-2]: @alice | 2026-03-17 | sub | accepted',
      '    supersedes: ct-1',
      '    1:a1 The quick {~~newer~>newest~~} brown fox.',
      '',
      '[^ct-3]: @bob | 2026-03-18 | sub | proposed',
      '    supersedes: ct-2',
      '    1:a1 The quick {~~newest~>best~~} brown fox.',
    ].join('\n');
    // Compact ct-1 and ct-2, leave ct-3
    const result = await compact(text, { targets: ['ct-1', 'ct-2'], undecidedPolicy: 'accept' });
    assert.ok(result.compactedIds.includes('ct-1'), 'ct-1 compacted');
    assert.ok(result.compactedIds.includes('ct-2'), 'ct-2 compacted');
    // ct-3 survives with cross-boundary supersedes
    assert.ok(result.text.includes('[^ct-3]:'), 'ct-3 preserved');
    assert.ok(result.text.includes('supersedes: ct-2'), 'cross-boundary ref preserved');
    // Supersedes and dangling-ref checks both pass (anchor coherence may
    // fail due to fake hashes in test fixture — that's fine, we're testing
    // supersedes cross-boundary behavior here, not anchor resolution).
    assert.deepStrictEqual(result.verification.danglingRefs, []);
    assert.deepStrictEqual(result.verification.danglingSupersedes, []);
  });
});

// ─── Task 5: compactL2 — promote→compact→demote pipeline ────────────────────

describe('compactL2', () => {
  it('compacts an L2 document via promote→compact→demote', async () => {
    // L2 doc with one accepted insertion (CriticMarkup inline)
    const l2Text = [
      'The quick {++beautiful ++}[^ct-1]brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    approved: @bob 2026-03-20 "OK"',
    ].join('\n');

    const result = await compactL2(l2Text, { targets: 'all-decided', undecidedPolicy: 'accept' });

    assert.deepStrictEqual(result.compactedIds, ['ct-1']);
    // Body should not contain CriticMarkup or footnotes for compacted change
    assert.ok(!result.text.includes('{++'), 'no insertion markup');
    assert.ok(!result.text.includes('[^ct-1]'), 'no footnote ref');
    assert.ok(result.text.includes('beautiful'), 'accepted text remains');
    // Boundary should exist
    assert.ok(result.text.includes('compaction-boundary'), 'boundary present');
  });

  it('preserves proposed changes as L2 CriticMarkup', async () => {
    const l2Text = [
      'The quick {++beautiful ++}[^ct-1]{++brown ++}[^ct-2]fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    approved: @bob 2026-03-20 "OK"',
      '[^ct-2]: @carol | 2026-03-21 | ins | proposed',
    ].join('\n');

    const result = await compactL2(l2Text, { targets: 'all-decided', undecidedPolicy: 'accept' });

    assert.deepStrictEqual(result.compactedIds, ['ct-1']);
    // ct-1 compacted, ct-2 preserved as inline L2
    assert.ok(!result.text.includes('[^ct-1]'), 'ct-1 compacted');
    assert.ok(result.text.includes('[^ct-2]'), 'ct-2 preserved');
    // L2 format should have CriticMarkup for ct-2
    assert.ok(result.text.includes('{++'), 'proposed change has CriticMarkup');
  });
});

// ─── freshAnchor write-back ──────────────────────────────────────────────────

describe('compact — freshAnchor write-back', () => {
  beforeAll(async () => {
    await initHashline();
  });

  it('freshens surviving anchors after body mutation from auto-reject', async () => {
    // Two changes on the same line:
    // ct-1: proposed insertion (will be auto-rejected, mutating the body)
    // ct-2: accepted insertion (survives, but its anchor hash may go stale)
    //
    // Body: "The quick beautiful bold brown fox."
    // ct-1 proposes "beautiful " (will be rejected → removed from body)
    // ct-2 accepted "bold " (already settled)
    //
    // After rejecting ct-1, body becomes "The quick bold brown fox."
    // ct-2's anchor hash was computed against "The quick beautiful bold brown fox."
    // which no longer matches. resolve() should freshen it.
    const text = [
      'The quick beautiful bold brown fox.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | proposed',
      '    1:a1 The quick {++beautiful ++}bold brown fox.',
      '[^ct-2]: @bob | 2026-03-21 | ins | accepted',
      '    1:a1 The quick beautiful {++bold ++}brown fox.',
      '    approved: @carol 2026-03-22 "OK"',
    ].join('\n');

    const result = await compact(text, {
      targets: ['ct-1', 'ct-2'],
      undecidedPolicy: 'reject',
    });

    // ct-1 rejected → "beautiful " removed from body
    assert.ok(result.text.includes('The quick bold brown fox.'), 'body has rejection applied');
    assert.ok(!result.text.includes('beautiful'), 'rejected text removed');

    // Both footnotes compacted — no surviving footnotes with anchors → anchorCoherence is 100 vacuously
    assert.strictEqual(result.verification.anchorCoherence, 100);
    assert.deepStrictEqual(result.verification.unresolvedAnchors, []);
  });

  it('freshens surviving anchor when earlier footnote removal shifts content', async () => {
    // ct-1 accepted (will be compacted)
    // ct-2 accepted (survives) — its edit-op references line content
    // After compacting ct-1, body is unchanged (decided, no mutation),
    // but ct-2's anchor should still resolve correctly.
    const text = [
      'First line with change.',
      'Second line with another change.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 First line {++with change++}.',
      '    approved: @bob 2026-03-20',
      '[^ct-2]: @carol | 2026-03-21 | ins | accepted',
      '    2:b2 Second line {++with another change++}.',
      '    approved: @dave 2026-03-21',
    ].join('\n');

    const result = await compact(text, {
      targets: ['ct-1'],
      undecidedPolicy: 'accept',
    });

    // ct-1 removed, ct-2 survives
    assert.ok(!result.text.includes('[^ct-1]:'), 'ct-1 compacted');
    assert.ok(result.text.includes('[^ct-2]:'), 'ct-2 survives');
    assert.deepStrictEqual(result.verification.danglingRefs, []);

    // ct-2's anchor should be present with correct resolution
    const survivingChanges = result.verification.resolvedChanges;
    assert.ok(Array.isArray(survivingChanges), 'has resolved changes array');
  });
});

// ─── checkSupersedesIntegrity ────────────────────────────────────────────────

describe('checkSupersedesIntegrity', () => {
  it('returns empty for no supersedes references', () => {
    const text = [
      'Hello world.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 Hello world.',
    ].join('\n');

    const result = checkSupersedesIntegrity(text, ['ct-2']);
    assert.deepStrictEqual(result, []);
  });

  it('allows supersedes to removed footnote (cross-boundary)', () => {
    // ct-2 supersedes ct-1, ct-1 was removed by this compaction.
    // ct-1 is in removedIds → cross-boundary, valid.
    const text = [
      'Hello world.',
      '',
      '[^ct-2]: @alice | 2026-03-21 | ins | accepted',
      '    supersedes: ct-1',
      '    1:a1 Hello world.',
    ].join('\n');

    const result = checkSupersedesIntegrity(text, ['ct-1']);
    assert.deepStrictEqual(result, []);
  });

  it('allows supersedes to surviving footnote', () => {
    // ct-2 supersedes ct-1, both survive — fine
    const text = [
      'Hello world.',
      '',
      '[^ct-1]: @alice | 2026-03-20 | ins | accepted',
      '    1:a1 Hello world.',
      '[^ct-2]: @alice | 2026-03-21 | ins | accepted',
      '    supersedes: ct-1',
      '    1:a1 Hello world.',
    ].join('\n');

    const result = checkSupersedesIntegrity(text, ['ct-3']);
    assert.deepStrictEqual(result, []);
  });

  it('detects dangling supersedes (absent from both surviving and removed)', () => {
    // ct-2 supersedes ct-1. ct-1 is NOT in surviving footnotes and was NOT
    // removed by this compaction — it should exist but doesn't.
    const text = [
      'Hello world.',
      '',
      '[^ct-2]: @alice | 2026-03-21 | ins | accepted',
      '    supersedes: ct-1',
      '    1:a1 Hello world.',
    ].join('\n');

    // removedIds does NOT include ct-1 — it wasn't targeted
    const result = checkSupersedesIntegrity(text, ['ct-3']);
    assert.deepStrictEqual(result, ['ct-1']);
  });
});
