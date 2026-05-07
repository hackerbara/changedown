import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { backendWireOperationClass, type PaneBackendWireRequest } from '@changedown/mcp/remote-worker';
import { createIdempotencyMarker, type IdempotencyStore, sanitizeErrorCode } from './idempotency.js';
import type { RelayRole } from './types.js';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const idempotencyLocks = new Map<string, Promise<CallToolResult>>();

export interface GuardedOperationDispatchInput {
  operation: PaneBackendWireRequest;
  idempotencyKey?: string;
  role: RelayRole;
  store: IdempotencyStore;
  dispatch: (operation: PaneBackendWireRequest) => Promise<CallToolResult>;
  now?: number;
}

function roleCanCall(role: RelayRole, operation: PaneBackendWireRequest): boolean {
  if (role === 'owner') return true;
  if (role === 'write') return true;
  return backendWireOperationClass(operation) === 'read';
}

export function mcpErrorResult(code: string, message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: { code },
  };
}

export function paneDisconnectedResult(): CallToolResult {
  return mcpErrorResult('PaneDisconnected', 'No authorized Word pane is connected for this room.');
}

function replayResult(status: 'started' | 'completed' | 'failed'): CallToolResult {
  const isError = status !== 'completed';
  return {
    isError,
    content: [{ type: 'text', text: `IdempotencyReplay: request already ${status}; content was not stored by the relay.` }],
    structuredContent: { idempotency: 'replayed', status },
  };
}

function errorCodeFromResult(result: CallToolResult): string | undefined {
  const structured = result.structuredContent;
  const code = structured && typeof structured.code === 'string' ? structured.code : undefined;
  if (code) return code;
  const firstText = result.content.find((item) => item.type === 'text')?.text;
  return firstText?.split(':')[0];
}

export async function callPaneOperationWithRoomGuards(input: GuardedOperationDispatchInput): Promise<CallToolResult> {
  const operationClass = backendWireOperationClass(input.operation);
  if (!roleCanCall(input.role, input.operation)) {
    return mcpErrorResult('ForbiddenRole', `${input.role} token cannot call ${operationClass} backend operations.`);
  }

  if (operationClass === 'read') {
    try {
      return await input.dispatch(input.operation);
    } catch {
      return mcpErrorResult('PaneRpcError', 'Pane RPC dispatch failed.');
    }
  }

  const key = typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim().length > 0 ? input.idempotencyKey.trim() : null;
  if (!key) return mcpErrorResult('IdempotencyKeyRequired', 'write backend operations require a non-empty idempotency key.');

  const now = input.now ?? Date.now();
  const started = await createIdempotencyMarker({ key, operationClass: 'write', status: 'started', now, ttlMs: IDEMPOTENCY_TTL_MS });

  const execute = async (): Promise<CallToolResult> => {
    const existing = await input.store.get(started.keyHash);
    if (existing && existing.expiresAt > now) {
      if (existing.operationClass !== started.operationClass) {
        return mcpErrorResult('IdempotencyConflict', 'Idempotency key was already used with a different operation class.');
      }
      return replayResult(existing.status);
    }

    await input.store.put(started);
    let result: CallToolResult;
    try {
      result = await input.dispatch(input.operation);
    } catch {
      result = mcpErrorResult('PaneRpcError', 'Pane RPC dispatch failed.');
    }
    const status = result.isError ? 'failed' : 'completed';
    await input.store.put(await createIdempotencyMarker({
      key,
      operationClass: 'write',
      status,
      now: Date.now(),
      ttlMs: IDEMPOTENCY_TTL_MS,
      sanitizedErrorCode: result.isError ? sanitizeErrorCode(errorCodeFromResult(result) ?? 'PaneRpcError') : undefined,
    }));
    return result;
  };

  const previous = idempotencyLocks.get(started.keyHash);
  const current = (previous ?? Promise.resolve()).then(execute, execute);
  idempotencyLocks.set(started.keyHash, current);
  try {
    return await current;
  } finally {
    if (idempotencyLocks.get(started.keyHash) === current) idempotencyLocks.delete(started.keyHash);
  }
}
