import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  computeLineHash,
  ensureHashlineReady,
  buildViewDocument,
  computeOriginalText,
  applyRejectedChanges,
  computeSupersedeResult,
  countFootnoteHeadersWithStatus,
  convertL3ToL2,
  formatPlainText,
  isL3Format,
  parseForFormat,
  findFootnoteBlock,
  parseFootnoteHeader,
  type ChangeNode,
  type VirtualDocument,
} from '@changedown/core';
import { resolveView } from '@changedown/core/host';
import {
  composeGuide,
  rerecordState,
  resolveProtocolMode,
  errorResult,
  resolveAuthor,
  TYPE_MAP,
  offsetToLineNumber,
  type ChangeDownConfig,
} from '@changedown/cli/engine/browser';
import type { ChangeSummary, DocumentBackend, DocumentSnapshot, DocumentSnapshotCapability } from '@changedown/core/backend';

import { applyPreparedWordProposeChange, labPrepCategoryForPrepared, prepareWordProposeChange } from './word-propose.js';
import type { LabDiagnosticsStore } from './lab-diagnostics.js';
import { assertStableWordActionability, isWordPublicationNotReady, protocolListRows, protocolSourceForRead, wordNotReadyPayload } from './word-protocol-surface.js';

export interface WordDocumentWorkflowInput {
  backend: DocumentBackend;
  uri: string;
  args: Record<string, unknown>;
  config: ChangeDownConfig;
  state: {
    recordAfterRead(filePath: string, view: string, hashes: Array<{ line: number; raw: string; committed?: string; currentView?: string; rawLineNum?: number }>, rawContent: string): void;
  };
  labDiagnostics?: LabDiagnosticsStore;
}

type WordListChangeSummary = {
  change_id: string;
  type: string;
  status: string;
  author: string;
  line: number;
  preview: string;
  level: 0 | 1 | 2;
  anchored: boolean;
  resolved: boolean;
  consumed_by?: string;
};

type WordListChangeContext = WordListChangeSummary & {
  markup: string;
  original_text: string | null;
  modified_text: string | null;
  context_before: string[];
  context_after: string[];
};

type WordListChangeFullDetail = WordListChangeContext & {
  footnote: {
    author: string;
    date: string;
    reasoning: string | null;
    discussion_count: number;
    approvals: string[];
    rejections: string[];
    request_changes: string[];
  };
  participants: string[];
  group: {
    parent_id: string;
    description: string | null;
    siblings: string[];
  } | null;
};

const MAX_WORD_LIST_PREVIEW_LENGTH = 80;

function diagnosticErrorCode(value: unknown): string | undefined {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : undefined;
  if (!text) return undefined;
  const colonCode = text.match(/^([A-Za-z][A-Za-z0-9_]*):/)?.[1];
  return (colonCode ?? text).slice(0, 120);
}

async function mutationSourceL2(snapshot: { text: string; format?: 'L2' | 'L3' }): Promise<string> {
  return snapshot.format === 'L3' || isL3Format(snapshot.text)
    ? await convertL3ToL2(snapshot.text)
    : snapshot.text;
}

function buildWordListPreview(change: ChangeNode): string {
  let preview = '';
  switch (change.type) {
    case 'Substitution':
      preview = `${change.originalText ?? ''}~>${change.modifiedText ?? ''}`;
      break;
    case 'Insertion':
      preview = change.modifiedText ?? '';
      break;
    case 'Deletion':
      preview = change.originalText ?? '';
      break;
    default:
      preview = change.originalText ?? change.modifiedText ?? '';
      break;
  }
  if (preview.length > MAX_WORD_LIST_PREVIEW_LENGTH) {
    return preview.slice(0, MAX_WORD_LIST_PREVIEW_LENGTH - 3) + '...';
  }
  return preview;
}

function effectiveChangeStatus(change: ChangeNode): string {
  return (change.metadata?.status ?? change.inlineMetadata?.status ?? change.status).toString().toLowerCase();
}

function buildWordSummaryEntry(change: ChangeNode, text: string): WordListChangeSummary {
  return {
    change_id: change.id,
    type: TYPE_MAP[change.type],
    status: effectiveChangeStatus(change),
    author: change.metadata?.author ?? change.inlineMetadata?.author ?? '',
    line: offsetToLineNumber(text, change.range.start),
    preview: buildWordListPreview(change),
    level: change.level,
    anchored: change.anchored,
    resolved: change.resolved ?? true,
    ...(change.consumedBy ? { consumed_by: change.consumedBy } : {}),
  };
}

