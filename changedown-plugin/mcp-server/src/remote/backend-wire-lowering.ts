import {
  CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
  assertPaneBackendWireRequestHasNoTransportSecrets,
  type ChangeOp,
  type PaneBackendWireRequest,
} from '@changedown/core/backend';
import type { RemoteWordToolName } from './remote-tool-list.js';

export interface LoweredBackendOperation {
  request: PaneBackendWireRequest;
  idempotencyKey?: string;
}

function omitKeys(args: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const omitted = new Set(keys);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!omitted.has(key) && value !== undefined) out[key] = value;
  }
  return out;
}

function refFromArgs(args: Record<string, unknown>): { uri: string } {
  return { uri: String(args.file) };
}

function idempotencyKey(args: Record<string, unknown>): string | undefined {
  const raw = args.idempotency_key;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function singleReviewChangeOp(args: Record<string, unknown>): ChangeOp | { error: string } {
  const reviews = Array.isArray(args.reviews) ? args.reviews : [];
  const responses = Array.isArray(args.responses) ? args.responses : [];
  if (reviews.length === 1 && responses.length === 0) {
    const review = reviews[0] as Record<string, unknown>;
    return { kind: 'review', args: omitKeys({ ...review, cnId: review.cnId ?? review.change_id ?? review.changeId, author: args.author }, ['change_id', 'changeId']) };
  }
  if (responses.length === 1 && reviews.length === 0) {
    const response = responses[0] as Record<string, unknown>;
    return { kind: 'respond', args: omitKeys({ ...response, cnId: response.cnId ?? response.change_id ?? response.changeId, text: response.text ?? response.response, author: args.author }, ['change_id', 'changeId', 'response']) };
  }
  return { error: 'RemoteSingleReviewRequired: remote review_changes currently lowers exactly one review or one response per call.' };
}

function changeOpForTool(name: RemoteWordToolName, args: Record<string, unknown>): ChangeOp | { error: string } {
  switch (name) {
    case 'propose_change': {
      return { error: 'RemoteProposeWorkflowRequired: remote propose_change must use the shared Word document workflow; direct backend-wire at/op lowering is diagnostic-only and unavailable from this helper.' };
    }
    case 'review_changes':
      return singleReviewChangeOp(omitKeys(args, ['file', 'idempotency_key']));
    case 'amend_change': {
      const lowered = omitKeys(args, ['file', 'idempotency_key']);
      lowered.cnId = lowered.cnId ?? lowered.change_id ?? lowered.changeId;
      lowered.newText = lowered.newText ?? lowered.new_text;
      return { kind: 'amend', args: lowered };
    }
    case 'supersede_change': {
      return { error: 'RemoteSupersedeWorkflowRequired: remote supersede_change must use the shared Word document workflow; direct backend-wire at/op lowering is diagnostic-only and unavailable from this helper.' };
    }
    case 'resolve_thread': {
      const lowered = omitKeys(args, ['file', 'idempotency_key', 'change_id', 'changeId']);
      lowered.cnId = args.cnId ?? args.change_id ?? args.changeId;
      return { kind: 'resolve_thread', args: lowered };
    }
    case 'read_tracked_file':
    case 'list_changes':
      return { error: `${name} is not a mutating backend operation.` };
  }
}

export function lowerRemoteToolToBackendWire(name: RemoteWordToolName, args: Record<string, unknown>): LoweredBackendOperation | { error: string } {
  const ref = refFromArgs(args);
  let request: PaneBackendWireRequest;

  switch (name) {
    case 'read_tracked_file':
      request = {
        protocol: CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
        operation: { kind: 'read', ref, options: omitKeys(args, ['file', 'author', 'idempotency_key']) },
      };
      break;
    case 'list_changes':
      request = {
        protocol: CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
        operation: { kind: 'listChanges', ref, options: omitKeys(args, ['file', 'author', 'idempotency_key']) },
      };
      break;
    default: {
      const op = changeOpForTool(name, args);
      if ('error' in op) return op;
      request = {
        protocol: CHANGEDOWN_DOCUMENT_BACKEND_PROTOCOL_V1,
        operation: { kind: 'applyChange', ref, op },
      };
      break;
    }
  }

  try {
    assertPaneBackendWireRequestHasNoTransportSecrets(request);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  return { request, idempotencyKey: idempotencyKey(args) };
}
