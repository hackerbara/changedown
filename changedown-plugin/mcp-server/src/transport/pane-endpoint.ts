// changedown-plugin/mcp-server/src/transport/pane-endpoint.ts
import * as http from "node:http";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { version } from "../version.js";
import { SERVICE_NAME } from "./fixed-port-leader.js";
import { AGENTS_UPDATED_METHOD } from "@changedown/core/backend";
import type { BackendEvent } from "@changedown/core/backend";
import type { ClientInfo } from "../author.js";
import type { LabDiagnosticsStore, LabTraceRecord, PaneDevToolsDiagnosticsSnapshot } from "../lab-diagnostics.js";

export const CAPABILITY_BACKEND_REGISTER = "backend-register";
export const CAPABILITY_MCP_STREAMABLE = "mcp-streamable";

/** Public fields visible to external callers. */
export interface PaneRuntimeIdentity {
  protocolVersion: 1;
  runId?: string;
  paneMode?: string;
  bundleMarker?: string;
  taskpaneUrl?: string;
  taskpaneBuildId?: string;
  gitSha?: string;
  buildTimestamp?: string;
  webpackMode?: string;
  loadedAt: string;
  sessionUri: string;
  userAgent?: string;
  officeHost?: string;
  officePlatform?: string;
}

export interface PaneLabMetadata {
  runId?: string;
  bundleMarker?: string;
  paneMode?: string;
  taskpaneUrl?: string;
  runtime?: PaneRuntimeIdentity;
}

export interface PaneRegistrationInfo {
  registrationId: string;
  scheme: string;
  sessionId: string;
  capabilities: string[];
  lab?: PaneLabMetadata;
}

export interface PaneRpcDebugRecord {
  event: "sent" | "response" | "timeout" | "disconnect";
  registrationId: string;
  requestId?: string;
  method?: string;
  deliveryPath?: "sse" | "poll" | "sse+poll" | "unknown";
  runId?: string;
  timestamp: string;
  message?: string;
}

/** A minimal disposable so callers can release resources tied to a registration. */
export interface PaneRegistrationDisposable {
  dispose(): void;
}

export interface PaneEndpointOptions {
  /**
   * Additional exact browser origins allowed to reach the pane backend.
   * Defaults are local Word add-in dev origins plus the hosted pane origin;
   * CHANGEDOWN_PANE_ORIGINS adds comma-separated origins at attach time.
   */
  allowedOrigins?: string[];
  /**
   * Called immediately after a pane successfully registers (before the SSE
   * stream opens). Return a disposable whose `dispose()` will be invoked when
   * the registration is removed (SSE close + grace period elapsed, or
   * `detach()` called).
   */
  onRegister?: (
    info: PaneRegistrationInfo
  ) => PaneRegistrationDisposable | void;
  /**
   * Called after the registration is removed from the in-memory table.
   * `registrationId` matches the value in the `PaneRegistrationInfo` passed
   * to `onRegister`.
   */
  onUnregister?: (registrationId: string) => void;
  /**
   * Per-request timeout (ms) for sendRequest. The pending Promise rejects with
   * a timeout error after this window even if the pane's SSE stream is still
   * open. Default: 30 000 ms. Override in tests for fast assertions.
   */
  requestTimeoutMs?: number;
  /** Live-lab-only diagnostics store. Disabled unless explicitly provided. */
  labDiagnostics?: LabDiagnosticsStore;
}

/** Full internal state, not exported. */
interface PaneRegistration extends PaneRegistrationInfo {
  sseRes: http.ServerResponse | null;
  /** Active keepalive interval handle; null when no SSE stream is open. */
  keepalive: NodeJS.Timeout | null;
  /** Pending requests awaiting a response from the pane. */
  pendingRequests: Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      method: string;
      params: unknown;
      delivered: boolean;
    }
  >;
  pendingPolls: Set<http.ServerResponse>;
  nextRequestId: number;
  _disposable?: PaneRegistrationDisposable;
  /**
   * Cleanup functions for every `onPaneNotification` listener registered
   * against this registrationId. Iterated by `removeRegistration` to avoid
   * leaking handlers on the module-scoped EventEmitter after tear-down.
   */
  _listenerCleanups: Set<() => void>;
}

/** Returned by onPaneNotification — call dispose() to stop listening. */
export interface Disposable {
  dispose(): void;
}

