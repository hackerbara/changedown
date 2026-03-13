import * as assert from 'node:assert';
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
      assert.ok(result.includes('z = 3\n'), `Expected clean code line in:\n${result}`);
      // The sc tag should be gone from the code
      assert.ok(!result.includes('# ct-1'), `Expected no sc tag in code area of:\n${result}`);
    });

    it('preserves indentation when stripping tag', () => {
      const edits = computeSidecarAccept(PYTHON_INDENTED_INSERTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INDENTED_INSERTION, edits);

      assert.ok(result.includes('    z = 3\n'), `Expected indented clean line in:\n${result}`);
    });

    it('works with TypeScript comment syntax', () => {
      const edits = computeSidecarAccept(TS_INSERTION, 'ct-1', 'typescript');
      const result = applyEdits(TS_INSERTION, edits);

      assert.ok(result.includes('const z = 3;\n'), `Expected clean TS line in:\n${result}`);
      assert.ok(!result.includes('// ct-1'), `Expected no sc tag in:\n${result}`);
    });
  });

  // ─── Accept deletion ──────────────────────────────────────────────────
  describe('deletion', () => {
    it('removes the entire deletion marker line', () => {
      const edits = computeSidecarAccept(PYTHON_DELETION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_DELETION, edits);

      // The deletion marker line should be completely gone
      assert.ok(!result.includes('# - y = 2'), `Expected deletion marker removed in:\n${result}`);
      // Surrounding lines preserved
      assert.ok(result.includes('x = 1\n'), `Expected x=1 preserved in:\n${result}`);
      assert.ok(result.includes('z = 3\n'), `Expected z=3 preserved in:\n${result}`);
    });

    it('removes indented deletion marker line', () => {
      const edits = computeSidecarAccept(PYTHON_INDENTED_DELETION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INDENTED_DELETION, edits);

      assert.ok(!result.includes('# - y = 2'), `Expected indented deletion removed in:\n${result}`);
      assert.ok(result.includes('    x = 1\n'), `Expected x=1 preserved in:\n${result}`);
      assert.ok(result.includes('    z = 3\n'), `Expected z=3 preserved in:\n${result}`);
    });
  });

  // ─── Accept substitution ──────────────────────────────────────────────
  describe('substitution', () => {
    it('keeps new code (strips tag), removes old code (deletion line)', () => {
      const edits = computeSidecarAccept(PYTHON_SUBSTITUTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_SUBSTITUTION, edits);

      // New code kept, tag stripped
      assert.ok(result.includes('results = {}\n'), `Expected new code kept in:\n${result}`);
      // Old code (deletion marker) removed
      assert.ok(!result.includes('# - results = []'), `Expected old code removed in:\n${result}`);
      // No sc tag in code area
      assert.ok(!result.includes('# ct-1'), `Expected no sc tag in:\n${result}`);
    });
  });

  // ─── Sidecar block cleanup ────────────────────────────────────────────
  describe('sidecar block cleanup', () => {
    it('removes the sidecar entry for the resolved tag', () => {
      const edits = computeSidecarAccept(PYTHON_TWO_CHANGES, 'ct-1', 'python');
      const result = applyEdits(PYTHON_TWO_CHANGES, edits);

      // ct-1 entry gone
      assert.ok(!result.includes('[^ct-1]'), `Expected ct-1 entry removed in:\n${result}`);
      // ct-2 entry still present
      assert.ok(result.includes('[^ct-2]: ins | pending'), `Expected ct-2 entry preserved in:\n${result}`);
      // Sidecar block header/footer still present
      assert.ok(result.includes('ChangeTracks'), `Expected sidecar block still present in:\n${result}`);
    });

    it('removes the entire sidecar block when last change resolved', () => {
      const edits = computeSidecarAccept(PYTHON_SINGLE_FOR_BLOCK_REMOVAL, 'ct-1', 'python');
      const result = applyEdits(PYTHON_SINGLE_FOR_BLOCK_REMOVAL, edits);

      // Entire sidecar block gone
      assert.ok(!result.includes('ChangeTracks'), `Expected entire sidecar block removed in:\n${result}`);
      assert.ok(!result.includes('[^ct-1]'), `Expected no sidecar entries in:\n${result}`);
      // Code is clean
      assert.ok(result.includes('z = 3\n'), `Expected code preserved in:\n${result}`);
    });
  });

  // ─── Grouped changes (dotted IDs) ─────────────────────────────────────
  describe('grouped changes (dotted IDs)', () => {
    it('accepts all children when accepting parent tag', () => {
      const edits = computeSidecarAccept(PYTHON_GROUPED, 'ct-1', 'python');
      const result = applyEdits(PYTHON_GROUPED, edits);

      // All child tags should be stripped
      assert.ok(!result.includes('# ct-1.1'), `Expected ct-1.1 tag stripped in:\n${result}`);
      assert.ok(!result.includes('# ct-1.2'), `Expected ct-1.2 tag stripped in:\n${result}`);
      // Code kept
      assert.ok(result.includes('x = old_value\n'), `Expected first line code kept in:\n${result}`);
      assert.ok(result.includes('z = old_value\n'), `Expected third line code kept in:\n${result}`);
      // All sidecar entries gone
      assert.ok(!result.includes('[^ct-1]'), `Expected parent entry removed in:\n${result}`);
      assert.ok(!result.includes('[^ct-1.1]'), `Expected child entry 1 removed in:\n${result}`);
      assert.ok(!result.includes('[^ct-1.2]'), `Expected child entry 2 removed in:\n${result}`);
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
      assert.ok(!result.includes('z = 3'), `Expected inserted line removed in:\n${result}`);
      // Surrounding lines preserved
      assert.ok(result.includes('x = 1\n'), `Expected x=1 preserved in:\n${result}`);
      assert.ok(result.includes('y = 2\n'), `Expected y=2 preserved in:\n${result}`);
    });

    it('removes indented inserted line', () => {
      const edits = computeSidecarReject(PYTHON_INDENTED_INSERTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INDENTED_INSERTION, edits);

      assert.ok(!result.includes('z = 3'), `Expected indented inserted line removed in:\n${result}`);
      assert.ok(result.includes('    x = 1\n'), `Expected x=1 preserved in:\n${result}`);
      assert.ok(result.includes('    y = 2\n'), `Expected y=2 preserved in:\n${result}`);
    });
  });

  // ─── Reject deletion ──────────────────────────────────────────────────
  describe('deletion', () => {
    it('uncomments the deletion line, restoring original code', () => {
      const edits = computeSidecarReject(PYTHON_DELETION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_DELETION, edits);

      // The deletion marker should be gone, replaced with original code
      assert.ok(!result.includes('# - y = 2'), `Expected deletion marker removed in:\n${result}`);
      assert.ok(result.includes('y = 2\n'), `Expected original code restored in:\n${result}`);
      // Surrounding lines preserved
      assert.ok(result.includes('x = 1\n'), `Expected x=1 preserved in:\n${result}`);
      assert.ok(result.includes('z = 3\n'), `Expected z=3 preserved in:\n${result}`);
    });

    it('restores indented code correctly', () => {
      const edits = computeSidecarReject(PYTHON_INDENTED_DELETION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INDENTED_DELETION, edits);

      assert.ok(!result.includes('# - y = 2'), `Expected deletion marker removed in:\n${result}`);
      assert.ok(result.includes('    y = 2\n'), `Expected indented original code restored in:\n${result}`);
    });
  });

  // ─── Reject substitution ──────────────────────────────────────────────
  describe('substitution', () => {
    it('restores old code (uncomments deletions), removes new code', () => {
      const edits = computeSidecarReject(PYTHON_SUBSTITUTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_SUBSTITUTION, edits);

      // Old code restored (uncommented)
      assert.ok(result.includes('results = []\n'), `Expected old code restored in:\n${result}`);
      // New code removed
      assert.ok(!result.includes('results = {}'), `Expected new code removed in:\n${result}`);
      // No sc tag
      assert.ok(!result.includes('# ct-1'), `Expected no sc tag in:\n${result}`);
    });
  });

  // ─── Sidecar block cleanup ────────────────────────────────────────────
  describe('sidecar block cleanup', () => {
    it('removes the sidecar entry for the resolved tag', () => {
      const edits = computeSidecarReject(PYTHON_TWO_CHANGES, 'ct-2', 'python');
      const result = applyEdits(PYTHON_TWO_CHANGES, edits);

      // ct-2 entry gone
      assert.ok(!result.includes('[^ct-2]'), `Expected ct-2 entry removed in:\n${result}`);
      // ct-1 entry still present
      assert.ok(result.includes('[^ct-1]: del | pending'), `Expected ct-1 entry preserved in:\n${result}`);
    });

    it('removes the entire sidecar block when last change resolved', () => {
      const edits = computeSidecarReject(PYTHON_INSERTION, 'ct-1', 'python');
      const result = applyEdits(PYTHON_INSERTION, edits);

      // Entire sidecar block gone
      assert.ok(!result.includes('ChangeTracks'), `Expected entire sidecar block removed in:\n${result}`);
    });
  });

  // ─── Grouped changes (dotted IDs) ─────────────────────────────────────
  describe('grouped changes (dotted IDs)', () => {
    it('rejects all children when rejecting parent tag', () => {
      const edits = computeSidecarReject(PYTHON_GROUPED, 'ct-1', 'python');
      const result = applyEdits(PYTHON_GROUPED, edits);

      // All tagged insertion lines should be removed
      assert.ok(!result.includes('x = old_value'), `Expected first tagged line removed in:\n${result}`);
      assert.ok(!result.includes('z = old_value'), `Expected second tagged line removed in:\n${result}`);
      // Untouched line preserved
      assert.ok(result.includes('y = 2\n'), `Expected untouched line preserved in:\n${result}`);
      // All sidecar entries gone
      assert.ok(!result.includes('[^ct-1]'), `Expected all sidecar entries removed in:\n${result}`);
    });
  });
});


