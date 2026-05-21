import { describe, expect, it } from 'vitest';
import { BackendRegistry, type DocumentBackend, type DocumentSnapshot } from '@changedown/core/backend';
import { handleWordListChanges, handleWordReadTrackedFile } from '../word-document-workflow.js';
import { applyWordReviewChanges } from '../word-review.js';
import { ResourceReader } from '../resources/resource-reader.js';

function snapshot(): DocumentSnapshot {
  return {
    text: 'legacy text should not be listed',
    format: 'L2',
    version: '1',
    publicationState: 'ready',
    readiness: {
      state: 'wire_ready',
      sourceTruth: 'package_ooxml',
      sourceReady: true,
      capabilityReady: true,
      proposedCount: 1,
      interactiveCount: 1,
      witnessOnlyCount: 0,
      diagnosticCount: 0,
      conflictCount: 0,
    },
    protocolSurface: {
      protocolVersion: 'changedown-protocol-v1',
      sourceDigest: 'digest-a',
      source: '{++hello++}[^cn-2]\n\n[^cn-2]: @word | 2026-05-16 | ins | proposed\n',
      entries: [
        {
          id: 'cn-2',
          kind: 'ins',
          status: 'proposed',
          representation: 'inline-markup',
          preview: 'hello',
          line: 1,
          actionability: { state: 'native-ready' },
          certification: { state: 'action-plan-ready' },
        },
      ],
      order: ['cn-2'],
      actionabilityByChangeId: { 'cn-2': { state: 'native-ready' } },
      certificationByChangeId: { 'cn-2': { state: 'action-plan-ready' } },
    },
    actionPlanRefsByChangeId: {
      'cn-2': {
        publicChangeId: 'cn-2',
        actionKind: 'accept',
        targetKind: 'native',
        hasDereferenceableTarget: true,
        createdFromProtocolDigest: 'digest-a',
        createdFromPackageDigest: 'pkg-a',
        createdFromSourceGraphDigest: 'graph-a',
        currentProtocolDigest: 'digest-a',
        currentPackageDigest: 'pkg-a',
        currentSourceGraphDigest: 'graph-a',
      },
    },
  };
}

function warmingBlankProtocolSnapshot(): DocumentSnapshot {
  return {
    text: '',
    format: 'L2',
    version: '0',
    readiness: {
      state: 'warming',
      sourceTruth: 'unknown',
      sourceReady: false,
      capabilityReady: false,
      proposedCount: 0,
      interactiveCount: 0,
      witnessOnlyCount: 0,
      diagnosticCount: 1,
      conflictCount: 0,
    },
    diagnostics: [{
      severity: 'info',
      code: 'word-source-warming',
      message: 'Word source projection is still warming; retry read_tracked_file or list_changes shortly.',
    }],
    protocolSurface: {
      protocolVersion: 'changedown-protocol-v1',
      source: '',
      sourceDigest: 'sha256:empty-warming',
      order: [],
      entries: [],
      actionabilityByChangeId: {},
      certificationByChangeId: {},
    },
  };
}

function backend(): DocumentBackend {
  return {
    schemes: ['word'],
    list: () => [],
    read: async () => snapshot(),
    listChanges: async () => [],
    applyChange: async () => ({ applied: true }),
    subscribe: () => () => undefined,
  };
}

const config = { policy: { default_view: 'working', view_policy: 'suggest' }, protocol: { mode: 'auto' } } as never;
const state = { recordAfterRead: () => undefined };

