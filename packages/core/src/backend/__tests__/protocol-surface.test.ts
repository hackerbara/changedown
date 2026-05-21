import { describe, expect, it } from 'vitest';
import { parseDocumentSnapshotProtocolSurface, type DocumentSnapshot, type DocumentSnapshotProtocolSurface } from '../index.js';

describe('DocumentSnapshot protocol surface', () => {
  it('allows public protocol/actionability summaries without Word internals', () => {
    const surface: DocumentSnapshotProtocolSurface = {
      protocolVersion: 'changedown-protocol-v1',
      sourceDigest: 'digest-a',
      source: '{++hello++}[^cn-2]\n\n[^cn-2]: @word | 2026-05-16 | ins | proposed\n',
      entries: [{
        id: 'cn-2',
        kind: 'ins',
        status: 'proposed',
        representation: 'inline-markup',
        actionability: { state: 'native-ready' },
        certification: { state: 'action-plan-ready' },
      }],
      order: ['cn-2'],
      actionabilityByChangeId: {
        'cn-2': { state: 'native-ready' },
      },
      certificationByChangeId: {
        'cn-2': { state: 'action-plan-ready' },
      },
    };

    const snapshot: DocumentSnapshot = {
      text: surface.source,
      format: 'L2',
      version: '1',
      protocolSurface: surface,
    };

    expect(snapshot.protocolSurface?.order).toEqual(['cn-2']);
    expect(JSON.stringify(snapshot.protocolSurface)).not.toContain('nativeRevisionId');
    expect(JSON.stringify(snapshot.protocolSurface)).not.toContain('providerEvidenceRefs');
  });

  it('sanitizes accepted wire input instead of forwarding private provider fields', () => {
    const parsed = parseDocumentSnapshotProtocolSurface({
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
        providerEvidenceRefs: [{ provider: 'native-scan', id: 'native-1' }],
        actionability: { state: 'native-ready', targetIds: ['native-1'] },
        certification: { state: 'action-plan-ready', sourceRefs: ['group-1'] },
      }],
      order: ['cn-2'],
      actionabilityByChangeId: {
        'cn-2': { state: 'native-ready', providerEvidenceRefs: ['native-1'] },
      },
      certificationByChangeId: {
        'cn-2': { state: 'action-plan-ready', targetIds: ['native-1'] },
      },
    });

    expect(parsed?.entries).toEqual([{
      id: 'cn-2',
      kind: 'ins',
      status: 'proposed',
      representation: 'inline-markup',
      actionability: { state: 'native-ready' },
      certification: { state: 'action-plan-ready' },
    }]);
    expect(JSON.stringify(parsed)).not.toContain('nativeRevisionId');
    expect(JSON.stringify(parsed)).not.toContain('providerEvidenceRefs');
    expect(JSON.stringify(parsed)).not.toContain('targetIds');
    expect(JSON.stringify(parsed)).not.toContain('sourceRefs');
  });

  it('accepts thread-ready as a public actionability state without provider evidence', () => {
    const parsed = parseDocumentSnapshotProtocolSurface({
      protocolVersion: 'changedown-protocol-v1',
      sourceDigest: 'digest-a',
      source: '{>>comment<<}[^cn-2]',
      entries: [{
        id: 'cn-2',
        kind: 'comment',
        status: 'proposed',
        representation: 'comment-thread',
        actionability: { state: 'thread-ready', targetIds: ['comment-1'] },
        certification: { state: 'action-plan-ready' },
      }],
      order: ['cn-2'],
      actionabilityByChangeId: {
        'cn-2': { state: 'thread-ready', providerEvidenceRefs: ['comment-1'] },
      },
      certificationByChangeId: {
        'cn-2': { state: 'action-plan-ready' },
      },
    });

    expect(parsed?.entries[0]?.actionability).toEqual({ state: 'thread-ready' });
    expect(parsed?.actionabilityByChangeId['cn-2']).toEqual({ state: 'thread-ready' });
    expect(JSON.stringify(parsed)).not.toContain('comment-1');
    expect(JSON.stringify(parsed)).not.toContain('providerEvidenceRefs');
  });

  it('preserves not-ready publication boundary metadata on DocumentSnapshot-shaped objects', () => {
    const snapshot: DocumentSnapshot = {
      text: '',
      format: 'L2',
      version: 'not-ready-1',
      publicationState: 'not_ready',
      evidenceDigests: { package: 'pkg-a', native: 'native-a', body: 'body-a' },
      compositionDigest: 'composition-a',
      notReadyBoundary: {
        boundaryId: 'boundary-a',
        snapshotId: 'snapshot-a',
        phase: 'native-census',
        primaryReason: 'native_census_unavailable',
        reasonFamilies: ['native_census_unavailable'],
        rowsWithheld: true,
        collectorStates: {
          package: 'complete',
          nativeRevisionCensus: 'failed',
          nativeComments: 'not_started',
          bodyTopology: 'complete',
          composition: 'not_started',
        },
        evidenceDigests: { package: 'pkg-a' },
        observedCounts: { packageRows: 161 },
        unexplainedMismatches: [],
        diagnosticPreview: { counts: { packageRows: 161 }, phases: ['native-census'], publicDiagnostics: [] },
        debugEvidenceAvailable: true,
        publicDiagnostics: [{ code: 'native-census-unavailable', message: 'Native revision census unavailable' }],
      },
    };

    expect(snapshot.publicationState).toBe('not_ready');
    expect(snapshot.notReadyBoundary?.rowsWithheld).toBe(true);
    expect(snapshot.notReadyBoundary?.reasonFamilies).toEqual(['native_census_unavailable']);
  });


  it('preserves public protocol parent and child topology', () => {
    const parsed = parseDocumentSnapshotProtocolSurface({
      protocolVersion: 'changedown-protocol-v1',
      sourceDigest: 'digest-topology',
      source: '{++parent++}[^cn-1]',
      entries: [{
        id: 'cn-1',
        kind: 'compound',
        status: 'proposed',
        representation: 'footnote-native',
        parentId: 'cn-parent',
        children: ['cn-2', 'cn-3'],
        actionability: { state: 'protocol-ready' },
        certification: { state: 'protocol-ready' },
      }],
      order: ['cn-1'],
      actionabilityByChangeId: { 'cn-1': { state: 'protocol-ready' } },
      certificationByChangeId: { 'cn-1': { state: 'protocol-ready' } },
    });

    expect(parsed?.entries[0]?.parentId).toBe('cn-parent');
    expect(parsed?.entries[0]?.children).toEqual(['cn-2', 'cn-3']);
  });

});