export interface PaneEndpointHandle {
  /** Remove routes from the http.Server. */
  detach(): void;
  /**
   * Send a JSON-RPC request to a registered pane backend.
   * Resolves when the pane POSTs back to /backend/response/:id with the matching id.
   */
  sendRequest(
    registrationId: string,
    method: string,
    params: unknown
  ): Promise<unknown>;
  /**
   * Register a callback invoked whenever the pane POSTs a notification for
   * registrationId.  Returns a Disposable to stop listening.
   *
   * If `registrationId` is not currently registered, returns a no-op Disposable
   * without attaching any handler.  Callers racing pane registration must
   * subscribe after registration completes.
   */
  onPaneNotification(
    registrationId: string,
    cb: (event: BackendEvent) => void
  ): Disposable;
  /**
   * Broadcast an agents_updated message to all connected panes immediately.
   * Called when a session connects, disconnects, or changes edit count.
   * `sessionClientInfos` is the current snapshot from getAllSessionClientInfos().
   */
  broadcastAgentsUpdated(sessionClientInfos: Map<string, ClientInfo>): void;
  /**
   * Increment the edit counter for `sessionId` then broadcast agents_updated.
   * Called after a document-write tool call succeeds.
   * Write tools: propose_change, amend_change, supersede_change.
   */
  incrementEditCount(
    sessionId: string,
    sessionClientInfos: Map<string, ClientInfo>
  ): void;
  /**
   * Remove editCounts entries for sessions that are no longer live.
   * Call on session connect and disconnect — the two events where stale entries
   * can arise. Do NOT call on every edit-count broadcast (no entries go stale
   * during a write).
   */
  pruneEditCounts(liveSessionIds: Map<string, ClientInfo>): void;
  /**
   * Direct request dispatcher. Use when composing multiple transports onto one
   * http.Server — call this from a single `httpServer.on('request', …)` so the
   * route checks happen exactly once per request. The transport also
   * self-registers via `httpServer.on('request', requestListener)` for
   * standalone callers; both code paths are safe to leave attached.
   */
  handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void;
  /** Return recent live-lab RPC lifecycle diagnostics. */
  getDebugRecords?(): PaneRpcDebugRecord[];
}

const HEALTH_RESPONSE = {
  service: SERVICE_NAME,
  version,
  // Surface the leader's PID so port-conflict errors in fixed-port-leader can
  // tell users exactly which process to kill when an incompatible (e.g.
  // wrong-scheme, stale) leader is squatting the port.
  pid: process.pid,
  capabilities: [CAPABILITY_BACKEND_REGISTER, CAPABILITY_MCP_STREAMABLE],
};

const SSE_GRACE_MS = 5_000;
const KEEPALIVE_MS = (() => {
  const env = process.env.CHANGEDOWN_PANE_KEEPALIVE_MS;
  if (!env) return 15_000;
  const parsed = Number.parseInt(env, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
})();
const TEST_CONTROL_ENABLED = process.env.CHANGEDOWN_MCP_TEST_CONTROL === "1";
/**
 * A registration with no SSE stream opened within this window is pruned.
 * Closes the risk of orphaned entries from panes that register but never connect.
 */
const REGISTRATION_STREAM_TTL_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_DEBUG_RECORDS = 500;
const DEFAULT_ALLOWED_PANE_ORIGINS = [
  "https://127.0.0.1:3000",
  "https://localhost:3000",
  "https://changedown.com",
] as const;

function normalizePaneOrigin(value: string): string | undefined {
  const candidate = value.trim();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function parsePaneOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map(normalizePaneOrigin)
    .filter((origin): origin is string => origin !== undefined);
}

function buildAllowedPaneOrigins(options: PaneEndpointOptions): Set<string> {
  return new Set([
    ...DEFAULT_ALLOWED_PANE_ORIGINS,
    ...parsePaneOrigins(process.env.CHANGEDOWN_PANE_ORIGINS),
    ...(options.allowedOrigins ?? [])
      .map(normalizePaneOrigin)
      .filter((origin): origin is string => origin !== undefined),
  ]);
}

function endJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-cache",
    Connection: "close",
  });
  res.end(payload);
}

const LAB_INCLUDE_LATEST_KEYS: Record<string, string[]> = {
  browser: [
    "counters",
    "errors",
    "unhandledRejections",
    "eventSource",
    "performanceResources",
    "mutations",
  ],
  console: ["counters", "console", "errors", "unhandledRejections"],
  network: ["counters", "network", "eventSource"],
  ui: ["ui"],
  domSummary: ["domSummary"],
};

const LAB_INCLUDE_TOP_LEVEL_KEYS: Record<string, string[]> = {
  trace: ["traceRecords"],
  traces: ["traceRecords"],
  queue: ["pane", "tickQueue"],
  apply: ["applyDiagnostics"],
  applyDiagnostics: ["applyDiagnostics"],
  debug: ["debugRecords"],
  debugRecords: ["debugRecords"],
  serverDebugRecords: ["debugRecords"],
};

const LAB_LATEST_METADATA_KEYS = [
  "protocolVersion",
  "kind",
  "runId",
  "sessionUri",
  "capturedAt",
  "sequence",
  "pushReason",
];

function parseLabInclude(value: string | null): Set<string> | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? new Set(parts) : undefined;
}

