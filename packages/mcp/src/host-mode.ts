import type { Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  RootsListChangedNotificationSchema,
  McpError,
  ErrorCode,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import {
  buildViewDocument,
  formatPlainText,
} from '@changedown/core';
import { resolveView } from '@changedown/core/host';
import {
  ConfigResolver,
  SessionState,
  handleProposeChange,
  handleBeginChangeGroup,
  handleEndChangeGroup,
  handleReviewChange,
  handleReviewChanges,
  handleRespondToThread,
  handleListOpenThreads,
  handleRawEdit,
  handleGetTrackingStatus,
  handleReadTrackedFile,
  handleGetChange,
  handleAmendChange,
  handleListChanges,
  handleSupersedeChange,
  handleProposeBatch,
  handleResolveThread,
  rerecordState,
  getListedToolsWithConfig,
  resolveProtocolMode,
  makeDefaultRegistry,
  FileBackend,
  errorResult,
} from '@changedown/cli/engine';
import type { DocumentBackend, DocumentSnapshot, ChangeOp } from '@changedown/core/backend';

import {
  attachStreamableHttp,
  subManager,
  sendNotificationToSession,
  getSessionClientInfo,
  getAllSessionClientInfos,
} from './transport/streamable-http.js';
import { synthesizeAuthorFromClientInfo } from './author.js';
import { attachPaneEndpoints } from './transport/pane-endpoint.js';
import { createLabDiagnosticsStore } from './lab-diagnostics.js';
import { createPaneRegistrationCallbacks } from './pane-registration.js';
import { tryBind, prefersHttps, parseMcpPort } from './transport/fixed-port-leader.js';
import { forwardWordOp } from './transport/word-forwarder.js';
import type { WordOpEnvelope } from './transport/word-forwarder.js';
import { ResourceLister } from './resources/resource-lister.js';
import { ResourceReader } from './resources/resource-reader.js';
import { version } from './version.js';
import { applyWordReviewChanges, assertWordSourceMutationCapability, assertWordThreadCapability } from './word-review.js';
import { protocolSourceForRead } from './word-protocol-surface.js';
import { normalizeDocumentTarget } from './document-target.js';
import {
  handleWordListChanges,
  handleWordProposeChange,
  handleWordReadTrackedFile,
} from './word-document-workflow.js';

// ── Bridge routing state ───────────────────────────────────────────────────
// Set by index.ts after a successful autospawn + registerSession.
// When non-null, word:// tool calls route through forwardWordOp to the bridge.
let wordRoutingViaBridge: { port: number; token: string } | null = null;

/** Called by index.ts after autospawn succeeds and a session token is obtained. */
export function setWordRoutingViaBridge(cfg: { port: number; token: string } | null): void {
  wordRoutingViaBridge = cfg;
}

/**
 * Read the current bridge routing config; null when bridge routing is disabled.
 */
export function getWordRoutingViaBridge(): { port: number; token: string } | null {
  return wordRoutingViaBridge;
}

/**
 * Forward a word:// op to the bridge daemon. Centralises the dynamic-import
 * and envelope construction so each tool handler's diff is a single if-block.
 *
 * The op envelope is `{ kind, uri, args }`. The bridge-side `onWordOp`
 * receives this shape and dispatches to the appropriate workflow function.
 */
async function routeWordOp(
  kind: string,
  uri: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!wordRoutingViaBridge) {
    throw new Error('routeWordOp called without bridge config — caller should have checked first');
  }
  return forwardWordOp({
    port: wordRoutingViaBridge.port,
    token: wordRoutingViaBridge.token,
    op: { kind, uri, args },
  });
}

/**
 * Maps tool name → ChangeOp kind for the word:// applyChange path.
 * Shared between runHost (CallToolRequestSchema handler) and bridgeWordOp
 * (bridge-side dispatcher in runBridgeServer).
 */
const kindMap: Record<string, ChangeOp['kind']> = {
  propose_change:   'propose',
  review_changes:   'review',
  amend_change:     'amend',
  supersede_change: 'supersede',
  resolve_thread:   'resolve_thread',
};

