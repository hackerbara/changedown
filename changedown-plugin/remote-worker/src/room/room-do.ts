import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { IdempotencyStore } from './idempotency.js';
import { callPaneOperationWithRoomGuards, mcpErrorResult, paneDisconnectedResult } from './room-dispatch.js';
import { deriveRoleSecret, mintLeaseToken, parseRelayToken, roleForTokenHash, roleFromRelayToken, sha256Base64Url, verifyLeaseToken, type ParsedLeaseToken } from './token.js';
import type { PaneBackendWireRequest } from '@changedown/mcp/remote-worker';
import type { ActiveRoomLease, AuthorizedTokenHashes, IdempotencyMarker, PaneRpcRequest, PaneRpcResponse, PaneSocketAttachment, RelayRole } from './types.js';

export interface Env {
  RELAY_TOKEN_SIGNING_KEY?: string;
}

interface PendingRpc {
  resolve: (value: CallToolResult) => void;
  reject: (error: Error) => void;
  sentAt: number;
  mutating: boolean;
  pane: WebSocket;
  timeoutId: ReturnType<typeof setTimeout>;
}

const MAX_PENDING_RPC = 16;
const MAX_PENDING_READ_RPC = 4;
const MAX_PENDING_MUTATING_RPC = 1;
const PANE_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const PUBLIC_ROOM_LEASE_TTL_MS = 30 * 60 * 1000;
const PUBLIC_ROOM_RECONNECT_GRACE_MS = 60 * 1000;
const PUBLIC_ROOM_PANE_CONNECT_GRACE_MS = 60 * 1000;
const DEFAULT_RPC_TIMEOUT_MS = 30_000;
const LEGACY_ROOM_OWNER_HASH_KEY = 'room:ownerHash';
const ROOM_OWNER_EXPIRES_AT_KEY = 'room:ownerExpiresAt';
const ROOM_EVER_CONNECTED_KEY = 'room:everConnected';
const ROOM_LEASE_KEY = 'room:lease';

interface VolatileOwnerBinding {
  ownerHash: string;
  expiresAt: number;
}

export class RoomDurableObject {
  private pending = new Map<string, PendingRpc>();
  private ownerBindings = new Map<string, VolatileOwnerBinding>();
  private paneAuthorizations = new Map<string, AuthorizedTokenHashes>();

  constructor(private readonly state: DurableObjectState, private readonly _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/pane')) return this.acceptPane(request);
    if (url.pathname.endsWith('/claim') && request.method === 'POST') return this.handleClaim(request);
    if (url.pathname.endsWith('/release') && request.method === 'POST') return this.handleRelease(request);
    if (url.pathname.endsWith('/status') && request.method === 'GET') return this.handleStatus(request);
    if (url.pathname.endsWith('/rpc') && request.method === 'POST') return this.handleRpc(request);
    return new Response('not found', { status: 404 });
  }

  private async bindOwner(parsed: NonNullable<ReturnType<typeof parseRelayToken>>, now: number): Promise<Response | { expiresAt: number }> {
    const ownerHash = await sha256Base64Url(parsed.secret);
    const existingOwnerExpiresAt = (await this.state.storage.get<number>(ROOM_OWNER_EXPIRES_AT_KEY)) ?? 0;
    await this.state.storage.delete(LEGACY_ROOM_OWNER_HASH_KEY);

    const activeBinding = this.ownerBindings.get(parsed.roomId);
    if (activeBinding && activeBinding.expiresAt <= now) this.ownerBindings.delete(parsed.roomId);

    const activeOwner = existingOwnerExpiresAt > now;
    const currentBinding = this.ownerBindings.get(parsed.roomId) ?? null;
    if (currentBinding && currentBinding.ownerHash !== ownerHash) {
      return new Response('forbidden owner', { status: 403 });
    }
    if (activeOwner && !currentBinding) {
      return new Response('owner authentication unavailable', { status: 409 });
    }
    const expiresAt = now + PANE_TOKEN_TTL_MS;
    this.ownerBindings.set(parsed.roomId, { ownerHash, expiresAt });
    await this.state.storage.put(ROOM_OWNER_EXPIRES_AT_KEY, expiresAt);
    return { expiresAt };
  }

