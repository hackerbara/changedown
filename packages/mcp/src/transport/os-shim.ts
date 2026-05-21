/**
 * Cross-platform helpers for port diagnostics.
 * This is the single permitted process.platform === 'win32' branch in mcp-server.
 *
 * Design doc: docs/superpowers/specs/2026-05-16-mcp-stdio-handling-redesign.md (W-4)
 */

import { execSync } from 'node:child_process';

const EXEC_OPTS = {
  stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'],
  timeout: 1000,
  encoding: 'utf8' as const,
};

/**
 * Identify the process bound to a TCP port.
 * Returns a short single-line description like "PID 85230 (node)" or
 * `undefined` if the tool is unavailable, the port is unbound, or any
 * error occurs. Always fails safe to `undefined`.
 */
export function describeForeignHolder(port: number): string | undefined {
  try {
    if (process.platform === 'win32') {
      return describeOnWindows(port);
    }
    if (process.platform === 'linux' || process.platform === 'darwin') {
      return describeOnUnix(port);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hint for user-facing error messages about how to investigate a held port.
 * Platform-appropriate command string.
 */
export function portDiagnosticHint(port: number): string {
  if (process.platform === 'win32') {
    return `netstat -ano | findstr :${port}`;
  }
  return `lsof -i :${port} -P -n -sTCP:LISTEN`;
}

function describeOnUnix(port: number): string | undefined {
  const out = execSync(
    `lsof -i :${port} -P -n -sTCP:LISTEN`,
    EXEC_OPTS,
  );
  const line = out.split('\n').find((l) => l.includes('LISTEN'));
  if (!line) return undefined;
  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return undefined;
  return `PID ${parts[1]} (${parts[0]})`;
}

function describeOnWindows(port: number): string | undefined {
  const netstatOut = execSync(
    `netstat -ano | findstr :${port}`,
    EXEC_OPTS,
  );
  const listenLine = netstatOut
    .split('\n')
    .map((l) => l.replace(/\r/g, '').trim())
    .find((l) => l.includes('LISTENING') && l.includes(`:${port}`));
  if (!listenLine) return undefined;
  const parts = listenLine.split(/\s+/).filter(Boolean);
  const pid = parts[parts.length - 1];
  if (!pid || !/^\d+$/.test(pid)) return undefined;

  const tasklistOut = execSync(
    `tasklist /FI "PID eq ${pid}"`,
    EXEC_OPTS,
  );
  const taskLine = tasklistOut
    .split('\n')
    .map((l) => l.replace(/\r/g, '').trim())
    .find((l) => l.includes(pid));
  if (!taskLine) return `PID ${pid}`;
  const taskParts = taskLine.split(/\s+/).filter(Boolean);
  const imageName = taskParts[0] ?? 'unknown';
  return `PID ${pid} (${imageName})`;
}
