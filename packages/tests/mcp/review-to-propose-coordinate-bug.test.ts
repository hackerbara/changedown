/**
 * Bug reproduction: review-view re-recording uses committed line numbers
 * instead of raw line numbers, breaking chained edits.
 *
 * ROOT CAUSE (confirmed by test failures):
 *
 * The review view shows RAW line numbers and RAW hashes to the agent.
 * After a successful propose_change, the re-recording path at:
 *
 *   - propose-change.ts:1578 (compact mode)
 *   - propose-change.ts:1085 (classic mode)
 *
 * contains `if (compactViewResolved === 'review' || ... === 'changes')`,
 * which treats review identically to changes. It calls computeCommittedView()
 * and re-records hashes with `line: cl.committedLineNum`.
 *
 * When the file has single-line pending insertions, computeCommittedView()
 * COLLAPSES them (skips lines where pending insertion resolves to empty).
 * This produces committed line numbers that differ from raw line numbers:
 *
 *   Raw:       1=Title, 2={++pending++}, 3=HeadingA, 4=HeadingB
 *   Committed: 1=Title,                 2=HeadingA, 3=HeadingB
 *
 * After re-recording with committed line numbers, resolveHash() can't find
 * the agent's raw line 4 (it's stored as committed line 3). The lookup
 * either returns undefined (no entry) or finds the WRONG entry (committed
 * line 4 maps to a different raw line), causing a hash mismatch error.
 *
 * FIX LOCATION:
 *   When compactViewResolved === 'review', re-record with RAW line numbers
 *   (i + 1) instead of committed line numbers (cl.committedLineNum).
 *   The review case should NOT share the committed-view re-recording path.
 *   It should use the same pattern as the raw/default else-branch at
 *   propose-change.ts:1107-1113.
 *
 * AFFECTED CODE PATHS:
 *   - packages/cli/src/engine/handlers/propose-change.ts:1578 (compact)
 *   - packages/cli/src/engine/handlers/propose-change.ts:1085 (classic)
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changedown/mcp/internals';
import { handleReadTrackedFile } from '@changedown/mcp/internals';
import { SessionState } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';
import { ConfigResolver } from '@changedown/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { initHashline } from '@changedown/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Extract LINE:HASH from a formatted output line.
 * Matches "N:HH" at the start of a formatted hashline output line.
 */
function extractCoordinate(outputLine: string): { lineNum: number; hash: string } {
  const m = outputLine.match(/^\s*(\d+):([0-9a-f]{2})/);
  if (!m) throw new Error(`Cannot extract coordinate from line: "${outputLine}"`);
  return { lineNum: parseInt(m[1], 10), hash: m[2] };
}

// ─── Configs ────────────────────────────────────────────────────────────────

const compactConfig: ChangeDownConfig = {
  tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
  author: { default: 'ai:test-agent', enforcement: 'optional' },
  hooks: { enforcement: 'warn', exclude: [] },
  matching: { mode: 'normalized' },
  hashline: { enabled: true, auto_remap: false },
  settlement: { auto_on_approve: false, auto_on_reject: false },
  policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'suggest' },
  protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
};

const classicConfig: ChangeDownConfig = {
  tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
  author: { default: 'ai:test-agent', enforcement: 'optional' },
  hooks: { enforcement: 'warn', exclude: [] },
  matching: { mode: 'normalized' },
  hashline: { enabled: true, auto_remap: false },
  settlement: { auto_on_approve: false, auto_on_reject: false },
  policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'suggest' },
  protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
};


// ═══════════════════════════════════════════════════════════════════════════
// PASSING BASELINE: single review read → propose_change (no re-recording)
// ═══════════════════════════════════════════════════════════════════════════