function buildWordContextEntry(
  change: ChangeNode,
  text: string,
  lines: string[],
  summary: WordListChangeSummary,
  contextN: number,
): WordListChangeContext {
  const startLine = offsetToLineNumber(text, change.range.start);
  const endLine = offsetToLineNumber(text, change.range.end);
  return {
    ...summary,
    markup: text.slice(change.range.start, change.range.end),
    original_text: change.type === 'Insertion' ? null : (change.originalText ?? null),
    modified_text: change.type === 'Deletion' ? null : (change.modifiedText ?? null),
    context_before: lines.slice(Math.max(0, startLine - 1 - contextN), startLine - 1),
    context_after: lines.slice(endLine, Math.min(lines.length, endLine + contextN)),
  };
}

function buildWordFullDetailEntry(
  change: ChangeNode,
  text: string,
  lines: string[],
  doc: VirtualDocument,
  summary: WordListChangeSummary,
  contextN: number,
): WordListChangeFullDetail {
  const ctx = buildWordContextEntry(change, text, lines, summary, contextN);
  const meta = change.metadata;
  const participants = new Set<string>();
  if (meta?.author) participants.add(meta.author);
  meta?.discussion?.forEach((d) => participants.add(d.author));
  meta?.approvals?.forEach((a) => participants.add(a.author));
  meta?.rejections?.forEach((a) => participants.add(a.author));
  meta?.requestChanges?.forEach((a) => participants.add(a.author));

  let group: WordListChangeFullDetail['group'] = null;
  const dotIndex = change.id.lastIndexOf('.');
  if (dotIndex > 0) {
    const parentId = change.id.slice(0, dotIndex);
    const parentBlock = findFootnoteBlock(lines, parentId);
    let description: string | null = null;
    if (parentBlock) {
      for (let i = parentBlock.headerLine + 1; i <= parentBlock.blockEnd; i++) {
        const trimmed = lines[i]?.trim() ?? '';
        if (trimmed.startsWith('reason:') || trimmed.startsWith('context:')) continue;
        if (trimmed && !trimmed.startsWith('approved:') && !trimmed.startsWith('rejected:') && !trimmed.startsWith('request-changes:')) {
          description = trimmed;
          break;
        }
      }
    }
    const siblings = doc
      .getChanges()
      .filter((c) => (c.groupId === parentId || c.id.startsWith(parentId + '.')) && c.id !== parentId)
      .map((c) => c.id);
    group = { parent_id: parentId, description, siblings };
  }

  return {
    ...ctx,
    footnote: {
      author: meta?.author ?? '',
      date: meta?.date ?? '',
      reasoning: meta?.discussion?.[0]?.text ?? null,
      discussion_count: meta?.discussion?.length ?? 0,
      approvals: (meta?.approvals ?? []).map((a) => a.author),
      rejections: (meta?.rejections ?? []).map((a) => a.author),
      request_changes: (meta?.requestChanges ?? []).map((a) => a.author),
    },
    participants: [...participants],
    group,
  };
}

function buildWordDetailForLevel(
  detail: string,
  change: ChangeNode,
  text: string,
  lines: string[],
  doc: VirtualDocument,
  summary: WordListChangeSummary,
  contextN: number,
): WordListChangeSummary | WordListChangeContext | WordListChangeFullDetail {
  switch (detail) {
    case 'context':
      return buildWordContextEntry(change, text, lines, summary, contextN);
    case 'full':
      return buildWordFullDetailEntry(change, text, lines, doc, summary, contextN);
    default:
      return summary;
  }
}


