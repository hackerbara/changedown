import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIdempotencyMarker, memoryIdempotencyStore } from './idempotency.js';
import { callPaneOperationWithRoomGuards, paneDisconnectedResult } from './room-dispatch.js';
import type { PaneBackendWireRequest } from '@changedown/mcp/remote-worker';
import { RoomDurableObject } from './room-do.js';
import { deriveRoleToken, parseRelayToken, sha256Base64Url } from './token.js';

const token = 'cdr1.slot-1.abcdefghijklmnopqrstuvwxyzABCDEF1234567890';

function fakeState(storage = new Map<string, unknown>()) {
  return {
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => { storage.set(key, value); },
      delete: async (key: string) => { storage.delete(key); },
    },
    getWebSockets: () => [],
    acceptWebSocket: () => undefined,
  } as never;
}

function readOperation(): PaneBackendWireRequest {
  return { protocol: 'changedown-document-backend/v1', operation: { kind: 'read', ref: { uri: 'word://sess-1' }, options: {} } };
}

function writeOperation(args: Record<string, unknown> = {}): PaneBackendWireRequest {
  return { protocol: 'changedown-document-backend/v1', operation: { kind: 'applyChange', ref: { uri: 'word://sess-1' }, op: { kind: 'propose', args } } };
}

function toolOperation(toolName: string, args: Record<string, unknown>): PaneBackendWireRequest {
  if (toolName === 'read_tracked_file' || toolName === 'list_changes') return readOperation();
  return writeOperation(args);
}

