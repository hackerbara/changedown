import type {
  EditorHost, TypedLspConnection, DecorationPort, PreviewPort,
  Disposable, DocumentState, DocumentSnapshot,
  ContentChange, RangeEdit, ReviewResult, ChangeNode, Event,
  FormatAdapter, ParseAdapter, DisplayOptions, Projection,
  SettlementConfig, ApplyEditResult, View, BuiltinView,
} from './types.js';
import { EventEmitter, VIEW_PRESETS } from './types.js';
import { DocumentStateManager } from './document-state-manager.js';
import { DecorationScheduler } from './decoration-scheduler.js';
import { TrackingService, type TrackingServiceConfig } from './services/tracking-service.js';
import { ReviewService, type ReviewOperationResult } from './services/review-service.js';
import { NavigationService } from './services/navigation-service.js';
import { CoherenceService, type CoherenceState } from './services/coherence-service.js';
import { rangeToOffsetBatch, offsetToRange } from './edit-convert.js';
import { type CrystallizedEdit } from './pending-edit-manager.js';
import { type DocumentUri, UriMap, normalizeUri } from './uri.js';
import { FormatService } from './format-service.js';
import { parseL2, parseL3 } from '../operations/parse-document.js';
import { scanMaxCnId } from '../operations/footnote-generator.js';
import type { Format, Document, L2Document, L3Document } from '../model/document.js';
import { LSP_METHOD } from './lsp-methods.js';

export interface ControllerConfig {
  readonly host: EditorHost;
  readonly decorationPort: DecorationPort;
  readonly previewPort?: PreviewPort;
  readonly lsp?: TypedLspConnection;
  readonly formatAdapter: FormatAdapter;
  readonly parseAdapter?: ParseAdapter;
  readonly defaultFormat?: Format;
  readonly defaultDisplay?: DisplayOptions;
  /** Initial view configuration. Defaults to VIEW_PRESETS.working. */
  readonly defaultView?: View;
  readonly hooks?: ControllerHooks;
  readonly settlement?: SettlementConfig;
  readonly tracking?: TrackingServiceConfig;
}

export interface ControllerHooks {
  onWillOpenDocument?: (uri: string) => void;
  onDidOpenDocument?: (uri: string, state: DocumentState) => void;
  onDidCrystallize?: (uri: string) => void;
  onDidReviewComplete?: (result: ReviewResult) => void;
  onDidChangeTrackingState?: (uri: string, enabled: boolean) => void;
  onDecorationData?: (data: { uri: string; changes: ChangeNode[]; documentVersion: number; autoFoldLines?: number[] }) => void;
  onRevealChange?: (offset: number) => void;
  onDispose?: () => void;
}

// Ports are owned by the host, not by BaseController. The host is responsible
// for disposing decorationPort and previewPort when they are no longer needed.
export class BaseController implements Disposable {
  readonly stateManager = new DocumentStateManager();
  readonly trackingService: TrackingService;
  readonly reviewService: ReviewService;
  readonly navigationService: NavigationService;
  readonly coherenceService: CoherenceService;
  readonly scheduler: DecorationScheduler;
  readonly formatService: FormatService;

  private activeUri: DocumentUri | undefined = undefined;
  private _defaultView: View;
  private _viewOverrides = new UriMap<View>();
  /**
   * User-applied display overrides. Merged over the preset's display to
   * build the effective view. Populated from construction-time defaultDisplay
   * and subsequent setDisplay calls.
   *
   * A field set to `undefined` via setDisplay is DELETED from this object
   * rather than stored — consumers can walk a preference back to "use preset
   * default" with setDisplay({field: undefined}).
   */
  private _userDisplay: Partial<DisplayOptions> = {};
  private lastCursorOffset = new UriMap<number>();
  /**
   * URIs currently in an in-flight format conversion. Guards pushSnapshot
   * against rendering stale state while convertFormat's critical section
   * is between host.replaceDocument resolving and state.text being updated.
   */
  private _convertingUris = new Set<string>();
  private disposables: Disposable[] = [];