  private async authorizedTokenHashesForOwner(parsed: NonNullable<ReturnType<typeof parseRelayToken>>): Promise<AuthorizedTokenHashes> {
    const ownerHash = await sha256Base64Url(parsed.secret);
    return {
      owner: ownerHash,
      read: await sha256Base64Url(await deriveRoleSecret(parsed, 'read')),
      write: await sha256Base64Url(await deriveRoleSecret(parsed, 'write')),
    };
  }

  private signingKey(): string | null {
    return this._env.RELAY_TOKEN_SIGNING_KEY ?? null;
  }

  private async activeLease(now = Date.now()): Promise<ActiveRoomLease | null> {
    const lease = (await this.state.storage.get<ActiveRoomLease>(ROOM_LEASE_KEY)) ?? null;
    if (!lease) return null;
    if (lease.expiresAt <= now) {
      await this.state.storage.delete(ROOM_LEASE_KEY);
      return null;
    }
    return lease;
  }

  private leaseBlocksClaim(lease: ActiveRoomLease, now: number): boolean {
    if (lease.expiresAt <= now) return false;
    const claimedAt = lease.createdAt ?? lease.expiresAt - PUBLIC_ROOM_LEASE_TTL_MS;
    if (!lease.connectedAt && claimedAt + PUBLIC_ROOM_PANE_CONNECT_GRACE_MS <= now) return false;
    if (lease.disconnectedAt && lease.disconnectedAt + PUBLIC_ROOM_RECONNECT_GRACE_MS <= now) return false;
    return true;
  }

  private leaseReconnectGraceExpired(lease: ActiveRoomLease, now: number): boolean {
    return Boolean(lease.disconnectedAt && lease.disconnectedAt + PUBLIC_ROOM_RECONNECT_GRACE_MS <= now);
  }

  private leaseInitialConnectGraceExpired(lease: ActiveRoomLease, now: number): boolean {
    const claimedAt = lease.createdAt ?? lease.expiresAt - PUBLIC_ROOM_LEASE_TTL_MS;
    return !lease.connectedAt && claimedAt + PUBLIC_ROOM_PANE_CONNECT_GRACE_MS <= now;
  }

  private async verifiedLeaseToken(raw: string | null): Promise<ParsedLeaseToken | null> {
    const signingKey = this.signingKey();
    if (!signingKey) return null;
    return verifyLeaseToken(raw, signingKey);
  }

  private async verifyActiveLeaseToken(raw: string | null, requiredRoomId?: string): Promise<ParsedLeaseToken | null> {
    const now = Date.now();
    const parsed = await this.verifiedLeaseToken(raw);
    if (!parsed || parsed.expiresAt <= now) return null;
    if (requiredRoomId && parsed.roomId !== requiredRoomId) return null;
    const lease = await this.activeLease(now);
    if (!lease || lease.roomId !== parsed.roomId || lease.leaseId !== parsed.leaseId || lease.expiresAt !== parsed.expiresAt) return null;
    if (this.leaseInitialConnectGraceExpired(lease, now) || this.leaseReconnectGraceExpired(lease, now)) {
      await this.state.storage.delete(ROOM_LEASE_KEY);
      return null;
    }
    return parsed;
  }

  private async handlePublicClaim(request: Request, roomId: string): Promise<Response> {
    const signingKey = this.signingKey();
    if (!signingKey) return json(mcpErrorResult('RelaySigningUnavailable', 'Relay token signing key is not configured.'), 500);

    const now = Date.now();
    const existing = await this.activeLease(now);
    if (existing && this.leaseBlocksClaim(existing, now)) return new Response('occupied', { status: 409 });

    const lease: ActiveRoomLease = {
      roomId,
      leaseId: crypto.randomUUID(),
      createdAt: now,
      expiresAt: now + PUBLIC_ROOM_LEASE_TTL_MS,
    };
    await this.state.storage.put(ROOM_LEASE_KEY, lease);
    await this.state.storage.delete(ROOM_EVER_CONNECTED_KEY);
    const token = await mintLeaseToken({
      roomId,
      leaseId: lease.leaseId,
      role: 'owner',
      expiresAt: lease.expiresAt,
      signingKey,
    });
    const url = new URL(request.url);
    return json({ roomId, state: 'waiting_for_pane', relayUrl: `${url.protocol}//${url.host}/pane`, token, expiresAt: lease.expiresAt }, 200);
  }

