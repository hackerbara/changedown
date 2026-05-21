// Bridge daemon entry. Started only by another `changedown-mcp` process via
// detached spawn with the `--bridge` flag. Reuses the existing HTTPS surface
// from host-mode (pane routes, /health) but does NOT wire a stdio MCP
// transport — this process never reads or writes stdin/stdout for MCP.
//
// Design doc: docs/superpowers/specs/2026-05-15-changedown-mcp-bridge-split-design.md

import { runBridgeServer } from '../host-mode.js';
import { IdleReaper } from './idle-reaper.js';
import { getSessionRegistry, getActivePaneCount } from '../transport/pane-endpoint.js';

export async function runBridge(): Promise<void> {
  process.title = 'changedown-mcp --bridge';

  // Bridge mode never reads stdin. The MCP entry's --bridge branch returns
  // before installSignalHandlers() (which is the only code that calls
  // process.stdin.resume()), and the daemon is started with
  // stdio: ['ignore', ...] so stdin is bound to /dev/null. Any future code
  // that attaches a 'data' listener here would resume stdin in flowing mode
  // — don't add one.

  const idleTimeoutEnv = Number(process.env.CHANGEDOWN_BRIDGE_IDLE_TIMEOUT_MS);
  const idleTimeoutMs =
    Number.isFinite(idleTimeoutEnv) && idleTimeoutEnv > 0
      ? idleTimeoutEnv
      : 10 * 60 * 1000;

  const reaper = new IdleReaper({
    idleTimeoutMs,
    // Poll at idleTimeout/10 clamped to [1s, 1min].
    checkIntervalMs: Math.min(60_000, Math.max(1_000, Math.floor(idleTimeoutMs / 10))),
    isActive: () => {
      const sessions = getSessionRegistry().size();
      const panes = getActivePaneCount();
      return sessions > 0 || panes > 0;
    },
    onIdle: () => {
      process.stderr.write(`[bridge] idle for ${idleTimeoutMs}ms — exiting\n`);
      process.exit(0);
    },
  });

  reaper.start();
  try {
    await runBridgeServer({
      mode: 'bridge',
    });
  } finally {
    // runBridgeServer resolves when the server has shut down, or immediately if
    // another bridge won the port race. Ensure reaper is stopped even if the
    // server throws (port-bind failure, TLS error, etc.).
    reaper.stop();
  }
  process.exit(0);
}