  private readonly _onDidChangeView = new EventEmitter<View>();
  readonly onDidChangeView: Event<View> = this._onDidChangeView.event;

  private readonly _onDidConvertFormat = new EventEmitter<{
    uri: string;
    from: Format;
    to: Format;
    document: Document;
  }>();
  readonly onDidConvertFormat: Event<{
    uri: string;
    from: Format;
    to: Format;
    document: Document;
  }> = this._onDidConvertFormat.event;

  private readonly _onDidConvertFormatError = new EventEmitter<{
    uri: string;
    error: unknown;
  }>();
  readonly onDidConvertFormatError: Event<{
    uri: string;
    error: unknown;
  }> = this._onDidConvertFormatError.event;

  private readonly host: EditorHost;
  private readonly lsp?: TypedLspConnection;
  private readonly decorationPort: DecorationPort;
  private readonly previewPort?: PreviewPort;
  private readonly defaultFormat: Format;
  private readonly hooks?: ControllerHooks;
  private readonly parseAdapter?: ParseAdapter;

  get defaultView(): View { return this._defaultView; }

  /** Get the active view for a URI, falling back to the default. */
  getView(uri?: DocumentUri): View {
    if (uri && this._viewOverrides.has(uri)) {
      return this._viewOverrides.get(uri)!;
    }
    return this._defaultView;
  }

  /** Set the active view. Pass a BuiltinView name or a custom View object. */
  setView(preset: BuiltinView | View, uri?: DocumentUri): void {
    const basePreset = typeof preset === 'string' ? VIEW_PRESETS[preset] : preset;
    const effectiveView: View = {
      ...basePreset,
      display: { ...basePreset.display, ...this._userDisplay },
    };
    if (uri) {
      this._viewOverrides.set(uri, effectiveView);
    } else {
      this._defaultView = effectiveView;
    }
    if (this.activeUri) {
      const lspName = effectiveView.name as BuiltinView;
      this.lsp?.sendViewMode(this.activeUri, lspName);
    }
    if (uri) {
      this.pushSnapshot(uri);
    } else {
      this.pushSnapshotForAllUris();
    }
    this._onDidChangeView.fire(effectiveView);
  }

