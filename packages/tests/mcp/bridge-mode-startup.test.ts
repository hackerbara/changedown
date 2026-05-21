import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import * as https from 'node:https';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_BIN = path.resolve(
  __dirname,
  '../../../packages/mcp/dist/index.js',
);
const TEST_PORT = '39988';

function getHealth(port: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port: Number(port),
        path: '/health',
        method: 'GET',
        rejectUnauthorized: false,
        timeout: 1500,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body }),
        );
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('healthcheck timeout'));
    });
    req.end();
  });
}


function requestBridgePath(port: string, pathName: string, method = 'GET'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port: Number(port),
        path: pathName,
        method,
        rejectUnauthorized: false,
        timeout: 1500,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`${pathName} timeout`)));
    req.end();
  });
}

async function waitForHealth(port: string, timeoutMs = 5000) {
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await getHealth(port);
      if (r.status === 200) return r;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `bridge /health did not respond on :${port} within ${timeoutMs}ms (last err: ${String(lastErr)})`,
  );
}

describe('bridge daemon mode', () => {
  let child: ChildProcess | null = null;

  afterEach(async () => {
    if (child) {
      await new Promise<void>((resolve) => {
        if (child!.exitCode !== null || child!.signalCode !== null) { resolve(); return; }
        child!.once('exit', () => resolve());
        try { child!.kill('SIGTERM'); } catch { resolve(); }
        const sigkillTimer = setTimeout(() => {
          try { child!.kill('SIGKILL'); } catch { /* */ }
          resolve();
        }, 1000);
        sigkillTimer.unref();
      });
      child = null;
    }
    // Port release delay before next test rebinds.
    await new Promise((r) => setTimeout(r, 300));
  });

  it('starts via --bridge flag and serves /health on the configured port', async () => {
    child = spawn(process.execPath, [MCP_BIN, '--bridge'], {
      env: {
        ...process.env,
        CHANGEDOWN_MCP_PORT: TEST_PORT,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (c) => (stderr += c.toString()));

    const health = await waitForHealth(TEST_PORT).catch((e) => {
      throw new Error(`${e.message}\nbridge stderr:\n${stderr}`);
    });

    expect(health.status).toBe(200);
    const parsed = JSON.parse(health.body) as Record<string, unknown>;
    expect(parsed.service).toBe('changedown-mcp');
    expect(typeof parsed.version).toBe('string');
    expect(typeof parsed.pid).toBe('number');
    expect(parsed.mode).toBe('bridge');
    // bridgeProtocol is the marker autospawn uses to distinguish a real
    // bridge daemon from a pre-bridge MCP host squatting the port.
    expect(parsed.bridgeProtocol).toBe('1');
    expect(parsed.capabilities).not.toContain('mcp-streamable');
  });

  it('returns a fast 404 for /mcp in bridge mode', async () => {
    child = spawn(process.execPath, [MCP_BIN, '--bridge'], {
      env: {
        ...process.env,
        CHANGEDOWN_MCP_PORT: TEST_PORT,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForHealth(TEST_PORT);
    const response = await requestBridgePath(TEST_PORT, '/mcp');
    expect(response.status).toBe(404);
    expect(response.body).toContain('not found');
  });

  it('does not consume stdin in bridge mode (stdin closed should not crash it)', async () => {
    child = spawn(process.execPath, [MCP_BIN, '--bridge'], {
      env: {
        ...process.env,
        CHANGEDOWN_MCP_PORT: TEST_PORT,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForHealth(TEST_PORT);
    // Process should still be alive 250ms later even though we sent nothing on stdin.
    await new Promise((r) => setTimeout(r, 250));
    expect(child.exitCode).toBeNull();
  });
});
