import { describe, expect, it, vi } from 'vitest';
import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { parseRelayToken, queryTokenHeaders } from './auth.js';
import { validateOrigin } from './origin.js';
import { handleStatelessRoutes, type WorkerMcpOperations } from './routes.js';
import worker from './index.js';
import { mintLeaseToken } from './room/token.js';

const token = 'cdr1.room-1.abcdefghijklmnopqrstuvwxyzABCDEF1234567890';

function mcp(events: string[]): WorkerMcpOperations {
  return {
    async listTools() {
      events.push('listTools');
      return { tools: [{ name: 'sentinel_tool', inputSchema: { type: 'object', properties: { value: { type: 'string' } } } }] } as ListToolsResult;
    },
    async callTool(_ctx, name, args) {
      events.push(`callTool:${name}:${JSON.stringify(args)}`);
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, name, args }) }] } satisfies CallToolResult;
    },
  };
}

async function json(response: Response) {
  return JSON.parse(await response.text());
}

describe('remote worker stateless facade routes', () => {
  it('rejects missing and malformed relay tokens', () => {
    expect(parseRelayToken(null)).toBeNull();
    expect(parseRelayToken('cdr1.bad.short')).toBeNull();
    expect(parseRelayToken(token)).toMatchObject({ version: 'cdr1', roomId: 'room-1' });
  });

  it('adds no-store headers only for query-token requests', () => {
    expect(queryTokenHeaders(new Request(`https://relay.test/tools?token=${token}`))).toEqual({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    expect(queryTokenHeaders(new Request('https://relay.test/tools'))).toEqual({});
  });

  it('rejects disallowed origins when Origin is present', () => {
    expect(validateOrigin(new Request('https://relay.test/tools', { headers: { Origin: 'https://evil.test' } }), ['https://allowed.test'])?.status).toBe(403);
    expect(validateOrigin(new Request('https://relay.test/tools', { headers: { Origin: 'https://allowed.test' } }), ['https://allowed.test'])).toBeNull();
  });



  it('uses pane-specific origin allowlist separately from API origin allowlist', async () => {
    const env = {
      PANE_ALLOWED_ORIGINS: 'https://pane.test',
      API_ALLOWED_ORIGINS: 'https://api.test',
      ROOMS: { get() { throw new Error('DO must not be touched after origin rejection'); }, idFromName() { throw new Error('DO must not be touched after origin rejection'); } },
    } as never;

    const paneRejected = await worker.fetch(new Request(`https://relay.test/pane?token=${token}`, { headers: { Upgrade: 'websocket', Origin: 'https://api.test' } }), env);
    const apiRejected = await worker.fetch(new Request(`https://relay.test/tools?token=${token}`, { headers: { Origin: 'https://pane.test' } }), env);

    expect(paneRejected.status).toBe(403);
    expect(apiRejected.status).toBe(403);
    expect(paneRejected.headers.get('cache-control')).toBe('no-store');
    expect(paneRejected.headers.get('referrer-policy')).toBe('no-referrer');
    expect(apiRejected.headers.get('cache-control')).toBe('no-store');
    expect(apiRejected.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('serves /tools through MCP listTools without touching Durable Objects', async () => {
    const events: string[] = [];
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;
    const response = await handleStatelessRoutes(new Request(`https://relay.test/tools?token=${token}`), env, mcp(events));
    expect(response.status).toBe(200);
    expect(events).toEqual(['listTools']);
    expect((await json(response)).tools[0].name).toBe('sentinel_tool');
  });

  it('serves /tools with a signed public lease bearer token', async () => {
    const events: string[] = [];
    const leaseToken = await mintLeaseToken({
      roomId: 'public-1',
      leaseId: 'lease-1',
      role: 'owner',
      expiresAt: Date.now() + 60_000,
      signingKey: 'test-signing-key',
    });
    const env = {
      RELAY_TOKEN_SIGNING_KEY: 'test-signing-key',
      ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } },
    } as never;
    const response = await handleStatelessRoutes(new Request('https://relay.test/tools', {
      headers: { Authorization: `Bearer ${leaseToken}` },
    }), env, mcp(events));

    expect(response.status).toBe(200);
    expect(events).toEqual(['listTools']);
    expect((await json(response)).tools[0].name).toBe('sentinel_tool');
  });

  it('rejects expired signed public lease bearer tokens for stateless tool discovery', async () => {
    const events: string[] = [];
    const leaseToken = await mintLeaseToken({
      roomId: 'public-1',
      leaseId: 'lease-1',
      role: 'owner',
      expiresAt: 1,
      signingKey: 'test-signing-key',
    });
    const env = {
      RELAY_TOKEN_SIGNING_KEY: 'test-signing-key',
      ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } },
    } as never;

    const response = await handleStatelessRoutes(new Request('https://relay.test/tools', {
      headers: { Authorization: `Bearer ${leaseToken}` },
    }), env, mcp(events));

    expect(response.status).toBe(401);
    expect(events).toEqual([]);
  });



  it('serves stateless routes through the Worker entrypoint without touching Durable Objects', async () => {
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;
    const response = await worker.fetch(new Request(`https://relay.test/tools?token=${token}`), env);
    expect(response.status).toBe(200);
    expect((await json(response)).tools.map((tool: { name: string }) => tool.name)).toContain('read_tracked_file');
  });





  it('mints derived read and write tokens from an owner token without touching Durable Objects', async () => {
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;

    const readResponse = await worker.fetch(new Request('https://relay.test/room-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, role: 'read' }),
    }), env);
    const writeResponse = await worker.fetch(new Request('https://relay.test/room-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, role: 'write' }),
    }), env);

    expect(readResponse.status).toBe(200);
    expect(writeResponse.status).toBe(200);
    const read = await json(readResponse);
    const write = await json(writeResponse);
    expect(read).toMatchObject({ roomId: 'room-1', role: 'read' });
    expect(write).toMatchObject({ roomId: 'room-1', role: 'write' });
    expect(read.token).toMatch(/^cdr1\.room-1\.read_[a-zA-Z0-9_-]{43}$/);
    expect(write.token).toMatch(/^cdr1\.room-1\.write_[a-zA-Z0-9_-]{43}$/);
    expect(read.token).not.toBe(write.token);
    expect(read.token).not.toBe(token);
    expect(readResponse.headers.get('cache-control')).toBe('no-store');
  });

  it('does not mint elevated role tokens from a derived role token', async () => {
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;
    const read = await json(await worker.fetch(new Request('https://relay.test/room-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, role: 'read' }),
    }), env));

    const response = await worker.fetch(new Request('https://relay.test/room-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: read.token, role: 'write' }),
    }), env);

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: 'InvalidRoomTokenRequest' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('forwards /pane websocket upgrades to the room Durable Object named by the relay token', async () => {
    const calls: Array<{ op: string; name?: string; url?: string }> = [];
    const env = {
      ROOMS: {
        idFromName(name: string) {
          calls.push({ op: 'idFromName', name });
          return 'room-id';
        },
        get(id: string) {
          calls.push({ op: 'get', name: id });
          return { fetch: async (request: Request) => { calls.push({ op: 'fetch', url: request.url }); return new Response('pane-forwarded', { status: 209 }); } };
        },
      },
    } as never;

    const response = await worker.fetch(new Request(`https://relay.test/pane?token=${token}`, { headers: { Upgrade: 'websocket' } }), env);

    expect(response.status).toBe(209);
    expect(calls).toEqual([
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', url: `https://relay.test/pane?token=${token}` },
    ]);
  });



  it('returns pane websocket responses unchanged instead of wrapping away the upgrade handle', async () => {
    const webSocketResponse = { marker: 'websocket-response' } as unknown as Response;
    const env = {
      ROOMS: {
        idFromName() { return 'room-id'; },
        get() { return { fetch: async () => webSocketResponse }; },
      },
    } as never;

    const response = await worker.fetch(new Request(`https://relay.test/pane?token=${token}`, { headers: { Upgrade: 'websocket' } }), env);

    expect(response).toBe(webSocketResponse);
  });

  it('does not expose public /rpc forwarding from the Worker', async () => {
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;

    const response = await worker.fetch(new Request('https://relay.test/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, name: 'read_tracked_file', args: { file: 'word://sess-1' } }),
    }), env);

    expect(response.status).toBe(404);
  });




  it('dispatches /tools/:name through MCP facade into the room Durable Object', async () => {
    const calls: Array<{ op: string; name?: string; body?: unknown }> = [];
    const env = {
      ROOMS: {
        idFromName(name: string) { calls.push({ op: 'idFromName', name }); return 'room-id'; },
        get(id: string) {
          calls.push({ op: 'get', name: id });
          return {
            fetch: async (_request: Request | string, init?: RequestInit) => {
              const body = JSON.parse(String(init?.body));
              calls.push({ op: 'fetch', body });
              const backendKind = body.operation?.operation?.kind;
              const result = backendKind === 'read'
                ? { text: 'Hello world', format: 'L2', version: 'v-routes' }
                : { applied: true, changeId: 'cn-1' };
              return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(result) }] }), { status: 200, headers: { 'content-type': 'application/json' } });
            },
          };
        },
      },
    } as never;

    const response = await worker.fetch(new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': 'idem-tools' },
      body: JSON.stringify({ file: 'word://sess-1', old_text: 'world', new_text: 'there' }),
    }), env);

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ isError: false });
    expect(calls).toEqual([
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token, operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'read', ref: { uri: 'word://sess-1' } } } } },
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token, idempotencyKey: 'idem-tools', operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'applyChange', ref: { uri: 'word://sess-1' }, op: { kind: 'propose', args: { oldL2: 'Hello world', newL2: expect.stringContaining('{~~world~>there~~}') } } } } } },
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token, operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'read', ref: { uri: 'word://sess-1' } } } } },
    ]);
  });

  it('supports a read-only GET tool call for fetch-only agents', async () => {
    const calls: Array<{ op: string; name?: string; body?: unknown }> = [];
    const env = {
      ROOMS: {
        idFromName(name: string) { calls.push({ op: 'idFromName', name }); return 'room-id'; },
        get(id: string) {
          calls.push({ op: 'get', name: id });
          return {
            fetch: async (_request: Request | string, init?: RequestInit) => {
              const body = JSON.parse(String(init?.body));
              calls.push({ op: 'fetch', body });
              return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ text: 'Hello world', format: 'L2', version: 'v-routes' }) }] }), { status: 200, headers: { 'content-type': 'application/json' } });
            },
          };
        },
      },
    } as never;

    const response = await worker.fetch(new Request(`https://relay.test/tools/read_tracked_file?token=${token}&file=word%3A%2F%2Fsess-1&view=working`), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await json(response)).toMatchObject({ isError: false });
    expect(calls).toEqual([
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token, operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'read', ref: { uri: 'word://sess-1' } } } } },
    ]);
  });

  it('marks read-only GET tool responses no-store even when auth uses a header', async () => {
    const env = {
      ROOMS: {
        idFromName() { return 'room-id'; },
        get() {
          return {
            fetch: async () => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ text: 'Hello world' }) }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
          };
        },
      },
    } as never;

    const response = await worker.fetch(new Request('https://relay.test/tools/read_tracked_file?file=word%3A%2F%2Fsess-1', {
      headers: { Authorization: `Bearer ${token}` },
    }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('does not allow mutating tool calls over GET at the Worker route layer', async () => {
    const env = {
      ROOMS: {
        get() { throw new Error('DO must not be touched for GET mutators'); },
        idFromName() { throw new Error('DO must not be touched for GET mutators'); },
      },
    } as never;

    const response = await worker.fetch(new Request(`https://relay.test/tools/propose_change?token=${token}&file=word%3A%2F%2Fsess-1`), env);

    expect(response.status).toBe(404);
  });

  it('rejects read role tokens before dispatching mutating /tools/:name calls', async () => {
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;
    const mint = await json(await worker.fetch(new Request('https://relay.test/room-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, role: 'read' }),
    }), env));

    const response = await worker.fetch(new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${mint.token}`, 'Idempotency-Key': 'idem-tools' },
      body: JSON.stringify({ file: 'word://sess-1', old_text: 'a', new_text: 'b' }),
    }), env);

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.isError).toBe(true);
    expect(JSON.stringify(body.content)).toContain('ForbiddenReadOnlyRole');
  });

  it('does not special-case public mutating tool names before MCP lowering', async () => {
    const mint = await json(await worker.fetch(new Request('https://relay.test/room-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, role: 'read' }),
    }), { ROOMS: { get() { throw new Error('DO must not be touched while minting'); }, idFromName() { throw new Error('DO must not be touched while minting'); } } } as never));
    const calls: Array<{ op: string; name?: string; body?: unknown }> = [];
    const env = {
      ROOMS: {
        idFromName(name: string) { calls.push({ op: 'idFromName', name }); return 'room-id'; },
        get(id: string) {
          calls.push({ op: 'get', name: id });
          return {
            fetch: async (_request: Request | string, init?: RequestInit) => {
              calls.push({ op: 'fetch', body: JSON.parse(String(init?.body)) });
              return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"routed":true}' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
            },
          };
        },
      },
    } as never;

    const response = await handleStatelessRoutes(new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${mint.token}` },
      body: JSON.stringify({ file: 'word://sess-1' }),
    }), env, {
      async listTools() {
        throw new Error('listTools must not be called');
      },
      async callTool(ctx) {
        return await ctx.room.callBackendOperation({
          protocol: 'changedown-document-backend/v1',
          operation: { kind: 'read', ref: { uri: 'word://sess-1' }, options: {} },
        }, {}) as CallToolResult;
      },
    });

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ isError: false, content: [{ type: 'text', text: '{"routed":true}' }] });
    expect(calls).toEqual([
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token: mint.token, operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'read', ref: { uri: 'word://sess-1' }, options: {} } } } },
    ]);
  });



  it('serves /mcp tools/list with the same canonical tool names as /tools without touching Durable Objects', async () => {
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;
    const mcpResponse = await worker.fetch(new Request(`https://relay.test/mcp?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }), env);
    const toolsResponse = await worker.fetch(new Request(`https://relay.test/tools?token=${token}`), env);

    expect(mcpResponse.status).toBe(200);
    const mcpBody = await json(mcpResponse);
    const toolsBody = await json(toolsResponse);
    expect(mcpBody.result.tools.map((tool: { name: string }) => tool.name)).toEqual(toolsBody.tools.map((tool: { name: string }) => tool.name));
  });



  it('adds no-store headers to /mcp query-token responses', async () => {
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;
    const response = await worker.fetch(new Request(`https://relay.test/mcp?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('adds no-store headers to /mcp initialized query-token notifications', async () => {
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;
    const response = await worker.fetch(new Request(`https://relay.test/mcp?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }), env);

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('serves /mcp tools/call through canonical MCP and room dispatch', async () => {
    const calls: Array<{ op: string; name?: string; body?: unknown }> = [];
    const env = {
      ROOMS: {
        idFromName(name: string) { calls.push({ op: 'idFromName', name }); return 'room-id'; },
        get(id: string) {
          calls.push({ op: 'get', name: id });
          return { fetch: async (_request: Request | string, init?: RequestInit) => { calls.push({ op: 'fetch', body: JSON.parse(String(init?.body)) }); return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ text: 'Hello world', format: 'L2', version: 'v-routes' }) }] }), { status: 200 }); } };
        },
      },
    } as never;

    const response = await worker.fetch(new Request('https://relay.test/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'call-1', method: 'tools/call', params: { name: 'read_tracked_file', arguments: { file: 'word://sess-1' } } }),
    }), env);

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.result.isError).not.toBe(true);
    expect(calls).toEqual([
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token, operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'read', ref: { uri: 'word://sess-1' } } } } },
    ]);
  });

  it('bridges /mcp tools/call idempotency headers into remote mutating workflow metadata', async () => {
    const calls: Array<{ op: string; name?: string; body?: unknown }> = [];
    const env = {
      ROOMS: {
        idFromName(name: string) { calls.push({ op: 'idFromName', name }); return 'room-id'; },
        get(id: string) {
          calls.push({ op: 'get', name: id });
          return {
            fetch: async (_request: Request | string, init?: RequestInit) => {
              const body = JSON.parse(String(init?.body));
              calls.push({ op: 'fetch', body });
              const backendKind = body.operation?.operation?.kind;
              const result = backendKind === 'read'
                ? { text: 'Hello world', format: 'L2', version: 'v-routes' }
                : { applied: true, changeId: 'cn-1' };
              return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(result) }] }), { status: 200 });
            },
          };
        },
      },
    } as never;

    const response = await worker.fetch(new Request('https://relay.test/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': 'idem-mcp' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'call-2', method: 'tools/call', params: { name: 'propose_change', arguments: { file: 'word://sess-1', old_text: 'world', new_text: 'there' } } }),
    }), env);

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.result.isError).not.toBe(true);
    expect(calls).toEqual([
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token, operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'read', ref: { uri: 'word://sess-1' } } } } },
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token, idempotencyKey: 'idem-mcp', operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'applyChange', ref: { uri: 'word://sess-1' }, op: { kind: 'propose', args: { oldL2: 'Hello world', newL2: expect.stringContaining('{~~world~>there~~}') } } } } } },
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', body: { token, operation: { protocol: 'changedown-document-backend/v1', operation: { kind: 'read', ref: { uri: 'word://sess-1' } } } } },
    ]);
  });

  it('serves /openapi.json through MCP listTools without touching Durable Objects', async () => {
    const events: string[] = [];
    const env = { ROOMS: { get() { throw new Error('DO must not be touched'); }, idFromName() { throw new Error('DO must not be touched'); } } } as never;
    const response = await handleStatelessRoutes(new Request(`https://relay.test/openapi.json?token=${token}`), env, mcp(events));
    expect(response.status).toBe(200);
    expect(events).toEqual(['listTools']);
    expect((await json(response)).paths).toHaveProperty('/tools/sentinel_tool');
  });
});


