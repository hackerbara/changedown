import { describe, it, expect, beforeEach } from 'vitest';
import {
  annotateMarkdown,
  annotateSidecar,
  Workspace,
  TextEdit,
} from '@changedown/core/internals';

/**
 * Applies TextEdits to a string. Edits are applied in reverse offset order
 * to preserve positions.
 */
function applyEdits(text: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const edit of sorted) {
    result = result.slice(0, edit.offset) + edit.newText + result.slice(edit.offset + edit.length);
  }
  return result;
}

/**
 * End-to-end integration tests for the git annotation pipeline:
 * 1. Git diff → annotate (annotateMarkdown / annotateSidecar)
 * 2. Parse annotated text (workspace.parse)
 * 3. Extract changes (doc.getChanges)
 * 4. Accept/reject changes (workspace.acceptAll / rejectAll)
 * 5. Apply edits to text
 * 6. Verify roundtrip correctness
 */
describe('Git Annotation Roundtrip - End-to-End Integration', () => {
  let ws: Workspace;

  beforeEach(() => {
    ws = new Workspace();
  });

  // ─── Markdown Roundtrip Tests ──────────────────────────────────────────────

  describe('Markdown roundtrip', () => {
    it('annotate → parse → accept all = new text', () => {
      const oldText = 'Hello world\nSecond line\n';
      const newText = 'Hello beautiful world\nSecond line\nThird line\n';

      // Step 1: Annotate
      const annotated = annotateMarkdown(oldText, newText);
      expect(annotated.includes('{++')).toBeTruthy();

      // Step 2: Parse
      const doc = ws.parse(annotated, 'markdown');
      const changes = doc.getChanges();
      expect(changes.length > 0).toBeTruthy();

      // Step 3: Accept all
      const edits = ws.acceptAll(doc);
      expect(edits.length > 0).toBeTruthy();

      // Step 4: Apply edits
      const result = applyEdits(annotated, edits);

      // Step 5: Verify result matches new text
      expect(result).toBe(newText);
    });

    it('annotate → parse → reject all = old text', () => {
      const oldText = 'Hello world\nSecond line\n';
      const newText = 'Hello beautiful world\nSecond line\nThird line\n';

      // Step 1: Annotate
      const annotated = annotateMarkdown(oldText, newText);
      expect(annotated.includes('{++')).toBeTruthy();

      // Step 2: Parse
      const doc = ws.parse(annotated, 'markdown');
      const changes = doc.getChanges();
      expect(changes.length > 0).toBeTruthy();

      // Step 3: Reject all
      const edits = ws.rejectAll(doc);
      expect(edits.length > 0).toBeTruthy();

      // Step 4: Apply edits
      const result = applyEdits(annotated, edits);

      // Step 5: Verify result matches old text
      expect(result).toBe(oldText);
    });
  });

  // ─── Sidecar Roundtrip Tests ───────────────────────────────────────────────

  describe('Sidecar roundtrip (Python)', () => {
    it('annotate → parse → accept all = new text', () => {
      const oldText = 'x = 1\ny = 2\n';
      const newText = 'x = 1\nz = 3\ny = 2\n';

      // Step 1: Annotate
      const annotated = annotateSidecar(oldText, newText, 'python');
      expect(annotated !== undefined).toBeTruthy();
      expect(annotated!.includes('# cn-')).toBeTruthy();
      expect(annotated!.includes('# -- ChangeDown')).toBeTruthy();

      // Step 2: Parse
      const doc = ws.parse(annotated!, 'python');
      const changes = doc.getChanges();
      expect(changes.length > 0).toBeTruthy();

      // Step 3: Accept all
      const edits = ws.acceptAll(doc, annotated!, 'python');
      expect(edits.length > 0).toBeTruthy();

      // Step 4: Apply edits (reverse order for sidecar)
      const result = applyEdits(annotated!, edits);

      // Step 5: Verify result matches new text
      // Trim for whitespace differences in sidecar block handling
      expect(result.trim()).toBe(newText.trim());
    });

    it('annotate → parse → reject all = old text', () => {
      const oldText = 'x = 1\ny = 2\n';
      const newText = 'x = 1\nz = 3\ny = 2\n';

      // Step 1: Annotate
      const annotated = annotateSidecar(oldText, newText, 'python');
      expect(annotated !== undefined).toBeTruthy();
      expect(annotated!.includes('# cn-')).toBeTruthy();
      expect(annotated!.includes('# -- ChangeDown')).toBeTruthy();

      // Step 2: Parse
      const doc = ws.parse(annotated!, 'python');
      const changes = doc.getChanges();
      expect(changes.length > 0).toBeTruthy();

      // Step 3: Reject all
      const edits = ws.rejectAll(doc, annotated!, 'python');
      expect(edits.length > 0).toBeTruthy();

      // Step 4: Apply edits (reverse order for sidecar)
      const result = applyEdits(annotated!, edits);

      // Step 5: Verify result matches old text
      // Trim for whitespace differences in sidecar block handling
      expect(result.trim()).toBe(oldText.trim());
    });
  });

  // ─── Additional Roundtrip Scenarios ────────────────────────────────────────

  describe('Complex change scenarios', () => {
    it('markdown with deletions: accept all = new text', () => {
      const oldText = 'Hello beautiful wonderful world\n';
      const newText = 'Hello world\n';

      const annotated = annotateMarkdown(oldText, newText);
      const doc = ws.parse(annotated, 'markdown');
      const edits = ws.acceptAll(doc);
      const result = applyEdits(annotated, edits);

      expect(result).toBe(newText);
    });

    it('markdown with deletions: reject all = old text', () => {
      const oldText = 'Hello beautiful wonderful world\n';
      const newText = 'Hello world\n';

      const annotated = annotateMarkdown(oldText, newText);
      const doc = ws.parse(annotated, 'markdown');
      const edits = ws.rejectAll(doc);
      const result = applyEdits(annotated, edits);

      expect(result).toBe(oldText);
    });

    it('sidecar with substitution: accept all = new text', () => {
      const oldText = 'x = 1\nresults = []\nz = 3\n';
      const newText = 'x = 1\nresults = {}\nz = 3\n';

      const annotated = annotateSidecar(oldText, newText, 'python');
      expect(annotated !== undefined).toBeTruthy();

      const doc = ws.parse(annotated!, 'python');
      const edits = ws.acceptAll(doc, annotated!, 'python');
      const result = applyEdits(annotated!, edits);

      expect(result.trim()).toBe(newText.trim());
    });

    it('sidecar with substitution: reject all = old text', () => {
      const oldText = 'x = 1\nresults = []\nz = 3\n';
      const newText = 'x = 1\nresults = {}\nz = 3\n';

      const annotated = annotateSidecar(oldText, newText, 'python');
      expect(annotated !== undefined).toBeTruthy();

      const doc = ws.parse(annotated!, 'python');
      const edits = ws.rejectAll(doc, annotated!, 'python');
      const result = applyEdits(annotated!, edits);

      expect(result.trim()).toBe(oldText.trim());
    });

    it('sidecar with deletion: accept all = new text', () => {
      const oldText = 'x = 1\ny = 2\nz = 3\n';
      const newText = 'x = 1\nz = 3\n';

      const annotated = annotateSidecar(oldText, newText, 'python');
      expect(annotated !== undefined).toBeTruthy();

      const doc = ws.parse(annotated!, 'python');
      const edits = ws.acceptAll(doc, annotated!, 'python');
      const result = applyEdits(annotated!, edits);

      expect(result.trim()).toBe(newText.trim());
    });

    it('sidecar with deletion: reject all = old text', () => {
      const oldText = 'x = 1\ny = 2\nz = 3\n';
      const newText = 'x = 1\nz = 3\n';

      const annotated = annotateSidecar(oldText, newText, 'python');
      expect(annotated !== undefined).toBeTruthy();

      const doc = ws.parse(annotated!, 'python');
      const edits = ws.rejectAll(doc, annotated!, 'python');
      const result = applyEdits(annotated!, edits);

      expect(result.trim()).toBe(oldText.trim());
    });
  });

  // ─── Multi-Language Sidecar Tests ──────────────────────────────────────────

  describe('Multi-language sidecar support', () => {
    it('typescript: accept all = new text', () => {
      const oldText = 'const x = 1;\nconst y = 2;\n';
      const newText = 'const x = 1;\nconst z = 3;\nconst y = 2;\n';

      const annotated = annotateSidecar(oldText, newText, 'typescript');
      expect(annotated !== undefined).toBeTruthy();
      expect(annotated!.includes('// cn-')).toBeTruthy();

      const doc = ws.parse(annotated!, 'typescript');
      const edits = ws.acceptAll(doc, annotated!, 'typescript');
      const result = applyEdits(annotated!, edits);

      expect(result.trim()).toBe(newText.trim());
    });

    it('typescript: reject all = old text', () => {
      const oldText = 'const x = 1;\nconst y = 2;\n';
      const newText = 'const x = 1;\nconst z = 3;\nconst y = 2;\n';

      const annotated = annotateSidecar(oldText, newText, 'typescript');
      expect(annotated !== undefined).toBeTruthy();

      const doc = ws.parse(annotated!, 'typescript');
      const edits = ws.rejectAll(doc, annotated!, 'typescript');
      const result = applyEdits(annotated!, edits);

      expect(result.trim()).toBe(oldText.trim());
    });

    it('javascript: roundtrip preserves text', () => {
      const oldText = 'function foo() {\n  return 42;\n}\n';
      const newText = 'function foo() {\n  console.log("debug");\n  return 42;\n}\n';

      const annotated = annotateSidecar(oldText, newText, 'javascript');
      expect(annotated !== undefined).toBeTruthy();

      // Accept path
      const docAccept = ws.parse(annotated!, 'javascript');
      const editsAccept = ws.acceptAll(docAccept, annotated!, 'javascript');
      const resultAccept = applyEdits(annotated!, editsAccept);
      expect(resultAccept.trim()).toBe(newText.trim());

      // Reject path
      const docReject = ws.parse(annotated!, 'javascript');
      const editsReject = ws.rejectAll(docReject, annotated!, 'javascript');
      const resultReject = applyEdits(annotated!, editsReject);
      expect(resultReject.trim()).toBe(oldText.trim());
    });
  });
});
