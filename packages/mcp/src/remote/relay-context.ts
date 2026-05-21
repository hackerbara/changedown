export interface RelayClientInfo {
  name: string;
  version?: string;
}

export interface RelayAuthContext {
  roomId: string;
  role: 'read' | 'write' | 'owner';
}

import type { PaneBackendWireRequest } from '@changedown/core/backend';
import type { SessionState } from '@changedown/cli/engine/browser';

export interface RelayRoomClient {
  callBackendOperation(operation: PaneBackendWireRequest, metadata: { idempotencyKey?: string }): Promise<unknown>;
}

export interface RelayWorkflowStateStore {
  get(key: string): SessionState;
}

export interface RelayRequestContext {
  clientInfo?: RelayClientInfo;
  auth: RelayAuthContext;
  room: RelayRoomClient;
  workflowState?: RelayWorkflowStateStore;
}
