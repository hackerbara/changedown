#!/usr/bin/env node

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
  initHashline,
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

import { bindOrForward } from './transport/fixed-port-leader.js';
import {
  attachStreamableHttp,
  subManager,
  sendNotificationToSession,
  getSessionClientInfo,
  getAllSessionClientInfos,
} from './transport/streamable-http.js';
import { synthesizeAuthorFromClientInfo } from './author.js';
import { startClientProxy } from './transport/client-proxy.js';
import { attachPaneEndpoints } from './transport/pane-endpoint.js';
import { createPaneRegistrationCallbacks } from './pane-registration.js';
import { ResourceLister } from './resources/resource-lister.js';
import { ResourceReader } from './resources/resource-reader.js';
import { version } from './version.js';
import { applyWordReviewChanges } from './word-review.js';
import { normalizeDocumentTarget } from './document-target.js';
import {
  handleWordListChanges,
  handleWordProposeChange,
  handleWordReadTrackedFile,
} from './word-document-workflow.js';

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
async function startHostMode(port: number, httpServer: HttpServer): Promise<void> {
  // Register signal handlers immediately — before any awaits — so SIGINT/SIGTERM
  // during cold-start (e.g. the 2 s bridge connect timeout) still shuts down cleanly.
  let httpHandle: Awaited<ReturnType<typeof attachStreamableHttp>> | undefined;
  let paneHandle: ReturnType<typeof attachPaneEndpoints> | undefined;
  // resolver is assigned synchronously before any request handler fires.
  // The shutdown closure guards with (resolver as ConfigResolver | undefined)?.dispose()
  // in case SIGINT arrives before the synchronous assignment.
  let resolver: ConfigResolver | undefined;

  let shutdownCalled = false;
  function shutdown(signal: string): void {
    if (shutdownCalled) return;
    shutdownCalled = true;
    console.error(`[changedown] ${signal} received — draining 250 ms then exiting`);
    httpHandle?.detach();
    paneHandle?.detach();
    resolver?.dispose();
    setTimeout(() => {
      httpServer.close(() => process.exit(0));
      // SSE streams can keep sockets open after detach while the browser tears
      // down. Do not let a test or parent process leave the fixed port pinned.
      setTimeout(() => process.exit(0), 1000).unref();
    }, 250);
  }
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  const fallbackDir =
    process.env['CHANGEDOWN_PROJECT_DIR'] ||
    process.env['PWD'] ||
    process.cwd();
  resolver = new ConfigResolver(fallbackDir);
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
    return { tools: getListedToolsWithConfig(config, mode) };
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
  const kindMap: Record<string, ChangeOp['kind']> = {
    propose_change:   'propose',
    review_changes:   'review',
    amend_change:     'amend',
    supersede_change: 'supersede',
    resolve_thread:   'resolve_thread',
  };

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
          const config = await resolver.lastConfig();
          return handleWordReadTrackedFile({ backend, uri, args: mutableArgs, config, state });
        }
        case 'list_changes': {
          if (backend instanceof FileBackend) {
            return dispatchTool((a) => handleListChanges(a, resolver, state), fileArgs);
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
          if (name === 'propose_change') {
            const config = await resolver.lastConfig();
            const result = await handleWordProposeChange({ backend, uri, args: mutableArgs, config, state });
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
              const anyUpdated = Array.isArray(response.results) && response.results.some((r) => {
                return typeof r === 'object' && r !== null && (r as { status_updated?: unknown }).status_updated === true;
              });
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
            mutableArgs.cnId = mutableArgs.cnId ?? mutableArgs.change_id ?? mutableArgs.changeId;
            mutableArgs.newText = mutableArgs.newText ?? mutableArgs.new_text;
          }
          const kind = kindMap[name];
          if (!kind) break;
          try {
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
    const doc = buildViewDocument(snapshot.text, defaultView, {
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
      snapshot.text,
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

  // Attach pane endpoints (health + backend registration + SSE) to the HTTP
  // server. Callbacks live in pane-registration.ts so the wiring tests
  // exercise the same code path as production.
  paneHandle = attachPaneEndpoints(
    httpServer,
    {
      ...createPaneRegistrationCallbacks(() => paneHandle!, registry),
      requestTimeoutMs: paneRequestTimeoutMs(),
    },
  );

  // Attach MCP Streamable HTTP transport — one Server instance per HTTP session,
  // handlers copied from the template `server` at session creation time.
  httpHandle = await attachStreamableHttp(server, httpServer);

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

  // Connect via stdio transport (parent harness / Claude Code)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean up on stdio transport close (parent harness disconnects)
  server.onclose = () => {
    shutdown('stdio-close');
    // Registry has no subscribers in this tranche. Once MCP resources/list
    // or any other consumer calls registry.onDidChange, its disposers must
    // also be invoked here to avoid orphaned listeners.
  };

  // Log to stderr (stdout is reserved for JSON-RPC)
  console.error(`changedown MCP server running — host on 127.0.0.1:${port}, stdio active`);
}

/**
 * ChangeDown MCP Server
 *
 * Performs leader election on port 39990. If this process wins the port it
 * becomes the host: wires the full registry + tool dispatch, attaches MCP
 * Streamable HTTP and pane endpoints, and serves Claude Code over stdio.
 *
 * If the port is already held by another changedown-mcp process this process
 * becomes a client: it forwards all stdio traffic to the host via HTTP and
 * starts a heartbeat to promote itself if the host dies.
 */
async function main(): Promise<void> {
  await initHashline();

  const PORT = Number.parseInt(process.env.CHANGEDOWN_MCP_PORT ?? '39990', 10);
  if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
    throw new Error(`Invalid CHANGEDOWN_MCP_PORT: ${process.env.CHANGEDOWN_MCP_PORT}`);
  }
  const leaderResult = await bindOrForward(PORT);

  if (leaderResult.mode === 'client') {
    console.error(`[changedown] client mode — forwarding to ${leaderResult.hostUrl}`);
    const proxy = await startClientProxy({ hostUrl: leaderResult.hostUrl });

    // Heartbeat + promotion: if host dies, try to become host ourselves.
    void leaderResult.startHeartbeat({ intervalMs: 1500, failThreshold: 3 }).then(async (promoted) => {
      console.error('[changedown] host died — promoted to host mode');
      proxy.stop();
      if (promoted.mode === 'host') {
        await startHostMode(PORT, promoted.server);
      }
    });

    proxy.onClose(() => process.exit(0));
    return;
  }

  await startHostMode(PORT, leaderResult.server);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