describe('remote worker front room routes', () => {
  it('front-room debug page does not claim on GET', async () => {
    const rooms = { idFromName: vi.fn(), get: vi.fn() };
    const env = { ROOMS: rooms } as never;

    const response = await worker.fetch(new Request('https://relay.test/room/public-1'), env);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('ChangeDown remote room');
    expect(html).toContain('Open the Word pane and click Check rooms');
    expect(html).toContain('/tools/read_tracked_file');
    expect(html).toContain('GET https://relay.test/tools?token=&lt;room token&gt;');
    expect(html).toContain('GET https://relay.test/openapi.json?token=&lt;room token&gt;');
    expect(html).toContain('Read-only fetch fallback');
    expect(html).toContain('/tools/read_tracked_file?token=');
    expect(html).toContain('GET only lets an agent read');
    expect(html).toContain('propose_change');
    expect(html).toContain('Idempotency-Key');
    expect(html).not.toContain(token);
    expect(html).not.toContain('abcdefghijklmnopqrstuvwxyzABCDEF1234567890');
    expect(html).not.toContain('tokenHash');
    expect(html).not.toContain('hashPrefix');
    expect(rooms.idFromName).not.toHaveBeenCalled();
    expect(rooms.get).not.toHaveBeenCalled();
  });

  it('forwards room status to the DO and keeps token-derived fingerprints out of JSON', async () => {
    const calls: Array<{ op: string; name?: string; url?: string }> = [];
    const env = {
      ROOMS: {
        idFromName(name: string) { calls.push({ op: 'idFromName', name }); return 'room-id'; },
        get(id: string) {
          calls.push({ op: 'get', name: id });
          return { fetch: async (request: Request) => { calls.push({ op: 'fetch', url: request.url }); return new Response(JSON.stringify({ roomId: 'room-1', state: 'connected', paneCount: 1, role: 'owner' }), { status: 200, headers: { 'content-type': 'application/json' } }); } };
        },
      },
    } as never;

    const response = await worker.fetch(new Request(`https://relay.test/room/room-1/status?token=${token}`), env);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({ roomId: 'room-1', state: 'connected', paneCount: 1, role: 'owner' });
    expect(JSON.stringify(body)).not.toContain('hash');
    expect(JSON.stringify(body)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(calls).toEqual([
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', url: `https://relay.test/room/room-1/status?token=${token}` },
    ]);
  });

  it('forwards explicit room release to the room Durable Object', async () => {
    const calls: Array<{ op: string; name?: string; url?: string; method?: string }> = [];
    const env = {
      ROOMS: {
        idFromName(name: string) { calls.push({ op: 'idFromName', name }); return 'room-id'; },
        get(id: string) {
          calls.push({ op: 'get', name: id });
          return { fetch: async (request: Request) => { calls.push({ op: 'fetch', url: request.url, method: request.method }); return new Response(JSON.stringify({ roomId: 'room-1', state: 'available' }), { status: 200, headers: { 'content-type': 'application/json' } }); } };
        },
      },
    } as never;

    const response = await worker.fetch(new Request('https://relay.test/room/room-1/release', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }), env);
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ roomId: 'room-1', state: 'available' });
    expect(calls).toEqual([
      { op: 'idFromName', name: 'room-1' },
      { op: 'get', name: 'room-id' },
      { op: 'fetch', url: 'https://relay.test/room/room-1/release', method: 'POST' },
    ]);
  });

  it('adds CORS headers to occupied public claim responses for the local Word pane', async () => {
    const env = {
      API_ALLOWED_ORIGINS: 'https://127.0.0.1:3000',
      ROOMS: {
        idFromName() { return 'room-id'; },
        get() {
          return { fetch: async () => new Response('occupied', { status: 409 }) };
        },
      },
    } as never;

    const response = await worker.fetch(new Request('https://relay.test/room/public-1/claim', {
      method: 'POST',
      headers: { Origin: 'https://127.0.0.1:3000' },
    }), env);

    expect(response.status).toBe(409);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://127.0.0.1:3000');
    expect(response.headers.get('vary')).toContain('Origin');
  });

  it('answers CORS preflight for public room claims from the hosted Word pane', async () => {
    const env = {
      API_ALLOWED_ORIGINS: 'https://127.0.0.1:3000,https://changedown.com',
      ROOMS: { get() { throw new Error('DO must not be touched by preflight'); }, idFromName() { throw new Error('DO must not be touched by preflight'); } },
    } as never;

    const response = await worker.fetch(new Request('https://relay.test/room/public-1/claim', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://changedown.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    }), env);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://changedown.com');
    expect(response.headers.get('vary')).toContain('Origin');
  });

  it('answers CORS preflight for release and tool calls from the local Word pane', async () => {
    const env = {
      API_ALLOWED_ORIGINS: 'https://127.0.0.1:3000',
      ROOMS: { get() { throw new Error('DO must not be touched by preflight'); }, idFromName() { throw new Error('DO must not be touched by preflight'); } },
    } as never;

    const response = await worker.fetch(new Request('https://relay.test/room/public-1/release', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://127.0.0.1:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,idempotency-key',
      },
    }), env);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://127.0.0.1:3000');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(response.headers.get('access-control-allow-headers')).toContain('Idempotency-Key');
  });
});
