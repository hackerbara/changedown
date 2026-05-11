import type { ClientResult, LeaderResult } from './transport/fixed-port-leader.js';
import { startClientProxy } from './transport/client-proxy.js';
import { runHost } from './host-mode.js';

export async function runClient(
  port: number,
  leader: ClientResult,
  stack: AsyncDisposableStack,
): Promise<void> {
  console.error(`[changedown] client mode — forwarding to ${leader.hostUrl}`);
  const proxy = await startClientProxy({ hostUrl: leader.hostUrl });
  stack.defer(async () => { proxy.stop(); });

  // Heartbeat + promotion: if host dies, try to become host ourselves.
  void leader.startHeartbeat({ intervalMs: 1500, failThreshold: 3 }).then(async (promoted: LeaderResult) => {
    console.error('[changedown] host died — promoted to host mode');
    proxy.stop();
    if (promoted.mode === 'host') {
      await runHost(port, promoted.server, stack);
    }
  });

  proxy.onClose(() => { void stack.disposeAsync().then(() => process.exit(0)); });
  // Hold the event loop until dispose runs.
  await new Promise<void>(() => {});
}
