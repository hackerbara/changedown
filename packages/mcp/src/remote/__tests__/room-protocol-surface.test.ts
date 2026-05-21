import { describe, expect, it } from 'vitest';
import { RoomDocumentBackend } from '../room-document-backend.js';

function paneTextResult(result: unknown): unknown {
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

describe('RoomDocumentBackend protocolSurface passthrough', () => {
  it('preserves protocolSurface returned by the pane backend', async () => {
    const backend = new RoomDocumentBackend({
      callBackendOperation: async () => paneTextResult({
        text: '{++hello++}[^cn-2]',
        format: 'L2',
        version: '1',
        publicationState: 'ready',
        protocolSurface: {
          protocolVersion: 'changedown-protocol-v1',
          sourceDigest: 'digest-a',
          source: '{++hello++}[^cn-2]',
          entries: [{ id: 'cn-2', kind: 'ins', status: 'proposed', representation: 'inline-markup', actionability: { state: 'native-ready' }, certification: { state: 'action-plan-ready' } }],
          order: ['cn-2'],
          actionabilityByChangeId: { 'cn-2': { state: 'native-ready' } },
          certificationByChangeId: { 'cn-2': { state: 'action-plan-ready' } },
        },
      }),
    } as never);

    const snapshot = await backend.read({ uri: 'word://sess-test' });
    expect(snapshot.protocolSurface?.order).toEqual(['cn-2']);
  });

  it('drops legacy protocolSurface when publicationState is missing', async () => {
    const backend = new RoomDocumentBackend({
      callBackendOperation: async () => paneTextResult({
        text: '{++hello++}[^cn-2]',
        format: 'L2',
        version: '1',
        protocolSurface: {
          protocolVersion: 'changedown-protocol-v1',
          sourceDigest: 'digest-a',
          source: '{++hello++}[^cn-2]',
          entries: [{ id: 'cn-2', kind: 'ins', status: 'proposed', representation: 'inline-markup', actionability: { state: 'native-ready' }, certification: { state: 'action-plan-ready' } }],
          order: ['cn-2'],
          actionabilityByChangeId: { 'cn-2': { state: 'native-ready' } },
          certificationByChangeId: { 'cn-2': { state: 'action-plan-ready' } },
        },
      }),
    } as never);

    const snapshot = await backend.read({ uri: 'word://sess-test' });
    expect(snapshot.publicationState).toBeUndefined();
    expect(snapshot.protocolSurface).toBeUndefined();
  });

  it('drops incompatible protocolSurface versions at the remote boundary', async () => {
    const backend = new RoomDocumentBackend({
      callBackendOperation: async () => paneTextResult({
        text: 'fallback text',
        format: 'L2',
        version: '1',
        protocolSurface: { protocolVersion: 'changedown-protocol-v999', source: 'bad', sourceDigest: 'bad', entries: [], order: [], actionabilityByChangeId: {}, certificationByChangeId: {} },
      }),
    } as never);
    const snapshot = await backend.read({ uri: 'word://sess-test' });
    expect(snapshot.protocolSurface).toBeUndefined();
  });

  it('sanitizes private provider fields at the remote boundary', async () => {
    const backend = new RoomDocumentBackend({
      callBackendOperation: async () => paneTextResult({
        text: '{++hello++}[^cn-2]',
        format: 'L2',
        version: '1',
        publicationState: 'ready',
        protocolSurface: {
          protocolVersion: 'changedown-protocol-v1',
          sourceDigest: 'digest-a',
          source: '{++hello++}[^cn-2]',
          nativeRevisionId: 'native-top-level',
          entries: [{
            id: 'cn-2',
            kind: 'ins',
            status: 'proposed',
            representation: 'inline-markup',
            nativeRevisionId: 'native-1',
            providerEvidenceRefs: ['source-ledger:group-1'],
            actionability: { state: 'native-ready', targetIds: ['native-1'] },
            certification: { state: 'action-plan-ready', sourceRefs: ['group-1'] },
          }],
          order: ['cn-2'],
          actionabilityByChangeId: { 'cn-2': { state: 'native-ready', targetIds: ['native-1'] } },
          certificationByChangeId: { 'cn-2': { state: 'action-plan-ready', providerEvidenceRefs: ['group-1'] } },
        },
      }),
    } as never);

    const snapshot = await backend.read({ uri: 'word://sess-test' });
    expect(snapshot.protocolSurface?.entries[0]).toEqual({
      id: 'cn-2',
      kind: 'ins',
      status: 'proposed',
      representation: 'inline-markup',
      actionability: { state: 'native-ready' },
      certification: { state: 'action-plan-ready' },
    });
    expect(JSON.stringify(snapshot.protocolSurface)).not.toContain('nativeRevisionId');
    expect(JSON.stringify(snapshot.protocolSurface)).not.toContain('providerEvidenceRefs');
    expect(JSON.stringify(snapshot.protocolSurface)).not.toContain('targetIds');
    expect(JSON.stringify(snapshot.protocolSurface)).not.toContain('sourceRefs');
  });


  it('preserves not-ready publication metadata across the room boundary without exposing private protocol targets', async () => {
    const backend = new RoomDocumentBackend({
      callBackendOperation: async () => paneTextResult({
        text: '',
        format: 'L2',
        version: 'not-ready-1',
        publicationState: 'not_ready',
        evidenceDigests: { package: 'pkg-a', native: 'native-a' },
        compositionDigest: 'composition-a',
        explainedMismatches: [{ explanationKind: 'native_duplicate_noise', proofDigest: 'proof-a' }],
        notReadyBoundary: {
          boundaryId: 'boundary-a',
          snapshotId: 'snapshot-a',
          phase: 'native-census',
          primaryReason: 'native_census_unavailable',
          reasonFamilies: ['native_census_unavailable'],
          rowsWithheld: true,
          collectorStates: { package: 'complete', nativeRevisionCensus: 'failed', nativeComments: 'complete', bodyTopology: 'complete', composition: 'not_started' },
          evidenceDigests: { package: 'pkg-a' },
          observedCounts: { packageRows: 161 },
          unexplainedMismatches: [],
          debugEvidenceAvailable: true,
          publicDiagnostics: [{ code: 'native-census-unavailable', message: 'Native census unavailable' }],
        },
        protocolSurface: {
          protocolVersion: 'changedown-protocol-v1',
          sourceDigest: 'digest-a',
          source: '',
          entries: [{ id: 'cn-2', kind: 'ins', status: 'proposed', representation: 'inline-markup', actionability: { state: 'native-ready', targetIds: ['native-1'] }, certification: { state: 'action-plan-ready', providerEvidenceRefs: ['group-1'] } }],
          order: ['cn-2'],
          actionabilityByChangeId: { 'cn-2': { state: 'native-ready', targetIds: ['native-1'] } },
          certificationByChangeId: { 'cn-2': { state: 'action-plan-ready', providerEvidenceRefs: ['group-1'] } },
        },
      }),
    } as never);

    const snapshot = await backend.read({ uri: 'word://sess-test' });
    expect(snapshot.publicationState).toBe('not_ready');
    expect(snapshot.notReadyBoundary?.rowsWithheld).toBe(true);
    expect(snapshot.evidenceDigests).toEqual({ package: 'pkg-a', native: 'native-a' });
    expect(snapshot.compositionDigest).toBe('composition-a');
    expect(snapshot.explainedMismatches).toEqual([{ explanationKind: 'native_duplicate_noise', proofDigest: 'proof-a' }]);
    expect(snapshot.protocolSurface).toBeUndefined();
  });

});