describe('Word MCP protocol cutover', () => {
  it('read_tracked_file reads protocol source, not legacy snapshot text', async () => {
    const result = await handleWordReadTrackedFile({ backend: backend(), uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.map((item) => (item.type === 'text' ? item.text : '')).join('\n') ?? '';
    expect(text).toContain('hello');
    expect(text).not.toContain('legacy text should not be listed');
  });

  it('resources/read reads protocol source, not legacy snapshot text', async () => {
    const registry = new BackendRegistry();
    registry.register(backend());
    const result = await new ResourceReader(registry).read('word://sess-a');

    expect(result.contents[0]?.text).toContain('hello');
    expect(result.contents[0]?.text).not.toContain('legacy text should not be listed');
  });

  it('list_changes reads protocol entries, not backend witness rows', async () => {
    const result = await handleWordListChanges({ backend: backend(), uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toContain('cn-2');
    expect(text).toContain('protocol_actionability');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.row_model).toBe('protocol_surface');
    expect(parsed.readiness).toMatchObject({ sourceTruth: 'package_ooxml', sourceReady: true });
    expect(parsed.capability_counts).toMatchObject({ proposed: 1, interactive: 1 });
  });

  it('list_changes keeps native/debug private evidence outside canonical protocol rows', async () => {
    const calls: Array<{ filter?: Record<string, unknown> }> = [];
    const privateBoundaryBackend: DocumentBackend = {
      ...backend(),
      listChanges: async (_ref, filter) => {
        calls.push({ filter });
        return [
          {
            changeId: 'cn-legacy-native',
            type: 'ins',
            status: 'proposed',
            author: '@word',
            line: 1,
            preview: 'legacy native row must not become public',
          },
          {
            changeId: '__word_review_map__',
            type: 'WordReviewMap',
            status: 'partial',
            author: '',
            line: 0,
            preview: 'body=ready native=partial scanned=45/348',
            debugKind: 'word-review-map',
            nativeMapReadiness: 'partial',
          } as never,
          {
            changeId: '__word_private_evidence_not_ready__',
            type: 'PrivateEvidenceBoundary',
            status: 'NotReady',
            author: '',
            line: 0,
            preview: 'nativeMapReadiness=partial',
            debugKind: 'private-evidence-not-ready',
            nativeMapReadiness: 'partial',
            nativeScannedParagraphCount: 45,
          } as never,
        ];
      },
    };

    const result = await handleWordListChanges({
      backend: privateBoundaryBackend,
      uri: 'word://sess-a',
      args: { native: true, debug: true },
      config,
      state,
    });

    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text) as {
      changes: Array<{ change_id: string }>;
      private_evidence: { ready: boolean; status: string; boundary?: { change_id: string } };
      native_diagnostics: Array<{ change_id: string; debugKind?: string }>;
    };
    expect(calls).toHaveLength(1);
    expect(calls[0]?.filter).toMatchObject({ native: true, debug: true, debugNative: true });
    expect(parsed.changes.map((change) => change.change_id)).toEqual(['cn-2']);
    expect(JSON.stringify(parsed.changes)).not.toContain('cn-legacy-native');
    expect(parsed.private_evidence).toMatchObject({
      ready: false,
      status: 'partial',
      boundary: { change_id: '__word_private_evidence_not_ready__' },
    });
    expect(parsed.native_diagnostics.map((entry) => entry.change_id)).toEqual([
      '__word_review_map__',
      '__word_private_evidence_not_ready__',
    ]);
  });

  it('list_changes preserves protocol rows when private native diagnostics fail', async () => {
    const failingNativeDebugBackend: DocumentBackend = {
      ...backend(),
      listChanges: async () => {
        throw new Error('pane native diagnostic failure');
      },
    };

    const result = await handleWordListChanges({
      backend: failingNativeDebugBackend,
      uri: 'word://sess-a',
      args: { native: true, debug: true },
      config,
      state,
    });

    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text) as {
      changes: Array<{ change_id: string }>;
      private_evidence: { ready: boolean; status: string; boundary?: { error: string } };
    };
    expect(result.isError).not.toBe(true);
    expect(parsed.changes.map((change) => change.change_id)).toEqual(['cn-2']);
    expect(parsed.private_evidence).toMatchObject({
      ready: false,
      status: 'error',
      boundary: { error: 'pane native diagnostic failure' },
    });
  });

  it('list_changes marks private evidence ready from native map readiness even with zero sidecars', async () => {
    const zeroSidecarReadyBackend: DocumentBackend = {
      ...backend(),
      listChanges: async () => [
        {
          changeId: '__word_review_map__',
          type: 'WordReviewMap',
          status: 'ready',
          author: '',
          line: 0,
          preview: 'body=ready native=ready scanned=1/1',
          debugKind: 'word-review-map',
          nativeMapReadiness: 'ready',
        } as never,
      ],
    };

    const result = await handleWordListChanges({
      backend: zeroSidecarReadyBackend,
      uri: 'word://sess-a',
      args: { native: true, debug: true },
      config,
      state,
    });

    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text) as {
      private_evidence: { ready: boolean; status: string; sidecar_count: number };
    };
    expect(parsed.private_evidence).toMatchObject({
      ready: true,
      status: 'ready',
      sidecar_count: 0,
    });
  });

  it('list_changes native/debug returns private boundary without protocol rows when public actionability is non-final', async () => {
    const partial = snapshot();
    partial.protocolSurface!.entries = [{
      ...partial.protocolSurface!.entries[0]!,
      actionability: { state: 'action-plan-ready' },
    }];
    partial.protocolSurface!.actionabilityByChangeId = { 'cn-2': { state: 'action-plan-ready' } };
    const partialBackend: DocumentBackend = {
      ...backend(),
      read: async () => partial,
      listChanges: async () => [
        {
          changeId: '__word_private_evidence_not_ready__',
          type: 'PrivateEvidenceBoundary',
          status: 'NotReady',
          author: '',
          line: 0,
          preview: 'nativeMapReadiness=partial',
          debugKind: 'private-evidence-not-ready',
          nativeMapReadiness: 'partial',
        } as never,
      ],
    };

    const result = await handleWordListChanges({
      backend: partialBackend,
      uri: 'word://sess-a',
      args: { native: true, debug: true },
      config,
      state,
    });

    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text) as {
      changes: Array<unknown>;
      not_ready: { code: string; message: string };
      private_evidence: { ready: boolean; status: string; boundary?: { change_id: string } };
    };
    expect(result.isError).not.toBe(true);
    expect(parsed.changes).toEqual([]);
    expect(parsed.not_ready).toMatchObject({ code: 'WordActionabilityNotReady' });
    expect(parsed.not_ready.message).toContain('non-final-actionability');
    expect(parsed.private_evidence).toMatchObject({
      ready: false,
      status: 'partial',
      boundary: { change_id: '__word_private_evidence_not_ready__' },
    });
  });

  it('list_changes returns not-ready instead of protocol-only rows when publicationState is missing', async () => {
    const legacyProtocol = snapshot();
    delete legacyProtocol.publicationState;
    const legacyBackend: DocumentBackend = {
      ...backend(),
      read: async () => legacyProtocol,
    };

    const result = await handleWordListChanges({ backend: legacyBackend, uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).toBe(true);
    expect(text).toContain('WordProtocolNotReady');
    expect(text).not.toContain('cn-2');
  });

  it('list_changes returns not-ready instead of protocol-only rows when actionability is partial', async () => {
    const partial = snapshot();
    partial.protocolSurface!.entries = [{
      ...partial.protocolSurface!.entries[0]!,
      actionability: { state: 'action-plan-ready' },
    }];
    partial.protocolSurface!.actionabilityByChangeId = { 'cn-2': { state: 'action-plan-ready' } };
    const partialBackend: DocumentBackend = {
      ...backend(),
      read: async () => partial,
    };

    const result = await handleWordListChanges({ backend: partialBackend, uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).toBe(true);
    expect(text).toContain('WordActionabilityNotReady');
    expect(text).toContain('non-final-actionability');
  });

  it('list_changes rejects native-ready labels without a dereferenceable action plan', async () => {
    const noPlan = snapshot();
    noPlan.actionPlanRefsByChangeId = {};
    const noPlanBackend: DocumentBackend = {
      ...backend(),
      read: async () => noPlan,
    };

    const result = await handleWordListChanges({ backend: noPlanBackend, uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).toBe(true);
    expect(text).toContain('WordActionabilityNotReady');
    expect(text).toContain('native-ready-without-current-plan');
  });

  it('list_changes returns an empty protocol row set instead of falling back to legacy text', async () => {
    const emptyProtocol = snapshot();
    emptyProtocol.text = '{++legacy++}[^cn-legacy]\n\n[^cn-legacy]: @word | 2026-05-16 | ins | proposed\n';
    emptyProtocol.protocolSurface!.entries = [];
    emptyProtocol.protocolSurface!.order = [];
    emptyProtocol.protocolSurface!.actionabilityByChangeId = {};
    emptyProtocol.protocolSurface!.certificationByChangeId = {};
    const emptyBackend: DocumentBackend = {
      ...backend(),
      read: async () => emptyProtocol,
    };

    const result = await handleWordListChanges({ backend: emptyBackend, uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text) as { changes: unknown[]; total_count: number; source: string };
    expect(parsed.source).toBe('protocol-surface');
    expect(parsed.total_count).toBe(0);
    expect(parsed.changes).toEqual([]);
    expect(text).not.toContain('cn-legacy');
  });

  it('list_changes fails closed without a protocol surface in normal public output', async () => {
    const legacyOnly: DocumentSnapshot = {
      text: '{++legacy++}[^cn-legacy]\n\n[^cn-legacy]: @word | 2026-05-16 | ins | proposed\n',
      format: 'L2',
      version: '1',
    };
    const legacyBackend: DocumentBackend = {
      ...backend(),
      read: async () => legacyOnly,
    };

    const result = await handleWordListChanges({ backend: legacyBackend, uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toContain('WordProtocolNotReady');
    expect(text).not.toContain('cn-legacy');
  });

  it('list_changes returns error-shaped not-ready when protocol source is missing', async () => {
    const warming: DocumentSnapshot = {
      text: '{++legacy while warming++}[^cn-legacy]\n\n[^cn-legacy]: @word | 2026-05-16 | ins | proposed\n',
      format: 'L2',
      version: 'warming',
      readiness: {
        state: 'warming',
        sourceTruth: 'unknown',
        sourceReady: false,
        capabilityReady: false,
        proposedCount: 0,
        interactiveCount: 0,
        witnessOnlyCount: 0,
        diagnosticCount: 1,
        conflictCount: 0,
      },
    };
    const warmingBackend: DocumentBackend = {
      ...backend(),
      read: async () => warming,
    };

    const result = await handleWordListChanges({ backend: warmingBackend, uri: 'word://sess-a', args: { detail: 'full' }, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).toBe(true);
    expect(text).toContain('WordProtocolNotReady');
    expect(text).not.toContain('cn-legacy');
  });

  it('read_tracked_file returns error-shaped not-ready when protocol source is missing', async () => {
    const warming: DocumentSnapshot = {
      text: '{++legacy while warming++}[^cn-legacy]\n\n[^cn-legacy]: @word | 2026-05-16 | ins | proposed\n',
      format: 'L2',
      version: 'warming',
      readiness: {
        state: 'warming',
        sourceTruth: 'unknown',
        sourceReady: false,
        capabilityReady: false,
        proposedCount: 0,
        interactiveCount: 0,
        witnessOnlyCount: 0,
        diagnosticCount: 1,
        conflictCount: 0,
      },
    };
    const warmingBackend: DocumentBackend = {
      ...backend(),
      read: async () => warming,
    };

    const result = await handleWordReadTrackedFile({ backend: warmingBackend, uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.map((item) => (item.type === 'text' ? item.text : '')).join('\n') ?? '';
    expect(result.isError).toBe(true);
    expect(text).toContain('WordProtocolNotReady');
    expect(text).not.toContain('cn-legacy');
  });

  it('read_tracked_file rejects blank warming protocol surfaces instead of returning empty success text', async () => {
    const warmingBackend: DocumentBackend = {
      ...backend(),
      read: async () => warmingBlankProtocolSnapshot(),
    };

    const result = await handleWordReadTrackedFile({ backend: warmingBackend, uri: 'word://sess-warming', args: { file: 'word://sess-warming' }, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).toBe(true);
    expect(text).toMatch(/WordProtocolNotReady|word-source-warming|still warming/i);
  });

  it('list_changes rejects blank warming protocol surfaces instead of returning 0-row success', async () => {
    const warmingBackend: DocumentBackend = {
      ...backend(),
      read: async () => warmingBlankProtocolSnapshot(),
    };

    const result = await handleWordListChanges({ backend: warmingBackend, uri: 'word://sess-warming', args: { file: 'word://sess-warming' }, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).toBe(true);
    expect(text).toMatch(/WordProtocolNotReady|WordActionabilityNotReady|word-source-warming|still warming/i);
  });

  it('list_changes does not expose non-protocol diagnostic ids in normal output', async () => {
    const diagnosticSnapshot = snapshot();
    diagnosticSnapshot.capabilitiesByChangeId = {
      'cn-2': { state: 'interactive', nativeReviewable: true, approveRejectCapability: 'available' },
      'cn-native-gap': { state: 'witness-only', nativeReviewable: false, approveRejectCapability: 'unavailable' },
    };
    diagnosticSnapshot.diagnostics = [
      { severity: 'warning', code: 'kept', message: 'protocol id diagnostic', changeId: 'cn-2' },
      { severity: 'warning', code: 'leak', message: 'native-only diagnostic', changeId: 'cn-native-gap' },
    ];
    const diagnosticBackend: DocumentBackend = {
      ...backend(),
      read: async () => diagnosticSnapshot,
    };

    const result = await handleWordListChanges({ backend: diagnosticBackend, uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toContain('kept');
    expect(text).not.toContain('cn-native-gap');
    expect(text).not.toContain('native-only diagnostic');
  });

  it('list_changes strips provider diagnostic details in normal protocol output', async () => {
    const diagnosticSnapshot = snapshot();
    diagnosticSnapshot.diagnostics = [
      {
        severity: 'warning',
        code: 'kept',
        message: 'protocol id diagnostic',
        changeId: 'cn-2',
        details: { nativeRevisionId: 'native-secret', sourceGroupId: 'source-secret' },
      },
    ];
    const diagnosticBackend: DocumentBackend = {
      ...backend(),
      read: async () => diagnosticSnapshot,
    };

    const result = await handleWordListChanges({ backend: diagnosticBackend, uri: 'word://sess-a', args: {}, config, state });
    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toContain('protocol id diagnostic');
    expect(text).not.toContain('native-secret');
    expect(text).not.toContain('source-secret');
  });

  it('review_changes checks protocol actionability and calls backend.applyChange review op', async () => {
    const calls: unknown[] = [];
    let readCount = 0;
    const reviewBackend: DocumentBackend = {
      ...backend(),
      applyChange: async (_ref, op) => {
        calls.push(op);
        return { applied: true };
      },
      read: async () => {
        readCount += 1;
        const post = snapshot();
        if (readCount > 1) {
          post.protocolSurface!.certificationByChangeId = { 'cn-2': { state: 'product-certified' } };
          post.protocolSurface!.entries = [
            { ...post.protocolSurface!.entries[0]!, status: 'accepted', certification: { state: 'product-certified' } },
          ];
        }
        return post;
      },
      listChanges: async () => [],
    };

    const result = await applyWordReviewChanges(
      { reviews: [{ change_id: 'cn-2', decision: 'approve', reason: 'looks good' }] },
      reviewBackend,
      'word://sess-a',
    );

    expect(calls).toEqual([
      {
        kind: 'review',
        args: {
          cnId: 'cn-2',
          decision: 'approve',
          reason: 'looks good',
          author: undefined,
          blocking: undefined,
          label: undefined,
        },
      },
    ]);
    expect(JSON.stringify(result)).toContain('cn-2');
  });

  it('review_changes fails closed when protocol actionability is blocked', async () => {
    const blocked = snapshot();
    blocked.protocolSurface!.actionabilityByChangeId = {
      'cn-2': { state: 'blocked', reason: 'stale-protocol-digest' },
    };
    const blockedBackend: DocumentBackend = {
      ...backend(),
      read: async () => blocked,
      applyChange: async () => {
        throw new Error('should not apply');
      },
    };

    await expect(applyWordReviewChanges(
      { reviews: [{ change_id: 'cn-2', decision: 'approve', reason: 'looks good' }] },
      blockedBackend,
      'word://sess-a',
    )).rejects.toThrow(/WordReviewCapabilityUnavailable: cn-2 is blocked/);
  });

  it('review_changes responses fail closed without protocol thread actionability', async () => {
    const calls: unknown[] = [];
    const responseBackend: DocumentBackend = {
      ...backend(),
      applyChange: async (_ref, op) => {
        calls.push(op);
        return { applied: true };
      },
    };

    await expect(applyWordReviewChanges(
      { responses: [{ change_id: 'cn-2', response: 'reply text' }] },
      responseBackend,
      'word://sess-a',
    )).rejects.toThrow(/WordThreadCapabilityUnavailable/);
    expect(calls).toEqual([]);
  });
});
