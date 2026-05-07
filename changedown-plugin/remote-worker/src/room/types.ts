export type RelayRole = 'owner' | 'read' | 'write';

export type AuthorizedTokenHashes = Partial<Record<RelayRole, string>>;

export interface ActiveRoomLease {
  roomId: string;
  leaseId: string;
  createdAt?: number;
  connectedAt?: number;
  expiresAt: number;
  disconnectedAt?: number;
}

export interface PaneSocketAttachment {
  kind: 'pane';
  roomId: string;
  paneId: string;
  leaseId: string;
  role: RelayRole;
  createdAt: number;
  expiresAt: number;
  capabilities: string[];
  protocolVersion: 1;
}

export interface PaneRpcRequest {
  type: 'request';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface PaneRpcResponse {
  type: 'response';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface IdempotencyMarker {
  keyHash: string;
  operationClass: 'write';
  status: 'started' | 'completed' | 'failed';
  sanitizedErrorCode?: string;
  createdAt: number;
  expiresAt: number;
}
