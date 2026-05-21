// packages/tests/mcp/pane-registration-wiring.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { BackendRegistry, type ChangeOp, type DocumentBackend } from '@changedown/core/backend';
import { attachPaneEndpoints, type PaneEndpointHandle } from '@changedown/mcp/transport/pane-endpoint';
import { createPaneRegistrationCallbacks } from '@changedown/mcp/pane-registration';

function makeListeningServer(): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function closeServer(server: http.Server): Promise<void> {
  return new Promise((res) => {
    server.closeAllConnections();
    server.close(() => res());
  });
}

async function postRegister(
  port: number,
  body: { scheme: string; sessionId: string; capabilities?: string[] },
): Promise<{ registrationId: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/backend/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capabilities: [], ...body }),
  });
  return (await res.json()) as { registrationId: string };
}

function wordBackend(registry: BackendRegistry, uri = 'word://sess-test-1'): DocumentBackend {
  return registry.resolve(uri);
}

function listedUris(backend: DocumentBackend): string[] {
  return backend.list().map((resource) => resource.uri).sort();
}

function listedVersion(
  backend: DocumentBackend,
  uri: string,
): string | undefined {
  return backend.list().find((resource) => resource.uri === uri)?.version;
}

function makeFakePaneHandle(): PaneEndpointHandle & {
  calls: Array<{ registrationId: string; method: string; params: unknown }>;
} {
  const calls: Array<{ registrationId: string; method: string; params: unknown }> = [];
  return {
    calls,
    detach() {},
    async sendRequest(registrationId: string, method: string, params: unknown): Promise<unknown> {
      calls.push({ registrationId, method, params });
      if (method === 'read') {
        return { text: `# ${registrationId}`, format: 'L3', version: `v-${registrationId}` };
      }
      if (method === 'listChanges') {
        return [{ changeId: registrationId, type: 'substitution', status: 'proposed', author: 'test', line: 1, preview: registrationId }];
      }
      if (method === 'applyChange') {
        return { applied: true, changeId: `${registrationId}-change`, text: 'ok' };
      }
      if (method === 'subscribe') {
        return { subscribed: true };
      }
      return {};
    },
    onPaneNotification() {
      return { dispose() {} };
    },
    broadcastAgentsUpdated() {},
    incrementEditCount() {},
    pruneEditCounts() {},
    handleHttpRequest() {},
  };
}

