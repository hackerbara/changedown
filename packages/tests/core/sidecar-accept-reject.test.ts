import { describe, it, expect } from 'vitest';
import {
  TextEdit,
  ChangeNode,
  ChangeType,
  ChangeStatus,
  computeSidecarAccept,
  computeSidecarReject,
  computeSidecarResolveAll,
} from '@changetracks/core/internals';

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

// ─── Test fixtures ───────────────────────────────────────────────────────────

const DIVIDER = '-'.repeat(45);

/**
 * Python file with a single inserted line (ct-1).
 *
 * Lines:
 *   x = 1
 *   z = 3  # ct-1
 *   y = 2
 *
 *   # -- ChangeTracks -------------...
 *   # [^ct-1]: ins | pending
 *   # ------...
 */
const PYTHON_INSERTION = [
  'x = 1',
  'z = 3  # ct-1',
  'y = 2',
  '',
  `# -- ChangeTracks ${DIVIDER}`,
  '# [^ct-1]: ins | pending',
  `# ${DIVIDER}---------------------`,
  '',
].join('\n');

/**
 * Python file with a single deleted line (ct-1).
 *
 * Lines:
 *   x = 1
 *   # - y = 2  # ct-1
 *   z = 3
 *
 *   # -- ChangeTracks ...
 *   # [^ct-1]: del | pending
 *   #     original: "y = 2"
 *   # -----...
 */
const PYTHON_DELETION = [
  'x = 1',
  '# - y = 2  # ct-1',
  'z = 3',
  '',
  `# -- ChangeTracks ${DIVIDER}`,
  '# [^ct-1]: del | pending',
  '#     original: "y = 2"',
  `# ${DIVIDER}---------------------`,
  '',
].join('\n');

/**
 * Python file with a substitution (ct-1): old line deleted, new line inserted.
 *
 * Lines:
 *   x = 1
 *   # - results = []  # ct-1
 *   results = {}  # ct-1
 *   z = 3
 *
 *   # -- ChangeTracks ...
 *   # [^ct-1]: sub | pending
 *   #     original: "results = []"
 *   # -----...
 */
const PYTHON_SUBSTITUTION = [
  'x = 1',
  '# - results = []  # ct-1',
  'results = {}  # ct-1',
  'z = 3',
  '',
  `# -- ChangeTracks ${DIVIDER}`,
  '# [^ct-1]: sub | pending',
  '#     original: "results = []"',
  `# ${DIVIDER}---------------------`,
  '',
].join('\n');

/**
 * Python file with two changes: ct-1 (deletion) and ct-2 (insertion).
 * Used to test that resolving one change leaves the other intact.
 */
const PYTHON_TWO_CHANGES = [
  'x = 1',
  '# - y = 2  # ct-1',
  'z = 3',
  'w = 4  # ct-2',
  '',
  `# -- ChangeTracks ${DIVIDER}`,
  '# [^ct-1]: del | pending',
  '#     original: "y = 2"',
  '# [^ct-2]: ins | pending',
  `# ${DIVIDER}---------------------`,
  '',
].join('\n');

/**
 * Python file with grouped changes: parent ct-1 with children ct-1.1 and ct-1.2.
 * Simulates a find-and-replace operation.
 */
const PYTHON_GROUPED = [
  'x = old_value  # ct-1.1',
  'y = 2',
  'z = old_value  # ct-1.2',
  '',
  `# -- ChangeTracks ${DIVIDER}`,
  '# [^ct-1]: ins | pending',
  '# [^ct-1.1]: ins | pending',
  '# [^ct-1.2]: ins | pending',
  `# ${DIVIDER}---------------------`,
  '',
].join('\n');

/**
 * TypeScript file with a single insertion (ct-1) to verify language support.
 */
const TS_INSERTION = [
  'const x = 1;',
  'const z = 3;  // ct-1',
  'const y = 2;',
  '',
  `// -- ChangeTracks ${DIVIDER}`,
  '// [^ct-1]: ins | pending',
  `// ${DIVIDER}---------------------`,
  '',
].join('\n');

/**
 * Python file with indented insertion inside a function body.
 */
const PYTHON_INDENTED_INSERTION = [
  'def foo():',
  '    x = 1',
  '    z = 3  # ct-1',
  '    y = 2',
  '',
  `# -- ChangeTracks ${DIVIDER}`,
  '# [^ct-1]: ins | pending',
  `# ${DIVIDER}---------------------`,
  '',
].join('\n');

/**
 * Python file with indented deletion inside a function body.
 */
const PYTHON_INDENTED_DELETION = [
  'def foo():',
  '    x = 1',
  '    # - y = 2  # ct-1',
  '    z = 3',
  '',
  `# -- ChangeTracks ${DIVIDER}`,
  '# [^ct-1]: del | pending',
  '#     original: "y = 2"',
  `# ${DIVIDER}---------------------`,
  '',
].join('\n');

