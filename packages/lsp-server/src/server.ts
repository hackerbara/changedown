/**
 * LSP Server Implementation
 *
 * Language Server Protocol server for CriticMarkup editing.
 * Handles LSP protocol communication and delegates parsing to the core package.
 */

import {
  createConnection,
  Connection,
  TextDocuments,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  ProposedFeatures,
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
  TextEdit,
  DidChangeWatchedFilesNotification,
  CodeLensRefreshRequest
} from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  Workspace, VirtualDocument, ChangeNode, ChangeType, ChangeStatus,
  annotateMarkdown, annotateSidecar, SIDECAR_BLOCK_MARKER, VIEW_NAMES,
  applyReview, computeAmendEdits, computeSupersedeResult, computeReplyEdit,
  computeResolutionEdit, computeUnresolveEdit, compactToLevel1, compactToLevel0,
  CriticMarkupParser, findFootnoteBlock, parseFootnoteHeader,
} from '@changetracks/core';
import type { ViewName, Decision } from '@changetracks/core';
import { getWorkspaceRoot, getPreviousVersion, PreviousVersionResult } from './git';
import { parseConfigToml, DEFAULT_CONFIG } from 'changetracks/config';
import type { ChangeTracksConfig } from 'changetracks/config';
import { createHover } from './capabilities/hover';
import { createCodeLenses, CodeLensMode, CursorState } from './capabilities/code-lens';
import { sendDecorationData, sendChangeCount } from './notifications/decoration-data';
import { sendPendingEditFlushed } from './notifications/pending-edit';
import { sendViewModeChanged, SetViewModeParams } from './notifications/view-mode';
import { resolveTracking, sendDocumentState } from './notifications/document-state';
import { getSemanticTokensLegend, buildSemanticTokens } from './capabilities/semantic-tokens';
import { createDiagnostics } from './capabilities/diagnostics';
import { createCodeActions } from './capabilities/code-actions';
import { createDocumentLinks } from './capabilities/document-links';
import { PendingEditManager, CrystallizedEdit } from './pending-edit-manager';
import { offsetRangeToLspRange } from './converters';

/**
 * Parameters for the changetracks/annotate custom request.
 */
export interface AnnotateParams {
  textDocument: { uri: string };
}

/**
 * Pending overlay from VS Code extension (Phase 1).
 * In-flight insertion before flush; LSP merges with parse for decorationData.
 */
interface PendingOverlay {
  range: { start: number; end: number };
  text: string;
  type: 'insertion';
  scId?: string;
}

/**
 * Shape of `initializationOptions.changetracks` sent by the client.
 */
interface ChangetracksInitOptions {
  reviewerIdentity?: string;
  author?: string;
}

/**
 * Type guard for the changetracks initialization options block.
 */
function isChangetracksInitOptions(value: unknown): value is ChangetracksInitOptions {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if ('reviewerIdentity' in obj && typeof obj.reviewerIdentity !== 'string') return false;
  if ('author' in obj && typeof obj.author !== 'string') return false;
  return true;
}

/**
 * ChangeTracks Language Server
 *
 * Responsibilities:
 * - LSP connection lifecycle (initialize, shutdown, exit)
 * - Document synchronization (open, change, close)
 * - Parse documents using core Workspace and cache results
 * - Provide server capabilities (will be extended in later tasks)
 * - Git-based annotation via changetracks/annotate request
 */
const DECORATION_NOTIFY_DEBOUNCE_MS = 60;

