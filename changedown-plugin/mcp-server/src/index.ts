#!/usr/bin/env node

import {
  initHashline,
} from '@changedown/core';

import { bindOrForward } from './transport/fixed-port-leader.js';
import { installSignalHandlers } from './transport/signals.js';
import { runHost } from './host-mode.js';
import { runClient } from './client-mode.js';

/**
 * ChangeDown MCP Server
 *
 * Performs leader election on port 39990. If this process wins the port it
 * becomes the host: wires the full registry + tool dispatch, attaches MCP
 * Streamable HTTP and pane endpoints, and serves Claude Code over stdio.
 *
 * If the port is already held by another changedown-mcp process this process
 * becomes a client: it forwards all stdio traffic to the host via HTTP and
 * starts a heartbeat to promote itself if the host dies.
 */
async function main(): Promise<void> {
  await initHashline();

  const PORT = Number.parseInt(process.env.CHANGEDOWN_MCP_PORT ?? '39990', 10);
  if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
    throw new Error(`Invalid CHANGEDOWN_MCP_PORT: ${process.env.CHANGEDOWN_MCP_PORT}`);
  }

  const stack = new AsyncDisposableStack();
  try {
    installSignalHandlers(stack);

    const leaderResult = await bindOrForward(PORT);

    if (leaderResult.mode === 'client') {
      await runClient(PORT, leaderResult, stack);
      return;
    }

    await runHost(PORT, leaderResult.server, stack);
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
