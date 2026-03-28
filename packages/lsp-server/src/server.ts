/**
 * LSP Server Implementation
 *
 * Language Server Protocol server for CriticMarkup editing.
 * Handles LSP protocol communication and delegates parsing to the core package.
 */

import {
  TextDocuments,
  TextDocumentSyncKind,
  DidChangeWatchedFilesNotification,
  CodeLensRefreshRequest,
  FoldingRangeRefreshRequest,
  TextEdit,
} from 'vscode-languageserver';
import type {
  Connection,
  InitializeParams,
  InitializeResult,
  HoverParams,
  Hover,
  SemanticTokensParams,
  SemanticTokens,
  CodeLensParams,
  CodeLens,
  CodeActionParams,
  CodeAction,
  DocumentLinkParams,
  DocumentLink,
  WorkspaceEdit,
  FoldingRange,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  Workspace, VirtualDocument, ChangeNode, ChangeType, ChangeStatus, isGhostNode,
  annotateMarkdown, annotateSidecar, SIDECAR_BLOCK_MARKER, VIEW_NAMES,
  applyReview, computeSupersedeResult, computeReplyEdit,
  computeResolutionEdit, computeUnresolveEdit, compactToLevel1, compactToLevel0,
  settleAcceptedChangesOnly, settleRejectedChangesOnly,
  findFootnoteBlock, parseFootnoteHeader, parseForFormat,
  initHashline,
  convertL2ToL3,
  compact, isL3Format, compactL2,
  splitBodyAndFootnotes,
  scanMaxCnId,
} from '@changedown/core';
import type { ViewName, Decision, VerificationResult } from '@changedown/core';
import type { PreviousVersionResult } from './git';
import { DEFAULT_CONFIG } from '@changedown/core';
import type { ChangeDownConfig } from '@changedown/core';
import { createHover } from './capabilities/hover';
import { createCodeLenses, CodeLensMode, CursorState } from './capabilities/code-lens';
import { sendDecorationData, sendChangeCount, sendCoherenceStatus } from './notifications/decoration-data';
import { sendPendingEditFlushed } from './notifications/pending-edit';
import { sendViewModeChanged, SetViewModeParams } from './notifications/view-mode';
import { resolveTracking, sendDocumentState } from './notifications/document-state';
import { getSemanticTokensLegend, buildSemanticTokens } from './capabilities/semantic-tokens';
import { createDiagnostics } from './capabilities/diagnostics';
import { createCodeActions } from './capabilities/code-actions';
import { createDocumentLinks } from './capabilities/document-links';
import { createFoldingRanges, computeAutoFoldLines } from './capabilities/folding-ranges';
import { PendingEditManager, type CrystallizedEdit } from './pending-edit-manager';
import { offsetRangeToLspRange, positionToOffset } from './converters';
import { createLspDocumentState } from './document-state';
import type { PendingOverlay, LspDocumentState } from './document-state';

/**
 * Parameters for the changedown/annotate custom request.
 */
export interface AnnotateParams {
  textDocument: { uri: string };
}

/**
 * Shape of `initializationOptions.changedown` sent by the client.
 */
interface ChangedownInitOptions {
  reviewerIdentity?: string;
  author?: string;
}

/**
 * Type guard for the changedown initialization options block.
 */
function isChangedownInitOptions(value: unknown): value is ChangedownInitOptions {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if ('reviewerIdentity' in obj && typeof obj.reviewerIdentity !== 'string') return false;
  if ('author' in obj && typeof obj.author !== 'string') return false;
  return true;
}

/**
 * Platform-specific callbacks injected by the entry point.
 * Browser entry omits all callbacks (uses defaults).
 * Node entry provides real filesystem and config loading.
 */
export interface ServerOptions {
  /** Load project config from workspace. Return undefined if not found. */
  loadConfig?: (workspaceRoot: string) => ChangeDownConfig | undefined;
  /** Read a file by URI. Used for disk-equality checks during repromotion suppression. */
  readFileByUri?: (uri: string) => Promise<string | undefined>;
}

/**
 * ChangeDown Language Server
 *
 * Responsibilities:
 * - LSP connection lifecycle (initialize, shutdown, exit)
 * - Document synchronization (open, change, close)
 * - Parse documents using core Workspace and cache results
 * - Provide server capabilities (will be extended in later tasks)
 * - Git-based annotation via changedown/annotate request
 */
const DECORATION_NOTIFY_DEBOUNCE_MS = 60;

export class ChangedownServer {
  public readonly connection: Connection;
  public readonly documents: TextDocuments<TextDocument>;
  public readonly workspace: Workspace;
  public readonly pendingEditManager: PendingEditManager;
  /** Per-document state bag — replaces 7 Maps + 3 Sets (parseCache, textCache, etc.). */
  private docStates = new Map<string, LspDocumentState>();
  /** Debounce timer for semanticTokens.refresh() — coalesces rapid setViewMode calls into one refresh. */
  private semanticTokenRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  /**
   * Reviewer identity for accept/reject attribution (ADR-031).
   * Set from initializationOptions on startup (Sublime, Neovim, etc.) or via
   * changedown/updateSettings notification (VS Code extension).
   */
  public reviewerIdentity: string | undefined;
  /** Project config tracking default (from .changedown/config.toml). Set by Task 11. */
  private projectTrackingDefault: string | undefined;
  /** Full parsed project config (from .changedown/config.toml). */
  private projectConfig: ChangeDownConfig | undefined;
  /** Coherence threshold (0–100) from project config coherence.threshold. */
  private coherenceThreshold: number = DEFAULT_CONFIG.coherence.threshold;
  /** Last-sent coherence status per URI — avoids re-sending identical notifications. */
  private lastCoherenceStatus: Map<string, { rate: number; count: number }> = new Map();
  /** Re-entrance guard: URIs with a pending write-back in flight. */
  private pendingWriteBack = new Set<string>();
  /** URIs expecting a crystallize echo — skip re-promotion on that didChange */
  private pendingCrystallizeEcho = new Set<string>();
  /** Workspace root path for config file resolution. */
  private workspaceRoot: string | undefined;
  private codeLensMode: CodeLensMode = 'cursor';
  private readonly options: ServerOptions;

  /**
   * Git integration functions. These are public properties so tests can
   * replace them with stubs without requiring real git repositories.
   */
  public _gitGetWorkspaceRoot: (filePath: string) => Promise<string | undefined> = async () => undefined;
  public _gitGetPreviousVersion: (filePath: string, rootDir: string) => Promise<PreviousVersionResult | undefined> = async () => undefined;

  constructor(connection: Connection, options?: ServerOptions) {
    this.options = options ?? {};
    this.connection = connection;
    this.documents = new TextDocuments(TextDocument);
    this.workspace = new Workspace();
    this.pendingEditManager = new PendingEditManager(
      (edit: CrystallizedEdit) => this.handleCrystallizedEdit(edit),
    );

    this.setupHandlers();
  }

