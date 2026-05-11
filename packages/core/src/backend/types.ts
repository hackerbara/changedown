// packages/core/src/backend/types.ts

/**
 * DocumentBackend — the port through which the CLI engine and MCP server
 * access any document, whether a local file or a remote Word session.
 *
 * Follows the hexagonal style established in packages/core/src/host/.
 * Implementations live outside core (FileBackend in cli, RemoteBackend
 * in the pane wiring).
 */

// ─── Wire-protocol constants ──────────────────────────────────────────────────

/** SSE notification method name for the host→pane agents-updated broadcast. */
export const AGENTS_UPDATED_METHOD = 'agents_updated';

// ─── URI helpers ──────────────────────────────────────────────────────────────

/** Format the human-readable name for a Word session resource descriptor. */
export function wordSessionResourceName(sessionUri: string): string {
  return `Active Word Document (${sessionUri.split('/').pop() ?? sessionUri})`;
}

export interface ParsedUri {
  /** Lowercase scheme component (e.g. "file", "word"). */
  scheme: string;
  /** Everything after the ':' separator. e.g. "///home/foo.md" */
  rest: string;
}

/**
 * Parse a URI into its scheme and rest. Throws with an "Invalid URI" message
 * for URIs with no colon separator or empty strings.
 *
 * Core stays opaque-URI per existing convention: no path normalisation, no
 * percent-decoding. Consumers interpret `rest`.
 */
export function parseUri(uri: string): ParsedUri {
  const colonIdx = uri.indexOf(':');
  if (!uri || colonIdx <= 0) {
    throw new Error(`Invalid URI: "${uri}"`);
  }
  return {
    scheme: uri.slice(0, colonIdx).toLowerCase(),
    rest: uri.slice(colonIdx + 1),
  };
}

// ─── Core types ───────────────────────────────────────────────────────────────

/** Opaque reference to a document. For files: `file://` URI. For Word: `word://sess-<uuid>`. */
export interface DocumentRef {
  uri: string;
}

/**
 * Point-in-time snapshot of a document's content.
 * `format` is "L2" (plain CriticMarkup) or "L3" (annotated with footnote metadata).
 * `version` is an opaque string — mtime for files, observer seq for Word.
 */
export interface DocumentSnapshotCapability {
  state: 'interactive' | 'source-visible' | 'witness-only' | 'diagnostic-only' | 'conflict';
  nativeReviewable: boolean;
  approveRejectCapability: 'available' | 'unavailable' | 'partial' | 'unknown';
  reason?: string;
}

export interface DocumentSnapshotReadiness {
  state: 'warming' | 'body_ready' | 'wire_ready' | 'wire_degraded' | 'failed';
  sourceTruth: 'package_ooxml' | 'body_ooxml' | 'file' | 'agent_proposal' | 'unknown';
  sourceReady: boolean;
  capabilityReady: boolean;
  proposedCount: number;
  interactiveCount: number;
  witnessOnlyCount: number;
  diagnosticCount: number;
  conflictCount: number;
}

export interface DocumentSnapshotDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  changeId?: string;
}

export interface DocumentSnapshot {
  text: string;
  format: 'L2' | 'L3';
  version: string;
  readiness?: DocumentSnapshotReadiness;
  diagnostics?: DocumentSnapshotDiagnostic[];
  capabilitiesByChangeId?: Record<string, DocumentSnapshotCapability>;
}

/** Discriminated union of the six write operations the port surfaces. */
export type ChangeOp =
  | { kind: 'propose'; args: Record<string, unknown> }
  | { kind: 'review'; args: Record<string, unknown> }
  | { kind: 'amend'; args: Record<string, unknown> }
  | { kind: 'supersede'; args: Record<string, unknown> }
  | { kind: 'resolve_thread'; args: Record<string, unknown> }
  | { kind: 'respond'; args: Record<string, unknown> };

/** Result of `applyChange`. */
export interface ChangeResult {
  applied: boolean;
  /** Change ID assigned by the operation, e.g. "cn-1". Present for propose/amend/supersede. */
  changeId?: string;
  /** Human-readable outcome text (the handler's content[0].text). */
  text?: string;
}

/** Summary of one tracked change, as returned by `listChanges`. */
export interface ChangeSummary {
  changeId: string;
  type: string;
  status: string;
  author: string;
  /** 1-indexed line number in the document where the change anchor appears. */
  line: number;
  preview: string;
}

/** Event emitted by a backend's `subscribe()` when the document changes. */
export type BackendEvent =
  | { kind: 'document_changed'; version: string }
  | { kind: 'backend_disconnected' };

/** Return type of `DocumentBackend.subscribe()` — call to stop watching. */
export type Unsubscribe = () => void;

/**
 * Describes a document exposed via MCP `resources/list`.
 * Each backend produces zero or more of these via its `list()` method.
 * `version` is optional — backends that cannot cheaply track document version
 * (e.g. RemoteBackend before pane-side version propagation is wired) may
 * omit it; agents fall back to polling `resources/read`.
 */
export interface DocumentResourceDescriptor {
  /** Fully-qualified URI, e.g. "word://sess-abc" or "file:///path/to/doc.md". */
  uri: string;
  /** Human-readable display name shown in agent resource pickers. */
  name: string;
  mimeType: 'text/markdown';
  /** Opaque version string for change detection; undefined when unavailable. */
  version?: string;
}

// ─── Port interface ───────────────────────────────────────────────────────────

/**
 * DocumentBackend port.
 *
 * Every backend implementation declares which URI schemes it handles.
 * The BackendRegistry routes by scheme prefix.
 */
export interface DocumentBackend {
  /** URI schemes this backend handles, e.g. ["file"] or ["word"]. */
  readonly schemes: readonly string[];

  /** Enumerate documents currently accessible through this backend. */
  list(): DocumentResourceDescriptor[];

  /** Read the current content of a document. */
  read(ref: DocumentRef): Promise<DocumentSnapshot>;

  /**
   * Apply a write operation to the document.
   * The `op.args` object is forwarded verbatim to the underlying handler so
   * existing handler signatures are unchanged.
   */
  applyChange(ref: DocumentRef, op: ChangeOp): Promise<ChangeResult>;

  /**
   * List tracked changes in the document.
   * `filter` is forwarded to the underlying handler (e.g. `{status: "proposed"}`).
   */
  listChanges(ref: DocumentRef, filter?: Record<string, unknown>): Promise<ChangeSummary[]>;

  /**
   * Subscribe to document change events. Returns an `Unsubscribe` function.
   * Implementations must emit `document_changed` whenever the underlying
   * document mutates through any path (local write, remote observer, etc.);
   * consumers rely on this for invalidation.
   */
  subscribe(ref: DocumentRef, listener: (event: BackendEvent) => void): Unsubscribe;
}