function callPaneToolWithRoomGuards(input: { toolName: string; args: Record<string, unknown>; role: 'owner' | 'read' | 'write'; store: ReturnType<typeof memoryIdempotencyStore>; dispatch: (name: string, args: Record<string, unknown>) => Promise<import('@modelcontextprotocol/sdk/types.js').CallToolResult>; now?: number }) {
  return callPaneOperationWithRoomGuards({
    operation: toolOperation(input.toolName, input.args),
    idempotencyKey: typeof input.args.idempotency_key === 'string' ? input.args.idempotency_key : undefined,
    role: input.role,
    store: input.store,
    now: input.now,
    dispatch: (operation) => input.dispatch(input.toolName, operation.operation.kind === 'applyChange' ? operation.operation.op.args : {}),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('relay token parsing', () => {
  it('accepts cdr1 room token shape', () => {
    expect(parseRelayToken(token)).toEqual({
      version: 'cdr1',
      roomId: 'slot-1',
      secret: 'abcdefghijklmnopqrstuvwxyzABCDEF1234567890',
    });
  });

  it('rejects malformed or short tokens', () => {
    expect(parseRelayToken(null)).toBeNull();
    expect(parseRelayToken('slot-1.secret')).toBeNull();
    expect(parseRelayToken('cdr1.bad/slash.abcdefghijklmnopqrstuvwxyzABCDEF1234567890')).toBeNull();
    expect(parseRelayToken('cdr1.slot-1.short')).toBeNull();
  });



  it('derives distinct role token hashes from an owner token without reusing owner privileges', async () => {
    const owner = parseRelayToken(token)!;
    const read = await deriveRoleToken(owner, 'read');
    const write = await deriveRoleToken(owner, 'write');

    expect(read).toMatch(/^cdr1\.slot-1\.read_[a-zA-Z0-9_-]{43}$/);
    expect(write).toMatch(/^cdr1\.slot-1\.write_[a-zA-Z0-9_-]{43}$/);
    expect(read).not.toBe(write);
    expect(read).not.toBe(token);
    expect(write).not.toBe(token);
  });

  it('hashes relay secrets without preserving raw token material', async () => {
    const hash = await sha256Base64Url('abcdefghijklmnopqrstuvwxyzABCDEF1234567890');
    expect(hash).toMatch(/^[a-zA-Z0-9_-]{43}$/);
    expect(hash).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('rejects derived role tokens for pane registration', async () => {
    const owner = parseRelayToken(token)!;
    const read = await deriveRoleToken(owner, 'read');
    const room = new RoomDurableObject({
      storage: { get: async () => null, put: async () => { throw new Error('owner hash must not be stored for read token'); }, delete: async () => undefined },
      getWebSockets: () => [],
      acceptWebSocket: () => { throw new Error('read token must not register pane'); },
    } as never, {});

    const response = await room.fetch(new Request(`https://room.test/pane?token=${read}`));

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('rejects a different owner token while the volatile owner binding is active', async () => {
    const otherOwner = 'cdr1.slot-1.ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210';
    const storage = new Map<string, unknown>();
    const room = new RoomDurableObject({
      storage: { get: async (key: string) => storage.get(key), put: async (key: string, value: unknown) => { storage.set(key, value); }, delete: async (key: string) => { storage.delete(key); } },
      getWebSockets: () => [],
      acceptWebSocket: () => { throw new Error('different owner must not register pane'); },
    } as never, {});

    const claim = await room.fetch(new Request(`https://room.test/room/slot-1/claim?token=${token}`, { method: 'POST' }));
    const response = await room.fetch(new Request('https://room.test/pane', { headers: { Authorization: `Bearer ${otherOwner}` } }));

    expect(claim.status).toBe(200);
    expect(response.status).toBe(403);
    expect(storage.has('room:ownerHash')).toBe(false);
  });

  it('fails closed when a durable owner binding exists but volatile token verifier state is gone', async () => {
    const storage = new Map<string, unknown>([
      ['room:ownerExpiresAt', Date.now() + 60_000],
    ]);
    const room = new RoomDurableObject({
      storage: { get: async (key: string) => storage.get(key), put: async (key: string, value: unknown) => { storage.set(key, value); }, delete: async (key: string) => { storage.delete(key); } },
      getWebSockets: () => [],
      acceptWebSocket: () => { throw new Error('rehydrated unknown owner must not register pane'); },
    } as never, {});

    const response = await room.fetch(new Request(`https://room.test/room/slot-1/claim?token=${token}`, { method: 'POST' }));

    expect(response.status).toBe(409);
    expect(await response.text()).toContain('owner authentication unavailable');
  });
});

describe('public room lease claims', () => {
  it('public claim mints a fresh owner token and blocks a second active claim', async () => {
    const room = new RoomDurableObject(fakeState(), { RELAY_TOKEN_SIGNING_KEY: 'test-signing-key' } as never);

    const first = await room.fetch(new Request('https://relay.test/room/public-1/claim', { method: 'POST' }));
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { roomId: string; token: string; expiresAt: number };
    expect(firstBody.roomId).toBe('public-1');
    expect(firstBody.token).toMatch(/^cdr2\.public-1\.[a-zA-Z0-9_-]+$/);
    expect(firstBody.expiresAt).toBeGreaterThan(Date.now());

    const second = await room.fetch(new Request('https://relay.test/room/public-1/claim', { method: 'POST' }));
    expect(second.status).toBe(409);
    expect(await second.text()).toContain('occupied');
  });

  it('release frees the active public lease immediately', async () => {
    const storage = new Map<string, unknown>();
    const room = new RoomDurableObject(fakeState(storage), { RELAY_TOKEN_SIGNING_KEY: 'test-signing-key' } as never);
    const claim = await room.fetch(new Request('https://relay.test/room/public-1/claim', { method: 'POST' }));
    const { token: ownerToken } = await claim.json() as { token: string };
    expect(JSON.stringify([...storage.entries()])).not.toContain(ownerToken);
    expect(JSON.stringify([...storage.entries()])).not.toContain('test-signing-key');

    const release = await room.fetch(new Request('https://relay.test/room/public-1/release', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    }));
    expect(release.status).toBe(200);
    expect(await release.json()).toMatchObject({ roomId: 'public-1', state: 'available' });

    const next = await room.fetch(new Request('https://relay.test/room/public-1/claim', { method: 'POST' }));
    expect(next.status).toBe(200);
    const nextBody = await next.json() as { token: string };
    expect(nextBody.token).not.toBe(ownerToken);
  });

  it('rejects stale disconnected lease tokens after reconnect grace', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    const storage = new Map<string, unknown>();
    const room = new RoomDurableObject(fakeState(storage), { RELAY_TOKEN_SIGNING_KEY: 'test-signing-key' } as never);
    const claim = await room.fetch(new Request('https://relay.test/room/public-1/claim', { method: 'POST' }));
    const { token: ownerToken } = await claim.json() as { token: string };
    const lease = storage.get('room:lease') as { roomId: string; leaseId: string; expiresAt: number };
    storage.set('room:lease', { ...lease, disconnectedAt: Date.now() });

    await vi.advanceTimersByTimeAsync(61_000);

    const staleStatus = await room.fetch(new Request('https://relay.test/room/public-1/status', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    }));
    expect(staleStatus.status).toBe(401);
    const nextClaim = await room.fetch(new Request('https://relay.test/room/public-1/claim', { method: 'POST' }));
    expect(nextClaim.status).toBe(200);
  });

  it('does not hold a public room forever when the claimed pane never connects', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    const room = new RoomDurableObject(fakeState(), { RELAY_TOKEN_SIGNING_KEY: 'test-signing-key' } as never);
    const first = await room.fetch(new Request('https://relay.test/room/public-1/claim', { method: 'POST' }));
    expect(first.status).toBe(200);

    await vi.advanceTimersByTimeAsync(61_000);

    const second = await room.fetch(new Request('https://relay.test/room/public-1/claim', { method: 'POST' }));
    expect(second.status).toBe(200);
  });

  it('does not mark a lease disconnected while another matching pane socket is still active', async () => {
    const storage = new Map<string, unknown>([
      ['room:lease', { roomId: 'public-1', leaseId: 'lease-1', expiresAt: Date.now() + 60_000 }],
    ]);
    const closed = {
      deserializeAttachment: () => ({
        kind: 'pane',
        roomId: 'public-1',
        paneId: 'pane-old',
        leaseId: 'lease-1',
        role: 'owner',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        capabilities: [],
        protocolVersion: 1,
      }),
      close: vi.fn(),
    };
    const active = {
      deserializeAttachment: () => ({
        kind: 'pane',
        roomId: 'public-1',
        paneId: 'pane-new',
        leaseId: 'lease-1',
        role: 'owner',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        capabilities: [],
        protocolVersion: 1,
      }),
      close: vi.fn(),
    };
    const room = new RoomDurableObject({
      storage: {
        get: async (key: string) => storage.get(key),
        put: async (key: string, value: unknown) => { storage.set(key, value); },
        delete: async (key: string) => { storage.delete(key); },
      },
      getWebSockets: () => [closed, active],
      acceptWebSocket: () => undefined,
    } as never, { RELAY_TOKEN_SIGNING_KEY: 'test-signing-key' } as never);

    await room.webSocketClose(closed as never);

    expect(storage.get('room:lease')).not.toHaveProperty('disconnectedAt');
    expect(closed.close).toHaveBeenCalled();
    expect(active.close).not.toHaveBeenCalled();
  });
});

describe('room idempotency markers', () => {
  it('stores idempotency markers without deterministic request body hashes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1);
    const store = memoryIdempotencyStore();
    const marker = await createIdempotencyMarker({
      key: 'idem-1',
      operationClass: 'write',
      status: 'started',
      now: 1,
      ttlMs: 1000,
    });
    await store.put(marker);
    const saved = await store.get(marker.keyHash);
    expect(saved).toMatchObject({ operationClass: 'write', status: 'started' });
    expect(saved).not.toHaveProperty('bodyHash');
    expect(JSON.stringify(saved)).not.toContain('old_text');
    expect(JSON.stringify(saved)).not.toContain('new_text');
  });

  it('stores only key hash, operation class, status, timestamps, and sanitized error codes', async () => {
    const marker = await createIdempotencyMarker({
      key: 'idem-1',
      operationClass: 'write',
      status: 'completed',
      now: 1_000,
      ttlMs: 60_000,
    });

    expect(Object.keys(marker)).toEqual(['keyHash', 'operationClass', 'status', 'createdAt', 'expiresAt']);
    expect(JSON.stringify(marker)).not.toContain('old_text');
    expect(JSON.stringify(marker)).not.toContain('new_text');
    expect(JSON.stringify(marker)).not.toContain('secret old');
    expect(JSON.stringify(marker)).not.toContain('secret new');
  });

  it('ignores expired markers and allows the key to dispatch again', async () => {
    const store = memoryIdempotencyStore();
    await store.put(await createIdempotencyMarker({
      key: 'idem-expired',
      operationClass: 'write',
      status: 'completed',
      now: 1_000,
      ttlMs: 1,
    }));

    let dispatches = 0;
    const result = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { file: 'word://sess-1', idempotency_key: 'idem-expired' },
      role: 'write',
      store,
      now: 10_000,
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: '{"ok":true}' }] };
      },
    });

    expect(result.isError).not.toBe(true);
    expect(dispatches).toBe(1);
  });

});

