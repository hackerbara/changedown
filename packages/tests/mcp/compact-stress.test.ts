import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { handleProposeBatch } from '@changetracks/mcp/internals';
import { computeLineHash } from '@changetracks/mcp/internals';
import { parseOp, type ParsedOp } from '@changetracks/mcp/internals';
import { parseAt, resolveAt } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { createTestResolver } from './test-resolver.js';
import { ConfigResolver } from '@changetracks/mcp/internals';
import { initHashline } from '@changetracks/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

/** Helper: compute hash for a 1-indexed line in a file content string. */
function hashForLine(content: string, lineNum: number): string {
  const lines = content.split('\n');
  return computeLineHash(lineNum - 1, lines[lineNum - 1], lines);
}

/** Parse the JSON payload from a propose_change result. */
function parseResult(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

const compactConfig: ChangeTracksConfig = {
  tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
  author: { default: 'ai:stress-test', enforcement: 'optional' },
  hooks: { enforcement: 'warn', exclude: [] },
  matching: { mode: 'normalized' },
  hashline: { enabled: true, auto_remap: false },
  settlement: { auto_on_approve: true, auto_on_reject: true },
  policy: { mode: 'safety-net', creation_tracking: 'footnote' },
  protocol: { mode: 'compact', level: 2, reasoning: 'optional', batch_reasoning: 'optional' },
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. Op-parser edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('op-parser stress', () => {
  beforeAll(async () => {
    await initHashline();
  });

  it('splits on the first ~> for substitution', () => {
    // "{~~a~>b~>c~~}" should be old="a", new="b~>c" (split on first ~>)
    const result = parseOp('{~~a~>b~>c~~}');
    expect(result.type).toBe('sub');
    expect(result.oldText).toBe('a');
    expect(result.newText).toBe('b~>c');
    expect(result.reasoning).toBeUndefined();
  });

  it('splits on first ~> even with three occurrences', () => {
    const result = parseOp('{~~x~>y~>z~>w~~}');
    expect(result.type).toBe('sub');
    expect(result.oldText).toBe('x');
    expect(result.newText).toBe('y~>z~>w');
  });

  it('uses rightmost {>> for reasoning separation', () => {
    // "{~~old~>new with >>arrow~~}{>>the real reasoning"
    // splitReasoning splits on lastIndexOf("{>>") = the last {>>
    const result = parseOp('{~~old~>new with >>arrow~~}{>>the real reasoning');
    expect(result.type).toBe('sub');
    expect(result.reasoning).toBe('the real reasoning');
    // editPart is everything before the last {>>
    expect(result.oldText).toBe('old');
    // newText is from first ~> to closing ~~}
    expect(result.newText).toBe('new with >>arrow');
  });

  it('handles >> in old text of a substitution', () => {
    // "{~~a>>b~>c~~}{>>reasoning"
    // splitReasoning: lastIndexOf("{>>") = the one before "reasoning"
    const result = parseOp('{~~a>>b~>c~~}{>>reasoning');
    expect(result.type).toBe('sub');
    expect(result.oldText).toBe('a>>b');
    expect(result.newText).toBe('c');
    expect(result.reasoning).toBe('reasoning');
  });

  it('empty insertion produces insertion with empty newText', () => {
    // "{++++}{>>reasoning" — empty content between {++ and ++}
    const result = parseOp('{++++}{>>reasoning');
    expect(result.type).toBe('ins');
    expect(result.newText).toBe('');
    expect(result.reasoning).toBe('reasoning');
  });

  it('bare insertion without text produces insertion with empty newText and no reasoning', () => {
    const result = parseOp('{++++}');
    expect(result.type).toBe('ins');
    expect(result.newText).toBe('');
    expect(result.reasoning).toBeUndefined();
  });

  it('handles newlines in substitution text', () => {
    const result = parseOp('{~~line one\nline two~>line A\nline B\nline C~~}');
    expect(result.type).toBe('sub');
    expect(result.oldText).toBe('line one\nline two');
    expect(result.newText).toBe('line A\nline B\nline C');
  });

  it('handles special markdown characters in substitution', () => {
    const result = parseOp('{~~# Header **bold** [link](url)~>## New *italic* `code`~~}');
    expect(result.type).toBe('sub');
    expect(result.oldText).toBe('# Header **bold** [link](url)');
    expect(result.newText).toBe('## New *italic* `code`');
  });

  it('handles very long op string (1000+ chars)', () => {
    const longOld = 'x'.repeat(500);
    const longNew = 'y'.repeat(600);
    const result = parseOp(`{~~${longOld}~>${longNew}~~}`);
    expect(result.type).toBe('sub');
    expect(result.oldText).toBe(longOld);
    expect(result.newText).toBe(longNew);
    expect(result.oldText.length).toBe(500);
    expect(result.newText.length).toBe(600);
  });

  it('handles very long op with reasoning (1500+ chars total)', () => {
    const longOld = 'a'.repeat(500);
    const longNew = 'b'.repeat(500);
    const longReason = 'c'.repeat(500);
    const result = parseOp(`{~~${longOld}~>${longNew}~~}{>>${longReason}`);
    expect(result.type).toBe('sub');
    expect(result.oldText).toBe(longOld);
    expect(result.newText).toBe(longNew);
    expect(result.reasoning).toBe(longReason);
  });

  it('deletion of text containing special chars', () => {
    const result = parseOp('{--## Section with `code` and [link]--}');
    expect(result.type).toBe('del');
    expect(result.oldText).toBe('## Section with `code` and [link]');
  });

  it('insertion of text with backticks and brackets', () => {
    const result = parseOp('{++```js\nconsole.log("hello")\n```++}');
    expect(result.type).toBe('ins');
    expect(result.newText).toBe('```js\nconsole.log("hello")\n```');
  });

  it('substitution where old and new are identical throws no error in parser', () => {
    // Parser does not check for identity; that is a higher-level concern
    const result = parseOp('{~~same~>same~~}');
    expect(result.type).toBe('sub');
    expect(result.oldText).toBe('same');
    expect(result.newText).toBe('same');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 2. At-resolver edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('at-resolver stress', () => {
  beforeAll(async () => {
    await initHashline();
  });

  it('resolves hash at line 1 (file boundary)', () => {
    const lines = ['first line', 'second line'];
    const hash = computeLineHash(0, lines[0], lines);
    const result = resolveAt(`1:${hash}`, lines);
    expect(result.startLine).toBe(1);
    expect(result.startOffset).toBe(0);
    expect(result.content).toBe('first line');
  });

  it('resolves hash at last line of file', () => {
    const lines = ['first', 'second', 'third', 'last line'];
    const hash = computeLineHash(3, lines[3], lines);
    const result = resolveAt(`4:${hash}`, lines);
    expect(result.startLine).toBe(4);
    expect(result.endLine).toBe(4);
    expect(result.content).toBe('last line');
  });

  it('resolves range spanning entire file', () => {
    const lines = ['alpha', 'beta', 'gamma'];
    const h1 = computeLineHash(0, lines[0], lines);
    const h3 = computeLineHash(2, lines[2], lines);
    const result = resolveAt(`1:${h1}-3:${h3}`, lines);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(3);
    expect(result.content).toBe('alpha\nbeta\ngamma');
  });

  it('resolves single-char line content', () => {
    const lines = ['a'];
    const hash = computeLineHash(0, lines[0], lines);
    const result = resolveAt(`1:${hash}`, lines);
    expect(result.content).toBe('a');
    expect(result.endOffset - result.startOffset).toBe(1);
  });

  it('resolves empty line content', () => {
    const lines = ['non-empty', '', 'also-non-empty'];
    const hash = computeLineHash(1, lines[1], lines);
    const result = resolveAt(`2:${hash}`, lines);
    expect(result.content).toBe('');
    expect(result.endOffset - result.startOffset).toBe(0);
  });

  it('throws on line number beyond file length', () => {
    const lines = ['only one line'];
    expect(() => resolveAt('5:ab', lines)).toThrow(/out of range/i);
  });

  it('throws on line 0 (lines are 1-indexed)', () => {
    const lines = ['first'];
    expect(() => resolveAt('0:ab', lines)).toThrow(/out of range/i);
  });

  it('parseAt rejects non-hex hash', () => {
    expect(() => parseAt('1:zz')).toThrow(/invalid/i);
  });

  it('parseAt rejects hash with uppercase hex', () => {
    // Regex requires lowercase [0-9a-f]{2}
    expect(() => parseAt('1:AB')).toThrow(/invalid/i);
  });

  it('parseAt rejects hash with 1 char', () => {
    expect(() => parseAt('1:a')).toThrow(/invalid/i);
  });

  it('parseAt rejects hash with 3 chars', () => {
    expect(() => parseAt('1:abc')).toThrow(/invalid/i);
  });

  it('hash collision scenario: two lines produce same hash', () => {
    // With only 256 possible hash values (2 hex chars), we can brute-force a collision.
    // Generate lines until two share a hash, then verify resolveAt still works
    // for each line individually (collision does not cause wrong-line resolution
    // because the line number is also used).
    const lines: string[] = [];
    const hashToLine = new Map<string, number>();
    let collisionFound = false;
    let collidingLineA = 0;
    let collidingLineB = 0;

    for (let i = 0; i < 300; i++) {
      const lineContent = `test line content ${i}`;
      lines.push(lineContent);
      const h = computeLineHash(i, lineContent, lines);
      if (hashToLine.has(h)) {
        collidingLineA = hashToLine.get(h)!;
        collidingLineB = i;
        collisionFound = true;
        break;
      }
      hashToLine.set(h, i);
    }

    // With 300 lines and 256 hash values, a collision is guaranteed by pigeonhole
    expect(collisionFound).toBe(true);

    // Both lines resolve correctly because line number + hash are checked together
    const hashA = computeLineHash(collidingLineA, lines[collidingLineA], lines);
    const hashB = computeLineHash(collidingLineB, lines[collidingLineB], lines);
    expect(hashA).toBe(hashB); // They collide

    const resultA = resolveAt(`${collidingLineA + 1}:${hashA}`, lines);
    expect(resultA.content).toBe(lines[collidingLineA]);

    const resultB = resolveAt(`${collidingLineB + 1}:${hashB}`, lines);
    expect(resultB.content).toBe(lines[collidingLineB]);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 3. Propose_change compact edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('propose_change compact stress', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-compact-stress-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('substitution at first line of file', async () => {
    const content = 'first line\nsecond line\nthird line';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~first~>FIRST~~}' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~first~>FIRST~~}');
    expect(modified).toContain(' line\nsecond');
  });

  it('substitution at last line of file', async () => {
    const content = 'line one\nline two\nline three';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 3);
    const result = await handleProposeChange(
      { file: filePath, at: `3:${hash}`, op: '{~~three~>THREE~~}' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~three~>THREE~~}');
  });

  it('deletion of entire single-line file content', async () => {
    const content = 'only content here';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{--only content here--}' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{--only content here--}');
    expect(modified).toContain('[^ct-1]');
  });

  it('insertion at end of file (after last line)', async () => {
    const content = 'first line\nlast line';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 2);
    const result = await handleProposeChange(
      { file: filePath, at: `2:${hash}`, op: '{++\nnew final line++}' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{++');
    expect(modified).toContain('new final line');
  });

  it('op with Unicode text (smart quotes, em dashes, accented chars)', async () => {
    const content = 'He said "hello" -- and left';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~hello~>h\u00e9llo~~}' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~hello~>h\u00e9llo~~}');
  });

  it('op with CJK characters', async () => {
    const content = 'The meeting is \u660e\u5929';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~\u660e\u5929~>\u4eca\u5929~~}' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~\u660e\u5929~>\u4eca\u5929~~}');
  });

  it('substitution that makes line much longer', async () => {
    const content = 'short';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const longReplacement = 'a very long replacement string '.repeat(50).trim();
    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: `{~~short~>${longReplacement}~~}` },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain(`{~~short~>${longReplacement}~~}`);
  });

  it('substitution that makes line much shorter (to single char)', async () => {
    const content = 'this is a very long line with many words and characters';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~this is a very long line with many words and characters~>x~~}' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~this is a very long line with many words and characters~>x~~}');
  });

  it('old_text appears multiple times in target line raises ambiguity error', async () => {
    const content = 'the the the the';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);

    // findUniqueMatch throws for ambiguous matches; the outer try/catch
    // in handleProposeChange catches it and returns an isError result.
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~the~>THE~~}' },
      resolver, state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/multiple|ambiguous/i);
  });

  it('op with reasoning fallback from JSON param when op has no {>>', async () => {
    const content = 'old value';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{~~old value~>new value~~}', reason: 'json reasoning' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('json reasoning');
  });

  it('op {>> reasoning takes priority over JSON reasoning param', async () => {
    const content = 'old value';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      {
        file: filePath,
        at: `1:${hash}`,
        op: '{~~old value~>new value~~}{>>op reasoning',
        reason: 'json reasoning',
      },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('op reasoning');
    // JSON reasoning should NOT appear since op {>> takes priority
    expect(modified).not.toContain('json reasoning');
  });

  it('highlight op wraps text with == delimiters', async () => {
    const content = 'This section needs review here';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{==needs review==}{>>flagged for review' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{==needs review==}');
  });

  it('standalone comment op succeeds and inserts comment at line end', async () => {
    const content = 'some text';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const hash = hashForLine(content, 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '{>>this is a comment' },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.type).toBe('comment');

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{>>this is a comment<<}');
    expect(modified).toMatch(/\[\^ct-\d+\]:.*comment.*proposed/);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 4. Propose_batch compact stress
// ═══════════════════════════════════════════════════════════════════════════

describe('propose_batch compact stress', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-batch-stress-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('batch with 10+ operations', async () => {
    // Use unique identifiers per line: "item_01" .. "item_12" to avoid
    // ambiguity (e.g. "number 1" matching inside "number 10").
    const lines: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const padded = String(i).padStart(2, '0');
      lines.push(`line item_${padded}`);
    }
    const content = lines.join('\n');
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const changes = [];
    for (let i = 1; i <= 12; i++) {
      const padded = String(i).padStart(2, '0');
      const h = hashForLine(content, i);
      changes.push({ at: `${i}:${h}`, op: `{~~item_${padded}~>ITEM_${padded}~~}` });
    }

    const result = await handleProposeBatch(
      { file: filePath, reason: '12-op batch test', changes },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.applied).toHaveLength(12);

    const modified = await fs.readFile(filePath, 'utf-8');
    for (let i = 1; i <= 12; i++) {
      const padded = String(i).padStart(2, '0');
      expect(modified).toContain(`{~~item_${padded}~>ITEM_${padded}~~}`);
    }
  });

  it('batch mixing insertions and deletions', async () => {
    const content = 'alpha\nbeta\ngamma\ndelta';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h2 = hashForLine(content, 2);
    const h3 = hashForLine(content, 3);
    const h4 = hashForLine(content, 4);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'mixed ins/del batch',
        changes: [
          { at: `1:${h1}`, op: '{++inserted after alpha++}' },
          { at: `2:${h2}`, op: '{--beta--}' },
          { at: `3:${h3}`, op: '{++inserted after gamma++}' },
          { at: `4:${h4}`, op: '{--delta--}' },
        ],
      },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.applied).toHaveLength(4);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{++inserted after alpha++}');
    expect(modified).toContain('{--beta--}');
    expect(modified).toContain('{++inserted after gamma++}');
    expect(modified).toContain('{--delta--}');
  });

  it('batch with all 3 op types (sub, ins, del)', async () => {
    const content = 'old text\ndelete me\nkeep this';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h2 = hashForLine(content, 2);
    const h3 = hashForLine(content, 3);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'all 3 types',
        changes: [
          { at: `1:${h1}`, op: '{~~old text~>new text~~}' },       // sub
          { at: `2:${h2}`, op: '{--delete me--}' },                // del
          { at: `3:${h3}`, op: '{++appended content++}' },         // ins
        ],
      },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.applied).toHaveLength(3);

    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~old text~>new text~~}');
    expect(modified).toContain('{--delete me--}');
    expect(modified).toContain('{++appended content++}');
  });

  it('batch creates correct dotted change IDs', async () => {
    const content = 'aaa\nbbb';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h2 = hashForLine(content, 2);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'dotted IDs',
        changes: [
          { at: `1:${h1}`, op: '{~~aaa~>AAA~~}' },
          { at: `2:${h2}`, op: '{~~bbb~>BBB~~}' },
        ],
      },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    // Batch creates a group (ct-1) with children (ct-1.1, ct-1.2)
    expect(data.group_id).toBe('ct-1');
    expect(data.applied[0].change_id).toBe('ct-1.1');
    expect(data.applied[1].change_id).toBe('ct-1.2');
  });

  it('batch with reasoning in individual ops via {>>', async () => {
    const content = 'timeout=30\nretries=0';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h2 = hashForLine(content, 2);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'config update',
        changes: [
          { at: `1:${h1}`, op: '{~~timeout=30~>timeout=60~~}{>>increase timeout' },
          { at: `2:${h2}`, op: '{~~retries=0~>retries=3~~}{>>add retry logic' },
        ],
      },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('increase timeout');
    expect(modified).toContain('add retry logic');
  });

  it('batch where earlier ops do not corrupt later ops (coordinate stability)', async () => {
    // Earlier substitutions change line content but should not break string matching for later ops
    const content = 'line A data\nline B data\nline C data';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);
    const h2 = hashForLine(content, 2);
    const h3 = hashForLine(content, 3);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'coordinate stability test',
        changes: [
          { at: `1:${h1}`, op: '{~~line A data~>LINE_A~~}' },  // changes line 1 content
          { at: `2:${h2}`, op: '{~~line B data~>LINE_B~~}' },  // changes line 2 content
          { at: `3:${h3}`, op: '{~~line C data~>LINE_C~~}' },  // changes line 3 content
        ],
      },
      resolver, state,
    );

    expect(result.isError).toBeUndefined();
    const modified = await fs.readFile(filePath, 'utf-8');
    expect(modified).toContain('{~~line A data~>LINE_A~~}');
    expect(modified).toContain('{~~line B data~>LINE_B~~}');
    expect(modified).toContain('{~~line C data~>LINE_C~~}');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 5. Error handling
