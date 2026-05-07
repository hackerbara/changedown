import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRemoteRelayServer } from './remote-server-factory.js';
import type { RelayAuthContext } from './relay-context.js';
import type { PaneBackendWireRequest } from '@changedown/core/backend';

function l2ReadResult(text = 'Hello world'): unknown {
  return { text, format: 'L2', version: 'v-test' };
}

async function withClient(
  fn: (client: Client, calls: PaneBackendWireRequest[]) => Promise<void>,
  options: {
    auth?: RelayAuthContext;
    callBackendOperation?: (operation: PaneBackendWireRequest, metadata: { idempotencyKey?: string }) => Promise<unknown>;
  } = {},
) {
  const calls: PaneBackendWireRequest[] = [];
  const server = createRemoteRelayServer({
    clientInfo: { name: 'Test Agent', version: '1.0.0' },
    auth: options.auth ?? { roomId: 'room-t', role: 'write' },
    room: {
      async callBackendOperation(operation, metadata) {
        calls.push(operation);
        if (options.callBackendOperation) return options.callBackendOperation(operation, metadata);
        return { ok: true, operation, metadata };
      },
    },
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try { await fn(client, calls); } finally { await Promise.allSettled([clientTransport.close(), serverTransport.close()]); }
}

describe('remote relay MCP server', () => {
  it('lists only remote Word-safe tools with idempotency in mutating schemas', async () => {
    await withClient(async (client) => {
      const listed = await client.listTools();
      expect(listed.tools.map((t) => t.name)).toEqual(['read_tracked_file', 'list_changes', 'propose_change', 'review_changes', 'amend_change', 'supersede_change', 'resolve_thread']);
      const propose = listed.tools.find((t) => t.name === 'propose_change');
      expect(propose?.inputSchema.properties).toHaveProperty('idempotency_key');
      expect(propose?.inputSchema.required).toContain('idempotency_key');
      expect(propose?.annotations?.idempotentHint).toBe(true);
    });
  });

  it('exposes a Worker-safe remote Word-only schema surface', async () => {
    await withClient(async (client) => {
      const listed = await client.listTools();
      const read = listed.tools.find((t) => t.name === 'read_tracked_file');
      expect(read?.inputSchema.properties).toHaveProperty('include_guide');
      expect(read?.inputSchema.properties).toHaveProperty('include_meta');
      expect(read?.inputSchema.properties?.view).toMatchObject({ enum: ['working', 'simple', 'decided', 'original', 'raw'] });

      const list = listed.tools.find((t) => t.name === 'list_changes');
      expect(list?.inputSchema.properties).toHaveProperty('change_id');
      expect(list?.inputSchema.properties).toHaveProperty('change_ids');
      expect(list?.inputSchema.properties?.detail).toMatchObject({ enum: ['summary', 'context', 'full'] });

      const propose = listed.tools.find((t) => t.name === 'propose_change');
      expect(propose?.inputSchema.properties).toHaveProperty('at');
      expect(propose?.inputSchema.properties).toHaveProperty('op');
      expect(propose?.inputSchema.properties).not.toHaveProperty('changes');
      expect(propose?.inputSchema.properties).toHaveProperty('raw');
      expect(propose?.inputSchema.properties).toHaveProperty('old_text');
      expect(propose?.inputSchema.properties).toHaveProperty('new_text');
      expect(propose?.inputSchema.properties).toHaveProperty('insert_after');
      expect(propose?.inputSchema.properties).toHaveProperty('idempotency_key');

      const supersede = listed.tools.find((t) => t.name === 'supersede_change');
      expect(supersede?.inputSchema.properties).toHaveProperty('old_text');
      expect(supersede?.inputSchema.properties).toHaveProperty('new_text');
      expect(supersede?.inputSchema.properties).toHaveProperty('insert_after');
      expect(supersede?.inputSchema.properties).not.toHaveProperty('at');
      expect(supersede?.inputSchema.properties).not.toHaveProperty('op');
      expect(supersede?.inputSchema.required).toEqual(['file', 'change_id', 'old_text', 'new_text', 'idempotency_key']);
      expect(JSON.stringify(listed.tools)).not.toContain('file://');
      expect(JSON.stringify(listed.tools)).not.toContain('local paths');
      expect(JSON.stringify(listed.tools)).toContain('word://');
    });
  });

  it('dispatches calls through room client and synthesizes author from relay client info', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', old_text: 'world', new_text: 'there', idempotency_key: 'idem-1' } });
      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(3);
      expect(calls[0]).toMatchObject({ operation: { kind: 'read', ref: { uri: 'word://sess-t' } } });
      expect(calls[2]).toMatchObject({ operation: { kind: 'read', ref: { uri: 'word://sess-t' } } });
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(apply.operation.op).toMatchObject({ kind: 'propose', args: { oldL2: 'Hello world' } });
      expect(String(apply.operation.op.args.newL2)).toContain('@ai:test-agent');
      expect(JSON.stringify(apply)).not.toContain('propose_change');
      expect(JSON.stringify(apply)).not.toContain('idempotency_key');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true, changeId: 'cn-1' };
      },
    });
  });

  it('preserves an explicit author over relay client info synthesis', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', old_text: 'world', new_text: 'there', author: 'human:alice', idempotency_key: 'idem-2' } });
      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(3);
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(String(apply.operation.op.args.newL2)).toContain('@human:alice');
      expect(String(apply.operation.op.args.newL2)).not.toContain('@ai:test-agent');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true, changeId: 'cn-1' };
      },
    });
  });

  it('does not synthesize an author when the caller explicitly supplies author', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', old_text: 'world', new_text: 'there', author: '', idempotency_key: 'idem-3' } });
      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(3);
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(String(apply.operation.op.args.newL2)).not.toContain('@ai:test-agent');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true, changeId: 'cn-1' };
      },
    });
  });


  it('rejects non-word targets before room dispatch', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: '/Users/alice/private.md' } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('RemoteWordTargetRequired');
      expect(calls).toHaveLength(0);
    });
  });

  it('rejects blank idempotency keys before room dispatch', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', at: '1:abc', op: '{~~a~>b~~}', idempotency_key: '' } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('IdempotencyKeyRequired');
      expect(calls).toHaveLength(0);
    });
  });

  it('rejects mutating calls missing idempotency before room dispatch', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', at: '1:abc', op: '{~~a~>b~~}' } });
      expect(result.isError).toBe(true);
      expect(calls).toHaveLength(0);
    });
  });

  it('rejects mutating calls from read-only relay tokens before room dispatch', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', at: '1:abc', op: '{~~a~>b~~}', idempotency_key: 'idem-readonly' } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('ForbiddenReadOnlyRole');
      expect(calls).toHaveLength(0);
    }, { auth: { roomId: 'room-t', role: 'read' } });
  });

  it('propagates pane read errors before workflow formatting', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: 'word://sess-t' } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('pane-side failure');
      expect(calls).toHaveLength(1);
    }, { callBackendOperation: async () => ({ isError: true, content: [{ type: 'text', text: 'pane-side failure' }] }) });
  });

  it('returns read snapshots as model-visible tracked text with small metadata', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: 'word://sess-t' } });
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(result.isError).not.toBe(true);
      expect(content[0]?.type).toBe('text');
      expect(content[0]?.text).toContain('LINE:abc tracked markdown');
      expect(content[0]?.text).toContain('## proposed: 0 | accepted: 0 | rejected: 0');
    }, {
      callBackendOperation: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ text: 'LINE:abc tracked markdown', format: 'L2', version: '7' }) }],
      }),
    });
  });
});