  /**
   * Set up all LSP event handlers
   */
  private setupHandlers(): void {
    // Connection lifecycle handlers
    this.connection.onInitialize(this.handleInitialize.bind(this));
    this.connection.onInitialized(this.handleInitialized.bind(this));
    this.connection.onShutdown(this.handleShutdown.bind(this));
    this.connection.onExit(this.handleExit.bind(this));

    // Document event handlers
    this.documents.onDidOpen(async (event) => {
      const uri = event.document.uri;
      const state = this.docStates.get(uri);
      if (state) state.suppressRepromotion = false;
      const text = event.document.getText();
      const languageId = event.document.languageId;
      await this.handleDocumentOpen(uri, text, languageId);
    });

    this.documents.onDidChangeContent(async (event) => {
      const uri = event.document.uri;
      const text = event.document.getText();
      const languageId = event.document.languageId;
      await this.handleDocumentChange(uri, text, languageId);
    });

    // P1-15: Clean up per-document state when a document closes to prevent memory leaks
    this.documents.onDidClose((event) => {
      const uri = event.document.uri;
      const state = this.docStates.get(uri);
      if (state?.decorationTimeout) clearTimeout(state.decorationTimeout);
      this.docStates.delete(uri);
      this.lastCoherenceStatus.delete(uri);
      this.pendingWriteBack.delete(uri);
      this.pendingEditManager.removeDocument(uri);
    });

    // Hover capability
    this.connection.onHover(this.handleHover.bind(this));

    // Semantic tokens capability
    this.connection.languages.semanticTokens.on(this.handleSemanticTokens.bind(this));

    // Code lens capability
    this.connection.onCodeLens(this.handleCodeLens.bind(this));

    // Code actions capability
    this.connection.onCodeAction(this.handleCodeAction.bind(this));

    // Document links capability (footnote ref ↔ definition navigation)
    this.connection.onDocumentLinks(this.handleDocumentLinks.bind(this));

    // Folding ranges capability
    this.connection.onFoldingRanges(this.handleFoldingRanges.bind(this));

    // Custom request: annotate file from git changes
    this.connection.onRequest('changedown/annotate', this.handleAnnotate.bind(this));

    // Section 11: getChanges request — on-demand bootstrap when extension cache is empty
    this.connection.onRequest('changedown/getChanges', this.handleGetChanges.bind(this));

    // Phase 2: Lifecycle operation custom requests (2A-2G)
    this.connection.onRequest('changedown/getProjectConfig', this.handleGetProjectConfig.bind(this));
    this.connection.onRequest('changedown/reviewChange', this.handleReviewChange.bind(this));
    this.connection.onRequest('changedown/replyToThread', this.handleReplyToThread.bind(this));
    this.connection.onRequest('changedown/amendChange', this.handleAmendChange.bind(this));
    this.connection.onRequest('changedown/supersedeChange', this.handleSupersedeChange.bind(this));
    this.connection.onRequest('changedown/resolveThread', this.handleResolveThread.bind(this));
    this.connection.onRequest('changedown/unresolveThread', this.handleUnresolveThread.bind(this));
    this.connection.onRequest('changedown/compactChange', this.handleCompactChange.bind(this));
    this.connection.onRequest('changedown/compactChanges', this.handleCompactChanges.bind(this));
    this.connection.onRequest('changedown/reviewAll', this.handleReviewAll.bind(this));

    // Batch edit coordination: extension tells LSP to skip re-promotion during programmatic edits
    this.connection.onNotification('changedown/batchEditStart', (params: { uri: string }) => {
      this.handleBatchEditStart(params.uri);
    });

    this.connection.onNotification('changedown/batchEditEnd', (params: { uri: string }) => {
      this.handleBatchEditEnd(params.uri);
    });

    // Flush pending handler - hard break signal from client
    this.connection.onNotification('changedown/flushPending', (params: {
      textDocument: { uri: string };
    }) => {
      try {
        this.pendingEditManager.flush(params.textDocument.uri);
      } catch (err) {
        this.connection.console.error(`changedown/flushPending handler error: ${err}`);
      }
    });

    // Settings update handler - VS Code extension pushes config changes here
    // (Sublime/Neovim send these via initializationOptions instead)
    this.connection.onNotification('changedown/updateSettings', (params: {
      reviewerIdentity?: string;
    }) => {
      try {
        const identity = (params.reviewerIdentity ?? '').trim();
        this.reviewerIdentity = identity || undefined;
      } catch (err) {
        this.connection.console.error(`changedown/updateSettings handler error: ${err}`);
      }
    });

    // Phase 1: Pending overlay from VS Code extension (in-flight insertion before flush)
    this.connection.onNotification('changedown/pendingOverlay', (params: {
      uri: string;
      overlay: PendingOverlay | null;
    }) => {
      try {
        const { uri, overlay } = params;
        const state = this.docStates.get(uri);
        if (state) state.overlay = overlay;
        this.scheduleDecorationResend(uri);
      } catch (err) {
        this.connection.console.error(`changedown/pendingOverlay handler error: ${err}`);
      }
    });

    // View mode notification: client tells server which view mode is active for a document.
    // Server stores the mode, broadcasts confirmation, and uses it for semantic tokens filtering.
    this.connection.onNotification('changedown/setViewMode', (params: SetViewModeParams) => {
      try {
        const uri = params.textDocument.uri;
        const viewMode = params.viewMode;
        // Validate incoming viewMode against the canonical set of view names
        if (!VIEW_NAMES.includes(viewMode as ViewName)) {
          this.connection.console.warn(
            `changedown/setViewMode: ignoring unknown viewMode "${viewMode}" for ${uri}`
          );
          return;
        }
        const state = this.docStates.get(uri);
        if (state) {
          state.viewMode = viewMode;
          // Reset autoFoldSent when leaving review/changes so re-entering triggers auto-fold
          if (params.viewMode !== 'review' && params.viewMode !== 'changes') {
            state.autoFoldSent = false;
          }
        }
        // Broadcast confirmation back to client
        sendViewModeChanged(this.connection, uri, viewMode);
        // Broadcast composite documentState (carries both tracking + view mode)
        this.broadcastDocumentState(uri);
        // Debounce semanticTokens.refresh() — when the extension sends setViewMode for
        // multiple open documents at once, this coalesces into a single refresh request
        // instead of O(N) immediate refreshes that each trigger O(N) token requests.
        if (this.semanticTokenRefreshTimeout) {
          clearTimeout(this.semanticTokenRefreshTimeout);
        }
        this.semanticTokenRefreshTimeout = setTimeout(() => {
          this.semanticTokenRefreshTimeout = null;
          this.connection.languages.semanticTokens.refresh();
          this.connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {
            // Client does not support workspace/codeLens/refresh — safe to ignore
          });
          this.connection.sendRequest(FoldingRangeRefreshRequest.type).catch(() => {});
        }, 50);
      } catch (err) {
        this.connection.console.error(`changedown/setViewMode handler error: ${err}`);
      }
    });

