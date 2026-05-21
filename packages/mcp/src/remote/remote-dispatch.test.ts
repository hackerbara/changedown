import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { computeLineHash } from '@changedown/core';
import { DEFAULT_CONFIG, SessionState } from '@changedown/cli/engine/browser';
import { handleWordProposeChange } from '../word-document-workflow.js';
import { createLabDiagnosticsStoreForTest } from '../lab-diagnostics.js';
import { createRemoteRelayServer } from './remote-server-factory.js';
import type { RelayAuthContext } from './relay-context.js';
import type { DocumentBackend, PaneBackendWireRequest } from '@changedown/core/backend';

function l2ReadResult(text = 'Hello world'): Record<string, unknown> {
  return { text, format: 'L2', version: 'v-test', publicationState: 'ready', protocolSurface: protocolSurface(text, []) };
}

function actionPlanRefs(ids: string[] = ['cn-2']): Record<string, unknown> {
  return Object.fromEntries(ids.map((id) => [id, {
    publicChangeId: id,
    actionKind: 'accept',
    targetKind: 'native',
    hasDereferenceableTarget: true,
    createdFromProtocolDigest: 'digest-test',
    createdFromPackageDigest: 'pkg-test',
    createdFromSourceGraphDigest: 'graph-test',
    currentProtocolDigest: 'digest-test',
    currentPackageDigest: 'pkg-test',
    currentSourceGraphDigest: 'graph-test',
  }]));
}



function protocolSurface(source: string, ids: string[] = ['cn-2']): Record<string, unknown> {
  return {
    protocolVersion: 'changedown-protocol-v1',
    sourceDigest: 'digest-test',
    source,
    entries: ids.map((id) => ({
      id,
      kind: 'ins',
      status: 'proposed',
      representation: 'inline-markup',
      preview: 'change',
      line: 1,
      actionability: { state: 'native-ready' },
      certification: { state: 'action-plan-ready' },
    })),
    order: ids,
    actionabilityByChangeId: Object.fromEntries(ids.map((id) => [id, { state: 'native-ready' }])),
    certificationByChangeId: Object.fromEntries(ids.map((id) => [id, { state: 'action-plan-ready' }])),
  };
}

function l3ReadResult(): unknown {
  const body = 'Hello world';
  const hash = computeLineHash(0, body, [body]);
  return {
    text:
      `${body}\n\n` +
      `[^cn-1]: @Reviewer | 2026-05-07 | ins | proposed\n` +
      `    1:${hash} Hello {++world++}\n`,
    format: 'L3',
    version: 'v-l3-test',
  };
}

