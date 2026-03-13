import * as assert from 'node:assert';
import type {
  EditBoundaryState,
  EditBoundaryConfig,
  Effect,
} from '@changetracks/core/edit-boundary';
import {
  processEvent,
  createBuffer,
  DEFAULT_EDIT_BOUNDARY_CONFIG,
} from '@changetracks/core/edit-boundary';
import type { ProcessEventContext } from '@changetracks/core/edit-boundary';

// ── Test helpers ────────────────────────────────────────────────────────

const NOW = 1000;

function defaultConfig(): EditBoundaryConfig {
  return { ...DEFAULT_EDIT_BOUNDARY_CONFIG };
}

function stateNoPending(configOverride?: Partial<EditBoundaryConfig>): EditBoundaryState {
  return {
    pending: null,
    isComposing: false,
    config: { ...defaultConfig(), ...configOverride },
  };
}

function stateWithPending(
  text: string,
  anchorOffset = 10,
  configOverride?: Partial<EditBoundaryConfig>,
  scId = 'ct-1',
  originalText = '',
): EditBoundaryState {
  return {
    pending: createBuffer(anchorOffset, text, originalText, NOW, scId),
    isComposing: false,
    config: { ...defaultConfig(), ...configOverride },
  };
}

function stateComposing(
  text: string,
  anchorOffset = 10,
): EditBoundaryState {
  return {
    pending: createBuffer(anchorOffset, text, '', NOW, 'ct-1'),
    isComposing: true,
    config: defaultConfig(),
  };
}

function ctx(allocateScId?: () => string): ProcessEventContext {
  return { now: NOW, allocateScId };
}

/** Find effects of a specific type. */
function effectsOfType<T extends Effect['type']>(
  effects: Effect[],
  type: T,
): Extract<Effect, { type: T }>[] {
  return effects.filter((e): e is Extract<Effect, { type: T }> => e.type === type);
}

/** Assert a single effect of given type exists and return it. */
function singleEffect<T extends Effect['type']>(
  effects: Effect[],
  type: T,
): Extract<Effect, { type: T }> {
  const matches = effectsOfType(effects, type);
  assert.strictEqual(matches.length, 1, `Expected exactly 1 '${type}' effect, got ${matches.length}`);
  return matches[0];
}