    // Cursor position notification: client tells server where cursor is
    this.connection.onNotification('changedown/cursorPosition', (params: {
        textDocument: { uri: string };
        line: number;
        changeId?: string;
    }) => {
      try {
        const uri = params.textDocument.uri;
        const state = this.docStates.get(uri);
        if (state) {
          state.cursorState = {
            line: params.line,
            changeId: params.changeId
          };
        }
        // Trigger CodeLens refresh
        this.connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {
          // Client does not support workspace/codeLens/refresh — safe to ignore
        });
        this.connection.sendRequest(FoldingRangeRefreshRequest.type).catch(() => {
          // Client does not support workspace/foldingRange/refresh — safe to ignore
        });
      } catch (err) {
        this.connection.console.error(`changedown/cursorPosition handler error: ${err}`);
      }
    });

    // CodeLens mode notification: client tells server which mode is active
    this.connection.onNotification('changedown/setCodeLensMode', (params: {
        mode: string;
    }) => {
      try {
        const mode = params.mode;
        if (mode === 'cursor' || mode === 'always' || mode === 'off') {
          this.codeLensMode = mode;
          this.connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {});
        } else {
          this.connection.console.warn(`changedown/setCodeLensMode: ignoring unknown mode "${mode}"`);
        }
      } catch (err) {
        this.connection.console.error(`changedown/setCodeLensMode handler error: ${err}`);
      }
    });

    // Cursor move handler — PEM uses cursor position for flush-on-move logic.
    this.connection.onNotification('changedown/cursorMove', (params: {
      textDocument: { uri: string };
      offset: number;
    }) => {
      try {
        const uri = params.textDocument.uri;
        const text = this.docStates.get(uri)?.text ?? '';
        this.pendingEditManager.handleCursorMove(uri, params.offset, text);
      } catch (err) {
        this.connection.console.error(`changedown/cursorMove handler error: ${err}`);
      }
    });

    // Connect documents to connection (registers open/change/close handlers)
    this.documents.listen(this.connection);

    // ── Raw didChange handler (registered AFTER documents.listen) ──
    // Replaces TextDocuments' didChange handler so we can intercept incremental
    // content changes for edit tracking. After tracking, we replicate what
    // TextDocuments.listen() does internally (update synced document, fire events).
    //
    // This lets us derive edit tracking from raw LSP incremental changes
    // instead of relying on the client to classify and send trackingEvent.
    this.connection.onNotification('textDocument/didChange', (params: {
      textDocument: { uri: string; version: number };
      contentChanges: Array<{
        range?: { start: { line: number; character: number }; end: { line: number; character: number } };
        rangeLength?: number;
        text: string;
      }>;
    }) => {
      try {
        const uri = params.textDocument.uri;
        let currentText = this.docStates.get(uri)?.text ?? '';

        for (const change of params.contentChanges) {
          if (!change.range) {
            // Full sync fallback — no range means entire document replaced.
            // Skip tracking for full replacement.
            // Consume any pending echo: website-v2 sends full-doc sync when
            // applying crystallized edits, so the echo arrives without a range.
            this.pendingEditManager.consumeEcho(uri);
            currentText = change.text;
            continue;
          }

          const offset = positionToOffset(currentText, change.range.start);
          const endOffset = positionToOffset(currentText, change.range.end);
          const rangeLength = endOffset - offset;
          const deletedText = currentText.substring(offset, endOffset);
          const insertedText = change.text;

          let type: 'insertion' | 'deletion' | 'substitution';
          if (rangeLength === 0 && insertedText.length > 0) {
            type = 'insertion';
          } else if (rangeLength > 0 && insertedText.length === 0) {
            type = 'deletion';
          } else {
            type = 'substitution';
          }

          this.pendingEditManager.handleChange(
            uri, type, offset, insertedText, deletedText, currentText,
          );

          // Apply this change to currentText so the next change in the batch
          // operates on correct text (LSP sends changes against updated state).
          currentText = currentText.substring(0, offset) + insertedText + currentText.substring(endOffset);
        }
      } catch (err) {
        this.connection.console.error(`textDocument/didChange (edit tracking) error: ${err}`);
      }

      // Replicate TextDocuments' didChange handling: update the synced document
      // and fire onDidChangeContent so the rest of the server sees the update.
      // We access TextDocuments internals via type assertion — this is intentional
      // and necessary because the LSP library only supports one handler per method.
      try {
        const td = params.textDocument;
        const changes = params.contentChanges;
        if (changes.length === 0) return;
        const docs = this.documents as unknown as {
          _syncedDocuments: Map<string, TextDocument>;
          _configuration: { update(doc: TextDocument, changes: unknown[], version: number): TextDocument };
          _onDidChangeContent: { fire(event: { document: TextDocument }): void };
        };
        let syncedDocument = docs._syncedDocuments.get(td.uri);
        if (syncedDocument !== undefined) {
          syncedDocument = docs._configuration.update(syncedDocument, changes, td.version);
          docs._syncedDocuments.set(td.uri, syncedDocument);
          docs._onDidChangeContent.fire(Object.freeze({ document: syncedDocument }));
        }
      } catch (err) {
        this.connection.console.error(`textDocument/didChange (document sync) error: ${err}`);
      }
    });
  }

  /**
   * Start listening for LSP messages
   */
  public listen(): void {
    this.connection.listen();
  }

  /**
   * Handle LSP initialize request
   * Returns server capabilities
   */
  public async handleInitialize(params: InitializeParams): Promise<InitializeResult> {
    // Initialize xxhash-wasm before any document parsing can occur.
    // L3 documents use hashline functions that require the WASM module.
    await initHashline();

    // Read reviewer identity from initializationOptions (Sublime, Neovim, and other non-VS Code clients).
    // VS Code sends this via changedown/updateSettings notification after the client starts.
    const raw = (params.initializationOptions as Record<string, unknown> | undefined)?.changedown;
    if (isChangedownInitOptions(raw)) {
      const identity = (raw.reviewerIdentity || raw.author || '').trim();
      this.reviewerIdentity = identity || undefined;
    }

    if (params.rootUri) {
      this.workspaceRoot = new URL(params.rootUri).pathname;
    } else if (params.workspaceFolders?.length) {
      this.workspaceRoot = new URL(params.workspaceFolders[0].uri).pathname;
    }

    return {
      capabilities: {
        // Incremental document sync - server receives incremental content changes
        // which the raw didChange handler uses for edit tracking before TextDocuments
        // processes them into full document text.
        textDocumentSync: TextDocumentSyncKind.Incremental,
        // Hover capability - show comment text on hover
        hoverProvider: true,
        // Semantic tokens capability - syntax highlighting for CriticMarkup
        semanticTokensProvider: {
          legend: getSemanticTokensLegend(),
          full: true
        },
        // Code lens capability - shows inline action buttons
        codeLensProvider: {
          resolveProvider: false // We provide commands directly, no resolve needed
        },
        // Code actions capability - accept/reject changes
        codeActionProvider: true,
        // Document links - footnote ref ↔ definition navigation
        documentLinkProvider: {
          resolveProvider: false
        },
        // Folding ranges - L3 footnote sections + deletion hiding
        foldingRangeProvider: true
      }
    };
  }

  /**
   * Handle LSP initialized notification
   * Called after client receives initialize result.
   * Loads project config and registers a file watcher for config.toml changes.
   */
  public handleInitialized(): void {
    this.loadProjectConfig();
    // Register for file change notifications
    this.connection.client.register(DidChangeWatchedFilesNotification.type, {
      watchers: [{ globPattern: '**/.changedown/config.toml' }]
    });
    this.connection.onDidChangeWatchedFiles((change) => {
      for (const event of change.changes) {
        if (event.uri.endsWith('config.toml')) {
          this.loadProjectConfig();
          // Re-broadcast for all open documents
          for (const uri of this.docStates.keys()) {
            this.broadcastDocumentState(uri);
          }
        }
      }
    });
  }

  /**
   * Handle LSP shutdown request
   * Prepare for exit
   */
  public async handleShutdown(): Promise<void> {
    for (const state of this.docStates.values()) {
      if (state.decorationTimeout) clearTimeout(state.decorationTimeout);
    }
    this.docStates.clear();
    if (this.semanticTokenRefreshTimeout) {
      clearTimeout(this.semanticTokenRefreshTimeout);
      this.semanticTokenRefreshTimeout = null;
    }
    this.pendingEditManager.dispose();
  }

  /**
   * Handle LSP exit notification
   * Server should exit after this
   */
  public handleExit(): void {
    for (const state of this.docStates.values()) {
      if (state.decorationTimeout) clearTimeout(state.decorationTimeout);
    }
    this.docStates.clear();
    if (this.semanticTokenRefreshTimeout) {
      clearTimeout(this.semanticTokenRefreshTimeout);
      this.semanticTokenRefreshTimeout = null;
    }
  }

  /**
   * Merge overlay (if any) with parse result for decorationData.
   * Phase 1: Overlay becomes a synthetic ChangeNode (insertion); merged list sorted by offset.
   */
  private getMergedChanges(uri: string): ChangeNode[] {
    const state = this.docStates.get(uri);
    const parseChanges = state?.parseResult ? state.parseResult.getChanges() : [];
    const overlay = state?.overlay;
    if (!overlay) return parseChanges;
    const synthetic: ChangeNode = {
      id: overlay.scId ?? 'cn-overlay-0',
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: { start: overlay.range.start, end: overlay.range.end },
      contentRange: { start: overlay.range.start, end: overlay.range.end },
      modifiedText: overlay.text,
      level: 1,
      anchored: false,
    };
    const merged = [...parseChanges, synthetic];
    merged.sort((a, b) => a.range.start - b.range.start);
    return merged;
  }

  /**
   * Broadcast resolved document state (tracking + view mode) for a URI.
   */
  private broadcastDocumentState(uri: string): void {
    const text = this.getDocumentText(uri);
    if (!text) return;
    const tracking = resolveTracking(text, this.projectTrackingDefault);
    // Use existing state viewMode (defaults to 'review' when not set)
    const viewMode = this.docStates.get(uri)?.viewMode ?? 'review';
    sendDocumentState(this.connection, uri, tracking, viewMode);
  }

  /**
   * Load project config from .changedown/config.toml via canonical parser.
   * Stores full parsed config and extracts tracking default.
   * Sets both to undefined when the config file is absent.
   */
  private loadProjectConfig(): void {
    if (!this.workspaceRoot) return;
    try {
      const config = this.options.loadConfig?.(this.workspaceRoot);
      if (config) {
        this.projectConfig = config;
        this.projectTrackingDefault = config.tracking.default;
        this.coherenceThreshold = config.coherence?.threshold ?? DEFAULT_CONFIG.coherence.threshold;
      } else {
        this.projectConfig = undefined;
        this.projectTrackingDefault = undefined;
        this.coherenceThreshold = DEFAULT_CONFIG.coherence.threshold;
      }
    } catch {
      this.projectConfig = undefined;
      this.projectTrackingDefault = undefined;
      this.coherenceThreshold = DEFAULT_CONFIG.coherence.threshold;
    }
  }

  /**
   * Re-send decorationData when overlay changes (Phase 1).
   * Debounced to avoid flooding on rapid overlay updates.
   */
  private scheduleDecorationResend(uri: string): void {
    const state = this.docStates.get(uri);
    if (!state) return;
    if (state.decorationTimeout) clearTimeout(state.decorationTimeout);
    state.decorationTimeout = setTimeout(() => {
      state.decorationTimeout = null;
      const changes = this.getMergedChanges(uri);
      sendDecorationData(this.connection, uri, changes, state.version);
      sendChangeCount(this.connection, uri, changes);
    }, DECORATION_NOTIFY_DEBOUNCE_MS);
  }

  /**
   * Ensure a state bag exists for the given URI. Creates one if absent.
   */
  private ensureDocState(uri: string, text: string, languageId?: string): LspDocumentState {
    let state = this.docStates.get(uri);
    if (!state) {
      const initialParse = this.workspace.parse(text, languageId);
      const docVersion = this.documents.get(uri)?.version ?? 0;
      state = createLspDocumentState(docVersion, text, languageId ?? 'markdown', initialParse);
      this.docStates.set(uri, state);
    }
    return state;
  }

  /**
   * Shared logic for document open and change: parse, cache, and send diagnostics.
   * Returns the parse result so callers can send additional notifications.
   */
  private parseAndCacheDocument(uri: string, text: string, languageId?: string): VirtualDocument {
    const parseResult = this.workspace.parse(text, languageId);
    const state = this.docStates.get(uri);
    if (state) {
      state.parseResult = parseResult;
      state.text = text;
      state.version = this.documents.get(uri)?.version ?? 0;
      if (languageId) state.languageId = languageId;
    }

    // Send diagnostics — now includes Warning-level for unresolved anchors
    const diagnostics = createDiagnostics(parseResult.getChanges(), text, parseResult.unresolvedDiagnostics);
    this.connection.sendDiagnostics({ uri, diagnostics });

    // Send coherence status (threshold from project config)
    const threshold = this.coherenceThreshold;
    const unresolvedCount = parseResult.getUnresolvedChanges().length;
    const last = this.lastCoherenceStatus.get(uri);
    if (!last || last.rate !== parseResult.coherenceRate || last.count !== unresolvedCount) {
      this.lastCoherenceStatus.set(uri, { rate: parseResult.coherenceRate, count: unresolvedCount });
      sendCoherenceStatus(this.connection, uri, parseResult.coherenceRate, unresolvedCount, threshold);
    }

    // Write-back: apply resolved anchors if parser produced fresh text
    const isBatchEditing = this.docStates.get(uri)?.isBatchEditing ?? false;
    if (parseResult.resolvedText && !this.pendingWriteBack.has(uri) && !isBatchEditing) {
      const currentLines = text.split('\n');
      const { bodyLines, footnoteLines } = splitBodyAndFootnotes(currentLines);
      const resolvedLines = parseResult.resolvedText.split('\n');
      const { bodyLines: resolvedBodyLines, footnoteLines: resolvedFootnoteLines } = splitBodyAndFootnotes(resolvedLines);

      // Body safety check (Resolution Protocol Invariant 4) — length fast-path
      if (bodyLines.length === resolvedBodyLines.length && bodyLines.join('\n') === resolvedBodyLines.join('\n')) {
        // Replace footnote section only — start at the first footnote line
        const footnoteStart = currentLines.length - footnoteLines.length;
        const resolvedFootnoteText = resolvedFootnoteLines.join('\n');

        this.pendingWriteBack.add(uri);
        const textDocument = this.documents.get(uri);
        if (textDocument) {
          const startPos = { line: footnoteStart, character: 0 };
          const endPos = {
            line: textDocument.lineCount - 1,
            character: currentLines[currentLines.length - 1]?.length ?? 0
          };
          this.connection.workspace.applyEdit({
            changes: {
              [uri]: [{
                range: { start: startPos, end: endPos },
                newText: resolvedFootnoteText,
              }],
            },
          }).then(
            (result) => { if (!result.applied) this.connection.console.warn(`[write-back] edit rejected for ${uri}`); },
            (err) => { this.pendingWriteBack.delete(uri); this.connection.console.error(`[write-back] applyEdit failed for ${uri}: ${err}`); }
          );
        }
      } else {
        this.connection.console.warn(`[write-back] Body mismatch for ${uri} — skipping anchor refresh`);
      }
    }

    return parseResult;
  }

  public handleBatchEditStart(uri: string): void {
    let state = this.docStates.get(uri);
    if (!state) {
      // Create a minimal state bag so the batch flag persists until document open/change
      state = createLspDocumentState(0, '', 'markdown', this.workspace.parse(''));
      this.docStates.set(uri, state);
    }
    state.isBatchEditing = true;
  }

  public handleBatchEditEnd(uri: string): void {
    const state = this.docStates.get(uri);
    if (state) {
      state.isBatchEditing = false;
      // Re-send decoration data with the already-cached parse result from the batch
      const changes = this.getMergedChanges(uri);
      sendDecorationData(this.connection, uri, changes, state.version);
      sendChangeCount(this.connection, uri, changes);
    }
  }

  /**
   * Handle document open event.
   * If the document is L2 with changes, promote to L3 via workspace/applyEdit.
   * Otherwise, parse and send decorationData normally.
   */
  public async handleDocumentOpen(uri: string, text: string, languageId?: string): Promise<void> {
    // Skip comment input documents — they don't need parsing, decorations, or state
    if (uri.startsWith('comment://')) return;

    // Create or reuse state bag for this document
    this.ensureDocState(uri, text, languageId);
    const state = this.docStates.get(uri)!;

    // Initialize the PEM's scId counter from existing cn-N IDs in the document
    // so new crystallized edits get IDs that don't collide with existing ones.
    const maxId = scanMaxCnId(text);
    this.pendingEditManager.initScIdCounter(uri, maxId);

    const isL3 = this.workspace.isFootnoteNative(text);

    if (!isL3) {
      // Check if this is an L2 document with changes that should be promoted
      const l2Doc = this.workspace.parse(text, languageId);
      const l2Changes = l2Doc.getChanges();

      if (l2Changes.length > 0) {
        // L2 with changes → promote to L3
        try {
          const l3Text = await convertL2ToL3(text);

          // Parse L3 for decoration data
          this.parseAndCacheDocument(uri, l3Text, languageId);
          const l3Changes = this.getMergedChanges(uri);

          // Send L3 decoration data FIRST (pre-populates extension cache)
          const autoFoldLines = !state.autoFoldSent ? computeAutoFoldLines(l3Text) : undefined;
          sendDecorationData(this.connection, uri, l3Changes, state.version, autoFoldLines ?? undefined);
          if (autoFoldLines) state.autoFoldSent = true;
          sendChangeCount(this.connection, uri, l3Changes);

          // Notify extension to set convertingUris guard
          this.connection.sendNotification('changedown/promotionStarting', { uri });

          // CRITICAL: set isPromoting BEFORE sending applyEdit
          // because didChange can arrive before the applyEdit response returns
          state.isPromoting = true;

          // Request extension to replace buffer with L3 text
          const applied = await this.connection.workspace.applyEdit({
            label: 'Promote to L3',
            edit: {
              changes: {
                [uri]: [{
                  range: {
                    start: { line: 0, character: 0 },
                    end: (() => {
                      const lines = text.split('\n');
                      return { line: lines.length - 1, character: lines[lines.length - 1].length };
                    })()
                  },
                  newText: l3Text
                }]
              }
            }
          });

          if (!applied.applied) {
            // Promotion failed — fall back to L2 decoration data
            state.isPromoting = false;
            this.parseAndCacheDocument(uri, text, languageId);
            const fallbackChanges = this.getMergedChanges(uri);
            sendDecorationData(this.connection, uri, fallbackChanges, state.version);
            sendChangeCount(this.connection, uri, fallbackChanges);
            this.connection.console?.error(
              `[promoteToL3] workspace/applyEdit rejected for ${uri}`
            );
          }

          // Notify extension that promotion is complete (success or failure)
          this.connection.sendNotification('changedown/promotionComplete', { uri });
          this.broadcastDocumentState(uri);
          return;
        } catch (err) {
          // Conversion failed — fall through to normal L2 handling
          this.connection.console?.error(
            `[promoteToL3] conversion error for ${uri}: ${err}`
          );
        }
      }
    }

    // Normal path: L3 document, L2 without changes, or promotion failed
    this.parseAndCacheDocument(uri, text, languageId);
    const changes = this.getMergedChanges(uri);
    const isL3ForFold = this.workspace.isFootnoteNative(text);
    const viewModeForFold = state.viewMode;
    const autoFoldLines = (isL3ForFold && !state.autoFoldSent && (viewModeForFold === 'review' || viewModeForFold === 'changes'))
      ? computeAutoFoldLines(text) : undefined;
    sendDecorationData(this.connection, uri, changes, state.version, autoFoldLines ?? undefined);
    if (autoFoldLines) state.autoFoldSent = true;
    sendChangeCount(this.connection, uri, changes);
    this.broadcastDocumentState(uri);
  }

  private async isDiskTextEqualForUri(uri: string, text: string): Promise<boolean> {
    if (!this.options.readFileByUri) return false;
    try {
      const diskText = await this.options.readFileByUri(uri);
      return diskText === text;
    } catch {
      return false;
    }
  }

  /**
   * Handle document change event.
   * Re-parse the document; debounce decoration/changeCount notifications.
   * Suppresses re-parse for promotion echoes and batch edits.
   * Auto-detects L2 documents with changes and re-promotes.
   */
  public async handleDocumentChange(uri: string, text: string, languageId?: string): Promise<void> {
    // Skip comment input documents
    if (uri.startsWith('comment://')) return;

    // Ensure state bag exists (normally created in handleDocumentOpen, but didChange can arrive first)
    const state = this.ensureDocState(uri, text, languageId);

    // Skip re-parse for promotion echo — we already sent correct decorationData
    if (state.isPromoting) {
      state.isPromoting = false;
      // Still update text in state bag with the L3 text
      state.text = text;
      // parseResult already has L3 parse from handleDocumentOpen
      return;
    }

    // Clear write-back re-entrance guard unconditionally on echo parse
    // (mirrors isPromoting pattern — clear at entry, not conditionally inside parse)
    this.pendingWriteBack.delete(uri);

    // Skip re-promotion during batch edits (save conversion, projected view transitions)
    if (state.isBatchEditing) {
      // Parse and cache the intermediate content
      const previousText = state.text;
      this.parseAndCacheDocument(uri, text, languageId);

      // Check if tracking header changed — load-bearing for state sync
      const headerRegex = /^<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/m;
      const oldHeader = previousText?.match(headerRegex)?.[1];
      const newHeader = text.match(headerRegex)?.[1];
      if (oldHeader !== newHeader) {
        this.broadcastDocumentState(uri);
      }

      // Skip decorationData during batch — fresh data will be sent on batchEditEnd
      return;
    }

    // Check if this is an L2 document that needs re-promotion (e.g., after save)
    // Skip if this didChange is the echo from a crystallize edit we just sent
    const isCrystallizeEcho = this.pendingCrystallizeEcho.delete(uri);
    const isL3 = this.workspace.isFootnoteNative(text);
    if (!isL3 && !isCrystallizeEcho) {
      const doc = this.workspace.parse(text, languageId);
      const changes = doc.getChanges();
      if (changes.length > 0) {
        // L2 with changes on didChange — re-promote via handleDocumentOpen.
        // VS Code sends a revert-to-disk didChange during "Don't Save" close.
        // When didChange text equals disk content, suppress repromotion until
        // the next didOpen/didClose.
        if (!state.suppressRepromotion) {
          const diskMatches = await this.isDiskTextEqualForUri(uri, text);
          if (diskMatches) {
            state.suppressRepromotion = true;
          } else {
            await this.handleDocumentOpen(uri, text, languageId);
            return;
          }
        }
      }
    }

    // Normal change handling: parse, cache, debounced notifications
    const previousText = state.text;
    this.parseAndCacheDocument(uri, text, languageId);

    // Check if tracking header changed
    const headerRegex = /^<!--\s*changedown\.com\/v1:\s*(tracked|untracked)\s*-->/m;
    const oldHeader = previousText?.match(headerRegex)?.[1];
    const newHeader = text.match(headerRegex)?.[1];
    if (oldHeader !== newHeader) {
      this.broadcastDocumentState(uri);
    }

    // Debounce decoration/changeCount so we don't flood the client on every keystroke
    if (state.decorationTimeout) clearTimeout(state.decorationTimeout);
    state.decorationTimeout = setTimeout(() => {
      state.decorationTimeout = null;
      const changes = this.getMergedChanges(uri);
      sendDecorationData(this.connection, uri, changes, state.version);
      sendChangeCount(this.connection, uri, changes);
    }, DECORATION_NOTIFY_DEBOUNCE_MS);
  }

  /**
   * Handle a crystallized edit from the PendingEditManager.
   *
   * Converts the offset-based CrystallizedEdit into LSP Ranges and sends
   * a changedown/pendingEditFlushed notification to the client. The client
   * is responsible for applying the workspace edits to the document.
   *
   * The new CrystallizedEdit contains `edits` with `markupEdit` (inline
   * CriticMarkup replacement) and `footnoteEdit` (footnote definition append).
   * For L3 format, markupEdit is null (body text stays as-is).
   *
   * @param edit The crystallized edit with offset-based edits
   */
  private handleCrystallizedEdit(edit: CrystallizedEdit): void {
    const text = this.getDocumentText(edit.uri);
    if (!text) {
      return;
    }

    const { edits } = edit;
    const { markupEdit, footnoteEdit } = edits;

    // Mark this URI as expecting an echo from the applied edit
    this.pendingEditManager.expectEcho(edit.uri);
    // Suppress re-promotion on the echo didChange — the crystallized markup
    // is intentionally L2 and should not trigger L2→L3 conversion
    this.pendingCrystallizeEcho.add(edit.uri);

    if (markupEdit) {
      // L2: both markup and footnote edits
      const markupRange = offsetRangeToLspRange(text, markupEdit.offset, markupEdit.offset + markupEdit.length);
      // After markup edit is applied, text changes. Compute footnote range against
      // the text-after-markup-edit for correct offsets.
      const textAfterMarkup = text.substring(0, markupEdit.offset) + markupEdit.newText + text.substring(markupEdit.offset + markupEdit.length);
      const footnoteRange = offsetRangeToLspRange(textAfterMarkup, footnoteEdit.offset, footnoteEdit.offset + footnoteEdit.length);
      sendPendingEditFlushed(
        this.connection, edit.uri,
        markupRange, markupEdit.newText,
        footnoteRange, footnoteEdit.newText,
      );
    } else {
      // L3: footnote-only edit (no markup change — user's typed text stays)
      const footnoteRange = offsetRangeToLspRange(text, footnoteEdit.offset, footnoteEdit.offset + footnoteEdit.length);
      sendPendingEditFlushed(
        this.connection, edit.uri,
        { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, '',
        footnoteRange, footnoteEdit.newText,
      );
    }
  }

  /**
   * Handle hover request
   * Provide hover information for comments
   */
  public handleHover(params: HoverParams): Hover | null {
    try {
      const document = this.documents.get(params.textDocument.uri);
      if (!document) {
        return null;
      }

      const changes = this.getMergedChanges(params.textDocument.uri);
      return createHover(params.position, changes, document.getText());
    } catch (err) {
      this.connection.console.error(`handleHover error: ${err}`);
      return null;
    }
  }

  /**
   * Handle semantic tokens request
   * Provide syntax highlighting for CriticMarkup
   */
  public handleSemanticTokens(params: SemanticTokensParams): SemanticTokens {
    try {
      const uri = params.textDocument.uri;
      const viewMode = this.getViewMode(uri);

      // Raw mode: no semantic tokens at all
      if (viewMode === 'raw') {
        return { data: [] };
      }

      const text = this.getDocumentText(uri);
      if (!text) {
        return { data: [] };
      }
      const changes = this.getMergedChanges(uri);
      return buildSemanticTokens(changes, text, viewMode);
    } catch (err) {
      this.connection.console.error(`handleSemanticTokens error: ${err}`);
      return { data: [] };
    }
  }

  /**
   * Handle code lens request
   * Returns inline action buttons for CriticMarkup changes
   *
   * @param params Code lens parameters (document URI)
   * @returns Array of code lenses
   */
  public handleCodeLens(params: CodeLensParams): CodeLens[] {
    try {
      const uri = params.textDocument.uri;
      const text = this.getDocumentText(uri);
      if (!text) {
        return [];
      }
      const changes = this.getMergedChanges(uri);
      const viewMode = this.getViewMode(uri);
      const state = this.docStates.get(uri);
      const cursorState = state?.cursorState ?? undefined;
      const coherenceRate = state?.parseResult?.coherenceRate ?? 100;
      return createCodeLenses(changes, text, viewMode, this.codeLensMode, cursorState, coherenceRate);
    } catch (err) {
      this.connection.console.error(`handleCodeLens error: ${err}`);
      return [];
    }
  }

  /**
   * Handle folding range request.
   * Returns fold ranges for L3 footnote sections and multi-line deletions.
   */
  public handleFoldingRanges(params: { textDocument: { uri: string } }): FoldingRange[] {
    try {
      const uri = params.textDocument.uri;
      const text = this.getDocumentText(uri);
      if (!text) return [];
      const changes = this.getMergedChanges(uri);
      const viewMode = this.getViewMode(uri);
      const state = this.docStates.get(uri);
      const cursorState = state?.cursorState ?? null;
      return createFoldingRanges(changes, text, viewMode, cursorState);
    } catch (err) {
      this.connection.console.error(`handleFoldingRanges error: ${err}`);
      return [];
    }
  }

  /**
   * Handle code action request
   * Provide accept/reject actions for CriticMarkup changes
   *
   * @param params Code action parameters
   * @returns Array of code actions
   */
  public handleCodeAction(params: CodeActionParams): CodeAction[] {
    try {
      const uri = params.textDocument.uri;
      const document = this.documents.get(uri);

      if (!document) {
        return [];
      }

      const changes = this.getMergedChanges(uri);
      const text = document.getText();

      // Get diagnostics for this document
      const diagnostics = params.context.diagnostics;

      // For each diagnostic, create code actions
      const actions: CodeAction[] = [];
      for (const diagnostic of diagnostics) {
        if (diagnostic.source === 'changedown') {
          actions.push(...createCodeActions(diagnostic, changes, text, uri, this.reviewerIdentity));
        }
      }

      return actions;
    } catch (err) {
      this.connection.console.error(`handleCodeAction error: ${err}`);
      return [];
    }
  }

  /**
   * Handle document links request
   * Provides clickable navigation between inline [^cn-N] refs and footnote definitions
   */
  public handleDocumentLinks(params: DocumentLinkParams): DocumentLink[] {
    try {
      const uri = params.textDocument.uri;
      const text = this.getDocumentText(uri);
      if (!text) {
        return [];
      }
      return createDocumentLinks(text, uri);
    } catch (err) {
      this.connection.console.error(`handleDocumentLinks error: ${err}`);
      return [];
    }
  }

  /**
   * Handle the changedown/annotate custom request.
   *
   * Takes a textDocument URI, retrieves the previous version from git,
   * runs the appropriate annotator (CriticMarkup for markdown, sidecar for
   * code files), and returns a WorkspaceEdit that replaces the entire buffer.
   *
   * Returns null when annotation cannot proceed:
   * - Document not open in the server
   * - File not in a git repository
   * - No previous version in git history
   * - File already contains annotations
   * - No changes detected (old text matches current text)
   * - Unsupported language (no comment syntax for sidecar)
   *
   * @param params The request parameters containing the document URI
   * @returns A WorkspaceEdit replacing the buffer, or null
   */
  public async handleAnnotate(params: AnnotateParams): Promise<WorkspaceEdit | null> {
    try {
      const uri = params.textDocument.uri;

      // Get the document from the text document manager or text cache
      const document = this.documents.get(uri);
      const docState = this.docStates.get(uri);
      const currentText = document?.getText() ?? docState?.text;
      if (currentText === undefined) {
        return null;
      }

      const languageId = document?.languageId ?? docState?.languageId;

      // Check if the file already contains annotations
      if (currentText.includes(SIDECAR_BLOCK_MARKER) || currentText.includes('{++') || currentText.includes('{--')) {
        return null;
      }

      // Convert URI to file path
      let filePath: string;
      try {
        filePath = new URL(uri).pathname;
      } catch {
        return null;
      }

      // Find git workspace root
      const workspaceRoot = await this._gitGetWorkspaceRoot(filePath);
      if (!workspaceRoot) {
        return null;
      }

      // Get previous version from git
      const prev = await this._gitGetPreviousVersion(filePath, workspaceRoot);
      if (!prev) {
        return null;
      }

      // Check if there are actual changes
      if (prev.oldText === currentText) {
        return null;
      }

      // Route to appropriate annotator based on language ID
      let annotatedText: string | undefined;

      if (languageId === 'markdown') {
        annotatedText = annotateMarkdown(prev.oldText, currentText);
      } else if (languageId) {
        // Code file — use sidecar annotator
        annotatedText = annotateSidecar(prev.oldText, currentText, languageId, {
          author: prev.author,
          date: prev.date,
        });
      }

      if (!annotatedText) {
        return null;
      }

      // Build the WorkspaceEdit: replace the entire buffer
      const lines = currentText.split('\n');
      const lastLineIndex = lines.length - 1;
      const lastLineLength = lines[lastLineIndex].length;

      const edit: WorkspaceEdit = {
        changes: {
          [uri]: [
            TextEdit.replace(
              {
                start: { line: 0, character: 0 },
                end: { line: lastLineIndex, character: lastLineLength },
              },
              annotatedText
            )
          ]
        }
      };

      return edit;
    } catch (err) {
      this.connection.console.error(`handleAnnotate error: ${err}`);
      return null;
    }
  }

  /**
   * Get cached parse result for a document
   *
   * @param uri Document URI
   * @returns VirtualDocument if cached, undefined otherwise
   */
  public getParseResult(uri: string): VirtualDocument | undefined {
    return this.docStates.get(uri)?.parseResult;
  }

  /**
   * Get the current view mode for a document.
   * Defaults to 'review' if no mode has been explicitly set.
   *
   * @param uri Document URI
   * @returns The active ViewName for this document
   */
  public getViewMode(uri: string): ViewName {
    return this.docStates.get(uri)?.viewMode ?? 'review';
  }

  /**
   * Handle changedown/getChanges request (Section 11).
   * Params: { textDocument: { uri: string } }
   * Response: { changes: ChangeNode[] }
   * Reuses getMergedChanges logic. Parses document if not yet cached.
   */
  public handleGetChanges(params: { textDocument: { uri: string } }): { changes: ChangeNode[] } {
    const uri = params.textDocument.uri;
    // Ensure we have parsed content — parse if document is open but not cached
    const doc = this.documents.get(uri);
    if (doc && !this.docStates.get(uri)?.parseResult) {
      this.ensureDocState(uri, doc.getText(), doc.languageId);
    }
    const changes = this.getMergedChanges(uri)
      .filter(c => !isGhostNode(c));
    return { changes };
  }

  // ─── Phase 2: Lifecycle operation helpers ───────────────────────────────────

  /**
   * Get document text, preferring the LSP SDK's synchronized TextDocuments
   * manager (always up-to-date when a request handler runs) over the
   * asynchronously-updated textCache. The textCache serves as fallback for
   * documents not yet opened by the client.
   */
  private getDocumentText(uri: string): string | undefined {
    return this.documents.get(uri)?.getText() ?? this.docStates.get(uri)?.text;
  }

  /**
   * Create a full-document replacement TextEdit (LSP Range-based).
   * Replaces the entire document content with newText.
   */
  private fullDocumentEdit(uri: string, newText: string): TextEdit {
    const text = this.getDocumentText(uri) ?? '';
    const lines = text.split('\n');
    const lastLine = lines.length - 1;
    const lastChar = lines[lastLine].length;
    return TextEdit.replace(
      { start: { line: 0, character: 0 }, end: { line: lastLine, character: lastChar } },
      newText
    );
  }

  /**
   * Apply a core TextEdit (offset-based) to a string and return the result.
   */
  private applyCoreTextEdit(text: string, edit: { offset: number; length: number; newText: string }): string {
    return text.slice(0, edit.offset) + edit.newText + text.slice(edit.offset + edit.length);
  }

  // ─── Phase 2: Lifecycle operation handlers (2A–2G) ─────────────────────────

  /**
   * 2A: changedown/getProjectConfig
   * Returns project configuration for reason requirements and reviewer identity.
   */
  public handleGetProjectConfig(): {
    reasonRequired: { human: boolean; agent: boolean };
    reviewerIdentity: string | undefined;
  } {
    // Map the new reasoning.review section back to the legacy reasonRequired
    // shape expected by the VS Code extension.
    const reasoning = this.projectConfig?.reasoning ?? DEFAULT_CONFIG.reasoning;
    return {
      reasonRequired: reasoning.review,
      reviewerIdentity: this.reviewerIdentity,
    };
  }

  /**
   * 2B: changedown/reviewChange
   * Apply a review decision (approve/reject/request_changes) to a tracked change.
   */
  public handleReviewChange(params: {
    uri: string;
    changeId: string;
    decision: Decision;
    reason?: string;
    author?: string;
  }): { edit: TextEdit } | { error: string } {
    try {
      const text = this.getDocumentText(params.uri);
      if (!text) return { error: 'Document not found' };
      const author = params.author ?? this.reviewerIdentity ?? '';
      const result = applyReview(text, params.changeId, params.decision, params.reason ?? '', author);
      if ('error' in result) return { error: result.error };

      let finalContent = result.updatedContent;

      // Auto-settle if config says so and status actually changed
      if (result.result.status_updated) {
        const settlement = this.projectConfig?.settlement ?? DEFAULT_CONFIG.settlement;

        if (settlement.auto_on_approve && params.decision === 'approve') {
          const { settledContent, settledIds } = settleAcceptedChangesOnly(finalContent);
          if (settledIds.length > 0) {
            finalContent = settledContent;
          }
        }

        if (settlement.auto_on_reject && params.decision === 'reject') {
          const { settledContent, settledIds } = settleRejectedChangesOnly(finalContent);
          if (settledIds.length > 0) {
            finalContent = settledContent;
          }
        }
      }

      return { edit: this.fullDocumentEdit(params.uri, finalContent) };
    } catch (err) {
      this.connection.console.error(`handleReviewChange error: ${err}`);
      return { error: `Review change failed: ${err}` };
    }
  }

  /**
   * 2C: changedown/replyToThread
   * Add a discussion reply to a change's footnote thread.
   */
  public handleReplyToThread(params: {
    uri: string;
    changeId: string;
    text: string;
    author?: string;
    label?: string;
  }): { edit: TextEdit } | { error: string } {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };
      const author = params.author ?? this.reviewerIdentity ?? '';
      const result = computeReplyEdit(docText, params.changeId, {
        text: params.text,
        author,
        label: params.label,
      });
      if (result.isError) return { error: result.error };
      return { edit: this.fullDocumentEdit(params.uri, result.text) };
    } catch (err) {
      this.connection.console.error(`handleReplyToThread error: ${err}`);
      return { error: `Reply to thread failed: ${err}` };
    }
  }

  /**
   * 2D: changedown/amendChange
   * Amend a proposed change's inline text or reasoning.
   */
  public async handleAmendChange(params: {
    uri: string;
    changeId: string;
    newText: string;
    reason?: string;
    author?: string;
  }): Promise<{ edit: TextEdit } | { error: string }> {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };
      const author = params.author ?? this.reviewerIdentity ?? '';

      // --- Author check: amend requires same author ---
      const lines = docText.split('\n');
      const block = findFootnoteBlock(lines, params.changeId);
      if (!block) return { error: `Change "${params.changeId}" not found in file.` };
      const header = parseFootnoteHeader(lines[block.headerLine]);
      if (!header) return { error: `Malformed metadata for change "${params.changeId}".` };
      const normalizedAuthor = author.replace(/^@/, '');
      const normalizedOriginal = (header.author ?? '').replace(/^@/, '');
      if (normalizedAuthor !== normalizedOriginal) {
        return { error: `You are not the original author of change "${params.changeId}". Use supersede to propose an alternative.` };
      }

      // --- For insertions, derive insertAfter anchor ---
      let insertAfter: string | undefined;
      const doc = parseForFormat(docText);
      const change = doc.getChanges().find(c => c.id === params.changeId);
      if (change && change.type === ChangeType.Insertion) {
        const start = change.range.start;
        const contextLen = Math.min(30, start);
        if (contextLen > 0) {
          insertAfter = docText.slice(start - contextLen, start).trimStart();
        }
      }

      // oldText omitted — computeSupersedeResult derives it from the rejected change
      const result = await computeSupersedeResult(docText, params.changeId, {
        newText: params.newText,
        reason: params.reason,
        author,
        insertAfter,
      });
      if (result.isError) return { error: result.error };
      return { edit: this.fullDocumentEdit(params.uri, result.text) };
    } catch (err) {
      this.connection.console.error(`handleAmendChange error: ${err}`);
      return { error: `Amend change failed: ${err}` };
    }
  }

  /**
   * 2E: changedown/supersedeChange
   * Reject a proposed change and propose a replacement, with cross-references.
   */
  public async handleSupersedeChange(params: {
    uri: string;
    changeId: string;
    newText: string;
    reason?: string;
    author?: string;
    oldText?: string;
    insertAfter?: string;
  }): Promise<{ edit: TextEdit; newChangeId: string } | { error: string }> {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };
      const author = params.author ?? this.reviewerIdentity ?? '';
      const result = await computeSupersedeResult(docText, params.changeId, {
        newText: params.newText,
        oldText: params.oldText,
        reason: params.reason,
        author,
        insertAfter: params.insertAfter,
      });
      if (result.isError) return { error: result.error };
      return {
        edit: this.fullDocumentEdit(params.uri, result.text),
        newChangeId: result.newChangeId,
      };
    } catch (err) {
      this.connection.console.error(`handleSupersedeChange error: ${err}`);
      return { error: `Supersede change failed: ${err}` };
    }
  }

  /**
   * 2F: changedown/resolveThread
   * Mark a change's discussion thread as resolved.
   */
  public handleResolveThread(params: {
    uri: string;
    changeId: string;
    author?: string;
  }): { edit: TextEdit } | { error: string } {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };
      const author = params.author ?? this.reviewerIdentity ?? '';
      const coreEdit = computeResolutionEdit(docText, params.changeId, { author });
      if (!coreEdit) return { error: `Cannot resolve ${params.changeId}` };
      const newText = this.applyCoreTextEdit(docText, coreEdit);
      return { edit: this.fullDocumentEdit(params.uri, newText) };
    } catch (err) {
      this.connection.console.error(`handleResolveThread error: ${err}`);
      return { error: `Resolve thread failed: ${err}` };
    }
  }

  /**
   * 2F (unresolve): changedown/unresolveThread
   * Remove the resolved status from a change's discussion thread.
   */
  public handleUnresolveThread(params: {
    uri: string;
    changeId: string;
  }): { edit: TextEdit } | { error: string } {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };
      const coreEdit = computeUnresolveEdit(docText, params.changeId);
      if (!coreEdit) return { error: `Cannot unresolve ${params.changeId}` };
      const newText = this.applyCoreTextEdit(docText, coreEdit);
      return { edit: this.fullDocumentEdit(params.uri, newText) };
    } catch (err) {
      this.connection.console.error(`handleUnresolveThread error: ${err}`);
      return { error: `Unresolve thread failed: ${err}` };
    }
  }

  /**
   * 2G: changedown/compactChange
   * Compact a settled change by descending its metadata level.
   * Default: L2 → L1. With `fully: true`: L2 → L0.
   */
  public handleCompactChange(params: {
    uri: string;
    changeId: string;
    fully?: boolean;
  }): { edit: TextEdit } | { error: string } {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };

      // Guard: only compact changes that are accepted or rejected (settled)
      const lines = docText.split('\n');
      const block = findFootnoteBlock(lines, params.changeId);
      if (!block) return { error: `Change "${params.changeId}" not found in file` };
      const header = parseFootnoteHeader(lines[block.headerLine]);
      if (!header) return { error: `Malformed metadata for change "${params.changeId}"` };
      if (header.status === 'proposed') {
        return { error: `Cannot compact proposed change "${params.changeId}". Only accepted or rejected changes can be compacted.` };
      }

      // L2 → L1
      let result = compactToLevel1(docText, params.changeId);
      if (result === docText) {
        return { error: `Could not compact "${params.changeId}" to Level 1` };
      }

      // If fully requested, also L1 → L0
      // After L2→L1 the footnote ref is gone, so we locate the change by
      // matching on inlineMetadata fields extracted BEFORE L1 compaction.
      if (params.fully) {
        // Extract footnote header fields BEFORE L1 compaction (change ID is lost after L1)
        const preLines = docText.split('\n');
        const preBlock = findFootnoteBlock(preLines, params.changeId);
        const preHeader = preBlock ? parseFootnoteHeader(preLines[preBlock.headerLine]) : null;

        const compactDoc = this.workspace.parse(result);
        const changes = compactDoc.getChanges();

        // Find the target L1 change by matching on inlineMetadata fields
        let idx = -1;
        if (preHeader) {
          // parseFootnoteHeader strips the leading '@' from author (e.g. 'alice'),
          // while parseInlineMetadata preserves it (e.g. '@alice'). Normalize both
          // to bare form for comparison.
          const bareAuthor = (a: string | undefined) => a?.replace(/^@/, '');
          idx = changes.findIndex((c) =>
            c.level === 1 &&
            bareAuthor(c.inlineMetadata?.author) === bareAuthor(preHeader.author) &&
            c.inlineMetadata?.date === preHeader.date &&
            c.inlineMetadata?.type === preHeader.type
          );
        }
        // Fallback: if only one L1 change exists, use it
        if (idx < 0) {
          const l1Changes = changes.filter((c) => c.level === 1);
          if (l1Changes.length === 1) {
            idx = changes.indexOf(l1Changes[0]);
          }
        }

        if (idx >= 0) {
          const l0Result = compactToLevel0(result, idx);
          if (l0Result !== result) {
            result = l0Result;
          }
        }
      }

      return { edit: this.fullDocumentEdit(params.uri, result) };
    } catch (err) {
      this.connection.console.error(`handleCompactChange error: ${err}`);
      return { error: `Compact change failed: ${err}` };
    }
  }

  /**
   * 2G+: changedown/compactChanges (plural)
   * Compact multiple decided footnotes from an L3 (or L2) document in a single
   * operation. Removes targeted footnote blocks, applies body mutations for
   * rejected proposed changes, and inserts a compaction-boundary footnote.
   */
  public async handleCompactChanges(params: {
    uri: string;
    targets: string[] | 'all-decided';
    undecidedPolicy: 'accept' | 'reject';
    boundaryMeta?: Record<string, string>;
  }): Promise<{ edit: TextEdit; compactedIds: string[]; verification: VerificationResult } | { error: string }> {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };

      const l3 = isL3Format(docText);
      const compactFn = l3 ? compact : compactL2;

      const result = await compactFn(docText, {
        targets: params.targets,
        undecidedPolicy: params.undecidedPolicy,
        boundaryMeta: params.boundaryMeta,
      });

      if (!result.verification.valid) {
        const issues: string[] = [];
        if (result.verification.danglingRefs.length > 0)
          issues.push(`${result.verification.danglingRefs.length} dangling ref(s)`);
        if (result.verification.anchorCoherence < 100)
          issues.push(`anchor coherence ${result.verification.anchorCoherence}%`);
        if (result.verification.danglingSupersedes.length > 0)
          issues.push(`${result.verification.danglingSupersedes.length} dangling supersedes`);
        this.connection.console.warn(`Compaction verification: ${issues.join(', ')}`);
      }

      return {
        edit: this.fullDocumentEdit(params.uri, result.text),
        compactedIds: result.compactedIds,
        verification: result.verification,
      };
    } catch (err) {
      this.connection.console.error(`handleCompactChanges error: ${err}`);
      return { error: `Compaction failed: ${err}` };
    }
  }

  /**
   * 2H: changedown/reviewAll
   * Apply a review decision to all proposed changes in a document in a single
   * request, eliminating the stale-text race that occurs when looping over
   * changedown/reviewChange one change at a time.
   *
   * When changeIds is provided, only the specified changes are reviewed
   * (used by acceptAllOnLine / rejectAllOnLine).
   */
  public handleReviewAll(params: {
    uri: string;
    decision: 'approve' | 'reject';
    changeIds?: string[];
  }): { edit: TextEdit; reviewedCount: number } | { error: string } {
    try {
      const text = this.getDocumentText(params.uri);
      if (!text) return { error: 'Document not found' };

      const author = this.reviewerIdentity ?? '';

      // Parse once to identify all proposed changes (format-aware via workspace)
      const languageId = this.docStates.get(params.uri)?.languageId;
      const doc = this.workspace.parse(text, languageId);
      const allChanges = doc.getChanges();

      // Filter to proposed changes; optionally restrict to a specified ID set
      const idSet = params.changeIds ? new Set(params.changeIds) : null;
      const targets = allChanges.filter(c => {
        if (c.status !== ChangeStatus.Proposed) return false;
        if (idSet !== null && (!c.id || !idSet.has(c.id))) return false;
        return true;
      });

      if (targets.length === 0) {
        return { edit: this.fullDocumentEdit(params.uri, text), reviewedCount: 0 };
      }

      // Process in reverse document order (highest offset first) so earlier
      // offsets are not invalidated by edits to later regions of the text.
      const sorted = [...targets].sort((a, b) => b.range.start - a.range.start);

      let fileContent = text;
      let reviewedCount = 0;

      for (const change of sorted) {
        if (!change.id) continue;
        const reviewResult = applyReview(fileContent, change.id, params.decision, '', author);
        if ('error' in reviewResult) {
          this.connection.console.warn(`handleReviewAll: skipping ${change.id}: ${reviewResult.error}`);
          continue;
        }
        fileContent = reviewResult.updatedContent;
        reviewedCount++;
      }

      // Auto-settle if configured
      if (reviewedCount > 0) {
        const settlement = this.projectConfig?.settlement ?? DEFAULT_CONFIG.settlement;

        if (settlement.auto_on_approve && params.decision === 'approve') {
          const { settledContent, settledIds } = settleAcceptedChangesOnly(fileContent);
          if (settledIds.length > 0) {
            fileContent = settledContent;
          }
        }

        if (settlement.auto_on_reject && params.decision === 'reject') {
          const { settledContent, settledIds } = settleRejectedChangesOnly(fileContent);
          if (settledIds.length > 0) {
            fileContent = settledContent;
          }
        }
      }

      return { edit: this.fullDocumentEdit(params.uri, fileContent), reviewedCount };
    } catch (err) {
      this.connection.console.error(`handleReviewAll error: ${err}`);
      return { error: `Review all failed: ${err}` };
    }
  }
}
