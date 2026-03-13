import * as assert from 'node:assert';
import {
  parseAt,
  resolveAt,
  initHashline,
  computeLineHash,
} from '@changetracks/core/internals';

// ─── parseAt ─────────────────────────────────────────────────────────────────

describe('parseAt', () => {
  it('parses single line coordinate', () => {
    const result = parseAt('12:a1');
    assert.strictEqual(result.startLine, 12);
    assert.strictEqual(result.startHash, 'a1');
    assert.strictEqual(result.endLine, 12);
    assert.strictEqual(result.endHash, 'a1');
  });

  it('parses range coordinate', () => {
    const result = parseAt('3:ff-7:0a');
    assert.strictEqual(result.startLine, 3);
    assert.strictEqual(result.startHash, 'ff');
    assert.strictEqual(result.endLine, 7);
    assert.strictEqual(result.endHash, '0a');
  });

  it('throws on empty string', () => {
    assert.throws(() => parseAt(''), /empty/);
  });

  it('throws on invalid format', () => {
    assert.throws(() => parseAt('abc'), /Invalid at coordinate/);
  });

  it('throws on dual hash format with helpful message', () => {
    assert.throws(() => parseAt('5:ab.cd'), /Dual hashes/);
  });

  it('throws on dual hash in range', () => {
    assert.throws(() => parseAt('5:ab.cd-7:ef'), /dual hash/i);
  });

  it('throws when end line < start line', () => {
    assert.throws(() => parseAt('7:ab-3:cd'), /end line 3 < start line 7/);
  });

  it('accepts single-digit line number', () => {
    const result = parseAt('1:00');
    assert.strictEqual(result.startLine, 1);
    assert.strictEqual(result.startHash, '00');
  });
});

// ─── resolveAt ───────────────────────────────────────────────────────────────

describe('resolveAt', () => {
  before(async () => {
    await initHashline();
  });

  it('resolves a single line with correct hash', () => {
    const lines = ['first line', 'second line', 'third line'];
    const hash = computeLineHash(1, 'second line', lines);
    const result = resolveAt(`2:${hash}`, lines);
    assert.strictEqual(result.startLine, 2);
    assert.strictEqual(result.endLine, 2);
    assert.strictEqual(result.content, 'second line');
    // startOffset should be after "first line\n"
    assert.strictEqual(result.startOffset, 11);
    // endOffset should be at end of "second line"
    assert.strictEqual(result.endOffset, 22);
  });

  it('resolves a range with correct hashes', () => {
    const lines = ['line one', 'line two', 'line three', 'line four'];
    const hash2 = computeLineHash(1, 'line two', lines);
    const hash3 = computeLineHash(2, 'line three', lines);
    const result = resolveAt(`2:${hash2}-3:${hash3}`, lines);
    assert.strictEqual(result.startLine, 2);
    assert.strictEqual(result.endLine, 3);
    assert.strictEqual(result.content, 'line two\nline three');
  });

  it('throws on hash mismatch (stale coordinate)', () => {
    const lines = ['hello world'];
    const actualHash = computeLineHash(0, 'hello world', lines);
    // Use a valid hex hash that definitely differs from the actual
    const wrongHash = actualHash === '00' ? '01' : '00';
    assert.throws(
      () => resolveAt(`1:${wrongHash}`, lines),
      /Hash mismatch at line 1/,
    );
  });

  it('throws on line out of range', () => {
    const lines = ['only line'];
    assert.throws(
      () => resolveAt('5:ab', lines),
      /out of range/,
    );
  });

  it('throws on end line hash mismatch in range', () => {
    const lines = ['first', 'second', 'third'];
    const hash1 = computeLineHash(0, 'first', lines);
    const hash3 = computeLineHash(2, 'third', lines);
    // Use a valid hex hash that does not match the actual line 3 content
    const wrongHash = hash3 === '00' ? '01' : '00';
    assert.throws(
      () => resolveAt(`1:${hash1}-3:${wrongHash}`, lines),
      /Hash mismatch at line 3/,
    );
  });

  it('returns correct offsets for first line', () => {
    const lines = ['hello'];
    const hash = computeLineHash(0, 'hello', lines);
    const result = resolveAt(`1:${hash}`, lines);
    assert.strictEqual(result.startOffset, 0);
    assert.strictEqual(result.endOffset, 5);
  });
});