describe('remote relay backend-wire boundary', () => {
  it('remote classic propose runs shared Word workflow and sends source transition to pane', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'propose_change',
        arguments: {
          file: 'word://sess-t',
          old_text: 'world',
          new_text: 'there',
          author: 'ai:codex',
          idempotency_key: 'idem-classic',
        },
      });

      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(3);
      expect(calls[0]).toMatchObject({
        operation: { kind: 'read', ref: { uri: 'word://sess-t' } },
      });
      expect(calls[2]).toMatchObject({
        operation: { kind: 'read', ref: { uri: 'word://sess-t' } },
      });
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(apply.operation.op).toMatchObject({
        kind: 'propose',
        args: {
          oldL2: 'Hello world',
        },
      });
      expect(String(apply.operation.op.args.newL2)).toContain('{~~world~>there~~}');
      expect(JSON.stringify(apply)).not.toContain('"old_text"');
      expect(JSON.stringify(apply)).not.toContain('"new_text"');
      expect(JSON.stringify(apply)).not.toContain('"at"');
      expect(JSON.stringify(apply)).not.toContain('"op":"');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true, changeId: 'cn-1' };
      },
    });
  });

  it('remote classic propose propagates pane applyChange errors instead of reporting prepared success', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'propose_change',
        arguments: {
          file: 'word://sess-t',
          old_text: 'world',
          new_text: 'there',
          author: 'ai:codex',
          idempotency_key: 'idem-pane-error',
        },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('PaneDisconnected');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read', 'applyChange']);
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { isError: true, content: [{ type: 'text', text: 'PaneDisconnected: No authorized Word pane is connected for this room.' }] };
      },
    });
  });

  it('remote supersede runs shared Word workflow and sends source transition to pane', async () => {
    const source = 'Hello {++world++}[^cn-1]\n\n[^cn-1]: @ai:codex | 2026-05-07 | ins | proposed';
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'supersede_change',
        arguments: {
          file: 'word://sess-t',
          change_id: 'cn-1',
          old_text: '',
          new_text: 'there',
          insert_after: 'Hello ',
          author: 'ai:codex',
          reason: 'replace insertion',
          idempotency_key: 'idem-supersede',
        },
      });

      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ operation: { kind: 'read', ref: { uri: 'word://sess-t' } } });
      const apply = calls[1];
      expect(apply.operation.kind).toBe('applyChange');
      if (apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(apply.operation.op).toMatchObject({ kind: 'propose', args: { oldL2: source } });
      expect(String(apply.operation.op.args.newL2)).toContain('supersedes: cn-1');
      expect(String(apply.operation.op.args.newL2)).toContain('{++there++}');
      expect(JSON.stringify(apply)).not.toContain('"at"');
      expect(JSON.stringify(apply)).not.toContain('"op":"');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult(source);
        return { applied: true, changeId: 'cn-2' };
      },
    });
  });

  it('remote classic propose treats idempotency replay text as non-applied metadata, not fresh success', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'propose_change',
        arguments: {
          file: 'word://sess-t',
          old_text: 'world',
          new_text: 'there',
          author: 'ai:codex',
          idempotency_key: 'idem-replay',
        },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('IdempotencyReplay');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read', 'applyChange']);
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return {
          content: [{ type: 'text', text: 'IdempotencyReplay: request already completed; content was not stored by the relay.' }],
          structuredContent: { idempotency: 'replayed', status: 'completed' },
        };
      },
    });
  });

  it('remote read_tracked_file returns MCP coordinate text rather than raw DocumentSnapshot JSON', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'read_tracked_file',
        arguments: { file: 'word://sess-t', view: 'working', include_guide: true },
      });

      expect(result.isError).not.toBe(true);
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content.map((item: unknown) => {
        if (!item || typeof item !== 'object') return '';
        const block = item as { type?: unknown; text?: unknown };
        return block.type === 'text' ? String(block.text ?? '') : '';
      }).join('\n');
      expect(text).toContain('LINE:HASH');
      expect(text).toContain('1:');
      expect(text).toContain('Hello world');
      expect(text).toContain('Word session');
      expect(text).not.toContain('"format":"L2"');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true };
      },
    });
  });

  it('remote read_tracked_file accepts original view like local word reads', async () => {
    await withClient(async (client) => {
      const listed = await client.listTools();
      const read = listed.tools.find((tool) => tool.name === 'read_tracked_file');
      expect(read?.inputSchema.properties?.view).toMatchObject({
        enum: expect.arrayContaining(['original']),
      });

      const result = await client.callTool({
        name: 'read_tracked_file',
        arguments: { file: 'word://sess-t', view: 'original' },
      });
      expect(result.isError).not.toBe(true);
    }, {
      callBackendOperation: async () => l2ReadResult('Hello {++new++}[^cn-1]\n\n[^cn-1]: @ai:test | now | ins | proposed'),
    });
  });
});
