// changedown-plugin/mcp-server/src/transport/pane-endpoint.ts
import * as http from "node:http";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { version } from "../version.js";
import { SERVICE_NAME } from "./fixed-port-leader.js";
import { SessionRegistry } from "../bridge/session-registry.js";
import type { WordOpEnvelope } from "./word-forwarder.js";
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
  captureOfficeJsNativeSurfaces?: boolean;
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
  /**
   * Endpoint mode. `'host'` = stdio MCP host (default); `'bridge'` = bridge
   * daemon started with `--bridge` flag (no stdio MCP). When set, the `/health`
   * response includes the `mode` field, and bridge mode additionally surfaces
   * `bridgeProtocol: '1'` for autospawn detection.
   */
  mode?: 'host' | 'bridge';
  /**
   * Bridge-only hook to forward a word:// op to the registered MCP session.
   * Required when `mode === 'bridge'` and the bridge accepts inbound word ops
   * via `POST /sessions/:token/word-ops`. The bridge wires this to
   * `forwardWordOp` (see ./word-forwarder.ts).
   */
  onWordOp?: (op: WordOpEnvelope) => Promise<unknown>;
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

const BRIDGE_HEALTH_RESPONSE = {
  ...HEALTH_RESPONSE,
  capabilities: [CAPABILITY_BACKEND_REGISTER],
};

// Module-level MCP session registry — bridge-mode-only state. In stdio-MCP-only
// mode it exists but is unused; the idle reaper queries it via getSessionRegistry().
const sessionRegistry = new SessionRegistry({ idleTimeoutMs: 30 * 60 * 1000 });

/**
 * Returns the module-level session registry. Used by the idle reaper
 * to check registry.size() when deciding whether to shut down.
 */
export function getSessionRegistry(): SessionRegistry {
  return sessionRegistry;
}

// Module-level pane counter. Incremented by handleRegister, decremented by
// removeRegistration. Used by the idle reaper to determine whether
// any Word pane is currently registered with the bridge. Only counts panes
// that have successfully registered — panes that never open their SSE stream
// are pruned after REGISTRATION_STREAM_TTL_MS and the counter is decremented then.
let activePaneCount = 0;

/**
 * Returns the number of currently-registered Word panes. Includes panes that
 * have registered but have not yet (or have lost their) SSE stream connection —
 * the SSE grace period and no-stream TTL handle cleanup asynchronously.
 * Used by the idle reaper to decide whether the bridge should stay alive.
 */
