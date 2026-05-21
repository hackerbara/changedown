// packages/vscode-extension/src/adapters/vscode-lsp-adapter.ts
import type { LanguageClient } from 'vscode-languageclient/node';
import { LSP_METHOD, type TypedLspConnection, type ContentChange,
  type ReviewResult, type Disposable, type ChangeNode, type RangeEdit,
  type PendingOverlay, type SupersedeResult, type BuiltinView,
} from '@changedown/core/host';

interface QueuedCall {
  fn: () => void;
  /** URI associated with this call, if any. Used to track resync needs on overflow. */
  uri?: string;
}

// ~3min of rapid typing — handles cold Windows LSP startup
const MAX_QUEUE_SIZE = 2000;

/**
 * VS Code adapter implementing TypedLspConnection.
 * Wraps LanguageClient with typed methods.
 * Queues outbound notifications until the LSP client is ready.
 */
export class VsCodeLspAdapter implements TypedLspConnection, Disposable {
  private client: LanguageClient | null = null;
  private queue: QueuedCall[] = [];
  private disposables: Disposable[] = [];
  /**
   * URIs whose queued notifications were discarded due to overflow.
   * After setClient() drains the queue, the caller should fetch these URIs
   * via getPendingResyncUris() and re-send full-document didOpen for each.
   */
  private urisNeedingResync = new Set<string>();
  private queueOverflowed = false;

  /**
   * Promise that resolves once the LSP client is ready (setClient called)
   * or rejects if startup fails (clearQueue called after failure).
   * sendRequest awaits this so format-conversion requests issued during
   * extension activation are held until the server handshake completes,
   * rather than throwing "LSP not ready".
   */
  private clientReadyResolve!: (client: LanguageClient) => void;
  private clientReadyReject!: (err: Error) => void;
  private clientReadyPromise: Promise<LanguageClient> = new Promise((resolve, reject) => {
    this.clientReadyResolve = resolve;
    this.clientReadyReject = reject;
  });

  /** Called by extension.ts after client.start() resolves. */
  setClient(client: LanguageClient): void {
    this.client = client;
    this.clientReadyResolve(client);
    for (const call of this.queue) call.fn();
    this.queue = [];
    this.queueOverflowed = false;
    // Note: urisNeedingResync is NOT cleared here. The caller must fetch them
    // via getPendingResyncUris() after setClient() returns, then send fresh
    // didOpen notifications for each URI. getPendingResyncUris() clears the set.
  }

  /** Called by extension.ts if client.start() fails — drop queued work. */
  clearQueue(): void {
    this.clientReadyReject(new Error('LSP client failed to start'));
    // Re-create the promise so a subsequent setClient() attempt (if any) works.
    this.clientReadyPromise = new Promise((resolve, reject) => {
      this.clientReadyResolve = resolve;
      this.clientReadyReject = reject;
    });
    this.queue = [];
    this.urisNeedingResync.clear();
    this.queueOverflowed = false;
  }

  /**
   * Returns and clears the set of URIs whose queued notifications were dropped
   * due to queue overflow. Call after setClient() to determine which documents
   * need a fresh full-document didOpen to restore server coordinate space.
   */
  getPendingResyncUris(): string[] {
    const uris = Array.from(this.urisNeedingResync);
    this.urisNeedingResync.clear();
    return uris;
  }