async function withClient(
  fn: (client: Client, calls: PaneBackendWireRequest[]) => Promise<void>,
  options: {
    auth?: RelayAuthContext;
    callBackendOperation?: (operation: PaneBackendWireRequest, metadata: { idempotencyKey?: string }) => Promise<unknown>;
  } = {},
) {
  const calls: PaneBackendWireRequest[] = [];
  const server = createRemoteRelayServer({
    clientInfo: { name: 'Test Agent', version: '1.0.0' },
    auth: options.auth ?? { roomId: 'room-t', role: 'write' },
    room: {
      async callBackendOperation(operation, metadata) {
        calls.push(operation);
        if (options.callBackendOperation) return options.callBackendOperation(operation, metadata);
        return { ok: true, operation, metadata };
      },
    },
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try { await fn(client, calls); } finally { await Promise.allSettled([clientTransport.close(), serverTransport.close()]); }
}

describe('Word workflow lab apply diagnostics', () => {
  it('records lab prep category while preserving product error code', async () => {
    let applyCalls = 0;
    const backend: Pick<DocumentBackend, 'read' | 'applyChange'> = {
      async read() {
        return { text: 'hello', format: 'L2' as const, version: 'v-test' };
      },
      async applyChange() {
        applyCalls++;
        return { applied: true };
      },
    };
    const labDiagnostics = createLabDiagnosticsStoreForTest({ runId: 'RUN_1', token: 'secret-1' });
    const result = await handleWordProposeChange({
      backend: backend as DocumentBackend,
      uri: 'word://sess-test',
      args: { at: '1:abc', op: '{++x++}', old_text: 'x' },
      config: DEFAULT_CONFIG,
      state: new SessionState(),
      labDiagnostics,
    });

    const text = result.content.map((part) => part.type === 'text' ? part.text : '').join('\n');
    expect(text).toContain('MIXED_PROPOSAL_FAMILY');
    expect(applyCalls).toBe(0);
    expect(labDiagnostics.snapshot().applyDiagnostics[0]?.mcpPrep?.categoryCode).toBe('MCP_PREP_MIXED_FAMILY');
  });

  it('records fallback prep failure category while preserving product error text', async () => {
    let applyCalls = 0;
    const source = '{++Alpha++}[^cn-1]\n\n[^cn-1]: @ai:prior | 2026-05-06 | ins | accepted\n';
    const backend: Pick<DocumentBackend, 'read' | 'applyChange'> = {
      async read() {
        return { text: source, format: 'L2' as const, version: 'v-test' };
      },
      async applyChange() {
        applyCalls++;
        return { applied: true };
      },
    };
    const labDiagnostics = createLabDiagnosticsStoreForTest({ runId: 'RUN_FALLBACK', token: 'secret-fallback' });
    const result = await handleWordProposeChange({
      backend: backend as DocumentBackend,
      uri: 'word://sess-test',
      args: { old_text: 'Alpha', new_text: 'Beta', author: 'ai:test' },
      config: DEFAULT_CONFIG,
      state: new SessionState(),
      labDiagnostics,
    });

    const text = result.content.map((part) => part.type === 'text' ? part.text : '').join('\n');
    expect(text).toContain('settling accepted/rejected changes');
    expect(text).toContain('SETTLE_ON_DEMAND_UNSUPPORTED');
    expect(applyCalls).toBe(0);
    expect(labDiagnostics.snapshot().applyDiagnostics[0]?.mcpPrep?.categoryCode).toBe('MCP_PREP_FALLBACK_FAILED');
  });

  it('passes the apply diagnostic id only through pane apply args', async () => {
    let appliedOp: unknown;
    const backend: Pick<DocumentBackend, 'read' | 'applyChange'> = {
      async read() {
        return { text: 'hello', format: 'L2' as const, version: 'v-test' };
      },
      async applyChange(_ref, op) {
        appliedOp = op;
        return { applied: true };
      },
    };
    const labDiagnostics = createLabDiagnosticsStoreForTest({ runId: 'RUN_2', token: 'secret-2' });
    const result = await handleWordProposeChange({
      backend: backend as DocumentBackend,
      uri: 'word://sess-test',
      args: { old_text: 'hello', new_text: 'hi', author: 'ai:test' },
      config: DEFAULT_CONFIG,
      state: new SessionState(),
      labDiagnostics,
    });

    const envelope = labDiagnostics.snapshot().applyDiagnostics[0];
    expect(envelope?.status).toBe('pane-dispatch-applied');
    expect(envelope?.endedAt).toEqual(expect.any(String));
    expect(envelope?.mcpPrep).toMatchObject({ categoryCode: 'MCP_PREP_CLASSIC_OK', family: 'classic', ok: true });
    expect(envelope?.paneDispatch).toMatchObject({ applied: true });
    expect(appliedOp).toMatchObject({
      kind: 'propose',
      args: { __labApplyDiagnosticId: envelope?.applyDiagnosticId },
    });
    expect(JSON.stringify(result)).not.toContain('__labApplyDiagnosticId');
    expect(JSON.stringify(result)).not.toContain(String(envelope?.applyDiagnosticId));
  });

  it('records not-applied dispatch status without changing product error text', async () => {
    const backend: Pick<DocumentBackend, 'read' | 'applyChange'> = {
      async read() {
        return { text: 'hello', format: 'L2' as const, version: 'v-test' };
      },
      async applyChange() {
        return { applied: false, text: 'Pane refused apply: stale document' };
      },
    };
    const labDiagnostics = createLabDiagnosticsStoreForTest({ runId: 'RUN_NOT_APPLIED', token: 'secret-not-applied' });
    const result = await handleWordProposeChange({
      backend: backend as DocumentBackend,
      uri: 'word://sess-test',
      args: { old_text: 'hello', new_text: 'hi', author: 'ai:test' },
      config: DEFAULT_CONFIG,
      state: new SessionState(),
      labDiagnostics,
    });

    const text = result.content.map((part) => part.type === 'text' ? part.text : '').join('\n');
    expect(result.isError).toBe(true);
    expect(text).toContain('Pane refused apply: stale document');
    const envelope = labDiagnostics.snapshot().applyDiagnostics[0];
    expect(envelope?.status).toBe('pane-dispatch-not-applied');
    expect(envelope?.endedAt).toEqual(expect.any(String));
    expect(envelope?.paneDispatch).toMatchObject({ applied: false, errorCode: 'Pane refused apply: stale document' });
  });

  it('records thrown dispatch status without changing product error text', async () => {
    const backend: Pick<DocumentBackend, 'read' | 'applyChange'> = {
      async read() {
        return { text: 'hello', format: 'L2' as const, version: 'v-test' };
      },
      async applyChange() {
        throw new Error('Pane transport exploded');
      },
    };
    const labDiagnostics = createLabDiagnosticsStoreForTest({ runId: 'RUN_THROWN', token: 'secret-thrown' });
    const result = await handleWordProposeChange({
      backend: backend as DocumentBackend,
      uri: 'word://sess-test',
      args: { old_text: 'hello', new_text: 'hi', author: 'ai:test' },
      config: DEFAULT_CONFIG,
      state: new SessionState(),
      labDiagnostics,
    });

    const text = result.content.map((part) => part.type === 'text' ? part.text : '').join('\n');
    expect(result.isError).toBe(true);
    expect(text).toContain('Pane transport exploded');
    const envelope = labDiagnostics.snapshot().applyDiagnostics[0];
    expect(envelope?.status).toBe('pane-dispatch-thrown');
    expect(envelope?.endedAt).toEqual(expect.any(String));
    expect(envelope?.paneDispatch).toMatchObject({ applied: false, errorCode: 'Pane transport exploded' });
  });
});

describe('remote relay MCP server', () => {
  it('lists only remote Word-safe tools with idempotency in mutating schemas', async () => {
    await withClient(async (client) => {
      const listed = await client.listTools();
      expect(listed.tools.map((t) => t.name)).toEqual(['read_tracked_file', 'list_changes', 'propose_change', 'review_changes', 'amend_change', 'supersede_change', 'resolve_thread']);
      const propose = listed.tools.find((t) => t.name === 'propose_change');
      expect(propose?.inputSchema.properties).toHaveProperty('idempotency_key');
      expect(propose?.inputSchema.required).toContain('idempotency_key');
      expect(propose?.annotations?.idempotentHint).toBe(true);
      const resolve = listed.tools.find((t) => t.name === 'resolve_thread');
      expect(resolve?.inputSchema.properties?.action).toMatchObject({ enum: ['resolve', 'unresolve'] });
    });
  });

  it('exposes a Worker-safe remote Word-only schema surface', async () => {
    await withClient(async (client) => {
      const listed = await client.listTools();
      const read = listed.tools.find((t) => t.name === 'read_tracked_file');
      expect(read?.inputSchema.properties).toHaveProperty('include_guide');
      expect(read?.inputSchema.properties).toHaveProperty('include_meta');
      expect(read?.inputSchema.properties?.view).toMatchObject({ enum: ['working', 'simple', 'decided', 'original', 'raw'] });
      expect(read?.inputSchema.properties).not.toHaveProperty('debug');
      expect(read?.inputSchema.properties).not.toHaveProperty('diagnostics');
      expect(read?.inputSchema.properties).not.toHaveProperty('native');

      expect(listed.tools.some((t) => t.name === ['read', 'tracked', 'page'].join('_'))).toBe(false);

      const list = listed.tools.find((t) => t.name === 'list_changes');
      expect(list?.inputSchema.properties).toHaveProperty('change_id');
      expect(list?.inputSchema.properties).toHaveProperty('change_ids');
      expect(list?.inputSchema.properties?.detail).toMatchObject({ enum: ['summary', 'context', 'full'] });

      expect(listed.tools.some((t) => t.name === ['list', 'changes', 'page'].join('_'))).toBe(false);

      const propose = listed.tools.find((t) => t.name === 'propose_change');
      expect(propose?.inputSchema.properties).toHaveProperty('at');
      expect(propose?.inputSchema.properties).toHaveProperty('op');
      expect(propose?.inputSchema.properties).not.toHaveProperty('changes');
      expect(propose?.inputSchema.properties).toHaveProperty('raw');
      expect(propose?.inputSchema.properties).toHaveProperty('old_text');
      expect(propose?.inputSchema.properties).toHaveProperty('new_text');
      expect(propose?.inputSchema.properties).toHaveProperty('insert_after');
      expect(propose?.inputSchema.properties).toHaveProperty('idempotency_key');

      const supersede = listed.tools.find((t) => t.name === 'supersede_change');
      expect(supersede?.inputSchema.properties).toHaveProperty('old_text');
      expect(supersede?.inputSchema.properties).toHaveProperty('new_text');
      expect(supersede?.inputSchema.properties).toHaveProperty('insert_after');
      expect(supersede?.inputSchema.properties).not.toHaveProperty('at');
      expect(supersede?.inputSchema.properties).not.toHaveProperty('op');
      expect(supersede?.inputSchema.required).toEqual(['file', 'change_id', 'old_text', 'new_text', 'idempotency_key']);
      expect(JSON.stringify(listed.tools)).not.toContain('file://');
      expect(JSON.stringify(listed.tools)).not.toContain('local paths');
      expect(JSON.stringify(listed.tools)).toContain('word://');
    });
  });

  it('dispatches calls through room client and synthesizes author from relay client info', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', old_text: 'world', new_text: 'there', idempotency_key: 'idem-1' } });
      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(3);
      expect(calls[0]).toMatchObject({ operation: { kind: 'read', ref: { uri: 'word://sess-t' } } });
      expect(calls[2]).toMatchObject({ operation: { kind: 'read', ref: { uri: 'word://sess-t' } } });
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(apply.operation.op).toMatchObject({ kind: 'propose', args: { oldL2: 'Hello world' } });
      expect(String(apply.operation.op.args.newL2)).toContain('@ai:test-agent');
      expect(JSON.stringify(apply)).not.toContain('propose_change');
      expect(JSON.stringify(apply)).not.toContain('idempotency_key');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true, changeId: 'cn-1' };
      },
    });
  });

  it('normalizes L3 snapshots before preparing a Word source-transition proposal', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', old_text: 'Hello', new_text: 'Hi', idempotency_key: 'idem-l3-source' } });
      expect(result.isError).not.toBe(true);
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(String(apply.operation.op.args.oldL2)).toContain('{++world++}');
      expect(String(apply.operation.op.args.oldL2)).not.toContain('1:');
      expect(String(apply.operation.op.args.newL2)).toContain('{~~Hello~>Hi~~}');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l3ReadResult();
        return { applied: true, changeId: 'cn-2' };
      },
    });
  });

  it('preserves an explicit author over relay client info synthesis', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', old_text: 'world', new_text: 'there', author: 'human:alice', idempotency_key: 'idem-2' } });
      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(3);
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(String(apply.operation.op.args.newL2)).toContain('@human:alice');
      expect(String(apply.operation.op.args.newL2)).not.toContain('@ai:test-agent');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true, changeId: 'cn-1' };
      },
    });
  });

  it('does not synthesize an author when the caller explicitly supplies author', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', old_text: 'world', new_text: 'there', author: '', idempotency_key: 'idem-3' } });
      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(3);
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(String(apply.operation.op.args.newL2)).not.toContain('@ai:test-agent');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true, changeId: 'cn-1' };
      },
    });
  });


  it('rejects non-word targets before room dispatch', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: '/Users/alice/private.md' } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('RemoteWordTargetRequired');
      expect(calls).toHaveLength(0);
    });
  });

  it('rejects blank idempotency keys before room dispatch', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', at: '1:abc', op: '{~~a~>b~~}', idempotency_key: '' } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('IdempotencyKeyRequired');
      expect(calls).toHaveLength(0);
    });
  });

  it('rejects mutating calls missing idempotency before room dispatch', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', at: '1:abc', op: '{~~a~>b~~}' } });
      expect(result.isError).toBe(true);
      expect(calls).toHaveLength(0);
    });
  });

  it('rejects mutating calls from read-only relay tokens before room dispatch', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'propose_change', arguments: { file: 'word://sess-t', at: '1:abc', op: '{~~a~>b~~}', idempotency_key: 'idem-readonly' } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('ForbiddenReadOnlyRole');
      expect(calls).toHaveLength(0);
    }, { auth: { roomId: 'room-t', role: 'read' } });
  });

  it('propagates pane read errors before workflow formatting', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: 'word://sess-t' } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('pane-side failure');
      expect(calls).toHaveLength(1);
    }, { callBackendOperation: async () => ({ isError: true, content: [{ type: 'text', text: 'pane-side failure' }] }) });
  });





  it('list_changes enriches entries with snapshot capabilities and readiness', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'list_changes', arguments: { file: 'word://sess-t', detail: 'full' } });
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
      const response = JSON.parse(text);
      const change = response.changes[0];
      expect(response.source).toBe('protocol-surface');
      expect(change).toMatchObject({
        change_id: 'cn-2',
        protocol_actionability: 'native-ready',
        protocol_certification: 'action-plan-ready',
      });
      expect(change.capability).toBeUndefined();
      expect(response.readiness).toMatchObject({ state: 'wire_ready', sourceTruth: 'body_ooxml' });
    }, {
      callBackendOperation: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            text: 'Body {++change++}[^cn-2]\n\n[^cn-2]: @Reviewer | 2026-05-08 | ins | proposed\n',
            format: 'L2',
            version: 'v1',
            readiness: {
              state: 'wire_ready',
              sourceTruth: 'body_ooxml',
              sourceReady: true,
              capabilityReady: true,
              proposedCount: 1,
              interactiveCount: 0,
              witnessOnlyCount: 0,
              diagnosticCount: 0,
              conflictCount: 0,
            },
            capabilitiesByChangeId: {
              'cn-2': {
                state: 'source-visible',
                nativeReviewable: false,
                approveRejectCapability: 'unknown',
                reason: 'No matching Office.js tracked change yet',
                thread: { state: 'available', operations: ['reply', 'resolve', 'unresolve'] },
                requestChanges: { state: 'unavailable', reason: 'request-changes-not-proven' },
              },
            },
            diagnostics: [{
              severity: 'warning',
              code: 'ooxml-witness-only',
              message: 'OOXML witness is visible but not native reviewable',
              changeId: 'cn-2',
            }],
            publicationState: 'ready',
            protocolSurface: protocolSurface('Body {++change++}[^cn-2]\n\n[^cn-2]: @Reviewer | 2026-05-08 | ins | proposed\n'),
            actionPlanRefsByChangeId: actionPlanRefs(['cn-2']),
          }),
        }],
      }),
    });
  });

  it('remote list_changes strips hidden diagnostic flags and fails closed instead of legacy provider output', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({ name: 'list_changes', arguments: { file: 'word://sess-t', debug: true, diagnostics: true, native: true } });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
      expect(text).toContain('WordProtocolNotReady');
      expect(text).not.toContain('native_changes');
      expect(text).not.toContain('source_accounting');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read']);
    }, {
      callBackendOperation: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            text: 'Legacy {++change++}[^cn-legacy]\n\n[^cn-legacy]: @Reviewer | 2026-05-08 | ins | proposed\n',
            format: 'L2',
            version: 'legacy-only',
            sourceAccounting: {
              records: [],
              counts: { total: 0, interactive: 0, sourceVisible: 0, witnessOnly: 0, diagnosticOnly: 0, conflict: 0 },
            },
          }),
        }],
      }),
    });
  });


  it('list_changes preserves source-backed witness-only rows that are not materialized in L2 text', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'list_changes', arguments: { file: 'word://sess-t', detail: 'summary' } });
      expect(result.isError).not.toBe(true);
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
      const response = JSON.parse(text);
      expect(response.source).toBe('protocol-surface');
      expect(response.changes.map((change: { change_id: string }) => change.change_id)).toEqual(['cn-source']);
      expect(response.changes[0]).toMatchObject({
        protocol_actionability: 'native-ready',
        protocol_certification: 'action-plan-ready',
      });
    }, {
      callBackendOperation: async () => ({
        text: 'Body with no materialized critic markup',
        format: 'L2',
        version: 'v-source-witness',
        publicationState: 'ready',
        protocolSurface: protocolSurface('Body with no materialized critic markup', ['cn-source']),
        actionPlanRefsByChangeId: actionPlanRefs(['cn-source']),
        revisionWitnesses: [{
          changeId: 'cn-source',
          witnessId: 'wr-source',
          kind: 'formatting',
          type: 'format',
          status: 'proposed',
          preview: 'format-only source row',
          operationFragmentIds: [],
          atomIds: ['atom-source'],
          nativeRevisionIds: [],
          provenance: { sourceCoverage: 'source-backed' },
          capability: {
            state: 'witness-only',
            nativeReviewable: false,
            approveRejectCapability: 'unavailable',
            reason: 'native-review-target-not-yet-proven',
          },
        }],
        capabilitiesByChangeId: {
          'cn-source': {
            state: 'witness-only',
            nativeReviewable: false,
            approveRejectCapability: 'unavailable',
            reason: 'native-review-target-not-yet-proven',
          },
        },
      }),
    });
  });

  it('list_changes does not serialize native-only gap rows as public changes', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'list_changes', arguments: { file: 'word://sess-t', detail: 'summary' } });
      expect(result.isError).not.toBe(true);
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
      const response = JSON.parse(text);
      expect(response.changes).toEqual([]);
    }, {
      callBackendOperation: async () => ({
        text: 'Body with no public source rows',
        format: 'L2',
        version: 'v-native-gap-filter',
        publicationState: 'ready',
        protocolSurface: { ...protocolSurface('Body with no public source rows', []), entries: [], order: [], actionabilityByChangeId: {}, certificationByChangeId: {} },
        revisionWitnesses: [{
          changeId: 'cn-gap',
          witnessId: 'wr-gap',
          kind: 'formatting',
          type: 'format',
          status: 'proposed',
          preview: 'native-only gap',
          operationFragmentIds: [],
          atomIds: [],
          nativeRevisionIds: ['native-gap'],
          provenance: { sourceCoverage: 'native-only-gap' },
          capability: {
            state: 'witness-only',
            nativeReviewable: false,
            approveRejectCapability: 'unavailable',
            reason: 'native-only-gap-proof-not-unique',
          },
        }],
      }),
    });
  });

  it('list_changes does not fall back to L2 text for a targeted native-only gap row', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'list_changes', arguments: { file: 'word://sess-t', change_id: 'cn-gap', detail: 'summary' } });
      expect(result.isError).not.toBe(true);
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
      const response = JSON.parse(text);
      expect(response.changes).toEqual([]);
    }, {
      callBackendOperation: async () => ({
        text: 'Body {++legacy gap text++}[^cn-gap]\n\n[^cn-gap]: @Reviewer | 2026-05-13 | ins | proposed',
        format: 'L2',
        version: 'v-native-gap-target-filter',
        publicationState: 'ready',
        protocolSurface: { ...protocolSurface('Body with no public source rows', []), entries: [], order: [], actionabilityByChangeId: {}, certificationByChangeId: {} },
        revisionWitnesses: [{
          changeId: 'cn-gap',
          witnessId: 'wr-gap',
          kind: 'formatting',
          type: 'format',
          status: 'proposed',
          preview: 'native-only gap',
          operationFragmentIds: [],
          atomIds: [],
          nativeRevisionIds: ['native-gap'],
          provenance: { sourceCoverage: 'native-only-gap' },
          capability: {
            state: 'witness-only',
            nativeReviewable: false,
            approveRejectCapability: 'unavailable',
            reason: 'native-only-gap-proof-not-unique',
          },
        }],
      }),
    });
  });

  it('keeps remote read structured content concise by default', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: 'word://sess-t' } });
      expect(result.isError).not.toBe(true);
      const content = result.content as Array<{ type: string; text?: string }>;
      const text = content.map((entry) => entry.text ?? '').join('\n');
      expect(text).toContain('Body {++change++}[^cn-2]');
      expect(text).not.toContain('capabilitiesByChangeId');
      expect(text).not.toContain('sourceAccounting');
      expect(text).not.toContain('source accounting');
      expect(text).not.toContain('revisionWitnesses');
      expect(text).not.toContain('operationFragments');
      expect(text).not.toContain('"text":');
      expect(text).not.toContain('unsupported-revision-shape');
      expect(result.structuredContent).toBeUndefined();
    }, {
      callBackendOperation: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            text: 'Body {++change++}[^cn-2]\n\n[^cn-2]: @Reviewer | 2026-05-08 | ins | proposed',
            format: 'L2',
            version: '7',
            publicationState: 'ready',
            protocolSurface: protocolSurface('Body {++change++}[^cn-2]\n\n[^cn-2]: @Reviewer | 2026-05-08 | ins | proposed\n'),
            actionPlanRefsByChangeId: actionPlanRefs(['cn-2']),
            readiness: { state: 'wire_ready', sourceTruth: 'body_ooxml', proposedCount: 161 },
            capabilitiesByChangeId: {
              'cn-2': { state: 'source-visible', nativeReviewable: false, approveRejectCapability: 'unknown' },
            },
            diagnostics: [{
              severity: 'warning',
              code: 'unsupported-revision-shape',
              message: 'w:rPrChange is diagnostic-only in the fast raw ChangeDown projection',
            }],
            sourceAccounting: {
              revisionGroups: { total: 161 },
            },
            revisionWitnesses: [{
              changeId: 'cn-2',
              operationFragmentIds: ['cn-2'],
            }],
            operationFragments: [{
              id: 'cn-2',
              preview: 'change',
            }],
          }),
        }],
      }),
    });
  });

  it('does not expose remote read diagnostics/capabilities through public remote debug flags', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: 'word://sess-t', debug: true } });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.structuredContent ?? {})).not.toContain('unsupported-revision-shape');
      expect(JSON.stringify(result.structuredContent ?? {})).not.toContain('capabilitiesByChangeId');
    }, {
      callBackendOperation: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            text: 'Body {++change++}[^cn-2]\n\n[^cn-2]: @Reviewer | 2026-05-08 | ins | proposed',
            format: 'L2',
            version: '7',
            publicationState: 'ready',
            protocolSurface: protocolSurface('Body {++change++}[^cn-2]\n\n[^cn-2]: @Reviewer | 2026-05-08 | ins | proposed\n'),
            actionPlanRefsByChangeId: actionPlanRefs(['cn-2']),
            readiness: { state: 'wire_ready', sourceTruth: 'body_ooxml' },
            capabilitiesByChangeId: {
              'cn-2': { state: 'source-visible', nativeReviewable: false, approveRejectCapability: 'unknown' },
            },
            diagnostics: [{
              severity: 'warning',
              code: 'unsupported-revision-shape',
              message: 'w:rPrChange is diagnostic-only in the fast raw ChangeDown projection',
            }],
          }),
        }],
      }),
    });
  });

  it('returns read snapshots as model-visible tracked text with small metadata', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: 'word://sess-t' } });
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(result.isError).not.toBe(true);
      expect(content[0]?.type).toBe('text');
      expect(content[0]?.text).toContain('LINE:abc tracked markdown');
      expect(content[0]?.text).toContain('## proposed: 0 | accepted: 0 | rejected: 0');
    }, {
      callBackendOperation: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ text: 'LINE:abc tracked markdown', format: 'L2', version: '7', publicationState: 'ready', protocolSurface: protocolSurface('LINE:abc tracked markdown', []) }) }],
      }),
    });
  });

  it('bounds remote read_tracked_file output by default and reports offset/limit continuation', async () => {
    const text = Array.from({ length: 650 }, (_, index) => `line ${index + 1}`).join('\n');
    await withClient(async (client) => {
      const result = await client.callTool({ name: 'read_tracked_file', arguments: { file: 'word://sess-t' } });
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(result.isError).not.toBe(true);
      expect(content[0]?.type).toBe('text');
      expect(content[0]?.text).toContain('--- showing lines 1-500 of');
      expect(content[0]?.text).toContain('use offset/limit to paginate');
    }, {
      callBackendOperation: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ text, format: 'L2', version: 'many-lines', publicationState: 'ready', protocolSurface: protocolSurface(text, []) }) }],
      }),
    });
  });
});