export class ChangetracksServer {
  public readonly connection: Connection;
  public readonly documents: TextDocuments<TextDocument>;
  public readonly workspace: Workspace;
  public readonly pendingEditManager: PendingEditManager;
  private parseCache: Map<string, VirtualDocument> = new Map();
  private textCache: Map<string, string> = new Map();
  private languageIdCache: Map<string, string> = new Map();
  /** Per-URI overlay from VS Code (Phase 1). Extension sends via changetracks/pendingOverlay. */
  private overlayStorage: Map<string, PendingOverlay | null> = new Map();
  /** Per-URI view mode. Defaults to 'review' when not explicitly set. */
  private viewModeStorage: Map<string, ViewName> = new Map();
  /** Per-URI debounce: limit decoration/changeCount notifications to reduce renderer CPU. */
  private decorationNotifyTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Debounce timer for semanticTokens.refresh() — coalesces rapid setViewMode calls into one refresh. */
  private semanticTokenRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  /**
   * Reviewer identity for accept/reject attribution (ADR-031).
   * Set from initializationOptions on startup (Sublime, Neovim, etc.) or via
   * changetracks/updateSettings notification (VS Code extension).
   */
  public reviewerIdentity: string | undefined;
  /** Project config tracking default (from .changetracks/config.toml). Set by Task 11. */
  private projectTrackingDefault: string | undefined;
  /** Full parsed project config (from .changetracks/config.toml). */
  private projectConfig: ChangeTracksConfig | undefined;
  /** Workspace root path for config file resolution. */
  private workspaceRoot: string | undefined;
  private cursorStateStorage: Map<string, CursorState> = new Map();
  private codeLensMode: CodeLensMode = 'cursor';

  /**
   * Git integration functions. These are public properties so tests can
   * replace them with stubs without requiring real git repositories.
   */
  public _gitGetWorkspaceRoot: (filePath: string) => Promise<string | undefined> = getWorkspaceRoot;
  public _gitGetPreviousVersion: (filePath: string, rootDir: string) => Promise<PreviousVersionResult | undefined> = getPreviousVersion;

