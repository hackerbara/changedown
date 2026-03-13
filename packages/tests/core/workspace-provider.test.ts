import * as assert from 'node:assert';
import { Workspace, ChangeType, ChangeStatus } from '@changetracks/core/internals';

describe('Workspace provider dispatch', () => {
  let ws: Workspace;

  beforeEach(() => {
    ws = new Workspace();
  });

  // --- Backwards compatibility -------------------------------------------------

  describe('backwards compatibility (no languageId)', () => {
    it('parses CriticMarkup when no languageId provided', () => {
      const doc = ws.parse('Hello {++world++}!');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
    });

    it('acceptChange works without languageId (CriticMarkup path)', () => {
      const doc = ws.parse('Hello {++world++}!');
      const change = doc.getChanges()[0];
      const edits = ws.acceptChange(change);
      // Always returns TextEdit[]
      assert.ok(Array.isArray(edits));
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].newText, 'world');
    });

    it('rejectChange works without languageId (CriticMarkup path)', () => {
      const doc = ws.parse('Hello {--world--}!');
      const change = doc.getChanges()[0];
      const edits = ws.rejectChange(change);
      assert.ok(Array.isArray(edits));
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].newText, 'world');
    });

    it('acceptAll works without languageId', () => {
      const doc = ws.parse('{++one++} {++two++}');
      const edits = ws.acceptAll(doc);
      assert.strictEqual(edits.length, 2);
    });

    it('rejectAll works without languageId', () => {
      const doc = ws.parse('{++one++} {++two++}');
      const edits = ws.rejectAll(doc);
      assert.strictEqual(edits.length, 2);
    });
  });

  // --- Markdown languageId -----------------------------------------------------

  describe('markdown languageId', () => {
    it('parses CriticMarkup for markdown languageId', () => {
      const doc = ws.parse('Hello {++world++}!', 'markdown');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
    });

    it('uses CriticMarkup even if markdown text contains "ChangeTracks" string', () => {
      const text = 'Hello {++world++}!\n\n-- ChangeTracks --\nSome text';
      const doc = ws.parse(text, 'markdown');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
    });
  });

  // --- Sidecar dispatch --------------------------------------------------------

  describe('sidecar dispatch for code files', () => {
    const pythonSidecar = [
      'x = 1',
      'y = 2  # ct-1',
      '',
      '# -- ChangeTracks ---------------------------------------------',
      '# [^ct-1]: ins | pending',
      '# ----------------------------------------------------------------',
    ].join('\n');

    it('parses sidecar annotations for python languageId when sidecar block present', () => {
      const doc = ws.parse(pythonSidecar, 'python');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
      assert.strictEqual(changes[0].id, 'ct-1');
    });

    it('parses sidecar annotations for typescript languageId when sidecar block present', () => {
      const tsSidecar = [
        'const x = 1;',
        'const y = 2;  // ct-1',
        '',
        '// -- ChangeTracks ---------------------------------------------',
        '// [^ct-1]: ins | pending',
        '// ----------------------------------------------------------------',
      ].join('\n');
      const doc = ws.parse(tsSidecar, 'typescript');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
    });

    it('acceptChange returns TextEdit[] for sidecar changes', () => {
      const result = ws.acceptChange(
        { id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
          range: { start: 0, end: 10 }, contentRange: { start: 0, end: 10 }, level: 0, anchored: false },
        pythonSidecar,
        'python'
      );
      assert.ok(Array.isArray(result));
      assert.ok((result as any[]).length > 0);
    });

    it('rejectChange returns TextEdit[] for sidecar changes', () => {
      const result = ws.rejectChange(
        { id: 'ct-1', type: ChangeType.Insertion, status: ChangeStatus.Proposed,
          range: { start: 0, end: 10 }, contentRange: { start: 0, end: 10 }, level: 0, anchored: false },
        pythonSidecar,
        'python'
      );
      assert.ok(Array.isArray(result));
      assert.ok((result as any[]).length > 0);
    });

    it('acceptAll dispatches to sidecar for code files with sidecar block', () => {
      const doc = ws.parse(pythonSidecar, 'python');
      const edits = ws.acceptAll(doc, pythonSidecar, 'python');
      assert.ok(edits.length > 0);
    });

    it('rejectAll dispatches to sidecar for code files with sidecar block', () => {
      const doc = ws.parse(pythonSidecar, 'python');
      const edits = ws.rejectAll(doc, pythonSidecar, 'python');
      assert.ok(edits.length > 0);
    });
  });

  // --- Fallback to CriticMarkup for code without sidecar -----------------------

  describe('fallback to CriticMarkup for code files without sidecar block', () => {
    it('falls back to CriticMarkup for python file without sidecar block', () => {
      const text = 'x = 1\n{++y = 2++}\n';
      const doc = ws.parse(text, 'python');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
    });

    it('falls back to CriticMarkup for unknown language', () => {
      const text = 'Hello {--world--}!';
      const doc = ws.parse(text, 'brainfuck');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Deletion);
    });
  });

  // --- shouldUseSidecar detection -----------------------------------------------

  describe('sidecar block detection', () => {
    it('detects sidecar block in python file', () => {
      const text = [
        'code  # ct-1',
        '# -- ChangeTracks ---',
        '# [^ct-1]: ins | pending',
        '# ---',
      ].join('\n');
      const doc = ws.parse(text, 'python');
      // Sidecar path used: should find ct-1
      assert.strictEqual(doc.getChanges().length, 1);
      assert.strictEqual(doc.getChanges()[0].id, 'ct-1');
    });

    it('does not detect sidecar for markdown even with matching text', () => {
      // Markdown always uses CriticMarkup regardless of content
      const text = '# -- ChangeTracks ---\n{++hello++}';
      const doc = ws.parse(text, 'markdown');
      const changes = doc.getChanges();
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].type, ChangeType.Insertion);
    });

    it('does not use sidecar when text lacks sidecar block', () => {
      const text = 'x = 1  # ct-1\ny = 2';
      const doc = ws.parse(text, 'python');
      // Without sidecar block, falls back to CriticMarkup — no CriticMarkup in this text
      assert.strictEqual(doc.getChanges().length, 0);
    });
  });
});
