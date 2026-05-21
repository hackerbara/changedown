// changedown-plugin/mcp-server/src/transport/fixed-port-leader.ts
import * as http from 'node:http';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function getDevCertDir(): string {
  return process.env.CHANGEDOWN_DEV_CERT_DIR ?? path.join(os.homedir(), '.office-addin-dev-certs');
}

const DEV_CERT_REPAIR_COMMAND = 'npx office-addin-dev-certs install';

export const SERVICE_NAME = 'changedown-mcp';

/** Default MCP port when CHANGEDOWN_MCP_PORT is not set. */
export const DEFAULT_MCP_PORT = '39990';

/**
 * Parse and validate CHANGEDOWN_MCP_PORT (or DEFAULT_MCP_PORT as fallback).
 * Throws with an actionable message when the value is out of range or non-numeric.
 */
export function parseMcpPort(): number {
  const raw = process.env.CHANGEDOWN_MCP_PORT ?? DEFAULT_MCP_PORT;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid CHANGEDOWN_MCP_PORT: ${raw}`);
  }
  return port;
}

/**
 * Load the local office-addin-dev-certs cert + key for Word pane HTTPS mode.
 * Current Word WebViews block HTTPS task panes from calling HTTP loopback as
 * mixed content, so the npx/plugin path requires HTTPS loopback by default.
 * HTTP remains available only for explicit diagnostic runs.
 */
function loadDevCertOptions(): { cert: Buffer; key: Buffer } | undefined {
  const dir = getDevCertDir();
  const certPath = path.join(dir, 'localhost.crt');
  const keyPath = path.join(dir, 'localhost.key');
  const caPath = path.join(dir, 'ca.crt');
  try {
    // Serve the full chain (leaf + CA) as a PEM bundle. WKWebView requires
    // the chain to validate; serving only the leaf causes silent TLS
    // handshake failures (openssl reports "unable to verify the first
    // certificate"). webpack-dev-server already does this implicitly via
    // office-addin-dev-certs.getHttpsServerOptions().
    const leaf = fs.readFileSync(certPath);
    const ca = fs.readFileSync(caPath);
    const bundle = Buffer.concat([leaf, Buffer.from('\n'), ca]);
    return { cert: bundle, key: fs.readFileSync(keyPath) };
  } catch {
    return undefined;
  }
}

export class PortConflictError extends Error {
  constructor(
    public readonly port: number,
    public readonly service: string,
    public readonly conflictPid?: number,
    public readonly conflictScheme?: 'http' | 'https',
    public readonly expectedScheme?: 'http' | 'https',
  ) {
    const pidPart = conflictPid != null ? ` (PID ${conflictPid})` : '';
    const schemePart = conflictScheme && expectedScheme && conflictScheme !== expectedScheme
      ? ` running on ${conflictScheme} but this process expects ${expectedScheme}`
      : '';
    const killHint = conflictPid != null ? ` Kill it: kill ${conflictPid}.` : ' Free the port or configure a different one.';
    super(
      `PortConflictError: port ${port} is held by ${service}${pidPart}${schemePart}.${killHint}`
    );
    this.name = 'PortConflictError';
  }
}

export class HttpsRequiredError extends Error {
  constructor() {
    super(
      'HTTPS is required for hosted Word pane mode, but this server is configured to use HTTP or Office add-in dev certificates were not found. ' +
      `Expected localhost.crt, localhost.key, and ca.crt under ${getDevCertDir()}. ` +
      `Run \`${DEV_CERT_REPAIR_COMMAND}\`, trust the generated certificates if prompted, then start changedown-mcp again.`
    );
    this.name = 'HttpsRequiredError';
  }
}

export interface BindOrForwardOptions {
  /**
   * Require the fixed-port host/client URL to be HTTPS. Defaults to
   * prefersHttps() — true unless --http is passed in argv or
   * CHANGEDOWN_MCP_USE_HTTP is set.
   */
  requireHttps?: boolean;
  /**
   * Test/dev override for the protocol choice. Leave undefined in production
   * so dev cert availability controls whether HTTPS is used.
   */
  useHttps?: boolean;
}

export interface HealthResponse {
  service: string;
  version: string;
  capabilities: string[];
  /**
   * PID of the leader process. Optional — older leaders (pre-0.4.x) did not
   * expose this. When present, port-conflict errors include it so users can
   * `kill` the offending process by name.
   */
  pid?: number;
}

/**
 * Probe both schemes after EADDRINUSE. Returns the first successful response
 * paired with its scheme so the caller can detect leader/wrong-scheme cases.
 * Returns undefined when neither scheme responds.
 */
