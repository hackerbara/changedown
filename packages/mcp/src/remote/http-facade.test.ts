import { describe, expect, it } from 'vitest';
import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { handleRemoteHttpFacade, type RemoteMcpOperations } from './http-facade.js';
import type { RelayRequestContext } from './relay-context.js';

function ctx(calls: Array<{ name: string; args: Record<string, unknown>; idempotencyKey?: string }>): RelayRequestContext {
  return {
    clientInfo: { name: 'HTTP Agent', version: '1.0.0' },
    auth: { roomId: 'room-http', role: 'write' },
    room: {
      async callBackendOperation(operation, metadata) {
        const lowered = operation.operation.kind === 'applyChange'
          ? { name: operation.operation.op.kind, args: operation.operation.op.args, idempotencyKey: metadata.idempotencyKey }
          : {
              name: operation.operation.kind,
              args: 'page' in operation.operation
                ? operation.operation.page
                : 'options' in operation.operation ? operation.operation.options ?? {} : {},
              idempotencyKey: metadata.idempotencyKey,
            };
        calls.push(lowered);
        if (operation.operation.kind === 'read') return { text: 'Hello world', format: 'L2', version: 'v-http' };
        return { ok: true, operation };
      },
    },
  };
}

function sentinelMcp(events: Array<{ op: string; name?: string; args?: Record<string, unknown> }>): RemoteMcpOperations {
  const listed: ListToolsResult = {
    tools: [
      {
        name: 'sentinel_tool',
        description: 'Sentinel tool proving HTTP derives from MCP listTools.',
        inputSchema: {
          type: 'object',
          properties: {
            sentinel_arg: { type: 'string' },
          },
          required: ['sentinel_arg'],
        },
        annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
      },
    ],
  };

  return {
    async listTools() {
      events.push({ op: 'listTools' });
      return listed;
    },
    async callTool(_ctx, name, args) {
      events.push({ op: 'callTool', name, args });
      return { content: [{ type: 'text', text: JSON.stringify({ sentinel: true, name, args }) }] } satisfies CallToolResult;
    },
  };
}

async function readJson(response: Response | null) {
  expect(response).not.toBeNull();
  return JSON.parse(await response!.text());
}