  // ── Outbound: Document lifecycle ──────────────────────────
  sendDidOpen(uri: string, text: string, languageId?: string): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.DID_OPEN, {
      textDocument: { uri, languageId: languageId ?? 'markdown', version: 0, text },
    }), uri);
  }

  sendDidClose(uri: string): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.DID_CLOSE, {
      textDocument: { uri },
    }), uri);
  }

  sendDidChange(uri: string, changes: ContentChange[]): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.DID_CHANGE, {
      textDocument: { uri, version: 0 },
      contentChanges: changes,
    }), uri);
  }

  sendDidChangeFullDoc(uri: string, text: string): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.DID_CHANGE, {
      textDocument: { uri, version: 0 },
      contentChanges: [{ text }],
    }), uri);
  }

  // ── Outbound: Editor state ────────────────────────────────
  sendCursorMove(uri: string, offset: number): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.CURSOR_MOVE, {
      textDocument: { uri }, offset,
    }), uri);
  }

  sendViewMode(uri: string, viewName: BuiltinView): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.SET_VIEW_MODE, {
      textDocument: { uri }, viewMode: viewName,
    }), uri);
  }

  sendFlushPending(uri: string): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.FLUSH_PENDING, {
      textDocument: { uri },
    }), uri);
  }

  // ── Outbound: Move metadata ───────────────────────────────
  sendMoveMetadata(uri: string, cutText: string): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.MOVE_METADATA, {
      textDocument: { uri }, cutText,
    }), uri);
  }

  // ── Outbound: Tracking ────────────────────────────────────
  sendSetDocumentState(uri: string, state: { tracking: { enabled: boolean } }): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.SET_DOCUMENT_STATE, {
      textDocument: { uri }, ...state,
    }), uri);
  }

  // ── Outbound: Undo/Redo (server-side PEM buffer abandonment) ──
  sendUndoRedo(uri: string): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.UNDO_REDO, {
      textDocument: { uri },
    }), uri);
  }

  // ── Outbound: Batch edit bracket ──────────────────────────
  sendBatchEditStart(uri: string): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.BATCH_EDIT_START, { uri }), uri);
  }

  sendBatchEditEnd(uri: string): void {
    this.send(() => this.client!.sendNotification(LSP_METHOD.BATCH_EDIT_END, { uri }), uri);
  }

  // ── Lifecycle requests ────────────────────────────────────
  async reviewChange(uri: string, changeId: string, decision: 'approve' | 'reject' | 'request_changes', reason?: string): Promise<ReviewResult> {
    return this.sendRequest(LSP_METHOD.REVIEW_CHANGE, { uri, changeId, decision, reason });
  }

  async amendChange(uri: string, changeId: string, newText: string): Promise<ReviewResult> {
    return this.sendRequest(LSP_METHOD.AMEND_CHANGE, { uri, changeId, newText });
  }

  async supersedeChange(uri: string, changeId: string, newText: string, reason?: string): Promise<SupersedeResult> {
    return this.sendRequest(LSP_METHOD.SUPERSEDE_CHANGE, { uri, changeId, newText, reason });
  }

  async compactChange(uri: string, changeId: string, fully?: boolean): Promise<ReviewResult> {
    return this.sendRequest(LSP_METHOD.COMPACT_CHANGE, { uri, changeId, fully });
  }

  async reviewAll(uri: string, decision: string, changeIds?: string[]): Promise<ReviewResult> {
    return this.sendRequest(LSP_METHOD.REVIEW_ALL, { uri, decision, changeIds });
  }

  async convertFormat(uri: string, text: string, targetFormat: 'L2' | 'L3'): Promise<{ convertedText: string; newFormat: 'L2' | 'L3' }> {
    return this.sendRequest(LSP_METHOD.CONVERT_FORMAT, { uri, text, targetFormat });
  }

  // ── Inbound notifications ─────────────────────────────────
  onDecorationData(handler: (data: { uri: string; changes: ChangeNode[]; documentVersion: number; autoFoldLines?: number[] }) => void): Disposable {
    return this.onNotification(LSP_METHOD.DECORATION_DATA, handler as (params: unknown) => void);
  }

  onPendingEditFlushed(handler: (data: { uri: string; edits: RangeEdit[] }) => void): Disposable {
    return this.onNotification(LSP_METHOD.PENDING_EDIT_FLUSHED, handler as (params: unknown) => void);
  }

  onDocumentState(handler: (data: {
    uri?: string;
    textDocument?: { uri?: string };
    tracking?: { enabled?: boolean; source?: string };
    view?: BuiltinView;
    viewMode?: BuiltinView | string;
  }) => void): Disposable {
    return this.onNotification(LSP_METHOD.DOCUMENT_STATE, handler as (params: unknown) => void);
  }

  onOverlayUpdate(handler: (data: { uri: string; overlay: PendingOverlay | null }) => void): Disposable {
    return this.onNotification(LSP_METHOD.PENDING_OVERLAY, handler as (params: unknown) => void);
  }

  onCoherenceUpdate(handler: (data: { uri: string; rate: number; unresolvedCount: number; threshold: number }) => void): Disposable {
    return this.onNotification(LSP_METHOD.COHERENCE_STATUS, (params: unknown) => {
      if (!params || typeof params !== 'object') return;
      const p = params as Record<string, unknown>;
      const rate = typeof p.rate === 'number'
        ? p.rate
        : typeof p.coherenceRate === 'number'
          ? p.coherenceRate
          : undefined;
      if (
        typeof p.uri === 'string' &&
        typeof rate === 'number' &&
        typeof p.unresolvedCount === 'number' &&
        typeof p.threshold === 'number'
      ) {
        handler({
          uri: p.uri,
          rate,
          unresolvedCount: p.unresolvedCount,
          threshold: p.threshold,
        });
      }
    });
  }

  // ── Escape hatch ──────────────────────────────────────────
  async sendRequest<R>(method: string, params: unknown): Promise<R> {
    // Await the client-ready promise so requests issued before the LSP
    // handshake completes (e.g., format conversion triggered by an
    // already-open document at activation time) are held rather than
    // thrown. If the client fails to start, clientReadyPromise rejects
    // and the error propagates to the caller as before.
    const client = await this.clientReadyPromise;
    return client.sendRequest(method, params) as Promise<R>;
  }

  sendNotification(method: string, params: unknown): void {
    // Best-effort URI extraction from common param shapes so this escape hatch
    // still contributes to resync tracking on overflow.
    const uri = extractUriFromParams(params);
    this.send(() => this.client!.sendNotification(method, params), uri);
  }

  onNotification(method: string, handler: (params: unknown) => void): Disposable {
    // Notification handlers register immediately — they'll fire once the client
    // starts and the server sends data. If client is null, defer registration.
    if (this.client) {
      return this.client.onNotification(method, handler);
    }
    // Client not ready — register when setClient is called.
    // Guard against dispose-before-setClient race: if caller disposes before
    // the queued callback runs, skip registration entirely.
    let disposable: Disposable | null = null;
    let isDisposed = false;
    this.queue.push({
      fn: () => {
        if (isDisposed) return;
        disposable = this.client!.onNotification(method, handler);
        this.disposables.push(disposable);
      },
    });
    return { dispose: () => { isDisposed = true; disposable?.dispose(); } };
  }

  // ── Internal ──────────────────────────────────────────────
  private send(fn: () => void, uri?: string): void {
    if (this.client?.isRunning?.()) { fn(); return; }
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      // Overflow: discard the entire queue and track every URI so we can
      // re-send full-document didOpen for each once the client is ready.
      // Dropping individual didChange notifications would corrupt server
      // coordinate space — the server replays stale edits with cumulative
      // offsets that no longer match the client's document state.
      for (const call of this.queue) {
        if (call.uri) this.urisNeedingResync.add(call.uri);
      }
      if (uri) this.urisNeedingResync.add(uri);
      this.queue = [];
      if (!this.queueOverflowed) {
        this.queueOverflowed = true;
        console.error(
          `[VsCodeLspAdapter] queue overflow (${MAX_QUEUE_SIZE}) — cleared queue, ` +
          `${this.urisNeedingResync.size} URI(s) flagged for resync on LSP connect`,
        );
      }
    }
    this.queue.push({ fn, uri });
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.queue = [];
  }
}

/**
 * Extract a URI from an arbitrary notification params object.
 * Handles the two shapes used by changedown notifications:
 *   - `{ textDocument: { uri } }` (LSP-standard)
 *   - `{ uri }` (batchEditStart/End and any custom escape-hatch callers)
 */
function extractUriFromParams(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const p = params as Record<string, unknown>;
  if (typeof p.uri === 'string') return p.uri;
  const td = p.textDocument;
  if (td && typeof td === 'object' && typeof (td as Record<string, unknown>).uri === 'string') {
    return (td as Record<string, unknown>).uri as string;
  }
  return undefined;
}
