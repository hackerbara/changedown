import crypto from 'node:crypto';
import { sanitizeJson, sanitizeUrl } from './redact.mjs';

export const STAGING_RELAY_ORIGIN = 'https://changedown-remote-relay-staging.hackerbara.workers.dev';

export function roomIdFromClaimUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.pathname.match(/^\/room\/([^/]+)\/claim$/)?.[1];
  } catch {
    return undefined;
  }
}

export function roomIdFromReleaseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.pathname.match(/^\/room\/([^/]+)\/release$/)?.[1];
  } catch {
    return undefined;
  }
}

export function buildClaimResponse({ roomId, relayBaseUrl = STAGING_RELAY_ORIGIN }) {
  const secret = crypto.randomBytes(12).toString('base64url');
  return {
    roomId,
    state: 'waiting_for_pane',
    relayUrl: `${relayBaseUrl}/pane`,
    token: `cdr2.${roomId}.${secret}`,
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
}

export function buildReleaseResponse({ roomId }) {
  return { roomId, state: 'available' };
}

export async function installMockedRelayRoutes(page, { artifacts, occupiedRooms = new Set(), unavailableRooms = new Set() } = {}) {
  const calls = [];
  await page.route(`${STAGING_RELAY_ORIGIN}/room/**`, async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const claimRoomId = roomIdFromClaimUrl(url);
    const releaseRoomId = roomIdFromReleaseUrl(url);
    const call = { method, url: sanitizeUrl(url), claimRoomId, releaseRoomId };
    calls.push(call);

    if (claimRoomId && method === 'POST') {
      if (unavailableRooms.has(claimRoomId)) {
        Object.assign(call, { status: 503, state: 'unavailable' });
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ state: 'unavailable', roomId: claimRoomId }) });
        return;
      }
      if (occupiedRooms.has(claimRoomId)) {
        Object.assign(call, { status: 409, state: 'occupied' });
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ state: 'occupied', roomId: claimRoomId }) });
        return;
      }
      Object.assign(call, { status: 200, state: 'waiting_for_pane' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildClaimResponse({ roomId: claimRoomId })) });
      return;
    }

    if (releaseRoomId && method === 'POST') {
      Object.assign(call, { status: 200, state: 'available' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildReleaseResponse({ roomId: releaseRoomId })) });
      return;
    }

    Object.assign(call, { status: 404, state: 'not-found' });
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'mocked-relay route not found' }) });
  });
  return {
    calls,
    async writeArtifacts() {
      await artifacts?.writeJson?.('relay-mock/fetch-calls.json', sanitizeJson(calls));
    },
  };
}

export function relaySocketInitScriptSource({ mode = 'open' } = {}) {
  return `(() => {
    const NativeWebSocket = globalThis.WebSocket;
    const sockets = [];
    const mode = ${JSON.stringify(mode)};
    const OPEN = 1;
    const CLOSED = 3;
    class ChangedownRelayFakeWebSocket {
      constructor(url) {
        this.url = String(url);
        this.readyState = 0;
        this.sent = [];
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        sockets.push(this);
        queueMicrotask(() => {
          if (mode === 'never-open') return;
          this.readyState = OPEN;
          if (typeof this.onopen === 'function') this.onopen(new Event('open'));
          if (mode === 'close-after-open') queueMicrotask(() => this.close());
        });
      }
      send(data) {
        this.sent.push(String(data));
        globalThis.__cdRelaySocketControl.sent.push({ url: this.url, data: String(data) });
      }
      close() {
        this.readyState = CLOSED;
        if (typeof this.onclose === 'function') this.onclose(new CloseEvent('close'));
      }
      dispatchBackendOperation(operation, id = 'relay-' + Date.now()) {
        const payload = JSON.stringify({ type: 'request', id, method: 'backendOperation', params: { request: operation } });
        if (typeof this.onmessage === 'function') this.onmessage(new MessageEvent('message', { data: payload }));
        return id;
      }
    }
    ChangedownRelayFakeWebSocket.CONNECTING = 0;
    ChangedownRelayFakeWebSocket.OPEN = 1;
    ChangedownRelayFakeWebSocket.CLOSING = 2;
    ChangedownRelayFakeWebSocket.CLOSED = 3;
    globalThis.__cdRelaySocketControl = {
      sockets,
      sent: [],
      latest() { return sockets[sockets.length - 1] || null; },
      dispatchRead() {
        const socket = this.latest();
        if (!socket) throw new Error('no fake relay socket');
        return socket.dispatchBackendOperation({
          protocol: 'changedown-document-backend/v1',
          operation: { kind: 'read', options: { view: 'working', limit: 80 } }
        });
      },
      closeLatest() { const socket = this.latest(); if (socket) socket.close(); }
    };
    globalThis.WebSocket = function ChangedownRelayWebSocket(url, protocols) {
      const text = String(url);
      if (text.includes('/pane') && text.includes('token=')) return new ChangedownRelayFakeWebSocket(text);
      return new NativeWebSocket(url, protocols);
    };
    Object.assign(globalThis.WebSocket, NativeWebSocket, ChangedownRelayFakeWebSocket);
  })();`;
}

export function relaySocketInitScript(options) {
  const source = relaySocketInitScriptSource(options);
  return new Function(source);
}