  private async handleClaim(request: Request): Promise<Response> {
    const roomId = roomIdForPath(request.url, 'claim');
    const token = tokenFromRequest(request);
    if (!token && roomId && isPublicRoomId(roomId)) return this.handlePublicClaim(request, roomId);
    const parsed = parseRelayToken(token);
    if (!parsed) return new Response('unauthorized', { status: 401, headers: queryTokenHeaders(request) });
    if (roomId && parsed.roomId !== roomId) return new Response('room token mismatch', { status: 403, headers: queryTokenHeaders(request) });
    if (roleFromRelayToken(parsed) !== 'owner') return new Response('forbidden role', { status: 403, headers: queryTokenHeaders(request) });
    const bound = await this.bindOwner(parsed, Date.now());
    if (bound instanceof Response) return new Response(bound.body, { status: bound.status, statusText: bound.statusText, headers: queryTokenHeaders(request) });
    return json({ roomId: parsed.roomId, state: 'waiting_for_pane', role: 'owner' }, 200);
  }

  private async acceptPane(request: Request): Promise<Response> {
    const token = tokenFromRequest(request);
    const leaseToken = await this.verifyActiveLeaseToken(token);
    if (leaseToken) {
      if (leaseToken.role !== 'owner') {
        return new Response('forbidden role', { status: 403, headers: queryTokenHeaders(request) });
      }
      const now = Date.now();
      const lease = await this.activeLease(now);
      if (!lease) return new Response('unauthorized', { status: 401, headers: queryTokenHeaders(request) });
      await this.state.storage.put(ROOM_LEASE_KEY, { ...lease, connectedAt: now, disconnectedAt: undefined });
      await this.state.storage.put(ROOM_EVER_CONNECTED_KEY, true);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const attachment: PaneSocketAttachment = {
        kind: 'pane',
        roomId: leaseToken.roomId,
        paneId: crypto.randomUUID(),
        leaseId: leaseToken.leaseId,
        role: leaseToken.role,
        createdAt: now,
        expiresAt: leaseToken.expiresAt,
        capabilities: ['read', 'listChanges', 'applyChange'],
        protocolVersion: 1,
      };
      this.state.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      return new Response(null, { status: 101, webSocket: client });
    }

    const parsed = parseRelayToken(token);
    if (!parsed) return new Response('unauthorized', { status: 401, headers: queryTokenHeaders(request) });
    if (roleFromRelayToken(parsed) !== 'owner') {
      return new Response('forbidden role', { status: 403, headers: queryTokenHeaders(request) });
    }

    const now = Date.now();
    const bound = await this.bindOwner(parsed, now);
    if (bound instanceof Response) return new Response(bound.body, { status: bound.status, statusText: bound.statusText, headers: queryTokenHeaders(request) });
    await this.state.storage.put(ROOM_EVER_CONNECTED_KEY, true);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment: PaneSocketAttachment = {
      kind: 'pane',
      roomId: parsed.roomId,
      paneId: crypto.randomUUID(),
      leaseId: parsed.roomId,
      role: 'owner',
      createdAt: now,
      expiresAt: bound.expiresAt,
      capabilities: ['read', 'listChanges', 'applyChange'],
      protocolVersion: 1,
    };
    this.paneAuthorizations.set(attachment.paneId, await this.authorizedTokenHashesForOwner(parsed));
    this.state.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleStatus(request: Request): Promise<Response> {
    const token = tokenFromRequest(request);
    const requestedRoomId = roomIdForPath(request.url, 'status');
    const leaseToken = await this.verifyActiveLeaseToken(token, requestedRoomId ?? undefined);
    if (leaseToken) {
      const now = Date.now();
      const lease = await this.activeLease(now);
      const panes = this.state.getWebSockets().filter((ws) => {
        const attachment = ws.deserializeAttachment() as PaneSocketAttachment | undefined;
        return attachment?.kind === 'pane' && attachment.roomId === leaseToken.roomId && attachment.leaseId === leaseToken.leaseId && attachment.expiresAt > now;
      });
      const roomState = panes.length > 0
        ? 'connected'
        : lease?.disconnectedAt
          ? 'disconnected'
          : 'waiting_for_pane';
      return json({ roomId: leaseToken.roomId, state: roomState, paneCount: panes.length, role: leaseToken.role, expiresAt: leaseToken.expiresAt }, 200);
    }

    const parsed = parseRelayToken(token);
    if (!parsed) return json(mcpErrorResult('Unauthorized', 'Invalid relay token.'), 401);
    if (requestedRoomId && parsed.roomId !== requestedRoomId) return json(mcpErrorResult('Forbidden', 'Room token mismatch.'), 403);
    const now = Date.now();
    const panes = this.state.getWebSockets().filter((ws) => {
      const attachment = ws.deserializeAttachment() as PaneSocketAttachment | undefined;
      return attachment?.kind === 'pane' && attachment.roomId === parsed.roomId && attachment.expiresAt > now;
    });
    await this.state.storage.delete(LEGACY_ROOM_OWNER_HASH_KEY);
    const ownerExpiresAt = (await this.state.storage.get<number>(ROOM_OWNER_EXPIRES_AT_KEY)) ?? 0;
    const everConnected = (await this.state.storage.get<boolean>(ROOM_EVER_CONNECTED_KEY)) ?? false;
    const roomState = panes.length > 0
      ? 'connected'
      : ownerExpiresAt > 0 && ownerExpiresAt <= now
        ? 'expired'
        : ownerExpiresAt > now
          ? everConnected ? 'disconnected' : 'waiting_for_pane'
          : 'available';
    return json({ roomId: parsed.roomId, state: roomState, paneCount: panes.length, role: roleFromRelayToken(parsed) }, 200);
  }

  private async handleRpc(request: Request): Promise<Response> {
    const body = await request.json().catch(() => null) as { token?: string; idempotencyKey?: string; operation?: PaneBackendWireRequest } | null;
    if (!body?.token || !body.operation) return json(mcpErrorResult('InvalidRpcRequest', 'Expected token and backend-wire operation.'), 400);
    const leaseToken = await this.verifyActiveLeaseToken(body.token);
    if (leaseToken) {
      const authorized = this.findAuthorizedPaneForLease(leaseToken);
      if (!authorized) return json(paneDisconnectedResult(), 200);
      const result = await callPaneOperationWithRoomGuards({
        operation: body.operation,
        idempotencyKey: body.idempotencyKey,
        role: authorized.role,
        store: this.idempotencyStore(),
        dispatch: (operation) => this.sendPaneBackendOperation(authorized.pane, operation),
      });
      return json(result, 200);
    }

    const parsed = parseRelayToken(body.token);
    if (!parsed) return json(mcpErrorResult('Unauthorized', 'Invalid relay token.'), 401);
    const authorized = await this.findAuthorizedPane(parsed.roomId, parsed.secret);
    if (authorized === 'auth-unavailable') return json(mcpErrorResult('PaneAuthUnavailable', 'Pane authorization metadata is not durable. Reconnect the Word pane or wait for the room to expire before re-claiming it.'), 200);
    if (!authorized) return json(paneDisconnectedResult(), 200);

    const result = await callPaneOperationWithRoomGuards({
      operation: body.operation,
      idempotencyKey: body.idempotencyKey,
      role: authorized.role,
      store: this.idempotencyStore(),
      dispatch: (operation) => this.sendPaneBackendOperation(authorized.pane, operation),
    });
    return json(result, 200);
  }

  private idempotencyStore(): IdempotencyStore {
    return {
      get: async (keyHash) => {
        const marker = (await this.state.storage.get<IdempotencyMarker>(`idem:${keyHash}`)) ?? null;
        if (marker && marker.expiresAt <= Date.now()) {
          await this.state.storage.delete(`idem:${keyHash}`);
          return null;
        }
        return marker;
      },
      put: async (marker) => {
        await this.state.storage.put(`idem:${marker.keyHash}`, marker);
      },
    };
  }

  private async findAuthorizedPane(roomId: string, secret: string): Promise<{ pane: WebSocket; role: RelayRole } | 'auth-unavailable' | null> {
    const tokenHash = await sha256Base64Url(secret);
    let sawPaneWithoutVolatileAuth = false;
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as PaneSocketAttachment | undefined;
      if (attachment?.kind !== 'pane' || attachment.roomId !== roomId || attachment.expiresAt <= Date.now()) continue;
      const authorizedTokenHashes = this.paneAuthorizations.get(attachment.paneId);
      if (!authorizedTokenHashes) {
        sawPaneWithoutVolatileAuth = true;
        continue;
      }
      const role = roleForTokenHash(tokenHash, authorizedTokenHashes);
      if (role) return { pane: ws, role };
    }
    if (sawPaneWithoutVolatileAuth) return 'auth-unavailable';
    return null;
  }

