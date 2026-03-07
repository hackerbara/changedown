/**
 * Server-side PendingEditManager — Thin Adapter
 *
 * Delegates all edit boundary logic to the core state machine
 * (`@changetracks/core/edit-boundary`). Owns one `EditBoundaryState`
 * per document URI, wires LSP events to `EditEvent` types, and
 * interprets effects (crystallize, timer, merge).
 *
 * Public API is identical to the original 455-LOC implementation.
 */

import {
  Workspace,
  ChangeType,
  processEvent,
  type EditBoundaryState,
  type EditEvent,
  type EditBoundaryEffect as Effect,
  DEFAULT_EDIT_BOUNDARY_CONFIG,
  bufferContainsOffsetInclusive,
} from '@changetracks/core';

// ── Public types (preserved for backward compatibility) ─────────────

export interface CrystallizedEdit {
  uri: string;
  offset: number;
  length: number;
  newText: string;
  anchorOffset: number;
}

export type OnCrystallizeCallback = (edit: CrystallizedEdit) => void;
export type GetDocumentTextCallback = (uri: string) => string | undefined;

// ── Adapter ─────────────────────────────────────────────────────────

export class PendingEditManager {
  private states: Map<string, EditBoundaryState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private _pauseThreshold: number = 2000;
  private isMerging: boolean = false;

  constructor(
    private readonly workspace: Workspace,
    private readonly onCrystallize: OnCrystallizeCallback,
    private readonly getDocumentText?: GetDocumentTextCallback,
  ) {}

  public getPauseThreshold(): number {
    return this._pauseThreshold;
  }

  /**
   * Exponential curve: threshold = 500 * 16^(1 - sensitivity)
   *   1.0  -> 500ms    0.5  -> 2000ms (default)    0.0  -> Infinity
   */
  public setPauseThreshold(sensitivity: number): void {
    this._pauseThreshold = sensitivity <= 0
      ? Infinity
      : 500 * Math.pow(16, 1 - sensitivity);

    // Propagate to already-created per-URI states
    const newMs = this._pauseThreshold === Infinity ? 0 : this._pauseThreshold;
    for (const [uri, state] of this.states) {
      this.states.set(uri, {
        ...state,
        config: { ...state.config, pauseThresholdMs: newMs },
      });
    }
  }

  public handleChange(uri: string, oldText: string, newText: string, offset: number): void {
    let event: EditEvent;
    if (oldText.length === 0 && newText.length > 0) {
      event = { type: 'insertion', offset, text: newText };
    } else if (oldText.length > 0 && newText.length === 0) {
      event = { type: 'deletion', offset, deletedText: oldText };
    } else if (oldText.length > 0 && newText.length > 0) {
      event = { type: 'substitution', offset, oldText, newText };
    } else {
      return; // no-op
    }

    const state = this.getState(uri);
    const { newState, effects } = processEvent(state, event, { now: Date.now() });
    this.states.set(uri, newState);
    this.executeEffects(uri, effects);
  }

  public flush(uri: string): void {
    const state = this.states.get(uri);
    if (!state?.pending) return;
    const { newState, effects } = processEvent(state, { type: 'flush' }, { now: Date.now() });
    this.states.set(uri, newState);
    this.executeEffects(uri, effects);
  }

  public flushAll(): void {
    for (const uri of this.states.keys()) {
      this.flush(uri);
    }
  }

  public shouldFlushOnCursorMove(uri: string, cursorOffset: number): boolean {
    const state = this.states.get(uri);
    if (!state?.pending) return false;
    return !bufferContainsOffsetInclusive(state.pending, cursorOffset);
  }

  public hasPendingEdit(uri: string): boolean {
    const state = this.states.get(uri);
    return state?.pending !== null && state?.pending !== undefined;
  }

