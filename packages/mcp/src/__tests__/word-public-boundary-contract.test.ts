import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { BackendRegistry, type DocumentBackend, type DocumentSnapshot } from '@changedown/core/backend';
import { getListedToolsWithConfig } from '../listed-tools.js';
import { compactProposeChangeSchema, classicProposeChangeSchema } from '../tool-schemas.js';
import { handleWordListChanges, handleWordReadTrackedFile } from '../word-document-workflow.js';
import { applyWordReviewChanges } from '../word-review.js';
import { ResourceReader } from '../resources/resource-reader.js';
import { handleRemoteHttpFacade } from '../remote/http-facade.js';
import { openApiFromMcpTools } from '../remote/openapi-from-mcp.js';

const config = { policy: { default_view: 'working', view_policy: 'suggest' }, protocol: { mode: 'auto' } } as never;
const state = { recordAfterRead: () => undefined };

function notReadySnapshot(): DocumentSnapshot {
  return {
    text: '{++legacy++}[^cn-legacy]\n\n[^cn-legacy]: @word | 2026-05-16 | ins | proposed\n',
    format: 'L2',
    version: 'warming',
    readiness: {
      state: 'warming',
      sourceTruth: 'unknown',
      sourceReady: false,
      capabilityReady: false,
      privateEvidenceReady: false,
      proposedCount: 0,
      interactiveCount: 0,
      witnessOnlyCount: 0,
      diagnosticCount: 1,
      conflictCount: 0,
    },
  };
}

