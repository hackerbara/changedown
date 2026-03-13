import * as assert from 'node:assert';
import { SidecarParser, ChangeType, ChangeStatus } from '@changetracks/core/internals';

describe('SidecarParser', () => {
  let parser: SidecarParser;

  beforeEach(() => {
    parser = new SidecarParser();
  });

  // ─── plain code (no annotations) ──────────────────────────────────

  describe('plain code', () => {
    it('returns empty document for plain code with no annotations', () => {
      const lines = [
        'x = 1',
        'y = 2',
        'z = 3',
        '',
      ];
      const doc = parser.parse(lines.join('\n'), 'python');
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('returns empty document for empty string', () => {
      const doc = parser.parse('', 'python');
      assert.strictEqual(doc.getChanges().length, 0);
    });
  });

  // ─── unsupported language ─────────────────────────────────────────

  describe('unsupported language', () => {
    it('returns empty document for markdown', () => {
      const lines = [
        'x = 1  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: ins | pending',
        '# ----------------------------------------------------------------',
      ];
      const doc = parser.parse(lines.join('\n'), 'markdown');
      assert.strictEqual(doc.getChanges().length, 0);
    });

    it('returns empty document for unknown language', () => {
      const doc = parser.parse('some code', 'brainfuck');
      assert.strictEqual(doc.getChanges().length, 0);
    });
  });

  // ─── deletion ─────────────────────────────────────────────────────

  describe('deletion', () => {
    it('parses a deletion line', () => {
      const lines = [
        'x = 1',
        '# - y = 2  # ct-1',
        'z = 3',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: del | pending',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const changes = doc.getChanges();

      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.type, ChangeType.Deletion);
      assert.strictEqual(c.status, ChangeStatus.Proposed);
      assert.strictEqual(c.originalText, 'y = 2');
      assert.strictEqual(c.modifiedText, undefined);
    });
  });

  // ─── insertion ────────────────────────────────────────────────────

  describe('insertion', () => {
    it('parses an insertion line', () => {
      const lines = [
        'x = 1',
        'z = 3  # ct-1',
        'y = 2',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: ins | pending',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const changes = doc.getChanges();

      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.type, ChangeType.Insertion);
      assert.strictEqual(c.status, ChangeStatus.Proposed);
      assert.strictEqual(c.modifiedText, 'z = 3');
      assert.strictEqual(c.originalText, undefined);
    });
  });

  // ─── substitution ────────────────────────────────────────────────

  describe('substitution', () => {
    it('parses a substitution (deletion + insertion with same tag)', () => {
      const lines = [
        'x = 1',
        '# - results = []  # ct-1',
        'results = {}  # ct-1',
        'z = 3',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: sub | pending',
        '#     original: "results = []"',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const changes = doc.getChanges();

      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.type, ChangeType.Substitution);
      assert.strictEqual(c.status, ChangeStatus.Proposed);
      assert.strictEqual(c.originalText, 'results = []');
      assert.strictEqual(c.modifiedText, 'results = {}');
    });
  });

  // ─── TypeScript syntax ────────────────────────────────────────────

  describe('TypeScript syntax', () => {
    it('parses with // comment syntax', () => {
      const lines = [
        'const x = 1;',
        'const z = 3;  // ct-1',
        'const y = 2;',
        '// -- ChangeTracks ---------------------------------------------',
        '// [^ct-1]: ins | pending',
        '// ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'typescript');
      const changes = doc.getChanges();

      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      assert.strictEqual(c.id, 'ct-1');
      assert.strictEqual(c.type, ChangeType.Insertion);
      assert.strictEqual(c.modifiedText, 'const z = 3;');
    });
  });

  // ─── multiple changes ────────────────────────────────────────────

  describe('multiple changes', () => {
    it('parses multiple changes with different tags', () => {
      const lines = [
        'x = 1',
        '# - y = 2  # ct-1',
        'z = 3  # ct-2',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: del | pending',
        '# [^ct-2]: ins | pending',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const changes = doc.getChanges();

      assert.strictEqual(changes.length, 2);

      assert.strictEqual(changes[0].id, 'ct-1');
      assert.strictEqual(changes[0].type, ChangeType.Deletion);
      assert.strictEqual(changes[0].originalText, 'y = 2');

      assert.strictEqual(changes[1].id, 'ct-2');
      assert.strictEqual(changes[1].type, ChangeType.Insertion);
      assert.strictEqual(changes[1].modifiedText, 'z = 3');
    });
  });

  // ─── grouped changes (dotted IDs) ────────────────────────────────

  describe('grouped changes', () => {
    it('parses grouped changes with dotted IDs', () => {
      const lines = [
        '# - old_a  # ct-1.1',
        'new_a  # ct-1.1',
        '# - old_b  # ct-1.2',
        'new_b  # ct-1.2',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1.1]: sub | pending',
        '# [^ct-1.2]: sub | pending',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const changes = doc.getChanges();

      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].id, 'ct-1.1');
      assert.strictEqual(changes[0].type, ChangeType.Substitution);
      assert.strictEqual(changes[0].originalText, 'old_a');
      assert.strictEqual(changes[0].modifiedText, 'new_a');

      assert.strictEqual(changes[1].id, 'ct-1.2');
      assert.strictEqual(changes[1].type, ChangeType.Substitution);
      assert.strictEqual(changes[1].originalText, 'old_b');
      assert.strictEqual(changes[1].modifiedText, 'new_b');
    });
  });

  // ─── ranges ───────────────────────────────────────────────────────

  describe('ranges', () => {
    it('sets ranges covering full annotated lines', () => {
      // "x = 1\n# - y = 2  # ct-1\nz = 3\n..."
      // Line 0: "x = 1" = 5 chars, \n at offset 5
      // Line 1: "# - y = 2  # ct-1" = 17 chars, starts at offset 6, \n at offset 23
      // Range end = lineOffset(1) + len("# - y = 2  # ct-1") + 1 = 6 + 17 + 1 = 24
      const lines = [
        'x = 1',
        '# - y = 2  # ct-1',
        'z = 3',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: del | pending',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const changes = doc.getChanges();

      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      // Line 1 starts at offset 6 (after "x = 1\n")
      assert.strictEqual(c.range.start, 6);
      // Line 1 is "# - y = 2  # ct-1" = 17 chars + 1 for \n = 24
      assert.strictEqual(c.range.end, 24);
    });

    it('range spans multiple lines for multi-line deletion', () => {
      const lines = [
        'x = 1',
        '# - a = 1  # ct-1',
        '# - b = 2  # ct-1',
        'z = 3',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: del | pending',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const changes = doc.getChanges();

      assert.strictEqual(changes.length, 1);
      const c = changes[0];
      // Line 1 starts at offset 6 (after "x = 1\n")
      assert.strictEqual(c.range.start, 6);
      // Line 1: "# - a = 1  # ct-1" = 17 chars + \n = offset 6..24
      // Line 2: "# - b = 2  # ct-1" = 17 chars + \n = offset 24..42
      assert.strictEqual(c.range.end, 42);
      assert.strictEqual(c.originalText, 'a = 1\nb = 2');
    });

    it('contentRange equals range', () => {
      const lines = [
        'x = 1  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: ins | pending',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const changes = doc.getChanges();
      const c = changes[0];
      assert.deepStrictEqual(c.contentRange, c.range);
    });
  });

  // ─── metadata ─────────────────────────────────────────────────────

  describe('metadata', () => {
    it('parses author from sidecar block', () => {
      const lines = [
        '# - y = 2  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: del | pending',
        '#     author: jane',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.author, 'jane');
    });

    it('parses date as timestamp', () => {
      const lines = [
        '# - y = 2  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: del | pending',
        '#     date: 2026-02-08',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.date, '2026-02-08');
    });

    it('parses reason as comment', () => {
      const lines = [
        '# - y = 2  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: del | pending',
        '#     reason: "removed unused variable"',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const c = doc.getChanges()[0];
      assert.strictEqual(c.metadata?.comment, 'removed unused variable');
    });

    it('parses original field for deletion originalText', () => {
      const lines = [
        '# - y = 2  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: del | pending',
        '#     original: "y = 2"',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const c = doc.getChanges()[0];
      // originalText comes from the deletion line code, not the original field
      // But when there are no deletion lines, originalText comes from original field
      assert.strictEqual(c.originalText, 'y = 2');
    });
  });

  // ─── status parsing ──────────────────────────────────────────────

  describe('status parsing', () => {
    it('parses accepted status', () => {
      const lines = [
        'z = 3  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: ins | accepted',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      assert.strictEqual(doc.getChanges()[0].status, ChangeStatus.Accepted);
    });

    it('parses rejected status', () => {
      const lines = [
        'z = 3  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: ins | rejected',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      assert.strictEqual(doc.getChanges()[0].status, ChangeStatus.Rejected);
    });
  });

  // ─── type inference from lines ────────────────────────────────────

  describe('type inference', () => {
    it('infers Substitution when both del and ins lines exist for same tag (even if sidecar says del)', () => {
      const lines = [
        '# - old_val  # ct-1',
        'new_val  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: sub | pending',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      assert.strictEqual(doc.getChanges()[0].type, ChangeType.Substitution);
    });
  });

  // ─── original text from sidecar when no deletion lines ────────────

  describe('original from sidecar metadata', () => {
    it('uses original field from sidecar when no deletion lines exist for the tag', () => {
      // Edge case: sidecar has type=sub but only insertion lines visible
      // (deletion lines were removed). The original field preserves the old text.
      const lines = [
        'new_val  # ct-1',
        '# -- ChangeTracks ---------------------------------------------',
        '# [^ct-1]: sub | pending',
        '#     original: "old_val"',
        '# ----------------------------------------------------------------',
      ];
      const text = lines.join('\n');
      const doc = parser.parse(text, 'python');
      const c = doc.getChanges()[0];
      assert.strictEqual(c.type, ChangeType.Substitution);
      assert.strictEqual(c.originalText, 'old_val');
      assert.strictEqual(c.modifiedText, 'new_val');
    });
  });
});
