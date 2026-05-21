#!/usr/bin/env node

import {
  initHashline,
} from '@changedown/core';

import { bindOrForward, parseMcpPort, PortConflictError } from './transport/fixed-port-leader.js';
import { installSignalHandlers } from './transport/signals.js';
import { runHost, setWordRoutingViaBridge } from './host-mode.js';
import { registerSession } from './transport/word-forwarder.js';

/**
 * ChangeDown MCP Server
 *
 * Performs leader election on port 39990. If this process wins the port it
 * becomes the host: wires the full registry + tool dispatch, attaches MCP
 * Streamable HTTP and pane endpoints, and serves Claude Code over stdio.
 *
 * `--bridge` flag: skip leader election and run as a bridge daemon (HTTPS
 * surface only, no stdio MCP). Spawned by another MCP process; never invoked
 * by users directly.
 */
async function main(): Promise<void> {
  // Bridge mode: fully isolated from the default stdio-MCP startup path.
  // Dynamic import ensures bridge-only code is not evaluated in normal mode.
  if (process.argv.includes('--bridge')) {
    const { runBridge } = await import('./bridge/index.js');
    await runBridge();
    return;
  }

  // Kick off hashline init concurrently with autospawn / registerSession.
  const hashlineReady = initHashline();

  // Auto-spawn bridge (default-on). Set CHANGEDOWN_BRIDGE_AUTOSPAWN=0 to
  // disable and run as a standalone fixed-port host.
  const bridgeAutospawnEnabled = process.env.CHANGEDOWN_BRIDGE_AUTOSPAWN !== '0';
  if (bridgeAutospawnEnabled) {
    const { ensureBridgeRunning } = await import('./transport/bridge-autospawn.js');
    const port = parseMcpPort();
    const result = await ensureBridgeRunning({
      port,
      probeTimeoutMs: 250,
      pollIntervalMs: 50,
      pollTimeoutMs: 2000,
    });
    if (result.outcome === 'failed') {
      process.stderr.write(
        `[changedown] fatal: could not start bridge daemon on :${port}: ` +
        `${result.error?.message ?? 'unknown'}. ` +
        `Try: pkill -f "changedown.*--bridge" then retry.\n`
      );
      process.exit(1);
    }
    // Register this MCP session with the bridge so tool handlers can route
    // word:// ops through forwardWordOp. Failure here is fatal — any user who
    // hasn't set CHANGEDOWN_BRIDGE_AUTOSPAWN=0 expects bridge routing. Silently
    // falling back to the in-process path would hide a misconfiguration.
    // This mirrors the autospawn-failure stance above (stderr + exit 1).
    try {
      const { token } = await registerSession({
        port,
        meta: {
          tool: process.env.CHANGEDOWN_TOOL_NAME ?? 'unknown',
          pid: process.pid,
          sessionId: process.env.CHANGEDOWN_SESSION_ID ?? `sess-${process.pid}-${Date.now()}`,
        },
      });
      setWordRoutingViaBridge({ port, token });
    } catch (regErr) {
      const errMsg = regErr instanceof Error ? regErr.message : String(regErr);
      process.stderr.write(
        `[changedown] fatal: could not register session with bridge on :${port}: ` +
        `${errMsg}. ` +
        `The bridge is up but rejected /sessions — likely a version mismatch. ` +
        `Try: pkill -f "changedown.*--bridge" then retry.\n`
      );
      process.exit(1);
    }
    // Continue into the existing dispatch — word:// ops now route through bridge.
  }

  await hashlineReady;

  const PORT = parseMcpPort();

  const stack = new AsyncDisposableStack();
  try {
    installSignalHandlers(stack);

    if (bridgeAutospawnEnabled) {
      await runHost(PORT, undefined, stack);
    } else {
      let leaderResult;
      try {
        leaderResult = await bindOrForward(PORT);
      } catch (err) {
        if (err instanceof PortConflictError) {
          process.stderr.write(
            `[changedown] port :${PORT} is held by another process; ` +
            `bridge autospawn is disabled — set CHANGEDOWN_BRIDGE_AUTOSPAWN=1 ` +
            `or kill the existing process.\n`
          );
          process.exit(1);
        }
        throw err;
      }
      await runHost(PORT, leaderResult.server, stack);
    }
    // Stack disposes when signal triggers — keep loop alive until then.
    await new Promise<void>(() => {});
  } finally {
    await stack.disposeAsync();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