  constructor(config: ControllerConfig) {
    this.host = config.host;
    this.lsp = config.lsp;
    this.decorationPort = config.decorationPort;
    this.previewPort = config.previewPort;
    this.defaultFormat = config.defaultFormat ?? 'L2';
    this.hooks = config.hooks;
    this.parseAdapter = config.parseAdapter;
    // Seed _userDisplay from config.defaultDisplay
    if (config.defaultDisplay) {
      for (const [k, v] of Object.entries(config.defaultDisplay)) {
        if (v !== undefined) {
          (this._userDisplay as any)[k] = v;
        }
      }
    }
    // Build initial _defaultView: preset with user overrides layered over
    const basePreset = config.defaultView ?? VIEW_PRESETS.working;
    this._defaultView = {
      ...basePreset,
      display: { ...basePreset.display, ...this._userDisplay },
    };

    this.trackingService = new TrackingService(config.tracking);
    this.reviewService = new ReviewService(
      config.settlement ? { settlement: config.settlement } : undefined,
    );
    this.navigationService = new NavigationService(this.stateManager);
    this.coherenceService = new CoherenceService();
    this.scheduler = new DecorationScheduler((uri) => this.pushSnapshot(uri));
    this.formatService = new FormatService(config.formatAdapter);

    // Subscribe to local TrackingService crystallization events
    this.disposables.push(
      this.trackingService.onDidCrystallize(async (edit) => {
        this.trackingService.expectEcho(edit.uri);
        const rangeEdits = this.convertCrystallizedEdits(edit);
        await this.applyMutationEdits(edit.uri, rangeEdits);
        this.hooks?.onDidCrystallize?.(edit.uri);
      }),
      this.trackingService.onDidChangeOverlay(({ uri, overlay }) => {
        if (overlay) {
          this.host.showOverlay?.(uri, overlay);
        } else {
          this.host.clearOverlay?.(uri);
        }
      }),
    );

    // Wire EditorHost events
    this.disposables.push(
      this.host.onDidOpenDocument((e) => { void this.handleOpenDocument(e.uri, e.text); }),
      this.host.onDidCloseDocument((e) => this.handleCloseDocument(e.uri)),
      this.host.onDidSaveDocument((e) => {
        this.trackingService.handleSave(e.uri);
        this.lsp?.sendFlushPending(e.uri);
      }),
      this.host.onDidChangeContent((e) => this.handleContentChange(e)),
      this.host.onDidChangeActiveDocument((e) => {
        if (e && e.uri !== this.activeUri) { void this.handleOpenDocument(e.uri, e.text); }
      }),
      this.host.onDidChangeCursorPosition((e) => {
        const prev = this.lastCursorOffset.get(e.uri as DocumentUri);
        if (prev !== e.offset) {
          this.lastCursorOffset.set(e.uri as DocumentUri, e.offset);
          this.lsp?.sendCursorMove(e.uri, e.offset);
          this.trackingService.handleCursorMove(e.uri, e.offset,
            this.stateManager.getState(e.uri)?.text ?? '');
        }
        this.navigationService.updateCursorContext(e.uri, e.offset);
        if (this.getView(this.activeUri).display.delimiters === 'show') this.scheduler.schedule(e.uri);
      }),
    );

    // Wire LSP notifications (only when lsp is provided)
    if (this.lsp) {
      this.disposables.push(
        this.lsp.onDecorationData((data) => {
          // Reconciliation-only path: in hybrid mode the controller's local
          // parse (via parseAdapter) is authoritative for state.cachedChanges.
          // The server's push is a consistency check, not a state update.
          //
          // Rules:
          //  - If no parseAdapter is wired, fall back to authoritative behavior
          //    (setCachedDecorations) — supports pure LSP-driven consumers.
          //  - If parseAdapter IS wired and documentVersion matches local
          //    state.version, compare change-ID sets. Drift → one warning per
          //    event. Never overwrite local state.
          //  - If documentVersion does NOT match local state.version, skip
          //    silently — this is a normal race window.
          //  - The hook-callback path (hooks.onDecorationData) is always
          //    invoked so side-channel consumers (auto-fold, dev signal)
          //    keep receiving. They read autoFoldLines, not data.changes.
          if (this.parseAdapter) {
            const state = this.stateManager.getState(data.uri);
            if (state && state.version === data.documentVersion) {
              const localIds = new Set(state.cachedChanges.map(c => c.id));
              const serverIds = new Set(data.changes.map(c => c.id));
              const missing = [...localIds].filter(id => !serverIds.has(id));
              const extra = [...serverIds].filter(id => !localIds.has(id));
              if (missing.length > 0 || extra.length > 0) {
                // eslint-disable-next-line no-console
                console.warn(
                  `[reconciliation] URI=${data.uri} version=${data.documentVersion} ` +
                  `local=${localIds.size} server=${serverIds.size} ` +
                  `drift={missing: [${missing.join(',')}], extra: [${extra.join(',')}]}`
                );
              }
            }
            // Never overwrite local state in hybrid mode.
          } else {
            // No parseAdapter — authoritative LSP behavior preserved.
            this.stateManager.setCachedDecorations(data.uri, data.changes, data.documentVersion);
            this.scheduler.schedule(data.uri);
          }
          this.hooks?.onDecorationData?.(data);
        }),
        this.lsp.onPendingEditFlushed((data) => this.handlePendingEditFlushed(data)),
        this.lsp.onDocumentState((data) => {
          const uri = data.uri ?? data.textDocument?.uri;
          const enabled = data.tracking?.enabled;
          if (!uri || typeof enabled !== 'boolean') return;
          this.trackingService.setTrackingEnabled(uri, enabled);
          this.hooks?.onDidChangeTrackingState?.(uri, enabled);
        }),
      );

      // Wire overlay if host supports it
      if (this.host.showOverlay) {
        this.disposables.push(
          this.lsp.onOverlayUpdate((data) => {
            if (data.overlay) {
              this.host.showOverlay?.(data.uri, data.overlay);
            } else {
              this.host.clearOverlay?.(data.uri);
            }
          }),
        );
      }
    }
  }