describe('remote relay backend-wire boundary', () => {


  it('review_changes refuses source-visible records without native review capability', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'review_changes',
        arguments: {
          file: 'word://sess-t',
          idempotency_key: 'review-gate-1',
          author: 'ai:codex',
          reviews: [{ change_id: 'cn-2', decision: 'approve', reason: 'test gate' }],
        },
      });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text?: string }>)[0]?.text).toContain('WordReviewCapabilityUnavailable');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read']);
    }, {
      callBackendOperation: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            text: 'Body {++change++}[^cn-2]\n\n[^cn-2]: @Reviewer | 2026-05-08 | ins | proposed\n',
            format: 'L2',
            version: 'v1',
            publicationState: 'ready',
            protocolSurface: {
              ...protocolSurface('Body {++change++}[^cn-2]\n\n[^cn-2]: @Reviewer | 2026-05-08 | ins | proposed\n'),
              actionabilityByChangeId: { 'cn-2': { state: 'blocked', reason: 'No matching Office.js tracked change yet' } },
              entries: [{
                id: 'cn-2',
                kind: 'ins',
                status: 'proposed',
                representation: 'inline-markup',
                preview: 'change',
                line: 1,
                actionability: { state: 'blocked', reason: 'No matching Office.js tracked change yet' },
                certification: { state: 'protocol-ready' },
              }],
            },
          }),
        }],
      }),
    });
  });

  it('review_changes refuses non-interactive conflict capability even if nativeReviewable is accidentally true', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'review_changes',
        arguments: {
          file: 'word://sess-t',
          idempotency_key: 'review-gate-conflict',
          author: 'ai:codex',
          reviews: [{ change_id: 'cn-9', decision: 'approve', reason: 'test gate' }],
        },
      });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text?: string }>)[0]?.text).toContain('WordReviewCapabilityUnavailable');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read']);
    }, {
      callBackendOperation: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            text: 'Body {++change++}[^cn-9]\n\n[^cn-9]: @Reviewer | 2026-05-08 | ins | proposed\n',
            format: 'L2',
            version: 'v1',
            publicationState: 'ready',
            protocolSurface: {
              ...protocolSurface('Body {++change++}[^cn-9]\n\n[^cn-9]: @Reviewer | 2026-05-08 | ins | proposed\n', ['cn-9']),
              actionabilityByChangeId: { 'cn-9': { state: 'conflict', reason: 'OOXML and native witnesses disagree' } },
              entries: [{
                id: 'cn-9',
                kind: 'ins',
                status: 'proposed',
                representation: 'inline-markup',
                preview: 'change',
                line: 1,
                actionability: { state: 'conflict', reason: 'OOXML and native witnesses disagree' },
                certification: { state: 'protocol-ready' },
              }],
            },
          }),
        }],
      }),
    });
  });



  it('resolve_thread refuses source-visible rows without native thread capability', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'resolve_thread',
        arguments: {
          file: 'word://sess-t',
          change_id: 'cn-4',
          action: 'resolve',
          author: 'ai:codex',
          idempotency_key: 'resolve-thread-unavailable',
        },
      });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text?: string }>)[0]?.text).toContain('WordThreadCapabilityUnavailable');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read']);
    }, {
      callBackendOperation: async () => ({
        text: 'Body {>>comment<<}[^cn-4]\n\n[^cn-4]: @Reviewer | 2026-05-08 | comment | proposed\n',
        format: 'L2',
        version: 'v1',
        capabilitiesByChangeId: {
          'cn-4': {
            state: 'source-visible',
            nativeReviewable: false,
            approveRejectCapability: 'unavailable',
            thread: { state: 'unavailable', operations: [], reason: 'native-comment-target-not-yet-proven' },
          },
        },
      }),
    });
  });

  it('resolve_thread fails closed without protocol thread actionability even when provider capabilities allow it', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'resolve_thread',
        arguments: {
          file: 'word://sess-t',
          change_id: 'cn-4',
          action: 'unresolve',
          author: 'ai:codex',
          idempotency_key: 'unresolve-thread-1',
        },
      });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text?: string }>)[0]?.text).toContain('WordThreadCapabilityUnavailable');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read']);
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') {
          return {
            text: 'Body {>>comment<<}[^cn-4]\n\n[^cn-4]: @Reviewer | 2026-05-08 | comment | proposed\n',
            format: 'L2',
            version: 'v1',
            capabilitiesByChangeId: {
              'cn-4': {
                state: 'source-visible',
                nativeReviewable: false,
                approveRejectCapability: 'unavailable',
                thread: { state: 'available', operations: ['reply', 'resolve', 'unresolve'] },
              },
            },
          };
        }
        return { ok: true };
      },
    });
  });

  it('remote amend_change refuses witness-only source records before backend mutation', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'amend_change',
        arguments: {
          file: 'word://sess-t',
          change_id: 'cn-witness',
          new_text: 'updated',
          author: 'ai:codex',
          idempotency_key: 'amend-witness-gate',
        },
      });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text?: string }>)[0]?.text).toContain('WordWriteCapabilityUnavailable');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read']);
    }, {
      callBackendOperation: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            text: 'Body\n',
            format: 'L2',
            version: 'v1',
            capabilitiesByChangeId: {
              'cn-witness': {
                state: 'witness-only',
                nativeReviewable: false,
                approveRejectCapability: 'unavailable',
                reason: 'unsupported OOXML revision shape',
              },
            },
          }),
        }],
      }),
    });
  });

  it('remote classic propose runs shared Word workflow and sends source transition to pane', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'propose_change',
        arguments: {
          file: 'word://sess-t',
          old_text: 'world',
          new_text: 'there',
          author: 'ai:codex',
          idempotency_key: 'idem-classic',
        },
      });

      expect(result.isError).not.toBe(true);
      expect(calls).toHaveLength(3);
      expect(calls[0]).toMatchObject({
        operation: { kind: 'read', ref: { uri: 'word://sess-t' } },
      });
      expect(calls[2]).toMatchObject({
        operation: { kind: 'read', ref: { uri: 'word://sess-t' } },
      });
      const apply = calls.find((call) => call.operation.kind === 'applyChange');
      expect(apply?.operation.kind).toBe('applyChange');
      if (!apply || apply.operation.kind !== 'applyChange') throw new Error('expected applyChange');
      expect(apply.operation.op).toMatchObject({
        kind: 'propose',
        args: {
          oldL2: 'Hello world',
        },
      });
      expect(String(apply.operation.op.args.newL2)).toContain('{~~world~>there~~}');
      expect(JSON.stringify(apply)).not.toContain('"old_text"');
      expect(JSON.stringify(apply)).not.toContain('"new_text"');
      expect(JSON.stringify(apply)).not.toContain('"at"');
      expect(JSON.stringify(apply)).not.toContain('"op":"');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true, changeId: 'cn-1' };
      },
    });
  });

  it('remote classic propose propagates pane applyChange errors instead of reporting prepared success', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'propose_change',
        arguments: {
          file: 'word://sess-t',
          old_text: 'world',
          new_text: 'there',
          author: 'ai:codex',
          idempotency_key: 'idem-pane-error',
        },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('PaneDisconnected');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read', 'applyChange']);
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { isError: true, content: [{ type: 'text', text: 'PaneDisconnected: No authorized Word pane is connected for this room.' }] };
      },
    });
  });

  it('remote supersede fails closed until Word protocol exposes a source-mutation action class', async () => {
    const source = 'Hello {++world++}[^cn-1]\n\n[^cn-1]: @ai:codex | 2026-05-07 | ins | proposed';
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'supersede_change',
        arguments: {
          file: 'word://sess-t',
          change_id: 'cn-1',
          old_text: '',
          new_text: 'there',
          insert_after: 'Hello ',
          author: 'ai:codex',
          reason: 'replace insertion',
          idempotency_key: 'idem-supersede',
        },
      });

      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text?: string }>)[0]?.text).toContain('WordWriteCapabilityUnavailable');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ operation: { kind: 'read', ref: { uri: 'word://sess-t' } } });
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') {
          return {
            ...l2ReadResult(source),
            publicationState: 'ready',
            protocolSurface: protocolSurface(`${source}\n`, ['cn-1']),
          };
        }
        return { applied: true, changeId: 'cn-2' };
      },
    });
  });

  it('remote classic propose treats idempotency replay text as non-applied metadata, not fresh success', async () => {
    await withClient(async (client, calls) => {
      const result = await client.callTool({
        name: 'propose_change',
        arguments: {
          file: 'word://sess-t',
          old_text: 'world',
          new_text: 'there',
          author: 'ai:codex',
          idempotency_key: 'idem-replay',
        },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('IdempotencyReplay');
      expect(calls.map((call) => call.operation.kind)).toEqual(['read', 'applyChange']);
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return {
          content: [{ type: 'text', text: 'IdempotencyReplay: request already completed; content was not stored by the relay.' }],
          structuredContent: { idempotency: 'replayed', status: 'completed' },
        };
      },
    });
  });

  it('remote read_tracked_file returns MCP coordinate text rather than raw DocumentSnapshot JSON', async () => {
    await withClient(async (client) => {
      const result = await client.callTool({
        name: 'read_tracked_file',
        arguments: { file: 'word://sess-t', view: 'working', include_guide: true },
      });

      expect(result.isError).not.toBe(true);
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content.map((item: unknown) => {
        if (!item || typeof item !== 'object') return '';
        const block = item as { type?: unknown; text?: unknown };
        return block.type === 'text' ? String(block.text ?? '') : '';
      }).join('\n');
      expect(text).toContain('LINE:HASH');
      expect(text).toContain('1:');
      expect(text).toContain('Hello world');
      expect(text).toContain('Word session');
      expect(text).not.toContain('"format":"L2"');
    }, {
      callBackendOperation: async (operation) => {
        if (operation.operation.kind === 'read') return l2ReadResult('Hello world');
        return { applied: true };
      },
    });
  });

  it('remote read_tracked_file accepts original view like local word reads', async () => {
    await withClient(async (client) => {
      const listed = await client.listTools();
      const read = listed.tools.find((tool) => tool.name === 'read_tracked_file');
      expect(read?.inputSchema.properties?.view).toMatchObject({
        enum: expect.arrayContaining(['original']),
      });

      const result = await client.callTool({
        name: 'read_tracked_file',
        arguments: { file: 'word://sess-t', view: 'original' },
      });
      expect(result.isError).not.toBe(true);
    }, {
      callBackendOperation: async () => l2ReadResult('Hello {++new++}[^cn-1]\n\n[^cn-1]: @ai:test | now | ins | proposed'),
    });
  });
});
