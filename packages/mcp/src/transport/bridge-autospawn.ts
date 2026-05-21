// Auto-spawn helper: ensure a changedown-mcp bridge daemon is running on
// the given port, spawning a detached child of ourselves if needed.
//
// Design doc: docs/superpowers/specs/2026-05-15-changedown-mcp-bridge-split-design.md
//
// Race semantics: if two MCP processes call this concurrently, both may try
// to spawn. The losing child hits EADDRINUSE on bind and exits silently;
// the winning child serves /health. Polling resolves on first success.

import * as https from 'node:https';
import * as http from 'node:http';
import { spawn } from 'node:child_process';
import { prefersHttps } from './fixed-port-leader.js';
import { describeForeignHolder, portDiagnosticHint } from './os-shim.js';

export interface AutospawnOptions {
  port: number;
  probeTimeoutMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  /**
   * Whether to probe /health via HTTPS. Defaults to prefersHttps() — true
   * unless `--http` is passed in argv or CHANGEDOWN_MCP_USE_HTTP is set.
   * Override explicitly in tests that use a plain HTTP fake bridge.
   */
  useHttps?: boolean;
  /** Override for tests. Default: detached spawn of process.execPath with --bridge. */
  spawnFn?: () => void | Promise<void>;
  /** Override for tests/diagnostics. Default: stderr. */
  onLog?: (msg: string) => void;
}

export interface AutospawnResult {
  outcome: 'alive' | 'spawned' | 'failed';
  spawned: boolean;
  error?: Error;
}

/**
 * Probe outcomes:
 *   - 'bridge'      — :port responds with a /health that declares bridgeProtocol.
 *                     This is a real bridge we can route through.
 *   - 'foreign'     — :port responds 200 but isn't a bridge (e.g. a pre-bridge
 *                     MCP host, or a different service that serves /health).
 *                     Distinct from absent so the caller can surface a useful
 *                     error rather than spinning the spawn budget.
 *   - 'absent'      — nothing on :port, or the response was malformed.
 */
type ProbeOutcome = 'bridge' | 'foreign' | 'absent';

interface ProbeResult {
  outcome: ProbeOutcome;
  /** Parsed /health body when we got one, for diagnostics. */
  foreignBody?: string;
}

function probeHealth(port: number, timeoutMs: number, useHttps: boolean): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const options = {
      host: '127.0.0.1',
      port,
      path: '/health',
      method: 'GET',
      timeout: timeoutMs,
      // HTTPS-specific: accept self-signed dev certs from the bridge.
      ...(useHttps ? { rejectUnauthorized: false } : {}),
    };

    const requester = useHttps ? https : http;

    const req = requester.request(options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if ((res.statusCode ?? 0) !== 200) {
          resolve({ outcome: 'absent' });
          return;
        }
        try {
          const parsed = JSON.parse(body) as Record<string, unknown>;
          if (parsed && parsed.bridgeProtocol === '1') {
            resolve({ outcome: 'bridge' });
          } else {
            // 200 OK but no bridge marker — something else (pre-bridge MCP
            // host, foreign service) holds the port.
            resolve({ outcome: 'foreign', foreignBody: body });
          }
        } catch {
          resolve({ outcome: 'foreign', foreignBody: body });
        }
      });
    });
    req.on('error', () => resolve({ outcome: 'absent' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ outcome: 'absent' });
    });
    req.end();
  });
}

function defaultSpawnFn(): void {
  // process.argv[1] is the entry script Node started us with; passing it
  // again ensures the child runs the same code (same dist) as the parent.
  //
  // Forward scheme-opt-out flags so the bridge child binds with the same
  // scheme the parent expects to probe with. (HTTPS is the default; we only
  // propagate the negation.)
  const childArgs = [process.argv[1], '--bridge'];
  if (process.argv.includes('--http')) childArgs.push('--http');
  else if (process.argv.includes('--no-https')) childArgs.push('--no-https');

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true, // suppress console window on Windows (no-op on macOS/Linux)
    env: process.env,
  });
  child.unref();
}

export async function ensureBridgeRunning(
  opts: AutospawnOptions,
): Promise<AutospawnResult> {
  const log = opts.onLog ?? ((m: string) => process.stderr.write(`[bridge-autospawn] ${m}\n`));
  // Default useHttps to match what the bridge itself will bind with. This
  // ensures the probe scheme always matches the server scheme without the
  // caller needing to pass it explicitly.
  const useHttps = opts.useHttps ?? prefersHttps();

  // 1. Initial probe — bridge already alive (and speaking our protocol)?
  const initial = await probeHealth(opts.port, opts.probeTimeoutMs, useHttps);
  if (initial.outcome === 'bridge') {
    return { outcome: 'alive', spawned: false };
  }
  if (initial.outcome === 'foreign') {
    // Someone else has :39990 (e.g. a pre-bridge MCP host, a stale leader
    // from a worktree, an unrelated service). Spawning another bridge
    // would just EADDRINUSE-and-exit; reporting "failed" with a useful
    // message lets the user resolve the conflict directly.
    const holder = describeForeignHolder(opts.port);
    return {
      outcome: 'failed',
      spawned: false,
      error: new Error(
        `port ${opts.port} is held by a non-bridge process${holder ? ` (${holder})` : ''}: ` +
        `/health responded 200 but did not declare bridgeProtocol. ` +
        `Likely a pre-bridge MCP host or stale leader from another worktree. ` +
        `To resolve: run '${portDiagnosticHint(opts.port)}' to identify and stop it, ` +
        `or set CHANGEDOWN_MCP_PORT=<other-port> in this client's env.`,
      ),
    };
  }

  // 2. Spawn detached bridge child.
  log(`bridge not responding on :${opts.port} — spawning detached --bridge child`);
  try {
    await (opts.spawnFn ?? defaultSpawnFn)();
  } catch (e) {
    return {
      outcome: 'failed',
      spawned: false,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }

  // 3. Poll /health until a bridge responds, the budget expires, or someone
  //    else claims the port first.
  const start = Date.now();
  while (Date.now() - start < opts.pollTimeoutMs) {
    await new Promise((r) => setTimeout(r, opts.pollIntervalMs));
    const probe = await probeHealth(opts.port, opts.probeTimeoutMs, useHttps);
    if (probe.outcome === 'bridge') {
      log(`bridge ready after ${Date.now() - start}ms`);
      return { outcome: 'spawned', spawned: true };
    }
    if (probe.outcome === 'foreign') {
      // Someone took the port between our initial probe and the spawn —
      // surface the same actionable error as the initial-foreign path.
      const holder = describeForeignHolder(opts.port);
      return {
        outcome: 'failed',
        spawned: true,
        error: new Error(
          `bridge child could not bind :${opts.port}; another process claimed it` +
          `${holder ? ` (${holder})` : ''}. ` +
          `Run '${portDiagnosticHint(opts.port)}' to identify and stop it.`,
        ),
      };
    }
  }

  return {
    outcome: 'failed',
    spawned: true,
    error: new Error(
      `bridge spawned but /health did not respond on :${opts.port} within ${opts.pollTimeoutMs}ms`,
    ),
  };
}
