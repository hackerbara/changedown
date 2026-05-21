// changedown-plugin/mcp-server/src/transport/streamable-http.ts
//
// MCP Streamable HTTP transport (spec 2025-03-26 / 2025-11-25).
//
// Multi-session strategy:
//   The SDK's Protocol base class enforces "one transport per Server instance"
//   (throws "Already connected to a transport" on a second connect() call).
//   To support concurrent HTTP sessions we create a new Server instance per
//   session, copying all request/notification handlers from the shared template
//   mcpServer via its internal _requestHandlers / _notificationHandlers Maps.
//   Each per-session Server is connected to its own StreamableHTTPServerTransport.
//
// Routes handled:
//   POST /mcp          — initialize (creates session) or method call (routes to session)
//   GET  /mcp/events/:sessionId — SSE stream for server-push (handled by SDK transport)
//
// Pivot from plan: _processRequest does not exist on the SDK Server class.
//   Using StreamableHTTPServerTransport.handleRequest() instead, which is the
//   documented public API.

import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SubscriptionManager } from '../resources/subscription-manager.js';
import type { ResourceNotification } from '../resources/subscription-manager.js';
import type { ClientInfo } from '../author.js';

export interface StreamableHttpHandle {
  detach(): void;
  /**
   * Register a callback invoked when an MCP session closes.
   * Useful for cleaning up subscription state keyed by session ID.
   */
  onSessionClose(cb: (sessionId: string) => void): void;
  /**
   * Register a callback invoked when an MCP session's initialize/initialized
   * handshake completes and clientInfo is available.
   */
  onSessionReady(cb: (sessionId: string) => void): void;
  /**
   * Direct request dispatcher. Use when composing multiple transports onto one
   * http.Server — call this from a single `httpServer.on('request', …)` so the
   * route checks happen exactly once per request. The transport also
   * self-registers via `httpServer.on('request', requestListener)` for
   * standalone callers; both code paths are safe to leave attached.
   */
  handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void;
}

/**
 * Return the clientInfo captured at initialize time for a given session.
 * Returns undefined if the session is unknown or has not completed initialization.
 */
export function getSessionClientInfo(sessionId: string): ClientInfo | undefined {
  return _sessions.get(sessionId)?.clientInfo;
}

/**
 * Return a snapshot of all sessions that have completed initialization
 * and provided a clientInfo name. Keyed by MCP session ID.
 */
export function getAllSessionClientInfos(): Map<string, ClientInfo> {
  const result = new Map<string, ClientInfo>();
  for (const [sid, rec] of _sessions) {
    if (rec.clientInfo !== undefined) {
      result.set(sid, rec.clientInfo);
    }
  }
  return result;
}

/**
 * Module-level sessions map exposed to getSessionClientInfo / getAllSessionClientInfos.
 * Populated by attachStreamableHttp; a single Map is reused across calls because
 * this module is a singleton in the Node process.
 */
const _sessions = new Map<string, SessionRecord>();

interface SessionRecord {
  transport: StreamableHTTPServerTransport;
  server: Server;
  /** MCP clientInfo captured from the initialize request; populated when per-agent author attribution is wired. */
  clientInfo?: ClientInfo;
}

/** Internal shape we duck-type onto Protocol to copy handlers. */
interface ProtocolInternals {
  _requestHandlers: Map<string, unknown>;
  _notificationHandlers: Map<string, unknown>;
  _serverInfo: unknown;
  _capabilities: unknown;
  _instructions: unknown;
}

/** Singleton subscription manager shared across all HTTP sessions for this process. */
export const subManager = new SubscriptionManager({ maxQueuedNotificationsPerSession: 50 });

/** Clone all application-level handlers from a template Server to a fresh one. */
function cloneHandlers(template: Server, target: Server): void {
  const src = template as unknown as ProtocolInternals;
  const dst = target as unknown as ProtocolInternals;

  // Copy every request handler that was registered by the application.
  // Handlers installed internally by the SDK itself (initialize, ping, etc.)
  // are already present on the fresh `target` from its constructor, so we only
  // copy entries that are NOT already set on the target — this avoids
  // overwriting the SDK's own initialize handler.
  for (const [method, handler] of src._requestHandlers) {
    if (!dst._requestHandlers.has(method)) {
      dst._requestHandlers.set(method, handler);
    }
  }

  // Same for notification handlers
  for (const [method, handler] of src._notificationHandlers) {
    if (!dst._notificationHandlers.has(method)) {
      dst._notificationHandlers.set(method, handler);
    }
  }
}

