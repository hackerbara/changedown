import * as assert from 'assert';
import { PendingEditManager, CrystallizedEdit, sendPendingEditFlushed } from '@changetracks/lsp-server/internals';
import { Workspace } from '@changetracks/core';

/**
 * Helper: collects crystallized edits emitted by the PendingEditManager.
 * Does NOT provide getDocumentText — merge detection is disabled.
 */
function createTestHarness() {
  const workspace = new Workspace();
  const emittedEdits: CrystallizedEdit[] = [];

  const onCrystallize = (edit: CrystallizedEdit) => {
    emittedEdits.push(edit);
  };

  const manager = new PendingEditManager(workspace, onCrystallize);

  return { manager, emittedEdits, workspace };
}

/**
 * Helper: collects crystallized edits AND simulates a document that applies edits
 * synchronously, enabling merge detection and deletion extension.
 *
 * The onCrystallize callback applies each edit to the simulated document text
 * immediately, so getDocumentText returns the post-edit text when called during
 * merge detection.
 */
function createMergingTestHarness(initialText: string = '') {
  const workspace = new Workspace();
  const emittedEdits: CrystallizedEdit[] = [];
  const docs: Record<string, string> = { 'file:///test.md': initialText };

  const onCrystallize = (edit: CrystallizedEdit) => {
    emittedEdits.push(edit);
    // Apply the edit to the simulated document synchronously
    const text = docs[edit.uri] || '';
    const before = text.substring(0, edit.offset);
    const after = text.substring(edit.offset + edit.length);
    docs[edit.uri] = before + edit.newText + after;
  };

  const getDocumentText = (uri: string): string | undefined => {
    return docs[uri];
  };

  const manager = new PendingEditManager(workspace, onCrystallize, getDocumentText);

  return { manager, emittedEdits, workspace, docs };
}