describe('remote HTTP facade', () => {
  it('derives /tools from MCP listTools instead of importing a parallel catalog', async () => {
    const events: Array<{ op: string; name?: string; args?: Record<string, unknown> }> = [];
    const response = await handleRemoteHttpFacade(new Request('https://relay.test/tools'), ctx([]), sentinelMcp(events));
    const body = await readJson(response);
    expect(events).toEqual([{ op: 'listTools' }]);
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['sentinel_tool']);
    expect(body.tools[0].inputSchema.properties).toHaveProperty('sentinel_arg');
  });

  it('derives /openapi.json paths from MCP listTools output', async () => {
    const events: Array<{ op: string; name?: string; args?: Record<string, unknown> }> = [];
    const response = await handleRemoteHttpFacade(new Request('https://relay.test/openapi.json'), ctx([]), sentinelMcp(events));
    const body = await readJson(response);
    expect(events).toEqual([{ op: 'listTools' }]);
    expect(Object.keys(body.paths)).toEqual(['/tools/sentinel_tool']);
    expect(body.paths['/tools/sentinel_tool'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('sentinel_arg');
    expect(body.paths['/tools/sentinel_tool'].post['x-mcp-annotations'].idempotentHint).toBe(true);
  });

  it('dispatches /tools/:name through MCP callTool and injects idempotency header', async () => {
    const events: Array<{ op: string; name?: string; args?: Record<string, unknown> }> = [];
    const request = new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'idem-http' },
      body: JSON.stringify({ file: 'word://sess-http', old_text: 'world', new_text: 'there' }),
    });
    const response = await handleRemoteHttpFacade(request, ctx([]), sentinelMcp(events));
    const body = await readJson(response);
    expect(body.isError).toBe(false);
    expect(body).not.toHaveProperty('json');
    expect(body.content).toEqual([{ type: 'text', text: JSON.stringify({ sentinel: true, name: 'propose_change', args: { file: 'word://sess-http', old_text: 'world', new_text: 'there', idempotency_key: 'idem-http' } }) }]);
    expect(events).toEqual([{ op: 'callTool', name: 'propose_change', args: { file: 'word://sess-http', old_text: 'world', new_text: 'there', idempotency_key: 'idem-http' } }]);
  });

  it('allows GET only for read_tracked_file using query arguments', async () => {
    const events: Array<{ op: string; name?: string; args?: Record<string, unknown> }> = [];
    const request = new Request('https://relay.test/tools/read_tracked_file?file=word%3A%2F%2Fsess-http&view=working&limit=25');
    const response = await handleRemoteHttpFacade(request, ctx([]), sentinelMcp(events));
    const body = await readJson(response);
    expect(body.isError).toBe(false);
    expect(events).toEqual([{
      op: 'callTool',
      name: 'read_tracked_file',
      args: { file: 'word://sess-http', view: 'working', limit: 25 },
    }]);
  });

  it('drops public GET read diagnostic query flags instead of forwarding them', async () => {
    const events: Array<{ op: string; name?: string; args?: Record<string, unknown> }> = [];
    const request = new Request('https://relay.test/tools/read_tracked_file?file=word%3A%2F%2Fsess-http&debug=true&diagnostics=false&native=true');
    const response = await handleRemoteHttpFacade(request, ctx([]), sentinelMcp(events));
    const body = await readJson(response);
    expect(body.isError).toBe(false);
    expect(events).toEqual([{
      op: 'callTool',
      name: 'read_tracked_file',
      args: { file: 'word://sess-http' },
    }]);
  });

  it('does not allow GET for mutating tool paths', async () => {
    const events: Array<{ op: string; name?: string; args?: Record<string, unknown> }> = [];
    const response = await handleRemoteHttpFacade(new Request('https://relay.test/tools/propose_change?file=word%3A%2F%2Fsess-http'), ctx([]), sentinelMcp(events));
    expect(response).toBeNull();
    expect(events).toEqual([]);
  });

  it('uses the production MCP path to preserve remote Word schema and author synthesis', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown>; idempotencyKey?: string }> = [];
    const response = await handleRemoteHttpFacade(new Request('https://relay.test/tools'), ctx(calls));
    const toolsBody = await readJson(response);
    expect(toolsBody.tools.map((t: { name: string }) => t.name)).toEqual([
      'read_tracked_file',
      'list_changes',
      'propose_change',
      'review_changes',
      'amend_change',
      'supersede_change',
      'resolve_thread',
    ]);
    expect(toolsBody.tools.find((t: { name: string }) => t.name === 'propose_change').inputSchema.properties).toHaveProperty('idempotency_key');

    const request = new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'idem-http' },
      body: JSON.stringify({ file: 'word://sess-http', old_text: 'world', new_text: 'there' }),
    });
    const callResponse = await handleRemoteHttpFacade(request, ctx(calls));
    const callBody = await readJson(callResponse);
    expect(callBody.isError).toBe(false);
    expect(calls).toHaveLength(3);
    expect(calls[0].name).toBe('read');
    expect(calls[1].name).toBe('propose');
    expect(calls[1].idempotencyKey).toBe('idem-http');
    expect(String(calls[1].args.newL2)).toContain('@ai:http-agent');
    expect(calls[2].name).toBe('read');
  });

  it('derives production /openapi.json paths from canonical MCP listTools', async () => {
    const response = await handleRemoteHttpFacade(new Request('https://relay.test/openapi.json'), ctx([]));
    const body = await readJson(response);
    expect(body.paths['/tools/propose_change'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('idempotency_key');
    expect(body.paths['/tools/propose_change'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('old_text');
    expect(body.paths['/tools/propose_change'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('new_text');
    expect(body.paths['/tools/propose_change'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('at');
    expect(body.paths['/tools/propose_change'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('op');
    expect(body.paths['/tools/propose_change'].post['x-mcp-annotations'].idempotentHint).toBe(true);
    expect(body.paths['/tools/read_tracked_file'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('include_guide');
    expect(body.paths['/tools/read_tracked_file'].post.requestBody.content['application/json'].schema.properties).not.toHaveProperty('debug');
    expect(body.paths['/tools/read_tracked_file'].post.requestBody.content['application/json'].schema.properties).not.toHaveProperty('diagnostics');
    expect(body.paths['/tools/read_tracked_file'].post.requestBody.content['application/json'].schema.properties).not.toHaveProperty('native');
    expect(body.paths['/tools/read_tracked_file'].post.responses['200'].content['application/json'].schema.properties).not.toHaveProperty('json');
    expect(body.paths).not.toHaveProperty(['/tools/read', 'tracked', 'page'].join('_'));
    expect(body.paths).not.toHaveProperty(['/tools/list', 'changes', 'page'].join('_'));
  });

  it('uses HTTP idempotency header over body idempotency while preserving explicit author', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown>; idempotencyKey?: string }> = [];
    const request = new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'idem-header' },
      body: JSON.stringify({ file: 'word://sess-http', old_text: 'world', new_text: 'there', author: 'human:alice', idempotency_key: 'idem-body' }),
    });
    const response = await handleRemoteHttpFacade(request, ctx(calls));
    const body = await readJson(response);
    expect(body.isError).toBe(false);
    expect(calls).toHaveLength(3);
    expect(calls[1].idempotencyKey).toBe('idem-header');
    expect(String(calls[1].args.newL2)).toContain('@human:alice');
  });

  it('uses a body idempotency key only when no HTTP idempotency header is present', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown>; idempotencyKey?: string }> = [];
    const request = new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: 'word://sess-http', old_text: 'world', new_text: 'there', idempotency_key: 'idem-body' }),
    });
    const response = await handleRemoteHttpFacade(request, ctx(calls));
    const body = await readJson(response);
    expect(body.isError).toBe(false);
    expect(calls).toHaveLength(3);
    expect(calls[1].idempotencyKey).toBe('idem-body');
  });

  it('does not allow a blank body idempotency key to bypass a missing header', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown>; idempotencyKey?: string }> = [];
    const request = new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: 'word://sess-http', at: '1:abc', op: '{~~a~>b~~}', idempotency_key: '' }),
    });
    const response = await handleRemoteHttpFacade(request, ctx(calls));
    const body = await readJson(response);
    expect(response?.status).toBe(200);
    expect(body.isError).toBe(true);
    expect(JSON.stringify(body.content)).toContain('IdempotencyKeyRequired');
    expect(calls).toHaveLength(0);
  });

  it('returns MCP-shaped tool errors instead of mapping them to HTTP failure by default', async () => {
    const request = new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: 'word://sess-http', at: '1:abc', op: '{~~a~>b~~}' }),
    });
    const response = await handleRemoteHttpFacade(request, ctx([]));
    expect(response?.status).toBe(200);
    const body = await readJson(response);
    expect(body.isError).toBe(true);
    expect(body.content[0].text).toContain('IdempotencyKeyRequired');
  });

  it('returns 400 for invalid JSON objects before MCP dispatch', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown>; idempotencyKey?: string }> = [];
    const request = new Request('https://relay.test/tools/propose_change', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(['not', 'object']),
    });
    const response = await handleRemoteHttpFacade(request, ctx(calls));
    expect(response?.status).toBe(400);
    expect(await readJson(response)).toEqual({ error: 'InvalidJsonObject' });
    expect(calls).toEqual([]);
  });

  it('returns null for routes outside the facade', async () => {
    await expect(handleRemoteHttpFacade(new Request('https://relay.test/health'), ctx([]))).resolves.toBeNull();
  });
});
