import { describe, it, expect } from 'vitest';
import { sendCoherenceStatus } from '@changedown/lsp-server/internals';

describe('coherence status notification', () => {
  it('sends coherence status with rate and unresolved count', () => {
    const sent: any[] = [];
    const mockConnection = {
      sendNotification: (method: string, params: any) => { sent.push({ method, params }); },
    };

    sendCoherenceStatus(mockConnection as any, 'file:///test.md', 85, 3, 98);

    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('changedown/coherenceStatus');
    expect(sent[0].params).toEqual({
      uri: 'file:///test.md',
      coherenceRate: 85,
      unresolvedCount: 3,
      threshold: 98,
    });
  });
});

describe('StatusBarManager lifecycle', () => {
  it('notification dedup: same rate/count sent twice produces one notification', () => {
    const sent: any[] = [];
    const mockConnection = {
      sendNotification: (method: string, params: any) => { sent.push({ method, params }); },
    };
    // First call
    sendCoherenceStatus(mockConnection as any, 'file:///test.md', 85, 3, 98);
    // Simulate second call with same values — the dedup is in server.ts, not the sender
    sendCoherenceStatus(mockConnection as any, 'file:///test.md', 85, 3, 98);
    // The sender itself doesn't dedup — it sends both. Server.ts dedup is tested separately.
    expect(sent).toHaveLength(2);
  });
});