  // --- Public API ---

  async openDocument(uri: string, text?: string): Promise<void> {
    await this.handleOpenDocument(uri, text);
  }

  closeDocument(uri: string): void {
    this.handleCloseDocument(uri);
  }

  getState(uri: string): DocumentState | undefined {
    return this.stateManager.getState(uri);
  }

  getActiveUri(): DocumentUri | undefined {
    return this.activeUri;
  }

  setDisplay(partial: Partial<DisplayOptions>, uri?: DocumentUri): void {
    for (const [k, v] of Object.entries(partial)) {
      if (v === undefined) {
        delete (this._userDisplay as any)[k];
      } else {
        (this._userDisplay as any)[k] = v;
      }
    }
    const current = this.getView(uri);
    const basePreset: View = VIEW_PRESETS[current.name as BuiltinView] ?? {
      name: current.name,
      projection: current.projection,
      display: {},
    };
    const effectiveView: View = {
      ...basePreset,
      display: { ...basePreset.display, ...this._userDisplay },
    };
    if (uri) {
      this._viewOverrides.set(uri, effectiveView);
    } else {
      this._defaultView = effectiveView;
    }
    // Update LSP viewMode when display changes
    if (this.activeUri) {
      const lspName = effectiveView.name as BuiltinView;
      this.lsp?.sendViewMode(this.activeUri, lspName);
    }
    this._onDidChangeView.fire(effectiveView);
    if (uri) {
      this.pushSnapshot(uri);
    } else {
      this.pushSnapshotForAllUris();
    }
  }

  setFormatPreference(uri: string, format: Format): Promise<void> {
    this.formatService.setPreferredFormat(uri, format);
    const state = this.stateManager.getState(normalizeUri(uri));
    if (state && state.format !== format) {
      return this.convertFormat(uri, format);
    }
    return Promise.resolve();
  }

  invalidateRendering(uri: string): void {
    this.scheduler.updateNow(uri);
  }

  revealChange(offset: number): void {
    this.hooks?.onRevealChange?.(offset);
  }

  /**
   * Curated helper: get all changes for a URI.
   * Shortcut for `controller.stateManager.getChangesForUri(uri)`.
   */
  getChangesForUri(uri: string): ChangeNode[] {
    return this.stateManager.getChangesForUri(uri);
  }

  /**
   * Curated helper: get authoring-visible changes (filters out L0 / empty-id ghost nodes).
   */
  getAuthoredChanges(uri: string): ChangeNode[] {
    return this.stateManager.getChangesForUri(uri).filter(c => c.id !== '' && c.level > 0);
  }

  /**
   * Curated helper: is tracking enabled for this URI?
   * Shortcut for `controller.trackingService.isTrackingEnabled(uri)`.
   */
  isTrackingEnabled(uri: string): boolean {
    return this.trackingService.isTrackingEnabled(uri);
  }

  /**
   * Curated helper: get coherence state for this URI.
   * Shortcut for `controller.coherenceService.getCoherence(uri)`.
   */
  getCoherence(uri: string): CoherenceState | undefined {
    return this.coherenceService.getCoherence(uri);
  }

  // --- Review convenience methods ---

  async acceptChange(uri: string, changeId: string, author: string): Promise<ReviewOperationResult> {
    return this.executeReviewOp(uri, (text) => this.reviewService.acceptChange(text, changeId, author));
  }

  async rejectChange(uri: string, changeId: string, author: string): Promise<ReviewOperationResult> {
    return this.executeReviewOp(uri, (text) => this.reviewService.rejectChange(text, changeId, author));
  }

  async acceptAll(uri: string, changeIds?: string[], author?: string): Promise<ReviewOperationResult> {
    return this.executeReviewOp(uri, (text) => this.reviewService.acceptAll(text, changeIds, author));
  }