async function probeHealthBothSchemes(
  port: number,
  preferHttps: boolean,
): Promise<{ health: HealthResponse; scheme: 'http' | 'https' } | undefined> {
  const order: Array<'http' | 'https'> = preferHttps ? ['https', 'http'] : ['http', 'https'];
  for (const scheme of order) {
    try {
      const health = await probeHealth(port, scheme === 'https');
      return { health, scheme };
    } catch { /* try next */ }
  }
  return undefined;
}

export type HostResult = {
  mode: 'host';
  server: http.Server;
};

export type LeaderResult = HostResult;

// Lazy + memoized. Replaces the module-level `const devCerts = ...`.
let devCertsCache: { cert: Buffer; key: Buffer } | undefined | 'unloaded' = 'unloaded';
function getDevCerts(): { cert: Buffer; key: Buffer } | undefined {
  if (devCertsCache === 'unloaded') devCertsCache = loadDevCertOptions();
  return devCertsCache;
}

function isFakeHealthEnabled(): boolean {
  return process.env.CHANGEDOWN_MCP_TEST_FAKE_HEALTH === '1';
}

/**
 * Returns true unless the caller has opted out of HTTPS. HTTPS is the default
 * for all bridge / leader-election / autospawn traffic.
 *
 * Opt-outs (checked in order):
 *   1. `--http` (or `--no-https`) in process.argv — the production opt-out.
 *      Pass it in any plugin manifest (`.mcp.json` args) that needs HTTP.
 *   2. `CHANGEDOWN_MCP_USE_HTTP=1|true` env — escape hatch for tests that
 *      can't easily inject CLI args (e.g. when running through child_process
 *      helpers that take an env object).
 *
 * The bridge daemon spawned via `--bridge` inherits the parent's argv, so
 * passing `--http` to the parent MCP propagates to the bridge automatically.
 */
export function prefersHttps(argv: readonly string[] = process.argv): boolean {
  if (argv.includes('--http') || argv.includes('--no-https')) return false;
  const useHttp = process.env.CHANGEDOWN_MCP_USE_HTTP?.toLowerCase();
  if (useHttp === '1' || useHttp === 'true') return false;
  return true;
}

function shouldRequireHttps(options: BindOrForwardOptions | undefined): boolean {
  return options?.requireHttps ?? prefersHttps();
}

function resolveUseHttps(options: BindOrForwardOptions | undefined): boolean {
  // Programmatic override wins (e.g. tests passing { useHttps: false } directly).
  if (options?.useHttps !== undefined) return options.useHttps;

  // CHANGEDOWN_MCP_USE_HTTPS=1 is now redundant with the default-on behaviour
  // but we still honour it for backward compat — it forces HTTPS even if a
  // future flag would have flipped the default.
  const forceHttps = process.env.CHANGEDOWN_MCP_USE_HTTPS?.toLowerCase();
  if (forceHttps === '1' || forceHttps === 'true') return true;

  return prefersHttps();
}

function assertCanBindHttps(bindWithHttps: boolean): void {
  if (bindWithHttps && !getDevCerts()) {
    throw new HttpsRequiredError();
  }
}

/** URL scheme the server binds / clients probe on by default. */
export const SCHEME = 'http';

