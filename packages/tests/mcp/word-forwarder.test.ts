import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import { registerSession, forwardWordOp } from '@changedown/mcp/transport/word-forwarder';

const FAKE_PORT = 39986;

interface FakeBridge {
  server: http.Server;
  registered: Array<{ tool: string; pid: number; sessionId: string }>;
  ops: Array<{ token: string; op: unknown }>;
}

function makeFakeBridge(port: number, opts?: { sessionExpired?: boolean }): Promise<FakeBridge> {
  return new Promise((resolve, reject) => {
    const state: FakeBridge = { server: null as unknown as http.Server, registered: [], ops: [] };
    const server = http.createServer((req, res) => {
      const commonHeaders = { 'Content-Type': 'application/json', Connection: 'close' };
      if (req.url === '/sessions' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          state.registered.push(JSON.parse(body));
          res.writeHead(200, commonHeaders);
          res.end(JSON.stringify({ token: 'a'.repeat(32) }));
        });
        return;
      }
      const opMatch = req.url?.match(/^\/sessions\/([a-f0-9]{32})\/word-ops$/);
      if (opMatch && req.method === 'POST') {
        const capturedToken = opMatch[1]!;
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          if (opts?.sessionExpired) {
            res.writeHead(404, { Connection: 'close' }); res.end(JSON.stringify({ error: 'session not found or expired' }));
            return;
          }
          const parsed = JSON.parse(body) as unknown;
          state.ops.push({ token: capturedToken, op: parsed });
          res.writeHead(200, commonHeaders);
          res.end(JSON.stringify({ ok: true, echoed: parsed }));
        });
        return;
      }
      res.writeHead(404, { Connection: 'close' }); res.end();
    });
    server.listen(port, '127.0.0.1', () => {
      state.server = server;
      resolve(state);
    });
    server.on('error', reject);
  });
}

function close(s: http.Server): Promise<void> {
  return new Promise((r) => s.close(() => r()));
}

describe('word-forwarder', () => {
  let fake: FakeBridge | null = null;
  afterEach(async () => {
    if (fake) await close(fake.server);
    fake = null;
  });

  it('registerSession POSTs metadata and returns the token', async () => {
    fake = await makeFakeBridge(FAKE_PORT);
    const { token } = await registerSession({
      port: FAKE_PORT,
      meta: { tool: 'claude-code', pid: 9999, sessionId: 'session-x' },
      useHttps: false,
    });
    expect(token).toBe('a'.repeat(32));
    expect(fake.registered).toEqual([{ tool: 'claude-code', pid: 9999, sessionId: 'session-x' }]);
  });

  it('forwardWordOp POSTs the op to the session route and returns the response body', async () => {
    fake = await makeFakeBridge(FAKE_PORT);
    const result = await forwardWordOp({
      port: FAKE_PORT,
      token: 'a'.repeat(32),
      op: { kind: 'read_tracked_file', uri: 'word://doc-1/file.md' },
      useHttps: false,
    });
    expect(result).toEqual({ ok: true, echoed: { kind: 'read_tracked_file', uri: 'word://doc-1/file.md' } });
    expect(fake.ops).toHaveLength(1);
  });

  it('forwardWordOp throws a SessionExpiredError on 404', async () => {
    fake = await makeFakeBridge(FAKE_PORT, { sessionExpired: true });
    await expect(
      forwardWordOp({
        port: FAKE_PORT,
        token: 'a'.repeat(32),
        op: { kind: 'read_tracked_file', uri: 'word://doc-1/file.md' },
        useHttps: false,
      }),
    ).rejects.toThrow(/session/);
  });
});
