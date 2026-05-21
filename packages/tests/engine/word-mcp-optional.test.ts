import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Server } from 'node:http';

// The launcher reads CHANGEDOWN_MCP_USE_HTTP at module load time to set MCP_SCHEME.
// This test starts an HTTP fixture on MCP_PORT and expects probeMcpHealth to find
// it — so we must opt the launcher down to HTTP via this env var BEFORE the
// launcher module is imported. ESM static imports are hoisted, so a dynamic
// `await import(...)` after the env assignment is the only reliable way.
process.env.CHANGEDOWN_MCP_USE_HTTP = '1';
const { MCP_PORT, resolveMcpCommand, mcpStartGuidance, startMcpIfNeeded } =
  await import('@changedown/mcp/launcher');

function withMcpBin<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.CHANGEDOWN_MCP_BIN;
  if (value === undefined) delete process.env.CHANGEDOWN_MCP_BIN;
  else process.env.CHANGEDOWN_MCP_BIN = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.CHANGEDOWN_MCP_BIN;
    else process.env.CHANGEDOWN_MCP_BIN = previous;
  }
}

async function startHealthyMcpFixture(): Promise<{ server: Server } | undefined> {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'changedown-mcp' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(undefined);
      } else {
        reject(err);
      }
    });
    server.listen(MCP_PORT, '127.0.0.1', () => resolve({ server }));
  });
}

describe('word MCP optional resolution', () => {
  it('does not invent a bare changedown-mcp command when none is configured', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'changedown-no-mcp-'));
    try {
      withMcpBin(undefined, () => {
        expect(resolveMcpCommand(cwd)).toBeUndefined();
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses CHANGEDOWN_MCP_BIN when explicitly configured by environment', () => {
    withMcpBin('/env/mcp', () => {
      expect(resolveMcpCommand('/nowhere')).toEqual({ command: '/env/mcp', args: [] });
    });
  });

  it('uses explicit mcp command when provided', () => {
    expect(resolveMcpCommand('/nowhere', '/custom/mcp')).toEqual({ command: '/custom/mcp', args: [] });
  });

  it('uses repo-local MCP dist in development checkouts', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'changedown-repo-mcp-'));
    const dist = path.join(cwd, 'packages', 'mcp', 'dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.js'), '');
    try {
      withMcpBin(undefined, () => {
        const resolved = resolveMcpCommand(cwd);
        expect(resolved?.command).toBe(process.execPath);
        expect(resolved?.args).toEqual([path.join(dist, 'index.js')]);
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('guidance tells users to start their configured agent when MCP is missing', () => {
    const guidance = mcpStartGuidance();
    expect(guidance).toContain('Start your configured agent');
    expect(guidance).toContain('auto-connect');
  });

  it('dry-run treats missing MCP command as non-fatal guidance instead of printing undefined command', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'changedown-dry-no-mcp-'));
    const logs: string[] = [];
    const previousLog = console.log;
    console.log = (message?: unknown, ...optional: unknown[]) => {
      logs.push([message, ...optional].map(String).join(' '));
    };
    try {
      await withMcpBin(undefined, () => startMcpIfNeeded(cwd, undefined, true));
      expect(logs.join('\n')).toContain('Start your configured agent');
      expect(logs.join('\n')).not.toContain('undefined');
    } finally {
      console.log = previousLog;
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reuses a healthy agent-owned MCP before printing missing command guidance', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'changedown-agent-mcp-'));
    const fixture = await startHealthyMcpFixture();
    if (!fixture) return; // a developer/agent MCP already owns the fixed test port
    const logs: string[] = [];
    const previousLog = console.log;
    console.log = (message?: unknown, ...optional: unknown[]) => {
      logs.push([message, ...optional].map(String).join(' '));
    };

    try {
      const result = await withMcpBin(undefined, () => startMcpIfNeeded(cwd, undefined, false));
      expect(result).toEqual({ owned: false });
      expect(logs.join('\n')).toContain('already healthy');
      expect(logs.join('\n')).not.toContain('Start your configured agent');
    } finally {
      console.log = previousLog;
      await new Promise<void>((resolve, reject) => {
        if (!fixture?.server.listening) {
          resolve();
          return;
        }
        fixture.server.close((err) => (err ? reject(err) : resolve()));
      });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
