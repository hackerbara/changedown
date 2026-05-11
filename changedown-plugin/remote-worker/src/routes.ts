import { callRemoteToolViaMcp, handleRemoteHttpFacade, listRemoteToolsViaMcp, type RemoteMcpOperations } from '@changedown/mcp/remote-worker';
import type { RelayRequestContext } from '@changedown/mcp/remote-worker';
import { parseRelayToken, queryTokenHeaders, roleFromRelayToken, tokenFromRequest } from './auth.js';
import { callRoomBackendOperation } from './room/room-client.js';
import { verifyLeaseToken } from './room/token.js';

export type { RemoteMcpOperations as WorkerMcpOperations };

export interface Env {
  ROOMS?: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  PANE_ALLOWED_ORIGINS?: string;
  API_ALLOWED_ORIGINS?: string;
  RELAY_TOKEN_SIGNING_KEY?: string;
}

function clientInfoFromRequest(request: Request): RelayRequestContext['clientInfo'] {
  const raw = request.headers.get('X-Agent-Id') ?? 'http-facade';
  return { name: raw.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase(), version: '0.0.0' };
}

function idempotencyFromHeaders(request: Request): string | undefined {
  return request.headers.get('Idempotency-Key') ?? request.headers.get('X-Idempotency-Key') ?? undefined;
}

async function relayContext(request: Request, env: Env, dispatchAvailable: boolean): Promise<RelayRequestContext | Response> {
  const rawToken = tokenFromRequest(request);
  const parsed = parseRelayToken(rawToken);
  const lease = parsed || !rawToken
    ? null
    : await verifyLeaseToken(rawToken, env.RELAY_TOKEN_SIGNING_KEY ?? '');
  if (!parsed && rawToken?.startsWith('cdr2.') && !env.RELAY_TOKEN_SIGNING_KEY) {
    return new Response('RelaySigningUnavailable', { status: 503, headers: queryTokenHeaders(request) });
  }
  if ((!parsed && !lease) || !rawToken) return new Response('Unauthorized', { status: 401, headers: queryTokenHeaders(request) });
  if (lease && lease.expiresAt <= Date.now()) return new Response('Unauthorized', { status: 401, headers: queryTokenHeaders(request) });

  const role = lease?.role ?? roleFromRelayToken(parsed!);
  const roomId = lease?.roomId ?? parsed!.roomId;
  const base = {
    clientInfo: clientInfoFromRequest(request),
    auth: { roomId, role },
  };

  if (!dispatchAvailable) {
    return {
      ...base,
      room: {
        async callBackendOperation() {
          return { isError: true, content: [{ type: 'text', text: 'PaneDispatchNotWired: stateless route cannot dispatch pane tools.' }], structuredContent: { code: 'PaneDispatchNotWired' } };
        },
      },
    };
  }

  const rooms = env.ROOMS;
  if (!rooms) return new Response('Room binding unavailable', { status: 503, headers: queryTokenHeaders(request) });
  return {
    ...base,
    room: {
      async callBackendOperation(operation, metadata) {
        const stub = rooms.get(rooms.idFromName(roomId));
        return callRoomBackendOperation(stub, { token: rawToken, idempotencyKey: metadata.idempotencyKey, operation });
      },
    },
  };
}

function withQueryTokenHeaders(request: Request, response: Response): Response {
  const extra = queryTokenHeaders(request);
  if (!Object.keys(extra).length) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withNoStoreHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function handleStatelessRoutes(
  request: Request,
  env: Env,
  mcp?: RemoteMcpOperations,
): Promise<Response> {
  const url = new URL(request.url);
  const isStateless = (request.method === 'GET' && url.pathname === '/tools') || (request.method === 'GET' && url.pathname === '/openapi.json');
  const isReadOnlyFetchToolCall = request.method === 'GET' && url.pathname === '/tools/read_tracked_file';
  const isPaneToolCall = request.method === 'POST' && url.pathname.startsWith('/tools/');
  if (!isStateless && !isReadOnlyFetchToolCall && !isPaneToolCall) {
    return new Response('not found', { status: 404, headers: queryTokenHeaders(request) });
  }

  const ctx = await relayContext(request, env, isReadOnlyFetchToolCall || isPaneToolCall);
  if (ctx instanceof Response) return ctx;

  const facade = await handleRemoteHttpFacade(request, ctx, mcp);
  if (!facade) return new Response('not found', { status: 404, headers: queryTokenHeaders(request) });
  if (isReadOnlyFetchToolCall) return withNoStoreHeaders(facade);
  return withQueryTokenHeaders(request, facade);
}


interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function jsonRpcHeaders(request: Request): Headers {
  const headers = new Headers(queryTokenHeaders(request));
  headers.set('content-type', 'application/json; charset=utf-8');
  return headers;
}

function jsonRpcResponse(request: Request, id: JsonRpcRequest['id'], result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result }), { headers: jsonRpcHeaders(request) });
}

function jsonRpcError(request: Request, id: JsonRpcRequest['id'], code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), { status: 200, headers: jsonRpcHeaders(request) });
}

export async function handleMcpJsonRpcRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/mcp' || request.method !== 'POST') return null;
  const message = await request.json().catch(() => null) as JsonRpcRequest | null;
  if (!message || typeof message.method !== 'string') return jsonRpcError(request, null, -32600, 'Invalid Request');

  if (message.method === 'initialize') {
    return jsonRpcResponse(request, message.id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'changedown-remote-word', version: '0.0.0' },
    });
  }

  if (message.method === 'notifications/initialized') return new Response(null, { status: 202, headers: new Headers(queryTokenHeaders(request)) });

  if (message.method === 'tools/list') {
    const ctx = await relayContext(request, env, false);
    if (ctx instanceof Response) return ctx;
    return jsonRpcResponse(request, message.id, await listRemoteToolsViaMcp(ctx));
  }

  if (message.method === 'tools/call') {
    const params = message.params ?? {};
    const name = typeof params.name === 'string' ? params.name : null;
    const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments as Record<string, unknown> : {};
    if (!name) return jsonRpcError(request, message.id, -32602, 'Missing tool name');
    const idempotencyKey = idempotencyFromHeaders(request);
    if (idempotencyKey !== undefined) args.idempotency_key = idempotencyKey;
    const ctx = await relayContext(request, env, true);
    if (ctx instanceof Response) return ctx;
    return jsonRpcResponse(request, message.id, await callRemoteToolViaMcp(ctx, name, args));
  }

  return jsonRpcError(request, message.id, -32601, `Method not found: ${message.method}`);
}