function attachCapability<T extends Record<string, unknown>>(entry: T, snapshot: DocumentSnapshot): T & Record<string, unknown> {
  const id = typeof entry.change_id === 'string' ? entry.change_id : undefined;
  const capability = id ? snapshot.capabilitiesByChangeId?.[id] : undefined;
  const diagnostics = id ? snapshotDiagnostics(snapshot, false).filter((diagnostic) => {
    return typeof diagnostic === 'object' &&
      diagnostic !== null &&
      (diagnostic as { changeId?: unknown }).changeId === id;
  }) : [];
  if (!capability && diagnostics.length === 0) return entry;
  return {
    ...entry,
    ...(capability
      ? {
          capability: publicCapability(capability),
          native_reviewable: capability.nativeReviewable,
          approve_reject_capability: capability.approveRejectCapability,
        }
      : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

function snapshotDiagnostics(snapshot: DocumentSnapshot, includeNativeDiagnostics: boolean): unknown[] {
  const diagnostics = snapshot.diagnostics ?? [];
  if (includeNativeDiagnostics) return diagnostics;
  const publicIds = new Set(Object.keys(snapshot.capabilitiesByChangeId ?? {}));
  return diagnostics
    .filter((diagnostic) => {
      if (typeof diagnostic !== 'object' || diagnostic === null) return true;
      const changeId = (diagnostic as { changeId?: unknown }).changeId;
      return typeof changeId !== 'string' || publicIds.has(changeId);
    })
    .map((diagnostic) => {
      if (typeof diagnostic !== 'object' || diagnostic === null) return diagnostic;
      const record = diagnostic as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...record };
      if (next.details && typeof next.details === 'object') delete next.details;
      return next;
    });
}

function capabilityCounts(snapshot: DocumentSnapshot): Record<string, number> | undefined {
  if (!snapshot.readiness) return undefined;
  return {
    proposed: snapshot.readiness.proposedCount,
    interactive: snapshot.readiness.interactiveCount,
    witnessOnly: snapshot.readiness.witnessOnlyCount,
    diagnostic: snapshot.readiness.diagnosticCount,
    conflict: snapshot.readiness.conflictCount,
  };
}

function wordSnapshotSourceIsWarming(snapshot: DocumentSnapshot): boolean {
  const readiness = snapshot.readiness as { state?: unknown; sourceTruth?: unknown; sourceReady?: unknown } | undefined;
  if (readiness?.state === 'warming') return true;
  if (readiness?.sourceTruth === 'unknown' && readiness?.sourceReady === false) return true;
  return (snapshot.diagnostics ?? []).some((diagnostic) => {
    if (typeof diagnostic !== 'object' || diagnostic === null) return false;
    const code = (diagnostic as { code?: unknown }).code;
    return code === 'word-source-warming';
  });
}

function assertWordSnapshotSourceReadyForPublicTool(snapshot: DocumentSnapshot, toolName: 'read_tracked_file' | 'list_changes'): void {
  if (!wordSnapshotSourceIsWarming(snapshot)) return;
  throw new Error(`WordProtocolNotReady: Word source projection is still warming; retry ${toolName} shortly.`);
}

function revisionWitnessRows(snapshot: DocumentSnapshot) {
  const primary = (snapshot.revisionWitnesses ?? []).filter(
    (witness) => witness.provenance?.sourceCoverage !== 'native-only-gap'
  );
  if (primary.length > 0) return primary;
  return (snapshot.sourceAccounting?.revisionGroups?.records ?? []).filter(
    (witness) => witness.provenance?.sourceCoverage !== 'native-only-gap'
  );
}

function suppressedNativeGapChangeIds(snapshot: DocumentSnapshot): Set<string> {
  const ids = new Set<string>();
  const collect = (witnesses: NonNullable<DocumentSnapshot['revisionWitnesses']> | undefined) => {
    for (const witness of witnesses ?? []) {
      if (witness.provenance?.sourceCoverage === 'native-only-gap') {
        const id = witness.changeId ?? witness.witnessId;
        if (id) ids.add(id);
      }
    }
  };
  collect(snapshot.revisionWitnesses);
  collect(snapshot.sourceAccounting?.revisionGroups?.records);
  return ids;
}

function operationFragmentRows(snapshot: DocumentSnapshot) {
  return snapshot.operationFragments ?? [];
}

function hasPackageSourceTruth(snapshot: DocumentSnapshot): boolean {
  return snapshot.readiness?.sourceTruth === 'package_ooxml';
}

function operationFragmentCount(snapshot: DocumentSnapshot, legacyEntriesLength: number): number {
  const fragments = operationFragmentRows(snapshot);
  if (fragments.length > 0) return fragments.length;
  return legacyEntriesLength;
}

function witnessKindCounts(snapshot: DocumentSnapshot): Record<string, number> | undefined {
  const groups = snapshot.sourceAccounting?.revisionGroups;
  if (!groups) return undefined;
  return groups.byKind;
}

function lineForWitness(args: {
  witnessId: string;
  fragmentsByParent: Map<string, Array<Record<string, unknown>>>;
}): number {
  const first = args.fragmentsByParent.get(args.witnessId)?.[0];
  return typeof first?.line === 'number' ? first.line : 1;
}

function buildWitnessEntry(args: {
  witness: NonNullable<DocumentSnapshot['revisionWitnesses']>[number];
  detail: string;
  fragmentsByParent: Map<string, Array<Record<string, unknown>>>;
  debug?: boolean;
}): Record<string, unknown> {
  const fragments = args.fragmentsByParent.get(args.witness.witnessId) ?? [];
  const changeId = args.witness.changeId ?? args.witness.witnessId;
  const base: Record<string, unknown> = {
    change_id: changeId,
    type: args.witness.type,
    kind: args.witness.kind,
    status: args.witness.status,
    author: args.witness.author ?? '',
    line: lineForWitness({
      witnessId: args.witness.witnessId,
      fragmentsByParent: args.fragmentsByParent,
    }),
    preview: args.witness.preview ?? '',
    level: 0,
    anchored: true,
    resolved: true,
    capability: publicCapability(args.witness.capability),
    native_reviewable: args.witness.capability.nativeReviewable,
    approve_reject_capability: args.witness.capability.approveRejectCapability,
    sourceCoverage: args.witness.provenance?.sourceCoverage,
  };
  if (args.debug) {
    base.source_witness_id = args.witness.witnessId;
    base.row_kind = 'revision_witness';
    base.operation_fragment_count = args.witness.operationFragmentIds?.length ?? 0;
    base.operation_fragment_ids = args.witness.operationFragmentIds ?? [];
  }
  if (args.debug && (args.detail === 'context' || args.detail === 'full')) {
    base.operation_fragments = fragments.map((fragment) => ({
      change_id: fragment.change_id,
      type: fragment.type,
      status: fragment.status,
      preview: fragment.preview,
      line: fragment.line,
    }));
  }
  if (args.debug && args.detail === 'full') {
    base.atom_ids = args.witness.atomIds ?? [];
    base.native_revision_ids = args.witness.nativeRevisionIds ?? [];
    base.provenance = args.witness.provenance ?? {};
    base.diagnostics = args.witness.diagnostics ?? [];
  }
  return base;
}

function applyWitnessPrimaryHeader(output: string, snapshot: DocumentSnapshot): string {
  const witnesses = revisionWitnessRows(snapshot);
  if (witnesses.length === 0) return output;
  const operationCount = operationFragmentRows(snapshot).length ||
    (snapshot.sourceAccounting?.records ?? []).filter((record) => record.status === 'proposed').length;
  const counts = witnessKindCounts(snapshot);
  const byKind = counts
    ? ` | ${Object.entries(counts).map(([kind, count]) => `${kind}: ${count}`).join(', ')}`
    : '';
  const header = `## revision witnesses: ${witnesses.length} | operation fragments: ${operationCount}${byKind}`;
  return output.replace(/^## proposed:.*$/m, header);
}

function assertWordMutationCapability(
  snapshot: DocumentSnapshot,
  changeId: string,
  operation: string
): string | undefined {
  if (!snapshot.protocolSurface) {
    return `WordWriteCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`;
  }
  const entry = snapshot.protocolSurface.entries.find((candidate) => candidate.id === changeId);
  if (!entry || !snapshot.protocolSurface.order.includes(changeId)) {
    return `WordWriteCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`;
  }
  return `WordWriteCapabilityUnavailable: ${changeId} cannot use ${operation} because the Word protocol surface has no public source-mutation action class; state=${entry.actionability.state}${entry.actionability.reason ? ` reason=${entry.actionability.reason}` : ''}`;
}

function capabilityExtra(
  capability: DocumentSnapshotCapability,
  key: 'review' | 'thread' | 'requestChanges',
): unknown {
  const value = (capability as unknown as Record<string, unknown>)[key];
  if (typeof value !== 'object' || value === null) return undefined;
  const { backend: _backend, ...publicValue } = value as Record<string, unknown>;
  return publicValue;
}

function publicCapability(capability: DocumentSnapshotCapability): Record<string, unknown> {
  return {
    state: capability.state,
    nativeReviewable: capability.nativeReviewable,
    approveRejectCapability: capability.approveRejectCapability,
    ...(capabilityExtra(capability, 'review') ? { review: capabilityExtra(capability, 'review') } : {}),
    ...(capabilityExtra(capability, 'thread') ? { thread: capabilityExtra(capability, 'thread') } : {}),
    ...(capabilityExtra(capability, 'requestChanges')
      ? { requestChanges: capabilityExtra(capability, 'requestChanges') }
      : {}),
    ...(capability.joinConfidence ? { joinConfidence: capability.joinConfidence } : {}),
    ...(capability.reason ? { reason: capability.reason } : {}),
  };
}

function publicCapabilitiesByChangeId(snapshot: DocumentSnapshot): Record<string, Record<string, unknown>> | undefined {
  if (!snapshot.capabilitiesByChangeId) return undefined;
  return Object.fromEntries(
    Object.entries(snapshot.capabilitiesByChangeId).map(([changeId, capability]) => [
      changeId,
      publicCapability(capability),
    ])
  );
}

function formatSourceAccountingLane(snapshot: DocumentSnapshot): string {
  const accounting = snapshot.sourceAccounting;
  if (!accounting || accounting.records.length === 0) return '';
  const protectedRecords = accounting.records.filter((record) =>
    record.capability.state !== 'interactive' || record.status !== 'proposed'
  );
  if (protectedRecords.length === 0) return '';
  const lines = [
    '',
    '--- source accounting (capability overlay; noninteractive rows are not actionable) ---',
    `total=${accounting.counts.total} interactive=${accounting.counts.interactive} source-visible=${accounting.counts.sourceVisible} witness-only=${accounting.counts.witnessOnly} diagnostic-only=${accounting.counts.diagnosticOnly} conflict=${accounting.counts.conflict}`,
    ...(accounting.revisionGroups
      ? [
          `revision-groups total=${accounting.revisionGroups.total} ${Object.entries(accounting.revisionGroups.byKind).map(([kind, count]) => `${kind}=${count}`).join(' ')}`
        ]
      : []),
  ];
  for (const record of protectedRecords.slice(0, 80)) {
    const provenance = record.provenance ?? {};
    const location = [
      typeof provenance.partName === 'string' ? provenance.partName : undefined,
      typeof provenance.path === 'string' ? provenance.path : undefined,
      provenance.xmlStart !== undefined || provenance.xmlEnd !== undefined
        ? `${String(provenance.xmlStart ?? '?')}-${String(provenance.xmlEnd ?? '?')}`
        : undefined,
    ].filter(Boolean).join('@');
    const preview = record.preview ? ` preview=${JSON.stringify(record.preview.slice(0, 80))}` : '';
    const reason = record.capability.reason ? ` reason=${JSON.stringify(record.capability.reason)}` : '';
    lines.push(
      `- ${record.sourceRecordId} kind=${record.kind} status=${record.status} capability=${record.capability.state}${location ? ` location=${location}` : ''}${preview}${reason}`
    );
  }
  if (protectedRecords.length > 80) {
    lines.push(`- … ${protectedRecords.length - 80} more source-accounting records omitted from text view; inspect structuredContent.sourceAccounting for full data`);
  }
  return lines.join('\n');
}

async function buildWordListChangesResponse(
  backend: DocumentBackend,
  uri: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const snapshot = await backend.read({ uri });
  if (isWordPublicationNotReady(snapshot)) return wordNotReadyPayload(snapshot, uri);
  assertWordSnapshotSourceReadyForPublicTool(snapshot, 'list_changes');
  const protocolSurface = snapshot.protocolSurface;
  if (protocolSurface) {
    const protocolIds = new Set(protocolSurface.entries.map((entry) => entry.id));
    const protocolDiagnostics = (snapshot.diagnostics ?? [])
      .filter((diagnostic) => {
        if (typeof diagnostic !== 'object' || diagnostic === null) return true;
        return typeof diagnostic.changeId !== 'string' || protocolIds.has(diagnostic.changeId);
      })
      .map((diagnostic) => {
        if (typeof diagnostic !== 'object' || diagnostic === null) return diagnostic;
        const record = diagnostic as unknown as Record<string, unknown>;
        const next: Record<string, unknown> = { ...record };
        delete next.details;
        return next;
      });
    const privateDiagnostics = await privateNativeEvidenceDiagnostics(backend, uri, args);
    try {
      assertStableWordActionability(snapshot);
    } catch (error) {
      if (!wantsNativeDiagnostics(args)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const noPublicChanges: unknown[] = [];
      return {
        file: uri,
        total_count: protocolSurface.entries.length,
        filtered_count: 0,
        total: 0,
        changes: noPublicChanges,
        row_model: 'protocol_surface',
        protocol_source_digest: protocolSurface.sourceDigest,
        source: 'protocol-surface',
        ...(snapshot.readiness ? { readiness: snapshot.readiness } : {}),
        ...(capabilityCounts(snapshot) ? { capability_counts: capabilityCounts(snapshot) } : {}),
        diagnostics: protocolDiagnostics,
        not_ready: {
          code: message.startsWith('WordActionabilityNotReady')
            ? 'WordActionabilityNotReady'
            : 'WordProtocolNotReady',
          message,
        },
        ...privateDiagnostics,
      };
    }
    const protocolRows = protocolListRows(snapshot, args);
    return {
      file: uri,
      total_count: protocolSurface.entries.length,
      filtered_count: protocolRows.length,
      total: protocolRows.length,
      changes: protocolRows,
      row_model: 'protocol_surface',
      protocol_source_digest: protocolSurface.sourceDigest,
      source: 'protocol-surface',
      ...(snapshot.readiness ? { readiness: snapshot.readiness } : {}),
      ...(capabilityCounts(snapshot) ? { capability_counts: capabilityCounts(snapshot) } : {}),
      diagnostics: protocolDiagnostics,
      ...privateDiagnostics,
    };
  }
  throw new Error('WordProtocolNotReady: Word snapshot did not include canonical protocol surface');
}

function wantsNativeDiagnostics(args: Record<string, unknown>): boolean {
  return args.debug === true || args.diagnostics === true || args.native === true;
}

function normalizeBackendChangeSummary(entry: ChangeSummary): Record<string, unknown> {
  const record = entry as unknown as Record<string, unknown>;
  const changeId = typeof record.changeId === 'string'
    ? record.changeId
    : typeof record.change_id === 'string'
      ? record.change_id
      : '';
  const normalized: Record<string, unknown> = { ...record, change_id: changeId };
  delete normalized.changeId;
  return normalized;
}

async function privateNativeEvidenceDiagnostics(
  backend: DocumentBackend,
  uri: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!wantsNativeDiagnostics(args)) return {};
  let entries: ChangeSummary[];
  try {
    entries = await backend.listChanges({ uri }, { ...args, debugNative: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const boundary = {
      change_id: '__word_private_evidence_not_ready__',
      type: 'PrivateEvidenceBoundary',
      status: 'NotReady',
      author: '',
      line: 0,
      preview: 'native evidence diagnostics failed',
      debugKind: 'private-evidence-not-ready',
      nativeMapReadiness: 'error',
      reason: 'native-evidence-read-failed',
      error: message,
    };
    return {
      private_evidence: {
        ready: false,
        status: 'error',
        sidecar_count: 0,
        boundary,
      },
      native_diagnostics: [boundary],
    };
  }
  const diagnostics = entries
    .map(normalizeBackendChangeSummary)
    .filter((entry) => {
      const changeId = String(entry.change_id ?? '');
      return changeId.startsWith('__') || typeof entry.debugKind === 'string';
    });
  const reviewMap = diagnostics.find((entry) => entry.debugKind === 'word-review-map');
  const boundary = diagnostics.find((entry) => entry.debugKind === 'private-evidence-not-ready');
  const sidecars = diagnostics.filter((entry) => entry.debugKind === 'word-map-tracked-change');
  const status = reviewMap?.nativeMapReadiness ?? boundary?.nativeMapReadiness ?? 'unknown';
  return {
    private_evidence: {
      ready: status === 'ready' && boundary === undefined,
      status,
      sidecar_count: sidecars.length,
      ...(boundary ? { boundary } : {}),
    },
    native_diagnostics: diagnostics,
  };
}

export async function handleWordReadTrackedFile(input: WordDocumentWorkflowInput): Promise<CallToolResult> {
  const { backend, uri, args, config, state } = input;
  try {
    await ensureHashlineReady();
    const snapshot = await backend.read({ uri });
    if (isWordPublicationNotReady(snapshot)) {
      return errorResult(JSON.stringify(wordNotReadyPayload(snapshot, uri), null, 2)) as CallToolResult;
    }
    assertWordSnapshotSourceReadyForPublicTool(snapshot, 'read_tracked_file');

    const DEFAULT_LIMIT = 500;
    const MAX_LIMIT = 2000;
    const requestedView = typeof args.view === 'string' ? args.view : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : 1;
    const requestedLimit = typeof args.limit === 'number' ? args.limit : undefined;
    const includeNativeDiagnostics = args.debug === true || args.diagnostics === true || args.native === true;

    const resolvedView = requestedView !== undefined ? resolveView(requestedView) : null;
    if (requestedView !== undefined && resolvedView === null) {
      return errorResult(
        `Unknown view '${requestedView}'. Valid views: working, simple, decided, original, raw`,
      ) as CallToolResult;
    }

    const defaultView = resolveView(config.policy.default_view ?? 'working') ?? 'working';
    const viewPolicy = config.policy.view_policy ?? 'suggest';
    const canonicalView = requestedView === undefined
      ? defaultView
      : resolvedView!;

    if (viewPolicy === 'require' && canonicalView !== defaultView) {
      return errorResult(
        `This project requires view "${config.policy.default_view}" (view_policy = "require"). ` +
        `Requested view "${requestedView}" is not allowed.`,
      ) as CallToolResult;
    }

    const protocolMode = resolveProtocolMode(config.protocol.mode);

    if (!snapshot.protocolSurface) {
      throw new Error('WordProtocolNotReady: Word snapshot did not include canonical protocol surface');
    }
    const protocolRead = protocolSourceForRead(snapshot);
    const viewSourceText = canonicalView === 'original' ? computeOriginalText(protocolRead.source) : protocolRead.source;
    const buildableView = canonicalView === 'original' ? 'working' : canonicalView;
    const doc = buildViewDocument(viewSourceText, buildableView, {
      filePath: uri,
      trackingStatus: 'tracked',
      protocolMode,
      defaultView,
      viewPolicy,
    });

    let sessionHashes = doc.lines.map((l) => ({
      line: l.margin.lineNumber,
      raw: l.sessionHashes.raw,
      committed: l.sessionHashes.committed,
      currentView: l.sessionHashes.currentView,
      rawLineNum: l.rawLineNumber,
    }));
    let syntheticBlankAnchor: string | null = null;
    if (doc.lines.length === 0 && (canonicalView === 'working' || canonicalView === 'simple')) {
      const rawLines = viewSourceText.split('\n');
      const rawLineIndex = rawLines.findIndex((line) => line.trim() === '');
      const rawLineNum = rawLineIndex >= 0 ? rawLineIndex + 1 : 1;
      const rawLine = rawLines[rawLineNum - 1] ?? '';
      const hash = computeLineHash(rawLineNum - 1, rawLine, rawLines);
      syntheticBlankAnchor = ` 1:${hash}  | `;
      sessionHashes = [{
        line: 1,
        raw: hash,
        committed: hash,
        currentView: hash,
        rawLineNum,
      }];
    }
    state.recordAfterRead(uri, canonicalView, sessionHashes, viewSourceText);

    const totalLines = doc.lines.length;
    const effectiveStart = Math.max(1, offset);
    const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const effectiveEnd = Math.min(effectiveStart + limit - 1, totalLines);

    let adjustedEnd = effectiveEnd;
    while (adjustedEnd < doc.lines.length && doc.lines[adjustedEnd]?.continuesChange) {
      adjustedEnd++;
    }

    const paginatedDoc = {
      ...doc,
      lines: doc.lines.slice(effectiveStart - 1, adjustedEnd),
      header: {
        ...doc.header,
        lineRange: { start: effectiveStart, end: adjustedEnd, total: totalLines },
      },
    };

    let output = formatPlainText(paginatedDoc);
    if (includeNativeDiagnostics) output = applyWitnessPrimaryHeader(output, snapshot);
    if (syntheticBlankAnchor !== null) {
      output = output.endsWith('---')
        ? `${output}\n${syntheticBlankAnchor}`
        : `${output}\n${syntheticBlankAnchor}`;
    }

    if (adjustedEnd < totalLines) {
      output += `\n\n--- showing lines ${effectiveStart}-${adjustedEnd} of ${totalLines} | use offset/limit to paginate ---`;
    }
    if (includeNativeDiagnostics) output += formatSourceAccountingLane(snapshot);

    const guide = args.include_guide === true ? `\n\n${composeGuide(config, { targetKind: 'word' })}` : '';
    const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: output }];
    if (guide) content.unshift({ type: 'text', text: guide });
    const structuredContent: Record<string, unknown> = {};
    if (includeNativeDiagnostics) {
      if (snapshot.readiness) structuredContent.readiness = snapshot.readiness;
      const diagnostics = snapshotDiagnostics(snapshot, true);
      if (diagnostics.length > 0) structuredContent.diagnostics = diagnostics;
      const publicCapabilities = publicCapabilitiesByChangeId(snapshot);
      if (publicCapabilities) {
        structuredContent.capabilitiesByChangeId = publicCapabilities;
      }
      if (snapshot.sourceAccounting) {
        structuredContent.sourceAccounting = snapshot.sourceAccounting;
        structuredContent.source_accounting = snapshot.sourceAccounting;
      }
    }
    return {
      content,
      ...(Object.keys(structuredContent).length > 0 ? { structuredContent } : {}),
    } as CallToolResult;
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
  }
}

export async function handleWordListChanges(input: WordDocumentWorkflowInput): Promise<CallToolResult> {
  const { backend, uri, args } = input;
  try {
    await ensureHashlineReady();
    const response = await buildWordListChangesResponse(backend, uri, args);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(response) }],
      ...(response.row_model === 'not_ready' ? { isError: true as const } : {}),
    } as CallToolResult;
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
  }
}