/**
 * Write a single SSE event to a response stream.
 * Returns the result of res.write() — false indicates the write buffer is full
 * (Node.js backpressure signal).
 */
function sendSseEvent(res: http.ServerResponse, event: string, data: string): boolean {
  const payload = `event: ${event}\ndata: ${data}\n\n`;
  return res.write(payload) as boolean;
}

/** SSE response objects keyed by MCP session ID, populated when the GET stream attaches. */
const sessionSseResponses = new Map<string, http.ServerResponse>();

/**
 * Send a resources/updated notification to a specific MCP session via its SSE stream.
 * If the write returns false (buffer full), the session is marked paused in subManager
 * so subsequent fan-outs enqueue rather than drop.
 */
export function sendNotificationToSession(sessionId: string, notification: ResourceNotification): void {
  const sseRes = sessionSseResponses.get(sessionId);
  if (!sseRes) return;
  const ok = sendSseEvent(sseRes, 'message', JSON.stringify(notification));
  if (!ok) {
    subManager.markSessionPaused(sessionId);
  }
}

export async function attachStreamableHttp(
  mcpServer: Server,
  httpServer: http.Server,
): Promise<StreamableHttpHandle> {
  // Use the module-level _sessions map so getSessionClientInfo / getAllSessionClientInfos
  // can access live session state without needing a handle reference.
  const sessions = _sessions;
  const sessionCloseCallbacks: Array<(sessionId: string) => void> = [];
  const sessionReadyCallbacks: Array<(sessionId: string) => void> = [];

  async function handlePost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const sid = req.headers['mcp-session-id'] as string | undefined;

    if (!sid) {
      // No session header → this must be an initialize request.
      // Create a fresh Server instance that mirrors the template's handlers.
      const src = mcpServer as unknown as ProtocolInternals;
      const sessionServer = new Server(
        src._serverInfo as { name: string; version: string },
        { capabilities: src._capabilities as object },
      );
      cloneHandlers(mcpServer, sessionServer);

      // One transport per session; onsessioninitialized fires once the SDK has
      // assigned and confirmed the session ID so we can register it.
      //
      // clientInfo capture strategy: onsessioninitialized runs immediately when
      // the session ID is assigned (during the initialize request, before the
      // response is sent). We stash the sessionId so the oninitialized callback
      // can reference it. oninitialized fires after the client sends the
      // initialized notification, at which point getClientVersion() is populated
      // with the clientInfo that was carried in the initialize request params.
      let pendingSessionId: string | undefined;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSid) => {
          pendingSessionId = newSid;
          sessions.set(newSid, { transport, server: sessionServer });
        },
      });

      // Capture clientInfo after the initialized notification arrives.
      // getClientVersion() is safe to call here because the SDK's internal
      // _oninitialize handler (which sets _clientVersion) runs synchronously
      // during the initialize request, well before the initialized notification.
      sessionServer.oninitialized = () => {
        const sid = pendingSessionId;
        if (!sid) return;
        const raw = sessionServer.getClientVersion();
        if (raw?.name) {
          const rec = sessions.get(sid);
          if (rec) rec.clientInfo = { name: raw.name, version: raw.version };
        }
        for (const cb of sessionReadyCallbacks) {
          try { cb(sid); } catch { /* ignore */ }
        }
      };

      await sessionServer.connect(transport);
      // Set Connection: close before delegating. Hono's autoCleanupIncoming
      // drains the request body after the response finishes; if the body was
      // already consumed it uses a 500ms timer that calls socket.destroySoon(),
      // which would reset the socket before the next keep-alive request arrives.
      // Setting Connection: close tells the client to close and reopen a fresh
      // socket for each request, avoiding that race. SSE responses override this
      // with Connection: keep-alive (set by the SDK transport internally).
      res.setHeader('Connection', 'close');
      await transport.handleRequest(req, res);
      return;
    }

    // Has session header → route to existing session.
    if (!sessions.has(sid)) {
      // Unknown session — drain the request body so the socket isn't stalled,
      // then respond with 400.
      req.resume();
      await new Promise<void>((resolve) => {
        if (req.readableEnded) { resolve(); return; }
        req.once('end', resolve);
        req.once('error', resolve);
      });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Missing or unknown Mcp-Session-Id' },
      }));
      return;
    }

    const { transport } = sessions.get(sid)!;
    res.setHeader('Connection', 'close');
    await transport.handleRequest(req, res);
  }

  async function handleSseGet(req: http.IncomingMessage, res: http.ServerResponse, sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end();
      return;
    }
    // The SDK's WebStandardStreamableHTTPServerTransport validates Mcp-Session-Id
    // via the web Request created by Hono, which reads from IncomingMessage.rawHeaders
    // (not the processed `headers` object). Inject the session ID into both so the
    // SDK's internal validateSession() call sees it.
    if (!req.headers['mcp-session-id']) {
      req.headers['mcp-session-id'] = sessionId;
      (req as http.IncomingMessage & { rawHeaders: string[] }).rawHeaders.push('Mcp-Session-Id', sessionId);
    }

    // Track the SSE response so sendNotificationToSession can find it.
    sessionSseResponses.set(sessionId, res);
    res.on('close', () => {
      sessionSseResponses.delete(sessionId);
      sessions.delete(sessionId);
      // Do NOT call subManager.removeSession here — that's index.ts's responsibility
      // via the onSessionClose callback fired below. Keeping ownership in one place
      // ensures the subManager cleanup always runs together with the
      // uriBackendSubscriptions sweep that follows it in index.ts.
      for (const cb of sessionCloseCallbacks) {
        try { cb(sessionId); } catch { /* ignore */ }
      }
    });

    // When the write buffer drains, resume delivery of any queued notifications.
    res.on('drain', () => {
      subManager.markSessionResumed(sessionId);
      subManager.drain(sessionId, (sid, notification) => {
        sendNotificationToSession(sid, notification);
      });
    });

    // The SDK transport handles the SSE upgrade internally.
    await session.transport.handleRequest(req, res);
  }

  function requestListener(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Guard against double-write when a composed dispatcher (index.ts) has
    // already handled this request before the self-registered listener fires.
    if (res.headersSent || res.writableEnded) return;
    if (process.env.CD_DEBUG_HTTP) {
      process.stderr.write(`[streamable-http] request: ${req.method} ${req.url}\n`);
    }
    // Absorb socket-level ECONNRESET / EPIPE errors that occur when clients
    // disconnect mid-stream (especially SSE). Without this handler the errors
    // bubble up as uncaught exceptions and crash the test runner.
    const noop = () => { /* benign disconnect */ };
    req.socket?.on('error', noop);
    req.on('error', noop);
    res.on('error', noop);

    const url = req.url ?? '';

    if (url === '/mcp' && req.method === 'POST') {
      void handlePost(req, res).catch(() => {
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      });
      return;
    }

    const sseMatch = url.match(/^\/mcp\/events\/([^/]+)$/);
    if (sseMatch && req.method === 'GET') {
      void handleSseGet(req, res, sseMatch[1]!).catch((err: NodeJS.ErrnoException) => {
        const benign = ['ECONNRESET', 'EPIPE', 'ERR_HTTP_HEADERS_SENT'];
        if (!benign.includes(err.code ?? '')) {
          if (!res.headersSent) { res.writeHead(500); res.end(); }
        }
      });
      return;
    }

    if (process.env.CD_DEBUG_HTTP) {
      process.stderr.write(`[streamable-http] no route matched: ${req.method} ${req.url} (response state: headersSent=${res.headersSent}, writableEnded=${res.writableEnded})\n`);
    }
  }

  // Self-registration removed: the composed dispatcher in index.ts owns
  // 'request' routing for the http.Server. Tests / standalone callers
  // register `handleHttpRequest` directly via httpServer.on('request', …).

  return {
    detach() {
      // Close all per-session transports and clear state.
      // Both maps must be cleared: `sessions` holds the SDK transports;
      // `sessionSseResponses` holds the raw ServerResponse objects for SSE
      // connections that may still be open. Without clearing both, stale
      // ServerResponse refs would accumulate if detach runs while SSE
      // connections are alive.
      for (const { transport } of sessions.values()) {
        void transport.close();
      }
      sessions.clear();
      sessionSseResponses.clear();
      sessionCloseCallbacks.length = 0;
      sessionReadyCallbacks.length = 0;
    },

    onSessionClose(cb: (sessionId: string) => void): void {
      sessionCloseCallbacks.push(cb);
    },

    onSessionReady(cb: (sessionId: string) => void): void {
      sessionReadyCallbacks.push(cb);
    },

    handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
      requestListener(req, res);
    },
  };
}
