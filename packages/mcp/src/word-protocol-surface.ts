import type { DocumentSnapshot, DocumentSnapshotNotReadyBoundary, DocumentSnapshotProtocolSurface } from '@changedown/core/backend';

type WordReviewDecision = 'approve' | 'reject';

export interface ProtocolReadSource {
  source: string;
  digest: string;
  degradedReason?: string;
}

export interface ProtocolListRow {
  change_id: string;
  type: string;
  status: string;
  author: string;
  line: number;
  preview: string;
  protocol_actionability: string;
  protocol_actionability_reason?: string;
  protocol_certification: string;
  protocol_certification_reason?: string;
}


export function isFinalPublicActionability(state: string | undefined): boolean {
  return state === 'native-ready' ||
    state === 'thread-ready' ||
    state === 'blocked' ||
    state === 'diagnostic-only' ||
    state === 'conflict';
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCurrentDigest(ref: NonNullable<DocumentSnapshot['actionPlanRefsByChangeId']>[string]): boolean {
  return nonEmptyString(ref.createdFromProtocolDigest) &&
    nonEmptyString(ref.createdFromPackageDigest) &&
    nonEmptyString(ref.createdFromSourceGraphDigest) &&
    nonEmptyString(ref.currentProtocolDigest) &&
    nonEmptyString(ref.currentPackageDigest) &&
    nonEmptyString(ref.currentSourceGraphDigest) &&
    ref.createdFromProtocolDigest === ref.currentProtocolDigest &&
    ref.createdFromPackageDigest === ref.currentPackageDigest &&
    ref.createdFromSourceGraphDigest === ref.currentSourceGraphDigest;
}

export function hasCurrentCodecActionPlan(snapshot: DocumentSnapshot, changeId: string): boolean {
  const ref = snapshot.actionPlanRefsByChangeId?.[changeId];
  return !!ref && ref.publicChangeId === changeId && ref.targetKind === 'native' && ref.hasDereferenceableTarget && hasCurrentDigest(ref);
}

export function hasCurrentThreadActionPlan(snapshot: DocumentSnapshot, changeId: string): boolean {
  const ref = snapshot.actionPlanRefsByChangeId?.[changeId];
  return !!ref && ref.publicChangeId === changeId && ref.targetKind === 'thread' && ref.hasDereferenceableTarget && hasCurrentDigest(ref);
}

export function isWordPublicationNotReady(snapshot: DocumentSnapshot | undefined): boolean {
  return !!snapshot && (snapshot.publicationState !== 'ready' || !!snapshot.notReadyBoundary);
}

type NotReadyBoundaryForWire = Omit<DocumentSnapshotNotReadyBoundary, 'publicDiagnostics' | 'diagnosticPreview' | 'privateDiagnosticRefs'> & {
  publicDiagnostics: Array<{ code: string; message: string; severity?: string }>;
  diagnosticPreview?: ReturnType<typeof diagnosticPreviewWithoutRowHandles>;
};

function sanitizePublicString(value: string): string {
  return value
    .replace(/\[\^cn-[A-Za-z0-9.-]+\]/gu, '[change-handle]')
    .replace(/\bcn-[A-Za-z0-9.-]+\b/gu, '[change-handle]')
    .replace(/\bproof-fingerprint:[^\s,;\]}]+/giu, '[proof-fingerprint]')
    .replace(/\bnative(?:-[A-Za-z0-9_-]+)?:[^\s,;\]}]+/giu, '[native-evidence]')
    .replace(/\bprovider(?:-[A-Za-z0-9_-]+)?:[^\s,;\]}]+/giu, '[provider-evidence]');
}

function sanitizePublicDiagnostics(value: unknown): Array<{ code: string; message: string; severity?: string }> {
  if (!Array.isArray(value)) return [];
  const diagnostics: Array<{ code: string; message: string; severity?: string }> = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const code = typeof record.code === 'string' ? sanitizePublicString(record.code) : 'word-not-ready';
    const message = typeof record.message === 'string' ? sanitizePublicString(record.message) : code;
    diagnostics.push({
      code,
      message,
      ...(typeof record.severity === 'string' ? { severity: record.severity } : {}),
    });
  }
  return diagnostics;
}

function sanitizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') out[key] = sanitizePublicString(raw);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeNumberRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number') out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === 'string').map(sanitizePublicString);
  return out.length > 0 ? out : undefined;
}

const PRIVATE_NOT_READY_KEYS = new Set([
  'actionPlanRefsByChangeId',
  'actionPlanRefs',
  'nativeRevisionId',
  'nativeRevisionIds',
  'nativeTarget',
  'nativeTargets',
  'providerEvidenceRefs',
  'targetIds',
  'sourceRefs',
  'rawL3',
  'details',
]);

function sanitizePublicJson(value: unknown): unknown {
  if (typeof value === 'string') return sanitizePublicString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.map(sanitizePublicJson).filter((item) => item !== undefined);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (PRIVATE_NOT_READY_KEYS.has(key)) continue;
      const sanitized = sanitizePublicJson(raw);
      if (sanitized !== undefined) out[key] = sanitized;
    }
    return out;
  }
  return undefined;
}