export async function handleWordSupersedeChange(input: WordDocumentWorkflowInput): Promise<CallToolResult> {
  const { backend, uri, args, config, state } = input;
  try {
    await ensureHashlineReady();
    const changeId = typeof args.change_id === 'string' ? args.change_id : typeof args.changeId === 'string' ? args.changeId : undefined;
    const oldText = typeof args.old_text === 'string' ? args.old_text : typeof args.oldText === 'string' ? args.oldText : undefined;
    const newText = typeof args.new_text === 'string' ? args.new_text : typeof args.newText === 'string' ? args.newText : undefined;
    const insertAfter = typeof args.insert_after === 'string' ? args.insert_after : typeof args.insertAfter === 'string' ? args.insertAfter : undefined;
    const reason = typeof args.reason === 'string' ? args.reason : undefined;

    if (!changeId) return errorResult('Missing required argument: "change_id"') as CallToolResult;
    if (oldText === undefined) return errorResult('Missing required argument: "old_text"') as CallToolResult;
    if (newText === undefined) return errorResult('Missing required argument: "new_text"') as CallToolResult;
    if (oldText === '' && newText === '') return errorResult('Both old_text and new_text are empty — nothing to change.') as CallToolResult;

    const { author, error: authorError } = resolveAuthor(args.author as string | undefined, config, 'supersede_change');
    if (authorError) return errorResult(authorError.message) as CallToolResult;

    const snapshot = await backend.read({ uri });
    const capabilityError = assertWordMutationCapability(
      snapshot,
      changeId,
      'supersede_change'
    );
    if (capabilityError) return errorResult(capabilityError) as CallToolResult;

    const oldL2 = await mutationSourceL2(snapshot);
    const result = await computeSupersedeResult(oldL2, changeId, {
      oldText,
      newText,
      insertAfter,
      reason,
      author,
    });
    if (result.isError) return errorResult(result.error) as CallToolResult;

    let newL2 = result.text;
    if (config.settlement.auto_on_reject) {
      const settled = applyRejectedChanges(newL2);
      newL2 = settled.currentContent;
    }

    const applied = await backend.applyChange({ uri }, {
      kind: 'propose',
      args: { oldL2, newL2 },
    });
    if (applied.applied === false) {
      return errorResult(applied.text ?? 'Word adapter did not apply prepared supersede') as CallToolResult;
    }

    await rerecordState(state as never, uri, newL2, config);

    const footnoteCount = (newL2.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
    const responseData = {
      old_change_id: changeId,
      new_change_id: result.newChangeId,
      file: uri,
      type: oldText === '' ? 'ins' : newText === '' ? 'del' : 'sub',
      supersedes: changeId,
      document_state: {
        total_changes: footnoteCount,
        proposed: countFootnoteHeadersWithStatus(newL2, 'proposed'),
        accepted: countFootnoteHeadersWithStatus(newL2, 'accepted'),
        rejected: countFootnoteHeadersWithStatus(newL2, 'rejected'),
      },
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(responseData) }] } as CallToolResult;
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
  }
}