/**
 * Python file with only one change — used to test sidecar block removal
 * when the last change is resolved.
 */
const PYTHON_SINGLE_FOR_BLOCK_REMOVAL = [
  'x = 1',
  'z = 3  # ct-1',
  'y = 2',
  '',
  `# -- ChangeTracks ${DIVIDER}`,
  '# [^ct-1]: ins | pending',
  `# ${DIVIDER}---------------------`,
  '',
].join('\n');


// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeSidecarAccept', () => {

  // ─── Accept insertion ──────────────────────────────────────────────────
  describe('insertion', () => {
    it('strips sc tag, keeps code line', () => {
      const edits = computeSidecarAccept(PYTHON_INSERTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INSERTION, edits);

      // The code line should be clean (no sc tag)
      expect(result.includes('z = 3\n')).toBeTruthy();
      // The sc tag should be gone from the code
      expect(result.includes('# ct-1')).toBe(false);
    });

    it('preserves indentation when stripping tag', () => {
      const edits = computeSidecarAccept(PYTHON_INDENTED_INSERTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INDENTED_INSERTION, edits);

      expect(result.includes('    z = 3\n')).toBeTruthy();
    });

    it('works with TypeScript comment syntax', () => {
      const edits = computeSidecarAccept(TS_INSERTION, 'ct-1', 'typescript');
      const result = applyEdits(TS_INSERTION, edits);

      expect(result.includes('const z = 3;\n')).toBeTruthy();
      expect(result.includes('// ct-1')).toBe(false);
    });
  });

  // ─── Accept deletion ──────────────────────────────────────────────────
  describe('deletion', () => {
    it('removes the entire deletion marker line', () => {
      const edits = computeSidecarAccept(PYTHON_DELETION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_DELETION, edits);

      // The deletion marker line should be completely gone
      expect(result.includes('# - y = 2')).toBe(false);
      // Surrounding lines preserved
      expect(result.includes('x = 1\n')).toBeTruthy();
      expect(result.includes('z = 3\n')).toBeTruthy();
    });

    it('removes indented deletion marker line', () => {
      const edits = computeSidecarAccept(PYTHON_INDENTED_DELETION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INDENTED_DELETION, edits);

      expect(result.includes('# - y = 2')).toBe(false);
      expect(result.includes('    x = 1\n')).toBeTruthy();
      expect(result.includes('    z = 3\n')).toBeTruthy();
    });
  });

  // ─── Accept substitution ──────────────────────────────────────────────
  describe('substitution', () => {
    it('keeps new code (strips tag), removes old code (deletion line)', () => {
      const edits = computeSidecarAccept(PYTHON_SUBSTITUTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_SUBSTITUTION, edits);

      // New code kept, tag stripped
      expect(result.includes('results = {}\n')).toBeTruthy();
      // Old code (deletion marker) removed
      expect(result.includes('# - results = []')).toBe(false);
      // No sc tag in code area
      expect(result.includes('# ct-1')).toBe(false);
    });
  });

  // ─── Sidecar block cleanup ────────────────────────────────────────────
  describe('sidecar block cleanup', () => {
    it('removes the sidecar entry for the resolved tag', () => {
      const edits = computeSidecarAccept(PYTHON_TWO_CHANGES, 'ct-1', 'python');
      const result = applyEdits(PYTHON_TWO_CHANGES, edits);

      // ct-1 entry gone
      expect(result.includes('[^ct-1]')).toBe(false);
      // ct-2 entry still present
      expect(result.includes('[^ct-2]: ins | pending')).toBeTruthy();
      // Sidecar block header/footer still present
      expect(result.includes('ChangeTracks')).toBeTruthy();
    });

    it('removes the entire sidecar block when last change resolved', () => {
      const edits = computeSidecarAccept(PYTHON_SINGLE_FOR_BLOCK_REMOVAL, 'ct-1', 'python');
      const result = applyEdits(PYTHON_SINGLE_FOR_BLOCK_REMOVAL, edits);

      // Entire sidecar block gone
      expect(result.includes('ChangeTracks')).toBe(false);
      expect(result.includes('[^ct-1]')).toBe(false);
      // Code is clean
      expect(result.includes('z = 3\n')).toBeTruthy();
    });
  });

  // ─── Grouped changes (dotted IDs) ─────────────────────────────────────
  describe('grouped changes (dotted IDs)', () => {
    it('accepts all children when accepting parent tag', () => {
      const edits = computeSidecarAccept(PYTHON_GROUPED, 'ct-1', 'python');
      const result = applyEdits(PYTHON_GROUPED, edits);

      // All child tags should be stripped
      expect(result.includes('# ct-1.1')).toBe(false);
      expect(result.includes('# ct-1.2')).toBe(false);
      // Code kept
      expect(result.includes('x = old_value\n')).toBeTruthy();
      expect(result.includes('z = old_value\n')).toBeTruthy();
      // All sidecar entries gone
      expect(result.includes('[^ct-1]')).toBe(false);
      expect(result.includes('[^ct-1.1]')).toBe(false);
      expect(result.includes('[^ct-1.2]')).toBe(false);
    });
  });
});


