// packages/tests/mcp-transport/shutdown-port-reuse.test.ts
import { describe, it, expect } from 'vitest';
import { spawnServer, isPortListening } from './spawn-server.js';

const PORT = 49991;

describe('Bug A — host shutdown releases port within bind-retry budget', () => {
  it('second host can bind within 1s of SIGINT to first host', async () => {
    const first = spawnServer({ port: PORT, env: { CHANGEDOWN_MCP_REQUIRE_HTTPS: '0' } });
    await first.ready;
    expect(await isPortListening(PORT)).toBe(true);

    // Open a TCP connection that the server keeps alive — simulates the SSE
    // pane stream that holds sockets open and produces the TIME_WAIT case.
    const { createConnection } = await import('node:net');
    const keepalive = createConnection({ port: PORT, host: '127.0.0.1' });
    await new Promise<void>((resolve) => keepalive.once('connect', () => resolve()));

    // SIGINT — the production "Claude Code is swapping you" signal.
    // Claude Code does NOT wait for the old server to exit before respawning;
    // it fires SIGINT and immediately starts the replacement. Start timing from
    // the moment of SIGINT to capture the full port-release latency.
    const t0 = Date.now();
    first.proc.kill('SIGINT');

    // Start the second server immediately — before the first has exited.
    // This is the real race: the first server's keep-alive socket holds the
    // port in use (or TIME_WAIT) while the second server tries to bind.
    const second = spawnServer({ port: PORT, env: { CHANGEDOWN_MCP_REQUIRE_HTTPS: '0' } });
    await second.ready;
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(1000);

    // Cleanup — wait for first to exit before releasing keepalive.
    // Guard against already-exited: once('exit') never fires if the process
    // exited before this line (closeAllConnections makes that likely).
    if (first.proc.exitCode == null && first.proc.signalCode == null) {
      await new Promise<void>((resolve) => first.proc.once('exit', () => resolve()));
    }
    keepalive.destroy();
    await second.stop('SIGTERM');
  });
});