describe('pane registration → BackendRegistry wiring', () => {
  let server: http.Server;

  beforeEach(async () => {
    server = await makeListeningServer();
  });

  afterEach(async () => {
    await closeServer(server);
  });

  it('onRegister fires and registry gains word:// resources; detach unregisters', async () => {
    const registry = new BackendRegistry();
    let handle: PaneEndpointHandle;
    handle = attachPaneEndpoints(server, createPaneRegistrationCallbacks(() => handle, registry));
    server.on('request', handle.handleHttpRequest);

    const addr = server.address() as { port: number };
    const { registrationId } = await postRegister(addr.port, {
      scheme: 'word',
      sessionId: 'sess-test-1',
    });

    const backend = wordBackend(registry);
    expect(listedUris(backend)).toEqual(['word://sess-test-1']);

    handle.detach();

    expect(() => registry.resolve('word://sess-test-1')).toThrow(/BackendNotFoundError/);
    // registrationId is referenced to keep the variable meaningful;
    // detach() routes through the same removeRegistration path that fires
    // onUnregister with this id, which is what clears the registry.
    expect(registrationId).toMatch(/^[\w-]+$/);
  });

  it('preserves a URI-form sessionId without double-prefixing the scheme', async () => {
    // Bug scenario: the real Word pane sends `word://sess-<uuid>` as
    // sessionId (it generates the URI client-side and uses that as both the
    // display URI and the registration id). The previous wiring built
    // `${scheme}://${sessionId}` blindly, producing `word://word://sess-...`.
    const registry = new BackendRegistry();
    let handle: PaneEndpointHandle;
    handle = attachPaneEndpoints(server, createPaneRegistrationCallbacks(() => handle, registry));
    server.on('request', handle.handleHttpRequest);

    const addr = server.address() as { port: number };
    await postRegister(addr.port, {
      scheme: 'word',
      sessionId: 'word://sess-from-pane-uuid',
    });

    const backend = wordBackend(registry, 'word://sess-from-pane-uuid');
    expect(listedUris(backend)).toEqual(['word://sess-from-pane-uuid']);
    expect(backend.list()[0]?.name).toContain('sess-from-pane-uuid');

    handle.detach();
  });

  it('stale unregister removes only that pane and leaves newer active sessions intact', async () => {
    // Bug scenario: pane A registers, pane B registers afterward, then pane A's
    // no-stream TTL or SSE-close grace unregister fires late. The old
    // scheme-keyed/most-recent backend wiring could wipe whichever word://
    // backend happened to be current. The mux backend must remove only A.
    const registry = new BackendRegistry();
    const fakeHandle = makeFakePaneHandle();
    const callbacks = createPaneRegistrationCallbacks(() => fakeHandle, registry);

    callbacks.onRegister!({
      scheme: 'word',
      sessionId: 'sess-a',
      registrationId: 'regA',
      capabilities: [],
    });
    callbacks.onRegister!({
      scheme: 'word',
      sessionId: 'sess-b',
      registrationId: 'regB',
      capabilities: [],
    });

    expect(listedUris(wordBackend(registry, 'word://sess-a'))).toEqual([
      'word://sess-a',
      'word://sess-b',
    ]);

    callbacks.onUnregister!('regA');

    const afterA = wordBackend(registry, 'word://sess-b');
    expect(listedUris(afterA)).toEqual(['word://sess-b']);
    await expect(afterA.read({ uri: 'word://sess-a' })).rejects.toThrow(/WordSessionNotFoundError/);
    await expect(afterA.read({ uri: 'word://sess-b' })).resolves.toMatchObject({ text: '# regB' });

    callbacks.onUnregister!('regB');
    expect(() => registry.resolve('word://sess-b')).toThrow(/BackendNotFoundError/);
  });

  it('routes reads, writes, and listChanges by exact Word session URI, not latest pane', async () => {
    // Regression for the real-MCP slow-suite failure: with multiple Word panes
    // alive, read_tracked_file(word://A) must reach pane A even if pane B
    // registered later. The registry still dispatches by scheme; the backend
    // itself owns the per-session routing.
    const registry = new BackendRegistry();
    const fakeHandle = makeFakePaneHandle();
    const callbacks = createPaneRegistrationCallbacks(() => fakeHandle, registry);

    callbacks.onRegister!({
      scheme: 'word',
      sessionId: 'word://sess-a',
      registrationId: 'regA',
      capabilities: [],
    });
    callbacks.onRegister!({
      scheme: 'word',
      sessionId: 'word://sess-b',
      registrationId: 'regB',
      capabilities: [],
    });

    const backend = wordBackend(registry, 'word://sess-a');
    await expect(backend.read({ uri: 'word://sess-a' })).resolves.toMatchObject({
      text: '# regA',
      version: 'v-regA',
    });
    await expect(backend.read({ uri: 'word://sess-b' })).resolves.toMatchObject({
      text: '# regB',
      version: 'v-regB',
    });

    const op: ChangeOp = { kind: 'propose', args: { at: '1:abc', op: '{++x++}' } };
    await expect(backend.applyChange({ uri: 'word://sess-a' }, op)).resolves.toMatchObject({
      applied: true,
      changeId: 'regA-change',
    });
    await expect(backend.listChanges({ uri: 'word://sess-b' })).resolves.toEqual([
      expect.objectContaining({ changeId: 'regB' }),
    ]);

    expect(fakeHandle.calls.map((call) => [call.registrationId, call.method])).toEqual([
      ['regA', 'read'],
      ['regB', 'read'],
      ['regA', 'applyChange'],
      ['regB', 'listChanges'],
    ]);
    await expect(backend.read({ uri: 'word://missing' })).rejects.toThrow(/WordSessionNotFoundError/);
  });


  it('caches committed Word resource versions from read and notifications', async () => {
    const registry = new BackendRegistry();
    const listeners = new Map<string, (event: unknown) => void>();
    const fakeHandle = {
      ...makeFakePaneHandle(),
      onPaneNotification(registrationId: string, listener: (event: unknown) => void) {
        listeners.set(registrationId, listener);
        return { dispose() {} };
      },
    } satisfies PaneEndpointHandle & {
      calls: Array<{ registrationId: string; method: string; params: unknown }>;
    };
    const callbacks = createPaneRegistrationCallbacks(() => fakeHandle, registry);

    callbacks.onRegister!({
      scheme: 'word',
      sessionId: 'word://sess-versioned',
      registrationId: 'reg-versioned',
      capabilities: [],
    });

    const backend = wordBackend(registry, 'word://sess-versioned');
    expect(listedVersion(backend, 'word://sess-versioned')).toBeUndefined();

    await expect(backend.read({ uri: 'word://sess-versioned' })).resolves.toMatchObject({
      version: 'v-reg-versioned',
    });
    expect(listedVersion(backend, 'word://sess-versioned')).toBe('v-reg-versioned');

    const received: unknown[] = [];
    backend.subscribe({ uri: 'word://sess-versioned' }, (event) => received.push(event));
    listeners.get('reg-versioned')?.({ kind: 'document_changed', version: 'v-next' });

    expect(received).toEqual([{ kind: 'document_changed', version: 'v-next' }]);
    expect(listedVersion(backend, 'word://sess-versioned')).toBe('v-next');
  });
});
