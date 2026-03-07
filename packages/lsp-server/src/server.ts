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
  DidChangeWatchedFilesNotification
} from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Workspace, VirtualDocument, ChangeNode, ChangeType, ChangeStatus, annotateMarkdown, annotateSidecar, SIDECAR_BLOCK_MARKER, VIEW_NAMES } from '@changetracks/core';
import type { ViewName } from '@changetracks/core';
import { getWorkspaceRoot, getPreviousVersion, PreviousVersionResult } from './git';
import { createHover } from './capabilities/hover';
import { createCodeLenses } from './capabilities/code-lens';
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
  /** Workspace root path for config file resolution. */
  private workspaceRoot: string | undefined;

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
        }, 50);
      } catch (err) {
        this.connection.console.error(`changetracks/setViewMode handler error: ${err}`);
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
    const text = this.textCache.get(uri);
    if (!text) return;
    const tracking = resolveTracking(text, this.projectTrackingDefault);
    // Use existing viewModeStorage (defaults to 'review' when not set)
    const viewMode = this.viewModeStorage.get(uri) ?? 'review';
    sendDocumentState(this.connection, uri, tracking, viewMode);
  }

  /**
   * Load project tracking default from .changetracks/config.toml.
   * Performs minimal TOML parsing for the tracking.default key.
   * Sets projectTrackingDefault to undefined when the config file is absent.
   */
  private loadProjectConfig(): void {
    if (!this.workspaceRoot) return;
    try {
      const configPath = path.join(this.workspaceRoot, '.changetracks', 'config.toml');
      const content = fs.readFileSync(configPath, 'utf-8');
      // Minimal TOML parsing for tracking.default
      const trackingMatch = content.match(/\[tracking\][\s\S]*?default\s*=\s*"(tracked|untracked)"/);
      if (trackingMatch) {
        this.projectTrackingDefault = trackingMatch[1];
      }
    } catch {
      // Config file doesn't exist — use defaults
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
    const text = this.textCache.get(edit.uri);
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

      const text = this.textCache.get(uri);
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
      const text = this.textCache.get(uri);
      if (!text) {
        return [];
      }
      const changes = this.getMergedChanges(uri);
      return createCodeLenses(changes, text);
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
      const text = this.textCache.get(uri);
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