/**
 * Returns true when at least one result entry has status_updated === true.
 * Shared between the in-process review_changes path and the bridge path
 * (which re-parses the JSON envelope before calling this).
 */
function hasAnyStatusUpdated(results: unknown): boolean {
  return Array.isArray(results) && results.some(
    (r) => typeof r === 'object' && r !== null && (r as { status_updated?: unknown }).status_updated === true,
  );
}

/** Normalise amend_change argument aliases in-place. */
function normalizeAmendArgs(args: Record<string, unknown>): void {
  args.cnId = args.cnId ?? args.change_id ?? args.changeId;
  args.newText = args.newText ?? args.new_text;
}

function paneRequestTimeoutMs(): number {
  const raw = process.env.CHANGEDOWN_PANE_REQUEST_TIMEOUT_MS;
  if (!raw) return 600_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600_000;
}

/**
 * Decode MCP root URIs (file://) to filesystem paths for the current platform.
 */
function rootUrisToPaths(roots: { uri: string }[]): string[] {
  const paths: string[] = [];
  for (const r of roots) {
    if (!r?.uri || !r.uri.startsWith('file://')) continue;
    try {
      paths.push(fileURLToPath(r.uri));
    } catch {
      // Skip malformed or unsupported URIs
    }
  }
  return paths;
}

/**
 * Host mode: wires up the registry, tool handlers, HTTP transports, and stdio.
 * Takes the already-bound http.Server from bindOrForward so index.ts doesn't
 * need to import the http module directly.
 */