describe('room guarded pane dispatch', () => {
  it('returns MCP-shaped PaneDisconnected without wrapping as success', () => {
    expect(paneDisconnectedResult()).toEqual({
      isError: true,
      content: [{ type: 'text', text: expect.stringContaining('PaneDisconnected') }],
      structuredContent: { code: 'PaneDisconnected' },
    });
  });

  it('does not require idempotency for read tools', async () => {
    const store = memoryIdempotencyStore();
    const dispatched: string[] = [];
    const result = await callPaneToolWithRoomGuards({
      toolName: 'read_tracked_file',
      args: { file: 'word://sess-1' },
      role: 'read',
      store,
      dispatch: async (name) => {
        dispatched.push(name);
        return { content: [{ type: 'text', text: '{"ok":true}' }] };
      },
    });

    expect(result.isError).not.toBe(true);
    expect(dispatched).toEqual(['read_tracked_file']);
  });

  it('rejects writes without non-blank idempotency before pane dispatch', async () => {
    const store = memoryIdempotencyStore();
    let dispatches = 0;
    const missing = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { file: 'word://sess-1' },
      role: 'write',
      store,
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: 'should not happen' }] };
      },
    });
    const blank = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { file: 'word://sess-1', idempotency_key: '   ' },
      role: 'write',
      store,
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: 'should not happen' }] };
      },
    });

    expect(missing.isError).toBe(true);
    expect(blank.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toContain('IdempotencyKeyRequired');
    expect(dispatches).toBe(0);
  });

  it('serializes same-key concurrent writes so only one dispatches', async () => {
    const store = memoryIdempotencyStore();
    let dispatches = 0;
    let releaseDispatch!: () => void;
    const gate = new Promise<void>((resolve) => { releaseDispatch = resolve; });
    const args = { file: 'word://sess-1', old_text: 'a', new_text: 'b', idempotency_key: 'idem-concurrent' };

    const first = callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args,
      role: 'write',
      store,
      dispatch: async () => {
        dispatches++;
        await gate;
        return { content: [{ type: 'text', text: '{"change_id":"cn-1"}' }] };
      },
    });
    const second = callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { ...args },
      role: 'write',
      store,
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: 'should not happen' }] };
      },
    });

    releaseDispatch();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.isError).not.toBe(true);
    expect(secondResult.structuredContent).toMatchObject({ idempotency: 'replayed', status: 'completed' });
    expect(dispatches).toBe(1);
  });

  it('replays a completed write for the same idempotency key', async () => {
    const store = memoryIdempotencyStore();
    let dispatches = 0;
    const args = { file: 'word://sess-1', old_text: 'a', new_text: 'b', idempotency_key: 'idem-1' };

    const first = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args,
      role: 'write',
      store,
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: '{"change_id":"cn-1"}' }] };
      },
    });
    const second = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { ...args, idempotency_key: 'idem-1' },
      role: 'write',
      store,
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: 'should not happen' }] };
      },
    });

    expect(first.isError).not.toBe(true);
    expect(second.isError).not.toBe(true);
    expect(second.structuredContent).toMatchObject({ idempotency: 'replayed', status: 'completed' });
    expect(dispatches).toBe(1);
  });

  it('replays same idempotency key without comparing request bodies', async () => {
    const store = memoryIdempotencyStore();
    let dispatches = 0;
    await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { file: 'word://sess-1', old_text: 'a', new_text: 'b', idempotency_key: 'idem-1' },
      role: 'write',
      store,
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: '{"change_id":"cn-1"}' }] };
      },
    });

    const replay = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { file: 'word://sess-1', old_text: 'different', new_text: 'b', idempotency_key: 'idem-1' },
      role: 'write',
      store,
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: 'should not happen' }] };
      },
    });

    expect(replay.isError).not.toBe(true);
    expect(replay.structuredContent).toMatchObject({ idempotency: 'replayed', status: 'completed' });
    expect(dispatches).toBe(1);
  });



  it('turns thrown pane dispatch failures into MCP-shaped failed markers', async () => {
    const store = memoryIdempotencyStore();
    const result = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { file: 'word://sess-1', old_text: 'a', new_text: 'b', idempotency_key: 'idem-throw' },
      role: 'write',
      store,
      dispatch: async () => {
        throw new Error('transport exploded with secret text');
      },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('PaneRpcError');
    expect(JSON.stringify(result.content)).not.toContain('secret text');

    const replay = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { file: 'word://sess-1', old_text: 'a', new_text: 'b', idempotency_key: 'idem-throw' },
      role: 'write',
      store,
      dispatch: async () => ({ content: [{ type: 'text', text: 'should not happen' }] }),
    });
    expect(replay.isError).toBe(true);
    expect(replay.structuredContent).toMatchObject({ idempotency: 'replayed', status: 'failed' });
  });

  it('preserves MCP-shaped pane RPC failures', async () => {
    const result = await callPaneToolWithRoomGuards({
      toolName: 'read_tracked_file',
      args: { file: 'word://sess-1' },
      role: 'read',
      store: memoryIdempotencyStore(),
      dispatch: async () => ({ isError: true, content: [{ type: 'text', text: 'PaneRpcError: boom' }], structuredContent: { code: 'PaneRpcError' } }),
    });

    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'PaneRpcError: boom' }], structuredContent: { code: 'PaneRpcError' } });
  });

  it('turns thrown read pane dispatch failures into MCP-shaped errors', async () => {
    const result = await callPaneToolWithRoomGuards({
      toolName: 'read_tracked_file',
      args: { file: 'word://sess-1' },
      role: 'read',
      store: memoryIdempotencyStore(),
      dispatch: async () => {
        throw new Error('socket closed');
      },
    });

    expect(result).toMatchObject({ isError: true, structuredContent: { code: 'PaneRpcError' } });
  });





  it('bounds active mutating pane RPCs to one per room', async () => {
    vi.useFakeTimers();
    const room = new RoomDurableObject({
      storage: { get: async () => null, put: async () => undefined, delete: async () => undefined },
      getWebSockets: () => [],
      acceptWebSocket: () => undefined,
    } as never, {});
    const sent: string[] = [];
    const ws = { send(message: string) { sent.push(message); }, close() {} } as never;
    const sendPaneBackendOperation = (room as unknown as { sendPaneBackendOperation(ws: WebSocket, operation: PaneBackendWireRequest, timeoutMs?: number): Promise<unknown> }).sendPaneBackendOperation.bind(room);

    const first = sendPaneBackendOperation(ws, writeOperation(), 10_000);
    const second = await sendPaneBackendOperation(ws, writeOperation({ decision: 'approve' }), 10_000);

    expect(second).toMatchObject({ isError: true, structuredContent: { code: 'PaneBackpressure' } });
    expect(sent).toHaveLength(1);
    room.webSocketClose(ws as never);
    await expect(first).resolves.toMatchObject({ isError: true, structuredContent: { code: 'PaneDisconnected' } });
  });

  it('bounds active read pane RPCs to four per room', async () => {
    vi.useFakeTimers();
    const room = new RoomDurableObject({
      storage: { get: async () => null, put: async () => undefined, delete: async () => undefined },
      getWebSockets: () => [],
      acceptWebSocket: () => undefined,
    } as never, {});
    const sent: string[] = [];
    const ws = { send(message: string) { sent.push(message); }, close() {} } as never;
    const sendPaneBackendOperation = (room as unknown as { sendPaneBackendOperation(ws: WebSocket, operation: PaneBackendWireRequest, timeoutMs?: number): Promise<unknown> }).sendPaneBackendOperation.bind(room);

    const pending = [0, 1, 2, 3].map(() => sendPaneBackendOperation(ws, readOperation(), 10_000));
    const fifth = await sendPaneBackendOperation(ws, readOperation(), 10_000);

    expect(fifth).toMatchObject({ isError: true, structuredContent: { code: 'PaneBackpressure' } });
    expect(sent).toHaveLength(4);
    room.webSocketClose(ws as never);
    await Promise.all(pending.map((item) => expect(item).resolves.toMatchObject({ isError: true, structuredContent: { code: 'PaneDisconnected' } })));
  });

  it('times out connected pane RPCs that never respond', async () => {
    vi.useFakeTimers();
    const room = new RoomDurableObject({
      storage: { get: async () => null, put: async () => undefined, delete: async () => undefined },
      getWebSockets: () => [],
      acceptWebSocket: () => undefined,
    } as never, {});
    const sent: string[] = [];
    const ws = { send(message: string) { sent.push(message); }, close() {} } as never;

    const pending = (room as unknown as { sendPaneBackendOperation(ws: WebSocket, operation: PaneBackendWireRequest, timeoutMs?: number): Promise<unknown> }).sendPaneBackendOperation(ws, readOperation(), 25);
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({ isError: true, structuredContent: { code: 'PaneRpcTimeout' } });
    expect(sent).toHaveLength(1);
  });

  it('resolves pending RPCs with MCP-shaped failure when the pane socket closes', async () => {
    const room = new RoomDurableObject({
      storage: { get: async () => null, put: async () => undefined, delete: async () => undefined },
      getWebSockets: () => [],
      acceptWebSocket: () => undefined,
    } as never, {});
    const sent: string[] = [];
    const ws = {
      send(message: string) { sent.push(message); },
      close() {},
    } as never;

    const pending = (room as unknown as { sendPaneBackendOperation(ws: WebSocket, operation: PaneBackendWireRequest): Promise<unknown> }).sendPaneBackendOperation(ws, readOperation());
    room.webSocketClose(ws as never);
    await expect(pending).resolves.toMatchObject({ isError: true, structuredContent: { code: 'PaneDisconnected' } });
    expect(sent).toHaveLength(1);
  });

  it('prevents read-role callers from dispatching write tools', async () => {
    let dispatches = 0;
    const result = await callPaneToolWithRoomGuards({
      toolName: 'propose_change',
      args: { file: 'word://sess-1', idempotency_key: 'idem-1' },
      role: 'read',
      store: memoryIdempotencyStore(),
      dispatch: async () => {
        dispatches++;
        return { content: [{ type: 'text', text: 'should not happen' }] };
      },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('ForbiddenRole');
    expect(dispatches).toBe(0);
  });

  it('fails closed when hibernated pane attachment has no volatile token authorization', async () => {
    const attachment = {
      kind: 'pane',
      roomId: 'slot-1',
      paneId: 'pane-1',
      role: 'owner',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      capabilities: ['read', 'listChanges', 'applyChange'],
      protocolVersion: 1,
    };
    const ws = {
      deserializeAttachment: () => attachment,
      send: () => { throw new Error('must not dispatch without volatile authorization'); },
      close() {},
    };
    const room = new RoomDurableObject({
      storage: { get: async () => null, put: async () => undefined, delete: async () => undefined },
      getWebSockets: () => [ws],
      acceptWebSocket: () => undefined,
    } as never, {});

    const response = await room.fetch(new Request('https://room.test/rpc', {
      method: 'POST',
      body: JSON.stringify({ token, operation: readOperation() }),
    }));
    const body = await response.json();

    expect(body).toMatchObject({ isError: true, structuredContent: { code: 'PaneAuthUnavailable' } });
    expect(JSON.stringify(attachment)).not.toContain('tokenHash');
    expect(JSON.stringify(attachment)).not.toContain('authorizedTokenHashes');
    expect(JSON.stringify(attachment)).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });
});