  constructor(connection: Connection) {
    this.connection = connection;
    this.documents = new TextDocuments(TextDocument);
    this.workspace = new Workspace();
    this.pendingEditManager = new PendingEditManager(
      this.workspace,
      (edit: CrystallizedEdit) => this.handleCrystallizedEdit(edit),
      (uri: string) => this.textCache.get(uri)
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
    this.documents.onDidOpen((event) => {
      const uri = event.document.uri;
      const text = event.document.getText();
      const languageId = event.document.languageId;
      this.handleDocumentOpen(uri, text, languageId);
    });

    this.documents.onDidChangeContent((event) => {
      const uri = event.document.uri;
      const text = event.document.getText();
      const languageId = event.document.languageId;
      this.handleDocumentChange(uri, text, languageId);
    });

    // P1-15: Clean up per-document caches when a document closes to prevent memory leaks
    this.documents.onDidClose((event) => {
      const uri = event.document.uri;
      this.parseCache.delete(uri);
      this.textCache.delete(uri);
      this.languageIdCache.delete(uri);
      this.overlayStorage.delete(uri);
      this.viewModeStorage.delete(uri);
      this.cursorStateStorage.delete(uri);
      const timeout = this.decorationNotifyTimeouts.get(uri);
      if (timeout) {
        clearTimeout(timeout);
        this.decorationNotifyTimeouts.delete(uri);
      }
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

    // Custom request: annotate file from git changes
    this.connection.onRequest('changetracks/annotate', this.handleAnnotate.bind(this));

    // Section 11: getChanges request — on-demand bootstrap when extension cache is empty
    this.connection.onRequest('changetracks/getChanges', this.handleGetChanges.bind(this));

    // Phase 2: Lifecycle operation custom requests (2A-2G)
    this.connection.onRequest('changetracks/getProjectConfig', this.handleGetProjectConfig.bind(this));
    this.connection.onRequest('changetracks/reviewChange', this.handleReviewChange.bind(this));
    this.connection.onRequest('changetracks/replyToThread', this.handleReplyToThread.bind(this));
    this.connection.onRequest('changetracks/amendChange', this.handleAmendChange.bind(this));
    this.connection.onRequest('changetracks/supersedeChange', this.handleSupersedeChange.bind(this));
    this.connection.onRequest('changetracks/resolveThread', this.handleResolveThread.bind(this));
    this.connection.onRequest('changetracks/unresolveThread', this.handleUnresolveThread.bind(this));
    this.connection.onRequest('changetracks/compactChange', this.handleCompactChange.bind(this));

    // Tracking event handler - receives individual edit events from client
    this.connection.onNotification('changetracks/trackingEvent', (params: {
      textDocument: { uri: string };
      type: 'insertion' | 'deletion' | 'replacement';
      position: { offset: number };
      byteLength: number;
      oldByteLength?: number;
      newByteLength?: number;
    }) => {
      try {
        const uri = params.textDocument.uri;
        const text = this.textCache.get(uri) || '';

        switch (params.type) {
          case 'insertion': {
            // Get the inserted text from the current document
            const insertedText = text.substring(params.position.offset, params.position.offset + params.byteLength);
            this.pendingEditManager.handleChange(uri, '', insertedText, params.position.offset);
            break;
          }
          case 'deletion': {
            // For deletions, we need the deleted text from before the change
            // The client sends the byte length but not the text
            // We get the text from textCache (which has the pre-change text until didChange arrives)
            const deletedText = text.substring(params.position.offset, params.position.offset + params.byteLength);
            this.pendingEditManager.handleChange(uri, deletedText, '', params.position.offset);
            break;
          }
          case 'replacement': {
            const oldText = text.substring(params.position.offset, params.position.offset + (params.oldByteLength || 0));
            const newText = text.substring(params.position.offset, params.position.offset + (params.newByteLength || 0));
            this.pendingEditManager.handleChange(uri, oldText, newText, params.position.offset);
            break;
          }
        }
      } catch (err) {
        this.connection.console.error(`changetracks/trackingEvent handler error: ${err}`);
      }
    });

    // Flush pending handler - hard break signal from client
    this.connection.onNotification('changetracks/flushPending', (params: {
      textDocument: { uri: string };
    }) => {
      try {
        this.pendingEditManager.flush(params.textDocument.uri);
      } catch (err) {
        this.connection.console.error(`changetracks/flushPending handler error: ${err}`);
      }
    });

    // Settings update handler - VS Code extension pushes config changes here
    // (Sublime/Neovim send these via initializationOptions instead)
    this.connection.onNotification('changetracks/updateSettings', (params: {
      reviewerIdentity?: string;
    }) => {
      try {
        const identity = (params.reviewerIdentity ?? '').trim();
        this.reviewerIdentity = identity || undefined;
      } catch (err) {
        this.connection.console.error(`changetracks/updateSettings handler error: ${err}`);
      }
    });

    // Phase 1: Pending overlay from VS Code extension (in-flight insertion before flush)
    this.connection.onNotification('changetracks/pendingOverlay', (params: {
      uri: string;
      overlay: PendingOverlay | null;
    }) => {
      try {
        const { uri, overlay } = params;
        this.overlayStorage.set(uri, overlay);
        this.scheduleDecorationResend(uri);
      } catch (err) {
        this.connection.console.error(`changetracks/pendingOverlay handler error: ${err}`);
      }
    });

    // View mode notification: client tells server which view mode is active for a document.
    // Server stores the mode, broadcasts confirmation, and uses it for semantic tokens filtering.
    this.connection.onNotification('changetracks/setViewMode', (params: SetViewModeParams) => {
      try {
        const uri = params.textDocument.uri;
        const viewMode = params.viewMode;
        // Validate incoming viewMode against the canonical set of view names
        if (!VIEW_NAMES.includes(viewMode as ViewName)) {
          this.connection.console.warn(
            `changetracks/setViewMode: ignoring unknown viewMode "${viewMode}" for ${uri}`
          );
          return;
        }
        this.viewModeStorage.set(uri, viewMode);
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
        }, 50);
      } catch (err) {
        this.connection.console.error(`changetracks/setViewMode handler error: ${err}`);
      }
    });

    // Cursor position notification: client tells server where cursor is
    this.connection.onNotification('changetracks/cursorPosition', (params: {
        textDocument: { uri: string };
        line: number;
        changeId?: string;
    }) => {
      try {
        const uri = params.textDocument.uri;
        this.cursorStateStorage.set(uri, {
          line: params.line,
          changeId: params.changeId
        });
        // Trigger CodeLens refresh
        this.connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {
          // Client does not support workspace/codeLens/refresh — safe to ignore
        });
      } catch (err) {
        this.connection.console.error(`changetracks/cursorPosition handler error: ${err}`);
      }
    });

    // CodeLens mode notification: client tells server which mode is active
    this.connection.onNotification('changetracks/setCodeLensMode', (params: {
        mode: string;
    }) => {
      try {
        const mode = params.mode;
        if (mode === 'cursor' || mode === 'always' || mode === 'off') {
          this.codeLensMode = mode;
          this.connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {});
        } else {
          this.connection.console.warn(`changetracks/setCodeLensMode: ignoring unknown mode "${mode}"`);
        }
      } catch (err) {
        this.connection.console.error(`changetracks/setCodeLensMode handler error: ${err}`);
      }
    });