export async function runHost(
  port: number,
  httpServer: HttpServer | undefined,
  stack: AsyncDisposableStack,
): Promise<void> {
  // Disposer 1 (runs last): destroy in-flight sockets, then close the listener.
  if (httpServer) {
    stack.defer(async () => {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });
  }

  let httpHandle: Awaited<ReturnType<typeof attachStreamableHttp>> | undefined;
  let paneHandle: ReturnType<typeof attachPaneEndpoints> | undefined;
  // resolver is assigned synchronously before any request handler fires.
  let resolver: ConfigResolver | undefined;

  const fallbackDir =
    process.env['CHANGEDOWN_PROJECT_DIR'] ||
    process.env['PWD'] ||
    process.cwd();
  resolver = new ConfigResolver(fallbackDir);
  stack.defer(() => { resolver?.dispose(); });
  const state = new SessionState();
  state.enableGuide();

  // Create MCP server
  const server = new Server(
    { name: 'changedown', version },
    { capabilities: { tools: {}, resources: { subscribe: true } } }
  );

  // When the client sends initialized, fetch workspace roots if the host supports MCP roots.
  server.oninitialized = async () => {
    if (!server.getClientCapabilities()?.roots) return;
    try {
      const response = await server.listRoots();
      if (response?.roots?.length) {
        const paths = rootUrisToPaths(response.roots);
        if (paths.length) {
          resolver.setSessionRoots(paths);
          console.error(`changedown: using ${paths.length} workspace root(s) from host`);
        }
      }
    } catch (err) {
      console.error('changedown: failed to fetch MCP roots:', err instanceof Error ? err.message : String(err));
    }
  };

  // When the host notifies that roots changed (e.g. user switched workspace), refresh.
  server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    if (!server.getClientCapabilities()?.roots) return;
    try {
      const response = await server.listRoots();
      if (response?.roots?.length) {
        const paths = rootUrisToPaths(response.roots);
        resolver.setSessionRoots(paths);
        console.error(`changedown: refreshed ${paths.length} workspace root(s)`);
      }
    } catch (err) {
      console.error('changedown: failed to refresh MCP roots:', err instanceof Error ? err.message : String(err));
    }
  });

  // Handle tools/list — enrich tool descriptions from project config so agent sees
  // e.g. "In this project author is required" before first write
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const config = await resolver.lastConfig();
    const mode = resolveProtocolMode(config.protocol.mode);
    return {
      tools: [
        ...getListedToolsWithConfig(config, mode),
      ],
    };
  });

  // ── Tool dispatch ──────────────────────────────────────────────────

  type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

  /**
   * Dispatch a tool call to the appropriate handler and coerce the result
   * to CallToolResult. This eliminates `as Promise<CallToolResult>` casts
   * on every handler call.
   */
  async function dispatchTool(handler: ToolHandler, args: Record<string, unknown>): Promise<CallToolResult> {
    const result = await handler(args);
    return result as CallToolResult;
  }

  // ── Build backend registry ─────────────────────────────────────────────────
  // The registry resolves URIs to the correct backend implementation.
  // file:// → FileBackend; word:// → RemoteBackend (registered at pane connect).
  const registry = makeDefaultRegistry(fallbackDir);

  // ── Backward-compat alias handlers (not in tools/list) ─────────────────────
  // These 9 handlers are file-only (no word:// support in the legacy path).
  // They bypass the registry and call handlers directly.
  const compatHandlers: Record<string, ToolHandler> = {
    get_change:          (a) => handleGetChange(a, resolver),
    propose_batch:       (a) => handleProposeBatch(a, resolver, state),
    begin_change_group:  (a) => handleBeginChangeGroup(a, resolver, state),
    end_change_group:    (a) => handleEndChangeGroup(a, resolver, state),
    review_change:       (a) => handleReviewChange(a, resolver, state),
    respond_to_thread:   (a) => handleRespondToThread(a, resolver, state),
    list_open_threads:   (a) => handleListOpenThreads(a, resolver, state),
    raw_edit:            (a) => handleRawEdit(a, resolver),
    get_tracking_status: (a) => handleGetTrackingStatus(a, resolver, state),
  };

  // ── File-backend write handlers (for the registry-routed file:// path) ─────
  // When the backend resolves to FileBackend, dispatch writes directly to the
  // engine handlers to preserve their full argument surface.
  // (kindMap is defined at module scope so bridgeWordOp in runBridgeServer can
  // also use it without duplication.)

  const fileWriteHandlers: Record<string, ToolHandler> = {
    propose_change:   (a) => handleProposeChange(a, resolver, state),
    review_changes:   (a) => handleReviewChanges(a, resolver, state),
    amend_change:     (a) => handleAmendChange(a, resolver, state),
    supersede_change: (a) => handleSupersedeChange(a, resolver, state),
    resolve_thread:   (a) => handleResolveThread(a, resolver, state),
  };

  server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    // Inject a synthesized author from MCP clientInfo when the caller omits one.
    // Explicit args.author always wins — we only fill the gap when it is absent.
    // The synthesized value is derived from the clientInfo captured at initialize
    // time for this session.
    const mutableArgs: Record<string, unknown> = { ...(args ?? {}) };
    if (!mutableArgs.author) {
      const sessionId = extra?.sessionId;
      if (sessionId) {
        const clientInfo = getSessionClientInfo(sessionId);
        const synthesized = synthesizeAuthorFromClientInfo(clientInfo);
        if (synthesized !== undefined) {
          mutableArgs.author = synthesized;
        }
      }
    }

    const fileArg = mutableArgs.file as string | undefined;

    // Helper: increment the edit counter for this session if all preconditions hold.
    // The success predicate (isError vs applied) is specific to each call site.
    const maybeIncrementEditCount = (sid: string | undefined): void => {
      if (!sid || !paneHandle) return;
      paneHandle.incrementEditCount(sid, getAllSessionClientInfos());
    };

    // ── Registry-routed tools (listed tools that operate on a document) ──────
    // When a file argument is present, resolve the backend via URI scheme and
    // dispatch. Collapses the old isWordTarget() branch: file:// and word://
    // share the same routing path now.
    if (fileArg !== undefined) {
      const target = normalizeDocumentTarget(fileArg, fallbackDir);
      const uri = target.uri;

      let backend: DocumentBackend;
      try {
        backend = registry.resolve(uri);
      } catch (resolveErr) {
        return errorResult(resolveErr instanceof Error ? resolveErr.message : String(resolveErr)) as CallToolResult;
      }
      const fileArgs = backend instanceof FileBackend && uri.startsWith('file://')
        ? { ...mutableArgs, file: target.filePath }
        : mutableArgs;

      switch (name) {
        case 'read_tracked_file': {
          // For file backends, call the handler directly to preserve all the
          // view/offset/limit options. The registry is used only for routing.
          if (backend instanceof FileBackend) {
            return dispatchTool((a) => handleReadTrackedFile(a, resolver, state), fileArgs);
          }
          // word:// path — route through bridge when CHANGEDOWN_BRIDGE_AUTOSPAWN=1.
          if (wordRoutingViaBridge) {
            try {
              const result = await routeWordOp('read_tracked_file', uri, mutableArgs);
              return result as CallToolResult;
            } catch (err) {
              return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
            }
          }
          const config = await resolver.lastConfig();
          return handleWordReadTrackedFile({ backend, uri, args: mutableArgs, config, state });
        }
        case 'list_changes': {
          if (backend instanceof FileBackend) {
            return dispatchTool((a) => handleListChanges(a, resolver, state), fileArgs);
          }
          // word:// path — route through bridge when CHANGEDOWN_BRIDGE_AUTOSPAWN=1.
          if (wordRoutingViaBridge) {
            try {
              const result = await routeWordOp('list_changes', uri, mutableArgs);
              return result as CallToolResult;
            } catch (err) {
              return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
            }
          }
          const config = await resolver.lastConfig();
          return handleWordListChanges({ backend, uri, args: mutableArgs, config, state });
        }
        case 'propose_change':
        case 'review_changes':
        case 'amend_change':
        case 'supersede_change':
        case 'resolve_thread': {
          if (backend instanceof FileBackend) {
            const h = fileWriteHandlers[name];
            if (h) {
              const toolResult = await dispatchTool(h, fileArgs);
              // Increment edit count for document-write tools (not read-only tools).
              // propose_change, amend_change, supersede_change are edits; review_changes
              // is a status update that could go either way — treated as an edit here
              // because it changes the document's review state. resolve_thread resolves
              // a comment thread and is also counted as a document write.
              if (!toolResult.isError) maybeIncrementEditCount(extra?.sessionId);
              return toolResult;
            }
          }
          // word:// write path — route through bridge when CHANGEDOWN_BRIDGE_AUTOSPAWN=1.
          // The bridge's onWordOp handler receives the full mutableArgs so it can
          // apply the same argument normalisation that the in-process path does
          // (e.g. amend_change cnId/newText aliases).
          if (wordRoutingViaBridge) {
            try {
              const result = await routeWordOp(name, uri, mutableArgs);
              const toolResult = result as CallToolResult;
              if (!toolResult.isError) {
                if (name === 'review_changes') {
                  // Match the in-process review_changes path: only increment when
                  // at least one change status was actually updated. Parse the
                  // response text that bridgeWordOp serialised into content[0].
                  try {
                    const text = (toolResult.content[0] as { text?: string })?.text ?? '{}';
                    const parsed = JSON.parse(text) as { results?: unknown };
                    if (hasAnyStatusUpdated(parsed.results)) maybeIncrementEditCount(extra?.sessionId);
                  } catch {
                    // If parsing fails, be conservative and do not increment.
                  }
                } else {
                  maybeIncrementEditCount(extra?.sessionId);
                }
              }
              return toolResult;
            } catch (err) {
              return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
            }
          }
          if (name === 'propose_change') {
            const config = await resolver.lastConfig();
            const result = await handleWordProposeChange({ backend, uri, args: mutableArgs, config, state, labDiagnostics });
            if (!result.isError) maybeIncrementEditCount(extra?.sessionId);
            return result;
          }

          if (name === 'review_changes') {
            try {
              const config = await resolver.lastConfig();
              const response = await applyWordReviewChanges(mutableArgs, backend, uri);
              try {
                const after = await backend.read({ uri });
                await rerecordState(state, uri, after.text, config);
              } catch {
                // Review already completed; state can recover on the next read.
              }
              const anyUpdated = hasAnyStatusUpdated(response.results);
              if (anyUpdated) maybeIncrementEditCount(extra?.sessionId);
              return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] } as CallToolResult;
            } catch (err) {
              return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
            }
          }

          // Other word:// writes still route through applyChange until their
          // own core-first adapter tranches are designed. Keep the public MCP
          // snake_case surface compatible with the pane's internal command
          // shape while those tranches are still backend-routed.
          if (name === 'amend_change') {
            normalizeAmendArgs(mutableArgs);
          }
          if (name === 'resolve_thread') {
            mutableArgs.cnId = mutableArgs.cnId ?? mutableArgs.change_id ?? mutableArgs.changeId;
          }
          const kind = kindMap[name];
          if (!kind) break;
          try {
            if (name === 'amend_change' || name === 'resolve_thread') {
              const changeId = typeof mutableArgs.cnId === 'string' ? mutableArgs.cnId : undefined;
              if (changeId) {
                const snapshot = await backend.read({ uri });
                if (name === 'resolve_thread') {
                  assertWordThreadCapability(snapshot, changeId, mutableArgs.action === 'unresolve' ? 'unresolve' : 'resolve');
                } else {
                  assertWordSourceMutationCapability(snapshot, changeId, name);
                }
              }
            }
            const result = await backend.applyChange({ uri }, { kind, args: mutableArgs });
            // Same edit-count policy for word:// path: only increment on success.
            // ChangeResult.applied is false when the operation did not take effect.
            if (result.applied !== false) maybeIncrementEditCount(extra?.sessionId);
            return {
              content: [{ type: 'text' as const, text: result.text ?? JSON.stringify(result) }],
            } as CallToolResult;
          } catch (err) {
            return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
          }
        }
      }
    }

    // ── Backward-compat aliases (no file arg, or name not registry-routed) ───
    const compatHandler = compatHandlers[name];
    if (compatHandler) {
      return dispatchTool(compatHandler, mutableArgs);
    }

    return errorResult(`Unknown tool: ${name}`) as CallToolResult;
  });

  // ── Resource handlers ──────────────────────────────────────────────────────
  const resourceLister = new ResourceLister(registry);
  const formatSnapshotForAgentRead = async (uri: string, snapshot: DocumentSnapshot): Promise<string> => {
    const config = await resolver.lastConfig();
    const defaultView = resolveView(config.policy.default_view ?? 'working') ?? 'working';
    const protocolMode = resolveProtocolMode(config.protocol.mode);
    const source = uri.startsWith('word://') ? protocolSourceForRead(snapshot).source : snapshot.text;
    const doc = buildViewDocument(source, defaultView, {
      filePath: uri,
      trackingStatus: 'tracked',
      protocolMode,
      defaultView,
      viewPolicy: config.policy.view_policy ?? 'suggest',
    });

    // resources/read should be just as actionable as read_tracked_file: record
    // the returned LINE:HASH coordinates so subsequent propose_change calls
    // against the same word:// URI can validate staleness normally.
    state.recordAfterRead(
      uri,
      defaultView,
      doc.lines.map((l) => ({
        line: l.margin.lineNumber,
        raw: l.sessionHashes.raw,
        committed: l.sessionHashes.committed,
        currentView: l.sessionHashes.currentView,
        rawLineNum: l.rawLineNumber,
      })),
      source,
    );

    return formatPlainText(doc);
  };
  const resourceReader = new ResourceReader(registry, formatSnapshotForAgentRead);

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resourceLister.list() };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request): Promise<Record<string, unknown>> => {
    const { uri } = request.params;
    return resourceReader.read(uri) as unknown as Promise<Record<string, unknown>>;
  });

  // Singleton backend listeners: one per URI so N subscribed agent sessions
  // on the same URI do not trigger N² backend.subscribe() calls.
  // Each value is the Unsubscribe returned by backend.subscribe().
  const uriBackendSubscriptions = new Map<string, () => void>();

  server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
    const { uri } = request.params;
    const sessionId = extra?.sessionId;
    if (!sessionId) {
      throw new McpError(ErrorCode.InvalidRequest, 'Session ID required for subscriptions');
    }
    subManager.subscribe(sessionId, uri);

    // Wire a single backend listener for this URI if none exists yet.
    // This prevents N sessions on one URI from triggering N backend.subscribe() calls.
    if (!uriBackendSubscriptions.has(uri)) {
      let backend: import('@changedown/core/backend').DocumentBackend;
      try {
        backend = registry.resolve(uri);
      } catch {
        return {};
      }
      const unsubscribe = backend.subscribe({ uri }, (event) => {
        subManager.fanOut(uri, (sid, notification) => {
          sendNotificationToSession(sid, notification);
        }, event.kind === 'document_changed' ? event.version : undefined);
      });
      uriBackendSubscriptions.set(uri, unsubscribe);
    }
    return {};
  });

  server.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
    const { uri } = request.params;
    const sessionId = extra?.sessionId;
    if (sessionId) {
      subManager.unsubscribe(sessionId, uri);
      // Tear down the singleton backend listener when no sessions remain subscribed.
      if (subManager.subscribersFor(uri).length === 0) {
        const unsubscribe = uriBackendSubscriptions.get(uri);
        unsubscribe?.();
        uriBackendSubscriptions.delete(uri);
      }
    }
    return {};
  });

  const labDiagnostics = process.env.CHANGEDOWN_LIVE_LAB_RUN_ID
    ? createLabDiagnosticsStore({
        runId: process.env.CHANGEDOWN_LIVE_LAB_RUN_ID,
        token: process.env.CHANGEDOWN_LIVE_LAB_DIAGNOSTICS_TOKEN,
        allowFullDom: process.env.CHANGEDOWN_LIVE_LAB_ALLOW_FULL_DOM === '1',
      })
    : undefined;

  if (httpServer) {
    // Attach pane endpoints (health + backend registration + SSE) to the HTTP
    // server. Callbacks live in pane-registration.ts so the wiring tests
    // exercise the same code path as production.
    paneHandle = attachPaneEndpoints(
      httpServer,
      {
        ...createPaneRegistrationCallbacks(() => paneHandle!, registry),
        requestTimeoutMs: paneRequestTimeoutMs(),
        labDiagnostics,
      },
    );
    stack.defer(() => { paneHandle?.detach(); });

    // Attach MCP Streamable HTTP transport — one Server instance per HTTP session,
    // handlers copied from the template `server` at session creation time.
    httpHandle = await attachStreamableHttp(server, httpServer);
    stack.defer(() => { httpHandle?.detach(); });

    // Composed dispatcher: routes /mcp* requests to the streamable-http handler
    // and everything else to the pane-endpoint handler. This is the canonical
    // request path in production; the two self-registered listeners on paneHandle
    // and httpHandle also remain attached and act as a fallback for standalone
    // test callers. The headersSent/writableEnded guard at the top of each
    // transport's requestListener makes those self-registered listeners no-ops
    // when the composed dispatcher has already responded.
    //
    // Listener fire order (FIFO): pane self-listener → streamable self-listener →
    // composed dispatcher. The guard ensures only the composed dispatcher writes
    // the response; the earlier self-listeners bail immediately on headersSent.
    //
    // Rationale: without this dispatcher, a GET /health request falls through
    // the streamable-http self-listener without a response (no /mcp* match),
    // leaving the socket open and causing curl to report "Empty reply from server".
    httpServer.on('request', (req, res) => {
      const url = req.url ?? '';
      if (url.startsWith('/mcp')) {
        httpHandle!.handleHttpRequest(req, res);
      } else {
        paneHandle!.handleHttpRequest(req, res);
      }
    });

    // When an MCP session's initialize/initialized handshake completes, broadcast
    // the updated agent list to all connected panes.
    httpHandle.onSessionReady(() => {
      const infos = getAllSessionClientInfos();
      paneHandle?.pruneEditCounts(infos);
      paneHandle?.broadcastAgentsUpdated(infos);
    });

    // When an MCP session disconnects, remove its subscriptions, tear down
    // any singleton backend listeners whose subscriber count drops to zero,
    // and broadcast the updated agent list to all panes.
    httpHandle.onSessionClose((sessionId) => {
      subManager.removeSession(sessionId);
      for (const [uri, unsubscribe] of uriBackendSubscriptions) {
        if (subManager.subscribersFor(uri).length === 0) {
          unsubscribe();
          uriBackendSubscriptions.delete(uri);
        }
      }
      const infos = getAllSessionClientInfos();
      paneHandle?.pruneEditCounts(infos);
      paneHandle?.broadcastAgentsUpdated(infos);
    });

  }

  // Connect via stdio transport (parent harness / Claude Code)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  stack.defer(async () => { await server.close(); });

  // Log to stderr (stdout is reserved for JSON-RPC)
  console.error(httpServer
    ? `changedown MCP server running — host on 127.0.0.1:${port}, stdio active`
    : `changedown MCP server running — stdio active, bridge on 127.0.0.1:${port}`
  );
}

