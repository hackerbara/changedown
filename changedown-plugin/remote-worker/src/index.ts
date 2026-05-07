export { RoomDurableObject } from './room/room-do.js';
import { deriveRoleToken, parseRelayToken, queryTokenHeaders, roleFromRelayToken, roomIdFromRelayLikeToken, tokenFromRequest } from './auth.js';
import { corsPreflightResponse, validateOrigin, withCorsHeaders } from './origin.js';
import { handleMcpJsonRpcRoute, handleStatelessRoutes, type Env } from './routes.js';
import { listRemoteToolsViaMcp } from '@changedown/mcp/remote-worker';

function parseOrigins(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function originsForRequest(request: Request, env: Env): string[] {
  const path = new URL(request.url).pathname;
  if (path === '/pane') return parseOrigins(env.PANE_ALLOWED_ORIGINS ?? env.ALLOWED_ORIGINS);
  return parseOrigins(env.API_ALLOWED_ORIGINS ?? env.ALLOWED_ORIGINS);
}

async function roomRequestContext(request: Request): Promise<{ roomId: string } | Response | null> {
  const url = new URL(request.url);
  const isPaneUpgrade = url.pathname === '/pane' && request.headers.get('Upgrade') === 'websocket';
  const statusRoomId = roomStatusId(url.pathname);
  const claimRoomId = roomClaimId(url.pathname);
  const releaseRoomId = roomReleaseId(url.pathname);
  if (!isPaneUpgrade && !statusRoomId && !claimRoomId && !releaseRoomId) return null;

  if (claimRoomId && request.method === 'POST' && !tokenFromRequest(request)) return { roomId: claimRoomId };

  const rawToken = tokenFromRequest(request);
  const roomId = roomIdFromRelayLikeToken(rawToken);
  if (!roomId) return new Response('Unauthorized', { status: 401, headers: queryTokenHeaders(request) });
  if (statusRoomId && roomId !== statusRoomId) return new Response('Room token mismatch', { status: 403, headers: queryTokenHeaders(request) });
  if (claimRoomId && roomId !== claimRoomId) return new Response('Room token mismatch', { status: 403, headers: queryTokenHeaders(request) });
  if (releaseRoomId && roomId !== releaseRoomId) return new Response('Room token mismatch', { status: 403, headers: queryTokenHeaders(request) });
  return { roomId };
}


async function maybeMintRoomToken(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/room-token' || request.method !== 'POST') return null;
  const body = await request.json().catch(() => null) as { token?: unknown; role?: unknown } | null;
  const parsed = parseRelayToken(typeof body?.token === 'string' ? body.token : null);
  const role = body?.role;
  if (!parsed || roleFromRelayToken(parsed) !== 'owner' || (role !== 'read' && role !== 'write')) {
    return json({ error: 'InvalidRoomTokenRequest' }, 400, noStoreHeaders(request));
  }
  return json({ roomId: parsed.roomId, role, token: await deriveRoleToken(parsed, role) }, 200, noStoreHeaders(request));
}

function roomStatusId(pathname: string): string | null {
  const match = pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,128})\/status$/);
  return match?.[1] ?? null;
}

function roomClaimId(pathname: string): string | null {
  const match = pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,128})\/claim$/);
  return match?.[1] ?? null;
}

function roomReleaseId(pathname: string): string | null {
  const match = pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,128})\/release$/);
  return match?.[1] ?? null;
}

function frontRoomId(pathname: string): string | null {
  const match = pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,128})$/);
  return match?.[1] ?? null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

async function compressedSkillPrompt(base: string, roomId: string): Promise<string> {
  const tools = await listRemoteToolsViaMcp({
    clientInfo: { name: 'front-room', version: '0.0.0' },
    auth: { roomId, role: 'owner' },
    room: {
      async callBackendOperation() {
        return { isError: true, content: [{ type: 'text', text: 'FrontRoomPromptOnly: this prompt context cannot dispatch pane operations.' }] };
      },
    },
  });
  const names = tools.tools.map((tool) => tool.name).join(', ');
  return [
    `Base URL: ${base}`,
    'Authorization: Bearer <room token>',
    'Active target: word://sess-... (read first to confirm the current session).',
    `Tools: ${names}`,
    'Workflow: call read_tracked_file before edits; use list_changes when deciding what to review.',
    'Writes: include Idempotency-Key; retrying the same key should return content-free replay metadata.',
    'Results: handle MCP-shaped isError/content/structuredContent/json fields; do not assume HTTP 200 means success.',
    'Privacy: do not store document text, local paths, raw tokens, token fingerprints, or query-token URLs in durable notes.',
  ].join('\n');
}

