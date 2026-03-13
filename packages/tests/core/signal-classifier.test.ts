import * as assert from 'node:assert';
import type { EditBoundaryState, EditBoundaryConfig } from '@changetracks/core/edit-boundary';
import { classifySignal, createBuffer, DEFAULT_EDIT_BOUNDARY_CONFIG } from '@changetracks/core/edit-boundary';

describe('classifySignal', () => {
  const config: EditBoundaryConfig = { ...DEFAULT_EDIT_BOUNDARY_CONFIG };
  const NOW = 1000;

  function stateWithPending(currentText: string, anchorOffset = 10, originalText = ''): EditBoundaryState {
    return {
      pending: createBuffer(anchorOffset, currentText, originalText, NOW),
      isComposing: false,
      config,
    };
  }

  function stateNoPending(): EditBoundaryState {
    return {
      pending: null,
      isComposing: false,
      config,
    };
  }

  function stateComposing(currentText: string, anchorOffset = 10): EditBoundaryState {
    return {
      pending: createBuffer(anchorOffset, currentText, '', NOW),
      isComposing: true,
      config,
    };
  }

  // ── Always-hard-break events ────────────────────────────────────────

  describe('always-hard-break events', () => {
    it('editorSwitch → hard-break (no pending)', () => {
      assert.strictEqual(
        classifySignal({ type: 'editorSwitch' }, stateNoPending()),
        'hard-break',
      );
    });

    it('editorSwitch → hard-break (with pending)', () => {
      assert.strictEqual(
        classifySignal({ type: 'editorSwitch' }, stateWithPending('abc')),
        'hard-break',
      );
    });

    it('save → hard-break', () => {
      assert.strictEqual(
        classifySignal({ type: 'save' }, stateWithPending('abc')),
        'hard-break',
      );
    });

    it('flush → hard-break', () => {
      assert.strictEqual(
        classifySignal({ type: 'flush' }, stateWithPending('abc')),
        'hard-break',
      );
    });

    it('flush → hard-break (no pending)', () => {
      assert.strictEqual(
        classifySignal({ type: 'flush' }, stateNoPending()),
        'hard-break',
      );
    });
  });

  // ── IME composing suppresses edits ──────────────────────────────────

  describe('edits during composition', () => {
    it('insertion during composition → ignore', () => {
      assert.strictEqual(
        classifySignal({ type: 'insertion', offset: 15, text: 'x' }, stateComposing('hello')),
        'ignore',
      );
    });

    it('deletion during composition → ignore', () => {
      assert.strictEqual(
        classifySignal({ type: 'deletion', offset: 14, deletedText: 'o' }, stateComposing('hello')),
        'ignore',
      );
    });

    it('substitution during composition → ignore', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'substitution', offset: 10, oldText: 'he', newText: 'HE' },
          stateComposing('hello'),
        ),
        'ignore',
      );
    });
  });

  // ── No pending buffer ───────────────────────────────────────────────

  describe('no pending buffer', () => {
    it('insertion → break', () => {
      assert.strictEqual(
        classifySignal({ type: 'insertion', offset: 5, text: 'a' }, stateNoPending()),
        'break',
      );
    });

    it('deletion → break', () => {
      assert.strictEqual(
        classifySignal({ type: 'deletion', offset: 5, deletedText: 'x' }, stateNoPending()),
        'break',
      );
    });

    it('substitution → break', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'substitution', offset: 5, oldText: 'a', newText: 'b' },
          stateNoPending(),
        ),
        'break',
      );
    });
  });

  // ── Newline handling ────────────────────────────────────────────────

  describe('newline handling', () => {
    it('newline insertion → break (breakOnNewline=true)', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 15, text: '\n' },
          stateWithPending('hello'),
        ),
        'break',
      );
    });

    it('newline insertion with breakOnNewline=false → extend', () => {
      const noBreakConfig: EditBoundaryConfig = { ...config, breakOnNewline: false };
      const state: EditBoundaryState = {
        pending: createBuffer(10, 'hello', '', NOW),
        isComposing: false,
        config: noBreakConfig,
      };
      assert.strictEqual(
        classifySignal({ type: 'insertion', offset: 15, text: '\n' }, state),
        'extend',
      );
    });

    it('text containing newline → break', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 15, text: 'abc\ndef' },
          stateWithPending('hello'),
        ),
        'break',
      );
    });
  });

  // ── Paste detection ─────────────────────────────────────────────────

  describe('paste detection', () => {
    it('large insertion → break', () => {
      const longText = 'x'.repeat(50);
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 15, text: longText },
          stateWithPending('hello'),
        ),
        'break',
      );
    });

    it('insertion just under threshold → extend', () => {
      const shortText = 'x'.repeat(49);
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 15, text: shortText },
          stateWithPending('hello'),
        ),
        'extend',
      );
    });
  });

  // ── Extend ──────────────────────────────────────────────────────────

  describe('extend (insertion at buffer end)', () => {
    it('single char at end → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 15, text: 'x' },
          stateWithPending('hello'),
        ),
        'extend',
      );
    });

    it('multi-char at end (below paste threshold) → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 15, text: 'xyz' },
          stateWithPending('hello'),
        ),
        'extend',
      );
    });
  });

  // ── Extend (backspace before region) ─────────────────────────────

  describe('extend (deletion adjacent before region)', () => {
    it('single backspace just before anchor → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 9, deletedText: 'x' },
          stateWithPending('hello'),
        ),
        'extend',
      );
    });

    it('multi-char deletion ending at anchor → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 7, deletedText: 'abc' },
          stateWithPending('hello'),
        ),
        'extend',
      );
    });

    it('backspace before region with empty currentText → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 9, deletedText: 'x' },
          stateWithPending('', 10, 'old'),
        ),
        'extend',
      );
    });
  });

  // ── Extend (forward delete at region end) ──────────────────────────

  describe('extend (deletion adjacent after region)', () => {
    it('forward delete at buffer end → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 15, deletedText: 'x' },
          stateWithPending('hello'),
        ),
        'extend',
      );
    });

    it('multi-char forward delete at buffer end → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 15, deletedText: 'xyz' },
          stateWithPending('hello'),
        ),
        'extend',
      );
    });

    it('forward delete at end of empty-currentText region → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 10, deletedText: 'x' },
          stateWithPending('', 10, 'old'),
        ),
        'extend',
      );
    });
  });

  // ── Splice ──────────────────────────────────────────────────────────

  describe('splice (edit within buffer range)', () => {
    it('insertion within buffer → splice', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 12, text: 'X' },
          stateWithPending('hello'),
        ),
        'splice',
      );
    });

    it('deletion within buffer → splice', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 11, deletedText: 'e' },
          stateWithPending('hello'),
        ),
        'splice',
      );
    });

    it('insertion at anchor → splice', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 10, text: 'X' },
          stateWithPending('hello'),
        ),
        'splice',
      );
    });

    it('deletion at anchor → splice', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 10, deletedText: 'h' },
          stateWithPending('hello'),
        ),
        'splice',
      );
    });

    it('backspace at buffer end-1 → splice (was shrink)', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 14, deletedText: 'o' },
          stateWithPending('hello'),
        ),
        'splice',
      );
    });

    it('multi-char deletion within → splice', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 13, deletedText: 'lo' },
          stateWithPending('hello'),
        ),
        'splice',
      );
    });
  });

  // ── Substitution with pending ─────────────────────────────────────

  describe('substitution events', () => {
    it('substitution within currentText range → splice', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'substitution', offset: 10, oldText: 'hel', newText: 'HEL' },
          stateWithPending('hello'),
        ),
        'splice',
      );
    });

    it('substitution outside range → break', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'substitution', offset: 20, oldText: 'abc', newText: 'XYZ' },
          stateWithPending('hello'),
        ),
        'break',
      );
    });

    it('substitution spanning past buffer end → break', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'substitution', offset: 13, oldText: 'lo...', newText: 'XYZ' },
          stateWithPending('hello'),
        ),
        'break',
      );
    });
  });

  // ── Edit outside buffer range → break ──────────────────────────────

  describe('edit outside buffer range', () => {
    it('insertion before buffer → break', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 5, text: 'x' },
          stateWithPending('hello'),
        ),
        'break',
      );
    });

    it('insertion after buffer → break', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 20, text: 'x' },
          stateWithPending('hello'),
        ),
        'break',
      );
    });

    it('deletion before buffer (not adjacent) → break', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 5, deletedText: 'x' },
          stateWithPending('hello'),
        ),
        'break',
      );
    });

    it('deletion after buffer (not adjacent) → break', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'deletion', offset: 20, deletedText: 'x' },
          stateWithPending('hello'),
        ),
        'break',
      );
    });
  });

  // ── Edge: empty currentText buffer ────────────────────────────────

  describe('edge: empty currentText pending buffer', () => {
    it('insertion at anchor of empty buffer → extend', () => {
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 10, text: 'a' },
          stateWithPending('', 10),
        ),
        'extend',
      );
    });
  });

  // ── Custom config ───────────────────────────────────────────────────

  describe('custom config', () => {
    it('pasteMinChars=10 triggers break for shorter paste', () => {
      const customConfig: EditBoundaryConfig = { ...config, pasteMinChars: 10 };
      const state: EditBoundaryState = {
        pending: createBuffer(10, 'hello', '', NOW),
        isComposing: false,
        config: customConfig,
      };
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 15, text: 'x'.repeat(10) },
          state,
        ),
        'break',
      );
    });

    it('pasteMinChars=10 allows 9-char insertion as extend', () => {
      const customConfig: EditBoundaryConfig = { ...config, pasteMinChars: 10 };
      const state: EditBoundaryState = {
        pending: createBuffer(10, 'hello', '', NOW),
        isComposing: false,
        config: customConfig,
      };
      assert.strictEqual(
        classifySignal(
          { type: 'insertion', offset: 15, text: 'x'.repeat(9) },
          state,
        ),
        'extend',
      );
    });
  });
});
