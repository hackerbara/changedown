import * as assert from 'node:assert';
import { annotateSidecar, AnnotationMetadata } from '@changetracks/core/internals';

describe('Sidecar Annotator - annotateSidecar', () => {

  // ─── no differences ──────────────────────────────────────────────

  describe('no differences', () => {
    it('returns unchanged text when old and new are identical', () => {
      const text = 'x = 1\ny = 2\n';
      assert.strictEqual(annotateSidecar(text, text, 'python'), text);
    });

    it('returns unchanged text for identical empty strings', () => {
      assert.strictEqual(annotateSidecar('', '', 'typescript'), '');
    });
  });

  // ─── unsupported language ────────────────────────────────────────

  describe('unsupported language', () => {
    it('returns undefined for markdown', () => {
      assert.strictEqual(annotateSidecar('old', 'new', 'markdown'), undefined);
    });

    it('returns undefined for unknown language', () => {
      assert.strictEqual(annotateSidecar('old', 'new', 'brainfuck'), undefined);
    });
  });

  // ─── simple insertion ────────────────────────────────────────────

  describe('simple insertion', () => {
    it('annotates a single inserted line with ct-N tag and sidecar block', () => {
      const old = 'x = 1\ny = 2\n';
      const now = 'x = 1\nz = 3\ny = 2\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      // The inserted line gets an insertion tag
      assert.ok(result!.includes('z = 3  # ct-1'), `Expected insertion tag in: ${result}`);
      // Sidecar block exists with ins entry
      assert.ok(result!.includes('# -- ChangeTracks'), `Expected sidecar header in: ${result}`);
      assert.ok(result!.includes('# [^ct-1]: ins | pending'), `Expected sidecar entry in: ${result}`);
    });
  });

  // ─── simple deletion ─────────────────────────────────────────────

  describe('simple deletion', () => {
    it('annotates a single deleted line with deletion marker and sidecar block', () => {
      const old = 'x = 1\ny = 2\nz = 3\n';
      const now = 'x = 1\nz = 3\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      // The deleted line becomes a commented deletion marker
      assert.ok(result!.includes('# - y = 2  # ct-1'), `Expected deletion marker in: ${result}`);
      // Sidecar block has del entry
      assert.ok(result!.includes('# [^ct-1]: del | pending'), `Expected sidecar entry in: ${result}`);
    });
  });

  // ─── substitution ────────────────────────────────────────────────

  describe('substitution', () => {
    it('annotates a changed line as deletion + insertion with same ct-N tag', () => {
      const old = 'x = 1\nresults = []\nz = 3\n';
      const now = 'x = 1\nresults = {}\nz = 3\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      // Deletion line for old value + insertion line for new value, same tag
      assert.ok(result!.includes('# - results = []  # ct-1'), `Expected deletion marker in: ${result}`);
      assert.ok(result!.includes('results = {}  # ct-1'), `Expected insertion tag in: ${result}`);
      // Sidecar block has sub entry
      assert.ok(result!.includes('# [^ct-1]: sub | pending'), `Expected sidecar entry in: ${result}`);
    });
  });

  // ─── TypeScript comment syntax ───────────────────────────────────

  describe('TypeScript comment syntax', () => {
    it('uses // for TypeScript files', () => {
      const old = 'const x = 1;\nconst y = 2;\n';
      const now = 'const x = 1;\nconst z = 3;\nconst y = 2;\n';
      const result = annotateSidecar(old, now, 'typescript');
      assert.ok(result !== undefined);

      // Uses // comment syntax
      assert.ok(result!.includes('const z = 3;  // ct-1'), `Expected TS insertion tag in: ${result}`);
      assert.ok(result!.includes('// -- ChangeTracks'), `Expected TS sidecar header in: ${result}`);
      assert.ok(result!.includes('// [^ct-1]: ins | pending'), `Expected TS sidecar entry in: ${result}`);
    });
  });

  // ─── multi-line substitution ─────────────────────────────────────

  describe('multi-line substitution', () => {
    it('handles multi-line removed+added as substitution', () => {
      const old = 'a = 1\nb = 2\nc = 3\nd = 4\n';
      const now = 'a = 1\nx = 10\ny = 20\nd = 4\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      // Both old lines become deletion markers, both new lines get insertion tags
      assert.ok(result!.includes('# - b = 2  # ct-1'), `Expected first deletion in: ${result}`);
      assert.ok(result!.includes('# - c = 3  # ct-1'), `Expected second deletion in: ${result}`);
      assert.ok(result!.includes('x = 10  # ct-1'), `Expected first insertion in: ${result}`);
      assert.ok(result!.includes('y = 20  # ct-1'), `Expected second insertion in: ${result}`);
      // Single sub entry in sidecar
      assert.ok(result!.includes('# [^ct-1]: sub | pending'), `Expected sidecar sub entry in: ${result}`);
    });
  });

  // ─── indentation preservation ────────────────────────────────────

  describe('indentation preservation', () => {
    it('preserves indentation in deletion lines', () => {
      const old = 'def foo():\n    x = 1\n    y = 2\n';
      const now = 'def foo():\n    y = 2\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      // Indentation preserved: "    # - x = 1  # ct-1"
      assert.ok(result!.includes('    # - x = 1  # ct-1'), `Expected indented deletion in: ${result}`);
    });
  });

  // ─── metadata in sidecar block ───────────────────────────────────

  describe('metadata', () => {
    it('includes author and date in sidecar block when provided', () => {
      const old = 'x = 1\n';
      const now = 'y = 2\n';
      const metadata: AnnotationMetadata = { author: 'jane', date: '2026-02-08' };
      const result = annotateSidecar(old, now, 'python', metadata);
      assert.ok(result !== undefined);

      assert.ok(result!.includes('#     author: jane'), `Expected author in: ${result}`);
      assert.ok(result!.includes('#     date: 2026-02-08'), `Expected date in: ${result}`);
    });

    it('omits metadata fields when not provided', () => {
      const old = 'x = 1\n';
      const now = 'y = 2\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      assert.ok(!result!.includes('author:'), `Should not contain author in: ${result}`);
      assert.ok(!result!.includes('date:'), `Should not contain date in: ${result}`);
    });
  });

  // ─── sequential numbering ────────────────────────────────────────

  describe('sequential numbering', () => {
    it('numbers sc tags sequentially for multiple changes', () => {
      const old = 'a = 1\nb = 2\nc = 3\nd = 4\n';
      const now = 'a = 1\nc = 3\ne = 5\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      // First change: deletion of "b = 2" -> ct-1
      assert.ok(result!.includes('# - b = 2  # ct-1'), `Expected ct-1 deletion in: ${result}`);
      // Second change: substitution of "d = 4" -> "e = 5" -> ct-2
      assert.ok(result!.includes('ct-2'), `Expected ct-2 in: ${result}`);
      // Sidecar should have both entries
      assert.ok(result!.includes('# [^ct-1]: del | pending'), `Expected ct-1 sidecar entry in: ${result}`);
      assert.ok(result!.includes('# [^ct-2]:'), `Expected ct-2 sidecar entry in: ${result}`);
    });
  });

  // ─── sidecar block structure ─────────────────────────────────────

  describe('sidecar block structure', () => {
    it('has opening and closing delimiter lines', () => {
      const old = 'x = 1\n';
      const now = 'y = 2\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      const lines = result!.split('\n');
      // Find the sidecar delimiters
      const openIdx = lines.findIndex((l: string) => l.startsWith('# -- ChangeTracks'));
      const closeIdx = lines.findIndex((l: string) => l.startsWith('# -----'));
      assert.ok(openIdx >= 0, `Expected opening delimiter in: ${result}`);
      assert.ok(closeIdx > openIdx, `Expected closing delimiter after opening in: ${result}`);
    });

    it('includes original text for deletions and substitutions', () => {
      const old = 'results = []\n';
      const now = 'results = {}\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      // Sub entry should include original text
      assert.ok(result!.includes('original:'), `Expected original field in sidecar: ${result}`);
      assert.ok(result!.includes('results = []'), `Expected original value in sidecar: ${result}`);
    });

    it('ends with a trailing newline', () => {
      const old = 'x = 1\n';
      const now = 'y = 2\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);
      assert.ok(result!.endsWith('\n'), 'Expected trailing newline');
    });
  });

  // ─── invariants ──────────────────────────────────────────────────

  describe('invariants', () => {
    it('unchanged lines pass through as-is', () => {
      const old = 'x = 1\ny = 2\nz = 3\n';
      const now = 'x = 1\nz = 3\n';
      const result = annotateSidecar(old, now, 'python');
      assert.ok(result !== undefined);

      const lines = result!.split('\n');
      // x = 1 and z = 3 should appear as plain lines (no sc tag)
      assert.ok(lines.some((l: string) => l === 'x = 1'), `Expected unchanged line x=1 in: ${result}`);
      assert.ok(lines.some((l: string) => l === 'z = 3'), `Expected unchanged line z=3 in: ${result}`);
    });
  });
});
