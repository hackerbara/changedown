import { describe, it, expect } from 'vitest';
import { annotateSidecar, AnnotationMetadata } from '@changetracks/core/internals';

describe('Sidecar Annotator - annotateSidecar', () => {

  // ─── no differences ──────────────────────────────────────────────

  describe('no differences', () => {
    it('returns unchanged text when old and new are identical', () => {
      const text = 'x = 1\ny = 2\n';
      expect(annotateSidecar(text, text, 'python')).toBe(text);
    });

    it('returns unchanged text for identical empty strings', () => {
      expect(annotateSidecar('', '', 'typescript')).toBe('');
    });
  });

  // ─── unsupported language ────────────────────────────────────────

  describe('unsupported language', () => {
    it('returns undefined for markdown', () => {
      expect(annotateSidecar('old', 'new', 'markdown')).toBeUndefined();
    });

    it('returns undefined for unknown language', () => {
      expect(annotateSidecar('old', 'new', 'brainfuck')).toBeUndefined();
    });
  });

  // ─── simple insertion ────────────────────────────────────────────

  describe('simple insertion', () => {
    it('annotates a single inserted line with ct-N tag and sidecar block', () => {
      const old = 'x = 1\ny = 2\n';
      const now = 'x = 1\nz = 3\ny = 2\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      // The inserted line gets an insertion tag
      expect(result!.includes('z = 3  # ct-1')).toBeTruthy();
      // Sidecar block exists with ins entry
      expect(result!.includes('# -- ChangeTracks')).toBeTruthy();
      expect(result!.includes('# [^ct-1]: ins | pending')).toBeTruthy();
    });
  });

  // ─── simple deletion ─────────────────────────────────────────────

  describe('simple deletion', () => {
    it('annotates a single deleted line with deletion marker and sidecar block', () => {
      const old = 'x = 1\ny = 2\nz = 3\n';
      const now = 'x = 1\nz = 3\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      // The deleted line becomes a commented deletion marker
      expect(result!.includes('# - y = 2  # ct-1')).toBeTruthy();
      // Sidecar block has del entry
      expect(result!.includes('# [^ct-1]: del | pending')).toBeTruthy();
    });
  });

  // ─── substitution ────────────────────────────────────────────────

  describe('substitution', () => {
    it('annotates a changed line as deletion + insertion with same ct-N tag', () => {
      const old = 'x = 1\nresults = []\nz = 3\n';
      const now = 'x = 1\nresults = {}\nz = 3\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      // Deletion line for old value + insertion line for new value, same tag
      expect(result!.includes('# - results = []  # ct-1')).toBeTruthy();
      expect(result!.includes('results = {}  # ct-1')).toBeTruthy();
      // Sidecar block has sub entry
      expect(result!.includes('# [^ct-1]: sub | pending')).toBeTruthy();
    });
  });

  // ─── TypeScript comment syntax ───────────────────────────────────

  describe('TypeScript comment syntax', () => {
    it('uses // for TypeScript files', () => {
      const old = 'const x = 1;\nconst y = 2;\n';
      const now = 'const x = 1;\nconst z = 3;\nconst y = 2;\n';
      const result = annotateSidecar(old, now, 'typescript');
      expect(result !== undefined).toBeTruthy();

      // Uses // comment syntax
      expect(result!.includes('const z = 3;  // ct-1')).toBeTruthy();
      expect(result!.includes('// -- ChangeTracks')).toBeTruthy();
      expect(result!.includes('// [^ct-1]: ins | pending')).toBeTruthy();
    });
  });

  // ─── multi-line substitution ─────────────────────────────────────

  describe('multi-line substitution', () => {
    it('handles multi-line removed+added as substitution', () => {
      const old = 'a = 1\nb = 2\nc = 3\nd = 4\n';
      const now = 'a = 1\nx = 10\ny = 20\nd = 4\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      // Both old lines become deletion markers, both new lines get insertion tags
      expect(result!.includes('# - b = 2  # ct-1')).toBeTruthy();
      expect(result!.includes('# - c = 3  # ct-1')).toBeTruthy();
      expect(result!.includes('x = 10  # ct-1')).toBeTruthy();
      expect(result!.includes('y = 20  # ct-1')).toBeTruthy();
      // Single sub entry in sidecar
      expect(result!.includes('# [^ct-1]: sub | pending')).toBeTruthy();
    });
  });

  // ─── indentation preservation ────────────────────────────────────

  describe('indentation preservation', () => {
    it('preserves indentation in deletion lines', () => {
      const old = 'def foo():\n    x = 1\n    y = 2\n';
      const now = 'def foo():\n    y = 2\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      // Indentation preserved: "    # - x = 1  # ct-1"
      expect(result!.includes('    # - x = 1  # ct-1')).toBeTruthy();
    });
  });

  // ─── metadata in sidecar block ───────────────────────────────────

  describe('metadata', () => {
    it('includes author and date in sidecar block when provided', () => {
      const old = 'x = 1\n';
      const now = 'y = 2\n';
      const metadata: AnnotationMetadata = { author: 'jane', date: '2026-02-08' };
      const result = annotateSidecar(old, now, 'python', metadata);
      expect(result !== undefined).toBeTruthy();

      expect(result!.includes('#     author: jane')).toBeTruthy();
      expect(result!.includes('#     date: 2026-02-08')).toBeTruthy();
    });

    it('omits metadata fields when not provided', () => {
      const old = 'x = 1\n';
      const now = 'y = 2\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      expect(result!.includes('author:')).toBe(false);
      expect(result!.includes('date:')).toBe(false);
    });
  });

  // ─── sequential numbering ────────────────────────────────────────

  describe('sequential numbering', () => {
    it('numbers sc tags sequentially for multiple changes', () => {
      const old = 'a = 1\nb = 2\nc = 3\nd = 4\n';
      const now = 'a = 1\nc = 3\ne = 5\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      // First change: deletion of "b = 2" -> ct-1
      expect(result!.includes('# - b = 2  # ct-1')).toBeTruthy();
      // Second change: substitution of "d = 4" -> "e = 5" -> ct-2
      expect(result!.includes('ct-2')).toBeTruthy();
      // Sidecar should have both entries
      expect(result!.includes('# [^ct-1]: del | pending')).toBeTruthy();
      expect(result!.includes('# [^ct-2]:')).toBeTruthy();
    });
  });

  // ─── sidecar block structure ─────────────────────────────────────

  describe('sidecar block structure', () => {
    it('has opening and closing delimiter lines', () => {
      const old = 'x = 1\n';
      const now = 'y = 2\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      const lines = result!.split('\n');
      // Find the sidecar delimiters
      const openIdx = lines.findIndex((l: string) => l.startsWith('# -- ChangeTracks'));
      const closeIdx = lines.findIndex((l: string) => l.startsWith('# -----'));
      expect(openIdx >= 0).toBeTruthy();
      expect(closeIdx > openIdx).toBeTruthy();
    });

    it('includes original text for deletions and substitutions', () => {
      const old = 'results = []\n';
      const now = 'results = {}\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      // Sub entry should include original text
      expect(result!.includes('original:')).toBeTruthy();
      expect(result!.includes('results = []')).toBeTruthy();
    });

    it('ends with a trailing newline', () => {
      const old = 'x = 1\n';
      const now = 'y = 2\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();
      expect(result!.endsWith('\n')).toBeTruthy();
    });
  });

  // ─── invariants ──────────────────────────────────────────────────

  describe('invariants', () => {
    it('unchanged lines pass through as-is', () => {
      const old = 'x = 1\ny = 2\nz = 3\n';
      const now = 'x = 1\nz = 3\n';
      const result = annotateSidecar(old, now, 'python');
      expect(result !== undefined).toBeTruthy();

      const lines = result!.split('\n');
      // x = 1 and z = 3 should appear as plain lines (no sc tag)
      expect(lines.some((l: string) => l === 'x = 1')).toBeTruthy();
      expect(lines.some((l: string) => l === 'z = 3')).toBeTruthy();
    });
  });
});