/** Assert no effects of given type exist. */
function noEffect(effects: Effect[], type: Effect['type']): void {
  const matches = effectsOfType(effects, type);
  assert.strictEqual(matches.length, 0, `Expected no '${type}' effects, got ${matches.length}`);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('processEvent (state machine)', () => {
  // ── 1. No pending buffer + insertion → creates buffer ────────────────

  describe('no pending + insertion', () => {
    it('creates a buffer with the inserted text', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'a' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, 'a');
      assert.strictEqual(newState.pending!.anchorOffset, 5);
    });

    it('emits updatePendingOverlay with correct data', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'abc' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      assert.ok(overlay.overlay !== null);
      assert.strictEqual(overlay.overlay!.anchorOffset, 5);
      assert.strictEqual(overlay.overlay!.currentLength, 3);
      assert.strictEqual(overlay.overlay!.currentText, 'abc');
      assert.strictEqual(overlay.overlay!.cursorOffset, 3);
    });

    it('calls allocateScId and assigns it to the buffer', () => {
      let called = false;
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'x' },
        ctx(() => { called = true; return 'ct-42'; }),
      );
      assert.ok(called, 'allocateScId should have been called');
      assert.strictEqual(newState.pending!.scId, 'ct-42');
    });

    it('works without allocateScId', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'x' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.scId, undefined);
    });

    it('sets cursorOffset to text length', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 0, text: 'hello' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.cursorOffset, 5);
    });
  });

  // ── 2. No pending buffer + deletion → creates buffer ──────────────────

  describe('no pending + deletion', () => {
    it('creates a buffer with empty currentText and deletion as originalText', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'deletion', offset: 5, deletedText: 'abc' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, '');
      assert.strictEqual(newState.pending!.originalText, 'abc');
      assert.strictEqual(newState.pending!.anchorOffset, 5);
    });

    it('emits overlay, not crystallize', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'deletion', offset: 5, deletedText: 'x' },
        ctx(),
      );
      noEffect(effects, 'crystallize');
      singleEffect(effects, 'updatePendingOverlay');
    });

    it('calls allocateScId for deletion buffer', () => {
      let called = false;
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'deletion', offset: 5, deletedText: 'x' },
        ctx(() => { called = true; return 'ct-42'; }),
      );
      assert.ok(called, 'allocateScId should have been called');
      assert.strictEqual(newState.pending!.scId, 'ct-42');
    });
  });

  // ── 3. No pending buffer + substitution → creates buffer ──────────────

  describe('no pending + substitution', () => {
    it('creates buffer with both currentText and originalText', () => {
      const { effects, newState } = processEvent(
        stateNoPending(),
        { type: 'substitution', offset: 5, oldText: 'abc', newText: 'XYZ' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, 'XYZ');
      assert.strictEqual(newState.pending!.originalText, 'abc');
      assert.strictEqual(newState.pending!.anchorOffset, 5);
      noEffect(effects, 'crystallize');
      singleEffect(effects, 'updatePendingOverlay');
    });
  });

  // ── 4. Extend ────────────────────────────────────────────────────────

  describe('extend (append at buffer end)', () => {
    it('appends text to existing buffer', () => {
      const { newState } = processEvent(
        stateWithPending('hel', 10),
        { type: 'insertion', offset: 13, text: 'lo' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.currentText, 'hello');
    });

    it('preserves anchorOffset', () => {
      const { newState } = processEvent(
        stateWithPending('abc', 10),
        { type: 'insertion', offset: 13, text: 'd' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.anchorOffset, 10);
    });

    it('advances cursorOffset', () => {
      const { newState } = processEvent(
        stateWithPending('abc', 10),
        { type: 'insertion', offset: 13, text: 'de' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.cursorOffset, 5);
    });

    it('emits updatePendingOverlay with extended data', () => {
      const { effects } = processEvent(
        stateWithPending('hel', 10),
        { type: 'insertion', offset: 13, text: 'lo' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      assert.ok(overlay.overlay !== null);
      assert.strictEqual(overlay.overlay!.currentText, 'hello');
      assert.strictEqual(overlay.overlay!.currentLength, 5);
    });

    it('preserves scId through extension', () => {
      const { newState } = processEvent(
        stateWithPending('a', 10, {}, 'ct-99'),
        { type: 'insertion', offset: 11, text: 'b' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.scId, 'ct-99');
    });
  });

  // ── 5. Splice (backspace at end of currentText) ───────────────────────

  describe('splice (backspace at buffer end)', () => {
    it('removes last character from buffer currentText', () => {
      const { newState } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 14, deletedText: 'o' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, 'hell');
    });

    it('emits updatePendingOverlay with shrunk data', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 14, deletedText: 'o' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      assert.ok(overlay.overlay !== null);
      assert.strictEqual(overlay.overlay!.currentText, 'hell');
      assert.strictEqual(overlay.overlay!.currentLength, 4);
    });

    it('clears pending when buffer becomes empty (single char, no originalText)', () => {
      const { newState } = processEvent(
        stateWithPending('a', 10),
        { type: 'deletion', offset: 10, deletedText: 'a' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
    });

    it('emits null overlay when buffer empties', () => {
      const { effects } = processEvent(
        stateWithPending('a', 10),
        { type: 'deletion', offset: 10, deletedText: 'a' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      assert.strictEqual(overlay.overlay, null);
    });

    it('does NOT emit crystallize when buffer empties (silent discard)', () => {
      const { effects } = processEvent(
        stateWithPending('a', 10),
        { type: 'deletion', offset: 10, deletedText: 'a' },
        ctx(),
      );
      noEffect(effects, 'crystallize');
    });
  });

  // ── 6. Splice insert ────────────────────────────────────────────────

  describe('splice insert (mid-buffer)', () => {
    it('inserts text at mid-buffer position', () => {
      const { newState } = processEvent(
        stateWithPending('hllo', 10),
        { type: 'insertion', offset: 11, text: 'e' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.currentText, 'hello');
    });

    it('emits overlay with spliced buffer', () => {
      const { effects } = processEvent(
        stateWithPending('hllo', 10),
        { type: 'insertion', offset: 11, text: 'e' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      assert.ok(overlay.overlay !== null);
      assert.strictEqual(overlay.overlay!.currentText, 'hello');
    });

    it('inserts at buffer start', () => {
      const { newState } = processEvent(
        stateWithPending('ello', 10),
        { type: 'insertion', offset: 10, text: 'h' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.currentText, 'hello');
    });
  });

  // ── 7. Splice delete ────────────────────────────────────────────────

  describe('splice delete (mid-buffer)', () => {
    it('deletes characters within buffer', () => {
      const { newState } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 11, deletedText: 'el' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, 'hlo');
    });

    it('emits overlay with spliced buffer', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 11, deletedText: 'el' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      assert.ok(overlay.overlay !== null);
      assert.strictEqual(overlay.overlay!.currentText, 'hlo');
    });

    it('clears pending when splice delete empties buffer (no originalText)', () => {
      const { newState } = processEvent(
        stateWithPending('ab', 10),
        { type: 'deletion', offset: 10, deletedText: 'ab' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
    });

    it('emits null overlay when splice empties buffer', () => {
      const { effects } = processEvent(
        stateWithPending('ab', 10),
        { type: 'deletion', offset: 10, deletedText: 'ab' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      assert.strictEqual(overlay.overlay, null);
      noEffect(effects, 'crystallize');
    });
  });

  // ── 8. Save ─────────────────────────────────────────────────────────

  describe('save', () => {
    it('flushes pending buffer', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'save' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      singleEffect(effects, 'crystallize');
    });

    it('emits crystallize with buffer contents', () => {
      const { effects } = processEvent(
        stateWithPending('test', 5),
        { type: 'save' },
        ctx(),
      );
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.changeType, 'insertion');
      assert.strictEqual(cryst.offset, 5);
      assert.strictEqual(cryst.currentText, 'test');
    });
  });

  // ── 9. Save with no pending ──────────────────────────────────────────

  describe('save with no pending', () => {
    it('produces no effects', () => {
      const { newState, effects } = processEvent(
        stateNoPending(),
        { type: 'save' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      assert.strictEqual(effects.length, 0);
    });
  });

  // ── 10. Editor switch ────────────────────────────────────────────────

  describe('editor switch', () => {
    it('flushes pending buffer', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'editorSwitch' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      singleEffect(effects, 'crystallize');
    });

    it('produces no effects with no pending', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'editorSwitch' },
        ctx(),
      );
      assert.strictEqual(effects.length, 0);
    });
  });

  // ── 11. Edit during composition → ignored ────────────────────────────

  describe('edit during composition', () => {
    it('insertion during composition is ignored', () => {
      const { newState, effects } = processEvent(
        stateComposing('hello'),
        { type: 'insertion', offset: 15, text: 'x' },
        ctx(),
      );
      assert.strictEqual(effects.length, 0);
      assert.strictEqual(newState.pending!.currentText, 'hello');
    });

    it('deletion during composition is ignored', () => {
      const { newState, effects } = processEvent(
        stateComposing('hello'),
        { type: 'deletion', offset: 14, deletedText: 'o' },
        ctx(),
      );
      assert.strictEqual(effects.length, 0);
      assert.strictEqual(newState.pending!.currentText, 'hello');
    });

    it('substitution during composition is ignored', () => {
      const { newState, effects } = processEvent(
        stateComposing('hello'),
        { type: 'substitution', offset: 10, oldText: 'he', newText: 'HE' },
        ctx(),
      );
      assert.strictEqual(effects.length, 0);
      assert.strictEqual(newState.pending!.currentText, 'hello');
    });

    it('isComposing flag is preserved', () => {
      const { newState } = processEvent(
        stateComposing('hello'),
        { type: 'insertion', offset: 15, text: 'x' },
        ctx(),
      );
      assert.strictEqual(newState.isComposing, true);
    });
  });

  // ── 12. Explicit flush ───────────────────────────────────────────────

  describe('explicit flush', () => {
    it('flushes pending buffer', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'flush' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.changeType, 'insertion');
      assert.strictEqual(cryst.currentText, 'hello');
    });

    it('no effects when no pending', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'flush' },
        ctx(),
      );
      assert.strictEqual(effects.length, 0);
    });
  });

  // ── 13. Newline insertion (breakOnNewline=true) ──────────────────────

  describe('newline insertion (breakOnNewline=true)', () => {
    it('flushes pending + crystallizes newline (with pending)', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'insertion', offset: 15, text: '\n' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      const crystallizes = effectsOfType(effects, 'crystallize');
      assert.strictEqual(crystallizes.length, 2);
      // First crystallize: flush of pending buffer
      assert.strictEqual(crystallizes[0].changeType, 'insertion');
      assert.strictEqual(crystallizes[0].currentText, 'hello');
      // Second crystallize: the newline itself
      assert.strictEqual(crystallizes[1].changeType, 'insertion');
      assert.strictEqual(crystallizes[1].currentText, '\n');
    });

    it('crystallizes newline immediately with no pending', () => {
      const { newState, effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: '\n' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.changeType, 'insertion');
      assert.strictEqual(cryst.currentText, '\n');
    });

    it('multi-line text causes break', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'insertion', offset: 15, text: 'abc\ndef' },
        ctx(),
      );
      const crystallizes = effectsOfType(effects, 'crystallize');
      assert.ok(crystallizes.length >= 2);
    });
  });

  // ── 14. Newline insertion (breakOnNewline=false) ─────────────────────

  describe('newline insertion (breakOnNewline=false)', () => {
    it('extends buffer instead of breaking', () => {
      const { newState } = processEvent(
        stateWithPending('hello', 10, { breakOnNewline: false }),
        { type: 'insertion', offset: 15, text: '\n' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, 'hello\n');
    });

    it('creates buffer for newline with no pending', () => {
      const { newState } = processEvent(
        stateNoPending({ breakOnNewline: false }),
        { type: 'insertion', offset: 5, text: '\n' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, '\n');
    });
  });

  // ── 15. Paste detection ──────────────────────────────────────────────

  describe('paste detection', () => {
    it('large paste flushes + crystallizes immediately (with pending)', () => {
      const pasteText = 'x'.repeat(50);
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'insertion', offset: 15, text: pasteText },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      const crystallizes = effectsOfType(effects, 'crystallize');
      assert.strictEqual(crystallizes.length, 2);
      assert.strictEqual(crystallizes[0].currentText, 'hello'); // flush
      assert.strictEqual(crystallizes[1].currentText, pasteText); // paste
    });

    it('large paste crystallizes immediately (no pending)', () => {
      const pasteText = 'x'.repeat(50);
      const { newState, effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: pasteText },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.currentText, pasteText);
    });

    it('under-threshold text creates buffer normally', () => {
      const shortText = 'x'.repeat(49);
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: shortText },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, shortText);
    });

    it('custom pasteMinChars threshold', () => {
      const pasteText = 'x'.repeat(10);
      const { newState } = processEvent(
        stateNoPending({ pasteMinChars: 10 }),
        { type: 'insertion', offset: 5, text: pasteText },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
    });
  });

  // ── 16. Multiple sequential insertions extend the same buffer ────────

  describe('multiple sequential insertions', () => {
    it('three sequential typed characters share the same buffer', () => {
      let state = stateNoPending();
      let result = processEvent(state, { type: 'insertion', offset: 0, text: 'h' }, ctx(() => 'ct-1'));
      state = result.newState;
      assert.strictEqual(state.pending!.currentText, 'h');
      assert.strictEqual(state.pending!.scId, 'ct-1');

      result = processEvent(state, { type: 'insertion', offset: 1, text: 'e' }, ctx());
      state = result.newState;
      assert.strictEqual(state.pending!.currentText, 'he');
      assert.strictEqual(state.pending!.scId, 'ct-1');

      result = processEvent(state, { type: 'insertion', offset: 2, text: 'l' }, ctx());
      state = result.newState;
      assert.strictEqual(state.pending!.currentText, 'hel');
      assert.strictEqual(state.pending!.scId, 'ct-1');
    });

    it('only one buffer is ever active (no double-create)', () => {
      let state = stateNoPending();
      let allocCount = 0;
      const alloc = () => { allocCount++; return `ct-${allocCount}`; };

      processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(alloc));
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(alloc)).newState;

      // Extend: allocateScId not called again
      processEvent(state, { type: 'insertion', offset: 1, text: 'b' }, ctx(alloc));
      assert.strictEqual(allocCount, 2); // Called only once per processEvent with new-edit
    });
  });

  // ── 17. Deletion after insertion (hard break creates buffer) ──────────

  describe('deletion after insertion (hard break)', () => {
    it('deletion outside buffer range flushes + creates deletion buffer', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 20, deletedText: 'x' },
        ctx(),
      );
      // Flush produces crystallize; new deletion creates buffer
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, '');
      assert.strictEqual(newState.pending!.originalText, 'x');
      const crystallizes = effectsOfType(effects, 'crystallize');
      assert.strictEqual(crystallizes.length, 1);
      assert.strictEqual(crystallizes[0].changeType, 'insertion');
      assert.strictEqual(crystallizes[0].currentText, 'hello');
    });

    it('deletion before buffer range flushes + creates deletion buffer', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 5, deletedText: 'ab' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, '');
      assert.strictEqual(newState.pending!.originalText, 'ab');
      assert.strictEqual(newState.pending!.anchorOffset, 5);
      const crystallizes = effectsOfType(effects, 'crystallize');
      assert.strictEqual(crystallizes.length, 1);
      assert.strictEqual(crystallizes[0].changeType, 'insertion');
    });
  });

  // ── 18. Empty buffer after backspace → silent discard ────────────────

  describe('empty buffer after backspace → silent discard', () => {
    it('no crystallize emitted when backspacing single-char buffer', () => {
      const { effects } = processEvent(
        stateWithPending('x', 10),
        { type: 'deletion', offset: 10, deletedText: 'x' },
        ctx(),
      );
      noEffect(effects, 'crystallize');
      noEffect(effects, 'mergeAdjacent');
    });

    it('state shows null pending', () => {
      const { newState } = processEvent(
        stateWithPending('x', 10),
        { type: 'deletion', offset: 10, deletedText: 'x' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
    });
  });

  // ── 19. ScId allocation ──────────────────────────────────────────────

  describe('scId allocation', () => {
    it('allocateScId called once on buffer creation', () => {
      let count = 0;
      processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'a' },
        ctx(() => { count++; return 'ct-' + count; }),
      );
      assert.strictEqual(count, 1);
    });

    it('scId preserved through extend operations', () => {
      let state = stateNoPending();
      const { newState: s1 } = processEvent(
        state,
        { type: 'insertion', offset: 0, text: 'a' },
        ctx(() => 'ct-100'),
      );
      state = s1;

      const { newState: s2 } = processEvent(
        state,
        { type: 'insertion', offset: 1, text: 'b' },
        ctx(() => 'ct-SHOULD-NOT-CALL'),
      );
      assert.strictEqual(s2.pending!.scId, 'ct-100');
    });

    it('scId included in crystallize effect on flush', () => {
      const state = stateWithPending('abc', 10, {}, 'ct-77');
      const { effects } = processEvent(state, { type: 'flush' }, ctx());
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.scId, 'ct-77');
    });

    it('scId preserved through splice operations (backspace)', () => {
      const state = stateWithPending('abc', 10, {}, 'ct-42');
      const { newState } = processEvent(
        state,
        { type: 'deletion', offset: 12, deletedText: 'c' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.scId, 'ct-42');
    });

    it('scId preserved through splice operations (insert)', () => {
      const state = stateWithPending('hello', 10, {}, 'ct-99');
      const { newState } = processEvent(
        state,
        { type: 'insertion', offset: 12, text: 'X' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.scId, 'ct-99');
    });
  });

  // ── Additional edge cases ────────────────────────────────────────────

  describe('effect ordering', () => {
    it('flush effects are: crystallize, overlay(null), mergeAdjacent', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'flush' },
        ctx(),
      );
      assert.strictEqual(effects[0].type, 'crystallize');
      assert.strictEqual(effects[1].type, 'updatePendingOverlay');
      assert.strictEqual(effects[2].type, 'mergeAdjacent');
      assert.strictEqual(effects.length, 3);
    });

    it('new buffer effects are: overlay only', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'a' },
        ctx(),
      );
      assert.strictEqual(effects[0].type, 'updatePendingOverlay');
      assert.strictEqual(effects.length, 1);
    });

    it('hard break with edit: flush effects then buffer effects for edit', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 20, deletedText: 'x' },
        ctx(),
      );
      // flush effects first
      assert.strictEqual(effects[0].type, 'crystallize'); // flush
      assert.strictEqual(effects[1].type, 'updatePendingOverlay'); // null overlay
      assert.strictEqual(effects[2].type, 'mergeAdjacent');
      // then the new buffer effects
      assert.strictEqual(effects[3].type, 'updatePendingOverlay'); // new overlay
      assert.strictEqual(effects.length, 4);
    });
  });

  describe('substitution with pending buffer', () => {
    it('flushes pending and creates buffer for substitution', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'substitution', offset: 20, oldText: 'abc', newText: 'XYZ' },
        ctx(),
      );
      // Flush produces crystallize; new substitution creates buffer
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, 'XYZ');
      assert.strictEqual(newState.pending!.originalText, 'abc');
      const crystallizes = effectsOfType(effects, 'crystallize');
      assert.strictEqual(crystallizes.length, 1);
      assert.strictEqual(crystallizes[0].changeType, 'insertion'); // flush
      assert.strictEqual(crystallizes[0].currentText, 'hello');
    });
  });

  describe('edge: insertion at buffer start (splice, not extend)', () => {
    it('inserts at anchorOffset position (splice)', () => {
      const { newState } = processEvent(
        stateWithPending('hello', 10),
        { type: 'insertion', offset: 10, text: 'X' },
        ctx(),
      );
      assert.strictEqual(newState.pending!.currentText, 'Xhello');
    });
  });

  describe('mergeAdjacent offset', () => {
    it('mergeAdjacent carries buffer anchorOffset on flush', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 42),
        { type: 'flush' },
        ctx(),
      );
      const merge = singleEffect(effects, 'mergeAdjacent');
      assert.strictEqual(merge.offset, 42);
    });

    it('mergeAdjacent carries anchorOffset on save flush', () => {
      const { effects } = processEvent(
        stateWithPending('test', 7),
        { type: 'save' },
        ctx(),
      );
      const merge = singleEffect(effects, 'mergeAdjacent');
      assert.strictEqual(merge.offset, 7);
    });
  });

  describe('state immutability', () => {
    it('processEvent does not mutate the input state', () => {
      const state = stateWithPending('hello', 10);
      const originalPending = state.pending;
      processEvent(state, { type: 'insertion', offset: 15, text: 'x' }, ctx());
      assert.strictEqual(state.pending, originalPending);
      assert.strictEqual(state.pending!.currentText, 'hello');
    });

    it('processEvent does not mutate state on flush', () => {
      const state = stateWithPending('hello', 10);
      processEvent(state, { type: 'flush' }, ctx());
      assert.ok(state.pending !== null);
      assert.strictEqual(state.pending!.currentText, 'hello');
    });
  });

  describe('overlay data correctness', () => {
    it('overlay matches buffer state after extend', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hel', 5),
        { type: 'insertion', offset: 8, text: 'lo' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay').overlay!;
      assert.strictEqual(overlay.anchorOffset, newState.pending!.anchorOffset);
      assert.strictEqual(overlay.currentLength, newState.pending!.currentText.length);
      assert.strictEqual(overlay.currentText, newState.pending!.currentText);
      assert.strictEqual(overlay.cursorOffset, newState.pending!.cursorOffset);
    });

    it('overlay matches buffer state after splice insert', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hllo', 5),
        { type: 'insertion', offset: 6, text: 'e' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay').overlay!;
      assert.strictEqual(overlay.currentText, newState.pending!.currentText);
      assert.strictEqual(overlay.cursorOffset, newState.pending!.cursorOffset);
    });
  });

  describe('deletion buffer shape', () => {
    it('no pending + deletion: creates buffer with correct fields', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'deletion', offset: 7, deletedText: 'world' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, '');
      assert.strictEqual(newState.pending!.originalText, 'world');
      assert.strictEqual(newState.pending!.anchorOffset, 7);
    });

    it('allocateScId called for deletion buffer', () => {
      let scIdValue: string | undefined;
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'deletion', offset: 7, deletedText: 'x' },
        ctx(() => { scIdValue = 'ct-42'; return scIdValue; }),
      );
      assert.strictEqual(newState.pending!.scId, 'ct-42');
    });
  });

  describe('substitution buffer shape', () => {
    it('no pending + substitution: creates buffer with correct fields', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'substitution', offset: 3, oldText: 'foo', newText: 'bar' },
        ctx(),
      );
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, 'bar');
      assert.strictEqual(newState.pending!.originalText, 'foo');
      assert.strictEqual(newState.pending!.anchorOffset, 3);
    });
  });

  describe('complex sequences', () => {
    it('type → splice within → continue typing → flush', () => {
      let state = stateNoPending();

      // Type "hel"
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'h' }, ctx(() => 'ct-1')).newState;
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'e' }, ctx()).newState;
      state = processEvent(state, { type: 'insertion', offset: 2, text: 'l' }, ctx()).newState;

      // Splice insert at position 1
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'X' }, ctx()).newState;
      assert.strictEqual(state.pending!.currentText, 'hXel');

      // Flush
      const { newState, effects } = processEvent(state, { type: 'flush' }, ctx());
      assert.strictEqual(newState.pending, null);
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.currentText, 'hXel');
      assert.strictEqual(cryst.scId, 'ct-1');
    });

    it('type → editor switch → type again = two separate buffers', () => {
      let state = stateNoPending();

      // Type "abc"
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(() => 'ct-1')).newState;
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'b' }, ctx()).newState;
      state = processEvent(state, { type: 'insertion', offset: 2, text: 'c' }, ctx()).newState;

      // Editor switch → flushes "abc"
      const { newState: flushed, effects: flushEffects } = processEvent(
        state,
        { type: 'editorSwitch' },
        ctx(),
      );
      assert.strictEqual(flushed.pending, null);
      const cryst1 = singleEffect(flushEffects, 'crystallize');
      assert.strictEqual(cryst1.currentText, 'abc');
      assert.strictEqual(cryst1.scId, 'ct-1');

      // Type "xy" — new buffer
      state = processEvent(flushed, { type: 'insertion', offset: 20, text: 'x' }, ctx(() => 'ct-2')).newState;
      state = processEvent(state, { type: 'insertion', offset: 21, text: 'y' }, ctx()).newState;
      assert.strictEqual(state.pending!.currentText, 'xy');
      assert.strictEqual(state.pending!.scId, 'ct-2');
    });

    it('type → backspace all → type again = new buffer with new scId', () => {
      let state = stateNoPending();

      // Type "ab"
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(() => 'ct-1')).newState;
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'b' }, ctx()).newState;

      // Backspace both (splice to empty)
      state = processEvent(state, { type: 'deletion', offset: 1, deletedText: 'b' }, ctx()).newState;
      assert.strictEqual(state.pending!.currentText, 'a');

      state = processEvent(state, { type: 'deletion', offset: 0, deletedText: 'a' }, ctx()).newState;
      assert.strictEqual(state.pending, null);

      // Type again → new buffer
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'X' }, ctx(() => 'ct-2')).newState;
      assert.strictEqual(state.pending!.currentText, 'X');
      assert.strictEqual(state.pending!.scId, 'ct-2');
    });

    it('type + save + type again = two separate buffers', () => {
      let state = stateNoPending();

      state = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(() => 'ct-1')).newState;
      const { newState: savedState, effects: saveEffects } = processEvent(
        state,
        { type: 'save' },
        ctx(),
      );
      assert.strictEqual(savedState.pending, null);
      singleEffect(saveEffects, 'crystallize');

      state = processEvent(savedState, { type: 'insertion', offset: 1, text: 'b' }, ctx(() => 'ct-2')).newState;
      assert.strictEqual(state.pending!.scId, 'ct-2');
    });
  });

  describe('edge cases', () => {
    it('empty text insertion creates buffer (edge case)', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: '' },
        ctx(),
      );
      // Empty text creates a buffer (the buffer itself starts empty)
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, '');
    });

    it('config values propagate correctly through state', () => {
      const customConfig = { pauseThresholdMs: 5000, breakOnNewline: false, pasteMinChars: 20 };
      const state = stateNoPending(customConfig);
      const { newState } = processEvent(
        state,
        { type: 'insertion', offset: 0, text: 'a' },
        ctx(),
      );
      assert.strictEqual(newState.config.pauseThresholdMs, 5000);
      assert.strictEqual(newState.config.breakOnNewline, false);
      assert.strictEqual(newState.config.pasteMinChars, 20);
    });

    it('insertion at exactly paste threshold boundary is paste', () => {
      const text = 'x'.repeat(50);
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 0, text },
        ctx(),
      );
      assert.strictEqual(newState.pending, null); // crystallized immediately
    });

    it('insertion at paste threshold minus 1 is not paste', () => {
      const text = 'x'.repeat(49);
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 0, text },
        ctx(),
      );
      assert.ok(newState.pending !== null); // buffered
    });
  });

  describe('deletion outside pending (flush + create buffer)', () => {
    it('deletion after buffer range: flushes then creates deletion buffer', () => {
      const { newState, effects } = processEvent(
        stateWithPending('abc', 10),
        { type: 'deletion', offset: 30, deletedText: 'xyz' },
        ctx(),
      );
      // Flush produces crystallize, then new deletion creates buffer
      assert.ok(newState.pending !== null);
      assert.strictEqual(newState.pending!.currentText, '');
      assert.strictEqual(newState.pending!.originalText, 'xyz');
      assert.strictEqual(newState.pending!.anchorOffset, 30);
      const crystallizes = effectsOfType(effects, 'crystallize');
      assert.strictEqual(crystallizes.length, 1);
      assert.strictEqual(crystallizes[0].changeType, 'insertion');
      assert.strictEqual(crystallizes[0].currentText, 'abc');
    });
  });

  describe('flush effects completeness', () => {
    it('flush via save includes 3 effect types (no cancelTimer)', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'save' },
        ctx(),
      );
      assert.strictEqual(effects.length, 3);
      assert.ok(effectsOfType(effects, 'crystallize').length === 1);
      assert.ok(effectsOfType(effects, 'updatePendingOverlay').length === 1);
      assert.ok(effectsOfType(effects, 'mergeAdjacent').length === 1);
    });

    it('flush via editorSwitch includes 3 effect types', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'editorSwitch' },
        ctx(),
      );
      assert.strictEqual(effects.length, 3);
    });

    it('flush via explicit flush includes 3 effect types', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'flush' },
        ctx(),
      );
      assert.strictEqual(effects.length, 3);
    });
  });

  describe('newline with no pending (breakOnNewline=true)', () => {
    it('crystallizes immediately without creating buffer', () => {
      const { newState, effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: '\n' },
        ctx(),
      );
      assert.strictEqual(newState.pending, null);
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.changeType, 'insertion');
      assert.strictEqual(cryst.currentText, '\n');
      assert.strictEqual(cryst.offset, 5);
    });
  });

  describe('paste with no pending (no flush needed)', () => {
    it('crystallizes immediately without flush effects', () => {
      const pasteText = 'x'.repeat(100);
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 0, text: pasteText },
        ctx(),
      );
      assert.strictEqual(effects.length, 1);
      assert.strictEqual(effects[0].type, 'crystallize');
    });
  });

  describe('crystallize offset and length consistency', () => {
    it('insertion crystallize: offset is anchorOffset, length is text length', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 42),
        { type: 'flush' },
        ctx(),
      );
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.offset, 42);
      assert.strictEqual(cryst.length, 5);
      assert.strictEqual(cryst.currentText, 'hello');
    });

    it('deletion crystallize via flush: length is 0 (deleted text gone from document)', () => {
      // Create a deletion buffer and flush it
      const state: EditBoundaryState = {
        pending: createBuffer(3, '', 'abcdef', NOW, 'ct-1'),
        isComposing: false,
        config: defaultConfig(),
      };
      const { effects } = processEvent(state, { type: 'flush' }, ctx());
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.changeType, 'deletion');
      assert.strictEqual(cryst.length, 0);
    });

    it('substitution crystallize via flush: length matches currentText length', () => {
      // Create a substitution buffer (original "abc" → current "hello") and flush it
      const state: EditBoundaryState = {
        pending: createBuffer(3, 'hello', 'abc', NOW, 'ct-1'),
        isComposing: false,
        config: defaultConfig(),
      };
      const { effects } = processEvent(state, { type: 'flush' }, ctx());
      const cryst = singleEffect(effects, 'crystallize');
      assert.strictEqual(cryst.changeType, 'substitution');
      assert.strictEqual(cryst.length, 5); // 'hello'.length
    });
  });

  describe('composition lifecycle', () => {
    it('full IME lifecycle: isComposing=true → ignore edits → isComposing=false → resume', () => {
      let state = stateNoPending();

      // Type "hel"
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'h' }, ctx(() => 'ct-1')).newState;
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'e' }, ctx()).newState;
      state = processEvent(state, { type: 'insertion', offset: 2, text: 'l' }, ctx()).newState;
      assert.strictEqual(state.pending!.currentText, 'hel');

      // Set isComposing=true directly
      state = { ...state, isComposing: true };
      assert.strictEqual(state.isComposing, true);

      // Edits during composition are ignored
      const { newState: s1, effects: e1 } = processEvent(
        state,
        { type: 'insertion', offset: 3, text: 'lo' },
        ctx(),
      );
      assert.strictEqual(e1.length, 0);
      assert.strictEqual(s1.pending!.currentText, 'hel'); // unchanged
      state = s1;

      // Clear isComposing=false directly
      state = { ...state, isComposing: false };
      assert.strictEqual(state.isComposing, false);

      // Resume typing normally
      state = processEvent(state, { type: 'insertion', offset: 3, text: 'l' }, ctx()).newState;
      assert.strictEqual(state.pending!.currentText, 'hell');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Unified editing region — new behaviors ────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  describe('unified editing region — new behaviors', () => {

    // ── Deletion creates buffer (no longer immediate crystallize) ──────

    describe('no pending + deletion → creates buffer', () => {
      it('creates buffer with empty currentText and deletion as originalText', () => {
        const result = processEvent(
          stateNoPending(),
          { type: 'deletion', offset: 5, deletedText: 'abc' },
          ctx(),
        );
        assert.ok(result.newState.pending !== null);
        assert.strictEqual(result.newState.pending!.currentText, '');
        assert.strictEqual(result.newState.pending!.originalText, 'abc');
        assert.strictEqual(result.newState.pending!.anchorOffset, 5);
      });

      it('emits overlay, not crystallize', () => {
        const result = processEvent(
          stateNoPending(),
          { type: 'deletion', offset: 5, deletedText: 'x' },
          ctx(),
        );
        assert.strictEqual(effectsOfType(result.effects, 'crystallize').length, 0);
        assert.strictEqual(effectsOfType(result.effects, 'updatePendingOverlay').length, 1);
      });
    });

    // ── Substitution creates buffer ────────────────────────────────────

    describe('no pending + substitution → creates buffer', () => {
      it('creates buffer with both currentText and originalText', () => {
        const result = processEvent(
          stateNoPending(),
          { type: 'substitution', offset: 5, oldText: 'old', newText: 'new' },
          ctx(),
        );
        assert.ok(result.newState.pending !== null);
        assert.strictEqual(result.newState.pending!.currentText, 'new');
        assert.strictEqual(result.newState.pending!.originalText, 'old');
        assert.strictEqual(result.newState.pending!.anchorOffset, 5);
      });

      it('emits overlay, not crystallize', () => {
        const result = processEvent(
          stateNoPending(),
          { type: 'substitution', offset: 5, oldText: 'old', newText: 'new' },
          ctx(),
        );
        assert.strictEqual(effectsOfType(result.effects, 'crystallize').length, 0);
        assert.strictEqual(effectsOfType(result.effects, 'updatePendingOverlay').length, 1);
      });
    });

    // ── Extend-backward ────────────────────────────────────────────────

    describe('extend-backward (backspace before region)', () => {
      it('prepends to originalText and shifts anchor', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(10, 'new', 'old', NOW, 'ct-1'),
          isComposing: false,
          config: defaultConfig(),
        };
        const result = processEvent(
          state,
          { type: 'deletion', offset: 9, deletedText: 'x' },
          ctx(),
        );
        assert.ok(result.newState.pending !== null);
        assert.strictEqual(result.newState.pending!.originalText, 'xold');
        assert.strictEqual(result.newState.pending!.anchorOffset, 9);
        assert.strictEqual(result.newState.pending!.currentText, 'new');
      });
    });

    // ── Extend-forward ─────────────────────────────────────────────────

    describe('extend-forward (forward delete at region end)', () => {
      it('appends to originalText without moving anchor', () => {
        const state = stateWithPending('hello', 10);
        const result = processEvent(
          state,
          { type: 'deletion', offset: 15, deletedText: 'x' },
          ctx(),
        );
        assert.ok(result.newState.pending !== null);
        assert.strictEqual(result.newState.pending!.originalText, 'x');
        assert.strictEqual(result.newState.pending!.anchorOffset, 10);
        assert.strictEqual(result.newState.pending!.currentText, 'hello');
      });
    });

    // ── Flush with content-determined type ─────────────────────────────

    describe('flush determines crystallize type from content', () => {
      it('insertion: originalText empty, currentText non-empty', () => {
        const state = stateWithPending('hello', 10);
        const result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        assert.strictEqual(cryst.length, 1);
        assert.strictEqual((cryst[0] as any).changeType, 'insertion');
        assert.strictEqual((cryst[0] as any).currentText, 'hello');
        assert.strictEqual((cryst[0] as any).originalText, '');
      });

      it('deletion: currentText empty, originalText non-empty', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(10, '', 'deleted', NOW, 'ct-1'),
          isComposing: false,
          config: defaultConfig(),
        };
        const result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        assert.strictEqual(cryst.length, 1);
        assert.strictEqual((cryst[0] as any).changeType, 'deletion');
        assert.strictEqual((cryst[0] as any).originalText, 'deleted');
      });

      it('substitution: both non-empty', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(10, 'new', 'old', NOW, 'ct-1'),
          isComposing: false,
          config: defaultConfig(),
        };
        const result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        assert.strictEqual(cryst.length, 1);
        assert.strictEqual((cryst[0] as any).changeType, 'substitution');
        assert.strictEqual((cryst[0] as any).currentText, 'new');
        assert.strictEqual((cryst[0] as any).originalText, 'old');
      });

      it('self-cancellation: both empty → no crystallize', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(10, '', '', NOW, 'ct-1'),
          isComposing: false,
          config: defaultConfig(),
        };
        const result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        assert.strictEqual(cryst.length, 0);
        assert.strictEqual(result.newState.pending, null);
      });
    });

    // ── Cross-type coalescing sequences ────────────────────────────────

    describe('cross-type coalescing', () => {
      it('rapid backspaces coalesce into one deletion', () => {
        let state = stateNoPending();
        let result = processEvent(state, { type: 'deletion', offset: 4, deletedText: 'o' }, ctx());
        state = result.newState;
        assert.strictEqual(state.pending!.originalText, 'o');

        result = processEvent(state, { type: 'deletion', offset: 3, deletedText: 'l' }, ctx());
        state = result.newState;
        assert.strictEqual(state.pending!.originalText, 'lo');
        assert.strictEqual(state.pending!.anchorOffset, 3);

        result = processEvent(state, { type: 'deletion', offset: 2, deletedText: 'l' }, ctx());
        state = result.newState;
        assert.strictEqual(state.pending!.originalText, 'llo');
        assert.strictEqual(state.pending!.anchorOffset, 2);

        result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        assert.strictEqual(cryst.length, 1);
        assert.strictEqual((cryst[0] as any).changeType, 'deletion');
        assert.strictEqual((cryst[0] as any).originalText, 'llo');
      });

      it('delete-then-type produces substitution', () => {
        let state = stateNoPending();
        let result = processEvent(state, { type: 'deletion', offset: 8, deletedText: 'k' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'deletion', offset: 7, deletedText: 'c' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'deletion', offset: 6, deletedText: 'i' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'deletion', offset: 5, deletedText: 'u' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'deletion', offset: 4, deletedText: 'q' }, ctx());
        state = result.newState;
        assert.strictEqual(state.pending!.originalText, 'quick');
        assert.strictEqual(state.pending!.currentText, '');
        assert.strictEqual(state.pending!.anchorOffset, 4);

        result = processEvent(state, { type: 'insertion', offset: 4, text: 's' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'insertion', offset: 5, text: 'l' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'insertion', offset: 6, text: 'o' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'insertion', offset: 7, text: 'w' }, ctx());
        state = result.newState;
        assert.strictEqual(state.pending!.originalText, 'quick');
        assert.strictEqual(state.pending!.currentText, 'slow');

        result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        assert.strictEqual(cryst.length, 1);
        assert.strictEqual((cryst[0] as any).changeType, 'substitution');
        assert.strictEqual((cryst[0] as any).originalText, 'quick');
        assert.strictEqual((cryst[0] as any).currentText, 'slow');
      });

      it('type-then-backspace-all produces self-cancellation', () => {
        let state = stateNoPending();
        let result = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(() => 'ct-1'));
        state = result.newState;
        result = processEvent(state, { type: 'insertion', offset: 1, text: 'b' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'insertion', offset: 2, text: 'c' }, ctx());
        state = result.newState;

        result = processEvent(state, { type: 'deletion', offset: 2, deletedText: 'c' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'deletion', offset: 1, deletedText: 'b' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'deletion', offset: 0, deletedText: 'a' }, ctx());
        state = result.newState;

        assert.strictEqual(state.pending, null);
      });

      it('forward delete coalesces', () => {
        let state = stateNoPending();
        let result = processEvent(state, { type: 'deletion', offset: 5, deletedText: 'a' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'deletion', offset: 5, deletedText: 'b' }, ctx());
        state = result.newState;
        assert.strictEqual(state.pending!.originalText, 'ab');
        assert.strictEqual(state.pending!.anchorOffset, 5);

        result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        assert.strictEqual(cryst.length, 1);
        assert.strictEqual((cryst[0] as any).changeType, 'deletion');
        assert.strictEqual((cryst[0] as any).originalText, 'ab');
      });
    });

    // ── Timestamp-based break ──────────────────────────────────────────

    describe('timestamp-based break', () => {
      it('breaks when time gap exceeds pauseThresholdMs', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(0, 'ab', '', 1000, 'ct-1'),
          isComposing: false,
          config: { ...DEFAULT_EDIT_BOUNDARY_CONFIG, pauseThresholdMs: 5000 },
        };
        // 6001ms elapsed > 5000ms threshold
        const { newState, effects } = processEvent(
          state,
          { type: 'insertion', offset: 2, text: 'x' },
          { now: 7001 },
        );
        // Should flush old buffer (crystallize) and start new one
        assert.ok(effects.some(e => e.type === 'crystallize'));
        assert.ok(newState.pending !== null);
        assert.strictEqual(newState.pending!.currentText, 'x');
      });

      it('extends when time gap is within pauseThresholdMs', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(0, 'ab', '', 1000, 'ct-1'),
          isComposing: false,
          config: { ...DEFAULT_EDIT_BOUNDARY_CONFIG, pauseThresholdMs: 5000 },
        };
        // 3000ms elapsed < 5000ms threshold, and adjacent → extend
        const { newState, effects } = processEvent(
          state,
          { type: 'insertion', offset: 2, text: 'c' },
          { now: 4000 },
        );
        assert.ok(!effects.some(e => e.type === 'crystallize'));
        assert.strictEqual(newState.pending!.currentText, 'abc');
      });

      it('skips timestamp check when pauseThresholdMs is 0', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(0, 'ab', '', 1000, 'ct-1'),
          isComposing: false,
          config: { ...DEFAULT_EDIT_BOUNDARY_CONFIG, pauseThresholdMs: 0 },
        };
        // Even with huge time gap, should extend (timer disabled)
        const { newState } = processEvent(
          state,
          { type: 'insertion', offset: 2, text: 'c' },
          { now: 999999 },
        );
        assert.strictEqual(newState.pending!.currentText, 'abc');
      });
    });
  });
});
