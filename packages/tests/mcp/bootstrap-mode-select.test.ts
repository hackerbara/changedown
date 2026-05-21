// packages/tests/mcp/bootstrap-mode-select.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import * as http from 'node:http';
import * as path from 'node:path';

const MCP_BIN = path.resolve(
  process.cwd(),
  '../../packages/mcp/dist/index.js',
);
const TEST_PORT = 39997;

function waitForStdoutLine(proc: ChildProcess, pattern: RegExp, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for stdout pattern: ${pattern}`)), timeoutMs);
    const check = (chunk: Buffer) => {
      const line = chunk.toString();
      if (pattern.test(line)) {
        clearTimeout(timer);
        proc.stdout!.removeListener('data', check);
        resolve(line.trim());
      }
    };
    proc.stdout!.on('data', check);
  });
}

function waitForLine(proc: ChildProcess, pattern: RegExp, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for pattern: ${pattern}`)), timeoutMs);
    const check = (chunk: Buffer) => {
      const line = chunk.toString();
      if (pattern.test(line)) {
        clearTimeout(timer);
        proc.stderr!.removeListener('data', check);
        resolve(line.trim());
      }
    };
    proc.stderr!.on('data', check);
  });
}

async function probeHealth(): Promise<{ service: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: '127.0.0.1', port: TEST_PORT, path: '/health', timeout: 2000 },
      (res) => {
        let raw = '';
        res.on('data', (c: string) => { raw += c; });
        res.on('end', () => resolve(JSON.parse(raw) as { service: string }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('health timeout')); });
  });
}

describe('bootstrap mode-select', () => {
  const procs: ChildProcess[] = [];

  afterEach(async () => {
    const exits = procs.map((p) => new Promise<void>((resolve) => {
      if (p.exitCode !== null || p.signalCode !== null) {
        resolve();
        return;
      }
      p.once('exit', () => resolve());
      try { p.kill('SIGTERM'); } catch { resolve(); }
      setTimeout(() => {
        if (p.exitCode === null && p.signalCode === null) {
          try { p.kill('SIGKILL'); } catch { /* already exited */ }
        }
        resolve();
      }, 1000).unref();
    }));
    await Promise.all(exits);
    procs.length = 0;
    // Allow the test port to free up
    await new Promise((res) => setTimeout(res, 300));
  });

  function childEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      CHANGEDOWN_PROJECT_DIR: '/tmp',
      CHANGEDOWN_MCP_PORT: String(TEST_PORT),
      CHANGEDOWN_MCP_USE_HTTP: '1',
      // Bridge autospawn is default-ON. These tests exercise the
      // standalone autospawn-off host path, so opt out explicitly.
      CHANGEDOWN_BRIDGE_AUTOSPAWN: '0',
    };
  }

  it('first process becomes host and /health responds with changedown-mcp identity', async () => {
    const proc = spawn(process.execPath, [MCP_BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv(),
    });
    procs.push(proc);

    // Wait for host to log its ready message
    await waitForLine(proc, new RegExp(`host mode.*${TEST_PORT}|running.*${TEST_PORT}`, 'i'));

    const health = await probeHealth();
    expect(health.service).toBe('changedown-mcp');
  }, 10000);


  it('autospawn-off with a port conflict exits with non-zero code and clear stderr', async () => {
    const host = spawn(process.execPath, [MCP_BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv(),
    });
    procs.push(host);
    await waitForLine(host, new RegExp(`host mode.*${TEST_PORT}|running.*${TEST_PORT}`, 'i'));

    const second = spawn(process.execPath, [MCP_BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv(),
    });
    procs.push(second);

    const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      let stderr = '';
      second.stderr!.on('data', (c: Buffer) => { stderr += c.toString(); });
      second.once('exit', (code) => resolve({ code, stderr }));
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/port.*held.*another process|bridge autospawn is disabled/i);
  }, 10000);


  it('default autospawn-on responds to tools/list on local stdio while bridge owns the port', async () => {
    const port = TEST_PORT + 1;
    const proc = spawn(process.execPath, [MCP_BIN, '--http'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CHANGEDOWN_PROJECT_DIR: '/tmp',
        CHANGEDOWN_MCP_PORT: String(port),
        CHANGEDOWN_MCP_USE_HTTP: '1',
      },
    });
    procs.push(proc);

    await waitForLine(proc, /stdio active, bridge on/i, 10000);

    const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
    proc.stdin!.write(init + '\n');
    await waitForStdoutLine(proc, /"id":1/, 5000);

    const listMsg = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    proc.stdin!.write(listMsg + '\n');
    const listLine = await waitForStdoutLine(proc, /"id":2/, 5000);
    const parsed = JSON.parse(listLine) as { result?: { tools?: Array<{ name: string }> } };
    expect(parsed.result?.tools?.map((t) => t.name)).toContain('propose_change');

    await new Promise<void>((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/health', timeout: 2000 }, (res) => {
        let raw = '';
        res.on('data', (c: string) => { raw += c; });
        res.on('end', () => {
          const health = JSON.parse(raw) as { bridgeProtocol?: string; pid?: number };
          try {
            expect(health.bridgeProtocol).toBe('1');
            expect(health.pid).not.toBe(proc.pid);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('health timeout')); });
    });
  }, 15000);

});