describe('computeSidecarAccept/Reject edge cases', () => {

  it('returns empty edits for unsupported language', () => {
    const edits = computeSidecarAccept('some code', 'ct-1', 'markdown');
    assert.deepStrictEqual(edits, []);
  });

  it('returns empty edits when tag not found in file', () => {
    const edits = computeSidecarAccept(PYTHON_INSERTION, 'ct-99', 'python');
    assert.deepStrictEqual(edits, []);
  });

  it('only strips tag from lines matching the requested tag', () => {
    // Accept ct-2 in a file with both ct-1 and ct-2
    const edits = computeSidecarAccept(PYTHON_TWO_CHANGES, 'ct-2', 'python');
    const result = applyEdits(PYTHON_TWO_CHANGES, edits);

    // ct-1 deletion line untouched
    assert.ok(result.includes('# - y = 2  # ct-1'), `Expected ct-1 line untouched in:\n${result}`);
    // ct-2 insertion line has tag stripped
    assert.ok(result.includes('w = 4\n'), `Expected ct-2 code with tag stripped in:\n${result}`);
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

    assert.ok(result.includes('z = 3'), `Expected code preserved in:\n${result}`);
    assert.ok(!result.includes('# ct-1'), `Expected tag stripped in:\n${result}`);
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
    assert.ok(!result.includes('# - y = 2'), `Expected deletion marker removed in:\n${result}`);
    // ct-2 insertion accepted: tag stripped
    assert.ok(result.includes('w = 4\n'), `Expected ct-2 code with tag stripped in:\n${result}`);
    // Entire sidecar block removed
    assert.ok(!result.includes('ChangeTracks'), `Expected sidecar block removed in:\n${result}`);
    // Surrounding code preserved
    assert.ok(result.includes('x = 1\n'), `Expected x=1 preserved in:\n${result}`);
    assert.ok(result.includes('z = 3\n'), `Expected z=3 preserved in:\n${result}`);
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
    assert.ok(result.includes('y = 2\n'), `Expected original code restored in:\n${result}`);
    assert.ok(!result.includes('# - y = 2'), `Expected deletion marker removed in:\n${result}`);
    // ct-2 insertion rejected: entire line removed
    assert.ok(!result.includes('w = 4'), `Expected inserted line removed in:\n${result}`);
    // Entire sidecar block removed
    assert.ok(!result.includes('ChangeTracks'), `Expected sidecar block removed in:\n${result}`);
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
      assert.ok(
        sorted[i].offset >= prevEnd,
        `Edit overlap detected: edit at offset ${sorted[i - 1].offset} (len ${sorted[i - 1].length}) ` +
        `overlaps with edit at offset ${sorted[i].offset}`
      );
    }
  });

  it('returns empty for unsupported language', () => {
    const edits = computeSidecarResolveAll(PYTHON_TWO_CHANGES, [makeChange('ct-1')], 'markdown', 'accept');
    assert.deepStrictEqual(edits, []);
  });

  it('returns empty when no tags match', () => {
    const edits = computeSidecarResolveAll(PYTHON_TWO_CHANGES, [makeChange('ct-99')], 'python', 'accept');
    assert.deepStrictEqual(edits, []);
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
    assert.ok(result.includes('x = old_value\n'), `Expected first line code kept in:\n${result}`);
    assert.ok(result.includes('z = old_value\n'), `Expected third line code kept in:\n${result}`);
    // Sidecar block removed
    assert.ok(!result.includes('ChangeTracks'), `Expected sidecar block removed in:\n${result}`);
  });
});
