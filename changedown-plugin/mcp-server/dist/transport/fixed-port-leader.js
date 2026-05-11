// src/transport/fixed-port-leader.ts
import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
function getDevCertDir() {
  return process.env.CHANGEDOWN_DEV_CERT_DIR ?? path.join(os.homedir(), ".office-addin-dev-certs");
}
var DEV_CERT_REPAIR_COMMAND = "npx office-addin-dev-certs install";
var SERVICE_NAME = "changedown-mcp";
function loadDevCertOptions() {
  const dir = getDevCertDir();
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
var PortConflictError = class extends Error {
  constructor(port, service, conflictPid, conflictScheme, expectedScheme) {
    const pidPart = conflictPid != null ? ` (PID ${conflictPid})` : "";
    const schemePart = conflictScheme && expectedScheme && conflictScheme !== expectedScheme ? ` running on ${conflictScheme} but this process expects ${expectedScheme}` : "";
    const killHint = conflictPid != null ? ` Kill it: kill ${conflictPid}.` : " Free the port or configure a different one.";
    super(
      `PortConflictError: port ${port} is held by ${service}${pidPart}${schemePart}.${killHint}`
    );
    this.port = port;
    this.service = service;
    this.conflictPid = conflictPid;
    this.conflictScheme = conflictScheme;
    this.expectedScheme = expectedScheme;
    this.name = "PortConflictError";
  }
};
var HttpsRequiredError = class extends Error {
  constructor() {
    super(
      `HTTPS is required for hosted Word pane mode, but this server is configured to use HTTP or Office add-in dev certificates were not found. Expected localhost.crt, localhost.key, and ca.crt under ${getDevCertDir()}. Run \`${DEV_CERT_REPAIR_COMMAND}\`, trust the generated certificates if prompted, then start changedown-mcp again.`
    );
    this.name = "HttpsRequiredError";
  }
};
async function probeHealthBothSchemes(port, preferHttps) {
  const order = preferHttps ? ["https", "http"] : ["http", "https"];
  for (const scheme of order) {
    try {
      const health = await probeHealth(port, scheme === "https");
      return { health, scheme };
    } catch {
    }
  }
  return void 0;
}
var devCertsCache = "unloaded";
function getDevCerts() {
  if (devCertsCache === "unloaded") devCertsCache = loadDevCertOptions();
  return devCertsCache;
}
function isFakeHealthEnabled() {
  return process.env.CHANGEDOWN_MCP_TEST_FAKE_HEALTH === "1";
}
function envRequiresHttps() {
  const requireHttps = process.env.CHANGEDOWN_MCP_REQUIRE_HTTPS?.toLowerCase();
  return requireHttps === "1" || requireHttps === "true";
}
function shouldRequireHttps(options) {
  return options?.requireHttps ?? envRequiresHttps();
}
function resolveUseHttps(options) {
  const forceHttp = process.env.CHANGEDOWN_MCP_USE_HTTP?.toLowerCase();
  if (forceHttp === "1" || forceHttp === "true") return false;
  const forceHttps = process.env.CHANGEDOWN_MCP_USE_HTTPS?.toLowerCase();
  if (forceHttps === "1" || forceHttps === "true") return true;
  return options?.useHttps ?? false;
}
function assertCanBindHttps(bindWithHttps) {
  if (bindWithHttps && !getDevCerts()) {
    throw new HttpsRequiredError();
  }
}
var SCHEME = "http";
async function probeHealth(port, probeWithHttps = false) {
  return new Promise((resolve, reject) => {
    const getter = probeWithHttps ? https.get : http.get;
    const req = getter(
      {
        hostname: "127.0.0.1",
        port,
        path: "/health",
        timeout: 2e3,
        // Self-signed dev cert — we trust the loopback address, not the chain.
        rejectUnauthorized: false,
        // Don't reuse Node's default agent connection pool. Without this, when
        // a same-port leader is killed and replaced (cross-version handover,
        // test-suite rebinds), Node 24's pool can hand back a stale socket
        // → ECONNRESET on the next probe. Each /health probe gets its own
        // socket; probes are infrequent so the cost is negligible.
        agent: false
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c.toString();
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error("Invalid JSON from /health"));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("health probe timeout"));
    });
  });
}
async function retryOnEAddrInUse(bind, opts = {}) {
  const { initialDelayMs = 50, maxDelayMs = 800, totalBudgetMs = 2500 } = opts;
  const start = Date.now();
  let delay = initialDelayMs;
  for (; ; ) {
    try {
      return await bind();
    } catch (err) {
      const code = err.code;
      const elapsed = Date.now() - start;
      if (code !== "EADDRINUSE" || elapsed + delay >= totalBudgetMs) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}
function tryBind(port, bindWithHttps = false) {
  return new Promise((resolve, reject) => {
    const certs = getDevCerts();
    const server = bindWithHttps ? https.createServer({ cert: certs.cert, key: certs.key }) : http.createServer();
    server.on("connection", (sock) => {
      console.error(`[pane-endpoint] TCP connect from ${sock.remoteAddress}:${sock.remotePort}`);
    });
    if (bindWithHttps) {
      server.on("tlsClientError", (err, sock) => {
        console.error(
          `[pane-endpoint] TLS handshake failed from ${sock.remoteAddress}:${sock.remotePort}: ${err.message}`
        );
      });
    }
    server.listen(port, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}
var DEFAULT_HEARTBEAT = { intervalMs: 2e3, failThreshold: 2 };
function makeHeartbeat(hostUrl, defaults, bindOptions) {
  const url = new URL(hostUrl);
  const hostPort = parseInt(url.port, 10);
  const useHttps = url.protocol === "https:";
  return (override) => new Promise((resolve) => {
    const opts = {
      intervalMs: override?.intervalMs ?? defaults.intervalMs,
      failThreshold: override?.failThreshold ?? defaults.failThreshold
    };
    let failures = 0;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        if (isFakeHealthEnabled()) throw new Error("test-fake-health-fail");
        await probeHealth(hostPort, useHttps);
        failures = 0;
      } catch {
        failures++;
        if (failures >= opts.failThreshold) {
          clearInterval(timer);
          try {
            const promoted = await bindOrForwardImpl(hostPort, bindOptions);
            resolve(promoted);
          } catch (first) {
            try {
              const raced = await bindOrForwardImpl(hostPort, bindOptions);
              resolve(raced);
            } catch (second) {
              console.error("[changedown] promotion failed twice:", first, second);
            }
          }
        }
      } finally {
        inFlight = false;
      }
    }, opts.intervalMs);
  });
}
async function bindOrForwardCore(port, options = {}) {
  const requireHttps = shouldRequireHttps(options);
  if (requireHttps && options.useHttps === false) {
    throw new HttpsRequiredError();
  }
  const bindWithHttps = requireHttps ? true : resolveUseHttps(options);
  if (isFakeHealthEnabled()) {
    const expectedScheme = requireHttps || bindWithHttps ? "https" : "http";
    const hostUrl = `${expectedScheme}://127.0.0.1:${port}`;
    const startHeartbeat = makeHeartbeat(hostUrl, DEFAULT_HEARTBEAT, options);
    return { mode: "client", hostUrl, startHeartbeat };
  }
  if (requireHttps && !getDevCerts()) {
    const probed = await probeHealthBothSchemes(
      port,
      /* preferHttps */
      true
    );
    if (!probed) {
      throw new HttpsRequiredError();
    }
    if (probed.health.service !== SERVICE_NAME) {
      throw new PortConflictError(port, probed.health.service, probed.health.pid, probed.scheme, "https");
    }
    if (probed.scheme !== "https") {
      throw new PortConflictError(port, SERVICE_NAME, probed.health.pid, probed.scheme, "https");
    }
    const hostUrl = `https://127.0.0.1:${port}`;
    const startHeartbeat = makeHeartbeat(hostUrl, DEFAULT_HEARTBEAT, options);
    return { mode: "client", hostUrl, startHeartbeat };
  }
  try {
    assertCanBindHttps(bindWithHttps);
    const server = await retryOnEAddrInUse(() => tryBind(port, bindWithHttps));
    return { mode: "host", server };
  } catch (err) {
    const code = err.code;
    if (code !== "EADDRINUSE") throw err;
    const expectedScheme = requireHttps || bindWithHttps ? "https" : "http";
    const probed = await probeHealthBothSchemes(port, expectedScheme === "https");
    if (!probed) {
      throw new PortConflictError(port, "<unreachable on either http or https>");
    }
    if (probed.health.service !== SERVICE_NAME) {
      throw new PortConflictError(port, probed.health.service, probed.health.pid, probed.scheme, expectedScheme);
    }
    if (probed.scheme !== expectedScheme) {
      throw new PortConflictError(port, SERVICE_NAME, probed.health.pid, probed.scheme, expectedScheme);
    }
    const hostUrl = `${expectedScheme}://127.0.0.1:${port}`;
    const startHeartbeat = makeHeartbeat(hostUrl, DEFAULT_HEARTBEAT, options);
    return { mode: "client", hostUrl, startHeartbeat };
  }
}
var bindOverrideForTests = null;
var __testHooks__ = {
  overrideBindForTests(fn) {
    bindOverrideForTests = fn;
  },
  resetBindOverride() {
    bindOverrideForTests = null;
  }
};
async function bindOrForwardImpl(port, options = {}) {
  if (bindOverrideForTests) return bindOverrideForTests(port, options);
  return bindOrForwardCore(port, options);
}
var bindOrForward = bindOrForwardCore;
export {
  HttpsRequiredError,
  PortConflictError,
  SCHEME,
  SERVICE_NAME,
  __testHooks__,
  bindOrForward,
  retryOnEAddrInUse
};
//# sourceMappingURL=fixed-port-leader.js.map