function actionableSnapshot(): DocumentSnapshot {
  return {
    text: 'legacy text must not be listed',
    format: 'L2',
    version: '1',
    publicationState: 'ready',
    readiness: {
      state: 'wire_ready',
      sourceTruth: 'package_ooxml',
      sourceReady: true,
      capabilityReady: true,
      privateEvidenceReady: true,
      proposedCount: 1,
      interactiveCount: 1,
      witnessOnlyCount: 0,
      diagnosticCount: 0,
      conflictCount: 0,
    },
    diagnostics: [{
      severity: 'warning',
      code: 'private-detail-stripped',
      message: 'public diagnostic',
      changeId: 'cn-2',
      details: { nativeRevisionId: 'native-secret', sourceGroupId: 'source-secret', rawL3: 'secret' },
    }],
    capabilitiesByChangeId: {
      'cn-2': {
        state: 'interactive',
        nativeReviewable: true,
        approveRejectCapability: 'available',
        revisionFingerprint: 'native-secret-fingerprint',
      },
    },
    protocolSurface: {
      protocolVersion: 'changedown-protocol-v1',
      sourceDigest: 'digest-a',
      source: '{++hello++}[^cn-2]\n\n[^cn-2]: @word | 2026-05-16 | ins | proposed\n',
      entries: [{
        id: 'cn-2',
        kind: 'ins',
        status: 'proposed',
        representation: 'inline-markup',
        preview: 'hello',
        line: 1,
        actionability: { state: 'native-ready' },
        certification: { state: 'action-plan-ready' },
      }],
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

function backend(snapshot: DocumentSnapshot): DocumentBackend {
  return {
    schemes: ['word'],
    list: () => [],
    read: async () => snapshot,
    listChanges: async () => [],
    applyChange: async () => ({ applied: false, text: 'should not apply' }),
    subscribe: () => () => undefined,
  };
}

const matrixFiles = {
  localToolSchemasAndListings: [
    'packages/mcp/src/tool-schemas.ts',
    'packages/mcp/src/listed-tools.ts',
  ],
  localReadListReviewWrappers: [
    'packages/mcp/src/tools/read-tracked-file.ts',
    'packages/mcp/src/tools/list-changes.ts',
    'packages/mcp/src/tools/review-changes.ts',
    'packages/mcp/src/word-document-workflow.ts',
    'packages/mcp/src/word-review.ts',
  ],
  hostMode: ['packages/mcp/src/host-mode.ts'],
  resources: [
    'packages/mcp/src/resources/resource-lister.ts',
    'packages/mcp/src/resources/resource-reader.ts',
  ],
  httpOpenApi: [
    'packages/mcp/src/remote/http-facade.ts',
    'packages/mcp/src/remote/openapi-from-mcp.ts',
    'packages/mcp/src/remote/backend-wire-lowering.ts',
  ],
  remoteRoomDispatch: [
    'packages/mcp/src/remote/remote-server-factory.ts',
    'packages/mcp/src/remote/remote-tool-list.ts',
    'packages/mcp/src/remote/room-document-backend.ts',
  ],
  streamTransports: [
    'packages/mcp/src/transport/pane-endpoint.ts',
    'packages/mcp/src/transport/streamable-http.ts',
  ],
  wordPaneBackendBridge: [
    'packages/word-add-in/src/backend/word-backend-impl.ts',
    'packages/word-add-in/src/bridge/handlers.ts',
  ],
} as const;

function readFiles(files: readonly string[]): string {
  return files.map((file) => {
    const path = existsSync(file) ? file : resolve(process.cwd(), '../..', file);
    return `\n--- ${file} ---\n${readFileSync(path, 'utf8')}`;
  }).join('\n');
}

describe('Word public boundary contract', () => {
  it('public tool descriptions do not advertise source-list or source-ready success', () => {
    const publicText = JSON.stringify([
      getListedToolsWithConfig(config),
      compactProposeChangeSchema,
      classicProposeChangeSchema,
    ]);
    expect(publicText).not.toMatch(/source-list|source ready|source-ready|native row universe/i);
  });

  it('local MCP wrappers preserve Word not-ready errors', async () => {
    const wordBackend = backend(notReadySnapshot());
    const read = await handleWordReadTrackedFile({ backend: wordBackend, uri: 'word://sess-test', args: {}, config, state });
    const list = await handleWordListChanges({ backend: wordBackend, uri: 'word://sess-test', args: {}, config, state });

    expect(read.isError).toBe(true);
    expect(read.content[0]?.type === 'text' ? read.content[0].text : '').toContain('WordProtocolNotReady');
    expect(list.isError).toBe(true);
    expect(list.content[0]?.type === 'text' ? list.content[0].text : '').toContain('WordProtocolNotReady');
    await expect(applyWordReviewChanges(
      { reviews: [{ change_id: 'cn-2', decision: 'approve', reason: 'approve' }] },
      backend(actionableSnapshot()),
      'word://sess-test',
    )).rejects.toThrow(/should not apply|did not apply|ReviewPostcondition|CapabilityUnavailable/);
  });

  it('remote HTTP/OpenAPI and resources preserve not-ready as non-success', async () => {
    const notReadyResult = { isError: true, content: [{ type: 'text' as const, text: 'WordActionabilityNotReady: still hydrating' }] };
    const response = await handleRemoteHttpFacade(
      new Request('https://relay.example/tools/read_tracked_file?file=word://sess-test'),
      { auth: { roomId: 'room', role: 'owner' }, room: { callBackendOperation: async () => ({}) } },
      {
        listTools: async (): Promise<ListToolsResult> => ({ tools: [] }),
        callTool: async () => notReadyResult,
      },
    );
    const body = await response!.json() as Record<string, unknown>;
    expect(body).toMatchObject({ tool: 'read_tracked_file', isError: true });

    const openapi = openApiFromMcpTools([], { title: 'ChangeDown Remote Word Tools', version: 'test' });
    expect(JSON.stringify(openapi)).not.toMatch(/source-ready|source-list|native row universe/i);

    const registry = new BackendRegistry();
    registry.register(backend(notReadySnapshot()));
    await expect(new ResourceReader(registry).read('word://sess-test')).rejects.toThrow(/WordProtocolSurfaceMissing|WordProtocolNotReady/);
  });



  it('list_changes returns not_ready with empty changes and rowsWithheld for unpublished Word universe', async () => {
    const snapshot = actionableSnapshot();
    snapshot.publicationState = 'not_ready';
    snapshot.protocolSurface = undefined;
    snapshot.actionPlanRefsByChangeId = undefined;
    snapshot.text = '{++stale++}[^cn-stale]\n\n[^cn-stale]: @word | 2026-05-18 | ins | proposed\n';
    snapshot.notReadyBoundary = {
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
    };

    const result = await handleWordListChanges({ backend: backend(snapshot), uri: 'word://sess-test', args: {}, config, state });
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const parsed = JSON.parse(text) as { changes: unknown[]; notReadyBoundary: { rowsWithheld: boolean } };
    expect(result.isError).toBe(true);
    expect(parsed.changes).toEqual([]);
    expect(parsed.notReadyBoundary.rowsWithheld).toBe(true);
    expect(text).not.toContain('cn-stale');
  });

  it('read_tracked_file does not serialize stale cn entries when Word universe is not ready', async () => {
    const snapshot = notReadySnapshot();
    snapshot.publicationState = 'not_ready';
    snapshot.text = '{++stale++}[^cn-stale]\n\n[^cn-stale]: @word | 2026-05-18 | ins | proposed\n';
    snapshot.notReadyBoundary = {
      boundaryId: 'boundary-a',
      snapshotId: 'snapshot-a',
      phase: 'native-census',
      primaryReason: 'native_census_unavailable',
      reasonFamilies: ['native_census_unavailable'],
      rowsWithheld: true,
      collectorStates: { package: 'complete', nativeRevisionCensus: 'failed', nativeComments: 'complete', bodyTopology: 'complete', composition: 'not_started' },
      evidenceDigests: { package: 'pkg-a' },
      observedCounts: { packageRows: 161 },
      unexplainedMismatches: [{ evidenceRefs: ['cn-stale', 'native:secret', 'native-comment:c-leak', 'native-revision:r-leak', 'provider-evidence:p-leak', 'proof-fingerprint:abc123'], nativeRevisionIds: ['native-target-secret'] }],
      debugEvidenceAvailable: true,
      publicDiagnostics: [{ code: 'native-census-unavailable', message: 'Native census unavailable for cn-stale at native:secret' }],
      diagnosticPreview: {
        publicDiagnostics: [{ code: 'native-census-unavailable', message: 'Preview mentions cn-stale and native:secret' }],
      },
    };

    const result = await handleWordReadTrackedFile({ backend: backend(snapshot), uri: 'word://sess-test', args: {}, config, state });
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).toBe(true);
    expect(text).toContain('WordProtocolNotReady');
    expect(text).toContain('rowsWithheld');
    expect(text).not.toContain('cn-stale');
    expect(text).not.toContain('native:secret');
    expect(text).not.toContain('proof-fingerprint:abc123');
    expect(text).not.toContain('native-target-secret');
    expect(text).not.toContain('native-comment:');
    expect(text).not.toContain('c-leak');
    expect(text).not.toContain('native-revision:');
    expect(text).not.toContain('r-leak');
    expect(text).not.toContain('provider-evidence:');
    expect(text).not.toContain('p-leak');
  });

  it('remote malformed action-plan refs do not satisfy native-ready actionability', async () => {
    const malformed = actionableSnapshot();
    malformed.actionPlanRefsByChangeId = {
      'cn-2': {
        publicChangeId: 'cn-2',
        actionKind: 'accept',
        targetKind: 'native',
        hasDereferenceableTarget: true,
        createdFromProtocolDigest: '',
        createdFromPackageDigest: '',
        createdFromSourceGraphDigest: '',
        currentProtocolDigest: '',
        currentPackageDigest: '',
        currentSourceGraphDigest: '',
      },
    };

    const result = await handleWordListChanges({ backend: backend(malformed), uri: 'word://sess-test', args: {}, config, state });
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).toBe(true);
    expect(text).toContain('WordActionabilityNotReady');
    expect(text).toContain('native-ready-without-current-plan');
  });

  it('normal public rows omit provider/native evidence', async () => {
    const result = await handleWordListChanges({ backend: backend(actionableSnapshot()), uri: 'word://sess-test', args: {}, config, state });
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.isError).not.toBe(true);
    expect(text).toContain('cn-2');
    expect(text).not.toMatch(/nativeRevisionId|sourceGroupId|fingerprint|providerEvidence|rawL3|actionPlanRefsByChangeId|createdFromProtocolDigest/i);
  });

  it('static boundary matrix has no source-ready/source-list success rewrites', () => {
    for (const [surface, files] of Object.entries(matrixFiles)) {
      const source = readFiles(files);
      expect(source, surface).not.toMatch(/source-list-package|source-ready-only|source-ready product|native row universe/i);
      expect(source, surface).not.toMatch(/changes:\s*\[\].*Word.*NotReady/s);
    }
  });

  it('Word backend and bridge require canonical protocol/plans without public sourceOverride side path', () => {
    const source = readFiles(matrixFiles.wordPaneBackendBridge);
    expect(source).toMatch(/protocolSurface/i);
    expect(source).toMatch(/CodecActionPlan|actionPlan|action plan|thread actionability/i);
    expect(source).not.toMatch(/sourceOverride|source-list-package|nativeRows.*public/i);
  });
});
