import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  resolveCoordinates,
  applyCompactOp,
  resolveAndApply,
  SessionState,
  computeLineHash,
  initHashline,
  handleProposeChange,
  handleReadTrackedFile,
  ConfigResolver,
} from '@changetracks/mcp/internals';
import type { NormalizedCompactOp, ApplyResult, ChangeTracksConfig } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

beforeAll(async () => {
  await initHashline();
});

const FILE_PATH = '/tmp/test-resolve.md';

const config = { hashline: { enabled: true, auto_remap: true } };

function makeOp(at: string, overrides?: Partial<NormalizedCompactOp>): NormalizedCompactOp {
  return {
    at,
    type: 'ins',
    oldText: '',
    newText: 'new content',
    ...overrides,
  };
}

describe('resolveCoordinates — basic coordinate resolution', () => {
  it('resolves raw coordinates when no session state exists', () => {
    const fileLines = ['Line one', 'Line two', 'Line three'];
    const fileContent = fileLines.join('\n');

    // Compute real hash for line 2 (0-indexed: 1)
    const hash = computeLineHash(1, 'Line two', fileLines);
    const at = `2:${hash}`;

    const state = new SessionState(); // no recordAfterRead — no session state
    const op = makeOp(at);
    const result = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, config);

    expect(result.rawStartLine).toBe(2);
    expect(result.rawEndLine).toBe(2);
    expect(result.content).toBe('Line two');
    expect(result.relocations).toHaveLength(0);
    expect(result.remaps).toHaveLength(0);
    expect(result.viewResolved).toBeUndefined();
    expect(result.op).toBe(op);
  });

  it('computes correct character offsets for a single-line target', () => {
    const fileLines = ['abc', 'defg', 'hi'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(1, 'defg', fileLines);
    const at = `2:${hash}`;

    const state = new SessionState();
    const result = resolveCoordinates(makeOp(at), fileContent, fileLines, state, FILE_PATH, config);

    // startOffset: 'abc\n' = 4 chars
    expect(result.startOffset).toBe(4);
    // endOffset: 4 + 'defg' = 8
    expect(result.endOffset).toBe(8);
    expect(result.content).toBe('defg');
  });

  it('resolves a multi-line range', () => {
    const fileLines = ['alpha', 'beta', 'gamma', 'delta'];
    const fileContent = fileLines.join('\n');

    const startHash = computeLineHash(1, 'beta', fileLines);
    const endHash = computeLineHash(2, 'gamma', fileLines);
    const at = `2:${startHash}-3:${endHash}`;

    const state = new SessionState();
    const result = resolveCoordinates(makeOp(at, { type: 'del' }), fileContent, fileLines, state, FILE_PATH, config);

    expect(result.rawStartLine).toBe(2);
    expect(result.rawEndLine).toBe(3);
    expect(result.content).toBe('beta\ngamma');
    expect(result.relocations).toHaveLength(0);
    expect(result.remaps).toHaveLength(0);
  });
});

describe('resolveCoordinates — view-aware translation', () => {
  it('translates settled-view coordinates to raw line numbers', () => {
    // Simulate: agent read the file in 'settled' view.
    // In settled view, line 1 maps to raw line 3 (e.g., after accepting changes shrinks line count).
    const rawFileLines = ['Line one', 'Line two', 'Target line', 'Line four'];
    const rawFileContent = rawFileLines.join('\n');

    // Compute real hashes for the raw file
    const rawHash = computeLineHash(2, 'Target line', rawFileLines);
    // Simulate a settled-view hash that differs from raw hash (e.g., stripped content hash)
    // Use the same hash as raw for simplicity — the key is the rawLineNum mapping
    const settledViewHash = rawHash;

    // Build session state as if agent read in 'settled' view:
    // settled-view line 1 → rawLineNum 3
    const state = new SessionState();
    state.recordAfterRead(FILE_PATH, 'settled', [
      {
        line: 1,
        raw: rawHash,
        settled: rawHash,
        settledView: settledViewHash,
        rawLineNum: 3,
      },
    ], rawFileContent);

    // Agent submits coordinates using settled-view line 1 with the settledView hash
    const at = `1:${settledViewHash}`;
    const op = makeOp(at);
    const result = resolveCoordinates(op, rawFileContent, rawFileLines, state, FILE_PATH, config);

    // Should be translated to raw line 3
    expect(result.rawStartLine).toBe(3);
    expect(result.rawEndLine).toBe(3);
    expect(result.content).toBe('Target line');
    expect(result.viewResolved).toBe('settled');
  });

  it('passes through raw-view coordinates unchanged when hash matches', () => {
    const fileLines = ['hello', 'world'];
    const fileContent = fileLines.join('\n');

    const rawHash = computeLineHash(0, 'hello', fileLines);

    const state = new SessionState();
    state.recordAfterRead(FILE_PATH, 'raw', [
      { line: 1, raw: rawHash, settled: rawHash, rawLineNum: 1 },
    ], fileContent);

    const at = `1:${rawHash}`;
    const result = resolveCoordinates(makeOp(at), fileContent, fileLines, state, FILE_PATH, config);

    expect(result.rawStartLine).toBe(1);
    expect(result.viewResolved).toBe('raw');
  });
});

