import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { version } from '../version.js';
import { callRemoteToolViaMcp, listRemoteToolsViaMcp } from './mcp-inmemory-client.js';
import { openApiFromMcpTools } from './openapi-from-mcp.js';
import type { RelayRequestContext } from './relay-context.js';

export interface RemoteMcpOperations {
  listTools(ctx: RelayRequestContext): Promise<ListToolsResult>;
  callTool(ctx: RelayRequestContext, name: string, args: Record<string, unknown>): Promise<CallToolResult>;
}

const DEFAULT_REMOTE_MCP_OPERATIONS: RemoteMcpOperations = {
  listTools: listRemoteToolsViaMcp,
  callTool: callRemoteToolViaMcp,
};

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeToolResult(name: string, result: CallToolResult): Record<string, unknown> {
  return {
    tool: name,
    isError: result.isError === true,
    content: result.content,
    structuredContent: result.structuredContent ?? null,
  };
}

function idempotencyFromHeaders(request: Request): string | undefined {
  return request.headers.get('Idempotency-Key') ?? request.headers.get('X-Idempotency-Key') ?? undefined;
}

function toolNameFromPath(pathname: string): string {
  return decodeURIComponent(pathname.slice('/tools/'.length));
}

function readTrackedFileArgsFromQuery(url: URL): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'token') continue;
    if ((key === 'offset' || key === 'limit') && value.trim().length > 0) {
      const numeric = Number(value);
      args[key] = Number.isFinite(numeric) ? numeric : value;
      continue;
    }
    if (key === 'debug' || key === 'diagnostics' || key === 'native') {
      continue;
    }
    if (
      key === 'include_guide' ||
      key === 'include_meta'
    ) {
      args[key] = value === 'true' ? true : value === 'false' ? false : value;
      continue;
    }
    args[key] = value;
  }
  return args;
}

export async function handleRemoteHttpFacade(
  request: Request,
  ctx: RelayRequestContext,
  mcp: RemoteMcpOperations = DEFAULT_REMOTE_MCP_OPERATIONS,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/tools') {
    return json(await mcp.listTools(ctx));
  }

  if (request.method === 'GET' && url.pathname === '/openapi.json') {
    const listed = await mcp.listTools(ctx);
    return json(openApiFromMcpTools(listed.tools, { title: 'ChangeDown Remote Word Tools', version }));
  }

  if (request.method === 'GET' && url.pathname === '/tools/read_tracked_file') {
    const result = await mcp.callTool(ctx, 'read_tracked_file', readTrackedFileArgsFromQuery(url));
    return json(normalizeToolResult('read_tracked_file', result));
  }

  if (request.method === 'POST' && url.pathname.startsWith('/tools/')) {
    const name = toolNameFromPath(url.pathname);
    const body = await request.json().catch(() => null);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'InvalidJsonObject' }, { status: 400 });
    }

    const args = { ...(body as Record<string, unknown>) };
    const idempotencyKey = idempotencyFromHeaders(request);
    if (idempotencyKey !== undefined) args.idempotency_key = idempotencyKey;

    const result = await mcp.callTool(ctx, name, args);
    return json(normalizeToolResult(name, result));
  }

  return null;
}