  async rejectAll(uri: string, changeIds?: string[], author?: string): Promise<ReviewOperationResult> {
    return this.executeReviewOp(uri, (text) => this.reviewService.rejectAll(text, changeIds, author));
  }

  private async executeReviewOp(
    uri: string,
    op: (text: string) => ReviewOperationResult,
  ): Promise<ReviewOperationResult> {
    const text = this.stateManager.getState(uri)?.text;
    if (text === undefined) return { updatedText: '', affectedChangeIds: [], error: 'Document not open' };
    const result = op(text);
    if (result.affectedChangeIds.length > 0) await this.applyMutationResult(uri, text, result.updatedText);
    return result;
  }

  dispose(): void {
    this.hooks?.onDispose?.();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.lastCursorOffset.clear();
    this._viewOverrides.clear();
    this.scheduler.dispose();
    this.trackingService.dispose();
    this.reviewService.dispose();
    this.navigationService.dispose();
    this.coherenceService.dispose();
    this.formatService.dispose();
    this.stateManager.dispose();
    this._onDidChangeView.dispose();
    this._onDidConvertFormat.dispose();
    this._onDidConvertFormatError.dispose();
  }

  // --- Private handlers ---

  /** Parse locally and cache results. No-op when parseAdapter is absent. */
  private localParseAndCache(uri: string, text: string, version: number, format?: Format): void {
    if (!this.parseAdapter) return;
    const state = this.stateManager.getState(uri);
    const fmt = format ?? state?.format ?? 'L2';
    const changes = this.parseAdapter.parse(uri, text, fmt);
    this.stateManager.setCachedDecorations(uri, changes, version);
    // Populate typed Document on state for Plan 4 (footnote block dimming).
    if (state) {
      state.document = fmt === 'L2' ? parseL2(text) : parseL3(text);
    }
  }

  private syncTrackingDocumentMetadata(uri: string, text: string, format: Format): void {
    this.trackingService.initializeDocument(uri, {
      format,
      maxChangeId: scanMaxCnId(text),
    });
  }

  private async handleOpenDocument(uri: string, text?: string): Promise<void> {
    const docText = text ?? this.host.getDocumentText(uri);
    this.hooks?.onWillOpenDocument?.(uri);
    const isNew = !this.stateManager.getState(uri);
    const state = this.stateManager.ensureState(uri, docText, 1);

    // Detect format
    state.format = this.formatService.getDetectedFormat(uri, docText);
    this.syncTrackingDocumentMetadata(uri, docText, state.format);

    // Pre-parse at detected format so decorations are ready if conversion is not needed
    this.localParseAndCache(uri, docText, state.version, state.format);

    // Decide whether to convert
    const preferred = this.defaultFormat ?? this.formatService.getPreferredFormat(uri);
    const willConvert = !!(preferred && state.format !== preferred);

    this.activeUri = uri as DocumentUri;
    if (isNew) this.lsp?.sendDidOpen(uri, docText);
    // In hybrid mode, tell server we're handling tracking locally.
    // This disables the server's PEM for this document, preventing double-crystallization.
    // handlePendingEditFlushed remains wired as a fallback for server-generated edits.
    if (isNew) this.lsp?.sendSetDocumentState(uri, { tracking: { enabled: false } });

    if (willConvert) {
      // Synchronous promotion — do NOT push a snapshot yet. Run conversion
      // and let convertFormat push the authoritative first snapshot after
      // the buffer swap lands. The user never sees a transient L2 render.
      // convertFormat never rethrows — errors are signaled via
      // onDidConvertFormatError. On failure, convertFormat's rollback
      // restores state and re-parses, but does NOT push a snapshot.
      // Subscribe to onDidConvertFormatError to handle conversion failures.
      await this.convertFormat(uri, preferred!);
    } else {
      // No conversion — push the initial snapshot normally.
      this.pushSnapshot(uri);
    }

    this.hooks?.onDidOpenDocument?.(uri, state);
  }