describe('resolveCoordinates — auto-relocation', () => {
  it('auto-relocates when line has drifted by 1 position', () => {
    // Original: 'Target line' was at line 2.
    // Now: a line was inserted before it, so 'Target line' is at line 3.
    const originalLines = ['Line one', 'Target line', 'Line three'];
    const currentLines = ['Line one', 'INSERTED', 'Target line', 'Line three'];
    const currentContent = currentLines.join('\n');

    // Hash computed in original context (line 2, 0-indexed: 1)
    const originalHash = computeLineHash(1, 'Target line', originalLines);
    const at = `2:${originalHash}`; // stale coordinate pointing to line 2

    const state = new SessionState(); // no session state (raw read)

    const result = resolveCoordinates(makeOp(at), currentContent, currentLines, state, FILE_PATH, config);

    // Should auto-relocate to line 3
    expect(result.rawStartLine).toBe(3);
    expect(result.rawEndLine).toBe(3);
    expect(result.content).toBe('Target line');
    expect(result.relocations).toHaveLength(1);
    expect(result.relocations[0]).toMatchObject({ param: 'start_line', from: 2, to: 3 });
    expect(result.remaps).toHaveLength(1);
    expect(result.remaps[0].originalRef).toBe(`2:${originalHash}`);
    expect(result.remaps[0].reason).toBe('auto_corrected');
  });

  it('returns empty relocations and remaps when hash matches exactly', () => {
    const fileLines = ['one', 'two', 'three'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(2, 'three', fileLines);
    const at = `3:${hash}`;

    const state = new SessionState();
    const result = resolveCoordinates(makeOp(at), fileContent, fileLines, state, FILE_PATH, config);

    expect(result.relocations).toHaveLength(0);
    expect(result.remaps).toHaveLength(0);
    expect(result.rawStartLine).toBe(3);
  });
});

// ── applyCompactOp tests ──────────────────────────────────────────────────────

const applyConfig = {
  protocol: { level: 2 },
  hashline: { enabled: true, auto_remap: true },
};

describe('applyCompactOp', () => {
  it('applies a substitution with CriticMarkup wrapping', async () => {
    const fileLines = ['The quick brown fox', 'jumps over the lazy dog'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(0, 'The quick brown fox', fileLines);
    const op: NormalizedCompactOp = {
      at: `1:${hash}`,
      type: 'sub',
      oldText: 'quick brown',
      newText: 'slow red',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, applyConfig);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-1', 'ai:test', applyConfig,
    );

    expect(result.changeType).toBe('sub');
    expect(result.modifiedText).toContain('{~~quick brown~>slow red~~}');
    expect(result.modifiedText).toContain('[^ct-1]');
    expect(result.supersededIds).toHaveLength(0);
    expect(result.settled).toBe(false);
    // Footnote should be appended
    expect(result.modifiedText).toContain('[^ct-1]:');
  });

  it('applies a deletion wrapping the target text', async () => {
    const fileLines = ['Hello world, this is a test'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(0, 'Hello world, this is a test', fileLines);
    const op: NormalizedCompactOp = {
      at: `1:${hash}`,
      type: 'del',
      oldText: 'world',
      newText: '',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, applyConfig);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-2', 'ai:test', applyConfig,
    );

    expect(result.changeType).toBe('del');
    expect(result.modifiedText).toContain('{--world--}');
    expect(result.modifiedText).toContain('[^ct-2]');
    // Original text around the deletion should still be present
    expect(result.modifiedText).toContain('Hello ');
    expect(result.modifiedText).toContain(', this is a test');
    // Footnote should be appended
    expect(result.modifiedText).toContain('[^ct-2]:');
  });

  it('applies an insertion after the target line', async () => {
    const fileLines = ['First line', 'Second line', 'Third line'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(0, 'First line', fileLines);
    const op: NormalizedCompactOp = {
      at: `1:${hash}`,
      type: 'ins',
      oldText: '',
      newText: 'inserted line',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, applyConfig);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-3', 'ai:test', applyConfig,
    );

    expect(result.changeType).toBe('ins');
    expect(result.modifiedText).toContain('{++inserted line++}');
    expect(result.modifiedText).toContain('[^ct-3]');
    // Insertion appears after the first line
    const lines = result.modifiedText.split('\n');
    const insertionLineIdx = lines.findIndex(l => l.includes('{++inserted line++}'));
    const firstLineIdx = lines.findIndex(l => l === 'First line');
    expect(insertionLineIdx).toBeGreaterThan(firstLineIdx);
    // Footnote should be appended
    expect(result.modifiedText).toContain('[^ct-3]:');
  });

  it('applies a whole-line deletion when oldText is empty', async () => {
    const fileLines = ['Keep this', 'Delete this line', 'Keep this too'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(1, 'Delete this line', fileLines);
    const op: NormalizedCompactOp = {
      at: `2:${hash}`,
      type: 'del',
      oldText: '',
      newText: '',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, applyConfig);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-4', 'ai:test', applyConfig,
    );

    expect(result.changeType).toBe('del');
    expect(result.modifiedText).toContain('{--Delete this line--}');
    expect(result.modifiedText).toContain('[^ct-4]');
  });

  it('applies a level 1 substitution with inline comment instead of footnote', async () => {
    const fileLines = ['The quick brown fox'];
    const fileContent = fileLines.join('\n');

    const l1Config = {
      protocol: { level: 1 },
      hashline: { enabled: true, auto_remap: true },
    };

    const hash = computeLineHash(0, 'The quick brown fox', fileLines);
    const op: NormalizedCompactOp = {
      at: `1:${hash}`,
      type: 'sub',
      oldText: 'quick brown',
      newText: 'slow red',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, l1Config);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-5', '@ai:test', l1Config,
    );

    expect(result.changeType).toBe('sub');
    expect(result.modifiedText).toContain('{~~quick brown~>slow red~~}');
    // Level 1: inline comment, not footnote ref
    expect(result.modifiedText).toContain('{>>@ai:test|');
    expect(result.modifiedText).toContain('|sub|proposed<<}');
    expect(result.modifiedText).not.toContain('[^ct-5]');
  });

  it('applies a comment at the end of the target line', async () => {
    const fileLines = ['This is a line with content'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(0, 'This is a line with content', fileLines);
    const op: NormalizedCompactOp = {
      at: `1:${hash}`,
      type: 'comment',
      oldText: '',
      newText: '',
      reasoning: 'This needs clarification',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, applyConfig);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-6', 'ai:test', applyConfig,
    );

    expect(result.changeType).toBe('comment');
    expect(result.modifiedText).toContain('{>>This needs clarification<<}');
    expect(result.modifiedText).toContain('[^ct-6]');
    // Comment should appear at end of the line
    expect(result.modifiedText).toContain('This is a line with content{>>This needs clarification<<}[^ct-6]');
  });

  it('applies a highlight wrapping the matched sub-line text', async () => {
    const fileLines = ['The quick brown fox jumps'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(0, 'The quick brown fox jumps', fileLines);
    const op: NormalizedCompactOp = {
      at: `1:${hash}`,
      type: 'highlight',
      oldText: 'quick brown fox',
      newText: '',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, applyConfig);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-7', 'ai:test', applyConfig,
    );

    expect(result.changeType).toBe('highlight');
    expect(result.modifiedText).toContain('{==quick brown fox==}');
    expect(result.modifiedText).toContain('[^ct-7]');
    expect(result.modifiedText).toContain('[^ct-7]:');
  });

  it('settle-on-demand: settles accepted markup when target line overlaps it', async () => {
    // File content with an already-accepted substitution on the target line.
    // settle-on-demand fires when the op's target region overlaps accepted/rejected markup.
    // The target line contains the accepted {~~...~~} markup itself.
    const fileContent = [
      '# Document',
      '{~~old text~>new text~~}[^ct-1] extra words',
      'Another line',
      '',
      '[^ct-1]: @ai:test | 2026-01-01 | sub | accepted',
    ].join('\n');

    const fileLines = fileContent.split('\n');
    // Line 2 contains the accepted markup + "extra words"
    const hash = computeLineHash(1, '{~~old text~>new text~~}[^ct-1] extra words', fileLines);
    const op: NormalizedCompactOp = {
      at: `2:${hash}`,
      type: 'del',
      oldText: 'extra',
      newText: '',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, applyConfig);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-8', 'ai:test', applyConfig,
    );

    // The result should have the deletion markup
    expect(result.changeType).toBe('del');
    expect(result.modifiedText).toContain('{--extra--}');
    // settled should be true because there was accepted markup overlapping the target
    expect(result.settled).toBe(true);
  });

  it('returns affectedStartLine and affectedEndLine matching the target', async () => {
    const fileLines = ['line 1', 'line 2', 'line 3'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(1, 'line 2', fileLines);
    const op: NormalizedCompactOp = {
      at: `2:${hash}`,
      type: 'sub',
      oldText: 'line 2',
      newText: 'replaced',
    };

    const state = new SessionState();
    const resolved = resolveCoordinates(op, fileContent, fileLines, state, FILE_PATH, applyConfig);
    const result: ApplyResult = await applyCompactOp(
      resolved, op, fileContent, fileLines, 'ct-9', 'ai:test', applyConfig,
    );

    expect(result.affectedStartLine).toBe(2);
    expect(result.affectedEndLine).toBe(2);
  });
});