export function getActivePaneCount(): number {
  return activePaneCount;
}

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
  "officejs-evidence": ["officejsEvidenceStages"],
  officejsEvidence: ["officejsEvidenceStages"],
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

  /**
   * Dispatcher for word:// ops arriving at POST /sessions/:token/word-ops.
   * Routes to options.onWordOp when provided by the bridge; throws otherwise.
   */
  function dispatchWordOp(op: unknown): Promise<unknown> {
    if (options.onWordOp) {
      return options.onWordOp(op);
    }
    throw new Error('dispatchWordOp: no onWordOp handler configured (bridge mode only)');
  }

  function recordDebug(record: Omit<PaneRpcDebugRecord, "timestamp">): void {
    debugRecords.push({
      ...record,
      timestamp: new Date().toISOString(),
    });
    if (debugRecords.length > MAX_DEBUG_RECORDS) {
      debugRecords.splice(0, debugRecords.length - MAX_DEBUG_RECORDS);
    }
  }

  function sessionUriForRegistration(reg: PaneRegistration): string {
    return reg.sessionId.includes("://") ? reg.sessionId : `${reg.scheme}://${reg.sessionId}`;
  }

  function sessionUriForPayload(input: {
    scheme?: string;
    sessionId?: string;
  }): string | undefined {
    if (!input.scheme || !input.sessionId) return undefined;
    return input.sessionId.includes("://")
      ? input.sessionId
      : `${input.scheme}://${input.sessionId}`;
  }

  function requestTraceDetail(
    req: http.IncomingMessage,
    body?: string
  ): Record<string, unknown> {
    return {
      method: req.method,
      url: req.url,
      origin: req.headers.origin ?? "(none)",
      remoteAddress: req.socket.remoteAddress,
      contentType: req.headers["content-type"],
      ...(body !== undefined
        ? {
            bodyBytes: Buffer.byteLength(body),
            bodyHash: `sha256:${createHash("sha256")
              .update(body)
              .digest("hex")
              .slice(0, 12)}`,
          }
        : {}),
    };
  }

  function recordActiveLabEndpointTrace(
    phase: string,
    detail: Record<string, unknown> = {},
    sessionUri?: string
  ): void {
    const labDiagnostics = options.labDiagnostics;
    if (!labDiagnostics) return;
    labDiagnostics.recordTrace({
      id: `${phase}:active:${Date.now()}:${randomUUID()}`,
      kind: "pane-endpoint",
      phase,
      at: new Date().toISOString(),
      runId: labDiagnostics.runId,
      sessionUri,
      detail,
    });
  }

  function recordLabEndpointTrace(
    reg: PaneRegistration,
    phase: string,
    detail: Record<string, unknown> = {}
  ): void {
    const labDiagnostics = options.labDiagnostics;
    const runId = reg.lab?.runId;
    if (!labDiagnostics || !runId || runId !== labDiagnostics.runId) return;
    labDiagnostics.recordTrace({
      id: `${phase}:${reg.registrationId}:${Date.now()}`,
      kind: "pane-endpoint",
      phase,
      at: new Date().toISOString(),
      runId,
      sessionUri: sessionUriForRegistration(reg),
      detail: {
        registrationId: reg.registrationId,
        scheme: reg.scheme,
        capabilityCount: reg.capabilities.length,
        hasPollRpc: reg.capabilities.includes("poll-rpc"),
        ...detail,
      },
    });
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
    if (activePaneCount > 0) activePaneCount--;
    options.onUnregister?.(registrationId);
  }

  async function handleRegister(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    let body = "";
    for await (const chunk of req) body += chunk;
    recordActiveLabEndpointTrace("pane-register-attempt", {
      ...requestTraceDetail(req, body),
    });

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
        recordActiveLabEndpointTrace("pane-register-invalid-payload", {
          ...requestTraceDetail(req, body),
          parsedType: parsed === null ? "null" : typeof parsed,
          hasScheme: typeof parsed?.scheme === "string",
          hasSessionId: typeof parsed?.sessionId === "string",
          hasCapabilities: Array.isArray(parsed?.capabilities),
        });
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
      recordActiveLabEndpointTrace("pane-register-invalid-json", {
        ...requestTraceDetail(req, body),
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    const registrationId = randomUUID();
    const payloadSessionUri = sessionUriForPayload(payload);
    recordActiveLabEndpointTrace(
      "pane-register-valid-payload",
      {
        ...requestTraceDetail(req, body),
        registrationId,
        scheme: payload.scheme,
        capabilityCount: payload.capabilities.length,
        hasPollRpc: payload.capabilities.includes("poll-rpc"),
        hasLab: Boolean(payload.lab),
        payloadLabRunId: payload.lab?.runId,
        runMatches: payload.lab?.runId === options.labDiagnostics?.runId,
        labPaneMode: payload.lab?.paneMode,
        hasLabTaskpaneUrl: Boolean(payload.lab?.taskpaneUrl),
        hasRuntime: Boolean(payload.lab?.runtime),
        runtimeRunId: payload.lab?.runtime?.runId,
      },
      payloadSessionUri
    );
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
    activePaneCount++;
    recordLabEndpointTrace(reg, "pane-register-received", {
      labPaneMode: reg.lab?.paneMode,
      bundleMarker: reg.lab?.bundleMarker,
    });

    const disposable = options.onRegister?.(reg);
    if (disposable) reg._disposable = disposable;

    // Prune registrations for panes that never open the SSE stream. If the
    // stream is opened within 30 s, reg.sseRes will be non-null and this is a no-op.
    setTimeout(() => {
      if (!reg.sseRes) removeRegistration(registrationId);
    }, REGISTRATION_STREAM_TTL_MS);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ registrationId, keepaliveMs: KEEPALIVE_MS }));
    recordActiveLabEndpointTrace(
      "pane-register-response-sent-active-lab",
      {
        registrationId,
        hasLab: Boolean(reg.lab),
        payloadLabRunId: reg.lab?.runId,
        runMatches: reg.lab?.runId === options.labDiagnostics?.runId,
        keepaliveMs: KEEPALIVE_MS,
      },
      sessionUriForRegistration(reg)
    );
    recordLabEndpointTrace(reg, "pane-register-response-sent", {
      keepaliveMs: KEEPALIVE_MS,
    });
  }

  function handleStream(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    registrationId: string
  ): void {
    const reg = registrations.get(registrationId);
    recordActiveLabEndpointTrace(
      "pane-stream-attempt",
      {
        ...requestTraceDetail(req),
        registrationId,
        foundRegistration: Boolean(reg),
        hasLab: Boolean(reg?.lab),
        payloadLabRunId: reg?.lab?.runId,
        runMatches: reg?.lab?.runId === options.labDiagnostics?.runId,
        deliveryPath: reg ? deliveryPathForRegistration(reg) : undefined,
      },
      reg ? sessionUriForRegistration(reg) : undefined
    );
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
    recordActiveLabEndpointTrace(
      "pane-stream-open-active-lab",
      {
        registrationId,
        hasLab: Boolean(reg.lab),
        payloadLabRunId: reg.lab?.runId,
        runMatches: reg.lab?.runId === options.labDiagnostics?.runId,
        deliveryPath: deliveryPathForRegistration(reg),
      },
      sessionUriForRegistration(reg)
    );
    recordLabEndpointTrace(reg, "pane-stream-open", {
      deliveryPath: deliveryPathForRegistration(reg),
    });

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
      recordLabEndpointTrace(reg, "pane-stream-close", {
        deliveryPath: deliveryPathForRegistration(reg),
      });
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
      recordLabEndpointTrace(reg, "pane-diagnostics-ingest-failed", {
        status: result.status,
        error: result.error,
      });
      endJson(res, result.status, { error: result.error });
      return;
    }
    recordLabEndpointTrace(reg, "pane-diagnostics-ingest-ok", {
      snapshotKind: snapshot.kind,
      sequence: snapshot.sequence,
      hasL3Summary: Boolean(snapshot.l3Summary),
      hasL3: Boolean(snapshot.l3),
    });

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
      officejsEvidenceStages: labDiagnostics.officeJsEvidenceStages(runId ?? ""),
    };
    endJson(res, 200, filterLabDiagnosticsBody(body, include));
  }

  async function handleLabOfficeJsEvidence(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const labDiagnostics = options.labDiagnostics;
    if (!labDiagnostics) {
      res.writeHead(404);
      res.end();
      return;
    }

    let payload: unknown;
    try {
      payload = await readJsonBody(req);
    } catch {
      endJson(res, 400, { error: "invalid JSON" });
      return;
    }

    const input = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const runId = typeof input.runId === "string" ? input.runId : undefined;
    const officeJsEvidenceToken = typeof input.officejsEvidenceToken === "string"
      ? input.officejsEvidenceToken
      : undefined;
    if (!labDiagnostics.accepts(runId ?? "", officeJsEvidenceToken)) {
      endJson(res, 403, { error: "forbidden" });
      return;
    }

    const { officejsEvidenceToken: _token, officeJsEvidenceToken: _camelToken, ...snapshot } = input;
    const result = labDiagnostics.ingestOfficeJsEvidenceStage({
      ...snapshot,
      runId,
    });
    if (!result.ok) {
      endJson(res, result.status, { error: result.error });
      return;
    }
    res.writeHead(204, { "Cache-Control": "no-cache", Connection: "close" });
    res.end();
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

  /**
   * Lab-only: serve the source DOCX package from the local filesystem.
   * Gated by CHANGEDOWN_LIVE_LAB_RUN_ID + CHANGEDOWN_LIVE_LAB_SOURCE_DOCX_PATH
   * env vars and a matching runId query param. Used by the pane's
   * readLabSourcePackageBase64() to overlay the source DOCX during spike capture
   * without relying on Office.js getFileAsync().
   */
  async function handleLabSourcePackage(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const startedAt = Date.now();
    const configuredRunId = process.env.CHANGEDOWN_LIVE_LAB_RUN_ID;
    const configuredPath = process.env.CHANGEDOWN_LIVE_LAB_SOURCE_DOCX_PATH;
    const parsed = new URL(req.url ?? "", "https://127.0.0.1:39990");
    const requestedRunId = parsed.searchParams.get("runId") ?? undefined;
    const recordSourcePackageTrace = (
      phase: string,
      detail: Record<string, unknown> = {}
    ): void => {
      if (!options.labDiagnostics || !requestedRunId) return;
      options.labDiagnostics.recordTrace({
        id: `${phase}:${requestedRunId}:${Date.now()}`,
        kind: "pane-endpoint",
        phase,
        at: new Date().toISOString(),
        runId: requestedRunId,
        detail,
      });
    };
    recordSourcePackageTrace("lab-source-package-request", {
      configured: Boolean(configuredRunId && configuredPath),
      runMatches: Boolean(configuredRunId && requestedRunId === configuredRunId),
      hasPath: Boolean(configuredPath),
    });
    if (!configuredRunId || requestedRunId !== configuredRunId || !configuredPath) {
      recordSourcePackageTrace("lab-source-package-unavailable", {
        elapsedMs: Date.now() - startedAt,
      });
      endJson(res, 404, { error: "lab source package unavailable" });
      return;
    }
    try {
      const bytes = await readFile(configuredPath);
      const base64 = Buffer.from(bytes).toString("base64");
      recordSourcePackageTrace("lab-source-package-read", {
        elapsedMs: Date.now() - startedAt,
        bytes: bytes.byteLength,
        base64Length: base64.length,
        filename: configuredPath.split(/[\\/]/u).pop() ?? "source.docx",
      });
      endJson(res, 200, {
        runId: configuredRunId,
        filename: configuredPath.split(/[\\/]/u).pop() ?? "source.docx",
        base64,
      });
      recordSourcePackageTrace("lab-source-package-response-sent", {
        elapsedMs: Date.now() - startedAt,
        bytes: bytes.byteLength,
        base64Length: base64.length,
      });
    } catch (error) {
      recordSourcePackageTrace("lab-source-package-error", {
        elapsedMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      endJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    const runAsync = (name: string, task: Promise<void>): void => {
      task.catch((error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        if (err.message === "aborted" || (err as NodeJS.ErrnoException).code === "ECONNRESET") {
          if (process.env.CD_DEBUG_HTTP) {
            process.stderr.write(`[pane-endpoint] ${name} aborted by peer\n`);
          }
          return;
        }
        console.error(`[pane-endpoint] ${name} failed:`, err);
        if (!res.headersSent && !res.writableEnded) {
          endJson(res, 500, { error: err.message });
        }
      });
    };

    // Guard against double-write when a composed dispatcher (index.ts) has
    // already handled this request before the self-registered listener fires.
    if (res.headersSent || res.writableEnded) return;
    if (process.env.CD_DEBUG_HTTP) {
      // Redact MCP session tokens in the URL log: bridge mode routes
      // /sessions/<32-hex-token>/word-ops and the token is a per-session secret.
      const redactedUrl = req.url?.replace(/(\/sessions\/)[a-f0-9]{32}/, '$1[redacted]') ?? '';
      process.stderr.write(
        `[pane-endpoint] request: ${req.method} ${redactedUrl}\n`
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
      runAsync("lab-dom", handleLabDom(req, res));
      return;
    }

    if (url === "/backend/lab/officejs-evidence" || url.startsWith("/backend/lab/officejs-evidence?")) {
      applyCors(req, res);
      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (method !== "POST") {
        res.writeHead(405, { "Allow": "POST", Connection: "close" });
        res.end();
        return;
      }
      runAsync("lab-officejs-evidence", handleLabOfficeJsEvidence(req, res));
      return;
    }

    if (url === "/backend/lab/source-package" || url.startsWith("/backend/lab/source-package?")) {
      applyCors(req, res);
      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (method !== "GET") {
        res.writeHead(405, { "Allow": "GET", Connection: "close" });
        res.end();
        return;
      }
      runAsync("lab-source-package", handleLabSourcePackage(req, res));
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
      // bridgeProtocol is the marker autospawn uses to verify it's talking to
      // a bridge (vs a stale stdio MCP host on the same port).
      const healthBody = options.mode === 'bridge'
        ? { ...BRIDGE_HEALTH_RESPONSE, mode: options.mode, bridgeProtocol: '1' }
        : options.mode !== undefined
          ? { ...HEALTH_RESPONSE, mode: options.mode }
          : HEALTH_RESPONSE;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(healthBody));
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
      runAsync("register", handleRegister(req, res));
      return;
    }

    const streamMatch = url.match(/^\/backend\/stream\/([^/]+)$/);
    if (streamMatch && method === "GET") {
      handleStream(req, res, streamMatch[1]!);
      return;
    }

    const responseMatch = url.match(/^\/backend\/response\/([^/]+)$/);
    if (responseMatch && method === "POST") {
      runAsync("response", handleResponse(req, res, responseMatch[1]!));
      return;
    }

    const traceMatch = url.match(/^\/backend\/trace\/([^/]+)$/);
    if (traceMatch && method === "POST") {
      runAsync("trace", handleLabTrace(req, res, traceMatch[1]!));
      return;
    }

    const notifyMatch = url.match(/^\/backend\/notify\/([^/]+)$/);
    if (notifyMatch && method === "POST") {
      runAsync("notify", handleNotify(req, res, notifyMatch[1]!));
      return;
    }

    const diagnosticsMatch = url.match(/^\/backend\/diagnostics\/([^/]+)$/);
    if (diagnosticsMatch && method === "POST") {
      runAsync("diagnostics", handleDiagnosticsIngest(req, res, diagnosticsMatch[1]!));
      return;
    }

    const pollMatch = url.match(/^\/backend\/poll\/([^/]+)$/);
    if (pollMatch && (method === "GET" || method === "POST")) {
      runAsync("poll", handlePoll(req, res, pollMatch[1]!));
      return;
    }

    // POST /sessions — MCP session registration.
    //   body: { tool: string, pid: number, sessionId: string }
    //   resp: { token: string }
    if (url === "/sessions" && method === "POST") {
      void (async () => {
        let parsed: unknown;
        try {
          parsed = await readJsonBody(req);
        } catch (e) {
          const tooLarge = e instanceof Error && e.message === "request body too large";
          res.writeHead(tooLarge ? 413 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: tooLarge ? "request body too large" : "invalid JSON" }));
          return;
        }
        const p = parsed as { tool?: unknown; pid?: unknown; sessionId?: unknown };
        if (!p.tool || typeof p.tool !== "string" ||
            !Number.isInteger(p.pid) ||
            !p.sessionId || typeof p.sessionId !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "bad body" }));
          return;
        }
        const { token } = sessionRegistry.register({
          tool: p.tool,
          pid: p.pid as number,
          sessionId: p.sessionId,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ token }));
      })();
      return;
    }

    // POST /sessions/:token/word-ops — forward a word:// op via the registered session.
    const wordOpsMatch = url.match(/^\/sessions\/([a-f0-9]{32})\/word-ops$/);
    if (wordOpsMatch && method === "POST") {
      const token = wordOpsMatch[1]!;
      const session = sessionRegistry.lookup(token);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "session not found or expired" }));
        return;
      }
      void (async () => {
        let op: unknown;
        try {
          op = await readJsonBody(req);
        } catch (e) {
          const tooLarge = e instanceof Error && e.message === "request body too large";
          res.writeHead(tooLarge ? 413 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: tooLarge ? "request body too large" : "invalid JSON" }));
          return;
        }
        try {
          const result = await dispatchWordOp(op);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (process.env.CD_DEBUG_HTTP) {
            process.stderr.write(`[word-ops] dispatch error: ${msg}\n`);
          }
          // Return the actual error message in the body. This route only binds
          // 127.0.0.1 and uses a per-session token, so error detail does not
          // leak to remote callers. The calling MCP needs the message to surface
          // a useful error to the agent.
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: msg }));
        }
      })();
      return;
    }

    if (process.env.CD_DEBUG_HTTP) {
      process.stderr.write(
        `[pane-endpoint] no route matched: ${req.method} ${req.url} (response state: headersSent=${res.headersSent}, writableEnded=${res.writableEnded})\n`
      );
    }
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
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
