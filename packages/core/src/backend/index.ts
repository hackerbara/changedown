// packages/core/src/backend/index.ts
export {
  AGENTS_UPDATED_METHOD,
  parseUri,
  wordSessionResourceName,
  type ParsedUri,
  type DocumentRef,
  type DocumentSnapshotCapability,
  type DocumentSnapshotDiagnostic,
  type DocumentSnapshotReadiness,
  type DocumentSnapshotSourceAccounting,
  type DocumentSnapshotSourceAccountingRecord,
  type DocumentSnapshotOperationFragment,
  type DocumentSnapshotRevisionWitness,
  type DocumentSnapshot,
  type DocumentSnapshotCollectorState,
  type DocumentSnapshotDiagnosticPreview,
  type DocumentSnapshotExplainedMismatch,
  type DocumentSnapshotNotReadyBoundary,
  type DocumentSnapshotNotReadyReasonFamily,
  type DocumentSnapshotPublicationState,
  type DocumentSnapshotPublicDiagnostic,
  type ChangeOp,
  type ChangeResult,
  type ChangeSummary,
  type BackendEvent,
  type Unsubscribe,
  type DocumentBackend,
  type DocumentResourceDescriptor,
} from './types.js';
export { BackendRegistry, type BackendEntry } from './registry.js';
export {
  CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
  backendWireOperationClass,
  assertPaneBackendWireRequestHasNoTransportSecrets,
  type PaneBackendWireOperation,
  type PaneBackendWireRequest,
  type BackendWireOperationClass,
} from './backend-wire.js';


export type {
  DocumentSnapshotProtocolActionability,
  DocumentSnapshotProtocolActionabilityState,
  DocumentSnapshotProtocolCertification,
  DocumentSnapshotProtocolCertificationState,
  DocumentSnapshotProtocolEntry,
  DocumentSnapshotProtocolSurface,
} from './protocol-surface.js';
export { parseDocumentSnapshotProtocolSurface } from './protocol-surface.js';