describe('resolveAndApply convenience wrapper', () => {
  it('resolves coordinates and applies markup in one call', async () => {
    const fileLines = ['The quick brown fox', 'jumps over the lazy dog'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(0, 'The quick brown fox', fileLines);
    const op: NormalizedCompactOp = {
      at: `1:${hash}`,
      type: 'sub',
      oldText: 'quick brown',
      newText: 'slow red',
    };

    const state = new SessionState();
    const fullConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked' as const, auto_header: false },
      author: { default: 'ai:test', enforcement: 'optional' as const },
      hooks: { enforcement: 'warn' as const, exclude: [] },
      matching: { mode: 'normalized' as const },
      hashline: { enabled: true, auto_remap: true },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net' as const, creation_tracking: 'footnote' as const },
      protocol: { mode: 'compact' as const, level: 2 as const, reasoning: 'optional' as const, batch_reasoning: 'required' as const },
      review: { reasonRequired: { human: false, agent: false } },
    };

    const result = await resolveAndApply(
      op, fileContent, fileLines, state, FILE_PATH, fullConfig, 'ct-1', 'ai:test',
    );

    expect(result.changeType).toBe('sub');
    expect(result.modifiedText).toContain('{~~quick brown~>slow red~~}');
    expect(result.modifiedText).toContain('[^ct-1]');
    expect(result.modifiedText).toContain('[^ct-1]:');
    expect(result.supersededIds).toHaveLength(0);
    expect(result.settled).toBe(false);
  });

  it('end-to-end: from at string to modified text with insertion', async () => {
    const fileLines = ['# Title', '', 'First paragraph text.'];
    const fileContent = fileLines.join('\n');

    const hash = computeLineHash(2, 'First paragraph text.', fileLines);
    const op: NormalizedCompactOp = {
      at: `3:${hash}`,
      type: 'ins',
      oldText: '',
      newText: 'New paragraph after first.',
    };

    const state = new SessionState();
    const fullConfig = {
      tracking: { include: ['**/*.md'], exclude: [], default: 'tracked' as const, auto_header: false },
      author: { default: 'ai:test', enforcement: 'optional' as const },
      hooks: { enforcement: 'warn' as const, exclude: [] },
      matching: { mode: 'normalized' as const },
      hashline: { enabled: true, auto_remap: true },
      settlement: { auto_on_approve: true, auto_on_reject: true },
      policy: { mode: 'safety-net' as const, creation_tracking: 'footnote' as const },
      protocol: { mode: 'compact' as const, level: 2 as const, reasoning: 'optional' as const, batch_reasoning: 'required' as const },
      review: { reasonRequired: { human: false, agent: false } },
    };

    const result = await resolveAndApply(
      op, fileContent, fileLines, state, FILE_PATH, fullConfig, 'ct-1', 'ai:test',
    );

    expect(result.changeType).toBe('ins');
    expect(result.modifiedText).toContain('{++New paragraph after first.++}');
    expect(result.modifiedText).toContain('[^ct-1]');
    // Insertion goes after the target line
    const lines = result.modifiedText.split('\n');
    const targetIdx = lines.findIndex(l => l === 'First paragraph text.');
    const insertIdx = lines.findIndex(l => l.includes('{++New paragraph after first.++}'));
    expect(insertIdx).toBeGreaterThan(targetIdx);
  });
});

