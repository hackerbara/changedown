import { describe, it, expect } from 'vitest';
import type { EditBoundaryState, EditBoundaryConfig, EditEvent } from '@changedown/core/edit-boundary';
import { classifySignal, createBuffer, DEFAULT_EDIT_BOUNDARY_CONFIG } from '@changedown/core/edit-boundary';

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
      expect(classifySignal({ type: 'editorSwitch' }, stateNoPending())).toBe('hard-break');
    });

    it('editorSwitch → hard-break (with pending)', () => {
      expect(classifySignal({ type: 'editorSwitch' }, stateWithPending('abc'))).toBe('hard-break');
    });

    it('save → hard-break', () => {
      expect(classifySignal({ type: 'save' }, stateWithPending('abc'))).toBe('hard-break');
    });

    it('flush → hard-break', () => {
      expect(classifySignal({ type: 'flush' }, stateWithPending('abc'))).toBe('hard-break');
    });

    it('flush → hard-break (no pending)', () => {
      expect(classifySignal({ type: 'flush' }, stateNoPending())).toBe('hard-break');
    });
  });

  // ── IME composing suppresses edits ──────────────────────────────────

  describe('edits during composition', () => {
    it('insertion during composition → ignore', () => {
      expect(classifySignal({ type: 'insertion', offset: 15, text: 'x' }, stateComposing('hello'))).toBe('ignore');
    });

    it('deletion during composition → ignore', () => {
      expect(classifySignal({ type: 'deletion', offset: 14, deletedText: 'o' }, stateComposing('hello'))).toBe('ignore');
    });

    it('substitution during composition → ignore', () => {
      expect(classifySignal(
          { type: 'substitution', offset: 10, oldText: 'he', newText: 'HE' },
          stateComposing('hello'),
        )).toBe('ignore');
    });
  });

  // ── No pending buffer ───────────────────────────────────────────────

  describe('no pending buffer', () => {
    it('insertion → break', () => {
      expect(classifySignal({ type: 'insertion', offset: 5, text: 'a' }, stateNoPending())).toBe('break');
    });

    it('deletion → break', () => {
      expect(classifySignal({ type: 'deletion', offset: 5, deletedText: 'x' }, stateNoPending())).toBe('break');
    });

    it('substitution → break', () => {
      expect(classifySignal(
          { type: 'substitution', offset: 5, oldText: 'a', newText: 'b' },
          stateNoPending(),
        )).toBe('break');
    });
  });

  // ── Newline handling ────────────────────────────────────────────────

  describe('newline handling', () => {
    it('newline insertion → break (breakOnNewline=true)', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 15, text: '\n' },
          stateWithPending('hello'),
        )).toBe('break');
    });

    it('newline insertion with breakOnNewline=false → extend', () => {
      const noBreakConfig: EditBoundaryConfig = { ...config, breakOnNewline: false };
      const state: EditBoundaryState = {
        pending: createBuffer(10, 'hello', '', NOW),
        isComposing: false,
        config: noBreakConfig,
      };
      expect(classifySignal({ type: 'insertion', offset: 15, text: '\n' }, state)).toBe('extend');
    });

    it('text containing newline → break', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 15, text: 'abc\ndef' },
          stateWithPending('hello'),
        )).toBe('break');
    });
  });

  // ── Paste detection ─────────────────────────────────────────────────

  describe('paste detection', () => {
    it('large insertion → break', () => {
      const longText = 'x'.repeat(50);
      expect(classifySignal(
          { type: 'insertion', offset: 15, text: longText },
          stateWithPending('hello'),
        )).toBe('break');
    });

    it('insertion just under threshold → extend', () => {
      const shortText = 'x'.repeat(49);
      expect(classifySignal(
          { type: 'insertion', offset: 15, text: shortText },
          stateWithPending('hello'),
        )).toBe('extend');
    });
  });

  // ── Extend ──────────────────────────────────────────────────────────

  describe('extend (insertion at buffer end)', () => {
    it('single char at end → extend', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 15, text: 'x' },
          stateWithPending('hello'),
        )).toBe('extend');
    });

    it('multi-char at end (below paste threshold) → extend', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 15, text: 'xyz' },
          stateWithPending('hello'),
        )).toBe('extend');
    });
  });

  // ── Extend (backspace before region) ─────────────────────────────

  describe('extend (deletion adjacent before region)', () => {
    it('single backspace just before anchor → extend', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 9, deletedText: 'x' },
          stateWithPending('hello'),
        )).toBe('extend');
    });

    it('multi-char deletion ending at anchor → extend', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 7, deletedText: 'abc' },
          stateWithPending('hello'),
        )).toBe('extend');
    });

    it('backspace before region with empty currentText → extend', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 9, deletedText: 'x' },
          stateWithPending('', 10, 'old'),
        )).toBe('extend');
    });
  });

  // ── Extend (forward delete at region end) ──────────────────────────

  describe('extend (deletion adjacent after region)', () => {
    it('forward delete at buffer end → extend', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 15, deletedText: 'x' },
          stateWithPending('hello'),
        )).toBe('extend');
    });

    it('multi-char forward delete at buffer end → extend', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 15, deletedText: 'xyz' },
          stateWithPending('hello'),
        )).toBe('extend');
    });

    it('forward delete at end of empty-currentText region → extend', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 10, deletedText: 'x' },
          stateWithPending('', 10, 'old'),
        )).toBe('extend');
    });
  });

  // ── Splice ──────────────────────────────────────────────────────────

  describe('splice (edit within buffer range)', () => {
    it('insertion within buffer → splice', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 12, text: 'X' },
          stateWithPending('hello'),
        )).toBe('splice');
    });

    it('deletion within buffer → splice', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 11, deletedText: 'e' },
          stateWithPending('hello'),
        )).toBe('splice');
    });

    it('insertion at anchor → splice', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 10, text: 'X' },
          stateWithPending('hello'),
        )).toBe('splice');
    });

    it('deletion at anchor → splice', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 10, deletedText: 'h' },
          stateWithPending('hello'),
        )).toBe('splice');
    });

    it('backspace at buffer end-1 → splice (was shrink)', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 14, deletedText: 'o' },
          stateWithPending('hello'),
        )).toBe('splice');
    });

    it('multi-char deletion within → splice', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 13, deletedText: 'lo' },
          stateWithPending('hello'),
        )).toBe('splice');
    });
  });

  // ── Substitution with pending ─────────────────────────────────────

  describe('substitution events', () => {
    it('substitution within currentText range → splice', () => {
      expect(classifySignal(
          { type: 'substitution', offset: 10, oldText: 'hel', newText: 'HEL' },
          stateWithPending('hello'),
        )).toBe('splice');
    });

    it('substitution outside range → break', () => {
      expect(classifySignal(
          { type: 'substitution', offset: 20, oldText: 'abc', newText: 'XYZ' },
          stateWithPending('hello'),
        )).toBe('break');
    });

    it('substitution spanning past buffer end → break', () => {
      expect(classifySignal(
          { type: 'substitution', offset: 13, oldText: 'lo...', newText: 'XYZ' },
          stateWithPending('hello'),
        )).toBe('break');
    });
  });

  // ── Edit outside buffer range → break ──────────────────────────────

  describe('edit outside buffer range', () => {
    it('insertion before buffer → break', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 5, text: 'x' },
          stateWithPending('hello'),
        )).toBe('break');
    });

    it('insertion after buffer → break', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 20, text: 'x' },
          stateWithPending('hello'),
        )).toBe('break');
    });

    it('deletion before buffer (not adjacent) → break', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 5, deletedText: 'x' },
          stateWithPending('hello'),
        )).toBe('break');
    });

    it('deletion after buffer (not adjacent) → break', () => {
      expect(classifySignal(
          { type: 'deletion', offset: 20, deletedText: 'x' },
          stateWithPending('hello'),
        )).toBe('break');
    });
  });

  // ── Edge: empty currentText buffer ────────────────────────────────

  describe('edge: empty currentText pending buffer', () => {
    it('insertion at anchor of empty buffer → extend', () => {
      expect(classifySignal(
          { type: 'insertion', offset: 10, text: 'a' },
          stateWithPending('', 10),
        )).toBe('extend');
    });
  });

  // ── cursorMove classification ───────────────────────────────────────

  describe('cursorMove classification', () => {
    it('should classify cursorMove outside buffer as hard-break', () => {
      const state = stateWithPending('hello', 10);
      const event: EditEvent = { type: 'cursorMove', offset: 50 };
      expect(classifySignal(event, state)).toBe('hard-break');
    });

    it('should classify cursorMove inside buffer as ignore', () => {
      const state = stateWithPending('hello', 10);
      const event: EditEvent = { type: 'cursorMove', offset: 13 };
      expect(classifySignal(event, state)).toBe('ignore');
    });

    it('should classify cursorMove at buffer end as ignore', () => {
      const state = stateWithPending('hello', 10);
      const event: EditEvent = { type: 'cursorMove', offset: 15 };
      expect(classifySignal(event, state)).toBe('ignore');
    });

    it('should classify cursorMove with no pending buffer as ignore', () => {
      const state = stateNoPending();
      const event: EditEvent = { type: 'cursorMove', offset: 5 };
      expect(classifySignal(event, state)).toBe('ignore');
    });

    it('should classify cursorMove outside pure deletion buffer as ignore (exemption)', () => {
      const state = stateWithPending('', 10, 'deleted');
      const event: EditEvent = { type: 'cursorMove', offset: 50 };
      expect(classifySignal(event, state)).toBe('ignore');
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
      expect(classifySignal(
          { type: 'insertion', offset: 15, text: 'x'.repeat(10) },
          state,
        )).toBe('break');
    });

    it('pasteMinChars=10 allows 9-char insertion as extend', () => {
      const customConfig: EditBoundaryConfig = { ...config, pasteMinChars: 10 };
      const state: EditBoundaryState = {
        pending: createBuffer(10, 'hello', '', NOW),
        isComposing: false,
        config: customConfig,
      };
      expect(classifySignal(
          { type: 'insertion', offset: 15, text: 'x'.repeat(9) },
          state,
        )).toBe('extend');
    });
  });
});
