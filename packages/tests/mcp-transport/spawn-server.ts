// packages/tests/mcp-transport/spawn-server.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// dist path relative to packages/tests/mcp-transport → monorepo root → changedown-plugin
const MCP_DIST = join(
  __dirname,
  '../../../changedown-plugin/mcp-server/dist/index.js',
);

export interface ServerHandle {
  proc: ChildProcess;
  /** Resolves when the server logs its "running" banner to stderr. */
  ready: Promise<void>;
  /** Send SIGTERM and resolve when proc exits (or 3 s timeout → SIGKILL). */
  stop(signal?: NodeJS.Signals): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Captured stderr lines for assertions. */
  stderr: string[];
}

export interface SpawnOptions {
  /** Override the fixed port. Use a unique high port per test (e.g. 49990 + index). */
  port: number;
  /** Pass-through env vars (CHANGEDOWN_MCP_REQUIRE_HTTPS, etc). */
  env?: NodeJS.ProcessEnv;
  /** Banner regex to match in stderr to consider the server ready. */
  readyPattern?: RegExp;
}

// Matches: "changedown MCP server running — host on 127.0.0.1:<port>, stdio active"
// The en-dash (—) is U+2014. Pattern only needs to match the host-mode banner
// because on a fresh unique port the server will always win leader election.
const DEFAULT_READY_PATTERN = /running — (?:host|client)/;

export function spawnServer(opts: SpawnOptions): ServerHandle {
  const stderr: string[] = [];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CHANGEDOWN_MCP_PORT: String(opts.port),
    ...opts.env,
  };

  const proc = spawn('node', [MCP_DIST], { env, stdio: ['pipe', 'pipe', 'pipe'] });

  const ready = new Promise<void>((resolve, reject) => {
    const pattern = opts.readyPattern ?? DEFAULT_READY_PATTERN;
    const timeout = setTimeout(() => {
      reject(new Error(`server failed to become ready within 5s. stderr:\n${stderr.join('')}`));
    }, 5000);
    proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr.push(text);
      if (pattern.test(text)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before ready (code=${code}, signal=${signal}). stderr:\n${stderr.join('')}`));
    });
  });

  const stop = (signal: NodeJS.Signals = 'SIGTERM') =>
    new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      if (proc.exitCode != null || proc.signalCode != null) {
        resolve({ code: proc.exitCode, signal: proc.signalCode });
        return;
      }
      const kill = setTimeout(() => {
        proc.kill('SIGKILL');
      }, 3000);
      proc.once('exit', (code, sig) => {
        clearTimeout(kill);
        resolve({ code, signal: sig });
      });
      proc.kill(signal);
    });

  return { proc, ready, stop, stderr };
}

/** Probe loopback for TCP listen. Returns true if anything is listening. */
export async function isPortListening(port: number): Promise<boolean> {
  const { createConnection } = await import('node:net');
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: '127.0.0.1' });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
  });
}