  private findAuthorizedPaneForLease(parsed: ParsedLeaseToken): { pane: WebSocket; role: RelayRole } | null {
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as PaneSocketAttachment | undefined;
      if (attachment?.kind !== 'pane') continue;
      if (attachment.roomId !== parsed.roomId || attachment.leaseId !== parsed.leaseId || attachment.expiresAt <= Date.now()) continue;
      return { pane: ws, role: parsed.role };
    }
    return null;
  }

  private async handleRelease(request: Request): Promise<Response> {
    const token = tokenFromRequest(request);
    const requestedRoomId = roomIdForPath(request.url, 'release');
    const leaseToken = await this.verifyActiveLeaseToken(token, requestedRoomId ?? undefined);
    if (leaseToken) {
      if (leaseToken.role !== 'owner') return new Response('forbidden role', { status: 403, headers: queryTokenHeaders(request) });
      await this.state.storage.delete(ROOM_LEASE_KEY);
      for (const ws of this.state.getWebSockets()) {
        const attachment = ws.deserializeAttachment() as PaneSocketAttachment | undefined;
        if (attachment?.kind !== 'pane' || attachment.roomId !== leaseToken.roomId || attachment.leaseId !== leaseToken.leaseId) continue;
        this.drainPendingForSocket(ws, paneDisconnectedResult());
        ws.close();
      }
      return json({ roomId: leaseToken.roomId, state: 'available' }, 200);
    }

    const parsed = parseRelayToken(token);
    if (!parsed) return new Response('unauthorized', { status: 401, headers: queryTokenHeaders(request) });
    if (requestedRoomId && parsed.roomId !== requestedRoomId) return new Response('room token mismatch', { status: 403, headers: queryTokenHeaders(request) });
    if (roleFromRelayToken(parsed) !== 'owner') return new Response('forbidden role', { status: 403, headers: queryTokenHeaders(request) });
    await this.state.storage.delete(ROOM_OWNER_EXPIRES_AT_KEY);
    await this.state.storage.delete(LEGACY_ROOM_OWNER_HASH_KEY);
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as PaneSocketAttachment | undefined;
      if (attachment?.kind !== 'pane' || attachment.roomId !== parsed.roomId) continue;
      this.deletePaneAuthorization(ws);
      this.drainPendingForSocket(ws, paneDisconnectedResult());
      ws.close();
    }
    return json({ roomId: parsed.roomId, state: 'available' }, 200);
  }

  private sendPaneBackendOperation(ws: WebSocket, operation: PaneBackendWireRequest, timeoutMs = DEFAULT_RPC_TIMEOUT_MS): Promise<CallToolResult> {
    const mutating = operation.operation.kind === 'applyChange';
    if (this.pending.size >= MAX_PENDING_RPC) return Promise.resolve(mcpErrorResult('PaneBackpressure', 'Too many active pane RPCs in this room.'));
    if (mutating && this.countPending((pending) => pending.mutating) >= MAX_PENDING_MUTATING_RPC) return Promise.resolve(mcpErrorResult('PaneBackpressure', 'A mutating pane RPC is already active in this room.'));
    if (!mutating && this.countPending((pending) => !pending.mutating) >= MAX_PENDING_READ_RPC) return Promise.resolve(mcpErrorResult('PaneBackpressure', 'Too many read pane RPCs are active in this room.'));
    const id = crypto.randomUUID();
    const request: PaneRpcRequest = { type: 'request', id, method: 'backendOperation', params: { request: operation } };
    ws.send(JSON.stringify(request));
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.resolve(mcpErrorResult('PaneRpcTimeout', 'Pane RPC timed out before the Word pane responded.'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, sentAt: Date.now(), mutating: mutating, pane: ws, timeoutId });
    });
  }


  private countPending(predicate: (pending: PendingRpc) => boolean): number {
    let count = 0;
    for (const pending of this.pending.values()) {
      if (predicate(pending)) count++;
    }
    return count;
  }

  webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string') return;
    const parsed = safeJson(message) as PaneRpcResponse | null;
    if (parsed?.type !== 'response') return;
    const pending = this.pending.get(parsed.id);
    if (!pending) return;
    this.pending.delete(parsed.id);
    clearTimeout(pending.timeoutId);
    if (parsed.ok) pending.resolve(normalizePaneResult(parsed.result));
    else pending.resolve(mcpErrorResult(parsed.error?.code ?? 'PaneRpcError', parsed.error?.message ?? 'Pane RPC failed.'));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.markLeaseDisconnected(ws);
    this.deletePaneAuthorization(ws);
    this.drainPendingForSocket(ws, paneDisconnectedResult());
    ws.close();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.markLeaseDisconnected(ws);
    this.deletePaneAuthorization(ws);
    this.drainPendingForSocket(ws, mcpErrorResult('PaneRpcError', 'Pane socket error.'));
  }

  private async markLeaseDisconnected(ws: WebSocket): Promise<void> {
    const deserializeAttachment = (ws as { deserializeAttachment?: () => unknown }).deserializeAttachment;
    if (typeof deserializeAttachment !== 'function') return;
    const attachment = deserializeAttachment.call(ws) as PaneSocketAttachment | undefined;
    if (attachment?.kind !== 'pane' || !attachment.leaseId || attachment.leaseId === attachment.roomId) return;
    const lease = await this.activeLease();
    if (!lease || lease.roomId !== attachment.roomId || lease.leaseId !== attachment.leaseId) return;
    if (this.hasOtherActivePaneSocketForLease(ws, lease)) return;
    await this.state.storage.put(ROOM_LEASE_KEY, { ...lease, disconnectedAt: Date.now() });
  }

  private hasOtherActivePaneSocketForLease(closingWs: WebSocket, lease: ActiveRoomLease): boolean {
    const now = Date.now();
    return this.state.getWebSockets().some((ws) => {
      if (ws === closingWs) return false;
      const attachment = ws.deserializeAttachment() as PaneSocketAttachment | undefined;
      return attachment?.kind === 'pane'
        && attachment.roomId === lease.roomId
        && attachment.leaseId === lease.leaseId
        && attachment.expiresAt > now;
    });
  }

  private deletePaneAuthorization(ws: WebSocket): void {
    const deserializeAttachment = (ws as { deserializeAttachment?: () => unknown }).deserializeAttachment;
    if (typeof deserializeAttachment !== 'function') return;
    const attachment = deserializeAttachment.call(ws) as PaneSocketAttachment | undefined;
    if (attachment?.kind === 'pane') this.paneAuthorizations.delete(attachment.paneId);
  }

  private drainPendingForSocket(ws: WebSocket, result: CallToolResult): void {
    for (const [id, pending] of this.pending.entries()) {
      if (pending.pane !== ws) continue;
      this.pending.delete(id);
      clearTimeout(pending.timeoutId);
      pending.resolve(result);
    }
  }
}

function tokenFromRequest(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return request.headers.get('x-share-token') ?? new URL(request.url).searchParams.get('token');
}

function queryTokenHeaders(request: Request): HeadersInit {
  return new URL(request.url).searchParams.has('token') ? { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } : {};
}

function roomIdForPath(rawUrl: string, action: 'claim' | 'status' | 'release'): string | null {
  const pathname = new URL(rawUrl).pathname;
  const match = pathname.match(new RegExp(`^/room/([a-zA-Z0-9_-]{1,128})/${action}$`));
  return match?.[1] ?? null;
}

function isPublicRoomId(roomId: string): boolean {
  return /^public-[1-5]$/.test(roomId);
}

function normalizePaneResult(result: unknown): CallToolResult {
  if (result && typeof result === 'object' && Array.isArray((result as { content?: unknown }).content)) return result as CallToolResult;
  return { content: [{ type: 'text', text: JSON.stringify(result ?? null) }] };
}

function safeJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