function filterObjectKeys(source: unknown, keys: Iterable<string>): Record<string, unknown> {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const input = source as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) output[key] = input[key];
  }
  return output;
}

function filterLatestLabDiagnostics(latest: unknown, include: Set<string>): unknown {
  if (!latest || typeof latest !== "object" || Array.isArray(latest)) return latest;
  const keys = new Set<string>(LAB_LATEST_METADATA_KEYS);
  for (const item of include) {
    for (const key of LAB_INCLUDE_LATEST_KEYS[item] ?? []) keys.add(key);
  }
  return filterObjectKeys(latest, keys);
}

function filterLabDiagnosticsBody(body: Record<string, unknown>, include: Set<string> | undefined): Record<string, unknown> {
  if (!include) return body;

  const topLevelKeys = new Set<string>(["runId", "stale", "lastUpdatedAt", "lastSequence", "latest"]);
  for (const item of include) {
    for (const key of LAB_INCLUDE_TOP_LEVEL_KEYS[item] ?? []) topLevelKeys.add(key);
  }

  const filtered = filterObjectKeys(body, topLevelKeys);
  if (Object.prototype.hasOwnProperty.call(filtered, "latest")) {
    filtered.latest = filterLatestLabDiagnostics(filtered.latest, include);
  }
  return filtered;
}

function sanitizePaneLabMetadata(value: unknown): PaneLabMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const lab: PaneLabMetadata = {};
  const runId = pickString(input.runId);
  const bundleMarker = pickString(input.bundleMarker, 100);
  const paneMode = pickString(input.paneMode, 100);
  const taskpaneUrl = pickString(input.taskpaneUrl, 1000);
  const runtime = sanitizePaneRuntimeIdentity(input.runtime);
  if (runId) lab.runId = runId;
  if (bundleMarker) lab.bundleMarker = bundleMarker;
  if (paneMode) lab.paneMode = paneMode;
  if (taskpaneUrl) lab.taskpaneUrl = taskpaneUrl;
  if (runtime) lab.runtime = runtime;
  return Object.keys(lab).length > 0 ? lab : undefined;
}

function pickString(value: unknown, max = 500): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

function sanitizePaneRuntimeIdentity(
  value: unknown
): PaneRuntimeIdentity | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  if (input.protocolVersion !== 1) return undefined;
  const sessionUri = pickString(input.sessionUri, 300);
  const loadedAt = pickString(input.loadedAt, 100);
  if (!sessionUri || !loadedAt) return undefined;
  return {
    protocolVersion: 1,
    runId: pickString(input.runId),
    paneMode: pickString(input.paneMode, 100),
    bundleMarker: pickString(input.bundleMarker, 100),
    taskpaneUrl: pickString(input.taskpaneUrl, 1000),
    taskpaneBuildId: pickString(input.taskpaneBuildId, 200),
    gitSha: pickString(input.gitSha, 80),
    buildTimestamp: pickString(input.buildTimestamp, 100),
    webpackMode: pickString(input.webpackMode, 50),
    loadedAt,
    sessionUri,
    userAgent: pickString(input.userAgent, 500),
    officeHost: pickString(input.officeHost, 100),
    officePlatform: pickString(input.officePlatform, 100),
  };
}

function deliveryPathForRegistration(
  reg: PaneRegistration
): PaneRpcDebugRecord["deliveryPath"] {
  const hasSse = Boolean(reg.sseRes && !reg.sseRes.writableEnded);
  const hasPoll = reg.capabilities.includes("poll-rpc");
  if (hasSse && hasPoll) return "sse+poll";
  if (hasSse) return "sse";
  if (hasPoll) return "poll";
  return "unknown";
}

/**
 * Attaches pane-backend HTTP routes to an existing http.Server.
 *
 * Routes added:
 *   GET  /health                         — leader identity
 *   POST /backend/register               — pane registers its backend
 *   GET  /backend/stream/:registrationId — SSE stream for host→pane RPC
 *   POST /backend/response/:registrationId — pane returns RPC results
 */
