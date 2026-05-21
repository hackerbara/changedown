import { describe, it, expect, vi } from 'vitest';
import { applyWordReviewChanges, prepareWordReviewChanges } from '@changedown/mcp/internals';
import type { DocumentBackend, ChangeOp, DocumentRef, DocumentSnapshot, DocumentSnapshotCapability } from '@changedown/core/backend';

function protocolSurface(changeId: string, status: string, capability: DocumentSnapshotCapability) {
  const actionability = capability.nativeReviewable && capability.approveRejectCapability === 'available'
    ? { state: 'native-ready' as const }
    : { state: 'blocked' as const, reason: capability.reason ?? 'native-review-capability-unavailable' };
  const certification = status === 'accepted' || status === 'rejected'
    ? { state: 'product-certified' as const }
    : { state: 'action-plan-ready' as const };
  return {
    protocolVersion: 'changedown-protocol-v1' as const,
    sourceDigest: `digest-${changeId}-${status}`,
    source: `Body {++x++}[^${changeId}]\n\n[^${changeId}]: @a | 2026-05-16 | ins | ${status}\n`,
    entries: [{
      id: changeId,
      kind: 'ins',
      status,
      representation: 'inline-markup',
      preview: 'x',
      line: 1,
      actionability,
      certification,
    }],
    order: [changeId],
    actionabilityByChangeId: { [changeId]: actionability },
    certificationByChangeId: { [changeId]: certification },
  };
}

function currentNativeActionPlanRefs(snapshotProtocolSurface: NonNullable<DocumentSnapshot['protocolSurface']>): NonNullable<DocumentSnapshot['actionPlanRefsByChangeId']> {
  const packageDigest = 'pkg-a';
  const sourceGraphDigest = 'graph-a';
  return Object.fromEntries(
    snapshotProtocolSurface.entries
      .filter((entry) => entry.actionability.state === 'native-ready')
      .map((entry) => [
        entry.id,
        {
          publicChangeId: entry.id,
          actionKind: 'accept',
          targetKind: 'native',
          hasDereferenceableTarget: true,
          createdFromProtocolDigest: snapshotProtocolSurface.sourceDigest,
          createdFromPackageDigest: packageDigest,
          createdFromSourceGraphDigest: sourceGraphDigest,
          currentProtocolDigest: snapshotProtocolSurface.sourceDigest,
          currentPackageDigest: packageDigest,
          currentSourceGraphDigest: sourceGraphDigest,
        },
      ]),
  );
}

function snapshotWithCapability(changeId: string, capability: DocumentSnapshotCapability): DocumentSnapshot {
  const surface = protocolSurface(changeId, 'proposed', capability);
  return {
    text: 'Body',
    format: 'L2',
    version: 'v1',
    publicationState: 'ready',
    capabilitiesByChangeId: {
      [changeId]: capability,
    },
    revisionWitnesses: [
      {
        changeId,
        witnessId: `wr-${changeId}`,
        kind: 'tracked_change',
        type: 'ins',
        status: 'proposed',
        capability,
        author: '@a',
        preview: 'x',
      },
    ],
    protocolSurface: surface,
    actionPlanRefsByChangeId: currentNativeActionPlanRefs(surface),
  };
}

function snapshotWithStatus(changeId: string, status: string): DocumentSnapshot {
  const capability: DocumentSnapshotCapability = {
    state: 'interactive',
    nativeReviewable: status === 'proposed',
    approveRejectCapability: status === 'proposed' ? 'available' : 'unavailable',
  };
  const surface = protocolSurface(changeId, status, capability);
  return {
    text: 'Body',
    format: 'L2',
    version: `v-${status}`,
    publicationState: 'ready',
    capabilitiesByChangeId: {
      [changeId]: capability,
    },
    revisionWitnesses: [
      {
        changeId,
        witnessId: `wr-${changeId}`,
        kind: 'tracked_change',
        type: 'ins',
        status,
        capability,
        author: '@a',
        preview: 'x',
      },
    ],
    protocolSurface: surface,
    actionPlanRefsByChangeId: currentNativeActionPlanRefs(surface),
  };
}

function makeWordBackendMock(options: {
  snapshot?: DocumentSnapshot;
  postSnapshot?: DocumentSnapshot;
  listChanges?: DocumentBackend['listChanges'];
  applyChange?: DocumentBackend['applyChange'];
} = {}): DocumentBackend {
  let applied = false;
  const snapshot = options.snapshot ?? snapshotWithCapability('cn-1', {
    state: 'interactive',
    nativeReviewable: true,
    approveRejectCapability: 'available',
  });
  const postSnapshot = options.postSnapshot ?? snapshotWithStatus('cn-1', 'accepted');
  const applyChange = options.applyChange ?? vi.fn(async () => {
    applied = true;
    return { applied: true, changeId: 'cn-1' };
  });

  return {
    schemes: ['word'],
    list: () => [],
    read: vi.fn(async () => (applied ? postSnapshot : snapshot)),
    subscribe: vi.fn(() => () => {}),
    listChanges: options.listChanges ?? vi.fn(async () => []),
    applyChange,
  };
}

const interactiveCapability: DocumentSnapshotCapability = {
  state: 'interactive',
  nativeReviewable: true,
  approveRejectCapability: 'available',
};