  /**
   * Remove a single document's state and cancel its timer.
   * Call when a document is closed to prevent memory leaks.
   */
  public removeDocument(uri: string): void {
    const timer = this.timers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(uri);
    }
    this.states.delete(uri);
  }

  public dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.states.clear();
  }

  // ── Internals ───────────────────────────────────────────────────────

  private getState(uri: string): EditBoundaryState {
    let state = this.states.get(uri);
    if (!state) {
      state = {
        pending: null,
        isComposing: false,
        config: {
          ...DEFAULT_EDIT_BOUNDARY_CONFIG,
          pauseThresholdMs: this._pauseThreshold === Infinity ? 0 : this._pauseThreshold,
        },
      };
      this.states.set(uri, state);
    }
    return state;
  }

  /**
   * Interpret effects from the core state machine.
   */
  private executeEffects(uri: string, effects: Effect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'crystallize':
          this.handleCrystallize(uri, effect);
          break;
        case 'scheduleTimer':
          this.scheduleTimer(uri, effect.ms);
          break;
        case 'cancelTimer':
          this.cancelTimer(uri);
          break;
        case 'mergeAdjacent':
          this.mergeAdjacentChanges(uri, effect.offset);
          break;
        case 'updatePendingOverlay':
          // LSP adapter does not render overlays — no-op.
          break;
      }
    }
  }

  private handleCrystallize(
    uri: string,
    effect: Extract<Effect, { type: 'crystallize' }>,
  ): void {
    let edit: { offset: number; length: number; newText: string };
    let anchorOffset: number;

    switch (effect.changeType) {
      case 'insertion':
        edit = this.workspace.wrapInsertion(effect.currentText, effect.offset, effect.scId);
        anchorOffset = effect.offset;
        break;

      case 'deletion':
        edit = this.workspace.wrapDeletion(effect.originalText, effect.offset, effect.scId);
        anchorOffset = effect.offset;
        break;

      case 'substitution':
        edit = this.workspace.wrapSubstitution(effect.originalText, effect.currentText, effect.offset, effect.scId);
        anchorOffset = effect.offset;
        break;
    }

    this.onCrystallize({
      uri,
      offset: edit.offset,
      length: edit.length,
      newText: edit.newText,
      anchorOffset,
    });
  }

  private scheduleTimer(uri: string, ms: number): void {
    this.cancelTimer(uri);
    this.timers.set(uri, setTimeout(() => {
      this.timers.delete(uri);
      const state = this.states.get(uri);
      if (!state?.pending) return;
      const { newState, effects } = processEvent(state, { type: 'timerFired' }, { now: Date.now() });
      this.states.set(uri, newState);
      this.executeEffects(uri, effects);
    }, ms));
  }

  private cancelTimer(uri: string): void {
    const timer = this.timers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(uri);
    }
  }

  /**
   * After flush, check for adjacent same-type changes and merge them.
   * Guards against recursive merging.
   */
  private mergeAdjacentChanges(uri: string, anchorOffset: number): void {
    if (this.isMerging || !this.getDocumentText) return;
    this.isMerging = true;
    try {
      const currentText = this.getDocumentText(uri);
      if (currentText === undefined) return;

      const virtualDoc = this.workspace.parse(currentText);
      const changes = virtualDoc.getChanges();
      if (changes.length < 2) return;

      let idx = -1;
      for (let i = 0; i < changes.length; i++) {
        if (changes[i].range.start === anchorOffset) { idx = i; break; }
      }
      if (idx === -1) return;

      const cur = changes[idx];

      // Check predecessor
      if (idx > 0) {
        const prev = changes[idx - 1];
        if (prev.range.end === cur.range.start && prev.type === cur.type) {
          this.emitMerge(uri, prev, cur);
          return;
        }
      }

      // Check successor
      if (idx < changes.length - 1) {
        const next = changes[idx + 1];
        if (cur.range.end === next.range.start && cur.type === next.type) {
          this.emitMerge(uri, cur, next);
          return;
        }
      }
    } finally {
      this.isMerging = false;
    }
  }

  private emitMerge(
    uri: string,
    first: { type: ChangeType; range: { start: number; end: number }; originalText?: string; modifiedText?: string },
    second: { type: ChangeType; range: { start: number; end: number }; originalText?: string; modifiedText?: string },
  ): void {
    let mergedText: string;
    if (first.type === ChangeType.Insertion) {
      mergedText = `{++${first.modifiedText || ''}${second.modifiedText || ''}++}`;
    } else if (first.type === ChangeType.Deletion) {
      mergedText = `{--${first.originalText || ''}${second.originalText || ''}--}`;
    } else {
      return;
    }

    this.onCrystallize({
      uri,
      offset: first.range.start,
      length: second.range.end - first.range.start,
      newText: mergedText,
      anchorOffset: first.range.start,
    });
  }
}