  private handleCloseDocument(uri: string): void {
    this.trackingService.closeDocument(uri);
    this.lsp?.sendDidClose(uri);
    this.stateManager.removeState(uri);
    this.formatService.remove(uri);
    this.decorationPort.clear(uri);
    this.previewPort?.clear(uri);
    this.lastCursorOffset.delete(uri as DocumentUri);
    this._viewOverrides.delete(uri as DocumentUri);
    if (this.activeUri === uri) this.activeUri = undefined;
  }

  private handleContentChange(event: {
    uri: string; text: string; version: number;
    changes: ContentChange[]; isEcho: boolean;
  }): void {
    if (event.isEcho) return;
    // Swallow content changes during format conversion. Defense-in-depth:
    // the host's replaceDocument registers the echo (caught above), but any
    // non-echo content event mid-conversion is also swallowed so
    // convertFormat's state updates aren't clobbered.
    if (this._convertingUris.has(event.uri)) return;
    // Use pre-computed offsets when the host provides them (VS Code does natively).
    // Fall back to range→offset scan for hosts that don't (website, tests).
    let offsetChanges;
    if (event.changes.every(c => c.rangeOffset !== undefined)) {
      offsetChanges = event.changes.map(c => ({
        rangeOffset: c.rangeOffset!,
        rangeLength: c.rangeLength,
        text: c.text,
      }));
    } else {
      // Use pre-edit text for range→offset conversion: event.changes carries pre-edit
      // coordinates but event.text is post-edit. stateManager.text is still pre-edit
      // because applyContentChange hasn't been called yet.
      const preEditText = this.stateManager.getState(event.uri)?.text ?? event.text;
      offsetChanges = rangeToOffsetBatch(preEditText, event.changes.map(c => ({ range: c.range, newText: c.text })))
        .map(e => ({ rangeOffset: e.offset, rangeLength: e.length, text: e.newText }));
    }
    // Capture pre-edit text BEFORE applyContentChange updates state
    const preEditTextForTracking = this.stateManager.getState(event.uri)?.text ?? '';
    this.stateManager.applyContentChange(event.uri, event.text, event.version, offsetChanges);
    // Route to TrackingService for PEM processing (user edits only)
    if (offsetChanges.length === 1) {
      const c = offsetChanges[0];
      const type = c.text.length > 0 && c.rangeLength === 0 ? 'insertion'
        : c.text.length === 0 && c.rangeLength > 0 ? 'deletion'
        : 'substitution';
      const deletedText = c.rangeLength > 0
        ? preEditTextForTracking.slice(c.rangeOffset, c.rangeOffset + c.rangeLength)
        : '';
      this.trackingService.handleContentChange(
        event.uri, type, c.rangeOffset, c.text,
        deletedText,
        event.text,
      );
    } else if (offsetChanges.length > 1) {
      // Multi-change events (e.g., Enter + auto-indent) trigger a flush.
      this.trackingService.flush(event.uri);
    }

    // Format re-detect on large external changes (>50% of document replaced)
    const totalChangeLength = offsetChanges.reduce((sum, c) => sum + c.rangeLength, 0);
    if (totalChangeLength > event.text.length * 0.5) {
      const state = this.stateManager.getState(event.uri);
      if (state) {
        state.format = this.formatService.getDetectedFormat(event.uri, event.text);
        this.syncTrackingDocumentMetadata(event.uri, event.text, state.format);
      }
    }

    this.localParseAndCache(event.uri, event.text, event.version);

    this.lsp?.sendDidChange(event.uri, event.changes);
    this.scheduler.schedule(event.uri);
  }