    // Connect documents to connection
    this.documents.listen(this.connection);
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
  public handleInitialize(params: InitializeParams): InitializeResult {
    // Read reviewer identity from initializationOptions (Sublime, Neovim, and other non-VS Code clients).
    // VS Code sends this via changetracks/updateSettings notification after the client starts.
    const raw = (params.initializationOptions as Record<string, unknown> | undefined)?.changetracks;
    if (isChangetracksInitOptions(raw)) {
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
        // Full document sync - server gets complete document text on every change
        textDocumentSync: TextDocumentSyncKind.Full,
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
        }
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
      watchers: [{ globPattern: '**/.changetracks/config.toml' }]
    });
    this.connection.onDidChangeWatchedFiles((change) => {
      for (const event of change.changes) {
        if (event.uri.endsWith('config.toml')) {
          this.loadProjectConfig();
          // Re-broadcast for all open documents
          for (const uri of this.textCache.keys()) {
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
    for (const t of this.decorationNotifyTimeouts.values()) clearTimeout(t);
    this.decorationNotifyTimeouts.clear();
    if (this.semanticTokenRefreshTimeout) {
      clearTimeout(this.semanticTokenRefreshTimeout);
      this.semanticTokenRefreshTimeout = null;
    }
    this.pendingEditManager.dispose();
    this.parseCache.clear();
    this.textCache.clear();
    this.languageIdCache.clear();
    this.overlayStorage.clear();
    this.viewModeStorage.clear();
  }

  /**
   * Handle LSP exit notification
   * Server should exit after this
   */
  public handleExit(): void {
    for (const t of this.decorationNotifyTimeouts.values()) clearTimeout(t);
    this.decorationNotifyTimeouts.clear();
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
    const parseResult = this.parseCache.get(uri);
    const parseChanges = parseResult ? parseResult.getChanges() : [];
    const overlay = this.overlayStorage.get(uri);
    if (!overlay) return parseChanges;
    const synthetic: ChangeNode = {
      id: overlay.scId ?? 'ct-overlay-0',
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
    // Use existing viewModeStorage (defaults to 'review' when not set)
    const viewMode = this.viewModeStorage.get(uri) ?? 'review';
    sendDocumentState(this.connection, uri, tracking, viewMode);
  }

  /**
   * Load project config from .changetracks/config.toml via canonical parser.
   * Stores full parsed config and extracts tracking default.
   * Sets both to undefined when the config file is absent.
   */
  private loadProjectConfig(): void {
    if (!this.workspaceRoot) return;
    try {
      const configPath = path.join(this.workspaceRoot, '.changetracks', 'config.toml');
      const content = fs.readFileSync(configPath, 'utf-8');
      this.projectConfig = parseConfigToml(content);
      this.projectTrackingDefault = this.projectConfig.tracking.default;
    } catch {
      this.projectConfig = undefined;
      this.projectTrackingDefault = undefined;
    }
  }

  /**
   * Re-send decorationData when overlay changes (Phase 1).
   * Debounced to avoid flooding on rapid overlay updates.
   */
  private scheduleDecorationResend(uri: string): void {
    const existing = this.decorationNotifyTimeouts.get(uri);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(() => {
      this.decorationNotifyTimeouts.delete(uri);
      const changes = this.getMergedChanges(uri);
      sendDecorationData(this.connection, uri, changes);
      sendChangeCount(this.connection, uri, changes);
    }, DECORATION_NOTIFY_DEBOUNCE_MS);
    this.decorationNotifyTimeouts.set(uri, timeout);
  }

  /**
   * Shared logic for document open and change: parse, cache, and send diagnostics.
   * Returns the parse result so callers can send additional notifications.
   */
  private parseAndCacheDocument(uri: string, text: string, languageId?: string): VirtualDocument {
    const parseResult = this.workspace.parse(text, languageId);
    this.parseCache.set(uri, parseResult);
    this.textCache.set(uri, text);
    if (languageId) {
      this.languageIdCache.set(uri, languageId);
    }

    const diagnostics = createDiagnostics(parseResult.getChanges(), text);
    this.connection.sendDiagnostics({ uri, diagnostics });

    return parseResult;
  }

  /**
   * Handle document open event
   * Parse the document and send all notifications immediately (with overlay merge if any).
   */
  public handleDocumentOpen(uri: string, text: string, languageId?: string): void {
    this.parseAndCacheDocument(uri, text, languageId);
    const changes = this.getMergedChanges(uri);
    sendDecorationData(this.connection, uri, changes);
    sendChangeCount(this.connection, uri, changes);
    this.broadcastDocumentState(uri);
  }

  /**
   * Handle document change event
   * Re-parse the document; debounce decoration/changeCount notifications to reduce renderer CPU.
   */
  public handleDocumentChange(uri: string, text: string, languageId?: string): void {
    const previousText = this.textCache.get(uri);
    this.parseAndCacheDocument(uri, text, languageId);

    // Check if tracking header changed
    const headerRegex = /^<!--\s*ctrcks\.com\/v1:\s*(tracked|untracked)\s*-->/m;
    const oldHeader = previousText?.match(headerRegex)?.[1];
    const newHeader = text.match(headerRegex)?.[1];
    if (oldHeader !== newHeader) {
      this.broadcastDocumentState(uri);
    }

    // Debounce decoration/changeCount so we don't flood the client on every keystroke
    const existing = this.decorationNotifyTimeouts.get(uri);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(() => {
      this.decorationNotifyTimeouts.delete(uri);
      const changes = this.getMergedChanges(uri);
      sendDecorationData(this.connection, uri, changes);
      sendChangeCount(this.connection, uri, changes);
    }, DECORATION_NOTIFY_DEBOUNCE_MS);
    this.decorationNotifyTimeouts.set(uri, timeout);
  }

  /**
   * Handle a crystallized edit from the PendingEditManager.
   *
   * Converts the offset-based CrystallizedEdit into an LSP Range and sends
   * a changetracks/pendingEditFlushed notification to the client. The client
   * is responsible for applying the workspace edit to the document.
   *
   * @param edit The crystallized edit with offset coordinates
   */
  private handleCrystallizedEdit(edit: CrystallizedEdit): void {
    const text = this.getDocumentText(edit.uri);
    if (!text) {
      return;
    }

    const range = offsetRangeToLspRange(text, edit.offset, edit.offset + edit.length);
    sendPendingEditFlushed(this.connection, edit.uri, range, edit.newText);
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
      const cursorState = this.cursorStateStorage.get(uri);
      return createCodeLenses(changes, text, viewMode, this.codeLensMode, cursorState);
    } catch (err) {
      this.connection.console.error(`handleCodeLens error: ${err}`);
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
        if (diagnostic.source === 'changetracks') {
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
   * Provides clickable navigation between inline [^ct-N] refs and footnote definitions
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
   * Handle the changetracks/annotate custom request.
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
      const currentText = document?.getText() ?? this.textCache.get(uri);
      if (currentText === undefined) {
        return null;
      }

      const languageId = document?.languageId ?? this.languageIdCache.get(uri);

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
    return this.parseCache.get(uri);
  }

  /**
   * Get the current view mode for a document.
   * Defaults to 'review' if no mode has been explicitly set.
   *
   * @param uri Document URI
   * @returns The active ViewName for this document
   */
  public getViewMode(uri: string): ViewName {
    return this.viewModeStorage.get(uri) ?? 'review';
  }

  /**
   * Handle changetracks/getChanges request (Section 11).
   * Params: { textDocument: { uri: string } }
   * Response: { changes: ChangeNode[] }
   * Reuses getMergedChanges logic. Parses document if not yet cached.
   */
  public handleGetChanges(params: { textDocument: { uri: string } }): { changes: ChangeNode[] } {
    const uri = params.textDocument.uri;
    // Ensure we have parsed content — parse if document is open but not cached
    const doc = this.documents.get(uri);
    if (doc && !this.parseCache.has(uri)) {
      this.parseAndCacheDocument(uri, doc.getText(), doc.languageId);
    }
    const changes = this.getMergedChanges(uri);
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
    return this.documents.get(uri)?.getText() ?? this.textCache.get(uri);
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
   * 2A: changetracks/getProjectConfig
   * Returns project configuration for reason requirements and reviewer identity.
   */
  public handleGetProjectConfig(): {
    reasonRequired: { human: boolean; agent: boolean };
    reviewerIdentity: string | undefined;
  } {
    const review = this.projectConfig?.review ?? DEFAULT_CONFIG.review;
    return {
      reasonRequired: review.reasonRequired,
      reviewerIdentity: this.reviewerIdentity,
    };
  }

  /**
   * 2B: changetracks/reviewChange
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
      return { edit: this.fullDocumentEdit(params.uri, result.updatedContent) };
    } catch (err) {
      this.connection.console.error(`handleReviewChange error: ${err}`);
      return { error: `Review change failed: ${err}` };
    }
  }

  /**
   * 2C: changetracks/replyToThread
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
   * 2D: changetracks/amendChange
   * Amend a proposed change's inline text or reasoning.
   */
  public handleAmendChange(params: {
    uri: string;
    changeId: string;
    newText: string;
    reason?: string;
    author?: string;
  }): { edit: TextEdit } | { error: string } {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };
      const author = params.author ?? this.reviewerIdentity ?? '';
      const result = computeAmendEdits(docText, params.changeId, {
        newText: params.newText,
        reason: params.reason,
        author,
      });
      if (result.isError) return { error: result.error };
      return { edit: this.fullDocumentEdit(params.uri, result.text) };
    } catch (err) {
      this.connection.console.error(`handleAmendChange error: ${err}`);
      return { error: `Amend change failed: ${err}` };
    }
  }

  /**
   * 2E: changetracks/supersedeChange
   * Reject a proposed change and propose a replacement, with cross-references.
   */
  public handleSupersedeChange(params: {
    uri: string;
    changeId: string;
    newText: string;
    reason?: string;
    author?: string;
    oldText?: string;
    insertAfter?: string;
  }): { edit: TextEdit; newChangeId: string } | { error: string } {
    try {
      const docText = this.getDocumentText(params.uri);
      if (!docText) return { error: 'Document not found' };
      const author = params.author ?? this.reviewerIdentity ?? '';
      const result = computeSupersedeResult(docText, params.changeId, {
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
   * 2F: changetracks/resolveThread
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
   * 2F (unresolve): changetracks/unresolveThread
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
   * 2G: changetracks/compactChange
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

        const parser = new CriticMarkupParser();
        const doc = parser.parse(result);
        const changes = doc.getChanges();

        // Find the target L1 change by matching on inlineMetadata fields
        let idx = -1;
        if (preHeader) {
          idx = changes.findIndex((c) =>
            c.level === 1 &&
            c.inlineMetadata?.author === preHeader.author &&
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
}

/**
 * Create and configure a ChangeTracks language server
 *
 * @param connection Optional connection instance (for testing)
 * @returns Configured server instance
 */
export function createServer(connection?: Connection): ChangetracksServer {
  // Create connection using all proposed LSP features if not provided
  const conn = connection || createConnection(ProposedFeatures.all);

  // Create and return server instance
  const server = new ChangetracksServer(conn);

  return server;
}
