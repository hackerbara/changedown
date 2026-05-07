// packages/core/src/backend/backend-wire.ts

import type { ChangeOp, DocumentRef } from './types.js';

export const CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1 = 'changedown-document-backend/v1' as const;

export type PaneBackendWireOperation =
  | { kind: 'read'; ref: DocumentRef; options?: Record<string, unknown> }
  | { kind: 'listChanges'; ref: DocumentRef; options?: Record<string, unknown> }
  | { kind: 'applyChange'; ref: DocumentRef; op: ChangeOp }
  | { kind: 'subscribe'; ref: DocumentRef };

export interface PaneBackendWireRequest {
  protocol: typeof CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1;
  operation: PaneBackendWireOperation;
}

export type BackendWireOperationClass = 'read' | 'write';

const TRANSPORT_SECRET_KEYS = new Set([
  'token',
  'authorization',
  'bearer',
  'tokenhash',
  'token_hash',
  'tokenhashprefix',
  'token_hash_prefix',
  'x-share-token',
  'x_share_token',
  'idempotencykey',
  'idempotency_key',
]);

export function backendWireOperationClass(request: PaneBackendWireRequest): BackendWireOperationClass {
  return request.operation.kind === 'applyChange' ? 'write' : 'read';
}

export function assertPaneBackendWireRequestHasNoTransportSecrets(request: PaneBackendWireRequest): void {
  const seen = new Set<unknown>();
  function visit(value: unknown, path: string): void {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (TRANSPORT_SECRET_KEYS.has(normalizedKey)) {
        throw new Error(`backend-wire transport secret key is not allowed at ${path}.${key}`);
      }
      visit(child, `${path}.${key}`);
    }
  }
  visit(request, 'request');
}
