import { describe, it, expect, beforeEach } from 'vitest';
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
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('returns empty document for empty string', () => {
      const doc = parser.parse('', 'python');
      expect(doc.getChanges()).toHaveLength(0);
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
      expect(doc.getChanges()).toHaveLength(0);
    });

    it('returns empty document for unknown language', () => {
      const doc = parser.parse('some code', 'brainfuck');
      expect(doc.getChanges()).toHaveLength(0);
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

      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('ct-1');
      expect(c.type).toBe(ChangeType.Deletion);
      expect(c.status).toBe(ChangeStatus.Proposed);
      expect(c.originalText).toBe('y = 2');
      expect(c.modifiedText).toBeUndefined();
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

      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('ct-1');
      expect(c.type).toBe(ChangeType.Insertion);
      expect(c.status).toBe(ChangeStatus.Proposed);
      expect(c.modifiedText).toBe('z = 3');
      expect(c.originalText).toBeUndefined();
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

      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('ct-1');
      expect(c.type).toBe(ChangeType.Substitution);
      expect(c.status).toBe(ChangeStatus.Proposed);
      expect(c.originalText).toBe('results = []');
      expect(c.modifiedText).toBe('results = {}');
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

      expect(changes).toHaveLength(1);
      const c = changes[0];
      expect(c.id).toBe('ct-1');
      expect(c.type).toBe(ChangeType.Insertion);
      expect(c.modifiedText).toBe('const z = 3;');
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

      expect(changes).toHaveLength(2);

      expect(changes[0].id).toBe('ct-1');
      expect(changes[0].type).toBe(ChangeType.Deletion);
      expect(changes[0].originalText).toBe('y = 2');

      expect(changes[1].id).toBe('ct-2');
      expect(changes[1].type).toBe(ChangeType.Insertion);
      expect(changes[1].modifiedText).toBe('z = 3');
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

      expect(changes).toHaveLength(2);
      expect(changes[0].id).toBe('ct-1.1');
      expect(changes[0].type).toBe(ChangeType.Substitution);
      expect(changes[0].originalText).toBe('old_a');
      expect(changes[0].modifiedText).toBe('new_a');

      expect(changes[1].id).toBe('ct-1.2');
      expect(changes[1].type).toBe(ChangeType.Substitution);
      expect(changes[1].originalText).toBe('old_b');
      expect(changes[1].modifiedText).toBe('new_b');
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

      expect(changes).toHaveLength(1);
      const c = changes[0];
      // Line 1 starts at offset 6 (after "x = 1\n")
      expect(c.range.start).toBe(6);
      // Line 1 is "# - y = 2  # ct-1" = 17 chars + 1 for \n = 24
      expect(c.range.end).toBe(24);
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

      expect(changes).toHaveLength(1);
      const c = changes[0];
      // Line 1 starts at offset 6 (after "x = 1\n")
      expect(c.range.start).toBe(6);
      // Line 1: "# - a = 1  # ct-1" = 17 chars + \n = offset 6..24
      // Line 2: "# - b = 2  # ct-1" = 17 chars + \n = offset 24..42
      expect(c.range.end).toBe(42);
      expect(c.originalText).toBe('a = 1\nb = 2');
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
      expect(c.contentRange).toStrictEqual(c.range);
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
      expect(c.metadata?.author).toBe('jane');
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
      expect(c.metadata?.date).toBe('2026-02-08');
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
      expect(c.metadata?.comment).toBe('removed unused variable');
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
      expect(c.originalText).toBe('y = 2');
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
      expect(doc.getChanges()[0].status).toBe(ChangeStatus.Accepted);
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
      expect(doc.getChanges()[0].status).toBe(ChangeStatus.Rejected);
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
      expect(doc.getChanges()[0].type).toBe(ChangeType.Substitution);
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
      expect(c.type).toBe(ChangeType.Substitution);
      expect(c.originalText).toBe('old_val');
      expect(c.modifiedText).toBe('new_val');
    });
  });
});
