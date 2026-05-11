// packages/tests/mcp-transport/client-sigterm.test.ts
import { describe, it, expect } from 'vitest';
import { spawnServer, isPortListening } from './spawn-server.js';

const PORT = 49992;

describe('Bug B — client mode exits cleanly on SIGTERM, including post-promotion', () => {
  it('SIGTERM to a client process produces exit within 500ms', async () => {
    const host = spawnServer({ port: PORT, env: { CHANGEDOWN_MCP_REQUIRE_HTTPS: '0' } });
    await host.ready;

    const client = spawnServer({
      port: PORT,
      env: { CHANGEDOWN_MCP_REQUIRE_HTTPS: '0' },
      readyPattern: /client mode/,
    });
    await client.ready;

    const t0 = Date.now();
    const result = await client.stop('SIGTERM');
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(500);
    expect(result.signal === 'SIGTERM' || result.code === 0).toBe(true);

    await host.stop('SIGTERM');
  });

  it('SIGTERM to a post-promotion zombie host produces exit within 500ms', async () => {
    // Scenario: host H + client C. Kill H. C's heartbeat detects death and
    // promotes itself to host. Then SIGTERM the now-host C. It must exit
    // cleanly — not zombie-out. This is the actual Bug B failure mode.
    const host = spawnServer({ port: PORT + 1000, env: { CHANGEDOWN_MCP_REQUIRE_HTTPS: '0' } });
    await host.ready;

    const client = spawnServer({
      port: PORT + 1000,
      env: { CHANGEDOWN_MCP_REQUIRE_HTTPS: '0' },
      readyPattern: /client mode/,
    });
    await client.ready;

    // Kill the host SIGKILL — abrupt, no graceful drain — so the client's
    // heartbeat detects death within its failThreshold * intervalMs window
    // (default 3 * 1500ms = 4.5s upper bound).
    host.proc.kill('SIGKILL');
    await new Promise<void>((resolve) => host.proc.once('exit', () => resolve()));

    // Wait for the client to promote. Look for the promotion banner in stderr.
    // The promotion code logs "host died — promoted to host mode" per
    // index.ts client-mode promotion handler.
    const promoted = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(
          `client never promoted within 8s. stderr:\n${client.stderr.join('')}`,
        ));
      }, 8000);
      const check = () => {
        if (/promoted to host mode/i.test(client.stderr.join(''))) {
          clearTimeout(timeout);
          resolve();
        }
      };
      client.proc.stderr!.on('data', check);
      check(); // in case data already arrived
    });
    await promoted;

    // Give the promotion a moment to fully install (startHostMode begins
    // returning to event loop). Then SIGTERM and time it.
    await new Promise<void>((r) => setTimeout(r, 100));

    const t0 = Date.now();
    const result = await client.stop('SIGTERM');
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(500);
    expect(result.signal === 'SIGTERM' || result.code === 0).toBe(true);

    // No port leak.
    expect(await isPortListening(PORT + 1000)).toBe(false);
  }, 15000);
});