async function maybeFrontRoom(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return null;
  const roomId = frontRoomId(url.pathname);
  if (!roomId) return null;
  const base = `${url.protocol}//${url.host}`;
  const statusUrl = `${base}/room/${encodeURIComponent(roomId)}/status`;
  const paneUrl = `${base}/pane`;
  const prompt = await compressedSkillPrompt(base, roomId);
  const body = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>ChangeDown remote room</title></head>
<body>
<h1>ChangeDown remote room</h1>
<p>Room <code>${escapeHtml(roomId)}</code>. This browser page is a debug/status fallback only; it does not claim the room.</p>
<p>Open the Word pane and click Check rooms to claim an available public room. The pane will mint a fresh per-claim owner token and provide one Copy for agent packet. Keep bearer tokens out of durable notes and screenshots.</p>
<h2>Word pane cloud config</h2>
<pre>changedownRelayUrl=${escapeHtml(paneUrl)}
changedownRelayToken=&lt;paste room token&gt;</pre>
<h2>Status</h2>
<pre>GET ${escapeHtml(statusUrl)}
Authorization: Bearer &lt;room token&gt;</pre>
<h2>HTTP tools</h2>
<pre>GET ${escapeHtml(base)}/tools
GET ${escapeHtml(base)}/openapi.json
POST ${escapeHtml(base)}/tools/read_tracked_file
Authorization: Bearer &lt;room token&gt;</pre>
<h2>Skill prompt</h2>
<pre>${escapeHtml(prompt)}</pre>
</body></html>`;
  const headers = noStoreHeaders(request);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(body, { status: 200, headers });
}

function noStoreHeaders(request: Request): Headers {
  const headers = new Headers(queryTokenHeaders(request));
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  return headers;
}

function withQueryTokenHeaders(request: Request, response: Response): Response {
  const extra = queryTokenHeaders(request);
  if (!Object.keys(extra).length) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(body: unknown, status: number, headers = new Headers()): Response {
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

async function maybeForwardRoomRequest(request: Request, env: Env): Promise<Response | null> {
  const context = await roomRequestContext(request);
  if (context === null) return null;
  if (context instanceof Response) return context;
  if (!env.ROOMS) return new Response('Room binding unavailable', { status: 503, headers: queryTokenHeaders(request) });

  const url = new URL(request.url);
  const id = env.ROOMS.idFromName(context.roomId);
  const stub = env.ROOMS.get(id);
  const response = await stub.fetch(request);
  if (url.pathname === '/pane') return response;
  if (!Object.keys(queryTokenHeaders(request)).length) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(queryTokenHeaders(request))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = originsForRequest(request, env);
    const preflightResponse = corsPreflightResponse(request, allowedOrigins);
    if (preflightResponse) return preflightResponse;

    const originError = validateOrigin(request, allowedOrigins);
    if (originError) return withQueryTokenHeaders(request, originError);

    const tokenResponse = await maybeMintRoomToken(request);
    if (tokenResponse) return withCorsHeaders(request, allowedOrigins, tokenResponse);

    const frontRoomResponse = await maybeFrontRoom(request, env);
    if (frontRoomResponse) return withCorsHeaders(request, allowedOrigins, frontRoomResponse);

    const mcpResponse = await handleMcpJsonRpcRoute(request, env);
    if (mcpResponse) return withCorsHeaders(request, allowedOrigins, mcpResponse);

    const roomResponse = await maybeForwardRoomRequest(request, env);
    if (roomResponse) {
      const url = new URL(request.url);
      if (url.pathname === '/pane' && request.headers.get('Upgrade') === 'websocket') return roomResponse;
      return withCorsHeaders(request, allowedOrigins, roomResponse);
    }

    return withCorsHeaders(request, allowedOrigins, await handleStatelessRoutes(request, env));
  },
};