// ── Integration tests: full handler flow ─────────────────────────────────────

const integrationConfig: ChangeTracksConfig = {
  tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
  author: { default: 'ai:test', enforcement: 'optional' },
  hooks: { enforcement: 'warn', exclude: [] },
  matching: { mode: 'normalized' },
  hashline: { enabled: true, auto_remap: false },
  settlement: { auto_on_approve: true, auto_on_reject: true },
  policy: { mode: 'safety-net', creation_tracking: 'footnote', default_view: 'review', view_policy: 'suggest' },
  protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
  review: { reasonRequired: { human: false, agent: false } },
};

describe('settled-view batch (friction report scenario)', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;
  let state: SessionState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-test-'));
    resolver = await createTestResolver(tmpDir, integrationConfig);
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('batch with settled-view coordinates succeeds after prior proposals', async () => {
    // Step 1: Create a tracked file
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\n# Title\n\nLine A\n\nLine B\n\nLine C', 'utf-8');

    // Step 2: Read initial content and get hashes
    const initialContent = await fs.readFile(filePath, 'utf-8');

    // Step 3: Make a first proposal (changes raw file structure)
    const h4 = computeLineHash(3, 'Line A', initialContent.split('\n'));
    const firstResult = await handleProposeChange(
      { file: filePath, at: `4:${h4}`, op: '{~~Line A~>Modified A~~}{>>first edit', author: 'ai:test' },
      resolver, state,
    );
    expect(firstResult.isError).toBeFalsy();

    // Step 4: Read with settled view (agent would do this for next batch)
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'settled' },
      resolver, state,
    );
    expect(readResult.isError).toBeFalsy();

    // Step 5: Extract settled-view coordinates from the read result
    // An agent would parse the margin format "N:HH | content" to get line:hash pairs
    const readText = readResult.content[0].text;
    const readLines = readText.split('\n');

    const lineBEntry = readLines.find((l: string) => l.includes('Line B'));
    const lineCEntry = readLines.find((l: string) => l.includes('Line C'));
    expect(lineBEntry).toBeDefined();
    expect(lineCEntry).toBeDefined();

    const matchB = lineBEntry!.match(/(\d+):([0-9a-f]{2})/);
    const matchC = lineCEntry!.match(/(\d+):([0-9a-f]{2})/);
    expect(matchB).toBeDefined();
    expect(matchC).toBeDefined();

    const settledLineB = parseInt(matchB![1], 10);
    const settledHashB = matchB![2];
    const settledLineC = parseInt(matchC![1], 10);
    const settledHashC = matchC![2];

    // Step 6: Submit batch using settled-view coordinates (the friction report scenario)
    // These are NOT raw coordinates — they come from the settled view where
    // CriticMarkup is collapsed, so line numbers differ from raw.
    const batchResult = await handleProposeChange(
      {
        file: filePath,
        author: 'ai:test',
        changes: [
          { at: `${settledLineB}:${settledHashB}`, op: '{~~Line B~>Modified B~~}{>>batch edit 1' },
          { at: `${settledLineC}:${settledHashC}`, op: '{~~Line C~>Modified C~~}{>>batch edit 2' },
        ],
      },
      resolver, state,
    );

    expect(batchResult.isError).toBeFalsy();
    const finalContent = await fs.readFile(filePath, 'utf-8');
    expect(finalContent).toContain('Modified B');
    expect(finalContent).toContain('Modified C');
  });
});

