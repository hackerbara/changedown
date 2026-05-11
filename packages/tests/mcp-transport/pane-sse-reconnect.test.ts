// packages/tests/mcp-transport/pane-sse-reconnect.test.ts
import { describe, it, expect } from 'vitest';
import { spawnServer } from './spawn-server.js';

const PORT = 49995;

describe('Bug E — SSE reconnect within grace window does not leak keepalive', () => {
  it('keepalive frame rate after overlap returns to baseline', async () => {
    const server = spawnServer({
      port: PORT,
      env: {
        CHANGEDOWN_MCP_REQUIRE_HTTPS: '0',
        // Speed up the test by reducing keepalive interval. This env var is
        // added by Task 6.2 Step 1 below. The registration response also
        // returns the resolved value as `keepaliveMs` so the test can verify.
        CHANGEDOWN_PANE_KEEPALIVE_MS: '200',
      },
    });
    await server.ready;

    // Routes per changedown-plugin/mcp-server/src/transport/pane-endpoint.ts:
    //   POST /backend/register               — pane registers; response carries registrationId + keepaliveMs
    //   GET  /backend/stream/:registrationId — SSE stream (path segment, not query!)
    const baseUrl = `http://127.0.0.1:${PORT}`;
    const reg = await fetch(`${baseUrl}/backend/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // handleRegister validates scheme, sessionId, capabilities — all required
      body: JSON.stringify({ scheme: 'word', sessionId: 'test-session-1', capabilities: [] }),
    });
    const { registrationId, keepaliveMs } = await reg.json() as {
      registrationId: string;
      keepaliveMs: number;
    };
    expect(keepaliveMs).toBe(200); // sanity-check that the env override took effect

    const openStream = async () => {
      const ac = new AbortController();
      const stream = await fetch(`${baseUrl}/backend/stream/${registrationId}`, {
        signal: ac.signal,
      });
      return { stream, abort: () => ac.abort() };
    };

    const countKeepalivesIn = async (ms: number) => {
      const { stream, abort } = await openStream();
      let count = 0;
      const reader = stream.body!.getReader();
      const deadline = Date.now() + ms;
      const decoder = new TextDecoder();
      let buffer = '';
      while (Date.now() < deadline) {
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise<{ value: undefined; done: true }>((r) =>
            setTimeout(() => r({ value: undefined, done: true }), deadline - Date.now()),
          ),
        ]);
        if (done) break;
        buffer += decoder.decode(value);
        count += (buffer.match(/data: \{"type":"ping"\}/g) || []).length;
        buffer = '';
      }
      abort();
      return count;
    };

    // Baseline: solo stream, 1 second @ 200ms keepalive → ~5 frames.
    const baseline = await countKeepalivesIn(1000);

    // Trigger overlap: open second stream while old socket is still
    // pending grace-window close. The current bug would double the rate.
    const overlap1 = openStream();
    await new Promise<void>((r) => setTimeout(r, 100));
    const overlap2 = openStream();
    await new Promise<void>((r) => setTimeout(r, 1000));
    (await overlap1).abort();
    (await overlap2).abort();

    // After overlap, baseline should hold.
    const afterOverlap = await countKeepalivesIn(1000);

    // Allow ±50% tolerance; the bug doubles the rate (factor 2.0+).
    expect(afterOverlap).toBeGreaterThanOrEqual(Math.floor(baseline * 0.5));
    expect(afterOverlap).toBeLessThanOrEqual(Math.ceil(baseline * 1.5));

    await server.stop('SIGTERM');
  }, 15000);
});
