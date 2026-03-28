import { describe, it, expect, beforeAll } from 'vitest';
import type {
  EditEvent,
  EditBoundaryState,
  EditBoundaryConfig,
  Effect,
  FullCrystallizeEffect,
} from '@changedown/core/edit-boundary';
import {
  processEvent,
  createBuffer,
  DEFAULT_EDIT_BOUNDARY_CONFIG,
} from '@changedown/core/edit-boundary';
import type { ProcessEventContext } from '@changedown/core/edit-boundary';
import { initHashline } from '@changedown/core';

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
  scId = 'cn-1',
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
    pending: createBuffer(anchorOffset, text, '', NOW, 'cn-1'),
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
  expect(matches).toHaveLength(1);
  return matches[0];
}

/** Assert no effects of given type exist. */
function noEffect(effects: Effect[], type: Effect['type']): void {
  const matches = effectsOfType(effects, type);
  expect(matches).toHaveLength(0);
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('a');
      expect(newState.pending!.anchorOffset).toBe(5);
    });

    it('emits updatePendingOverlay with correct data', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'abc' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      expect(overlay.overlay !== null).toBeTruthy();
      expect(overlay.overlay!.anchorOffset).toBe(5);
      expect(overlay.overlay!.currentLength).toBe(3);
      expect(overlay.overlay!.currentText).toBe('abc');
      expect(overlay.overlay!.cursorOffset).toBe(3);
    });

    it('calls allocateScId and assigns it to the buffer', () => {
      let called = false;
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'x' },
        ctx(() => { called = true; return 'cn-42'; }),
      );
      expect(called, 'allocateScId should have been called').toBeTruthy();
      expect(newState.pending!.scId).toBe('cn-42');
    });

    it('works without allocateScId', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'x' },
        ctx(),
      );
      expect(newState.pending!.scId).toBeUndefined();
    });

    it('sets cursorOffset to text length', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 0, text: 'hello' },
        ctx(),
      );
      expect(newState.pending!.cursorOffset).toBe(5);
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('');
      expect(newState.pending!.originalText).toBe('abc');
      expect(newState.pending!.anchorOffset).toBe(5);
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
        ctx(() => { called = true; return 'cn-42'; }),
      );
      expect(called, 'allocateScId should have been called').toBeTruthy();
      expect(newState.pending!.scId).toBe('cn-42');
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('XYZ');
      expect(newState.pending!.originalText).toBe('abc');
      expect(newState.pending!.anchorOffset).toBe(5);
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
      expect(newState.pending!.currentText).toBe('hello');
    });

    it('preserves anchorOffset', () => {
      const { newState } = processEvent(
        stateWithPending('abc', 10),
        { type: 'insertion', offset: 13, text: 'd' },
        ctx(),
      );
      expect(newState.pending!.anchorOffset).toBe(10);
    });

    it('advances cursorOffset', () => {
      const { newState } = processEvent(
        stateWithPending('abc', 10),
        { type: 'insertion', offset: 13, text: 'de' },
        ctx(),
      );
      expect(newState.pending!.cursorOffset).toBe(5);
    });

    it('emits updatePendingOverlay with extended data', () => {
      const { effects } = processEvent(
        stateWithPending('hel', 10),
        { type: 'insertion', offset: 13, text: 'lo' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      expect(overlay.overlay !== null).toBeTruthy();
      expect(overlay.overlay!.currentText).toBe('hello');
      expect(overlay.overlay!.currentLength).toBe(5);
    });

    it('preserves scId through extension', () => {
      const { newState } = processEvent(
        stateWithPending('a', 10, {}, 'cn-99'),
        { type: 'insertion', offset: 11, text: 'b' },
        ctx(),
      );
      expect(newState.pending!.scId).toBe('cn-99');
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('hell');
    });

    it('emits updatePendingOverlay with shrunk data', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 14, deletedText: 'o' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      expect(overlay.overlay !== null).toBeTruthy();
      expect(overlay.overlay!.currentText).toBe('hell');
      expect(overlay.overlay!.currentLength).toBe(4);
    });

    it('clears pending when buffer becomes empty (single char, no originalText)', () => {
      const { newState } = processEvent(
        stateWithPending('a', 10),
        { type: 'deletion', offset: 10, deletedText: 'a' },
        ctx(),
      );
      expect(newState.pending).toBeNull();
    });

    it('emits null overlay when buffer empties', () => {
      const { effects } = processEvent(
        stateWithPending('a', 10),
        { type: 'deletion', offset: 10, deletedText: 'a' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      expect(overlay.overlay).toBeNull();
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
      expect(newState.pending!.currentText).toBe('hello');
    });

    it('emits overlay with spliced buffer', () => {
      const { effects } = processEvent(
        stateWithPending('hllo', 10),
        { type: 'insertion', offset: 11, text: 'e' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      expect(overlay.overlay !== null).toBeTruthy();
      expect(overlay.overlay!.currentText).toBe('hello');
    });

    it('inserts at buffer start', () => {
      const { newState } = processEvent(
        stateWithPending('ello', 10),
        { type: 'insertion', offset: 10, text: 'h' },
        ctx(),
      );
      expect(newState.pending!.currentText).toBe('hello');
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('hlo');
    });

    it('emits overlay with spliced buffer', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 11, deletedText: 'el' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      expect(overlay.overlay !== null).toBeTruthy();
      expect(overlay.overlay!.currentText).toBe('hlo');
    });

    it('clears pending when splice delete empties buffer (no originalText)', () => {
      const { newState } = processEvent(
        stateWithPending('ab', 10),
        { type: 'deletion', offset: 10, deletedText: 'ab' },
        ctx(),
      );
      expect(newState.pending).toBeNull();
    });

    it('emits null overlay when splice empties buffer', () => {
      const { effects } = processEvent(
        stateWithPending('ab', 10),
        { type: 'deletion', offset: 10, deletedText: 'ab' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay');
      expect(overlay.overlay).toBeNull();
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
      expect(newState.pending).toBeNull();
      singleEffect(effects, 'crystallize');
    });

    it('emits crystallize with buffer contents', () => {
      const { effects } = processEvent(
        stateWithPending('test', 5),
        { type: 'save' },
        ctx(),
      );
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.changeType).toBe('insertion');
      expect(cryst.offset).toBe(5);
      expect(cryst.currentText).toBe('test');
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
      expect(newState.pending).toBeNull();
      expect(effects).toHaveLength(0);
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
      expect(newState.pending).toBeNull();
      singleEffect(effects, 'crystallize');
    });

    it('produces no effects with no pending', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'editorSwitch' },
        ctx(),
      );
      expect(effects).toHaveLength(0);
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
      expect(effects).toHaveLength(0);
      expect(newState.pending!.currentText).toBe('hello');
    });

    it('deletion during composition is ignored', () => {
      const { newState, effects } = processEvent(
        stateComposing('hello'),
        { type: 'deletion', offset: 14, deletedText: 'o' },
        ctx(),
      );
      expect(effects).toHaveLength(0);
      expect(newState.pending!.currentText).toBe('hello');
    });

    it('substitution during composition is ignored', () => {
      const { newState, effects } = processEvent(
        stateComposing('hello'),
        { type: 'substitution', offset: 10, oldText: 'he', newText: 'HE' },
        ctx(),
      );
      expect(effects).toHaveLength(0);
      expect(newState.pending!.currentText).toBe('hello');
    });

    it('isComposing flag is preserved', () => {
      const { newState } = processEvent(
        stateComposing('hello'),
        { type: 'insertion', offset: 15, text: 'x' },
        ctx(),
      );
      expect(newState.isComposing).toBe(true);
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
      expect(newState.pending).toBeNull();
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.changeType).toBe('insertion');
      expect(cryst.currentText).toBe('hello');
    });

    it('no effects when no pending', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'flush' },
        ctx(),
      );
      expect(effects).toHaveLength(0);
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
      expect(newState.pending).toBeNull();
      const crystallizes = effectsOfType(effects, 'crystallize');
      expect(crystallizes).toHaveLength(2);
      // First crystallize: flush of pending buffer
      expect(crystallizes[0].changeType).toBe('insertion');
      expect(crystallizes[0].currentText).toBe('hello');
      // Second crystallize: the newline itself
      expect(crystallizes[1].changeType).toBe('insertion');
      expect(crystallizes[1].currentText).toBe('\n');
    });

    it('crystallizes newline immediately with no pending', () => {
      const { newState, effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: '\n' },
        ctx(),
      );
      expect(newState.pending).toBeNull();
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.changeType).toBe('insertion');
      expect(cryst.currentText).toBe('\n');
    });

    it('multi-line text causes break', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'insertion', offset: 15, text: 'abc\ndef' },
        ctx(),
      );
      const crystallizes = effectsOfType(effects, 'crystallize');
      expect(crystallizes.length >= 2).toBeTruthy();
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('hello\n');
    });

    it('creates buffer for newline with no pending', () => {
      const { newState } = processEvent(
        stateNoPending({ breakOnNewline: false }),
        { type: 'insertion', offset: 5, text: '\n' },
        ctx(),
      );
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('\n');
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
      expect(newState.pending).toBeNull();
      const crystallizes = effectsOfType(effects, 'crystallize');
      expect(crystallizes).toHaveLength(2);
      expect(crystallizes[0].currentText).toBe('hello'); // flush
      expect(crystallizes[1].currentText).toBe(pasteText); // paste
    });

    it('large paste crystallizes immediately (no pending)', () => {
      const pasteText = 'x'.repeat(50);
      const { newState, effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: pasteText },
        ctx(),
      );
      expect(newState.pending).toBeNull();
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.currentText).toBe(pasteText);
    });

    it('under-threshold text creates buffer normally', () => {
      const shortText = 'x'.repeat(49);
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: shortText },
        ctx(),
      );
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe(shortText);
    });

    it('custom pasteMinChars threshold', () => {
      const pasteText = 'x'.repeat(10);
      const { newState } = processEvent(
        stateNoPending({ pasteMinChars: 10 }),
        { type: 'insertion', offset: 5, text: pasteText },
        ctx(),
      );
      expect(newState.pending).toBeNull();
    });
  });

  // ── 16. Multiple sequential insertions extend the same buffer ────────

  describe('multiple sequential insertions', () => {
    it('three sequential typed characters share the same buffer', () => {
      let state = stateNoPending();
      let result = processEvent(state, { type: 'insertion', offset: 0, text: 'h' }, ctx(() => 'cn-1'));
      state = result.newState;
      expect(state.pending!.currentText).toBe('h');
      expect(state.pending!.scId).toBe('cn-1');

      result = processEvent(state, { type: 'insertion', offset: 1, text: 'e' }, ctx());
      state = result.newState;
      expect(state.pending!.currentText).toBe('he');
      expect(state.pending!.scId).toBe('cn-1');

      result = processEvent(state, { type: 'insertion', offset: 2, text: 'l' }, ctx());
      state = result.newState;
      expect(state.pending!.currentText).toBe('hel');
      expect(state.pending!.scId).toBe('cn-1');
    });

    it('only one buffer is ever active (no double-create)', () => {
      let state = stateNoPending();
      let allocCount = 0;
      const alloc = () => { allocCount++; return `cn-${allocCount}`; };

      processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(alloc));
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(alloc)).newState;

      // Extend: allocateScId not called again
      processEvent(state, { type: 'insertion', offset: 1, text: 'b' }, ctx(alloc));
      expect(allocCount).toBe(2); // Called only once per processEvent with new-edit
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('');
      expect(newState.pending!.originalText).toBe('x');
      const crystallizes = effectsOfType(effects, 'crystallize');
      expect(crystallizes).toHaveLength(1);
      expect(crystallizes[0].changeType).toBe('insertion');
      expect(crystallizes[0].currentText).toBe('hello');
    });

    it('deletion before buffer range flushes + creates deletion buffer', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 5, deletedText: 'ab' },
        ctx(),
      );
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('');
      expect(newState.pending!.originalText).toBe('ab');
      expect(newState.pending!.anchorOffset).toBe(5);
      const crystallizes = effectsOfType(effects, 'crystallize');
      expect(crystallizes).toHaveLength(1);
      expect(crystallizes[0].changeType).toBe('insertion');
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
      expect(newState.pending).toBeNull();
    });
  });

  // ── 19. ScId allocation ──────────────────────────────────────────────

  describe('scId allocation', () => {
    it('allocateScId called once on buffer creation', () => {
      let count = 0;
      processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'a' },
        ctx(() => { count++; return 'cn-' + count; }),
      );
      expect(count).toBe(1);
    });

    it('scId preserved through extend operations', () => {
      let state = stateNoPending();
      const { newState: s1 } = processEvent(
        state,
        { type: 'insertion', offset: 0, text: 'a' },
        ctx(() => 'cn-100'),
      );
      state = s1;

      const { newState: s2 } = processEvent(
        state,
        { type: 'insertion', offset: 1, text: 'b' },
        ctx(() => 'cn-SHOULD-NOT-CALL'),
      );
      expect(s2.pending!.scId).toBe('cn-100');
    });

    it('scId included in crystallize effect on flush', () => {
      const state = stateWithPending('abc', 10, {}, 'cn-77');
      const { effects } = processEvent(state, { type: 'flush' }, ctx());
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.scId).toBe('cn-77');
    });

    it('scId preserved through splice operations (backspace)', () => {
      const state = stateWithPending('abc', 10, {}, 'cn-42');
      const { newState } = processEvent(
        state,
        { type: 'deletion', offset: 12, deletedText: 'c' },
        ctx(),
      );
      expect(newState.pending!.scId).toBe('cn-42');
    });

    it('scId preserved through splice operations (insert)', () => {
      const state = stateWithPending('hello', 10, {}, 'cn-99');
      const { newState } = processEvent(
        state,
        { type: 'insertion', offset: 12, text: 'X' },
        ctx(),
      );
      expect(newState.pending!.scId).toBe('cn-99');
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
      expect(effects[0].type).toBe('crystallize');
      expect(effects[1].type).toBe('updatePendingOverlay');
      expect(effects[2].type).toBe('mergeAdjacent');
      expect(effects).toHaveLength(3);
    });

    it('new buffer effects are: overlay only', () => {
      const { effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: 'a' },
        ctx(),
      );
      expect(effects[0].type).toBe('updatePendingOverlay');
      expect(effects).toHaveLength(1);
    });

    it('hard break with edit: flush effects then buffer effects for edit', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'deletion', offset: 20, deletedText: 'x' },
        ctx(),
      );
      // flush effects first
      expect(effects[0].type).toBe('crystallize'); // flush
      expect(effects[1].type).toBe('updatePendingOverlay'); // null overlay
      expect(effects[2].type).toBe('mergeAdjacent');
      // then the new buffer effects
      expect(effects[3].type).toBe('updatePendingOverlay'); // new overlay
      expect(effects).toHaveLength(4);
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('XYZ');
      expect(newState.pending!.originalText).toBe('abc');
      const crystallizes = effectsOfType(effects, 'crystallize');
      expect(crystallizes).toHaveLength(1);
      expect(crystallizes[0].changeType).toBe('insertion'); // flush
      expect(crystallizes[0].currentText).toBe('hello');
    });
  });

  describe('edge: insertion at buffer start (splice, not extend)', () => {
    it('inserts at anchorOffset position (splice)', () => {
      const { newState } = processEvent(
        stateWithPending('hello', 10),
        { type: 'insertion', offset: 10, text: 'X' },
        ctx(),
      );
      expect(newState.pending!.currentText).toBe('Xhello');
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
      expect(merge.offset).toBe(42);
    });

    it('mergeAdjacent carries anchorOffset on save flush', () => {
      const { effects } = processEvent(
        stateWithPending('test', 7),
        { type: 'save' },
        ctx(),
      );
      const merge = singleEffect(effects, 'mergeAdjacent');
      expect(merge.offset).toBe(7);
    });
  });

  describe('state immutability', () => {
    it('processEvent does not mutate the input state', () => {
      const state = stateWithPending('hello', 10);
      const originalPending = state.pending;
      processEvent(state, { type: 'insertion', offset: 15, text: 'x' }, ctx());
      expect(state.pending).toBe(originalPending);
      expect(state.pending!.currentText).toBe('hello');
    });

    it('processEvent does not mutate state on flush', () => {
      const state = stateWithPending('hello', 10);
      processEvent(state, { type: 'flush' }, ctx());
      expect(state.pending !== null).toBeTruthy();
      expect(state.pending!.currentText).toBe('hello');
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
      expect(overlay.anchorOffset).toBe(newState.pending!.anchorOffset);
      expect(overlay.currentLength).toBe(newState.pending!.currentText.length);
      expect(overlay.currentText).toBe(newState.pending!.currentText);
      expect(overlay.cursorOffset).toBe(newState.pending!.cursorOffset);
    });

    it('overlay matches buffer state after splice insert', () => {
      const { newState, effects } = processEvent(
        stateWithPending('hllo', 5),
        { type: 'insertion', offset: 6, text: 'e' },
        ctx(),
      );
      const overlay = singleEffect(effects, 'updatePendingOverlay').overlay!;
      expect(overlay.currentText).toBe(newState.pending!.currentText);
      expect(overlay.cursorOffset).toBe(newState.pending!.cursorOffset);
    });
  });

  describe('deletion buffer shape', () => {
    it('no pending + deletion: creates buffer with correct fields', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'deletion', offset: 7, deletedText: 'world' },
        ctx(),
      );
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('');
      expect(newState.pending!.originalText).toBe('world');
      expect(newState.pending!.anchorOffset).toBe(7);
    });

    it('allocateScId called for deletion buffer', () => {
      let scIdValue: string | undefined;
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'deletion', offset: 7, deletedText: 'x' },
        ctx(() => { scIdValue = 'cn-42'; return scIdValue; }),
      );
      expect(newState.pending!.scId).toBe('cn-42');
    });
  });

  describe('substitution buffer shape', () => {
    it('no pending + substitution: creates buffer with correct fields', () => {
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'substitution', offset: 3, oldText: 'foo', newText: 'bar' },
        ctx(),
      );
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('bar');
      expect(newState.pending!.originalText).toBe('foo');
      expect(newState.pending!.anchorOffset).toBe(3);
    });
  });

  describe('complex sequences', () => {
    it('type → splice within → continue typing → flush', () => {
      let state = stateNoPending();

      // Type "hel"
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'h' }, ctx(() => 'cn-1')).newState;
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'e' }, ctx()).newState;
      state = processEvent(state, { type: 'insertion', offset: 2, text: 'l' }, ctx()).newState;

      // Splice insert at position 1
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'X' }, ctx()).newState;
      expect(state.pending!.currentText).toBe('hXel');

      // Flush
      const { newState, effects } = processEvent(state, { type: 'flush' }, ctx());
      expect(newState.pending).toBeNull();
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.currentText).toBe('hXel');
      expect(cryst.scId).toBe('cn-1');
    });

    it('type → editor switch → type again = two separate buffers', () => {
      let state = stateNoPending();

      // Type "abc"
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(() => 'cn-1')).newState;
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'b' }, ctx()).newState;
      state = processEvent(state, { type: 'insertion', offset: 2, text: 'c' }, ctx()).newState;

      // Editor switch → flushes "abc"
      const { newState: flushed, effects: flushEffects } = processEvent(
        state,
        { type: 'editorSwitch' },
        ctx(),
      );
      expect(flushed.pending).toBeNull();
      const cryst1 = singleEffect(flushEffects, 'crystallize');
      expect(cryst1.currentText).toBe('abc');
      expect(cryst1.scId).toBe('cn-1');

      // Type "xy" — new buffer
      state = processEvent(flushed, { type: 'insertion', offset: 20, text: 'x' }, ctx(() => 'cn-2')).newState;
      state = processEvent(state, { type: 'insertion', offset: 21, text: 'y' }, ctx()).newState;
      expect(state.pending!.currentText).toBe('xy');
      expect(state.pending!.scId).toBe('cn-2');
    });

    it('type → backspace all → type again = new buffer with new scId', () => {
      let state = stateNoPending();

      // Type "ab"
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(() => 'cn-1')).newState;
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'b' }, ctx()).newState;

      // Backspace both (splice to empty)
      state = processEvent(state, { type: 'deletion', offset: 1, deletedText: 'b' }, ctx()).newState;
      expect(state.pending!.currentText).toBe('a');

      state = processEvent(state, { type: 'deletion', offset: 0, deletedText: 'a' }, ctx()).newState;
      expect(state.pending).toBeNull();

      // Type again → new buffer
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'X' }, ctx(() => 'cn-2')).newState;
      expect(state.pending!.currentText).toBe('X');
      expect(state.pending!.scId).toBe('cn-2');
    });

    it('type + save + type again = two separate buffers', () => {
      let state = stateNoPending();

      state = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(() => 'cn-1')).newState;
      const { newState: savedState, effects: saveEffects } = processEvent(
        state,
        { type: 'save' },
        ctx(),
      );
      expect(savedState.pending).toBeNull();
      singleEffect(saveEffects, 'crystallize');

      state = processEvent(savedState, { type: 'insertion', offset: 1, text: 'b' }, ctx(() => 'cn-2')).newState;
      expect(state.pending!.scId).toBe('cn-2');
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('');
    });

    it('config values propagate correctly through state', () => {
      const customConfig = { pauseThresholdMs: 5000, breakOnNewline: false, pasteMinChars: 20 };
      const state = stateNoPending(customConfig);
      const { newState } = processEvent(
        state,
        { type: 'insertion', offset: 0, text: 'a' },
        ctx(),
      );
      expect(newState.config.pauseThresholdMs).toBe(5000);
      expect(newState.config.breakOnNewline).toBe(false);
      expect(newState.config.pasteMinChars).toBe(20);
    });

    it('insertion at exactly paste threshold boundary is paste', () => {
      const text = 'x'.repeat(50);
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 0, text },
        ctx(),
      );
      expect(newState.pending).toBeNull(); // crystallized immediately
    });

    it('insertion at paste threshold minus 1 is not paste', () => {
      const text = 'x'.repeat(49);
      const { newState } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 0, text },
        ctx(),
      );
      expect(newState.pending !== null).toBeTruthy(); // buffered
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
      expect(newState.pending !== null).toBeTruthy();
      expect(newState.pending!.currentText).toBe('');
      expect(newState.pending!.originalText).toBe('xyz');
      expect(newState.pending!.anchorOffset).toBe(30);
      const crystallizes = effectsOfType(effects, 'crystallize');
      expect(crystallizes).toHaveLength(1);
      expect(crystallizes[0].changeType).toBe('insertion');
      expect(crystallizes[0].currentText).toBe('abc');
    });
  });

  describe('flush effects completeness', () => {
    it('flush via save includes 3 effect types (no cancelTimer)', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'save' },
        ctx(),
      );
      expect(effects).toHaveLength(3);
      expect(effectsOfType(effects, 'crystallize').length === 1).toBeTruthy();
      expect(effectsOfType(effects, 'updatePendingOverlay').length === 1).toBeTruthy();
      expect(effectsOfType(effects, 'mergeAdjacent').length === 1).toBeTruthy();
    });

    it('flush via editorSwitch includes 3 effect types', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'editorSwitch' },
        ctx(),
      );
      expect(effects).toHaveLength(3);
    });

    it('flush via explicit flush includes 3 effect types', () => {
      const { effects } = processEvent(
        stateWithPending('hello', 10),
        { type: 'flush' },
        ctx(),
      );
      expect(effects).toHaveLength(3);
    });
  });

  describe('newline with no pending (breakOnNewline=true)', () => {
    it('crystallizes immediately without creating buffer', () => {
      const { newState, effects } = processEvent(
        stateNoPending(),
        { type: 'insertion', offset: 5, text: '\n' },
        ctx(),
      );
      expect(newState.pending).toBeNull();
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.changeType).toBe('insertion');
      expect(cryst.currentText).toBe('\n');
      expect(cryst.offset).toBe(5);
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
      expect(effects).toHaveLength(1);
      expect(effects[0].type).toBe('crystallize');
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
      expect(cryst.offset).toBe(42);
      expect(cryst).toHaveLength(5);
      expect(cryst.currentText).toBe('hello');
    });

    it('deletion crystallize via flush: length is 0 (deleted text gone from document)', () => {
      // Create a deletion buffer and flush it
      const state: EditBoundaryState = {
        pending: createBuffer(3, '', 'abcdef', NOW, 'cn-1'),
        isComposing: false,
        config: defaultConfig(),
      };
      const { effects } = processEvent(state, { type: 'flush' }, ctx());
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.changeType).toBe('deletion');
      expect(cryst).toHaveLength(0);
    });

    it('substitution crystallize via flush: length matches currentText length', () => {
      // Create a substitution buffer (original "abc" → current "hello") and flush it
      const state: EditBoundaryState = {
        pending: createBuffer(3, 'hello', 'abc', NOW, 'cn-1'),
        isComposing: false,
        config: defaultConfig(),
      };
      const { effects } = processEvent(state, { type: 'flush' }, ctx());
      const cryst = singleEffect(effects, 'crystallize');
      expect(cryst.changeType).toBe('substitution');
      expect(cryst).toHaveLength(5); // 'hello'.length
    });
  });

  describe('composition lifecycle', () => {
    it('full IME lifecycle: isComposing=true → ignore edits → isComposing=false → resume', () => {
      let state = stateNoPending();

      // Type "hel"
      state = processEvent(state, { type: 'insertion', offset: 0, text: 'h' }, ctx(() => 'cn-1')).newState;
      state = processEvent(state, { type: 'insertion', offset: 1, text: 'e' }, ctx()).newState;
      state = processEvent(state, { type: 'insertion', offset: 2, text: 'l' }, ctx()).newState;
      expect(state.pending!.currentText).toBe('hel');

      // Set isComposing=true directly
      state = { ...state, isComposing: true };
      expect(state.isComposing).toBe(true);

      // Edits during composition are ignored
      const { newState: s1, effects: e1 } = processEvent(
        state,
        { type: 'insertion', offset: 3, text: 'lo' },
        ctx(),
      );
      expect(e1).toHaveLength(0);
      expect(s1.pending!.currentText).toBe('hel'); // unchanged
      state = s1;

      // Clear isComposing=false directly
      state = { ...state, isComposing: false };
      expect(state.isComposing).toBe(false);

      // Resume typing normally
      state = processEvent(state, { type: 'insertion', offset: 3, text: 'l' }, ctx()).newState;
      expect(state.pending!.currentText).toBe('hell');
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
        expect(result.newState.pending !== null).toBeTruthy();
        expect(result.newState.pending!.currentText).toBe('');
        expect(result.newState.pending!.originalText).toBe('abc');
        expect(result.newState.pending!.anchorOffset).toBe(5);
      });

      it('emits overlay, not crystallize', () => {
        const result = processEvent(
          stateNoPending(),
          { type: 'deletion', offset: 5, deletedText: 'x' },
          ctx(),
        );
        expect(effectsOfType(result.effects, 'crystallize')).toHaveLength(0);
        expect(effectsOfType(result.effects, 'updatePendingOverlay')).toHaveLength(1);
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
        expect(result.newState.pending !== null).toBeTruthy();
        expect(result.newState.pending!.currentText).toBe('new');
        expect(result.newState.pending!.originalText).toBe('old');
        expect(result.newState.pending!.anchorOffset).toBe(5);
      });

      it('emits overlay, not crystallize', () => {
        const result = processEvent(
          stateNoPending(),
          { type: 'substitution', offset: 5, oldText: 'old', newText: 'new' },
          ctx(),
        );
        expect(effectsOfType(result.effects, 'crystallize')).toHaveLength(0);
        expect(effectsOfType(result.effects, 'updatePendingOverlay')).toHaveLength(1);
      });
    });

    // ── Extend-backward ────────────────────────────────────────────────

    describe('extend-backward (backspace before region)', () => {
      it('prepends to originalText and shifts anchor', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(10, 'new', 'old', NOW, 'cn-1'),
          isComposing: false,
          config: defaultConfig(),
        };
        const result = processEvent(
          state,
          { type: 'deletion', offset: 9, deletedText: 'x' },
          ctx(),
        );
        expect(result.newState.pending !== null).toBeTruthy();
        expect(result.newState.pending!.originalText).toBe('xold');
        expect(result.newState.pending!.anchorOffset).toBe(9);
        expect(result.newState.pending!.currentText).toBe('new');
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
        expect(result.newState.pending !== null).toBeTruthy();
        expect(result.newState.pending!.originalText).toBe('x');
        expect(result.newState.pending!.anchorOffset).toBe(10);
        expect(result.newState.pending!.currentText).toBe('hello');
      });
    });

    // ── Flush with content-determined type ─────────────────────────────

    describe('flush determines crystallize type from content', () => {
      it('insertion: originalText empty, currentText non-empty', () => {
        const state = stateWithPending('hello', 10);
        const result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        expect(cryst).toHaveLength(1);
        expect((cryst[0] as any).changeType).toBe('insertion');
        expect((cryst[0] as any).currentText).toBe('hello');
        expect((cryst[0] as any).originalText).toBe('');
      });

      it('deletion: currentText empty, originalText non-empty', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(10, '', 'deleted', NOW, 'cn-1'),
          isComposing: false,
          config: defaultConfig(),
        };
        const result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        expect(cryst).toHaveLength(1);
        expect((cryst[0] as any).changeType).toBe('deletion');
        expect((cryst[0] as any).originalText).toBe('deleted');
      });

      it('substitution: both non-empty', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(10, 'new', 'old', NOW, 'cn-1'),
          isComposing: false,
          config: defaultConfig(),
        };
        const result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        expect(cryst).toHaveLength(1);
        expect((cryst[0] as any).changeType).toBe('substitution');
        expect((cryst[0] as any).currentText).toBe('new');
        expect((cryst[0] as any).originalText).toBe('old');
      });

      it('self-cancellation: both empty → no crystallize', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(10, '', '', NOW, 'cn-1'),
          isComposing: false,
          config: defaultConfig(),
        };
        const result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        expect(cryst).toHaveLength(0);
        expect(result.newState.pending).toBeNull();
      });
    });

    // ── Cross-type coalescing sequences ────────────────────────────────

    describe('cross-type coalescing', () => {
      it('rapid backspaces coalesce into one deletion', () => {
        let state = stateNoPending();
        let result = processEvent(state, { type: 'deletion', offset: 4, deletedText: 'o' }, ctx());
        state = result.newState;
        expect(state.pending!.originalText).toBe('o');

        result = processEvent(state, { type: 'deletion', offset: 3, deletedText: 'l' }, ctx());
        state = result.newState;
        expect(state.pending!.originalText).toBe('lo');
        expect(state.pending!.anchorOffset).toBe(3);

        result = processEvent(state, { type: 'deletion', offset: 2, deletedText: 'l' }, ctx());
        state = result.newState;
        expect(state.pending!.originalText).toBe('llo');
        expect(state.pending!.anchorOffset).toBe(2);

        result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        expect(cryst).toHaveLength(1);
        expect((cryst[0] as any).changeType).toBe('deletion');
        expect((cryst[0] as any).originalText).toBe('llo');
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
        expect(state.pending!.originalText).toBe('quick');
        expect(state.pending!.currentText).toBe('');
        expect(state.pending!.anchorOffset).toBe(4);

        result = processEvent(state, { type: 'insertion', offset: 4, text: 's' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'insertion', offset: 5, text: 'l' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'insertion', offset: 6, text: 'o' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'insertion', offset: 7, text: 'w' }, ctx());
        state = result.newState;
        expect(state.pending!.originalText).toBe('quick');
        expect(state.pending!.currentText).toBe('slow');

        result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        expect(cryst).toHaveLength(1);
        expect((cryst[0] as any).changeType).toBe('substitution');
        expect((cryst[0] as any).originalText).toBe('quick');
        expect((cryst[0] as any).currentText).toBe('slow');
      });

      it('type-then-backspace-all produces self-cancellation', () => {
        let state = stateNoPending();
        let result = processEvent(state, { type: 'insertion', offset: 0, text: 'a' }, ctx(() => 'cn-1'));
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

        expect(state.pending).toBeNull();
      });

      it('forward delete coalesces', () => {
        let state = stateNoPending();
        let result = processEvent(state, { type: 'deletion', offset: 5, deletedText: 'a' }, ctx());
        state = result.newState;
        result = processEvent(state, { type: 'deletion', offset: 5, deletedText: 'b' }, ctx());
        state = result.newState;
        expect(state.pending!.originalText).toBe('ab');
        expect(state.pending!.anchorOffset).toBe(5);

        result = processEvent(state, { type: 'flush' }, ctx());
        const cryst = effectsOfType(result.effects, 'crystallize');
        expect(cryst).toHaveLength(1);
        expect((cryst[0] as any).changeType).toBe('deletion');
        expect((cryst[0] as any).originalText).toBe('ab');
      });
    });

    // ── Timestamp-based break ──────────────────────────────────────────

    describe('timestamp-based break', () => {
      it('breaks when time gap exceeds pauseThresholdMs', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(0, 'ab', '', 1000, 'cn-1'),
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
        expect(effects.some(e => e.type === 'crystallize')).toBeTruthy();
        expect(newState.pending !== null).toBeTruthy();
        expect(newState.pending!.currentText).toBe('x');
      });

      it('extends when time gap is within pauseThresholdMs', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(0, 'ab', '', 1000, 'cn-1'),
          isComposing: false,
          config: { ...DEFAULT_EDIT_BOUNDARY_CONFIG, pauseThresholdMs: 5000 },
        };
        // 3000ms elapsed < 5000ms threshold, and adjacent → extend
        const { newState, effects } = processEvent(
          state,
          { type: 'insertion', offset: 2, text: 'c' },
          { now: 4000 },
        );
        expect(effects.some(e => e.type === 'crystallize')).toBeFalsy();
        expect(newState.pending!.currentText).toBe('abc');
      });

      it('skips timestamp check when pauseThresholdMs is 0', () => {
        const state: EditBoundaryState = {
          pending: createBuffer(0, 'ab', '', 1000, 'cn-1'),
          isComposing: false,
          config: { ...DEFAULT_EDIT_BOUNDARY_CONFIG, pauseThresholdMs: 0 },
        };
        // Even with huge time gap, should extend (timer disabled)
        const { newState } = processEvent(
          state,
          { type: 'insertion', offset: 2, text: 'c' },
          { now: 999999 },
        );
        expect(newState.pending!.currentText).toBe('abc');
      });
    });
  });

  describe('cursorMove event', () => {
    it('should not flush when cursor is inside pending buffer', () => {
      const state = stateWithPending('hello', 10);
      const event: EditEvent = { type: 'cursorMove', offset: 13 };
      const result = processEvent(state, event, ctx());
      expect(result.newState.pending).not.toBeNull();
      expect(result.effects).toHaveLength(0);
    });

    it('should not flush when cursor is at buffer end', () => {
      const state = stateWithPending('hello', 10);
      const event: EditEvent = { type: 'cursorMove', offset: 15 };
      const result = processEvent(state, event, ctx());
      expect(result.newState.pending).not.toBeNull();
    });

    it('should flush when cursor moves outside buffer range', () => {
      const state = stateWithPending('hello', 10);
      const event: EditEvent = { type: 'cursorMove', offset: 50 };
      const result = processEvent(state, event, ctx());
      expect(result.newState.pending).toBeNull();
      const crystallizes = result.effects.filter(e => e.type === 'crystallize');
      expect(crystallizes).toHaveLength(1);
    });

    it('should not flush when cursor moves outside pure deletion buffer', () => {
      const state = stateWithPending('', 10, undefined, 'cn-1', 'del');
      const event: EditEvent = { type: 'cursorMove', offset: 50 };
      const result = processEvent(state, event, ctx());
      expect(result.newState.pending).not.toBeNull();
      expect(result.effects).toHaveLength(0);
    });

    it('should be no-op when no pending buffer exists', () => {
      const state = stateNoPending();
      const event: EditEvent = { type: 'cursorMove', offset: 5 };
      const result = processEvent(state, event, ctx());
      expect(result.newState.pending).toBeNull();
      expect(result.effects).toHaveLength(0);
    });

    it('should not flush after enter key when cursor stays at buffer end', () => {
      // Simulate: type "hi", press Enter, cursor moves to new line
      // breakOnNewline=false so newline extends the buffer instead of breaking
      let state = stateNoPending({ breakOnNewline: false });
      let result = processEvent(state, { type: 'insertion', offset: 0, text: 'h' }, ctx());
      state = result.newState;
      result = processEvent(state, { type: 'insertion', offset: 1, text: 'i' }, ctx());
      state = result.newState;
      result = processEvent(state, { type: 'insertion', offset: 2, text: '\n' }, ctx());
      state = result.newState;
      result = processEvent(state, { type: 'cursorMove', offset: 3 }, ctx());
      expect(result.newState.pending).not.toBeNull();
      expect(result.newState.pending!.currentText).toBe('hi\n');
    });
  });

  describe('fully-formed L2 crystallize effects', () => {
    const fullCtx = (overrides?: Partial<ProcessEventContext>): ProcessEventContext => ({
      now: NOW,
      allocateScId: () => 'cn-1',
      author: '@alice',
      documentText: 'hello world',
      documentFormat: 'l2',
      ...overrides,
    });

    it('should produce L2 markupEdit + footnoteEdit for insertion', () => {
      const state = stateWithPending(' new', 5, undefined, 'cn-1');
      const result = processEvent(state, { type: 'flush' }, fullCtx({
        documentText: 'hello new world',
      }));

      const cryst = result.effects.find(e => e.type === 'crystallize');
      expect(cryst).toBeDefined();
      expect('edits' in cryst!).toBe(true);
      const edits = (cryst as FullCrystallizeEffect).edits;
      expect(edits.format).toBe('l2');
      if (edits.format === 'l2') {
        expect(edits.markupEdit.newText).toContain(' new');
        expect(edits.markupEdit.newText).toContain('++}');
        expect(edits.markupEdit.offset).toBe(5);
        expect(edits.markupEdit.length).toBe(4); // length of ' new'
        expect(edits.footnoteEdit.newText).toContain('[^cn-1]:');
        expect(edits.footnoteEdit.newText).toContain('@alice');
        expect(edits.footnoteEdit.newText).toContain('ins');
        expect(edits.footnoteEdit.newText).toContain('proposed');
      }
    });

    it('should produce L2 markupEdit for deletion', () => {
      const state = stateWithPending('', 5, undefined, 'cn-2', ' old');
      const result = processEvent(state, { type: 'flush' }, fullCtx({
        documentText: 'helloworld',
        allocateScId: () => 'cn-2',
      }));

      const cryst = result.effects.find(e => e.type === 'crystallize') as FullCrystallizeEffect;
      expect(cryst.edits.format).toBe('l2');
      if (cryst.edits.format === 'l2') {
        expect(cryst.edits.markupEdit.newText).toContain('--}');
        expect(cryst.edits.markupEdit.length).toBe(0); // deletion inserts at point
        expect(cryst.edits.footnoteEdit.newText).toContain('del');
      }
    });

    it('should produce L2 markupEdit for substitution', () => {
      const state = stateWithPending('new', 5, undefined, 'cn-3', 'old');
      const result = processEvent(state, { type: 'flush' }, fullCtx({
        documentText: 'hellonewworld',
        allocateScId: () => 'cn-3',
      }));

      const cryst = result.effects.find(e => e.type === 'crystallize') as FullCrystallizeEffect;
      expect(cryst.edits.format).toBe('l2');
      if (cryst.edits.format === 'l2') {
        expect(cryst.edits.markupEdit.newText).toContain('new');
        expect(cryst.edits.markupEdit.newText).toContain('~~}');
      }
    });

    it('should fall back to legacy crystallize when context lacks documentText', () => {
      const state = stateWithPending('test', 5);
      const result = processEvent(state, { type: 'flush' }, ctx());

      const cryst = result.effects.find(e => e.type === 'crystallize');
      expect(cryst).toBeDefined();
      expect('changeType' in cryst!).toBe(true);
      expect('edits' in cryst!).toBe(false);
    });
  });

  describe('fully-formed L3 crystallize effects', () => {
    beforeAll(async () => {
      await initHashline();
    });

    const l3Ctx = (docText: string, overrides?: Partial<ProcessEventContext>): ProcessEventContext => ({
      now: NOW,
      allocateScId: () => 'cn-1',
      author: '@alice',
      documentText: docText,
      documentFormat: 'l3',
      ...overrides,
    });

    it('should produce L3 footnoteEdit with LINE:HASH for insertion', () => {
      // stateWithPending(text, anchorOffset, configOverride, scId, originalText)
      const state = stateWithPending('new ', 6, undefined, 'cn-1', '');
      const docText = 'hello new world\n';
      const result = processEvent(state, { type: 'flush' }, l3Ctx(docText));

      const cryst = result.effects.find(e => e.type === 'crystallize') as FullCrystallizeEffect;
      expect(cryst).toBeDefined();
      expect(cryst.edits.format).toBe('l3');
      if (cryst.edits.format === 'l3') {
        expect(cryst.edits.markupEdit).toBeNull();
        expect(cryst.edits.footnoteEdit.newText).toContain('[^cn-1]:');
        expect(cryst.edits.footnoteEdit.newText).toContain('@alice');
        expect(cryst.edits.footnoteEdit.newText).toContain('new ');
        // Should contain LINE:HASH format
        expect(cryst.edits.footnoteEdit.newText).toMatch(/\d+:[a-f0-9]+/);
      }
    });

    it('should produce L3 footnoteEdit for deletion', () => {
      // stateWithPending(text, anchorOffset, configOverride, scId, originalText)
      const state = stateWithPending('', 5, undefined, 'cn-2', ' old');
      const docText = 'helloworld\n';
      const result = processEvent(state, { type: 'flush' }, l3Ctx(docText, {
        allocateScId: () => 'cn-2',
      }));

      const cryst = result.effects.find(e => e.type === 'crystallize') as FullCrystallizeEffect;
      expect(cryst).toBeDefined();
      expect(cryst.edits.format).toBe('l3');
      if (cryst.edits.format === 'l3') {
        expect(cryst.edits.markupEdit).toBeNull();
        expect(cryst.edits.footnoteEdit.newText).toContain('[^cn-2]:');
        expect(cryst.edits.footnoteEdit.newText).toContain(' old');
        expect(cryst.edits.footnoteEdit.newText).toContain('del');
        expect(cryst.edits.footnoteEdit.newText).toMatch(/\d+:[a-f0-9]+/);
      }
    });

    it('should produce L3 footnoteEdit for substitution', () => {
      // stateWithPending(text, anchorOffset, configOverride, scId, originalText)
      const state = stateWithPending('new', 5, undefined, 'cn-3', 'old');
      const docText = 'hellonewworld\n';
      const result = processEvent(state, { type: 'flush' }, l3Ctx(docText, {
        allocateScId: () => 'cn-3',
      }));

      const cryst = result.effects.find(e => e.type === 'crystallize') as FullCrystallizeEffect;
      expect(cryst).toBeDefined();
      expect(cryst.edits.format).toBe('l3');
      if (cryst.edits.format === 'l3') {
        expect(cryst.edits.markupEdit).toBeNull();
        expect(cryst.edits.footnoteEdit.newText).toContain('[^cn-3]:');
        expect(cryst.edits.footnoteEdit.newText).toContain('~~}');
        expect(cryst.edits.footnoteEdit.newText).toMatch(/\d+:[a-f0-9]+/);
      }
    });

    it('should set footnoteEdit offset to document end', () => {
      const state = stateWithPending('new ', 6, undefined, 'cn-1', '');
      const docText = 'hello new world\n';
      const result = processEvent(state, { type: 'flush' }, l3Ctx(docText));

      const cryst = result.effects.find(e => e.type === 'crystallize') as FullCrystallizeEffect;
      if (cryst.edits.format === 'l3') {
        expect(cryst.edits.footnoteEdit.offset).toBe(docText.length);
        expect(cryst.edits.footnoteEdit.length).toBe(0);
      }
    });
  });

  describe('atomic merge in crystallize', () => {
    it('should merge adjacent insertion when documentText reveals neighbor', () => {
      // Document has an existing {++first++}[^cn-1] at position 0, then user typed 'second' right after it
      // The documentText contains the already-applied CriticMarkup from a previous edit
      // After wrapping 'second' in {++second++}, the two adjacent insertions should be merged
      const docText = '{++first++}[^cn-1]second rest of doc';
      // 'second' starts at offset 18 (after '{++first++}[^cn-1]')
      const state = stateWithPending('second', 18, undefined, 'cn-2');
      const result = processEvent(state, { type: 'flush' }, {
        now: NOW,
        allocateScId: () => 'cn-2',
        author: '@alice',
        documentText: docText,
        documentFormat: 'l2',
      });

      const cryst = result.effects.find(e => e.type === 'crystallize') as FullCrystallizeEffect;
      expect(cryst.edits.format).toBe('l2');
      if (cryst.edits.format === 'l2') {
        // Merged: should combine both insertions into one markup span
        expect(cryst.edits.markupEdit.newText).toContain('firstsecond');
      }
    });

    it('should not emit mergeAdjacent when documentText is provided', () => {
      const state = stateWithPending('test', 5, undefined, 'cn-1');
      const result = processEvent(state, { type: 'flush' }, {
        now: NOW,
        allocateScId: () => 'cn-1',
        author: '@alice',
        documentText: 'hellotest world',
        documentFormat: 'l2',
      });

      const merges = result.effects.filter(e => e.type === 'mergeAdjacent');
      expect(merges).toHaveLength(0);
    });

    it('should still emit mergeAdjacent when documentText is absent (legacy)', () => {
      const state = stateWithPending('test', 5);
      const result = processEvent(state, { type: 'flush' }, ctx());

      const merges = result.effects.filter(e => e.type === 'mergeAdjacent');
      expect(merges).toHaveLength(1);
    });
  });
});
