/**
 * Server-side PendingEditManager — Thin I/O Shell
 *
 * Delegates all edit-boundary logic to the enriched core state machine
 * (`@changedown/core/edit-boundary`). Owns one `EditBoundaryState`
 * per document URI, allocates scId per-URI, manages a safety-net timer,
 * and guards against feedback-loop echoes from our own crystallize edits.
 *
 * Public API designed for Task 7's server.ts integration.
 */

import {
  processEvent,
  type EditBoundaryState,
  type EditEvent,
  type EditBoundaryEffect as Effect,
  type FullCrystallizeEffect,
  type L2CrystallizeResult,
  type L3CrystallizeResult,
  type ProcessEventContext,
  DEFAULT_EDIT_BOUNDARY_CONFIG,
} from '@changedown/core';

// ── Public types ───────────────────────────────────────────────────────

export interface CrystallizedEdit {
  uri: string;
  edits: L2CrystallizeResult | L3CrystallizeResult;
}

export type OnCrystallizeCallback = (edit: CrystallizedEdit) => void;

// ── Per-URI state ──────────────────────────────────────────────────────

interface UriState {
  boundary: EditBoundaryState;
  scIdCounter: number;
  /** Last-known document text — kept for safety-net flushes */
  lastDocumentText?: string;
}

// ── Manager ────────────────────────────────────────────────────────────

export class PendingEditManager {
  private states: Map<string, UriState> = new Map();
  private pendingEchos: Set<string> = new Set();
  private safetyNetInterval: ReturnType<typeof setInterval> | null = null;
  private _pauseThresholdMs: number = 2000;
  private _author: string = '@unknown';

