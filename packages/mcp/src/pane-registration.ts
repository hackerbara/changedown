// changedown-plugin/mcp-server/src/pane-registration.ts
import {
  wordSessionResourceName,
  type BackendEvent,
  type BackendRegistry,
  type ChangeOp,
  type ChangeResult,
  type ChangeSummary,
  type DocumentBackend,
  type DocumentRef,
  type DocumentResourceDescriptor,
  type DocumentSnapshot,
  type Unsubscribe,
} from '@changedown/core/backend';
import type {
  PaneEndpointHandle,
  PaneEndpointOptions,
} from './transport/pane-endpoint.js';

interface WordPaneSession {
  registrationId: string;
  sessionUri: string;
  version?: string;
}

class WordPaneMuxBackend implements DocumentBackend {
  readonly schemes = ['word'] as const;
  private readonly sessions = new Map<string, WordPaneSession>();

  constructor(private readonly getPaneHandle: () => PaneEndpointHandle) {}

  addSession(session: WordPaneSession): void {
    this.sessions.set(session.sessionUri, session);
  }

  removeRegistration(registrationId: string): boolean {
    for (const [sessionUri, session] of this.sessions) {
      if (session.registrationId !== registrationId) continue;
      this.sessions.delete(sessionUri);
      return true;
    }
    return false;
  }

  isEmpty(): boolean {
    return this.sessions.size === 0;
  }

  list(): DocumentResourceDescriptor[] {
    return Array.from(this.sessions.values()).map((session) => ({
      uri: session.sessionUri,
      name: wordSessionResourceName(session.sessionUri),
      mimeType: 'text/markdown' as const,
      version: session.version,
    }));
  }

  async read(ref: DocumentRef): Promise<DocumentSnapshot> {
    const session = this.resolve(ref);
    const snapshot = await this.getPaneHandle().sendRequest(
      session.registrationId, 'read', {},
    ) as DocumentSnapshot;
    session.version = snapshot.version;
    return snapshot;
  }

  async listChanges(ref: DocumentRef, _filter?: Record<string, unknown>): Promise<ChangeSummary[]> {
    return this.getPaneHandle().sendRequest(
      this.resolve(ref).registrationId, 'listChanges', _filter ?? {},
    ) as Promise<ChangeSummary[]>;
  }

  async applyChange(ref: DocumentRef, op: ChangeOp): Promise<ChangeResult> {
    return this.getPaneHandle().sendRequest(
      this.resolve(ref).registrationId, 'applyChange', { op },
    ) as Promise<ChangeResult>;
  }

  subscribe(ref: DocumentRef, listener: (event: BackendEvent) => void): Unsubscribe {
    const session = this.resolve(ref);
    this.getPaneHandle().sendRequest(session.registrationId, 'subscribe', {})
      .catch(err => console.warn('[WordPaneMuxBackend] subscribe ack failed:', err));
    const disposable = this.getPaneHandle().onPaneNotification(session.registrationId, (event) => {
      if (event.kind === 'document_changed') session.version = event.version;
      listener(event);
    });
    return () => disposable.dispose();
  }

  private resolve(ref: DocumentRef): WordPaneSession {
    const session = this.sessions.get(ref.uri);
    if (!session) {
      const known = Array.from(this.sessions.keys()).join(', ') || '(none)';
      throw new Error(`WordSessionNotFoundError: no active pane for ${ref.uri}; known sessions: ${known}`);
    }
    return session;
  }
}

/**
 * Build the onRegister/onUnregister callbacks that wire pane registrations
 * into a BackendRegistry as RemoteBackend entries.
 *
 * Why a factory: both production (mcp-server/index.ts) and the
 * pane-registration-wiring tests need the same wiring logic. Duplicating it
 * would let the tests pass while production drifts — which is exactly how
 * two real bugs slipped past Tranche 3.5's reviews and only surfaced in the
 * Tranche 5 end-to-end smoke.
 *
 * The bugs this version fixes:
 *
 *   1. Stale-unregister race. The previous code called
 *      `registry.unregister('word')` on every onUnregister, keyed by scheme.
 *      If pane A registered without ever opening its SSE stream, then pane B
 *      registered and *did* open SSE, then pane A's no-stream TTL fired —
 *      pane A's onUnregister would wipe pane B's backend even though B was
 *      the active one. We now track which registrationId is current and
 *      ignore unregisters that don't match.
 *
 *   2. sessionUri double-prefix. The previous code unconditionally built
 *      `${info.scheme}://${info.sessionId}`. The integration test sent
 *      `sessionId: 'sess-test-1'` (bare) so it passed; the real pane sends
 *      `word://sess-<uuid>` (full URI) which produced `word://word://...`.
 *      Benign for v1 (registry is scheme-keyed) but wrong for Tranche 6's
 *      session-keyed resources/list. We now use sessionId as-is when it
 *      already contains `://` and only prefix when it's bare.
 */
export function createPaneRegistrationCallbacks(
  getPaneHandle: () => PaneEndpointHandle,
  registry: BackendRegistry,
): PaneEndpointOptions {
  const backend = new WordPaneMuxBackend(getPaneHandle);
  let registered = false;

  return {
    onRegister(info) {
      const sessionUri = info.sessionId.includes('://')
        ? info.sessionId
        : `${info.scheme}://${info.sessionId}`;
      backend.addSession({ registrationId: info.registrationId, sessionUri });
      if (!registered) {
        registry.register(backend);
        registered = true;
      } else {
        // The registry entry is stable; fire a change event by re-registering
        // the same backend so resources/list consumers see the new session.
        registry.register(backend);
      }
      console.error(
        `[changedown] pane registered — scheme="${info.scheme}" ` +
        `session="${info.sessionId}" regId="${info.registrationId}"`,
      );
      return {
        dispose() {
          // onUnregister handles registry removal.
        },
      };
    },

    onUnregister(registrationId) {
      const removed = backend.removeRegistration(registrationId);
      if (!removed) {
        console.error(
          `[changedown] stale unregister ignored — regId="${registrationId}" not active`,
        );
        return;
      }
      if (backend.isEmpty()) {
        registry.unregister('word');
        registered = false;
      } else {
        registry.register(backend);
      }
      console.error(
        `[changedown] pane unregistered — regId="${registrationId}"`,
      );
    },
  };
}
