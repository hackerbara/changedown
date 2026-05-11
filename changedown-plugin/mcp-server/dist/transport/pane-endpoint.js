// src/transport/pane-endpoint.ts
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

// src/version.ts
var version = "0.4.6";

// src/transport/fixed-port-leader.ts
var SERVICE_NAME = "changedown-mcp";

// ../../packages/core/dist-esm/backend/types.js
var AGENTS_UPDATED_METHOD = "agents_updated";

// src/transport/pane-endpoint.ts
var CAPABILITY_BACKEND_REGISTER = "backend-register";
var CAPABILITY_MCP_STREAMABLE = "mcp-streamable";
var HEALTH_RESPONSE = {
  service: SERVICE_NAME,
  version,
  // Surface the leader's PID so port-conflict errors in fixed-port-leader can
  // tell users exactly which process to kill when an incompatible (e.g.
  // wrong-scheme, stale) leader is squatting the port.
  pid: process.pid,
  capabilities: [CAPABILITY_BACKEND_REGISTER, CAPABILITY_MCP_STREAMABLE]
};
var SSE_GRACE_MS = 5e3;
var KEEPALIVE_MS = (() => {
  const env = process.env.CHANGEDOWN_PANE_KEEPALIVE_MS;
  if (!env) return 15e3;
  const parsed = Number.parseInt(env, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15e3;
})();
var TEST_CONTROL_ENABLED = process.env.CHANGEDOWN_MCP_TEST_CONTROL === "1";
var REGISTRATION_STREAM_TTL_MS = 3e4;
var DEFAULT_REQUEST_TIMEOUT_MS = 3e4;
var MAX_DEBUG_RECORDS = 500;
var DEFAULT_ALLOWED_PANE_ORIGINS = [
  "https://127.0.0.1:3000",
  "https://localhost:3000",
  "https://changedown.com"
];
function normalizePaneOrigin(value) {
  const candidate = value.trim();
  if (!candidate) return void 0;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
    return url.origin;
  } catch {
    return void 0;
  }
}
function parsePaneOrigins(value) {
  if (!value) return [];
  return value.split(",").map(normalizePaneOrigin).filter((origin) => origin !== void 0);
}
function buildAllowedPaneOrigins(options) {
  return /* @__PURE__ */ new Set([
    ...DEFAULT_ALLOWED_PANE_ORIGINS,
    ...parsePaneOrigins(process.env.CHANGEDOWN_PANE_ORIGINS),
    ...(options.allowedOrigins ?? []).map(normalizePaneOrigin).filter((origin) => origin !== void 0)
  ]);
}
function endJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-cache",
    Connection: "close"
  });
  res.end(payload);
}
var LAB_INCLUDE_LATEST_KEYS = {
  browser: [
    "counters",
    "errors",
    "unhandledRejections",
    "eventSource",
    "performanceResources",
    "mutations"
  ],
  console: ["counters", "console", "errors", "unhandledRejections"],
  network: ["counters", "network", "eventSource"],
  ui: ["ui"],
  domSummary: ["domSummary"]
};
var LAB_INCLUDE_TOP_LEVEL_KEYS = {
  trace: ["traceRecords"],
  traces: ["traceRecords"],
  queue: ["pane", "tickQueue"],
  apply: ["applyDiagnostics"],
  applyDiagnostics: ["applyDiagnostics"],
  debug: ["debugRecords"],
  debugRecords: ["debugRecords"],
  serverDebugRecords: ["debugRecords"]
};
var LAB_LATEST_METADATA_KEYS = [
  "protocolVersion",
  "kind",
  "runId",
  "sessionUri",
  "capturedAt",
  "sequence",
  "pushReason"
];
function parseLabInclude(value) {
  if (!value) return void 0;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? new Set(parts) : void 0;
}
function filterObjectKeys(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const input = source;
  const output = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) output[key] = input[key];
  }
  return output;
}
function filterLatestLabDiagnostics(latest, include) {
  if (!latest || typeof latest !== "object" || Array.isArray(latest)) return latest;
  const keys = new Set(LAB_LATEST_METADATA_KEYS);
  for (const item of include) {
    for (const key of LAB_INCLUDE_LATEST_KEYS[item] ?? []) keys.add(key);
  }
  return filterObjectKeys(latest, keys);
}
function filterLabDiagnosticsBody(body, include) {
  if (!include) return body;
  const topLevelKeys = /* @__PURE__ */ new Set(["runId", "stale", "lastUpdatedAt", "lastSequence", "latest"]);
  for (const item of include) {
    for (const key of LAB_INCLUDE_TOP_LEVEL_KEYS[item] ?? []) topLevelKeys.add(key);
  }
  const filtered = filterObjectKeys(body, topLevelKeys);
  if (Object.prototype.hasOwnProperty.call(filtered, "latest")) {
    filtered.latest = filterLatestLabDiagnostics(filtered.latest, include);
  }
  return filtered;
}
function sanitizePaneLabMetadata(value) {
  if (!value || typeof value !== "object") return void 0;
  const input = value;
  const lab = {};
  const runId = pickString(input.runId);
  const bundleMarker = pickString(input.bundleMarker, 100);
  const paneMode = pickString(input.paneMode, 100);
  const taskpaneUrl = pickString(input.taskpaneUrl, 1e3);
  const runtime = sanitizePaneRuntimeIdentity(input.runtime);
  if (runId) lab.runId = runId;
  if (bundleMarker) lab.bundleMarker = bundleMarker;
  if (paneMode) lab.paneMode = paneMode;
  if (taskpaneUrl) lab.taskpaneUrl = taskpaneUrl;
  if (runtime) lab.runtime = runtime;
  return Object.keys(lab).length > 0 ? lab : void 0;
}
function pickString(value, max = 500) {
  return typeof value === "string" ? value.slice(0, max) : void 0;
}
function sanitizePaneRuntimeIdentity(value) {
  if (!value || typeof value !== "object") return void 0;
  const input = value;
  if (input.protocolVersion !== 1) return void 0;
  const sessionUri = pickString(input.sessionUri, 300);
  const loadedAt = pickString(input.loadedAt, 100);
  if (!sessionUri || !loadedAt) return void 0;
  return {
    protocolVersion: 1,
    runId: pickString(input.runId),
    paneMode: pickString(input.paneMode, 100),
    bundleMarker: pickString(input.bundleMarker, 100),
    taskpaneUrl: pickString(input.taskpaneUrl, 1e3),
    taskpaneBuildId: pickString(input.taskpaneBuildId, 200),
    gitSha: pickString(input.gitSha, 80),
    buildTimestamp: pickString(input.buildTimestamp, 100),
    webpackMode: pickString(input.webpackMode, 50),
    loadedAt,
    sessionUri,
    userAgent: pickString(input.userAgent, 500),
    officeHost: pickString(input.officeHost, 100),
    officePlatform: pickString(input.officePlatform, 100)
  };
}
function deliveryPathForRegistration(reg) {
  const hasSse = Boolean(reg.sseRes && !reg.sseRes.writableEnded);
  const hasPoll = reg.capabilities.includes("poll-rpc");
  if (hasSse && hasPoll) return "sse+poll";
  if (hasSse) return "sse";
  if (hasPoll) return "poll";
  return "unknown";
}
function attachPaneEndpoints(httpServer, options = {}) {
  const registrations = /* @__PURE__ */ new Map();
  const emitter = new EventEmitter();
  const allowedOrigins = buildAllowedPaneOrigins(options);
  const debugRecords = [];
  let keepalivePaused = false;
  const editCounts = /* @__PURE__ */ new Map();
  function recordDebug(record) {
    debugRecords.push({
      ...record,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (debugRecords.length > MAX_DEBUG_RECORDS) {
      debugRecords.splice(0, debugRecords.length - MAX_DEBUG_RECORDS);
    }
  }
  function removeRegistration(registrationId) {
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
        message: "Pane disconnected"
      });
      pending.reject(new Error("Pane disconnected"));
    }
    for (const pollRes of reg.pendingPolls) {
      if (!pollRes.writableEnded) {
        pollRes.writeHead(410, {
          "Content-Type": "application/json",
          Connection: "close"
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
    for (const cleanup of reg._listenerCleanups) {
      cleanup();
    }
    reg._listenerCleanups.clear();
    registrations.delete(registrationId);
    options.onUnregister?.(registrationId);
  }
  async function handleRegister(req, res) {
    let body = "";
    for await (const chunk of req) body += chunk;
    let payload;
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed.scheme !== "string" || parsed.scheme.length === 0 || typeof parsed.sessionId !== "string" || parsed.sessionId.length === 0 || !Array.isArray(parsed.capabilities) || !parsed.capabilities.every((capability) => typeof capability === "string")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid pane registration payload" }));
        return;
      }
      payload = {
        scheme: parsed.scheme,
        sessionId: parsed.sessionId,
        capabilities: parsed.capabilities,
        lab: sanitizePaneLabMetadata(parsed.lab)
      };
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }
    const registrationId = randomUUID();
    const reg = {
      registrationId,
      scheme: payload.scheme,
      sessionId: payload.sessionId,
      capabilities: payload.capabilities,
      lab: payload.lab,
      sseRes: null,
      keepalive: null,
      pendingRequests: /* @__PURE__ */ new Map(),
      pendingPolls: /* @__PURE__ */ new Set(),
      nextRequestId: 1,
      _listenerCleanups: /* @__PURE__ */ new Set()
    };
    registrations.set(registrationId, reg);
    const disposable = options.onRegister?.(reg);
    if (disposable) reg._disposable = disposable;
    setTimeout(() => {
      if (!reg.sseRes) removeRegistration(registrationId);
    }, REGISTRATION_STREAM_TTL_MS);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ registrationId, keepaliveMs: KEEPALIVE_MS }));
  }
  function handleStream(req, res, registrationId) {
    const reg = registrations.get(registrationId);
    if (!reg) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.flushHeaders();
    if (reg.keepalive) {
      clearInterval(reg.keepalive);
      reg.keepalive = null;
    }
    reg.sseRes = res;
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
      setTimeout(() => {
        if (!reg.sseRes) {
          removeRegistration(registrationId);
        }
      }, SSE_GRACE_MS);
    });
  }
  async function handleResponse(req, res, registrationId) {
    const reg = registrations.get(registrationId);
    if (!reg) {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
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
        message: payload.error || payload.ok === false ? String(payload.error ?? "Pane indicated failure without error detail") : void 0
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
  async function handleDiagnosticsIngest(req, res, registrationId) {
    const reg = registrations.get(registrationId);
    if (!reg) {
      endJson(res, 404, { error: "unknown registrationId" });
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let snapshot;
    try {
      snapshot = JSON.parse(body);
    } catch {
      endJson(res, 400, { error: "invalid JSON" });
      return;
    }
    const result = options.labDiagnostics?.ingestPaneSnapshot(registrationId, snapshot) ?? {
      ok: false,
      status: 404,
      error: "lab diagnostics disabled"
    };
    if (!result.ok) {
      endJson(res, result.status, { error: result.error });
      return;
    }
    res.writeHead(204, { Connection: "close" });
    res.end();
  }
  async function handleNotify(req, res, registrationId) {
    const reg = registrations.get(registrationId);
    if (!reg) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown registrationId" }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }
    if (!payload.event || typeof payload.event !== "object") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "invalid payload: event must be a non-null object"
        })
      );
      return;
    }
    emitter.emit("paneNotification", registrationId, payload.event);
    res.writeHead(204);
    res.end();
  }
  async function readJsonBody(req, maxBytes = 1e6) {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        throw new Error("request body too large");
      }
    }
    return JSON.parse(body);
  }
  async function handleLabTrace(req, res, registrationId) {
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
        Connection: "close"
      });
      res.end(JSON.stringify({ error: "registration is not part of active lab run" }));
      return;
    }
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }
    const input = payload && typeof payload === "object" ? payload : {};
    const rawRecords = Array.isArray(input.records) ? input.records : input.record !== void 0 ? [input.record] : [];
    for (const rawRecord of rawRecords) {
      if (!rawRecord || typeof rawRecord !== "object") continue;
      const candidate = rawRecord;
      labDiagnostics.recordTrace({
        id: String(candidate.id ?? `${registrationId}:${Date.now()}`),
        kind: String(candidate.kind ?? "pane"),
        phase: String(candidate.phase ?? "unknown"),
        at: String(candidate.at ?? (/* @__PURE__ */ new Date()).toISOString()),
        runId: labDiagnostics.runId,
        sessionUri: typeof candidate.sessionUri === "string" ? candidate.sessionUri : `word://${reg.sessionId}`,
        rpcRequestId: typeof candidate.rpcRequestId === "string" ? candidate.rpcRequestId : void 0,
        applyAttemptId: typeof candidate.applyAttemptId === "string" ? candidate.applyAttemptId : void 0,
        code: typeof candidate.code === "string" ? candidate.code : void 0,
        detail: candidate.detail && typeof candidate.detail === "object" && !Array.isArray(candidate.detail) ? candidate.detail : void 0
      });
    }
    res.writeHead(204, { "Cache-Control": "no-cache", Connection: "close" });
    res.end();
  }
  function handleLabDiagnostics(req, res) {
    const labDiagnostics = options.labDiagnostics;
    if (!labDiagnostics) {
      res.writeHead(404);
      res.end();
      return;
    }
    const parsed = new URL(req.url ?? "/", "http://127.0.0.1");
    const runId = parsed.searchParams.get("runId") ?? void 0;
    const token = req.headers["x-changedown-lab-diagnostics-token"];
    const candidateToken = Array.isArray(token) ? token[0] : token;
    if (!labDiagnostics.accepts(runId ?? "", candidateToken)) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Connection: "close"
      });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    const include = parseLabInclude(parsed.searchParams.get("include"));
    const body = {
      ...labDiagnostics.combinedSnapshot(runId ?? "", { includeFullDom: false }),
      debugRecords: debugRecords.map((record) => ({ ...record }))
    };
    endJson(res, 200, filterLabDiagnosticsBody(body, include));
  }
  async function handleLabDom(req, res) {
    const labDiagnostics = options.labDiagnostics;
    if (!labDiagnostics) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method === "GET") {
      const parsed = new URL(req.url ?? "/", "http://127.0.0.1");
      const runId2 = parsed.searchParams.get("runId") ?? void 0;
      const token2 = req.headers["x-changedown-lab-diagnostics-token"];
      const candidateToken2 = Array.isArray(token2) ? token2[0] : token2;
      if (!labDiagnostics.accepts(runId2 ?? "", candidateToken2)) {
        res.writeHead(403, {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          Connection: "close"
        });
        res.end(JSON.stringify({ error: "forbidden" }));
        return;
      }
      endJson(res, 200, labDiagnostics.latestPaneSnapshot(runId2 ?? "", { includeFullDom: false }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "Allow": "GET, POST", Connection: "close" });
      res.end();
      return;
    }
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }
    const input = payload && typeof payload === "object" ? payload : {};
    const runId = typeof input.runId === "string" ? input.runId : void 0;
    const token = req.headers["x-changedown-lab-diagnostics-token"];
    const candidateToken = Array.isArray(token) ? token[0] : token;
    if (!labDiagnostics.accepts(runId ?? "", candidateToken)) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Connection: "close"
      });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    if (input.mode === "full" && !labDiagnostics.allowFullDom()) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Connection: "close"
      });
      res.end(JSON.stringify({ error: "full DOM diagnostics disabled" }));
      return;
    }
    endJson(res, 200, labDiagnostics.latestPaneSnapshot(runId ?? "", { includeFullDom: input.mode === "full" }));
  }
  function writePendingPollResponse(reg, res) {
    for (const [id, pending] of reg.pendingRequests) {
      if (pending.delivered) continue;
      if (res.writableEnded) return true;
      pending.delivered = true;
      if (process.env.CD_DEBUG_HTTP) {
        process.stderr.write(
          `[pane-endpoint] poll delivering ${pending.method} id=${id}
`
        );
      }
      endJson(res, 200, { id, method: pending.method, params: pending.params });
      return true;
    }
    return false;
  }
  function flushPendingPolls(reg) {
    for (const res of [...reg.pendingPolls]) {
      if (writePendingPollResponse(reg, res)) {
        reg.pendingPolls.delete(res);
      }
    }
  }
  async function handlePoll(req, res, registrationId) {
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
          Connection: "close"
        });
        res.end();
      }
    }, Math.min(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, 15e3));
    res.on("close", () => {
      clearTimeout(timeout);
      reg.pendingPolls.delete(res);
    });
  }
  function applyCors(req, res) {
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
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  function requestListener(req, res) {
    if (res.headersSent || res.writableEnded) return;
    if (process.env.CD_DEBUG_HTTP) {
      process.stderr.write(
        `[pane-endpoint] request: ${req.method} ${req.url}
`
      );
    }
    const url = req.url ?? "";
    const method = req.method ?? "";
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
    if (TEST_CONTROL_ENABLED && url === "/__tests__/sse-keepalive/pause" && method === "POST") {
      keepalivePaused = true;
      res.writeHead(204);
      res.end();
      return;
    }
    if (TEST_CONTROL_ENABLED && url === "/__tests__/sse-keepalive/resume" && method === "POST") {
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
      handleStream(req, res, streamMatch[1]);
      return;
    }
    const responseMatch = url.match(/^\/backend\/response\/([^/]+)$/);
    if (responseMatch && method === "POST") {
      void handleResponse(req, res, responseMatch[1]);
      return;
    }
    const traceMatch = url.match(/^\/backend\/trace\/([^/]+)$/);
    if (traceMatch && method === "POST") {
      void handleLabTrace(req, res, traceMatch[1]);
      return;
    }
    const notifyMatch = url.match(/^\/backend\/notify\/([^/]+)$/);
    if (notifyMatch && method === "POST") {
      void handleNotify(req, res, notifyMatch[1]);
      return;
    }
    const diagnosticsMatch = url.match(/^\/backend\/diagnostics\/([^/]+)$/);
    if (diagnosticsMatch && method === "POST") {
      void handleDiagnosticsIngest(req, res, diagnosticsMatch[1]);
      return;
    }
    const pollMatch = url.match(/^\/backend\/poll\/([^/]+)$/);
    if (pollMatch && (method === "GET" || method === "POST")) {
      void handlePoll(req, res, pollMatch[1]);
      return;
    }
    if (process.env.CD_DEBUG_HTTP) {
      process.stderr.write(
        `[pane-endpoint] no route matched: ${req.method} ${req.url} (response state: headersSent=${res.headersSent}, writableEnded=${res.writableEnded})
`
      );
    }
  }
  return {
    detach() {
      for (const id of [...registrations.keys()]) {
        removeRegistration(id);
      }
    },
    async sendRequest(registrationId, method, params) {
      const reg = registrations.get(registrationId);
      if (!reg) throw new Error(`No registration found: ${registrationId}`);
      const usePollRpc = reg.capabilities.includes("poll-rpc");
      if (!usePollRpc && !reg.sseRes)
        throw new Error(
          `No active SSE stream for registration: ${registrationId}`
        );
      const id = String(reg.nextRequestId++);
      const event = `data: ${JSON.stringify({ id, method, params })}

`;
      const deliveryPath = deliveryPathForRegistration(reg);
      const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
      let timer;
      const responsePromise = new Promise((resolve, reject) => {
        reg.pendingRequests.set(id, {
          resolve,
          reject,
          method,
          params,
          delivered: false
        });
      });
      recordDebug({
        event: "sent",
        registrationId,
        requestId: id,
        method,
        deliveryPath,
        runId: reg.lab?.runId
      });
      if (reg.sseRes && !reg.sseRes.writableEnded) {
        const wrote = reg.sseRes.write(event);
        if (process.env.CD_DEBUG_HTTP) {
          process.stderr.write(
            `[pane-endpoint] sendRequest ${method} id=${id} via=sse+${usePollRpc ? "poll" : "only"} wrote=${wrote} regId=${registrationId}
`
          );
        }
        if (!wrote && reg.sseRes.writableEnded) {
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
          `[pane-endpoint] sendRequest ${method} id=${id} via=poll-only regId=${registrationId}
`
        );
      }
      flushPendingPolls(reg);
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reg.pendingRequests.delete(id);
          recordDebug({
            event: "timeout",
            registrationId,
            requestId: id,
            method,
            deliveryPath,
            runId: reg.lab?.runId,
            message: `Word bridge request timed out after ${timeoutMs} ms (method: ${method})`
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
        if (timer) clearTimeout(timer);
      }
    },
    broadcastAgentsUpdated(sessionClientInfos) {
      const agents = Array.from(sessionClientInfos.entries()).map(
        ([sid, info]) => ({
          sessionId: sid,
          name: info.name,
          editCount: editCounts.get(sid) ?? 0
        })
      );
      const payload = `data: ${JSON.stringify({
        method: AGENTS_UPDATED_METHOD,
        params: { agents }
      })}

`;
      for (const reg of registrations.values()) {
        if (!reg.sseRes || reg.sseRes.writableEnded) continue;
        reg.sseRes.write(payload);
      }
    },
    incrementEditCount(sessionId, sessionClientInfos) {
      editCounts.set(sessionId, (editCounts.get(sessionId) ?? 0) + 1);
      this.broadcastAgentsUpdated(sessionClientInfos);
    },
    pruneEditCounts(liveSessionIds) {
      const liveIds = new Set(liveSessionIds.keys());
      for (const sid of editCounts.keys()) {
        if (!liveIds.has(sid)) editCounts.delete(sid);
      }
    },
    handleHttpRequest(req, res) {
      requestListener(req, res);
    },
    getDebugRecords() {
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
    onPaneNotification(registrationId, cb) {
      const reg = registrations.get(registrationId);
      if (!reg) {
        return {
          dispose: () => {
          }
        };
      }
      const handler = (id, event) => {
        if (id === registrationId) cb(event);
      };
      emitter.on("paneNotification", handler);
      const cleanup = () => emitter.off("paneNotification", handler);
      reg._listenerCleanups.add(cleanup);
      return {
        dispose: () => {
          cleanup();
          registrations.get(registrationId)?._listenerCleanups.delete(cleanup);
        }
      };
    }
  };
}
export {
  CAPABILITY_BACKEND_REGISTER,
  CAPABILITY_MCP_STREAMABLE,
  attachPaneEndpoints
};
//# sourceMappingURL=pane-endpoint.js.map