  /**
   * Shared post-mutation handler. All mutation paths (review, crystallize, format convert)
   * call this after producing edits. Generalizes the existing handlePendingEditFlushed pattern.
   *
   * Flow: host.applyEdits → update state → re-parse locally → send to LSP → schedule render.
   * The echo from host.applyEdits is correctly suppressed by handleContentChange's isEcho guard
   * because this method updates state BEFORE the echo arrives.
   */
  private async applyMutationEdits(uri: string, edits: RangeEdit[]): Promise<ApplyEditResult | null> {
    if (!this.host.applyEdits) return null;
    const result = await this.host.applyEdits(uri, edits);
    if (!result.applied) return result;

    // Update state from verified result
    const state = this.stateManager.getState(uri);
    if (!state) return result;
    state.text = result.text;
    state.version = result.version;
    this.syncTrackingDocumentMetadata(uri, result.text, state.format);

    this.stateManager.invalidateCache(uri);
    this.localParseAndCache(uri, result.text, result.version, state.format);

    // Send verified text to LSP for standard features (hybrid mode)
    this.lsp?.sendDidChangeFullDoc(uri, result.text);

    this.scheduler.updateNow(uri);
    return result;
  }

  private async applyMutationResult(uri: string, oldText: string, newText: string): Promise<void> {
    if (oldText === newText) return;
    const edit = offsetToRange(oldText, { offset: 0, length: oldText.length, newText });
    await this.applyMutationEdits(uri, [edit]);
  }

  private convertCrystallizedEdits(edit: CrystallizedEdit): RangeEdit[] {
    const state = this.stateManager.getState(edit.uri);
    if (!state) return [];
    const text = state.text;
    const { markupEdit, footnoteEdit } = edit.edits;
    const result: RangeEdit[] = [];
    if (markupEdit) {
      result.push(offsetToRange(text, markupEdit));
    }
    if (footnoteEdit) {
      // After markup edit, text has shifted — use post-markup text for footnote range
      const textAfterMarkup = markupEdit
        ? text.slice(0, markupEdit.offset) + markupEdit.newText + text.slice(markupEdit.offset + markupEdit.length)
        : text;
      result.push(offsetToRange(textAfterMarkup, footnoteEdit));
    }
    return result;
  }

  private async handlePendingEditFlushed(data: { uri: string; edits: RangeEdit[] }): Promise<void> {
    const result = await this.applyMutationEdits(data.uri, data.edits);
    if (result?.applied) {
      this.hooks?.onDidCrystallize?.(data.uri);
    }
  }

  /**
   * Push a snapshot for every URI currently held in state.
   * Used by setDisplay / setView when no URI is explicit.
   * Per-URI errors are caught and logged so one bad URI does not halt fan-out.
   */
  private pushSnapshotForAllUris(): void {
    for (const uri of this.stateManager.getAllUris()) {
      try {
        this.pushSnapshot(uri);
      } catch (err) {
        // Per-URI failure should not halt the fan-out.
        // eslint-disable-next-line no-console
        console.warn(`[BaseController.pushSnapshotForAllUris] ${uri}: ${err}`);
      }
    }
  }

  /**
   * Push a snapshot to decoration + preview ports. Guarded against the
   * in-flight format conversion critical section — pushSnapshot early-returns
   * when _convertingUris contains the URI. convertFormat calls
   * pushSnapshotUnguarded directly at the end of its critical section to
   * publish the authoritative first render at the new format.
   */
  private pushSnapshot(uri: string): void {
    if (this._convertingUris.has(uri)) return;
    this.pushSnapshotUnguarded(uri);
  }

  /**
   * Push a snapshot without the _convertingUris guard. Bypasses the guard
   * so callers inside the critical section (e.g., convertFormat) can push
   * the authoritative first render after state is updated.
   */
  private pushSnapshotUnguarded(uri: string): void {
    const state = this.stateManager.getState(uri);
    if (!state) return;

    const view = this.getView(uri as DocumentUri);

    const snapshot: DocumentSnapshot = {
      uri,
      sourceVersion: state.version,
      text: state.text,
      changes: state.cachedChanges,
      format: state.format,
      view,
      cursorOffset: this.lastCursorOffset.get(uri as DocumentUri),
      document: state.document,
    };

    this.decorationPort.update(snapshot);
    this.previewPort?.update(snapshot);
  }

