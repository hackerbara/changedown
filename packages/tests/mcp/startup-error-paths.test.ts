import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import * as path from 'node:path';
import { AddressInfo } from 'node:net';

const MCP_BIN = path.resolve(
  process.cwd(),
  '../../packages/mcp/dist/index.js',
);

function fakeNonBridgeHealth(): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'not-changedown-bridge' }));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

describe('startup error paths write to stderr, not stdout', () => {
  it('bridge startup failure writes error to stderr and exits non-zero', async () => {
    const blocker = await fakeNonBridgeHealth();
    const port = (blocker.address() as AddressInfo).port;
    try {
      const proc = spawn(process.execPath, [MCP_BIN, '--http'], {
        env: {
          ...process.env,
          CHANGEDOWN_MCP_PORT: String(port),
          CHANGEDOWN_BRIDGE_AUTOSPAWN: '1',
          CHANGEDOWN_MCP_USE_HTTP: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdout: string[] = [];
      const stderr: string[] = [];
      proc.stdout!.on('data', (c: Buffer) => stdout.push(c.toString()));
      proc.stderr!.on('data', (c: Buffer) => stderr.push(c.toString()));

      const code = await new Promise<number | null>((resolve) => proc.once('exit', resolve));

      expect(code).not.toBe(0);
      expect(stdout.join('')).toBe('');
      expect(stderr.join('')).toMatch(/changedown.*fatal: could not start bridge daemon/i);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  }, 15000);
});