// ═══════════════════════════════════════════════════════════════════════════

describe('compact error handling', () => {
  let tmpDir: string;
  let state: SessionState;
  let resolver: ConfigResolver;

  beforeAll(async () => {
    await initHashline();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-compact-err-'));
    state = new SessionState();
    resolver = await createTestResolver(tmpDir, compactConfig);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('invalid hash format in at (non-hex)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const result = await handleProposeChange(
      { file: filePath, at: '1:zz', op: '{++text++}' },
      resolver, state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/invalid/i);
  });

  it('at pointing to non-existent line', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'only one line');

    const result = await handleProposeChange(
      { file: filePath, at: '99:ab', op: '{++text++}' },
      resolver, state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/out of range/i);
  });

  it('op that cannot be parsed (no CriticMarkup delimiters)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const hash = hashForLine('content', 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: 'no prefix here' },
      resolver, state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/cannot parse/i);
  });

  it('at with correct format but wrong hash (file changed since read)', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'original content');

    // Compute hash for the original content
    const originalHash = hashForLine('original content', 1);

    // Now change the file content
    await fs.writeFile(filePath, 'modified content');

    const result = await handleProposeChange(
      { file: filePath, at: `1:${originalHash}`, op: '{~~original~>new~~}' },
      resolver, state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/hash mismatch|changed/i);
  });

  it('missing at param when op is provided', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const result = await handleProposeChange(
      { file: filePath, op: '{++text++}' },
      resolver, state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/at.*op|requires/i);
  });

  it('missing op param when at is provided', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const hash = hashForLine('content', 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}` },
      resolver, state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/at.*op|requires/i);
  });

  it('empty op string returns parse error', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, 'content');

    const hash = hashForLine('content', 1);
    const result = await handleProposeChange(
      { file: filePath, at: `1:${hash}`, op: '' },
      resolver, state,
    );

    // Empty op string: handleCompactProposeChange checks `if (!at || !op)` — empty string is falsy
    expect(result.isError).toBe(true);
  });

  it('batch error: invalid at in second operation — partial success applies valid ops', async () => {
    const content = 'line one\nline two';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h1 = hashForLine(content, 1);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'partial success',
        changes: [
          { at: `1:${h1}`, op: '{~~one~>ONE~~}' },
          { at: '99:ab', op: '{++text++}' },       // bad line number — fails
        ],
      },
      resolver, state,
    );

    // Partial success: one op succeeded
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied.length).toBe(1);
    expect(data.failed.length).toBe(1);

    // File changed by the successful operation
    const fileAfter = await fs.readFile(filePath, 'utf-8');
    expect(fileAfter).toContain('ONE');
  });

  it('batch error: wrong hash in first operation — partial success applies valid ops', async () => {
    const content = 'line one\nline two';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const result = await handleProposeBatch(
      {
        file: filePath,
        reason: 'partial success',
        changes: [
          { at: '1:ff', op: '{~~one~>ONE~~}' },  // wrong hash — fails
          { at: `2:${hashForLine(content, 2)}`, op: '{~~two~>TWO~~}' },  // succeeds
        ],
      },
      resolver, state,
    );

    // Partial success: not an error since one op succeeded
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.applied.length).toBe(1);
    expect(data.failed.length).toBe(1);

    // File changed by the successful operation
    const fileAfter = await fs.readFile(filePath, 'utf-8');
    expect(fileAfter).toContain('TWO');
  });

  it('at range where end_line < start_line is rejected', async () => {
    const content = 'aaa\nbbb\nccc';
    const filePath = path.join(tmpDir, 'doc.md');
    await fs.writeFile(filePath, content);

    const h3 = hashForLine(content, 3);
    const h1 = hashForLine(content, 1);

    const result = await handleProposeChange(
      { file: filePath, at: `3:${h3}-1:${h1}`, op: '{~~aaa~>AAA~~}' },
      resolver, state,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/end line.*start line|invalid/i);
  });
});
