// packages/tests/mcp/fixed-port-leader.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import * as net from 'node:net';
import { AddressInfo } from 'node:net';
import { bindOrForward, HttpsRequiredError, PortConflictError } from '@changedown/mcp/transport/fixed-port-leader';
import { installSignalHandlers } from '@changedown/mcp/transport/signals';

// Helper: spin up a fake "other changedown-mcp" that owns a port
function fakeChangedownHost(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          service: 'changedown-mcp',
          version: '0.1.0',
          capabilities: ['backend-register', 'mcp-streamable'],
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

// Helper: spin up a fake server that returns a non-changedown /health response
function fakeOtherHost(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ service: 'some-other-app' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      server.close((err) => err ? reject(err) : resolve(port));
    });
  });
}

describe('bindOrForward', () => {
  const servers: http.Server[] = [];
  let testPort: number;

  beforeEach(async () => {
    testPort = await getFreePort();
  });
  afterEach(async () => {
    await Promise.all(servers.map(closeServer));
    servers.length = 0;
  });

  it('hosted pane mode allows the HTTP loopback path when caller opts out of HTTPS', async () => {
    // HTTPS is the default after the 2026-05-16 scheme refactor. Callers that
    // want HTTP must explicitly pass requireHttps:false (the production path
    // does this via the --http CLI flag → prefersHttps() returns false).
    const originalPaneMode = process.env.CHANGEDOWN_PANE_MODE;
    try {
      process.env.CHANGEDOWN_PANE_MODE = 'hosted';
      const result = await bindOrForward(testPort, { useHttps: false, requireHttps: false });
      expect(result.mode).toBe('host');
      if (result.mode === 'host') servers.push(result.server);
    } finally {
      if (originalPaneMode === undefined) delete process.env.CHANGEDOWN_PANE_MODE;
      else process.env.CHANGEDOWN_PANE_MODE = originalPaneMode;
    }
  });

  it('explicit HTTPS-required fallback refuses HTTP', async () => {
    await expect(bindOrForward(testPort, { useHttps: false, requireHttps: true })).rejects.toBeInstanceOf(HttpsRequiredError);
  });

  it('returns {mode: "host"} and a bound server when port is free', async () => {
    const result = await bindOrForward(testPort, { useHttps: false, requireHttps: false });
    expect(result.mode).toBe('host');
    if (result.mode === 'host') {
      servers.push(result.server);
      const addr = result.server.address() as AddressInfo;
      expect(addr.port).toBe(testPort);
      expect(addr.address).toBe('127.0.0.1');
    }
  });

  it('throws PortConflictError when a changedown-mcp already holds the port', async () => {
    const fake = await fakeChangedownHost(testPort);
    servers.push(fake);

    await expect(bindOrForward(testPort, { useHttps: false, requireHttps: false })).rejects.toBeInstanceOf(PortConflictError);
  });

  it('throws PortConflictError when the port holder is NOT a changedown-mcp', async () => {
    const fake = await fakeOtherHost(testPort);
    servers.push(fake);

    await expect(bindOrForward(testPort, { useHttps: false, requireHttps: false })).rejects.toThrow('PortConflictError');
  });

  // Helper: fake foreign service that exposes pid in /health
  function fakeForeignWithPid(port: number, pid: number, service = 'some-other-app'): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => {
        if (req.url === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ service, pid, version: '0.0.1', capabilities: [] }));
        } else { res.writeHead(404); res.end(); }
      });
      s.listen(port, '127.0.0.1', () => resolve(s));
      s.on('error', reject);
    });
  }

  // Helper: fake same-service leader on a wrong-scheme (HTTP, when caller expects HTTPS)
  function fakeChangedownHttpWithPid(port: number, pid: number): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => {
        if (req.url === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            service: 'changedown-mcp', version: '0.4.0', pid,
            capabilities: ['backend-register', 'mcp-streamable'],
          }));
        } else { res.writeHead(404); res.end(); }
      });
      s.listen(port, '127.0.0.1', () => resolve(s));
      s.on('error', reject);
    });
  }

  it('PortConflictError message includes the foreign service PID when /health exposes it', async () => {
    const fakePid = 99999;
    const fake = await fakeForeignWithPid(testPort, fakePid);
    servers.push(fake);

    try {
      await bindOrForward(testPort, { useHttps: false, requireHttps: false });
      throw new Error('should have thrown PortConflictError');
    } catch (err) {
      expect((err as Error).name).toBe('PortConflictError');
      expect((err as Error).message).toContain(String(fakePid));
      expect((err as Error).message).toContain('some-other-app');
      expect((err as Error).message).toMatch(/kill\s+99999/i);
    }
  });

  it('PortConflictError reports scheme mismatch when same-service leader is on the wrong scheme', async () => {
    // HTTP-only changedown-mcp leader; new spawn requires HTTPS.
    const fakePid = 88888;
    const fake = await fakeChangedownHttpWithPid(testPort, fakePid);
    servers.push(fake);

    try {
      // requireHttps + !devCerts forces the no-bind probe path (line 222-237 region).
      // No devCerts in test env → goes through that path. Probe HTTPS first → fails
      // (server is HTTP). New code falls back to HTTP probe → identifies our service
      // on wrong scheme → throws PortConflictError with pid + scheme info.
      await bindOrForward(testPort, { useHttps: true, requireHttps: true });
      throw new Error('should have thrown PortConflictError');
    } catch (err) {
      // Allow either PortConflictError (new behavior) or HttpsRequiredError (if dev
      // certs are unexpectedly available in the test env and we go down the bind path
      // — but then EADDRINUSE catch should ALSO produce PortConflictError).
      expect((err as Error).name).toBe('PortConflictError');
      const msg = (err as Error).message;
      expect(msg).toContain(String(fakePid));
      expect(msg).toMatch(/http/i);
      expect(msg).toMatch(/https/i);
      expect(msg).toContain('changedown-mcp');
    }
  });

  it('PortConflictError constructor: structured fields are populated for callers', () => {
    const err = new PortConflictError(39990, 'changedown-mcp', 12345, 'http', 'https');
    expect(err.port).toBe(39990);
    expect(err.service).toBe('changedown-mcp');
    expect(err.conflictPid).toBe(12345);
    expect(err.conflictScheme).toBe('http');
    expect(err.expectedScheme).toBe('https');
    expect(err.message).toContain('12345');
    expect(err.message).toContain('http');
    expect(err.message).toContain('https');
    expect(err.message).toMatch(/kill\s+12345/i);
  });

  it('installSignalHandlers: stdin-end triggers stack.disposeAsync() and process.exit(0)', async () => {
    // stdin / signal handling was extracted from bindOrForward into signals.ts
    // (commit 742f917e6). This test covers installSignalHandlers directly.

    // Save existing stdin listeners so we can restore them after the test.
    const stdinEndListeners = process.stdin.listeners('end').slice();
    const stdinErrorListeners = process.stdin.listeners('error').slice();
    process.stdin.removeAllListeners('end');
    process.stdin.removeAllListeners('error');

    let disposed = false;
    const stack = new AsyncDisposableStack();
    stack.defer(() => { disposed = true; });

    // Mock process.exit before installing handlers so the call is intercepted.
    const exitCalls: number[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCalls.push(code ?? 0);
    }) as any);

    installSignalHandlers(stack);

    // Emit 'end' on stdin to simulate parent (Claude Code) pipe closure.
    // installSignalHandlers registers an 'end' listener that calls stack.disposeAsync()
    // which then calls process.exit(0).
    process.stdin.emit('end');

    // disposeAsync is async — wait a tick for it to resolve and call process.exit.
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(disposed).toBe(true);
    expect(exitCalls).toContain(0);

    // Restore original stdin listeners.
    process.stdin.removeAllListeners('end');
    process.stdin.removeAllListeners('error');
    for (const l of stdinEndListeners) process.stdin.on('end', l as (...args: unknown[]) => void);
    for (const l of stdinErrorListeners) process.stdin.on('error', l as (...args: unknown[]) => void);
    exitSpy.mockRestore();
  });
});
