// changedown-plugin/mcp-server/src/remote-backend.ts
import type {
  DocumentBackend,
  DocumentRef,
  DocumentSnapshot,
  DocumentResourceDescriptor,
  ChangeOp,
  ChangeResult,
  ChangeSummary,
  BackendEvent,
  Unsubscribe,
} from '@changedown/core/backend';
import { wordSessionResourceName } from '@changedown/core/backend';
import type { PaneEndpointHandle } from './transport/pane-endpoint.js';

/**
 * RemoteBackend — delegates DocumentBackend calls to a pane-registered session
 * via PaneEndpointHandle.sendRequest(). One instance per pane registration.
 *
 * Method names ("read", "applyChange", "listChanges", "subscribe") must match
 * the `onRpc` switch in
 * packages/word-add-in/src/taskpane/taskpane.ts.
 *
 * sessionUri is exposed as a public readonly field so consumers iterating the
 * registry (e.g. Tranche 6's resources/list) can enumerate sessions by URI
 * without an extra round-trip.
 *
 * For v1 the registry is scheme-keyed ("word"), so only one RemoteBackend is
 * registered at a time — the most-recent pane wins. Multi-pane fan-out is
 * Tranche 6 scope.
 */
export class RemoteBackend implements DocumentBackend {
  readonly schemes = ['word'] as const;
  /** Session URI, e.g. "word://sess-<uuid>". Exposed for Tranche 6's list() impl. */
  readonly sessionUri: string;

  constructor(
    private readonly paneHandle: PaneEndpointHandle,
    private readonly registrationId: string,
    sessionUri: string,
  ) {
    this.sessionUri = sessionUri;
  }

  list(): DocumentResourceDescriptor[] {
    return [{
      uri: this.sessionUri,
      name: wordSessionResourceName(this.sessionUri),
      mimeType: 'text/markdown' as const,
      // Version tracking deferred — no _lastKnownVersion field; agents poll read().
      version: undefined,
    }];
  }

  async read(_ref: DocumentRef): Promise<DocumentSnapshot> {
    return this.paneHandle.sendRequest(
      this.registrationId, 'read', {}
    ) as Promise<DocumentSnapshot>;
  }

  async listChanges(_ref: DocumentRef, _filter?: Record<string, unknown>): Promise<ChangeSummary[]> {
    return this.paneHandle.sendRequest(
      this.registrationId, 'listChanges', _filter ?? {}
    ) as Promise<ChangeSummary[]>;
  }

  async applyChange(_ref: DocumentRef, op: ChangeOp): Promise<ChangeResult> {
    return this.paneHandle.sendRequest(
      this.registrationId, 'applyChange', { op }
    ) as Promise<ChangeResult>;
  }

  /**
   * Send the subscribe RPC so the pane knows it's being observed, then wire
   * the actual notification delivery via onPaneNotification. The pane POSTs
   * to /backend/notify/:registrationId on each Observer delta; those events
   * arrive here and are forwarded to the listener, which feeds fanOut().
   */
  subscribe(_ref: DocumentRef, listener: (event: BackendEvent) => void): Unsubscribe {
    this.paneHandle.sendRequest(this.registrationId, 'subscribe', {})
      .catch(err => console.warn('[RemoteBackend] subscribe ack failed:', err));
    const disposable = this.paneHandle.onPaneNotification(this.registrationId, (event) => {
      listener(event);
    });
    return () => disposable.dispose();
  }
}