describe('room status endpoint', () => {
  it('marks a claimed owner room as waiting_for_pane before a pane connects', async () => {
    const storage = new Map<string, unknown>();
    const room = new RoomDurableObject({
      storage: { get: async (key: string) => storage.get(key), put: async (key: string, value: unknown) => { storage.set(key, value); }, delete: async (key: string) => { storage.delete(key); } },
      getWebSockets: () => [],
      acceptWebSocket: () => undefined,
    } as never, {});

    const claim = await room.fetch(new Request(`https://room.test/room/slot-1/claim?token=${token}`, { method: 'POST' }));
    const response = await room.fetch(new Request(`https://room.test/room/slot-1/status?token=${token}`));
    const body = await response.json();

    expect(claim.status).toBe(200);
    expect(body).toEqual({ roomId: 'slot-1', state: 'waiting_for_pane', paneCount: 0, role: 'owner' });
    expect(JSON.stringify(body)).not.toContain('hash');
    expect(storage.has('room:ownerHash')).toBe(false);
  });

  it('returns content-free room state without token-derived fingerprints', async () => {
    const room = new RoomDurableObject({
      storage: { get: async () => null, put: async () => undefined, delete: async () => undefined },
      getWebSockets: () => [],
      acceptWebSocket: () => undefined,
    } as never, {});

    const response = await room.fetch(new Request(`https://room.test/room/slot-1/status?token=${token}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ roomId: 'slot-1', state: 'available', paneCount: 0, role: 'owner' });
    expect(JSON.stringify(body)).not.toContain('hash');
    expect(JSON.stringify(body)).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('distinguishes disconnected from expired owner rooms without leaking tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T00:00:00.000Z'));
    const storage = new Map<string, unknown>();
    const room = new RoomDurableObject({
      storage: { get: async (key: string) => storage.get(key), put: async (key: string, value: unknown) => { storage.set(key, value); }, delete: async (key: string) => { storage.delete(key); } },
      getWebSockets: () => [],
      acceptWebSocket: () => undefined,
    } as never, {});

    await room.fetch(new Request(`https://room.test/room/slot-1/claim?token=${token}`, { method: 'POST' }));
    storage.set('room:everConnected', true);

    expect(await (await room.fetch(new Request(`https://room.test/room/slot-1/status?token=${token}`))).json()).toMatchObject({
      state: 'disconnected',
      paneCount: 0,
    });

    vi.setSystemTime(new Date('2026-05-06T09:00:00.000Z'));
    const expired = await (await room.fetch(new Request(`https://room.test/room/slot-1/status?token=${token}`))).json();

    expect(expired).toMatchObject({ roomId: 'slot-1', state: 'expired', paneCount: 0, role: 'owner' });
    expect(JSON.stringify(expired)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(expired)).not.toContain('hash');
  });
});