describe('auto-relocation in compact single', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;
  let state: SessionState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-test-'));
    resolver = await createTestResolver(tmpDir, integrationConfig);
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('auto-relocates drifted line in single compact proposal', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    const content = '<!-- ctrcks.com/v1: tracked -->\n# Title\nNew line\nTarget line';
    await fs.writeFile(filePath, content, 'utf-8');

    // Hash of "Target line" at its true position (line index 3, 1-indexed line 4),
    // but we claim it's at line 3 — wrong line, right hash — should auto-relocate.
    const lines = content.split('\n');
    const targetHash = computeLineHash(3, 'Target line', lines);

    const result = await handleProposeChange(
      {
        file: filePath,
        at: `3:${targetHash}`, // wrong line number, correct hash
        op: '{~~Target line~>Changed~~}{>>relocated edit',
        author: 'ai:test',
      },
      resolver, state,
    );

    expect(result.isError).toBeFalsy();
    const finalContent = await fs.readFile(filePath, 'utf-8');
    expect(finalContent).toContain('Changed');
  });
});

// ── Spec test case 2: committed-view batch ────────────────────────────────────

describe('committed-view batch (spec test case 2)', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;
  let state: SessionState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-committed-batch-'));
    resolver = await createTestResolver(tmpDir, integrationConfig);
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('batch with committed-view read succeeds after prior proposals', async () => {
    // Step 1: Create a tracked file with some pending markup
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(
      filePath,
      '<!-- ctrcks.com/v1: tracked -->\n# Title\n\nLine A\n\nLine B\n\nLine C',
      'utf-8',
    );

    // Step 2: Make a first proposal that mutates the file
    const initialContent = await fs.readFile(filePath, 'utf-8');
    const h4 = computeLineHash(3, 'Line A', initialContent.split('\n'));
    const firstResult = await handleProposeChange(
      { file: filePath, at: `4:${h4}`, op: '{~~Line A~>Modified A~~}{>>first edit', author: 'ai:test' },
      resolver, state,
    );
    expect(firstResult.isError).toBeFalsy();

    // Step 3: Read with committed view (seeds session state with committed hashes)
    const readResult = await handleReadTrackedFile(
      { file: filePath, view: 'committed' },
      resolver, state,
    );
    expect(readResult.isError).toBeFalsy();

    // Step 4: Extract committed-view coordinates from the read result
    const readText = readResult.content[0].text;
    const readLines = readText.split('\n');

    const lineBEntry = readLines.find((l: string) => l.includes('Line B'));
    const lineCEntry = readLines.find((l: string) => l.includes('Line C'));
    expect(lineBEntry).toBeDefined();
    expect(lineCEntry).toBeDefined();

    const matchB = lineBEntry!.match(/(\d+):([0-9a-f]{2})/);
    const matchC = lineCEntry!.match(/(\d+):([0-9a-f]{2})/);
    expect(matchB).toBeDefined();
    expect(matchC).toBeDefined();

    const committedLineB = parseInt(matchB![1], 10);
    const committedHashB = matchB![2];
    const committedLineC = parseInt(matchC![1], 10);
    const committedHashC = matchC![2];

    // Step 5: Submit batch using committed-view coordinates
    const batchResult = await handleProposeChange(
      {
        file: filePath,
        author: 'ai:test',
        changes: [
          { at: `${committedLineB}:${committedHashB}`, op: '{~~Line B~>Modified B~~}{>>batch edit 1' },
          { at: `${committedLineC}:${committedHashC}`, op: '{~~Line C~>Modified C~~}{>>batch edit 2' },
        ],
      },
      resolver, state,
    );

    expect(batchResult.isError).toBeFalsy();
    const finalContent = await fs.readFile(filePath, 'utf-8');
    expect(finalContent).toContain('Modified B');
    expect(finalContent).toContain('Modified C');
  });
});