export async function handleWordProposeChange(input: WordDocumentWorkflowInput): Promise<CallToolResult> {
  const { backend, uri, args, config, state } = input;
  try {
    await ensureHashlineReady();
    if (Object.prototype.hasOwnProperty.call(args, 'word_spike_direct') || Object.prototype.hasOwnProperty.call(args, 'word_author_spike') || Object.prototype.hasOwnProperty.call(args, 'spike')) {
      return errorResult('word_spike_direct/word_author_spike/spike are diagnostic-only and are not supported by public word:// propose_change') as CallToolResult;
    }

    const snapshot = await backend.read({ uri });
    const envelope = input.labDiagnostics?.createApplyEnvelope({ sessionUri: uri });
    const prepared = await prepareWordProposeChange({
      args,
      uri,
      snapshotText: snapshot.text,
      snapshotFormat: snapshot.format,
      config,
      state,
    });
    const mcpPrep: Record<string, unknown> = {
      categoryCode: labPrepCategoryForPrepared(prepared),
      ok: prepared.ok,
    };
    if ('family' in prepared && prepared.family) {
      mcpPrep.family = prepared.family;
    }
    if (envelope) {
      input.labDiagnostics?.updateApplyEnvelope(envelope.applyDiagnosticId, {
        status: prepared.ok ? 'pane-dispatch-pending' : 'mcp-prep-failed',
        mcpPrep,
      });
    }
    if (!prepared.ok) return prepared.toolResult as CallToolResult;

    let result;
    try {
      result = await applyPreparedWordProposeChange(backend, uri, prepared, {
        applyDiagnosticId: envelope?.applyDiagnosticId,
      });
      if (envelope) {
        input.labDiagnostics?.updateApplyEnvelope(envelope.applyDiagnosticId, {
          status: result.applied === false ? 'pane-dispatch-not-applied' : 'pane-dispatch-applied',
          endedAt: new Date().toISOString(),
          paneDispatch: {
            applied: result.applied !== false,
            ...(result.applied === false ? { errorCode: diagnosticErrorCode(result.text) } : {}),
          },
        });
      }
    } catch (err) {
      if (envelope) {
        input.labDiagnostics?.updateApplyEnvelope(envelope.applyDiagnosticId, {
          status: 'pane-dispatch-thrown',
          endedAt: new Date().toISOString(),
          paneDispatch: {
            applied: false,
            errorCode: diagnosticErrorCode(err) ?? 'UNKNOWN_ERROR',
          },
        });
      }
      throw err;
    }
    if (result.applied === false) {
      return errorResult(result.text ?? 'Word adapter did not apply prepared proposal') as CallToolResult;
    }

    try {
      const after = await backend.read({ uri });
      await rerecordState(state as never, uri, after.text, config);
    } catch {
      await rerecordState(state as never, uri, prepared.newL2, config);
    }

    return prepared.toolResult as CallToolResult;
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
  }
}
