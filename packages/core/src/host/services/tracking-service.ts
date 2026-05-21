import { PendingEditManager, type CrystallizedEdit } from '../pending-edit-manager.js';
import { EventEmitter, type Event, type Disposable, type PendingOverlay, type Format } from '../types.js';

export interface TrackingServiceConfig {
  pauseThresholdMs?: number;
  defaultFormat?: Format;
}

export class TrackingService implements Disposable {
  private readonly trackingState = new Map<string, boolean>();
  private readonly pem: PendingEditManager;
  private readonly defaultFormat: Format;

  private readonly _onDidChangeTrackingState = new EventEmitter<{ uri: string; enabled: boolean }>();
  readonly onDidChangeTrackingState: Event<{ uri: string; enabled: boolean }> = this._onDidChangeTrackingState.event;

  private readonly _onDidCrystallize = new EventEmitter<CrystallizedEdit>();
  readonly onDidCrystallize: Event<CrystallizedEdit> = this._onDidCrystallize.event;

  private readonly _onDidChangeOverlay = new EventEmitter<{ uri: string; overlay: PendingOverlay | null }>();
  readonly onDidChangeOverlay: Event<{ uri: string; overlay: PendingOverlay | null }> = this._onDidChangeOverlay.event;

  constructor(config?: TrackingServiceConfig) {
    this.defaultFormat = config?.defaultFormat ?? 'L2';
    this.pem = new PendingEditManager(
      (edit: CrystallizedEdit) => this._onDidCrystallize.fire(edit),
      (uri: string, overlay: PendingOverlay | null) => this._onDidChangeOverlay.fire({ uri, overlay }),
    );
    if (config?.pauseThresholdMs !== undefined) {
      this.pem.setPauseThresholdMs(config.pauseThresholdMs);
    }
  }

  /**
   * Synchronize per-document tracking metadata from the owning controller.
   * This keeps locally-crystallized edits aligned with the current format and
   * prevents new `cn-N` IDs from colliding with existing footnotes.
   */
  initializeDocument(uri: string, options: { format?: Format; maxChangeId?: number }): void {
    this.pem.setDocumentFormat(uri, options.format ?? this.defaultFormat);
    if (options.maxChangeId !== undefined) {
      this.pem.initScIdCounter(uri, options.maxChangeId);
    }
  }

  setDocumentFormat(uri: string, format: Format): void {
    this.pem.setDocumentFormat(uri, format);
  }

  initScIdCounter(uri: string, maxId: number): void {
    this.pem.initScIdCounter(uri, maxId);
  }

  // ── Tracking state ─────────────────────────────────────────

  isTrackingEnabled(uri: string): boolean {
    return this.trackingState.get(uri) ?? false;
  }

  setTrackingEnabled(uri: string, enabled: boolean): void {
    const prev = this.trackingState.get(uri) ?? false;
    if (prev === enabled) return;
    this.trackingState.set(uri, enabled);
    if (!enabled) {
      this.pem.removeDocument(uri);
    }
    this._onDidChangeTrackingState.fire({ uri, enabled });
  }

  toggleTracking(uri: string): void {
    this.setTrackingEnabled(uri, !this.isTrackingEnabled(uri));
  }

  // ── Content routing ────────────────────────────────────────

  handleContentChange(
    uri: string,
    type: 'insertion' | 'deletion' | 'substitution',
    offset: number,
    text: string,
    deletedText: string,
    documentText: string,
  ): boolean {
    if (!this.isTrackingEnabled(uri)) return false;
    return this.pem.handleChange(uri, type, offset, text, deletedText, documentText);
  }

  handleCursorMove(uri: string, offset: number, documentText: string): void {
    if (!this.isTrackingEnabled(uri)) return;
    this.pem.handleCursorMove(uri, offset, documentText);
  }

  handleSave(uri: string): void {
    if (!this.isTrackingEnabled(uri)) return;
    this.pem.flush(uri);
  }

  /** Force-flush PEM state. No tracking guard — safe because PEM has no state for disabled URIs. */
  flush(uri: string): void {
    this.pem.flush(uri);
  }

  closeDocument(uri: string): void {
    this.pem.removeDocument(uri);
    this.trackingState.delete(uri);
  }

  // ── Echo management ────────────────────────────────────────

  expectEcho(uri: string): void {
    this.pem.expectEcho(uri);
  }

  consumeEcho(uri: string): void {
    this.pem.consumeEcho(uri);
  }

  // ── Lifecycle ──────────────────────────────────────────────

  dispose(): void {
    this.pem.dispose();
    this._onDidChangeTrackingState.dispose();
    this._onDidCrystallize.dispose();
    this._onDidChangeOverlay.dispose();
    this.trackingState.clear();
  }
}