// ── Spec test case 4: classic mode no-hashline-leakage ───────────────────────

describe('classic mode no-hashline-leakage (spec test case 4)', () => {
  let tmpDir: string;
  let state: SessionState;

  const classicConfig: ChangeTracksConfig = {
    tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
    author: { default: 'ai:test', enforcement: 'optional' },
    hooks: { enforcement: 'warn', exclude: [] },
    matching: { mode: 'normalized' },
    hashline: { enabled: false, auto_remap: false },
    settlement: { auto_on_approve: true, auto_on_reject: true },
    policy: { mode: 'safety-net', creation_tracking: 'footnote' },
    protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
    review: { reasonRequired: { human: false, agent: false } },
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-classic-noleak-'));
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('classic mode with hashline.enabled=false rejects start_line/start_hash params cleanly', async () => {
    const resolver = await createTestResolver(tmpDir, classicConfig);
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(filePath, '<!-- ctrcks.com/v1: tracked -->\nSome text here.\n', 'utf-8');

    // Submit propose_change with old_text/new_text AND extra start_line/start_hash params.
    // With hashline.enabled=false, the handler must reject hashline params — not silently process.
    const result = await handleProposeChange(
      {
        file: filePath,
        old_text: 'Some text here.',
        new_text: 'Updated text.',
        start_line: 2,
        start_hash: 'ab',
        author: 'ai:test',
      },
      resolver, state,
    );

    // Must error or at minimum not silently process the hashline params.
    // The HASHLINE_DISABLED error is the expected clean rejection.
    expect(result.isError).toBe(true);
    const errorText = result.content[0].text;
    expect(errorText).toMatch(/hashline|disabled|requires/i);

    // File must be unchanged (no partial writes)
    const fileContent = await fs.readFile(filePath, 'utf-8');
    expect(fileContent).not.toContain('{~~');
    expect(fileContent).toContain('Some text here.');
  });
});

// ── Spec test case 5: settle-on-demand in batch ───────────────────────────────

describe('settle-on-demand in batch (spec test case 5)', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;
  let state: SessionState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-settle-batch-'));
    resolver = await createTestResolver(tmpDir, integrationConfig);
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('settlement happens before application when batch op targets accepted markup', async () => {
    // Create a file with an already-accepted substitution on one of the target lines
    const filePath = path.join(tmpDir, 'test.md');
    const fileContent = [
      '<!-- ctrcks.com/v1: tracked -->',
      '# Document',
      '{~~old text~>new text~~}[^ct-1] extra words',
      'Clean line',
      '',
      '[^ct-1]: @ai:test | 2026-01-01 | sub | accepted',
    ].join('\n');
    await fs.writeFile(filePath, fileContent, 'utf-8');

    // Compute hash for line 4 (Clean line) — the batch will target this clean line
    const lines = fileContent.split('\n');
    const cleanLineIdx = lines.findIndex(l => l === 'Clean line');
    const hClean = computeLineHash(cleanLineIdx, 'Clean line', lines);

    // Compute hash for line 3 (the line with accepted markup)
    const acceptedLineIdx = lines.findIndex(l => l.includes('{~~old text'));
    const hAccepted = computeLineHash(acceptedLineIdx, lines[acceptedLineIdx], lines);

    // Submit a batch that targets both lines
    const batchResult = await handleProposeChange(
      {
        file: filePath,
        author: 'ai:test',
        changes: [
          { at: `${cleanLineIdx + 1}:${hClean}`, op: '{~~Clean line~>Modified line~~}{>>batch op' },
          { at: `${acceptedLineIdx + 1}:${hAccepted}`, op: '{--extra words--}{>>removing extras' },
        ],
      },
      resolver, state,
    );

    // The batch should succeed (settlement happens before application)
    expect(batchResult.isError).toBeFalsy();
    const finalContent = await fs.readFile(filePath, 'utf-8');
    // The clean-line op should have applied
    expect(finalContent).toContain('Modified line');
  });
});