  /**
   * Durable format conversion for a document the controller already knows about.
   *
   * Orchestration:
   *  1. Parse current state.text into typed Document
   *  2. Call formatService.promote/demote — typed in, typed out
   *  3. Serialize target Document to text
   *  4. Pre-cache the new parse so decorations are ready BEFORE the buffer swap
   *  5. Open LSP batch bracket
   *  6. Call host.replaceDocument — host suppresses echo via registerEcho
   *  7. Update state.text, state.format, state.version, state.document
   *  8. Push authoritative snapshot (unguarded)
   *  9. Fire onDidConvertFormat event
   *  On error: roll back the pre-cache, fire onDidConvertFormatError
   *  Finally: release LSP bracket, delete _convertingUris entry
   */
  async convertFormat(uri: string, targetFormat: Format): Promise<void> {
    const normalized = normalizeUri(uri);
    const state = this.stateManager.getState(normalized);
    if (!state) return;
    if (state.format === targetFormat) return;
    if (this._convertingUris.has(normalized)) return;

    this._convertingUris.add(normalized);

    // Save previous state for rollback on failure
    const previousText = state.text;
    const previousFormat = state.format;
    const previousVersion = state.version;
    const previousDocument = state.document;

    let lspBracketOpen = false;
    try {
      // 1. Parse current text into typed document
      const sourceDoc: Document = state.format === 'L2'
        ? this.formatService.parseL2(state.text)
        : this.formatService.parseL3(state.text);

      // 2. Typed conversion — typed in, typed out
      const targetDoc: Document = targetFormat === 'L3'
        ? await this.formatService.promote(sourceDoc as L2Document, { uri: normalized })
        : await this.formatService.demote(sourceDoc as L3Document, { uri: normalized });

      // 3. Serialize only at the buffer boundary
      const targetText = targetFormat === 'L3'
        ? this.formatService.serializeL3(targetDoc as L3Document)
        : this.formatService.serializeL2(targetDoc as L2Document);

      // 4. Pre-cache the new parse so decorations are ready BEFORE the swap
      const newVersion = previousVersion + 1;
      this.localParseAndCache(normalized, targetText, newVersion, targetFormat);

      // 5. LSP batch bracket
      this.lsp?.sendNotification(LSP_METHOD.BATCH_EDIT_START, { uri: normalized });
      lspBracketOpen = true;

      // 6. Ask the host to replace the buffer
      if (!this.host.replaceDocument) {
        throw new Error(
          `Host does not implement replaceDocument; cannot perform format conversion for ${uri}`,
        );
      }
      const result = await this.host.replaceDocument(normalized, targetText, {
        reason: 'format-conversion',
        from: previousFormat,
        to: targetFormat,
      });
      if (!result.applied) {
        throw new Error(`replaceDocument rejected for ${uri}`);
      }

      // 7. Update state to match the new reality
      state.text = result.text;  // use the host's verified post-swap text
      state.format = targetFormat;
      state.version = result.version;
      state.document = targetDoc;
      this.syncTrackingDocumentMetadata(normalized, result.text, targetFormat);

      // 8. Push authoritative snapshot (unguarded) — use the conversion URI
      //    directly, not activeUri, because setFormatPreference may convert a
      //    non-active document.
      this.pushSnapshotUnguarded(normalized);

      // 9. Fire event
      this._onDidConvertFormat.fire({
        uri: normalized,
        from: previousFormat,
        to: targetFormat,
        document: targetDoc,
      });
    } catch (err) {
      // Rollback: re-parse the original text so the decoration cache is coherent
      state.text = previousText;
      state.format = previousFormat;
      state.version = previousVersion;
      state.document = previousDocument;
      this.localParseAndCache(normalized, previousText, previousVersion, previousFormat);
      this._onDidConvertFormatError.fire({ uri: normalized, error: err });
      this.pushSnapshotUnguarded(normalized);
      // Do NOT rethrow — convertFormat is awaited from handleOpenDocument,
      // so a throw would reject the open promise. Callers handle errors via
      // onDidConvertFormatError subscription.
    } finally {
      if (lspBracketOpen) {
        this.lsp?.sendNotification(LSP_METHOD.BATCH_EDIT_END, { uri: normalized });
      }
      this._convertingUris.delete(normalized);
    }
  }
}
