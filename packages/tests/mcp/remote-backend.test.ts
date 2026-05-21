// packages/tests/mcp/remote-backend.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RemoteBackend } from '@changedown/mcp/remote-backend';
import type { PaneEndpointHandle } from '@changedown/mcp/transport/pane-endpoint';
import type {
  DocumentRef,
  ChangeOp,
} from '@changedown/core/backend';

const REG_ID = 'reg-test-abc';
const SESSION_URI = 'word://sess-test-123';
const REF: DocumentRef = { uri: SESSION_URI };

function makeHandle(responseValue: unknown = {}): PaneEndpointHandle {
  return {
    detach: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue(responseValue),
    onPaneNotification: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  };
}

describe('RemoteBackend', () => {
  it('has schemes = ["word"]', () => {
    const backend = new RemoteBackend(makeHandle(), REG_ID, SESSION_URI);
    expect(backend.schemes).toEqual(['word']);
  });

  it('exposes sessionUri as a readable field', () => {
    const backend = new RemoteBackend(makeHandle(), REG_ID, SESSION_URI);
    expect(backend.sessionUri).toBe(SESSION_URI);
  });

  it('read() sends method="read" and returns a DocumentSnapshot', async () => {
    const snapshot = { text: '== L3 ==', format: 'L3', version: '42' };
    const handle = makeHandle(snapshot);
    const backend = new RemoteBackend(handle, REG_ID, SESSION_URI);
    const result = await backend.read(REF);
    expect(handle.sendRequest).toHaveBeenCalledWith(REG_ID, 'read', {});
    expect(result).toEqual(snapshot);
  });



  it('listChanges() sends method="listChanges" with empty params', async () => {
    const changes = [{ changeId: 'cn-1', type: 'insertion', status: 'proposed', author: 'alice', line: 1, preview: 'Hello' }];
    const handle = makeHandle(changes);
    const backend = new RemoteBackend(handle, REG_ID, SESSION_URI);
    const result = await backend.listChanges(REF);
    expect(handle.sendRequest).toHaveBeenCalledWith(REG_ID, 'listChanges', {});
    expect(result).toEqual(changes);
  });


  it('applyChange() sends method="applyChange" with op in params', async () => {
    const changeResult = { applied: true, changeId: 'cn-2' };
    const handle = makeHandle(changeResult);
    const backend = new RemoteBackend(handle, REG_ID, SESSION_URI);
    const op: ChangeOp = { kind: 'propose', args: { at: 'abc', newText: 'foo' } };
    const result = await backend.applyChange(REF, op);
    expect(handle.sendRequest).toHaveBeenCalledWith(REG_ID, 'applyChange', { op });
    expect(result).toEqual(changeResult);
  });

  it('subscribe() sends method="subscribe" and returns an Unsubscribe', () => {
    const handle = makeHandle({ subscribed: true, sessionUri: SESSION_URI });
    const backend = new RemoteBackend(handle, REG_ID, SESSION_URI);
    const listener = vi.fn();
    const unsub = backend.subscribe(REF, listener);
    expect(handle.sendRequest).toHaveBeenCalledWith(REG_ID, 'subscribe', {});
    expect(typeof unsub).toBe('function');
  });

  it('sendRequest rejection propagates as a thrown error from read()', async () => {
    const handle: PaneEndpointHandle = {
      detach: vi.fn(),
      sendRequest: vi.fn().mockRejectedValue(new Error('Pane disconnected')),
      onPaneNotification: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    };
    const backend = new RemoteBackend(handle, REG_ID, SESSION_URI);
    await expect(backend.read(REF)).rejects.toThrow('Pane disconnected');
  });
});