// ── Spec regression 1: batch atomicity ────────────────────────────────────────

describe('batch atomicity regression (spec regression 1)', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;
  let state: SessionState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-atomicity-'));
    resolver = await createTestResolver(tmpDir, integrationConfig);
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('file is unchanged when any op in the batch fails (atomic rollback)', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    const fileContent = '<!-- ctrcks.com/v1: tracked -->\nFirst line\nSecond line\nThird line';
    await fs.writeFile(filePath, fileContent, 'utf-8');

    const lines = fileContent.split('\n');
    // Valid hash for line 2 (First line)
    const h2 = computeLineHash(1, 'First line', lines);
    // Invalid hash for line 3 — this will cause a hash mismatch error
    const badHash = 'zz';

    const batchResult = await handleProposeChange(
      {
        file: filePath,
        author: 'ai:test',
        changes: [
          { at: `2:${h2}`, op: '{~~First line~>Line 1~~}{>>valid op' },
          { at: `3:${badHash}`, op: '{~~Second line~>Line 2~~}{>>invalid hash' },
        ],
      },
      resolver, state,
    );

    // Batch must fail (second op has bad hash)
    expect(batchResult.isError).toBe(true);

    // File must be UNCHANGED — no partial writes (atomicity)
    const afterContent = await fs.readFile(filePath, 'utf-8');
    expect(afterContent).toBe(fileContent);
    expect(afterContent).not.toContain('{~~');
    expect(afterContent).toContain('First line');
    expect(afterContent).toContain('Second line');
  });
});

// ── Spec regression 2: batch delta tracking ───────────────────────────────────

describe('batch delta tracking regression (spec regression 2)', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;
  let state: SessionState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-delta-'));
    resolver = await createTestResolver(tmpDir, integrationConfig);
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('second op applies correctly after first op shifts line numbers', async () => {
    // File has 3 lines. Op 1 inserts a new line after line 2 (shifting line 3 to line 4).
    // Op 2 targets line 3 using its original pre-batch hash.
    // Server must track the line delta so op 2 resolves to the correct (shifted) position.
    const filePath = path.join(tmpDir, 'test.md');
    const fileContent = '<!-- ctrcks.com/v1: tracked -->\nAlpha line\nBeta line';
    await fs.writeFile(filePath, fileContent, 'utf-8');

    const lines = fileContent.split('\n');
    // Hash for line 2 (Alpha line) — op 1 inserts after this line
    const hAlpha = computeLineHash(1, 'Alpha line', lines);
    // Hash for line 3 (Beta line) — op 2 substitutes this line
    const hBeta = computeLineHash(2, 'Beta line', lines);

    const batchResult = await handleProposeChange(
      {
        file: filePath,
        author: 'ai:test',
        changes: [
          { at: `2:${hAlpha}`, op: '{++Inserted after Alpha++}{>>delta test op 1' },
          { at: `3:${hBeta}`, op: '{~~Beta line~>Modified Beta~~}{>>delta test op 2' },
        ],
      },
      resolver, state,
    );

    expect(batchResult.isError).toBeFalsy();
    const finalContent = await fs.readFile(filePath, 'utf-8');
    // Both ops should have applied
    expect(finalContent).toContain('{++Inserted after Alpha++}');
    expect(finalContent).toContain('Modified Beta');
  });
});

// ── Spec regression 3: change grouping ────────────────────────────────────────