function sanitizeUnexplainedMismatches(value: unknown): Array<Record<string, unknown>> {
  const sanitized = sanitizePublicJson(value);
  if (!Array.isArray(sanitized)) return [];
  return sanitized.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item));
}

function diagnosticPreviewWithoutRowHandles(snapshot: DocumentSnapshot): {
  counts?: Record<string, number>;
  phases?: string[];
  publicDiagnostics?: Array<{ code: string; message: string; severity?: string }>;
  operatorHint?: string;
  omittedForSafety?: string[];
} {
  const preview = snapshot.notReadyBoundary?.diagnosticPreview;
  const phases = sanitizeStringArray(preview?.phases) ?? (snapshot.notReadyBoundary?.phase ? [sanitizePublicString(snapshot.notReadyBoundary.phase)] : undefined);
  const publicDiagnostics = sanitizePublicDiagnostics(preview?.publicDiagnostics ?? snapshot.notReadyBoundary?.publicDiagnostics ?? snapshot.diagnostics);
  const counts = sanitizeNumberRecord(preview?.counts ?? snapshot.notReadyBoundary?.observedCounts);
  return {
    ...(counts ? { counts } : {}),
    ...(phases ? { phases } : {}),
    ...(publicDiagnostics.length > 0 ? { publicDiagnostics } : {}),
    ...(typeof preview?.operatorHint === 'string' ? { operatorHint: sanitizePublicString(preview.operatorHint) } : {}),
    omittedForSafety: ['snapshot.text', 'protocolSurface', 'actionPlanRefsByChangeId', 'native target identifiers', 'provider evidence identifiers'],
  };
}

function notReadyBoundaryForWire(snapshot: DocumentSnapshot): NotReadyBoundaryForWire {
  const boundary = snapshot.notReadyBoundary;
  if (!boundary) {
    return {
      boundaryId: 'protocol-projection-unavailable',
      snapshotId: snapshot.version || 'unknown',
      phase: 'protocol-projection',
      primaryReason: 'protocol_projection_unavailable',
      reasonFamilies: ['protocol_projection_unavailable'],
      rowsWithheld: true,
      collectorStates: {
        package: 'not_started',
        nativeRevisionCensus: 'not_started',
        nativeComments: 'not_started',
        bodyTopology: 'not_started',
        composition: 'not_started',
        projection: 'failed',
      },
      evidenceDigests: sanitizeStringRecord(snapshot.evidenceDigests) ?? {},
      observedCounts: {},
      unexplainedMismatches: [],
      debugEvidenceAvailable: false,
      publicDiagnostics: [],
      diagnosticPreview: diagnosticPreviewWithoutRowHandles(snapshot),
    };
  }
  const { privateDiagnosticRefs: _privateDiagnosticRefs, publicDiagnostics: _publicDiagnostics, diagnosticPreview: _diagnosticPreview, ...safeBoundary } = boundary;
  return {
    ...safeBoundary,
    evidenceDigests: sanitizeStringRecord(boundary.evidenceDigests) ?? {},
    unexplainedMismatches: sanitizeUnexplainedMismatches(boundary.unexplainedMismatches),
    publicDiagnostics: sanitizePublicDiagnostics(boundary.publicDiagnostics),
    diagnosticPreview: diagnosticPreviewWithoutRowHandles(snapshot),
    ...(typeof boundary.nextOperatorHint === 'string' ? { nextOperatorHint: sanitizePublicString(boundary.nextOperatorHint) } : {}),
    ...(boundary.deadlineInfo ? { deadlineInfo: sanitizePublicJson(boundary.deadlineInfo) as Record<string, unknown> } : {}),
  };
}

export function wordNotReadyPayload(snapshot: DocumentSnapshot, uri: string): Record<string, unknown> {
  const boundary = notReadyBoundaryForWire(snapshot);
  const noPublicChanges: unknown[] = [];
  return {
    file: uri,
    total_count: 0,
    filtered_count: 0,
    total: 0,
    changes: noPublicChanges,
    row_model: 'not_ready',
    not_ready: {
      code: 'WordProtocolNotReady',
      message: `WordProtocolNotReady: Word universe is not ready (${String(boundary.primaryReason ?? 'unknown')})`,
    },
    notReadyBoundary: boundary,
    diagnosticPreview: diagnosticPreviewWithoutRowHandles(snapshot),
    ...(snapshot.evidenceDigests ? { evidenceDigests: sanitizeStringRecord(snapshot.evidenceDigests) ?? {} } : {}),
    ...(typeof snapshot.compositionDigest === 'string' ? { compositionDigest: snapshot.compositionDigest } : {}),
    retry: { mode: 'poll-read', until: 'publicationState=ready' },
  };
}