describe('baseline: single review read → propose_change works correctly', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-review-baseline-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('highlight op succeeds with multi-line insertion before target (compact mode)', async () => {
    const fileContent = [
      '# Title',
      '{++This is a multi-line',
      'pending insertion that spans',
      'three lines++}[^cn-1]',
      '## Important Heading',
      '',
      'Some body text here.',
      '',
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
      '    @alice 2026-02-17: adding context paragraph',
    ].join('\n');

    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, fileContent);

    // Read review view → raw line numbers + raw hashes
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, resolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    // Find and extract heading coordinate
    const headingLine = readResult.content[0].text.split('\n')
      .find(l => l.includes('## Important Heading'));
    expect(headingLine).toBeDefined();
    const { lineNum, hash } = extractCoordinate(headingLine!);
    expect(lineNum).toBe(5); // raw line 5

    // Propose highlight at heading
    const result = await handleProposeChange(
      { file: filePath, at: `${lineNum}:${hash}`, op: '{==## Important Heading==}{>>key section', author: 'ai:test-agent' },
      resolver, state,
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).type).toBe('highlight');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{==## Important Heading==}');
  });

  it('substitution succeeds with complex multi-line markup + footnotes (classic mode)', async () => {
    const classicResolver = await createTestResolver(tmpDir, classicConfig);
    const fileContent = [
      '# Document Title',
      '',
      '{++A multi-line insertion',
      'spanning two lines++}[^cn-1]',
      '',
      '{~~Original text',
      'spanning two lines~>Replacement text',
      'also spanning two lines~~}[^cn-2]',
      '',
      '## Target Heading',
      '',
      'The body text that we want to edit.',
      '',
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
      '    @alice 2026-02-17: added context',
      '[^cn-2]: @bob | 2026-02-18 | sub | accepted',
      '    @bob 2026-02-18: improved wording',
    ].join('\n');

    const filePath = path.join(tmpDir, 'complex.md');
    await fs.writeFile(filePath, fileContent);

    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, classicResolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    const bodyLine = readResult.content[0].text.split('\n')
      .find(l => l.includes('The body text that we want to edit.'));
    expect(bodyLine).toBeDefined();
    const { lineNum, hash } = extractCoordinate(bodyLine!);
    expect(lineNum).toBe(12); // raw line 12

    const result = await handleProposeChange(
      {
        file: filePath, old_text: 'The body text that we want to edit.',
        new_text: 'The body text has been edited.',
        start_line: lineNum, start_hash: hash, reason: 'test',
      },
      classicResolver, state,
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).type).toBe('sub');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// PASSING BASELINE: changes view coordinate translation works for single edits
// ═══════════════════════════════════════════════════════════════════════════

describe('baseline: changes view → propose_change with collapsed pending insertions', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-changes-baseline-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('highlight maps committed line 2 → raw line 5 when 3 insertions collapsed', async () => {
    const fileContent = [
      '# Title',
      '{++First pending insertion line++}[^cn-1]',
      '{++Second pending insertion line++}[^cn-2]',
      '{++Third pending insertion line++}[^cn-3]',
      '## Target Heading',
      'Body text here.',
      '',
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
      '[^cn-2]: @alice | 2026-02-17 | ins | proposed',
      '[^cn-3]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const filePath = path.join(tmpDir, 'collapsed.md');
    await fs.writeFile(filePath, fileContent);

    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'changes' }, resolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    const headingLine = readResult.content[0].text.split('\n')
      .find(l => l.includes('## Target Heading'));
    expect(headingLine).toBeDefined();
    const { lineNum, hash } = extractCoordinate(headingLine!);
    expect(lineNum).toBe(2); // committed line 2 (3 insertions collapsed)

    const result = await handleProposeChange(
      { file: filePath, at: `${lineNum}:${hash}`, op: '{==## Target Heading==}{>>important section', author: 'ai:test-agent' },
      resolver, state,
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).type).toBe('highlight');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// BUG REPRODUCTION: chained edits from review view break after re-recording
// ═══════════════════════════════════════════════════════════════════════════

describe('BUG: review view re-recording uses committed line numbers (compact mode)', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-review-bug-compact-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('second highlight fails after first edit re-records with committed line numbers', async () => {
    // Setup: file with a pending insertion (line 2) that gets collapsed in committed view.
    // Review view shows raw lines: 1=Title, 2={++pending++}, 3=FirstSection, 4=SecondSection
    // After first edit at line 3, re-recording uses computeCommittedView which collapses line 2:
    //   Committed: 1=Title, 2=FirstSection(edited), 3=SecondSection
    // Re-recorded hashes have line=3 for SecondSection, but agent has line=4 (raw).
    const fileContent = [
      '# Title',
      '{++single pending insertion++}[^cn-1]',
      '## First Section',
      '## Second Section',
      '',
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const filePath = path.join(tmpDir, 'chained.md');
    await fs.writeFile(filePath, fileContent);

    // 1. Read review view
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, resolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    // 2. Extract coordinates for both headings
    const lines = readResult.content[0].text.split('\n');
    const first = extractCoordinate(lines.find(l => l.includes('## First Section'))!);
    const second = extractCoordinate(lines.find(l => l.includes('## Second Section'))!);
    expect(first.lineNum).toBe(3); // raw line 3
    expect(second.lineNum).toBe(4); // raw line 4

    // 3. First edit succeeds
    const result1 = await handleProposeChange(
      { file: filePath, at: `${first.lineNum}:${first.hash}`, op: '{==## First Section==}{>>marker', author: 'ai:test-agent' },
      resolver, state,
    );
    expect(result1.isError).toBeUndefined();

    // 4. Second edit: uses raw line 4 from original review read.
    //    After re-recording, hashes are stored with committed line numbers.
    //    Committed line 4 maps to a DIFFERENT raw line than the agent intended.
    const result2 = await handleProposeChange(
      { file: filePath, at: `${second.lineNum}:${second.hash}`, op: '{==## Second Section==}{>>marker', author: 'ai:test-agent' },
      resolver, state,
    );

    // BUG: result2.isError is true — "Hash mismatch at line 4 (review view)"
    // because re-recorded hashes use committed line numbers, not raw.
    expect(result2.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{==## First Section==}');
    expect(modified).toContain('{==## Second Section==}');
  });
});


describe('BUG: review view re-recording uses committed line numbers (classic mode)', () => {
  let tmpDir: string;
  let state: SessionState;
  let classicResolver: ConfigResolver;

  beforeAll(async () => { await initHashline(); });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-review-bug-classic-'));
    state = new SessionState();
    classicResolver = await createTestResolver(tmpDir, classicConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('second substitution fails after first edit re-records with committed line numbers', async () => {
    // Same bug as compact mode, but via the classic propose_change path.
    // The re-recording at propose-change.ts:1085 has the same
    // `viewResolved === 'review' || viewResolved === 'changes'` condition.
    const fileContent = [
      '# Title',
      '{++Pending insertion line A++}[^cn-1]',
      '{++Pending insertion line B++}[^cn-2]',
      '## First Heading',
      '## Second Heading',
      '',
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
      '[^cn-2]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const filePath = path.join(tmpDir, 'rerecord.md');
    await fs.writeFile(filePath, fileContent);

    // 1. Read review view — raw line numbers
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'review' }, classicResolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    const lines = readResult.content[0].text.split('\n');
    const first = extractCoordinate(lines.find(l => l.includes('## First Heading'))!);
    const second = extractCoordinate(lines.find(l => l.includes('## Second Heading'))!);
    expect(first.lineNum).toBe(4); // raw line 4
    expect(second.lineNum).toBe(5); // raw line 5

    // 2. First edit succeeds
    const result1 = await handleProposeChange(
      {
        file: filePath, old_text: '## First Heading', new_text: '## First Heading (edited)',
        start_line: first.lineNum, start_hash: first.hash, reason: 'test',
      },
      classicResolver, state,
    );
    expect(result1.isError).toBeUndefined();

    // After first edit, re-recording at line 1085 enters the
    // `viewResolved === 'review'` branch, calls computeCommittedView(),
    // and stores committed line numbers. The two pending insertions on
    // lines 2-3 are collapsed, so "## Second Heading" is committed line 3,
    // not raw line 5 as the agent expects.

    // 3. Second edit using old review coordinates
    const result2 = await handleProposeChange(
      {
        file: filePath, old_text: '## Second Heading', new_text: '## Second Heading (edited)',
        start_line: second.lineNum, start_hash: second.hash, reason: 'test',
      },
      classicResolver, state,
    );

    // BUG: result2.isError is true — "Hash mismatch at line 5"
    // because re-recorded hashes have line=3 for "## Second Heading"
    // (committed), but the agent sent line=5 (raw from review view).
    expect(result2.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~## First Heading~>## First Heading (edited)~~}');
    expect(modified).toContain('{~~## Second Heading~>## Second Heading (edited)~~}');
  });

  it('changes view chained edits work correctly (control group)', async () => {
    // Control: the same scenario using changes view should work because
    // changes view already uses committed line numbers, so re-recording
    // with committed numbers is consistent.
    const fileContent = [
      '# Title',
      '{++pending insertion++}[^cn-1]',
      '## First Target',
      '## Second Target',
      '',
      '[^cn-1]: @alice | 2026-02-17 | ins | proposed',
    ].join('\n');

    const compactResolver = await createTestResolver(tmpDir, compactConfig);
    const filePath = path.join(tmpDir, 'control.md');
    await fs.writeFile(filePath, fileContent);

    // Read changes view
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'changes' }, compactResolver, state,
    );
    expect(readResult.isError).toBeUndefined();

    const lines = readResult.content[0].text.split('\n');
    const first = extractCoordinate(lines.find(l => l.includes('## First Target'))!);
    const second = extractCoordinate(lines.find(l => l.includes('## Second Target'))!);

    // First edit
    const result1 = await handleProposeChange(
      { file: filePath, at: `${first.lineNum}:${first.hash}`, op: '{==## First Target==}{>>one', author: 'ai:test-agent' },
      compactResolver, state,
    );
    expect(result1.isError).toBeUndefined();

    // Second edit — changes view re-recording is consistent
    const result2 = await handleProposeChange(
      { file: filePath, at: `${second.lineNum}:${second.hash}`, op: '{==## Second Target==}{>>two', author: 'ai:test-agent' },
      compactResolver, state,
    );
    expect(result2.isError).toBeUndefined();

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{==## First Target==}');
    expect(modified).toContain('{==## Second Target==}');
  });
});
