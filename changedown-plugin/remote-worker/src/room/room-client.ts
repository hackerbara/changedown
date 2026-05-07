import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PaneBackendWireRequest } from '@changedown/mcp/remote-worker';

export interface RoomOperationRequest {
  token: string;
  idempotencyKey?: string;
  operation: PaneBackendWireRequest;
}

export interface RoomFetchTarget {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>;
}

export async function callRoomBackendOperation(target: RoomFetchTarget, request: RoomOperationRequest): Promise<CallToolResult> {
  const response = await target.fetch('https://room.local/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || !Array.isArray((body as { content?: unknown }).content)) {
    return { isError: true, content: [{ type: 'text', text: `RoomRpcError: invalid room response (${response.status})` }], structuredContent: { code: 'RoomRpcError' } };
  }
  return body as CallToolResult;
}