export function assertStableWordActionability(snapshot: DocumentSnapshot): void {
  if (isWordPublicationNotReady(snapshot)) {
    throw new Error(`WordProtocolNotReady: Word universe is not ready (${snapshot.notReadyBoundary?.primaryReason ?? 'unknown'})`);
  }
  const surface = snapshot.protocolSurface;
  if (!surface) throw new Error('WordProtocolNotReady: Word snapshot did not include canonical protocol surface');
  for (const entry of surface.entries) {
    const state = entry.actionability?.state;
    if (!isFinalPublicActionability(state)) {
      throw new Error(`WordActionabilityNotReady: ${entry.id} non-final-actionability state=${state ?? 'missing'}`);
    }
    if (state === 'native-ready' && !hasCurrentCodecActionPlan(snapshot, entry.id)) {
      throw new Error(`WordActionabilityNotReady: ${entry.id} native-ready-without-current-plan`);
    }
    if (state === 'thread-ready' && !hasCurrentThreadActionPlan(snapshot, entry.id)) {
      throw new Error(`WordActionabilityNotReady: ${entry.id} thread-ready-without-current-plan`);
    }
    if ((state === 'blocked' || state === 'diagnostic-only' || state === 'conflict') && !entry.actionability.reason) {
      throw new Error(`WordActionabilityNotReady: ${entry.id} ${state}-without-product-reason`);
    }
  }
}

export function requireProtocolSurface(snapshot: DocumentSnapshot): DocumentSnapshotProtocolSurface {
  if (!snapshot.protocolSurface) {
    throw new Error('WordProtocolSurfaceMissing: Word snapshot did not include canonical protocol surface');
  }
  return snapshot.protocolSurface;
}

export function protocolSourceForRead(snapshot: DocumentSnapshot): ProtocolReadSource {
  const surface = requireProtocolSurface(snapshot);
  return { source: surface.source, digest: surface.sourceDigest };
}

export function protocolListRows(snapshot: DocumentSnapshot, args: Record<string, unknown>): ProtocolListRow[] {
  const surface = requireProtocolSurface(snapshot);
  const statusFilter = typeof args.status === 'string' ? args.status.toLowerCase() : undefined;
  const idValues = new Set<string>();
  if (typeof args.change_id === 'string') idValues.add(args.change_id);
  if (Array.isArray(args.change_ids)) {
    for (const id of args.change_ids) {
      if (typeof id === 'string') idValues.add(id);
    }
  }
  const idFilter = idValues.size > 0 ? idValues : undefined;
  return surface.entries
    .filter((entry) => !statusFilter || entry.status.toLowerCase() === statusFilter)
    .filter((entry) => !idFilter || idFilter.has(entry.id))
    .map((entry) => ({
      change_id: entry.id,
      type: entry.kind,
      status: entry.status,
      author: '@word',
      line: entry.line ?? 1,
      preview: entry.preview ?? '',
      protocol_actionability: entry.actionability.state,
      ...(entry.actionability.reason ? { protocol_actionability_reason: entry.actionability.reason } : {}),
      protocol_certification: entry.certification.state,
      ...(entry.certification.reason ? { protocol_certification_reason: entry.certification.reason } : {}),
    }));
}

export function assertProtocolReviewCapability(snapshot: DocumentSnapshot | undefined, changeId: string): void {
  if (isWordPublicationNotReady(snapshot)) {
    throw new Error('WordReviewCapabilityUnavailable: Word universe is not ready');
  }
  if (!snapshot) {
    throw new Error(`WordReviewCapabilityUnavailable: ${changeId} is not present in a Word protocol surface`);
  }
  const surface = requireProtocolSurface(snapshot);
  const listedEntry = surface.entries.find((entry) => entry.id === changeId);
  if (!listedEntry || !surface.order.includes(changeId)) {
    throw new Error(`WordReviewCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`);
  }
  const actionability = surface.actionabilityByChangeId[changeId];
  if (!actionability) {
    throw new Error(`WordReviewCapabilityUnavailable: ${changeId} is not present in the Word protocol surface`);
  }
  if (actionability.state !== 'native-ready') {
    throw new Error(
      `WordReviewCapabilityUnavailable: ${changeId} is ${actionability.state}; ${actionability.reason ?? 'no native-ready CodecActionPlan is available'}`,
    );
  }
  if (!hasCurrentCodecActionPlan(snapshot, changeId)) {
    throw new Error(`WordReviewCapabilityUnavailable: ${changeId} has native-ready label but no current dereferenceable CodecActionPlan`);
  }
}

export function assertProtocolReviewPostcondition(
  snapshot: DocumentSnapshot,
  changeId: string,
  decision: WordReviewDecision,
): void {
  const surface = requireProtocolSurface(snapshot);
  const certification = surface.certificationByChangeId[changeId];
  if (certification?.state === 'product-certified' || certification?.state === 'package-reconciled') return;
  const expectedStatus = decision === 'approve' ? 'accepted' : 'rejected';
  throw new Error(
    `ReviewPostconditionFailed: ${changeId} expected protocol certification for ${expectedStatus}, got ${certification?.state ?? 'missing'}`,
  );
}