describe('Word review_changes adapter', () => {
  it('dispatches only the requested public cn id to the Word backend', async () => {
    const backend = makeWordBackendMock({
      snapshot: snapshotWithCapability('cn-5', {
        ...interactiveCapability,
        nativeActionCnId: 'cn-101',
        revisionFingerprint: 'fp-101',
        joinConfidence: 'high',
      }),
      postSnapshot: snapshotWithStatus('cn-5', 'accepted'),
      listChanges: vi.fn(async () => [{ changeId: 'cn-2', type: 'Deletion', status: 'proposed', author: '@a', line: 1, preview: 'x' }]),
    });

    const response = await applyWordReviewChanges({
      file: 'word://sess-test',
      author: 'ai:codex',
      reviews: [{ change_id: 'cn-5', decision: 'approve', reason: 'looks good' }],
    }, backend, 'word://sess-test');

    expect(backend.applyChange).toHaveBeenCalledWith(
      { uri: 'word://sess-test' } satisfies DocumentRef,
      expect.objectContaining({
        kind: 'review',
        args: expect.objectContaining({ cnId: 'cn-5', decision: 'approve', reason: 'looks good' }),
      }) satisfies ChangeOp,
    );
    expect(JSON.stringify((backend.applyChange as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('publicCnId');
    expect(JSON.stringify((backend.applyChange as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('nativeActionCnId');
    expect(backend.listChanges).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      file: 'word://sess-test',
      results: [{ change_id: 'cn-5', decision: 'approve', status_updated: true }],
      document_state: { remaining_proposed: 0, all_resolved: true },
    });
  });

  it('translates a single reject review into pane review_change args', async () => {
    const backend = makeWordBackendMock({
      snapshot: snapshotWithCapability('cn-1', interactiveCapability),
      postSnapshot: snapshotWithStatus('cn-1', 'rejected'),
    });

    await applyWordReviewChanges({
      file: 'word://sess-test',
      author: 'ai:codex',
      reviews: [{ change_id: 'cn-1', decision: 'reject', reason: 'not wanted' }],
    }, backend, 'word://sess-test');

    expect(backend.applyChange).toHaveBeenCalledWith(
      { uri: 'word://sess-test' },
      expect.objectContaining({
        kind: 'review',
        args: expect.objectContaining({ cnId: 'cn-1', decision: 'reject', reason: 'not wanted' }),
      }),
    );
    expect(JSON.stringify((backend.applyChange as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('publicCnId');
  });

  it('does not claim status_updated when the requested public row remains proposed', async () => {
    const backend = makeWordBackendMock({
      snapshot: snapshotWithCapability('cn-5', interactiveCapability),
      postSnapshot: snapshotWithStatus('cn-5', 'proposed'),
    });

    await expect(applyWordReviewChanges({
      reviews: [{ change_id: 'cn-5', decision: 'approve', reason: 'ok' }],
    }, backend, 'word://sess-test')).rejects.toThrow(/ReviewPostconditionFailed/);
  });

  it('rejects internal wr-* witness ids at the MCP review boundary', async () => {
    const backend = makeWordBackendMock();

    await expect(applyWordReviewChanges({
      file: 'word://sess-test',
      author: 'ai:codex',
      reviews: [{ change_id: 'wr-1', decision: 'approve', reason: 'looks good' }],
    }, backend, 'word://sess-test')).rejects.toThrow('accepts only final cn-*');
    expect(backend.applyChange).not.toHaveBeenCalled();
  });

  it('rejects decimal operation-fragment shaped cn-* ids at the MCP review boundary', async () => {
    const backend = makeWordBackendMock();

    await expect(applyWordReviewChanges({
      file: 'word://sess-test',
      author: 'ai:codex',
      reviews: [{ change_id: 'cn-1.1', decision: 'approve', reason: 'looks good' }],
    }, backend, 'word://sess-test')).rejects.toThrow('accepts only final cn-*');
    expect(backend.applyChange).not.toHaveBeenCalled();
  });

  it('requires the requested cn-* to be present in the protocol surface', async () => {
    const backend = makeWordBackendMock({
      snapshot: {
        text: 'Body',
        format: 'L2',
        version: 'v1',
        publicationState: 'ready',
        capabilitiesByChangeId: {},
        protocolSurface: {
          protocolVersion: 'changedown-protocol-v1',
          sourceDigest: 'digest-empty',
          source: 'Body\n',
          entries: [],
          order: [],
          actionabilityByChangeId: {},
          certificationByChangeId: {},
        },
      },
    });

    await expect(applyWordReviewChanges({
      file: 'word://sess-test',
      author: 'ai:codex',
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'looks good' }],
    }, backend, 'word://sess-test')).rejects.toThrow('not present in the Word protocol surface');
    expect(backend.applyChange).not.toHaveBeenCalled();
  });

  it('rejects batch reviews for the basic Word path', () => {
    const result = prepareWordReviewChanges({
      reviews: [
        { change_id: 'cn-1', decision: 'approve', reason: 'a' },
        { change_id: 'cn-2', decision: 'reject', reason: 'b' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('exactly one');
  });

  it('rejects responses and request_changes for the basic Word path', () => {
    const withResponse = prepareWordReviewChanges({
      responses: [{ change_id: 'cn-1', response: 'hi' }],
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'a' }],
    });
    expect(withResponse.ok).toBe(false);

    const requestChanges = prepareWordReviewChanges({
      reviews: [{ change_id: 'cn-1', decision: 'request_changes', reason: 'please revise' }],
    });
    expect(requestChanges.ok).toBe(false);
    if (!requestChanges.ok) expect(requestChanges.message).toContain('approve/reject only');
  });

  it('throws when pane review does not apply', async () => {
    const backend = makeWordBackendMock({
      applyChange: vi.fn(async () => ({ applied: false, text: 'review_change did not match tracked change' })),
    });

    await expect(applyWordReviewChanges({
      reviews: [{ change_id: 'cn-1', decision: 'approve', reason: 'a' }],
    }, backend, 'word://sess-test')).rejects.toThrow('did not match');
  });
});