describe('computeSidecarReject', () => {

  // ─── Reject insertion ─────────────────────────────────────────────────
  describe('insertion', () => {
    it('removes the entire inserted line', () => {
      const edits = computeSidecarReject(PYTHON_INSERTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INSERTION, edits);

      // The inserted line should be gone entirely
      expect(result.includes('z = 3')).toBe(false);
      // Surrounding lines preserved
      expect(result.includes('x = 1\n')).toBeTruthy();
      expect(result.includes('y = 2\n')).toBeTruthy();
    });

    it('removes indented inserted line', () => {
      const edits = computeSidecarReject(PYTHON_INDENTED_INSERTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INDENTED_INSERTION, edits);

      expect(result.includes('z = 3')).toBe(false);
      expect(result.includes('    x = 1\n')).toBeTruthy();
      expect(result.includes('    y = 2\n')).toBeTruthy();
    });
  });

  // ─── Reject deletion ──────────────────────────────────────────────────
  describe('deletion', () => {
    it('uncomments the deletion line, restoring original code', () => {
      const edits = computeSidecarReject(PYTHON_DELETION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_DELETION, edits);

      // The deletion marker should be gone, replaced with original code
      expect(result.includes('# - y = 2')).toBe(false);
      expect(result.includes('y = 2\n')).toBeTruthy();
      // Surrounding lines preserved
      expect(result.includes('x = 1\n')).toBeTruthy();
      expect(result.includes('z = 3\n')).toBeTruthy();
    });

    it('restores indented code correctly', () => {
      const edits = computeSidecarReject(PYTHON_INDENTED_DELETION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INDENTED_DELETION, edits);

      expect(result.includes('# - y = 2')).toBe(false);
      expect(result.includes('    y = 2\n')).toBeTruthy();
    });
  });

  // ─── Reject substitution ──────────────────────────────────────────────
  describe('substitution', () => {
    it('restores old code (uncomments deletions), removes new code', () => {
      const edits = computeSidecarReject(PYTHON_SUBSTITUTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_SUBSTITUTION, edits);

      // Old code restored (uncommented)
      expect(result.includes('results = []\n')).toBeTruthy();
      // New code removed
      expect(result.includes('results = {}')).toBe(false);
      // No sc tag
      expect(result.includes('# ct-1')).toBe(false);
    });
  });

  // ─── Sidecar block cleanup ────────────────────────────────────────────
  describe('sidecar block cleanup', () => {
    it('removes the sidecar entry for the resolved tag', () => {
      const edits = computeSidecarReject(PYTHON_TWO_CHANGES, 'ct-2', 'python');
      const result = applyEdits(PYTHON_TWO_CHANGES, edits);

      // ct-2 entry gone
      expect(result.includes('[^ct-2]')).toBe(false);
      // ct-1 entry still present
      expect(result.includes('[^ct-1]: del | pending')).toBeTruthy();
    });

    it('removes the entire sidecar block when last change resolved', () => {
      const edits = computeSidecarReject(PYTHON_INSERTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INSERTION, edits);

      // Entire sidecar block gone
      expect(result.includes('ChangeTracks')).toBe(false);
    });
  });

  // ─── Grouped changes (dotted IDs) ─────────────────────────────────────
  describe('grouped changes (dotted IDs)', () => {
    it('rejects all children when rejecting parent tag', () => {
      const edits = computeSidecarReject(PYTHON_GROUPED, 'ct-1', 'python');
      const result = applyEdits(PYTHON_GROUPED, edits);

      // All tagged insertion lines should be removed
      expect(result.includes('x = old_value')).toBe(false);
      expect(result.includes('z = old_value')).toBe(false);
      // Untouched line preserved
      expect(result.includes('y = 2\n')).toBeTruthy();
      // All sidecar entries gone
      expect(result.includes('[^ct-1]')).toBe(false);
    });
  });
});


