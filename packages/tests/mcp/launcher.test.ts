// packages/tests/mcp/launcher.test.ts
// Unit tests for packages/mcp/src/launcher.ts
//
// NOTE: The plan (docs/superpowers/plans/2026-05-16-mcp-package-extraction-v2.md Task 3)
// originally placed this file at packages/mcp/src/launcher.test.ts, but the
// changetracks-testing skill explicitly maps "MCP unit tests" to
// packages/tests/mcp/*.test.ts (Vitest). That convention is followed here.
// The test:mcp script runs: cd packages/tests && npx vitest run mcp/
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Re-import helper for MCP_SCHEME (read at module load time, not reactive).
// Must resetModules so the env var is captured fresh each time.
// ---------------------------------------------------------------------------
async function reload() {
  vi.resetModules();
  return await import('@changedown/mcp/launcher');
}

// ---------------------------------------------------------------------------
// describe 1: MCP_SCHEME env-var branching
// ---------------------------------------------------------------------------
describe('MCP_SCHEME env-var branching', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.CHANGEDOWN_MCP_REQUIRE_HTTPS;
    delete process.env.CHANGEDOWN_MCP_USE_HTTPS;
    delete process.env.CHANGEDOWN_MCP_USE_HTTP;
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('defaults to https when no env vars set (matches server prefersHttps() default)', async () => {
    const m = await reload();
    expect(m.MCP_SCHEME).toBe('https');
  });

  it('keeps https when CHANGEDOWN_MCP_REQUIRE_HTTPS=1 (legacy, now redundant)', async () => {
    process.env.CHANGEDOWN_MCP_REQUIRE_HTTPS = '1';
    const m = await reload();
    expect(m.MCP_SCHEME).toBe('https');
  });

  it('keeps https when CHANGEDOWN_MCP_USE_HTTPS=1 (legacy, now redundant)', async () => {
    process.env.CHANGEDOWN_MCP_USE_HTTPS = '1';
    const m = await reload();
    expect(m.MCP_SCHEME).toBe('https');
  });

  it('opts down to http when CHANGEDOWN_MCP_USE_HTTP=1 (matches server opt-out)', async () => {
    process.env.CHANGEDOWN_MCP_USE_HTTP = '1';
    const m = await reload();
    expect(m.MCP_SCHEME).toBe('http');
  });
});

// ---------------------------------------------------------------------------
// describe 2: resolveMcpCommand precedence
// ---------------------------------------------------------------------------
import { resolveMcpCommand } from '@changedown/mcp/launcher';

describe('resolveMcpCommand precedence', () => {
  const originalEnv = { ...process.env };
  let tmpDir: string;

  beforeEach(() => {
    delete process.env.CHANGEDOWN_MCP_BIN;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-test-'));
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns explicit when provided', () => {
    const result = resolveMcpCommand(tmpDir, '/path/to/custom');
    expect(result).toEqual({ command: '/path/to/custom', args: [] });
  });

  it('returns CHANGEDOWN_MCP_BIN when set and no explicit', () => {
    process.env.CHANGEDOWN_MCP_BIN = '/env/bin/mcp';
    const result = resolveMcpCommand(tmpDir);
    expect(result).toEqual({ command: '/env/bin/mcp', args: [] });
  });

  it('returns local dist via cwd lookup when present (verifies Task 2 hardcoded path fix: packages/mcp/dist/index.js)', () => {
    // Task 2 changed the cwd-lookup path from changedown-plugin/mcp-server/dist/index.js
    // to packages/mcp/dist/index.js. This test is a regression gate for that fix.
    const distDir = path.join(tmpDir, 'packages', 'mcp', 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'index.js'), '');
    const result = resolveMcpCommand(tmpDir);
    expect(result).toEqual({ command: process.execPath, args: [path.join(distDir, 'index.js')] });
  });

  it('returns undefined when no explicit, no env, no cwd dist', () => {
    const result = resolveMcpCommand(tmpDir);
    expect(result).toBeUndefined();
  });

  it('prefers explicit over env var', () => {
    process.env.CHANGEDOWN_MCP_BIN = '/env/bin/mcp';
    const result = resolveMcpCommand(tmpDir, '/explicit/bin');
    expect(result).toEqual({ command: '/explicit/bin', args: [] });
  });
});

// ---------------------------------------------------------------------------
// describe 3: mcpStartGuidance text shape
// ---------------------------------------------------------------------------
import { mcpStartGuidance } from '@changedown/mcp/launcher';

describe('mcpStartGuidance text shape', () => {
  it('mentions HTTPS in https mode', () => {
    expect(mcpStartGuidance('https')).toContain('over HTTPS');
  });
  it('mentions diagnostic HTTP loopback in http mode', () => {
    expect(mcpStartGuidance('http')).toContain('diagnostic HTTP loopback mode');
  });
  it('always tells the user to start/restart their agent', () => {
    expect(mcpStartGuidance('https')).toMatch(/restart.*agent|agent.*restart|start your.*agent/i);
  });
});

// ---------------------------------------------------------------------------
// describe 4: probeMcpHealth against http stub server
//
// We bind the stub server on port 0 (OS-assigned) and pass the resolved port
// into probeMcpHealth's optional `port` parameter. This keeps the tests
// hermetic — they don't collide with a real MCP server running on port 39990
// (the production MCP_PORT default) in the dev environment.
// ---------------------------------------------------------------------------
import { probeMcpHealth } from '@changedown/mcp/launcher';

interface StubServer {
  server: http.Server;
  port: number;
}

function startStub(handler: http.RequestListener): Promise<StubServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('startStub: server.address() did not return AddressInfo'));
        return;
      }
      resolve({ server, port: address.port });
    });
    server.once('error', reject);
  });
}

function stop(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

/** Bind an ephemeral port, immediately release it, and return the number.
 *  Used to construct a "nothing listening" probe target. There is a tiny
 *  race window before another process might reuse the port; in practice the
 *  OS does not reuse ports immediately after close. */
function getReleasedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('getReleasedPort: server.address() did not return AddressInfo'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.once('error', reject);
  });
}

describe('probeMcpHealth', () => {
  let stub: StubServer | undefined;

  afterEach(async () => {
    if (stub) { await stop(stub.server); stub = undefined; }
  });

  it('returns ok=true for 200 + service=changedown-mcp', async () => {
    stub = await startStub((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'changedown-mcp' }));
    });
    const result = await probeMcpHealth(1500, 'http', stub.port);
    expect(result.ok).toBe(true);
    expect(result.service).toBe('changedown-mcp');
  });

  it('returns ok=false for 200 but wrong service name', async () => {
    stub = await startStub((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'other-service' }));
    });
    const result = await probeMcpHealth(1500, 'http', stub.port);
    expect(result.ok).toBe(false);
  });

  it('returns ok=false with error string when nothing listening', async () => {
    const port = await getReleasedPort();
    const result = await probeMcpHealth(500, 'http', port);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