describe('PendingEditManager', () => {
  describe('Insertion handling', () => {
    it('should accumulate insertion text in pending buffer', () => {
      const { manager, emittedEdits } = createTestHarness();

      // Simulate typing 'h' at offset 0 in document "h"
      manager.handleChange('file:///test.md', '', 'h', 0);

      // No crystallized edit yet — still pending
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));
    });

    it('should accumulate consecutive insertions at adjacent offsets', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', '', 'h', 0);
      manager.handleChange('file:///test.md', '', 'e', 1);
      manager.handleChange('file:///test.md', '', 'l', 2);
      manager.handleChange('file:///test.md', '', 'l', 3);
      manager.handleChange('file:///test.md', '', 'o', 4);

      // Still pending, not crystallized
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));
    });

    it('should flush pending insertion on explicit flush call', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', '', 'h', 0);
      manager.handleChange('file:///test.md', '', 'i', 1);

      manager.flush('file:///test.md');

      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].uri, 'file:///test.md');
      assert.strictEqual(emittedEdits[0].newText, '{++hi++}');
      assert.strictEqual(emittedEdits[0].offset, 0);
      assert.strictEqual(emittedEdits[0].length, 2); // replaces the 2 chars "hi"
      assert.ok(!manager.hasPendingEdit('file:///test.md'));
    });

    it('should flush pending insertion on hard break (non-adjacent offset)', () => {
      const { manager, emittedEdits } = createTestHarness();

      // Type at offset 0
      manager.handleChange('file:///test.md', '', 'a', 0);

      // Jump to offset 10 — hard break
      manager.handleChange('file:///test.md', '', 'b', 10);

      // First edit should have been flushed
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{++a++}');
      assert.strictEqual(emittedEdits[0].offset, 0);

      // Second edit is now pending
      assert.ok(manager.hasPendingEdit('file:///test.md'));

      // Flush the second one
      manager.flush('file:///test.md');
      assert.strictEqual(emittedEdits.length, 2);
      assert.strictEqual(emittedEdits[1].newText, '{++b++}');
      assert.strictEqual(emittedEdits[1].offset, 10);
    });

    it('should keep per-URI pending edits independent', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///doc1.md', '', 'a', 0);

      // Switch to different document — per-URI states are independent,
      // so doc1's pending edit is NOT flushed by editing doc2.
      manager.handleChange('file:///doc2.md', '', 'b', 0);

      // Neither document has been flushed yet
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///doc1.md'));
      assert.ok(manager.hasPendingEdit('file:///doc2.md'));

      // Explicit flushAll crystallizes both
      manager.flushAll();
      assert.strictEqual(emittedEdits.length, 2);
    });
  });

  describe('Deletion handling', () => {
    it('should create pending buffer for deletion (not crystallize immediately)', () => {
      const { manager, emittedEdits } = createTestHarness();

      // Delete 'x' at offset 5 (old text is 'x', new text is '')
      manager.handleChange('file:///test.md', 'x', '', 5);

      // No crystallized edit yet — deletion is now buffered
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));
    });

    it('should crystallize deletion on flush', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', 'x', '', 5);
      manager.flush('file:///test.md');

      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{--x--}');
      assert.strictEqual(emittedEdits[0].offset, 5);
      assert.strictEqual(emittedEdits[0].length, 0); // deletion inserts markup at a point
    });

    it('should flush pending insertion before creating deletion buffer', () => {
      const { manager, emittedEdits } = createTestHarness();

      // Type something first
      manager.handleChange('file:///test.md', '', 'a', 0);

      // Then delete at a different position — hard break flushes insertion,
      // then creates a pending buffer for the deletion
      manager.handleChange('file:///test.md', 'z', '', 10);

      // Should have flushed the insertion only; deletion is now pending
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{++a++}');

      // Deletion is still pending
      assert.ok(manager.hasPendingEdit('file:///test.md'));

      // Flush to crystallize the deletion
      manager.flush('file:///test.md');
      assert.strictEqual(emittedEdits.length, 2);
      assert.strictEqual(emittedEdits[1].newText, '{--z--}');
    });

    it('should handle multi-character deletion', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', 'hello', '', 0);
      manager.flush('file:///test.md');

      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{--hello--}');
    });

    it('should coalesce rapid backspaces into one deletion', () => {
      const { manager, emittedEdits } = createTestHarness();

      // Simulate three consecutive backspace presses: delete 'c' at 2, 'b' at 1, 'a' at 0
      // First backspace creates a buffer, subsequent ones extend-backward
      manager.handleChange('file:///test.md', 'c', '', 2);
      manager.handleChange('file:///test.md', 'b', '', 1);
      manager.handleChange('file:///test.md', 'a', '', 0);

      // All three are coalesced in the buffer — no crystallized edits yet
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));

      // Flush produces a single coalesced deletion
      manager.flush('file:///test.md');
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{--abc--}');
      assert.strictEqual(emittedEdits[0].offset, 0);
    });
  });

  describe('Substitution handling', () => {
    it('should create pending buffer for substitution (not crystallize immediately)', () => {
      const { manager, emittedEdits } = createTestHarness();

      // Replace 'old' with 'new' at offset 5
      manager.handleChange('file:///test.md', 'old', 'new', 5);

      // No crystallized edit yet — substitution is now buffered
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));
    });

    it('should crystallize substitution on flush', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', 'old', 'new', 5);
      manager.flush('file:///test.md');

      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{~~old~>new~~}');
      assert.strictEqual(emittedEdits[0].offset, 5);
      assert.strictEqual(emittedEdits[0].length, 3); // originalText length
    });

    it('should flush pending insertion before creating substitution buffer', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', '', 'a', 0);
      manager.handleChange('file:///test.md', 'old', 'new', 10);

      // Insertion flushed, substitution pending
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{++a++}');
      assert.ok(manager.hasPendingEdit('file:///test.md'));

      // Flush to crystallize the substitution
      manager.flush('file:///test.md');
      assert.strictEqual(emittedEdits.length, 2);
      assert.strictEqual(emittedEdits[1].newText, '{~~old~>new~~}');
    });

    it('should handle substitution with different lengths', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', 'ab', 'xyz', 0);
      manager.flush('file:///test.md');

      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{~~ab~>xyz~~}');
      assert.strictEqual(emittedEdits[0].offset, 0);
      assert.strictEqual(emittedEdits[0].length, 3); // replaces the 3 chars of new text "xyz"
    });
  });

  describe('Pause threshold', () => {
    it('should default to 2000ms pause threshold', () => {
      const { manager } = createTestHarness();
      assert.strictEqual(manager.getPauseThreshold(), 2000);
    });

    it('should set 500ms at sensitivity 1.0', () => {
      const { manager } = createTestHarness();
      manager.setPauseThreshold(1.0);
      assert.strictEqual(manager.getPauseThreshold(), 500);
    });

    it('should set 1000ms at sensitivity 0.75', () => {
      const { manager } = createTestHarness();
      manager.setPauseThreshold(0.75);
      assert.strictEqual(manager.getPauseThreshold(), 1000);
    });

    it('should set Infinity at sensitivity 0', () => {
      const { manager } = createTestHarness();
      manager.setPauseThreshold(0);
      assert.strictEqual(manager.getPauseThreshold(), Infinity);
    });

    it('should set 4000ms at sensitivity 0.25', () => {
      const { manager } = createTestHarness();
      manager.setPauseThreshold(0.25);
      assert.strictEqual(manager.getPauseThreshold(), 4000);
    });
  });

  describe('Adjacent edit merging', () => {
    it('should report merge opportunity for adjacent insertions', () => {
      const { manager, emittedEdits } = createTestHarness();

      // Simulate: document already has {++a++} and we flush another insertion right after
      // The manager emits crystallized edits; the merge detection is a separate concern.
      // Here we test that the manager provides mergeCheck data with each flush.

      manager.handleChange('file:///test.md', '', 'a', 0);
      manager.flush('file:///test.md');

      assert.strictEqual(emittedEdits.length, 1);
      // The emitted edit includes the anchor offset for the caller to check merging
      assert.strictEqual(emittedEdits[0].anchorOffset, 0);
    });
  });

  describe('Dispose', () => {
    it('should clear pending edits and timers on dispose', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', '', 'a', 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));

      manager.dispose();

      assert.ok(!manager.hasPendingEdit('file:///test.md'));
      // Dispose should NOT flush — just discard
      assert.strictEqual(emittedEdits.length, 0);
    });
  });

  describe('Notification sender', () => {
    it('should send changetracks/pendingEditFlushed notification', () => {
      const notifications: Array<{ method: string; params: any }> = [];
      const mockConnection = {
        sendNotification: (method: string, params: any) => {
          notifications.push({ method, params });
        }
      };

      sendPendingEditFlushed(
        mockConnection as any,
        'file:///test.md',
        { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        '{++hello++}'
      );

      assert.strictEqual(notifications.length, 1);
      assert.strictEqual(notifications[0].method, 'changetracks/pendingEditFlushed');
      assert.strictEqual(notifications[0].params.uri, 'file:///test.md');
      assert.strictEqual(notifications[0].params.newText, '{++hello++}');
      assert.deepStrictEqual(notifications[0].params.range, {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 }
      });
    });
  });

  describe('Multi-document isolation', () => {
    it('should track pending edits per document independently', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///doc1.md', '', 'a', 0);
      manager.handleChange('file:///doc2.md', '', 'b', 0);

      // Per-URI states are independent — both are still pending
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///doc1.md'));
      assert.ok(manager.hasPendingEdit('file:///doc2.md'));

      // Flush doc1 only
      manager.flush('file:///doc1.md');
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].uri, 'file:///doc1.md');

      // doc2 is still pending
      assert.ok(manager.hasPendingEdit('file:///doc2.md'));
      assert.ok(!manager.hasPendingEdit('file:///doc1.md'));
    });

    it('should flush only the specified document', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', '', 'a', 0);

      // Flush a different URI — nothing should happen
      manager.flush('file:///other.md');
      assert.strictEqual(emittedEdits.length, 0);

      // Flush the correct URI
      manager.flush('file:///test.md');
      assert.strictEqual(emittedEdits.length, 1);
    });
  });

  describe('Adjacent insertion merging', () => {
    it('should merge adjacent insertions after two flushes', () => {
      // Scenario: type "a", flush, type "b" right after {++a++}, flush
      // Expected: flush #1 emits {++a++}, flush #2 emits {++b++}, then merge emits {++ab++}
      const { manager, emittedEdits, docs } = createMergingTestHarness('');

      // First edit session: type "a" at offset 0
      manager.handleChange('file:///test.md', '', 'a', 0);
      manager.flush('file:///test.md');

      // After first flush: doc = "{++a++}", emittedEdits has 1 edit
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{++a++}');
      assert.strictEqual(docs['file:///test.md'], '{++a++}');

      // Second edit session: type "b" at offset 7 (right after {++a++})
      manager.handleChange('file:///test.md', '', 'b', 7);
      manager.flush('file:///test.md');

      // After second flush:
      // Edit #2: crystallize {++b++} at offset 7 -> doc becomes "{++a++}{++b++}"
      // Edit #3: merge detects adjacent insertions -> replaces {++a++}{++b++} with {++ab++}
      assert.strictEqual(emittedEdits.length, 3);
      assert.strictEqual(emittedEdits[1].newText, '{++b++}');
      assert.strictEqual(emittedEdits[2].newText, '{++ab++}');
      assert.strictEqual(emittedEdits[2].offset, 0); // starts at the first change
      assert.strictEqual(emittedEdits[2].length, 14); // replaces "{++a++}{++b++}" (14 chars)
      assert.strictEqual(docs['file:///test.md'], '{++ab++}');
    });

    it('should merge with preceding insertion when flushed before existing', () => {
      // Document already has "{++hello++}" and we flush an insertion right after it
      const { manager, emittedEdits, docs } = createMergingTestHarness('{++hello++}');

      // Type " world" at offset 11 (right after {++hello++})
      manager.handleChange('file:///test.md', '', ' world', 11);
      manager.flush('file:///test.md');

      // Edit #1: crystallize {++ world++} at offset 11
      // Edit #2: merge {++hello++}{++ world++} -> {++hello world++}
      assert.strictEqual(emittedEdits.length, 2);
      assert.strictEqual(emittedEdits[0].newText, '{++ world++}');
      assert.strictEqual(emittedEdits[1].newText, '{++hello world++}');
      assert.strictEqual(docs['file:///test.md'], '{++hello world++}');
    });

    it('should NOT merge non-adjacent insertions', () => {
      // Document has "{++a++} gap " — not adjacent, no merge
      const { manager, emittedEdits, docs } = createMergingTestHarness('{++a++} gap ');

      manager.handleChange('file:///test.md', '', 'b', 12);
      manager.flush('file:///test.md');

      // Only 1 edit emitted (the crystallized insertion), no merge
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{++b++}');
      assert.strictEqual(docs['file:///test.md'], '{++a++} gap {++b++}');
    });

    it('should NOT merge different change types', () => {
      // Document has "{--deleted--}" and we flush an insertion right after it
      const { manager, emittedEdits, docs } = createMergingTestHarness('{--deleted--}');

      manager.handleChange('file:///test.md', '', 'x', 13);
      manager.flush('file:///test.md');

      // Only 1 edit: the crystallized insertion. No merge (different types).
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{++x++}');
      assert.strictEqual(docs['file:///test.md'], '{--deleted--}{++x++}');
    });

    it('should skip merge when getDocumentText is not provided', () => {
      // Use the basic harness (no getDocumentText)
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', '', 'a', 0);
      manager.flush('file:///test.md');

      // Only 1 edit, no merge attempt
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{++a++}');
    });
  });

  describe('Deletion buffer coalescing', () => {
    it('should coalesce consecutive backspaces via buffer', () => {
      // Simulate: user presses backspace three times deleting 'c', 'b', 'a' (right to left)
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', 'c', '', 2); // delete 'c' at offset 2
      manager.handleChange('file:///test.md', 'b', '', 1); // backspace 'b' at offset 1
      manager.handleChange('file:///test.md', 'a', '', 0); // backspace 'a' at offset 0

      // All coalesced in buffer — nothing emitted yet
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));

      // Flush produces single coalesced deletion
      manager.flush('file:///test.md');
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{--abc--}');
      assert.strictEqual(emittedEdits[0].offset, 0);
    });

    it('should coalesce forward deletes via buffer', () => {
      // Simulate: user presses Delete key three times at offset 5, removing 'x', 'y', 'z'
      const { manager, emittedEdits } = createTestHarness();

      // First deletion creates buffer at offset 5 with originalText='x'
      manager.handleChange('file:///test.md', 'x', '', 5);
      // Buffer currentText is '', so bufferEnd = 5. Delete at offset 5 = extend-forward
      manager.handleChange('file:///test.md', 'y', '', 5);
      manager.handleChange('file:///test.md', 'z', '', 5);

      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));

      manager.flush('file:///test.md');
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{--xyz--}');
      assert.strictEqual(emittedEdits[0].offset, 5);
    });

    it('should create new deletion buffer when no existing pending edit', () => {
      const { manager, emittedEdits } = createTestHarness();

      manager.handleChange('file:///test.md', 'x', '', 5);

      // Deletion creates a pending buffer, not an immediate edit
      assert.strictEqual(emittedEdits.length, 0);
      assert.ok(manager.hasPendingEdit('file:///test.md'));

      manager.flush('file:///test.md');
      assert.strictEqual(emittedEdits.length, 1);
      assert.strictEqual(emittedEdits[0].newText, '{--x--}');
      assert.strictEqual(emittedEdits[0].length, 0); // deletion inserts markup at a point
    });
  });
});