describe('computeSidecarAccept/Reject edge cases', () => {

  it('returns empty edits for unsupported language', () => {
    const edits = computeSidecarAccept('some code', 'ct-1', 'markdown');
    expect(edits).toStrictEqual([]);
  });

  it('returns empty edits when tag not found in file', () => {
    const edits = computeSidecarAccept(PYTHON_INSERTION, 'ct-99', 'python');
    expect(edits).toStrictEqual([]);
  });

  it('only strips tag from lines matching the requested tag', () => {
    // Accept ct-2 in a file with both ct-1 and ct-2
    const edits = computeSidecarAccept(PYTHON_TWO_CHANGES, 'ct-2', 'python');
    const result = applyEdits(PYTHON_TWO_CHANGES, edits);

    // ct-1 deletion line untouched
    expect(result.includes('# - y = 2  # ct-1')).toBeTruthy();
    // ct-2 insertion line has tag stripped
    expect(result.includes('w = 4\n')).toBeTruthy();
  });

  it('handles file with no trailing newline after sidecar block', () => {
    const noTrailingNL = [
      'x = 1',
      'z = 3  # ct-1',
      'y = 2',
      '',
      `# -- ChangeTracks ${DIVIDER}`,
      '# [^ct-1]: ins | pending',
      `# ${DIVIDER}---------------------`,
    ].join('\n');

    const edits = computeSidecarAccept(noTrailingNL, 'ct-1', 'python');
    const result = applyEdits(noTrailingNL, edits);

    expect(result.includes('z = 3')).toBeTruthy();
    expect(result.includes('# ct-1')).toBe(false);
  });
});


describe('computeSidecarResolveAll', () => {

  function makeChange(id: string, type: ChangeType = ChangeType.Insertion): ChangeNode {
    return {
      id,
      type,
      status: ChangeStatus.Proposed,
      range: { start: 0, end: 10 },
      contentRange: { start: 0, end: 10 },
      level: 0,
      anchored: false,
    };
  }

  it('accept-all with two changes produces non-overlapping edits', () => {
    const edits = computeSidecarResolveAll(
      PYTHON_TWO_CHANGES,
      [makeChange('ct-1', ChangeType.Deletion), makeChange('ct-2')],
      'python',
      'accept'
    );
    const result = applyEdits(PYTHON_TWO_CHANGES, edits);

    // ct-1 deletion accepted: line removed
    expect(result.includes('# - y = 2')).toBe(false);
    // ct-2 insertion accepted: tag stripped
    expect(result.includes('w = 4\n')).toBeTruthy();
    // Entire sidecar block removed
    expect(result.includes('ChangeTracks')).toBe(false);
    // Surrounding code preserved
    expect(result.includes('x = 1\n')).toBeTruthy();
    expect(result.includes('z = 3\n')).toBeTruthy();
  });

  it('reject-all with two changes produces non-overlapping edits', () => {
    const edits = computeSidecarResolveAll(
      PYTHON_TWO_CHANGES,
      [makeChange('ct-1', ChangeType.Deletion), makeChange('ct-2')],
      'python',
      'reject'
    );
    const result = applyEdits(PYTHON_TWO_CHANGES, edits);

    // ct-1 deletion rejected: uncomment (restore original code)
    expect(result.includes('y = 2\n')).toBeTruthy();
    expect(result.includes('# - y = 2')).toBe(false);
    // ct-2 insertion rejected: entire line removed
    expect(result.includes('w = 4')).toBe(false);
    // Entire sidecar block removed
    expect(result.includes('ChangeTracks')).toBe(false);
  });

  it('produces no overlapping edits (each offset range is distinct)', () => {
    const edits = computeSidecarResolveAll(
      PYTHON_TWO_CHANGES,
      [makeChange('ct-1', ChangeType.Deletion), makeChange('ct-2')],
      'python',
      'accept'
    );

    // Sort by offset to check for overlaps
    const sorted = [...edits].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].offset + sorted[i - 1].length;
      expect(sorted[i].offset >= prevEnd).toBeTruthy();
    }
  });

  it('returns empty for unsupported language', () => {
    const edits = computeSidecarResolveAll(PYTHON_TWO_CHANGES, [makeChange('ct-1')], 'markdown', 'accept');
    expect(edits).toStrictEqual([]);
  });

  it('returns empty when no tags match', () => {
    const edits = computeSidecarResolveAll(PYTHON_TWO_CHANGES, [makeChange('ct-99')], 'python', 'accept');
    expect(edits).toStrictEqual([]);
  });

  it('accept-all grouped changes resolves parent + children', () => {
    const edits = computeSidecarResolveAll(
      PYTHON_GROUPED,
      [makeChange('ct-1'), makeChange('ct-1.1'), makeChange('ct-1.2')],
      'python',
      'accept'
    );
    const result = applyEdits(PYTHON_GROUPED, edits);

    // Tags stripped from code
    expect(result.includes('x = old_value\n')).toBeTruthy();
    expect(result.includes('z = old_value\n')).toBeTruthy();
    // Sidecar block removed
    expect(result.includes('ChangeTracks')).toBe(false);
  });
});
