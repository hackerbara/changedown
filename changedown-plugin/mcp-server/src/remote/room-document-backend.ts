import {
  CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
  assertPaneBackendWireRequestHasNoTransportSecrets,
  type BackendEvent,
  type ChangeOp,
  type ChangeResult,
  type ChangeSummary,
  type DocumentBackend,
  type DocumentRef,
  type DocumentResourceDescriptor,
  type DocumentSnapshot,
  type PaneBackendWireRequest,
  type Unsubscribe,
} from '@changedown/core/backend';
import type { RelayRoomClient } from './relay-context.js';

export interface RoomDocumentBackendMetadata {
  idempotencyKey?: string;
}

function backendRequest(operation: PaneBackendWireRequest['operation']): PaneBackendWireRequest {
  const request = { protocol: CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1, operation };
  assertPaneBackendWireRequestHasNoTransportSecrets(request);
  return request;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function mcpText(result: Record<string, unknown>): string | undefined {
  const content = result.content;
  if (!Array.isArray(content)) return undefined;
  return content.map((item) => {
    if (!isObject(item) || item.type !== 'text') return '';
    return typeof item.text === 'string' ? item.text : '';
  }).filter(Boolean).join('\n');
}

function unwrapPaneResult(result: unknown): unknown {
  if (!isObject(result) || !Array.isArray(result.content)) return result;
  if (result.isError === true) {
    throw new Error(mcpText(result) ?? 'RemotePaneOperationFailed');
  }
  const content = result.content;
  if (content.length !== 1 || !isObject(content[0]) || content[0].type !== 'text' || typeof content[0].text !== 'string') {
    return result;
  }
  try {
    return JSON.parse(content[0].text);
  } catch {
    return result;
  }
}

export class RoomDocumentBackend implements DocumentBackend {
  readonly schemes = ['word'] as const;

  constructor(
    private readonly room: RelayRoomClient,
    private readonly metadata: RoomDocumentBackendMetadata = {},
  ) {}

  list(): DocumentResourceDescriptor[] {
    return [];
  }

  async read(ref: DocumentRef): Promise<DocumentSnapshot> {
    const result = unwrapPaneResult(await this.room.callBackendOperation(backendRequest({ kind: 'read', ref }), {}));
    if (!isObject(result) || typeof result.text !== 'string') {
      throw new Error('RemoteWordReadFailed: pane did not return a document snapshot.');
    }
    return {
      text: result.text,
      format: result.format === 'L3' ? 'L3' : 'L2',
      version: typeof result.version === 'string' ? result.version : '',
    };
  }

  async applyChange(ref: DocumentRef, op: ChangeOp): Promise<ChangeResult> {
    const raw = await this.room.callBackendOperation(
      backendRequest({ kind: 'applyChange', ref, op }),
      this.metadata.idempotencyKey ? { idempotencyKey: this.metadata.idempotencyKey } : {},
    );
    if (isObject(raw) && Array.isArray(raw.content)) {
      const text = mcpText(raw);
      if (raw.isError === true) return { applied: false, ...(text ? { text } : {}) };
      const unwrapped = unwrapPaneResult(raw);
      if (unwrapped === raw) return { applied: false, ...(text ? { text } : {}) };
      const result = unwrapped;
      if (!isObject(result)) return { applied: true, text: String(result) };
      return {
        applied: result.applied !== false,
        ...(typeof result.changeId === 'string' ? { changeId: result.changeId } : {}),
        ...(typeof result.text === 'string' ? { text: result.text } : {}),
      };
    }
    const result = unwrapPaneResult(raw);
    if (!isObject(result)) return { applied: true, text: String(result) };
    return {
      applied: result.applied !== false,
      ...(typeof result.changeId === 'string' ? { changeId: result.changeId } : {}),
      ...(typeof result.text === 'string' ? { text: result.text } : {}),
    };
  }

  async listChanges(ref: DocumentRef, filter?: Record<string, unknown>): Promise<ChangeSummary[]> {
    const result = unwrapPaneResult(await this.room.callBackendOperation(backendRequest({ kind: 'listChanges', ref, options: filter ?? {} }), {}));
    return Array.isArray(result) ? result as ChangeSummary[] : [];
  }

  subscribe(_ref: DocumentRef, _listener: (event: BackendEvent) => void): Unsubscribe {
    return () => undefined;
  }
}
