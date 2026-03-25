import { describe, it, expect } from 'vitest';

/**
 * Test the getPendingChangeNodes logic directly.
 *
 * PendingEditManager requires VS Code APIs (vscode.Range, editor.edit, etc.)
 * which are unavailable in vitest. Instead, we test the ChangeNode production
 * logic by replicating the pure mapping function.
 *
 * Note: ChangeType and ChangeStatus are string enums from @changetracks/core.
 * We mirror their values here because the 'diff' transitive dependency lacks
 * a CJS build in this vitest context (confirmed: all lsp/ tests that import
 * from @changetracks/core fail with the same error).
 *
 * IMPORTANT: pendingBufferToChangeNodes below must be kept in sync with
 * PendingEditManager.getPendingChangeNodes() in packages/vscode-extension/.
 */

// Mirror ChangeType / ChangeStatus enum values (string enums — values === keys)
const ChangeType = {
  Insertion: 'Insertion',
  Deletion: 'Deletion',
  Substitution: 'Substitution',
} as const;

const ChangeStatus = {
  Proposed: 'Proposed',
} as const;

interface PendingBuffer {
  anchorOffset: number;
  currentText: string;
  originalText: string;
  cursorOffset: number;
  startTime: number;
  lastEditTime: number;
  scId?: string;
}

/**
 * Replicate the getPendingChangeNodes logic for testing.
 */
function pendingBufferToChangeNodes(buf: PendingBuffer | null) {
  if (!buf) return [];

  const hasNew = buf.currentText.length > 0;
  const hasOld = buf.originalText.length > 0;

  if (hasNew && !hasOld) {
    return [{
      id: '',
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
      contentRange: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
      modifiedText: buf.currentText,
      originalText: '',
      level: 0,
      anchored: false,
    }];
  }

  if (!hasNew && hasOld) {
    return [{
      id: '',
      type: ChangeType.Deletion,
      status: ChangeStatus.Proposed,
      range: { start: buf.anchorOffset, end: buf.anchorOffset },
      contentRange: { start: buf.anchorOffset, end: buf.anchorOffset },
      modifiedText: '',
      originalText: buf.originalText,
      level: 0,
      anchored: false,
    }];
  }

  if (hasNew && hasOld) {
    return [{
      id: '',
      type: ChangeType.Substitution,
      status: ChangeStatus.Proposed,
      range: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
      contentRange: { start: buf.anchorOffset, end: buf.anchorOffset + buf.currentText.length },
      modifiedText: buf.currentText,
      originalText: buf.originalText,
      level: 0,
      anchored: false,
    }];
  }

  return [];
}

describe('getPendingChangeNodes logic', () => {
  it('returns empty array when no pending buffer', () => {
    const result = pendingBufferToChangeNodes(null);
    expect(result).toEqual([]);
  });

  it('returns Insertion ChangeNode for pending insertion', () => {
    const buf: PendingBuffer = {
      anchorOffset: 50,
      currentText: 'hello',
      originalText: '',
      cursorOffset: 5,
      startTime: Date.now(),
      lastEditTime: Date.now(),
      scId: 'ct-5',
    };

    const result = pendingBufferToChangeNodes(buf);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(ChangeType.Insertion);
    expect(result[0].range).toEqual({ start: 50, end: 55 });
    expect(result[0].modifiedText).toBe('hello');
    expect(result[0].id).toBe('');
    expect(result[0].level).toBe(0);
    expect(result[0].anchored).toBe(false);
    expect(result[0].status).toBe(ChangeStatus.Proposed);
  });

  it('returns Deletion ChangeNode for pending deletion', () => {
    const buf: PendingBuffer = {
      anchorOffset: 60,
      currentText: '',
      originalText: 'world',
      cursorOffset: 0,
      startTime: Date.now(),
      lastEditTime: Date.now(),
    };

    const result = pendingBufferToChangeNodes(buf);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(ChangeType.Deletion);
    expect(result[0].range).toEqual({ start: 60, end: 60 }); // zero-width
    expect(result[0].originalText).toBe('world');
    expect(result[0].id).toBe('');
    expect(result[0].level).toBe(0);
  });

  it('returns Substitution ChangeNode for pending substitution', () => {
    const buf: PendingBuffer = {
      anchorOffset: 50,
      currentText: 'new',
      originalText: 'old',
      cursorOffset: 3,
      startTime: Date.now(),
      lastEditTime: Date.now(),
    };

    const result = pendingBufferToChangeNodes(buf);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(ChangeType.Substitution);
    expect(result[0].range).toEqual({ start: 50, end: 53 });
    expect(result[0].originalText).toBe('old');
    expect(result[0].modifiedText).toBe('new');
  });

  it('returns empty array for empty buffer (no text, no original)', () => {
    const buf: PendingBuffer = {
      anchorOffset: 50,
      currentText: '',
      originalText: '',
      cursorOffset: 0,
      startTime: Date.now(),
      lastEditTime: Date.now(),
    };

    const result = pendingBufferToChangeNodes(buf);
    expect(result).toEqual([]);
  });

  it('optimistic nodes are distinguishable from LSP-sourced nodes', () => {
    const buf: PendingBuffer = {
      anchorOffset: 10,
      currentText: 'test',
      originalText: '',
      cursorOffset: 4,
      startTime: Date.now(),
      lastEditTime: Date.now(),
    };

    const result = pendingBufferToChangeNodes(buf);
    // Both filtering conditions from the spec work:
    expect(result[0].id).toBe('');       // id === '' filter
    expect(result[0].level).toBe(0);     // level === 0 filter
    // An LSP-sourced node would have id like 'ct-5' and level >= 1
  });
});