describe('change grouping regression (spec regression 3)', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;
  let state: SessionState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-grouping-'));
    resolver = await createTestResolver(tmpDir, integrationConfig);
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('2-change compact batch produces dotted child IDs and a group parent footnote', async () => {
    const filePath = path.join(tmpDir, 'test.md');
    const fileContent = '<!-- ctrcks.com/v1: tracked -->\nFirst sentence.\nSecond sentence.';
    await fs.writeFile(filePath, fileContent, 'utf-8');

    const lines = fileContent.split('\n');
    const h2 = computeLineHash(1, 'First sentence.', lines);
    const h3 = computeLineHash(2, 'Second sentence.', lines);

    const batchResult = await handleProposeChange(
      {
        file: filePath,
        author: 'ai:test',
        changes: [
          { at: `2:${h2}`, op: '{~~First sentence.~>Edited first.~~}{>>change 1' },
          { at: `3:${h3}`, op: '{~~Second sentence.~>Edited second.~~}{>>change 2' },
        ],
      },
      resolver, state,
    );

    expect(batchResult.isError).toBeFalsy();
    const data = JSON.parse(batchResult.content[0].text);

    // Response should identify a group and two applied changes
    expect(data.group_id ?? data.group).toBeDefined();
    expect(data.applied).toHaveLength(2);

    const finalContent = await fs.readFile(filePath, 'utf-8');

    // Dotted child IDs must appear in file (ct-N.1 and ct-N.2)
    expect(finalContent).toMatch(/\[\^ct-\d+\.1\]/);
    expect(finalContent).toMatch(/\[\^ct-\d+\.2\]/);

    // Group parent footnote must appear (ct-N: ... group ... proposed)
    expect(finalContent).toMatch(/\[\^ct-\d+\]: @ai:test .* group .* proposed/);

    // Both substitutions must be present
    expect(finalContent).toContain('Edited first.');
    expect(finalContent).toContain('Edited second.');
  });
});

// ── Stage 2→3 fallthrough: session hash mismatch triggers auto-relocation ────

describe('session hash mismatch falls through to Stage 3 auto-relocation', () => {
  let tmpDir: string;
  let resolver: ConfigResolver;
  let state: SessionState;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-stage2-fallthrough-'));
    resolver = await createTestResolver(tmpDir, integrationConfig);
    state = new SessionState();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('stale session coordinates auto-relocate instead of throwing hash mismatch', async () => {
    // Step 1: Create a tracked file with 3 content lines
    const filePath = path.join(tmpDir, 'test.md');
    await fs.writeFile(
      filePath,
      '<!-- ctrcks.com/v1: tracked -->\n# Title\n\nLine A\n\nLine B\n\nTarget line',
      'utf-8',
    );

    // Step 2: Agent reads the file — seeds session state with hashes
    const readResult1 = await handleReadTrackedFile(
      { file: filePath, view: 'raw' },
      resolver, state,
    );
    expect(readResult1.isError).toBeFalsy();

    // Extract the hash for "Target line" from the read output (last content line)
    const readText1 = readResult1.content[0].text;
    const targetEntry = readText1.split('\n').find((l: string) => l.includes('Target line'));
    expect(targetEntry).toBeDefined();
    const targetMatch = targetEntry!.match(/(\d+):([0-9a-f]{2})/);
    expect(targetMatch).toBeDefined();
    const staleLineNum = parseInt(targetMatch![1], 10);
    const staleHash = targetMatch![2];

    // Step 3: Agent proposes a change that INSERTS lines before "Target line",
    // shifting it to a later line number. This makes the session hash table stale:
    // the session says line N has hash X, but after the insertion, line N has
    // different content and "Target line" (hash X) is now at line N+1.
    const initialContent = await fs.readFile(filePath, 'utf-8');
    const lines = initialContent.split('\n');
    const lineAIdx = lines.findIndex(l => l === 'Line A');
    const hLineA = computeLineHash(lineAIdx, 'Line A', lines);

    const insertResult = await handleProposeChange(
      {
        file: filePath,
        at: `${lineAIdx + 1}:${hLineA}`,
        op: '{++Inserted paragraph that shifts everything below++}{>>shifting insert',
        author: 'ai:test',
      },
      resolver, state,
    );
    expect(insertResult.isError).toBeFalsy();

    // Step 4: Agent proposes ANOTHER change using the STALE coordinates from Step 2.
    // The session hash table from Step 2 still has the old mapping for staleLineNum,
    // but the file has changed. Stage 2's resolveHash() returns { match: false }
    // because the supplied staleHash doesn't match the session table entry for
    // staleLineNum (that line now has different content after the insertion).
    //
    // Before the fix: Stage 2 throws "Hash mismatch ... Re-read the file".
    // After the fix: Stage 2 falls through to Stage 3, which scans the whole file
    // and finds "Target line" (with hash staleHash) at a new line number via
    // auto-relocation.
    const secondResult = await handleProposeChange(
      {
        file: filePath,
        at: `${staleLineNum}:${staleHash}`,
        op: '{~~Target line~>Modified target~~}{>>should auto-relocate',
        author: 'ai:test',
      },
      resolver, state,
    );

    if (secondResult.isError) {
      console.error('SECOND PROPOSE ERROR:', secondResult.content[0].text);
    }
    expect(secondResult.isError).toBeFalsy();
    const finalContent = await fs.readFile(filePath, 'utf-8');
    expect(finalContent).toContain('Modified target');
  });
});
