import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import { ensureBridgeRunning, type AutospawnResult } from '@changedown/mcp/transport/bridge-autospawn';

const FAKE_PORT = 39987;

function makeFakeBridge(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          service: 'changedown-mcp',
          version: 'test',
          pid: process.pid,
          mode: 'bridge',
          bridgeProtocol: '1',
          capabilities: ['backend-register'],
        }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

/**
 * Fake server that responds 200 on /health but DOES NOT declare
 * bridgeProtocol — simulates a pre-bridge MCP host (older worktree,
 * unrelated MCP server, etc.) squatting the port.
 */
function makeForeignHolder(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          service: 'changedown-mcp',
          version: '0.4.0',
          pid: process.pid,
          capabilities: ['backend-register', 'mcp-streamable'],
        }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function closeServer(s: http.Server): Promise<void> {
  return new Promise((resolve) => s.close(() => resolve()));
}

describe('ensureBridgeRunning', () => {
  let server: http.Server | null = null;
  let bridgeStartTimer: NodeJS.Timeout | null = null;

  afterEach(async () => {
    if (bridgeStartTimer) {
      clearTimeout(bridgeStartTimer);
      bridgeStartTimer = null;
    }
    if (server) await closeServer(server);
    server = null;
  });

  it('returns "alive" when /health already responds', async () => {
    server = await makeFakeBridge(FAKE_PORT);
    const result: AutospawnResult = await ensureBridgeRunning({
      port: FAKE_PORT,
      probeTimeoutMs: 250,
      pollIntervalMs: 50,
      pollTimeoutMs: 1000,
      useHttps: false,
      // No spawn — if alive probe passes we should never call this.
      spawnFn: () => {
        throw new Error('spawnFn should not be called when bridge is already alive');
      },
    });
    expect(result.outcome).toBe('alive');
    expect(result.spawned).toBe(false);
  });

  it('spawns when /health is absent, then resolves once /health responds', async () => {
    let spawnCalls = 0;

    const result: AutospawnResult = await ensureBridgeRunning({
      port: FAKE_PORT,
      probeTimeoutMs: 100,
      pollIntervalMs: 50,
      pollTimeoutMs: 1500,
      useHttps: false,
      spawnFn: async () => {
        spawnCalls += 1;
        // Simulate a bridge that takes 200ms to come up.
        bridgeStartTimer = setTimeout(async () => {
          server = await makeFakeBridge(FAKE_PORT);
        }, 200);
      },
    });

    expect(spawnCalls).toBe(1);
    expect(result.outcome).toBe('spawned');
    expect(result.spawned).toBe(true);
  });

  it('returns "failed" when bridge never comes up within poll budget', async () => {
    const result: AutospawnResult = await ensureBridgeRunning({
      port: FAKE_PORT,
      probeTimeoutMs: 100,
      pollIntervalMs: 50,
      pollTimeoutMs: 400,
      useHttps: false,
      spawnFn: async () => {
        // Spawn that does nothing — bridge will never come up.
      },
    });
    expect(result.outcome).toBe('failed');
    expect(result.spawned).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('fails fast with actionable error when a non-bridge process holds the port', async () => {
    // Simulates a stale pre-bridge MCP host (e.g. lab from another worktree)
    // squatting :39990 with a /health that responds 200 but no bridgeProtocol.
    server = await makeForeignHolder(FAKE_PORT);
    const result: AutospawnResult = await ensureBridgeRunning({
      port: FAKE_PORT,
      probeTimeoutMs: 250,
      pollIntervalMs: 50,
      pollTimeoutMs: 1000,
      useHttps: false,
      spawnFn: () => {
        throw new Error('spawnFn must not be called when a foreign holder is detected');
      },
    });
    expect(result.outcome).toBe('failed');
    expect(result.spawned).toBe(false); // we did NOT spawn — fast fail
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toMatch(/non-bridge process/i);
    expect(result.error?.message).toMatch(/bridgeProtocol/);
  });
});