export function attachPaneEndpoints(
  httpServer: http.Server,
  options: PaneEndpointOptions = {}
): PaneEndpointHandle {
  const registrations = new Map<string, PaneRegistration>();
  const emitter = new EventEmitter();
  const allowedOrigins = buildAllowedPaneOrigins(options);
  const debugRecords: PaneRpcDebugRecord[] = [];
  let keepalivePaused = false;
  /**
   * Edit counters keyed by MCP session ID (not pane registrationId).
   * Each successful document-write tool call increments the session's counter.
   * Counts accumulate for the lifetime of the session map entry; they are
   * included in every agents_updated broadcast.
   */
  const editCounts = new Map<string, number>();

  function recordDebug(record: Omit<PaneRpcDebugRecord, "timestamp">): void {
    debugRecords.push({
      ...record,
      timestamp: new Date().toISOString(),
    });
    if (debugRecords.length > MAX_DEBUG_RECORDS) {
      debugRecords.splice(0, debugRecords.length - MAX_DEBUG_RECORDS);
    }
  }

  function removeRegistration(registrationId: string): void {
    const reg = registrations.get(registrationId);
    if (!reg) return;
    for (const [requestId, pending] of reg.pendingRequests) {
      recordDebug({
        event: "disconnect",
        registrationId,
        requestId,
        method: pending.method,
        deliveryPath: deliveryPathForRegistration(reg),
        runId: reg.lab?.runId,
        message: "Pane disconnected",
      });
      pending.reject(new Error("Pane disconnected"));
    }
    for (const pollRes of reg.pendingPolls) {
      if (!pollRes.writableEnded) {
        pollRes.writeHead(410, {
          "Content-Type": "application/json",
          Connection: "close",
        });
        pollRes.end(JSON.stringify({ error: "pane disconnected" }));
      }
    }
    reg.pendingPolls.clear();
    if (reg.sseRes && !reg.sseRes.writableEnded) {
      reg.sseRes.end();
    }
    reg.sseRes = null;
    reg._disposable?.dispose();
    // Remove all paneNotification listeners tracked for this registration so
    // they don't accumulate on the module-scoped EventEmitter after tear-down.
    for (const cleanup of reg._listenerCleanups) {
      cleanup();
    }
    reg._listenerCleanups.clear();
    registrations.delete(registrationId);
    options.onUnregister?.(registrationId);
  }

  async function handleRegister(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    let body = "";
    for await (const chunk of req) body += chunk;

    let payload: {
      scheme: string;
      sessionId: string;
      capabilities: string[];
      lab?: PaneLabMetadata;
    };
    try {
      const parsed = JSON.parse(body) as Partial<typeof payload> | null;
      if (
        !parsed ||
        typeof parsed.scheme !== "string" ||
        parsed.scheme.length === 0 ||
        typeof parsed.sessionId !== "string" ||
        parsed.sessionId.length === 0 ||
        !Array.isArray(parsed.capabilities) ||
        !parsed.capabilities.every((capability) => typeof capability === "string")
      ) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid pane registration payload" }));
        return;
      }
      payload = {
        scheme: parsed.scheme,
        sessionId: parsed.sessionId,
        capabilities: parsed.capabilities,
        lab: sanitizePaneLabMetadata(parsed.lab),
      };
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    const registrationId = randomUUID();
    const reg: PaneRegistration = {
      registrationId,
      scheme: payload.scheme,
      sessionId: payload.sessionId,
      capabilities: payload.capabilities,
      lab: payload.lab,
      sseRes: null,
      keepalive: null,
      pendingRequests: new Map(),
      pendingPolls: new Set(),
      nextRequestId: 1,
      _listenerCleanups: new Set(),
    };
    registrations.set(registrationId, reg);

    const disposable = options.onRegister?.(reg);
    if (disposable) reg._disposable = disposable;

    // Prune registrations for panes that never open the SSE stream. If the
    // stream is opened within 30 s, reg.sseRes will be non-null and this is a no-op.
    setTimeout(() => {
      if (!reg.sseRes) removeRegistration(registrationId);
    }, REGISTRATION_STREAM_TTL_MS);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ registrationId, keepaliveMs: KEEPALIVE_MS }));
  }

  function handleStream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    registrationId: string
  ): void {
    const reg = registrations.get(registrationId);
    if (!reg) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // Flush headers immediately so the client's response callback fires without
    // waiting for the first data write.
    res.flushHeaders();

    // If the previous SSE stream for this registration is still mid-close
    // (grace window), its keepalive interval is still firing. Clear it
    // BEFORE we install the new one so we never have two intervals per reg.
    if (reg.keepalive) {
      clearInterval(reg.keepalive);
      reg.keepalive = null;
    }
    reg.sseRes = res;

    // Send a REAL SSE event (not an `: comment`) so `EventSource.onmessage`
    // fires on the client and the pane's keepalive-timeout timer gets reset.
    // Comments don't reach JS — the pane would otherwise time out at
    // KEEPALIVE_TIMEOUT_MS even while the server was sending keepalives.
    res.write('data: {"type":"ping"}\n\n');
    reg.keepalive = setInterval(() => {
      if (!keepalivePaused && !res.writableEnded)
        res.write('data: {"type":"ping"}\n\n');
    }, KEEPALIVE_MS);

    req.on("close", () => {
      if (reg.keepalive) {
        clearInterval(reg.keepalive);
        reg.keepalive = null;
      }
      reg.sseRes = null;
      // Grace period: remove registration after 5 s if no reconnect
      setTimeout(() => {
        if (!reg.sseRes) {
          removeRegistration(registrationId);
        }
      }, SSE_GRACE_MS);
    });
  }

  async function handleResponse(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    registrationId: string
  ): Promise<void> {
    const reg = registrations.get(registrationId);
    if (!reg) {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk;

    const payload = JSON.parse(body) as {
      id: string;
      ok?: boolean;
      result?: unknown;
      error?: unknown;
    };
    const pending = reg.pendingRequests.get(payload.id);
    if (pending) {
      reg.pendingRequests.delete(payload.id);
      recordDebug({
        event: "response",
        registrationId,
        requestId: payload.id,
        method: pending.method,
        deliveryPath: deliveryPathForRegistration(reg),
        runId: reg.lab?.runId,
        message:
          payload.error || payload.ok === false
            ? String(payload.error ?? "Pane indicated failure without error detail")
            : undefined,
      });
      if (payload.error) {
        pending.reject(new Error(String(payload.error)));
      } else if (payload.ok === false) {
        pending.reject(
          new Error("Pane indicated failure without error detail")
        );
      } else {
        pending.resolve(payload.result);
      }
    }

    res.writeHead(200);
    res.end();
  }

  async function handleDiagnosticsIngest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    registrationId: string
  ): Promise<void> {
    const reg = registrations.get(registrationId);
    if (!reg) {
      endJson(res, 404, { error: "unknown registrationId" });
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk;

    let snapshot: PaneDevToolsDiagnosticsSnapshot;
    try {
      snapshot = JSON.parse(body) as PaneDevToolsDiagnosticsSnapshot;
    } catch {
      endJson(res, 400, { error: "invalid JSON" });
      return;
    }

    const result = options.labDiagnostics?.ingestPaneSnapshot(registrationId, snapshot) ?? {
      ok: false as const,
      status: 404,
      error: "lab diagnostics disabled",
    };
    if (!result.ok) {
      endJson(res, result.status, { error: result.error });
      return;
    }

    res.writeHead(204, { Connection: "close" });
    res.end();
  }

  async function handleNotify(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    registrationId: string
  ): Promise<void> {
    const reg = registrations.get(registrationId);
    if (!reg) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown registrationId" }));
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk;

    let payload: { event: BackendEvent };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    if (!payload.event || typeof payload.event !== "object") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "invalid payload: event must be a non-null object",
        })
      );
      return;
    }

    emitter.emit("paneNotification", registrationId, payload.event);
    res.writeHead(204);
    res.end();
  }

  async function readJsonBody(req: http.IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        throw new Error("request body too large");
      }
    }
    return JSON.parse(body) as unknown;
  }

  async function handleLabTrace(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    registrationId: string
  ): Promise<void> {
    const labDiagnostics = options.labDiagnostics;
    if (!labDiagnostics) {
      res.writeHead(404);
      res.end();
      return;
    }

    const reg = registrations.get(registrationId);
    if (!reg) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown registrationId" }));
      return;
    }
    if (reg.lab?.runId !== labDiagnostics.runId) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Connection: "close",
      });
      res.end(JSON.stringify({ error: "registration is not part of active lab run" }));
      return;
    }

    let payload: unknown;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    const input = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const rawRecords = Array.isArray(input.records)
      ? input.records
      : input.record !== undefined
        ? [input.record]
        : [];

    for (const rawRecord of rawRecords) {
      if (!rawRecord || typeof rawRecord !== "object") continue;
      const candidate = rawRecord as Partial<LabTraceRecord> & Record<string, unknown>;
      labDiagnostics.recordTrace({
        id: String(candidate.id ?? `${registrationId}:${Date.now()}`),
        kind: String(candidate.kind ?? "pane"),
        phase: String(candidate.phase ?? "unknown"),
        at: String(candidate.at ?? new Date().toISOString()),
        runId: labDiagnostics.runId,
        sessionUri: typeof candidate.sessionUri === "string" ? candidate.sessionUri : `word://${reg.sessionId}`,
        rpcRequestId: typeof candidate.rpcRequestId === "string" ? candidate.rpcRequestId : undefined,
        applyAttemptId: typeof candidate.applyAttemptId === "string" ? candidate.applyAttemptId : undefined,
        code: typeof candidate.code === "string" ? candidate.code : undefined,
        detail: candidate.detail && typeof candidate.detail === "object" && !Array.isArray(candidate.detail)
          ? (candidate.detail as Record<string, unknown>)
          : undefined,
      });
    }

    res.writeHead(204, { "Cache-Control": "no-cache", Connection: "close" });
    res.end();
  }

  function handleLabDiagnostics(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    const labDiagnostics = options.labDiagnostics;
    if (!labDiagnostics) {
      res.writeHead(404);
      res.end();
      return;
    }

    const parsed = new URL(req.url ?? "/", "http://127.0.0.1");
    const runId = parsed.searchParams.get("runId") ?? undefined;
    const token = req.headers["x-changedown-lab-diagnostics-token"];
    const candidateToken = Array.isArray(token) ? token[0] : token;

    if (!labDiagnostics.accepts(runId ?? "", candidateToken)) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Connection: "close",
      });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }

    const include = parseLabInclude(parsed.searchParams.get("include"));
    const body = {
      ...labDiagnostics.combinedSnapshot(runId ?? "", { includeFullDom: false }),
      debugRecords: debugRecords.map((record) => ({ ...record })),
    };
    endJson(res, 200, filterLabDiagnosticsBody(body, include));
  }


  async function handleLabDom(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const labDiagnostics = options.labDiagnostics;
    if (!labDiagnostics) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.method === "GET") {
      const parsed = new URL(req.url ?? "/", "http://127.0.0.1");
      const runId = parsed.searchParams.get("runId") ?? undefined;
      const token = req.headers["x-changedown-lab-diagnostics-token"];
      const candidateToken = Array.isArray(token) ? token[0] : token;
      if (!labDiagnostics.accepts(runId ?? "", candidateToken)) {
        res.writeHead(403, {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          Connection: "close",
        });
        res.end(JSON.stringify({ error: "forbidden" }));
        return;
      }
      endJson(res, 200, labDiagnostics.latestPaneSnapshot(runId ?? "", { includeFullDom: false }));
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Allow": "GET, POST", Connection: "close" });
      res.end();
      return;
    }

    let payload: unknown;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    const input = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const runId = typeof input.runId === "string" ? input.runId : undefined;
    const token = req.headers["x-changedown-lab-diagnostics-token"];
    const candidateToken = Array.isArray(token) ? token[0] : token;
    if (!labDiagnostics.accepts(runId ?? "", candidateToken)) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Connection: "close",
      });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    if (input.mode === "full" && !labDiagnostics.allowFullDom()) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Connection: "close",
      });
      res.end(JSON.stringify({ error: "full DOM diagnostics disabled" }));
      return;
    }
    endJson(res, 200, labDiagnostics.latestPaneSnapshot(runId ?? "", { includeFullDom: input.mode === "full" }));
  }

  function writePendingPollResponse(
    reg: PaneRegistration,
    res: http.ServerResponse
  ): boolean {
    for (const [id, pending] of reg.pendingRequests) {
      if (pending.delivered) continue;
      if (res.writableEnded) return true;
      pending.delivered = true;
      if (process.env.CD_DEBUG_HTTP) {
        process.stderr.write(
          `[pane-endpoint] poll delivering ${pending.method} id=${id}\n`
        );
      }
      endJson(res, 200, { id, method: pending.method, params: pending.params });
      return true;
    }
    return false;
  }

  function flushPendingPolls(reg: PaneRegistration): void {
    for (const res of [...reg.pendingPolls]) {
      if (writePendingPollResponse(reg, res)) {
        reg.pendingPolls.delete(res);
      }
    }
  }

  async function handlePoll(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    registrationId: string
  ): Promise<void> {
    const reg = registrations.get(registrationId);
    if (!reg) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown registrationId" }));
      return;
    }

    if (writePendingPollResponse(reg, res)) {
      return;
    }

    reg.pendingPolls.add(res);
    const timeout = setTimeout(() => {
      reg.pendingPolls.delete(res);
      if (!res.writableEnded) {
        res.writeHead(204, {
          "Cache-Control": "no-cache",
          "Content-Length": "0",
          Connection: "close",
        });
        res.end();
      }
    }, Math.min(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, 15_000));
    res.on("close", () => {
      clearTimeout(timeout);
      reg.pendingPolls.delete(res);
    });
  }

  /**
   * CORS: the Word pane runs on a separate origin from the loopback backend.
   * Allow only exact configured origins and echo that exact origin back.
   * Never use `*`: this endpoint controls local documents through the pane.
   */
  function applyCors(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    const origin = req.headers.origin;
    const allowed = typeof origin === "string" && allowedOrigins.has(origin);
    if (process.env.CD_DEBUG_HTTP) {
      process.stderr.write(
        `[pane-endpoint] cors origin=${origin ?? "(none)"} allowed=${allowed} method=${req.method ?? ""} url=${req.url ?? ""}
`
      );
    }
    if (!allowed || typeof origin !== "string") return;

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");

    // Chromium/WebKit Private Network Access checks the preflight header, but
    // Office WebView builds have differed here. Echo it on actual loopback
    // responses as well so a successful /health cannot be rejected before the
    // pane proceeds to /backend/register.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }

  function requestListener(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    // Guard against double-write when a composed dispatcher (index.ts) has
    // already handled this request before the self-registered listener fires.
    if (res.headersSent || res.writableEnded) return;
    if (process.env.CD_DEBUG_HTTP) {
      process.stderr.write(
        `[pane-endpoint] request: ${req.method} ${req.url}\n`
      );
    }
    const url = req.url ?? "";
    const method = req.method ?? "";

    // Keep lab diagnostics retrieval same-origin/manual-token only: do not
    // attach pane CORS headers to this endpoint or its preflight.
    if (url === "/backend/lab/diagnostics" || url.startsWith("/backend/lab/diagnostics?")) {
      if (method === "GET") {
        handleLabDiagnostics(req, res);
      } else {
        res.writeHead(405, { "Allow": "GET", Connection: "close" });
        res.end();
      }
      return;
    }

    if (url === "/backend/lab/dom" || url.startsWith("/backend/lab/dom?")) {
      void handleLabDom(req, res);
      return;
    }

    if (url.startsWith("/backend/lab/")) {
      endJson(res, 404, { error: "unknown lab diagnostics route" });
      return;
    }

    applyCors(req, res);

    // Preflight
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url === "/health" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(HEALTH_RESPONSE));
      return;
    }

    if (
      TEST_CONTROL_ENABLED &&
      url === "/__tests__/sse-keepalive/pause" &&
      method === "POST"
    ) {
      keepalivePaused = true;
      res.writeHead(204);
      res.end();
      return;
    }

    if (
      TEST_CONTROL_ENABLED &&
      url === "/__tests__/sse-keepalive/resume" &&
      method === "POST"
    ) {
      keepalivePaused = false;
      res.writeHead(204);
      res.end();
      return;
    }

    if (url === "/backend/register" && method === "POST") {
      if (process.env.CD_DEBUG_HTTP) {
        process.stderr.write(`[pane-endpoint] handling backend register from origin=${req.headers.origin ?? "(none)"}
`);
      }
      void handleRegister(req, res);
      return;
    }

    const streamMatch = url.match(/^\/backend\/stream\/([^/]+)$/);
    if (streamMatch && method === "GET") {
      handleStream(req, res, streamMatch[1]!);
      return;
    }

    const responseMatch = url.match(/^\/backend\/response\/([^/]+)$/);
    if (responseMatch && method === "POST") {
      void handleResponse(req, res, responseMatch[1]!);
      return;
    }

    const traceMatch = url.match(/^\/backend\/trace\/([^/]+)$/);
    if (traceMatch && method === "POST") {
      void handleLabTrace(req, res, traceMatch[1]!);
      return;
    }

    const notifyMatch = url.match(/^\/backend\/notify\/([^/]+)$/);
    if (notifyMatch && method === "POST") {
      void handleNotify(req, res, notifyMatch[1]!);
      return;
    }

    const diagnosticsMatch = url.match(/^\/backend\/diagnostics\/([^/]+)$/);
    if (diagnosticsMatch && method === "POST") {
      void handleDiagnosticsIngest(req, res, diagnosticsMatch[1]!);
      return;
    }

    const pollMatch = url.match(/^\/backend\/poll\/([^/]+)$/);
    if (pollMatch && (method === "GET" || method === "POST")) {
      void handlePoll(req, res, pollMatch[1]!);
      return;
    }

    if (process.env.CD_DEBUG_HTTP) {
      process.stderr.write(
        `[pane-endpoint] no route matched: ${req.method} ${req.url} (response state: headersSent=${res.headersSent}, writableEnded=${res.writableEnded})\n`
      );
    }
  }

  // Self-registration removed: the composed dispatcher in index.ts owns
  // 'request' routing for the http.Server. Tests / standalone callers
  // register `handleHttpRequest` directly via httpServer.on('request', …).
  // (The old additive design — self-listener + composed dispatcher both
  // attached — was racy: handleRegister is async, so the headersSent guard
  // didn't fire fast enough to prevent double-dispatch into writeHead.)

  return {
    detach() {
      for (const id of [...registrations.keys()]) {
        removeRegistration(id);
      }
    },

    async sendRequest(
      registrationId: string,
      method: string,
      params: unknown
    ): Promise<unknown> {
      const reg = registrations.get(registrationId);
      if (!reg) throw new Error(`No registration found: ${registrationId}`);
      const usePollRpc = reg.capabilities.includes("poll-rpc");
      if (!usePollRpc && !reg.sseRes)
        throw new Error(
          `No active SSE stream for registration: ${registrationId}`
        );

      const id = String(reg.nextRequestId++);
      const event = `data: ${JSON.stringify({ id, method, params })}\n\n`;
      const deliveryPath = deliveryPathForRegistration(reg);

      const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
      let timer: NodeJS.Timeout | undefined;

      const responsePromise = new Promise<unknown>((resolve, reject) => {
        reg.pendingRequests.set(id, {
          resolve,
          reject,
          method,
          params,
          delivered: false,
        });
      });
      recordDebug({
        event: "sent",
        registrationId,
        requestId: id,
        method,
        deliveryPath,
        runId: reg.lab?.runId,
      });

      if (reg.sseRes && !reg.sseRes.writableEnded) {
        const wrote = reg.sseRes!.write(event);
        if (process.env.CD_DEBUG_HTTP) {
          process.stderr.write(
            `[pane-endpoint] sendRequest ${method} id=${id} via=sse+${
              usePollRpc ? "poll" : "only"
            } wrote=${wrote} regId=${registrationId}\n`
          );
        }
        if (!wrote && reg.sseRes!.writableEnded) {
          reg.pendingRequests.delete(id);
          throw new Error(
            `SSE stream ended while sending Word bridge request (method: ${method})`
          );
        }
      } else if (!usePollRpc) {
        reg.pendingRequests.delete(id);
        throw new Error(
          `No active SSE stream for registration: ${registrationId}`
        );
      } else if (process.env.CD_DEBUG_HTTP) {
        process.stderr.write(
          `[pane-endpoint] sendRequest ${method} id=${id} via=poll-only regId=${registrationId}\n`
        );
      }
      flushPendingPolls(reg);

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reg.pendingRequests.delete(id);
          recordDebug({
            event: "timeout",
            registrationId,
            requestId: id,
            method,
            deliveryPath,
            runId: reg.lab?.runId,
            message: `Word bridge request timed out after ${timeoutMs} ms (method: ${method})`,
          });
          reject(
            new Error(
              `Word bridge request timed out after ${timeoutMs} ms (method: ${method})`
            )
          );
        }, timeoutMs);
      });

      try {
        const result = await Promise.race([responsePromise, timeoutPromise]);
        return result;
      } finally {
        // pendingRequests entry was already deleted by the winning race path
        // (handleResponse on success, setTimeout callback on timeout).
        if (timer) clearTimeout(timer);
      }
    },

    broadcastAgentsUpdated(sessionClientInfos: Map<string, ClientInfo>): void {
      // Build the agents payload. Order is insertion order of sessionClientInfos,
      // which is whatever getAllSessionClientInfos() iterates — first-seen by session creation.
      const agents = Array.from(sessionClientInfos.entries()).map(
        ([sid, info]) => ({
          sessionId: sid,
          name: info.name,
          editCount: editCounts.get(sid) ?? 0,
        })
      );
      const payload = `data: ${JSON.stringify({
        method: AGENTS_UPDATED_METHOD,
        params: { agents },
      })}\n\n`;

      for (const reg of registrations.values()) {
        // Skip panes whose SSE stream is not open or has already ended.
        if (!reg.sseRes || reg.sseRes.writableEnded) continue;
        reg.sseRes.write(payload);
      }
    },

    incrementEditCount(
      sessionId: string,
      sessionClientInfos: Map<string, ClientInfo>
    ): void {
      editCounts.set(sessionId, (editCounts.get(sessionId) ?? 0) + 1);
      this.broadcastAgentsUpdated(sessionClientInfos);
    },

    pruneEditCounts(liveSessionIds: Map<string, ClientInfo>): void {
      const liveIds = new Set(liveSessionIds.keys());
      for (const sid of editCounts.keys()) {
        if (!liveIds.has(sid)) editCounts.delete(sid);
      }
    },

    handleHttpRequest(
      req: http.IncomingMessage,
      res: http.ServerResponse
    ): void {
      requestListener(req, res);
    },

    getDebugRecords(): PaneRpcDebugRecord[] {
      return debugRecords.map((record) => ({ ...record }));
    },

    /**
     * Register a callback invoked whenever the pane POSTs a notification for
     * the given registrationId.
     *
     * **Important**: if `registrationId` is not currently registered, this
     * method returns a no-op Disposable immediately — no handler is attached to
     * the emitter and `dispose()` is safe to call but does nothing.  Callers
     * that race pane registration must subscribe *after* registration completes.
     */
    onPaneNotification(
      registrationId: string,
      cb: (event: BackendEvent) => void
    ): Disposable {
      const reg = registrations.get(registrationId);

      // Unknown registration — do NOT attach a handler.  Return a no-op
      // Disposable so callers can always safely call dispose().
      if (!reg) {
        return {
          dispose: () => {
            /* no-op: no handler was attached */
          },
        };
      }

      const handler = (id: string, event: BackendEvent) => {
        if (id === registrationId) cb(event);
      };
      emitter.on("paneNotification", handler);

      const cleanup = () => emitter.off("paneNotification", handler);

      // Track the cleanup with the registration so removeRegistration sweeps
      // all listeners when the registration is torn down.
      reg._listenerCleanups.add(cleanup);

      return {
        dispose: () => {
          cleanup();
          // Self-deregister from the tracking set so we don't retain a stale
          // entry in the Set after explicit disposal.
          registrations.get(registrationId)?._listenerCleanups.delete(cleanup);
        },
      };
    },
  };
}
