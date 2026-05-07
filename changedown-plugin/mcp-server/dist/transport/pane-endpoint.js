// src/transport/pane-endpoint.ts
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

// src/version.ts
var version = "0.4.6";

// src/transport/fixed-port-leader.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
var DEV_CERT_DIR = path.join(os.homedir(), ".office-addin-dev-certs");
var SERVICE_NAME = "changedown-mcp";
function loadDevCertOptions() {
  const dir = DEV_CERT_DIR;
  const certPath = path.join(dir, "localhost.crt");
  const keyPath = path.join(dir, "localhost.key");
  const caPath = path.join(dir, "ca.crt");
  try {
    const leaf = fs.readFileSync(certPath);
    const ca = fs.readFileSync(caPath);
    const bundle = Buffer.concat([leaf, Buffer.from("\n"), ca]);
    return { cert: bundle, key: fs.readFileSync(keyPath) };
  } catch {
    return void 0;
  }
}
var devCerts = loadDevCertOptions();

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
var KEEPALIVE_MS = 15e3;
var TEST_CONTROL_ENABLED = process.env.CHANGEDOWN_MCP_TEST_CONTROL === "1";
var REGISTRATION_STREAM_TTL_MS = 3e4;
var DEFAULT_REQUEST_TIMEOUT_MS = 3e4;
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
function attachPaneEndpoints(httpServer, options = {}) {
  const registrations = /* @__PURE__ */ new Map();
  const emitter = new EventEmitter();
  const allowedOrigins = buildAllowedPaneOrigins(options);
  let keepalivePaused = false;
  const editCounts = /* @__PURE__ */ new Map();
  function removeRegistration(registrationId) {
    const reg = registrations.get(registrationId);
    if (!reg) return;
    for (const [, pending] of reg.pendingRequests) {
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
        capabilities: parsed.capabilities
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
      sseRes: null,
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
    reg.sseRes = res;
    res.write('data: {"type":"ping"}\n\n');
    const keepalive = setInterval(() => {
      if (!keepalivePaused && !res.writableEnded)
        res.write('data: {"type":"ping"}\n\n');
    }, KEEPALIVE_MS);
    req.on("close", () => {
      clearInterval(keepalive);
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
    applyCors(req, res);
    const url = req.url ?? "";
    const method = req.method ?? "";
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
    const notifyMatch = url.match(/^\/backend\/notify\/([^/]+)$/);
    if (notifyMatch && method === "POST") {
      void handleNotify(req, res, notifyMatch[1]);
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