  constructor(
    private readonly onCrystallize: OnCrystallizeCallback,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Process an edit event. Returns false if the edit was an echo from
   * our own crystallize (feedback loop guard).
   */
  public handleChange(
    uri: string,
    type: 'insertion' | 'deletion' | 'substitution',
    offset: number,
    text: string,
    deletedText: string,
    documentText: string,
  ): boolean {
    // Feedback loop guard: skip echoes from our own crystallize edits
    if (this.pendingEchos.has(uri)) {
      this.pendingEchos.delete(uri);
      return false;
    }

    let event: EditEvent;
    switch (type) {
      case 'insertion':
        event = { type: 'insertion', offset, text };
        break;
      case 'deletion':
        event = { type: 'deletion', offset, deletedText };
        break;
      case 'substitution':
        event = { type: 'substitution', offset, oldText: deletedText, newText: text };
        break;
    }

    const uriState = this.getUriState(uri);
    uriState.lastDocumentText = documentText;
    const ctx = this.buildContext(uri, uriState, documentText);
    const { newState, effects } = processEvent(uriState.boundary, event, ctx);
    uriState.boundary = newState;
    this.executeEffects(uri, effects);

    if (uriState.boundary.pending) {
      this.ensureSafetyNet();
    }
    return true;
  }

  /**
   * Process a cursor move event.
   */
  public handleCursorMove(uri: string, offset: number, documentText: string): void {
    const uriState = this.states.get(uri);
    if (!uriState?.boundary.pending) return;

    const event: EditEvent = { type: 'cursorMove', offset };
    const ctx = this.buildContext(uri, uriState, documentText);
    const { newState, effects } = processEvent(uriState.boundary, event, ctx);
    uriState.boundary = newState;
    this.executeEffects(uri, effects);
  }

  /**
   * Force flush a document's pending buffer.
   */
  public flush(uri: string, documentText?: string): void {
    const uriState = this.states.get(uri);
    if (!uriState?.boundary.pending) return;

    const event: EditEvent = { type: 'flush' };
    const text = documentText ?? uriState.lastDocumentText;
    const ctx = this.buildContext(uri, uriState, text);
    const { newState, effects } = processEvent(uriState.boundary, event, ctx);
    uriState.boundary = newState;
    this.executeEffects(uri, effects);
  }

  /**
   * Flush all documents with pending buffers.
   */
  public flushAll(): void {
    for (const uri of this.states.keys()) {
      this.flush(uri);
    }
  }

  /**
   * Check if a document has a pending edit buffer.
   */
  public hasPendingEdit(uri: string): boolean {
    return this.states.get(uri)?.boundary.pending !== null &&
           this.states.get(uri)?.boundary.pending !== undefined;
  }

  /**
   * Clean up state for a closed document.
   */
  public removeDocument(uri: string): void {
    this.states.delete(uri);
    this.pendingEchos.delete(uri);
    if (!this.anyPending()) {
      this.stopSafetyNet();
    }
  }

  /**
   * Mark that we expect an echo didChange from our own crystallize edit.
   */
  public expectEcho(uri: string): void {
    this.pendingEchos.add(uri);
  }

  /**
   * Consume a pending echo without processing it as a real edit.
   * Used when a full-doc sync arrives (no range) — the echo is expected
   * but handleChange is never called, so we must clear it explicitly.
   */
  public consumeEcho(uri: string): void {
    this.pendingEchos.delete(uri);
  }

  /**
   * Configure pause sensitivity.
   * Formula: 500 * 16^(1 - sensitivity). sensitivity <= 0 means disabled.
   */
  public setPauseThreshold(sensitivity: number): void {
    this._pauseThresholdMs = sensitivity <= 0
      ? Infinity
      : 500 * Math.pow(16, 1 - sensitivity);

    const newMs = this._pauseThresholdMs === Infinity ? 0 : this._pauseThresholdMs;
    for (const uriState of this.states.values()) {
      uriState.boundary = {
        ...uriState.boundary,
        config: { ...uriState.boundary.config, pauseThresholdMs: newMs },
      };
    }
  }

  /**
   * Set the author identity for footnote metadata.
   */
  public setAuthor(author: string): void {
    this._author = author;
  }

  /**
   * Initialize the scId counter from existing document content.
   * Call on document open with the max cn-N found in the document.
   */
  public initScIdCounter(uri: string, maxId: number): void {
    const uriState = this.getUriState(uri);
    uriState.scIdCounter = maxId;
  }

  /**
   * Clean up all state and stop timers.
   */
  public dispose(): void {
    this.stopSafetyNet();
    this.states.clear();
    this.pendingEchos.clear();
  }

  // ── Internals ──────────────────────────────────────────────────────

  private getUriState(uri: string): UriState {
    let uriState = this.states.get(uri);
    if (!uriState) {
      uriState = {
        boundary: {
          pending: null,
          isComposing: false,
          config: {
            ...DEFAULT_EDIT_BOUNDARY_CONFIG,
            pauseThresholdMs: this._pauseThresholdMs === Infinity ? 0 : this._pauseThresholdMs,
          },
        },
        scIdCounter: 0,
      };
      this.states.set(uri, uriState);
    }
    return uriState;
  }

  private buildContext(uri: string, uriState: UriState, documentText?: string): ProcessEventContext {
    return {
      now: Date.now(),
      allocateScId: () => {
        uriState.scIdCounter++;
        return `cn-${uriState.scIdCounter}`;
      },
      author: this._author,
      documentText,
      documentFormat: 'l2',
    };
  }

  /**
   * Interpret effects from the core state machine.
   */
  private executeEffects(uri: string, effects: Effect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'crystallize':
          if ('edits' in effect) {
            // FullCrystallizeEffect — fully-formed edits from enriched core
            const fullEffect = effect as FullCrystallizeEffect;
            if (fullEffect.edits.format === 'l2' || fullEffect.edits.format === 'l3') {
              this.pendingEchos.add(uri);
              this.onCrystallize({ uri, edits: fullEffect.edits });
            }
          }
          // Legacy crystallize (no 'edits' property): ignored — we always
          // provide full context so core always produces FullCrystallizeEffect.
          break;
        case 'mergeAdjacent':
          // Handled atomically in core Task 5 — no-op on server.
          break;
        case 'updatePendingOverlay':
          // LSP server does not render overlays — no-op.
          break;
      }
    }
  }

  // ── Safety net timer ───────────────────────────────────────────────

  private ensureSafetyNet(): void {
    if (this.safetyNetInterval) return;
    const threshold = this._pauseThresholdMs === Infinity ? 0 : this._pauseThresholdMs;
    if (threshold <= 0) return;

    const checkMs = Math.min(5000, threshold);
    this.safetyNetInterval = setInterval(() => {
      const now = Date.now();
      let anyPending = false;
      for (const [uri, uriState] of this.states) {
        if (uriState.boundary.pending) {
          anyPending = true;
          if (
            uriState.boundary.config.pauseThresholdMs > 0 &&
            now - uriState.boundary.pending.lastEditTime > uriState.boundary.config.pauseThresholdMs
          ) {
            this.flush(uri);
          }
        }
      }
      if (!anyPending) {
        this.stopSafetyNet();
      }
    }, checkMs);
  }

  private stopSafetyNet(): void {
    if (this.safetyNetInterval) {
      clearInterval(this.safetyNetInterval);
      this.safetyNetInterval = null;
    }
  }

  private anyPending(): boolean {
    for (const uriState of this.states.values()) {
      if (uriState.boundary.pending) return true;
    }
    return false;
  }
}