// ── Bridge daemon mode ─────────────────────────────────────────────────────
// runBridgeServer starts the HTTPS surface (pane routes + /health) without
// wiring a stdio MCP transport. Used only when started with --bridge flag.
// The existing runHost above is unchanged — this is an additive export.

export interface RunBridgeServerOptions {
  /**
   * Always 'bridge' — host mode uses runHost() directly and does not go
   * through runBridgeServer.
   */
  mode: 'bridge';
}

/**
 * Start the HTTPS server with pane routes and /health, but without a stdio
 * MCP transport. Called from bridge/index.ts when started with --bridge.
 *
 * Resolves when the server closes (signal or idle reaper).
 */
export async function runBridgeServer(opts: RunBridgeServerOptions): Promise<void> {
  const port = parseMcpPort();

  // Determine whether to bind HTTPS or HTTP using the same env-var logic as
  // the production leader-election path.
  const bindWithHttps = prefersHttps();

  // Bind the port. In bridge mode we use a straight listen() without the
  // retryOnEAddrInUse budget — if the port is already taken (another bridge
  // won the race), exit silently. The winning bridge will serve /health.
  let httpServer: HttpServer;
  try {
    httpServer = await tryBind(port, bindWithHttps);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      // Another bridge process won the port race. Exit silently — the winner
      // will serve /health and the MCP that spawned us will poll successfully.
      console.error(`[bridge] port ${port} already bound (EADDRINUSE) — another bridge won; exiting.`);
      return;
    }
    throw err;
  }

  const fallbackDir =
    process.env['CHANGEDOWN_PROJECT_DIR'] ||
    process.env['PWD'] ||
    process.cwd();

  const labDiagnostics = process.env.CHANGEDOWN_LIVE_LAB_RUN_ID
    ? createLabDiagnosticsStore({
        runId: process.env.CHANGEDOWN_LIVE_LAB_RUN_ID,
        token: process.env.CHANGEDOWN_LIVE_LAB_DIAGNOSTICS_TOKEN,
        allowFullDom: process.env.CHANGEDOWN_LIVE_LAB_ALLOW_FULL_DOM === '1',
      })
    : undefined;

  const registry = makeDefaultRegistry(fallbackDir);

  // The bridge needs a ConfigResolver and SessionState to call the same
  // word:// workflow functions that the stdio MCP host calls. These are
  // scoped to the bridge process and are independent of any MCP session.
  const bridgeResolver = new ConfigResolver(fallbackDir);
  const bridgeState = new SessionState();
  // Mirror the enableGuide() call from runHost so guide behaviour is
  // identical for bridge-routed word:// ops and in-process word:// ops.
  bridgeState.enableGuide();

  /**
   * Word-op dispatcher for the bridge. Receives a `{ kind, uri, args }`
   * envelope from MCP tool handlers that are routing through the bridge,
   * calls the same workflow functions used by the in-process word:// path,
   * and returns a CallToolResult-shaped object (JSON-serialisable).
   *
   * The bridge resolves the DocumentBackend from its own registry, which has
   * WordPaneMuxBackend registered once a pane connects via /backend/register.
   */
  async function bridgeWordOp(op: WordOpEnvelope): Promise<unknown> {
    const { kind, uri } = op;
    if (typeof kind !== 'string' || typeof uri !== 'string') {
      throw new Error('bridgeWordOp: invalid op envelope — requires kind:string and uri:string');
    }
    const args: Record<string, unknown> = (op.args !== null && typeof op.args === 'object' && !Array.isArray(op.args))
      ? op.args
      : {};

    let backend: import('@changedown/core/backend').DocumentBackend;
    try {
      backend = registry.resolve(uri);
    } catch (resolveErr) {
      throw new Error(resolveErr instanceof Error ? resolveErr.message : String(resolveErr));
    }

    const config = await bridgeResolver.lastConfig();

    switch (kind) {
      case 'read_tracked_file':
        return handleWordReadTrackedFile({ backend, uri, args, config, state: bridgeState });

      case 'list_changes':
        return handleWordListChanges({ backend, uri, args, config, state: bridgeState });

      case 'propose_change': {
        return handleWordProposeChange({ backend, uri, args, config, state: bridgeState, labDiagnostics });
      }

      case 'review_changes': {
        const response = await applyWordReviewChanges(args, backend, uri);
        try {
          const after = await backend.read({ uri });
          await rerecordState(bridgeState, uri, after.text, config);
        } catch {
          // Review already completed; state can recover on the next read.
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
      }

      case 'amend_change': {
        const amendArgs = { ...args };
        normalizeAmendArgs(amendArgs);
        const changeKind = kindMap['amend_change'];
        if (!changeKind) throw new Error('bridgeWordOp: unknown kindMap entry for amend_change');
        const result = await backend.applyChange({ uri }, { kind: changeKind, args: amendArgs });
        return {
          content: [{ type: 'text' as const, text: result.text ?? JSON.stringify(result) }],
          ...(result.applied === false ? { isError: true } : {}),
        };
      }

      case 'supersede_change':
      case 'resolve_thread': {
        const changeKind = kindMap[kind];
        if (!changeKind) throw new Error(`bridgeWordOp: unknown kindMap entry for ${kind}`);
        const result = await backend.applyChange({ uri }, { kind: changeKind, args });
        return {
          content: [{ type: 'text' as const, text: result.text ?? JSON.stringify(result) }],
          ...(result.applied === false ? { isError: true } : {}),
        };
      }

      default:
        throw new Error(`bridgeWordOp: unknown op kind "${kind}"`);
    }
  }

  let paneHandle: ReturnType<typeof attachPaneEndpoints> | undefined;

  paneHandle = attachPaneEndpoints(httpServer, {
    mode: opts.mode,
    ...createPaneRegistrationCallbacks(() => paneHandle!, registry),
    labDiagnostics,
    onWordOp: bridgeWordOp,
  });

  // Bridge serves only pane endpoints — no stdio MCP transport here.
  // All MCP traffic from coding agents goes to their own runHost() instance.
  httpServer.on('request', (req, res) => {
    paneHandle!.handleHttpRequest(req, res);
  });

  console.error(`changedown bridge daemon running — 127.0.0.1:${port} (${bindWithHttps ? 'https' : 'http'})`);

  // Block until the server closes.
  await new Promise<void>((resolve) => {
    httpServer.on('close', resolve);

    // Clean shutdown on SIGTERM/SIGINT.
    const shutdown = () => {
      console.error('[bridge] shutting down');
      httpServer.closeAllConnections();
      httpServer.close();
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  });

  paneHandle.detach();
}
