// MCP-side helper: register a session with the local bridge and forward
// word:// ops through it. Used by stdio MCP processes when the bridge
// auto-spawn path is enabled (default-on; opt out via CHANGEDOWN_BRIDGE_AUTOSPAWN=0).
//
// Design doc: docs/superpowers/specs/2026-05-15-changedown-mcp-bridge-split-design.md

import * as https from 'node:https';
import * as http from 'node:http';
import { prefersHttps } from './fixed-port-leader.js';

/** Shape of a word:// operation envelope forwarded from MCP tool handlers. */
export interface WordOpEnvelope {
  kind: string;
  uri: string;
  args?: Record<string, unknown>;
}

export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export interface RegisterSessionOptions {
  port: number;
  meta: { tool: string; pid: number; sessionId: string };
  /** TLS toggle for tests using plain http. Default: HTTPS with rejectUnauthorized=false. */
  useHttps?: boolean;
}

export interface ForwardWordOpOptions {
  port: number;
  token: string;
  op: WordOpEnvelope;
  useHttps?: boolean;
}

interface JsonResponse {
  status: number;
  body: string;
}

function postJson(opts: {
  host: string;
  port: number;
  path: string;
  body: string;
  useHttps: boolean;
  timeoutMs: number;
}): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const lib = opts.useHttps ? https : http;
    const req = lib.request(
      {
        host: opts.host,
        port: opts.port,
        path: opts.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(opts.body).toString(),
        },
        rejectUnauthorized: false,
        timeout: opts.timeoutMs,
      } as https.RequestOptions,
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });
    req.write(opts.body);
    req.end();
  });
}

export async function registerSession(
  opts: RegisterSessionOptions,
): Promise<{ token: string }> {
  const useHttps = typeof opts.useHttps === 'boolean' ? opts.useHttps : prefersHttps();
  const r = await postJson({
    host: '127.0.0.1',
    port: opts.port,
    path: '/sessions',
    body: JSON.stringify(opts.meta),
    useHttps,
    timeoutMs: 1500,
  });
  if (r.status !== 200) {
    throw new Error(`session register failed: HTTP ${r.status} ${r.body}`);
  }
  return JSON.parse(r.body) as { token: string };
}

export async function forwardWordOp(
  opts: ForwardWordOpOptions,
): Promise<unknown> {
  const useHttps = typeof opts.useHttps === 'boolean' ? opts.useHttps : prefersHttps();
  const r = await postJson({
    host: '127.0.0.1',
    port: opts.port,
    path: `/sessions/${opts.token}/word-ops`,
    body: JSON.stringify(opts.op),
    useHttps,
    timeoutMs: 30_000,
  });
  if (r.status === 404) {
    throw new SessionExpiredError(`bridge returned 404 for session ${opts.token}`);
  }
  if (r.status !== 200) {
    throw new Error(`word-op forward failed: HTTP ${r.status} ${r.body}`);
  }
  return JSON.parse(r.body);
}
