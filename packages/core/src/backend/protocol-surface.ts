export type DocumentSnapshotProtocolActionabilityState =
  | 'protocol-ready'
  | 'action-plan-ready'
  | 'native-ready'
  | 'thread-ready'
  | 'blocked'
  | 'diagnostic-only'
  | 'conflict';

export type DocumentSnapshotProtocolCertificationState =
  | 'projected'
  | 'protocol-ready'
  | 'action-plan-ready'
  | 'native-ready'
  | 'submitted'
  | 'observed'
  | 'package-reconciled'
  | 'product-certified'
  | 'conflict';

export interface DocumentSnapshotProtocolActionability {
  state: DocumentSnapshotProtocolActionabilityState;
  reason?: string;
}

export interface DocumentSnapshotProtocolCertification {
  state: DocumentSnapshotProtocolCertificationState;
  reason?: string;
}

export interface DocumentSnapshotProtocolEntry {
  id: string;
  kind: string;
  status: string;
  representation: string;
  preview?: string;
  line?: number;
  parentId?: string;
  children?: readonly string[];
  actionability: DocumentSnapshotProtocolActionability;
  certification: DocumentSnapshotProtocolCertification;
}

export interface DocumentSnapshotProtocolSurface {
  protocolVersion: 'changedown-protocol-v1';
  sourceDigest: string;
  source: string;
  entries: readonly DocumentSnapshotProtocolEntry[];
  order: readonly string[];
  actionabilityByChangeId: Readonly<Record<string, DocumentSnapshotProtocolActionability>>;
  certificationByChangeId: Readonly<Record<string, DocumentSnapshotProtocolCertification>>;
}

const ACTIONABILITY_STATES: readonly DocumentSnapshotProtocolActionabilityState[] = [
  'protocol-ready',
  'action-plan-ready',
  'native-ready',
  'thread-ready',
  'blocked',
  'diagnostic-only',
  'conflict',
];

const CERTIFICATION_STATES: readonly DocumentSnapshotProtocolCertificationState[] = [
  'projected',
  'protocol-ready',
  'action-plan-ready',
  'native-ready',
  'submitted',
  'observed',
  'package-reconciled',
  'product-certified',
  'conflict',
];

export function parseDocumentSnapshotProtocolSurface(value: unknown): DocumentSnapshotProtocolSurface | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const surface = value as Partial<DocumentSnapshotProtocolSurface>;
  if (surface.protocolVersion !== 'changedown-protocol-v1') return undefined;
  if (typeof surface.sourceDigest !== 'string' || typeof surface.source !== 'string') return undefined;
  if (!Array.isArray(surface.entries) || !Array.isArray(surface.order)) return undefined;
  if (!surface.actionabilityByChangeId || typeof surface.actionabilityByChangeId !== 'object') return undefined;
  if (!surface.certificationByChangeId || typeof surface.certificationByChangeId !== 'object') return undefined;

  const entries = surface.entries
    .map((entry) => sanitizeEntry(entry))
    .filter((entry): entry is DocumentSnapshotProtocolEntry => entry !== undefined);
  if (entries.length !== surface.entries.length) return undefined;

  const order = surface.order.filter((id): id is string => typeof id === 'string');
  if (order.length !== surface.order.length) return undefined;

  const actionabilityByChangeId = sanitizeSummaryRecord(
    surface.actionabilityByChangeId,
    sanitizeActionability,
  );
  const certificationByChangeId = sanitizeSummaryRecord(
    surface.certificationByChangeId,
    sanitizeCertification,
  );
  if (!actionabilityByChangeId || !certificationByChangeId) return undefined;

  return {
    protocolVersion: 'changedown-protocol-v1',
    sourceDigest: surface.sourceDigest,
    source: surface.source,
    entries,
    order,
    actionabilityByChangeId,
    certificationByChangeId,
  };
}

function sanitizeEntry(value: unknown): DocumentSnapshotProtocolEntry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Partial<DocumentSnapshotProtocolEntry>;
  if (
    typeof entry.id !== 'string'
    || typeof entry.kind !== 'string'
    || typeof entry.status !== 'string'
    || typeof entry.representation !== 'string'
  ) {
    return undefined;
  }
  const actionability = sanitizeActionability(entry.actionability);
  const certification = sanitizeCertification(entry.certification);
  if (!actionability || !certification) return undefined;
  return {
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    representation: entry.representation,
    ...(typeof entry.preview === 'string' ? { preview: entry.preview } : {}),
    ...(typeof entry.line === 'number' ? { line: entry.line } : {}),
    ...(typeof entry.parentId === 'string' ? { parentId: entry.parentId } : {}),
    ...(Array.isArray(entry.children) && entry.children.every((child) => typeof child === 'string') ? { children: entry.children.slice() } : {}),
    actionability,
    certification,
  };
}

function sanitizeActionability(value: unknown): DocumentSnapshotProtocolActionability | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const summary = value as Partial<DocumentSnapshotProtocolActionability>;
  if (!ACTIONABILITY_STATES.includes(summary.state as DocumentSnapshotProtocolActionabilityState)) return undefined;
  return {
    state: summary.state as DocumentSnapshotProtocolActionabilityState,
    ...(typeof summary.reason === 'string' ? { reason: summary.reason } : {}),
  };
}

function sanitizeCertification(value: unknown): DocumentSnapshotProtocolCertification | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const summary = value as Partial<DocumentSnapshotProtocolCertification>;
  if (!CERTIFICATION_STATES.includes(summary.state as DocumentSnapshotProtocolCertificationState)) return undefined;
  return {
    state: summary.state as DocumentSnapshotProtocolCertificationState,
    ...(typeof summary.reason === 'string' ? { reason: summary.reason } : {}),
  };
}

function sanitizeSummaryRecord<T>(
  value: object,
  sanitize: (value: unknown) => T | undefined,
): Readonly<Record<string, T>> | undefined {
  const result: Record<string, T> = {};
  for (const [key, summary] of Object.entries(value)) {
    const sanitized = sanitize(summary);
    if (!sanitized) return undefined;
    result[key] = sanitized;
  }
  return result;
}
