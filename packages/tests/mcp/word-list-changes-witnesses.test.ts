/**
 * Plan 3 Word MCP public-row cutover tests.
 *
 * Native revision witnesses and source accounting remain valuable provider/debug
 * evidence, but normal public list/read output must come from protocolSurface.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleWordListChanges, handleWordReadTrackedFile } from '@changedown/mcp/internals';
import type { WordDocumentWorkflowInput } from '@changedown/mcp/internals';
import type { DocumentBackend, DocumentSnapshot, DocumentSnapshotProtocolEntry } from '@changedown/core/backend';
import type { DocumentSnapshotRevisionWitness } from '@changedown/core/backend';
import { DEFAULT_CONFIG } from '@changedown/mcp/internals';

const PROTOCOL_SOURCE = `# Doc

Some text {++added text++}[^cn-10]

[^cn-10]: @ai | 2026-05-16 | ins | proposed
`;

function makeEntry(overrides: Partial<DocumentSnapshotProtocolEntry> = {}): DocumentSnapshotProtocolEntry {
  return {
    id: 'cn-10',
    kind: 'ins',
    status: 'proposed',
    representation: 'inline-markup',
    preview: 'added text',
    line: 3,
    actionability: { state: 'native-ready' },
    certification: { state: 'action-plan-ready' },
    ...overrides,
  };
}

function makeWitness(overrides: Partial<DocumentSnapshotRevisionWitness> = {}): DocumentSnapshotRevisionWitness {
  return {
    changeId: 'cn-10',
    witnessId: 'w-1',
    kind: 'tracked_change',
    type: 'ins',
    status: 'proposed',
    capability: {
      state: 'interactive',
      nativeReviewable: true,
      approveRejectCapability: 'available',
    },
    author: '@ai',
    preview: 'added text',
    operationFragmentIds: ['cn-legacy-fragment'],
    ...overrides,
  };
}

function currentNativeActionPlanRefs(protocolSurface: NonNullable<DocumentSnapshot['protocolSurface']>): NonNullable<DocumentSnapshot['actionPlanRefsByChangeId']> {
  const packageDigest = 'pkg-a';
  const sourceGraphDigest = 'graph-a';
  return Object.fromEntries(
    protocolSurface.entries
      .filter((entry) => entry.actionability.state === 'native-ready')
      .map((entry) => [
        entry.id,
        {
          publicChangeId: entry.id,
          actionKind: 'accept',
          targetKind: 'native',
          hasDereferenceableTarget: true,
          createdFromProtocolDigest: protocolSurface.sourceDigest,
          createdFromPackageDigest: packageDigest,
          createdFromSourceGraphDigest: sourceGraphDigest,
          currentProtocolDigest: protocolSurface.sourceDigest,
          currentPackageDigest: packageDigest,
          currentSourceGraphDigest: sourceGraphDigest,
        },
      ]),
  );
}

function makeProtocolSnapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  const entry = makeEntry();
  const protocolSurface = overrides.protocolSurface ?? {
    protocolVersion: 'changedown-protocol-v1',
    sourceDigest: 'digest-protocol-a',
    source: PROTOCOL_SOURCE,
    entries: [entry],
    order: ['cn-10'],
    actionabilityByChangeId: { 'cn-10': entry.actionability },
    certificationByChangeId: { 'cn-10': entry.certification },
  };
  return {
    text: 'legacy text should not become the public row universe',
    format: 'L2',
    version: 'v1',
    publicationState: 'ready',
    revisionWitnesses: [makeWitness()],
    capabilitiesByChangeId: {
      'cn-10': {
        state: 'interactive',
        nativeReviewable: true,
        approveRejectCapability: 'available',
        nativeActionCnId: 'cn-101',
        revisionFingerprint: 'fp-101',
        joinConfidence: 'high',
      },
    },
    protocolSurface,
    actionPlanRefsByChangeId: currentNativeActionPlanRefs(protocolSurface),
    ...overrides,
  };
}

function makeBackend(snapshot: DocumentSnapshot): DocumentBackend {
  return {
    schemes: ['word'],
    list: () => [],
    read: vi.fn(async () => snapshot),
    subscribe: vi.fn(() => () => {}),
    listChanges: vi.fn(async () => []),
    applyChange: vi.fn(async () => ({ applied: true })),
  };
}

function makeInput(backend: DocumentBackend, args: Record<string, unknown> = {}): WordDocumentWorkflowInput {
  return {
    backend,
    uri: 'word://sess-test',
    args,
    config: DEFAULT_CONFIG,
    state: {
      recordAfterRead: vi.fn(),
    },
  };
}

describe('Word MCP protocol cutover with witness evidence present', () => {
  it('fails closed for normal list_changes when protocolSurface is absent', async () => {
    const backend = makeBackend({
      text: PROTOCOL_SOURCE,
      format: 'L2',
      version: 'legacy-only',
      revisionWitnesses: [makeWitness()],
    });

    const result = await handleWordListChanges(makeInput(backend));

    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.row_model).toBe('not_ready');
    expect(body.not_ready.code).toBe('WordProtocolNotReady');
    expect(body.changes).toEqual([]);
    expect(body.notReadyBoundary.rowsWithheld).toBe(true);
  });

  it('lists protocol rows without leaking witness internals in normal output', async () => {
    const result = await handleWordListChanges(makeInput(makeBackend(makeProtocolSnapshot())));

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.source).toBe('protocol-surface');
    expect(body.total_count).toBe(1);
    expect(body.changes).toEqual([
      expect.objectContaining({
        change_id: 'cn-10',
        type: 'ins',
        status: 'proposed',
        preview: 'added text',
        protocol_actionability: 'native-ready',
        protocol_certification: 'action-plan-ready',
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain('w-1');
    expect(JSON.stringify(body)).not.toContain('cn-101');
    expect(JSON.stringify(body)).not.toContain('fp-101');
  });

  it('filters protocol rows by status and explicit ids', async () => {
    const cn10 = makeEntry({ id: 'cn-10', status: 'accepted', certification: { state: 'observed' } });
    const cn11 = makeEntry({ id: 'cn-11', status: 'proposed', preview: 'other' });
    const snapshot = makeProtocolSnapshot({
      protocolSurface: {
        protocolVersion: 'changedown-protocol-v1',
        sourceDigest: 'digest-protocol-b',
        source: PROTOCOL_SOURCE,
        entries: [cn10, cn11],
        order: ['cn-10', 'cn-11'],
        actionabilityByChangeId: { 'cn-10': cn10.actionability, 'cn-11': cn11.actionability },
        certificationByChangeId: { 'cn-10': cn10.certification, 'cn-11': cn11.certification },
      },
    });

    const byStatus = await handleWordListChanges(makeInput(makeBackend(snapshot), { status: 'proposed' }));
    const statusBody = JSON.parse((byStatus.content[0] as { text: string }).text);
    expect(statusBody.changes.map((row: { change_id: string }) => row.change_id)).toEqual(['cn-11']);

    const byIds = await handleWordListChanges(makeInput(makeBackend(snapshot), { change_id: 'cn-10', change_ids: ['cn-11'] }));
    const idsBody = JSON.parse((byIds.content[0] as { text: string }).text);
    expect(idsBody.changes.map((row: { change_id: string }) => row.change_id)).toEqual(['cn-10', 'cn-11']);
  });

  it('keeps witness/source evidence available only through native diagnostics', async () => {
    const snapshot = makeProtocolSnapshot();
    const backend = {
      ...makeBackend(snapshot),
      listChanges: vi.fn(async () => [{
        changeId: '__debug-w-debug',
        type: 'DebugNativeWitness',
        status: 'diagnostic',
        author: '@word',
        line: 0,
        preview: 'native witness sidecar',
        debugKind: 'word-map-tracked-change',
        nativeMapReadiness: 'ready',
        source_witness_id: 'w-debug',
      }]),
    };

    const result = await handleWordListChanges(makeInput(backend, { native: true }));

    expect(result.isError).toBeFalsy();
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.row_model).toBe('protocol_surface');
    expect(JSON.stringify(body.changes)).not.toContain('w-debug');
    expect(body.native_diagnostics[0].source_witness_id).toBe('w-debug');
  });

  it('uses protocol source for read_tracked_file while native diagnostics expose sanitized capability metadata', async () => {
    const sourceAccounting = {
      records: [],
      counts: { total: 1, interactive: 1, sourceVisible: 0, witnessOnly: 0, diagnosticOnly: 0, conflict: 0 },
    };
    const snapshot = makeProtocolSnapshot({ sourceAccounting });
    const result = await handleWordReadTrackedFile(makeInput(makeBackend(snapshot), { native: true }));

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('added text');
    expect(text).not.toContain('legacy text should not become the public row universe');
    expect(text).toContain('revision witnesses');
    const structured = result.structuredContent as Record<string, any>;
    expect(structured.capabilitiesByChangeId['cn-10']).toMatchObject({
      state: 'interactive',
      nativeReviewable: true,
      approveRejectCapability: 'available',
      joinConfidence: 'high',
    });
    expect(structured.capabilitiesByChangeId['cn-10'].nativeActionCnId).toBeUndefined();
    expect(structured.capabilitiesByChangeId['cn-10'].revisionFingerprint).toBeUndefined();
    expect(structured.sourceAccounting).toEqual(sourceAccounting);
  });
});