async function probeHealth(port: number, probeWithHttps = false): Promise<HealthResponse> {
  return new Promise((resolve, reject) => {
    const getter = probeWithHttps ? https.get : http.get;
    const req = getter(
      {
        hostname: '127.0.0.1',
        port,
        path: '/health',
        timeout: 2000,
        // Self-signed dev cert — we trust the loopback address, not the chain.
        rejectUnauthorized: false,
        // Don't reuse Node's default agent connection pool. Without this, when
        // a same-port leader is killed and replaced (cross-version handover,
        // test-suite rebinds), Node 24's pool can hand back a stale socket
        // → ECONNRESET on the next probe. Each /health probe gets its own
        // socket; probes are infrequent so the cost is negligible.
        agent: false,
      },
      (res) => {
        let raw = '';
        res.on('data', (c: Buffer) => { raw += c.toString(); });
        res.on('end', () => {
          try { resolve(JSON.parse(raw) as HealthResponse); }
          catch { reject(new Error('Invalid JSON from /health')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('health probe timeout')); });
  });
}

/**
 * Wrap a bind operation with bounded retry/backoff on EADDRINUSE. Handles the
 * common loopback TIME_WAIT case where a freshly-killed leader's socket is
 * still in TIME_WAIT when the next process tries to bind. After `totalBudgetMs`
 * the underlying error is rethrown so genuinely-conflicting services still
 * surface PortConflictError.
 */
export interface BindRetryOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  totalBudgetMs?: number;
}

export async function retryOnEAddrInUse<T>(
  bind: () => Promise<T>,
  opts: BindRetryOptions = {},
): Promise<T> {
  const { initialDelayMs = 50, maxDelayMs = 800, totalBudgetMs = 2500 } = opts;
  const start = Date.now();
  let delay = initialDelayMs;
  for (;;) {
    try {
      return await bind();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const elapsed = Date.now() - start;
      if (code !== 'EADDRINUSE' || elapsed + delay >= totalBudgetMs) {
        throw err;
      }
      await new Promise<void>((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}

export function tryBind(port: number, bindWithHttps = false): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const certs = getDevCerts()!;
    const server = bindWithHttps
      ? https.createServer({ cert: certs.cert, key: certs.key })
      : http.createServer();

    // Log every connection attempt (even ones that fail TLS handshake) so we
    // can distinguish "pane never tries" from "pane tries, server rejects".
    server.on('connection', (sock) => {
      console.error(`[pane-endpoint] TCP connect from ${sock.remoteAddress}:${sock.remotePort}`);
    });
    if (bindWithHttps) {
      (server as https.Server).on('tlsClientError', (err, sock) => {
        console.error(
          `[pane-endpoint] TLS handshake failed from ${sock.remoteAddress}:${sock.remotePort}: ${err.message}`,
        );
      });
    }

    server.listen(port, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

async function bindOrForwardCore(port: number, options: BindOrForwardOptions = {}): Promise<LeaderResult> {
  const requireHttps = shouldRequireHttps(options);
  if (requireHttps && options.useHttps === false) {
    throw new HttpsRequiredError();
  }
  const bindWithHttps = requireHttps ? true : resolveUseHttps(options);

  if (requireHttps && !getDevCerts()) {
    // We can't bind HTTPS ourselves, so we can only proceed by joining an
    // existing HTTPS leader. Probe BOTH schemes so we can produce an
    // actionable error when the port is held by an HTTP-only changedown-mcp
    // (the common cross-version mismatch) instead of an opaque
    // HttpsRequiredError.
    const probed = await probeHealthBothSchemes(port, /* preferHttps */ true);
    if (!probed) {
      // Nothing answered on either scheme. Most likely no leader is up yet
      // and we genuinely cannot proceed without dev certs.
      throw new HttpsRequiredError();
    }
    if (probed.health.service !== SERVICE_NAME) {
      throw new PortConflictError(port, probed.health.service, probed.health.pid, probed.scheme, 'https');
    }
    if (probed.scheme !== 'https') {
      // Same service, wrong scheme — incompatible leader. Surface the PID so
      // the user can kill the stale leader and let a fresh HTTPS one bind.
      throw new PortConflictError(port, SERVICE_NAME, probed.health.pid, probed.scheme, 'https');
    }
    throw new PortConflictError(port, SERVICE_NAME, probed.health.pid, probed.scheme, 'https');
  }

  try {
    assertCanBindHttps(bindWithHttps);
    const server = await retryOnEAddrInUse(() => tryBind(port, bindWithHttps));

    // Note: stdin / signal handling is owned by signals.ts (installSignalHandlers).
    // bindOrForward returns a bound server; the caller's stack drives teardown.

    return { mode: 'host', server };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EADDRINUSE') throw err;

    // Port is taken — figure out who and on what scheme. Probe BOTH so a
    // wrong-scheme same-service leader (the common cross-version mismatch)
    // produces an actionable error instead of "<unreachable>".
    const expectedScheme: 'http' | 'https' = requireHttps || bindWithHttps ? 'https' : 'http';
    const probed = await probeHealthBothSchemes(port, expectedScheme === 'https');
    if (!probed) {
      throw new PortConflictError(port, '<unreachable on either http or https>');
    }
    if (probed.health.service !== SERVICE_NAME) {
      throw new PortConflictError(port, probed.health.service, probed.health.pid, probed.scheme, expectedScheme);
    }
    if (probed.scheme !== expectedScheme) {
      // Same service, wrong scheme — incompatible leader. Surface the PID so
      // the user can kill the stale leader and restart cleanly.
      throw new PortConflictError(port, SERVICE_NAME, probed.health.pid, probed.scheme, expectedScheme);
    }

    throw new PortConflictError(port, SERVICE_NAME, probed.health.pid, probed.scheme, expectedScheme);
  }
}

/**
 * Test hooks. Production code goes through `bindOrForward` and `probeHealth`
 * directly; tests can override the bind function to simulate failures and
 * the health probe to simulate a held port. Reset between tests.
 */
let bindOverrideForTests: typeof bindOrForwardCore | null = null;
export const __testHooks__ = {
  overrideBindForTests(fn: typeof bindOrForwardCore) { bindOverrideForTests = fn; },
  resetBindOverride() { bindOverrideForTests = null; },
};

async function bindOrForwardImpl(port: number, options: BindOrForwardOptions = {}): Promise<LeaderResult> {
  if (bindOverrideForTests) return bindOverrideForTests(port, options);
  return bindOrForwardCore(port, options);
}

export const bindOrForward = bindOrForwardCore;
