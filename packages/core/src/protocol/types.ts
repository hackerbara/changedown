import type { ChangeId } from './row-identity-registry.js';

export type PublicChangeKind =
  | 'ins'
  | 'del'
  | 'sub'
  | 'format'
  | 'move'
  | 'comment'
  | 'metadata';

export type PublicChangeStatus = 'proposed' | 'accepted' | 'rejected' | 'resolved' | 'unresolved' | 'diagnostic' | 'conflict';

export type PublicChangeRepresentation =
  | 'inline-markup'
  | 'rendered-substitution'
  | 'metadata-anchor'
  | 'compound-parent'
  | 'compound-child'
  | 'comment-thread';

export type PublicAnchorKind = 'inline-range' | 'paragraph' | 'block' | 'metadata' | 'compound-child';

export interface PublicBodyAnchor {
  kind: PublicAnchorKind;
  marker: string;
  childRole?: 'move-from' | 'move-to' | 'comment-range' | 'metadata-target';
}

export type PublicActionabilityState =
  | 'protocol-ready'
  | 'action-plan-ready'
  | 'native-ready'
  | 'thread-ready'
  | 'blocked'
  | 'diagnostic-only'
  | 'conflict';

export interface PublicActionabilitySummary {
  state: PublicActionabilityState;
  reason?: string;
}

export interface PublicChangeEntry {
  id: ChangeId;
  kind: PublicChangeKind;
  status: PublicChangeStatus;
  representation: PublicChangeRepresentation;
  anchors: readonly PublicBodyAnchor[];
  actionability: PublicActionabilitySummary;
  author?: string;
  date?: string;
  parentId?: ChangeId;
  children?: readonly ChangeId[];
  protocolMetadata: Readonly<Record<string, string>>;
}

export interface ChangeDownProtocolDocument {
  backendKind: 'file-markdown' | 'word-ooxml';
  source: string;
  body: string;
  entries: readonly PublicChangeEntry[];
  digest: string;
}

export interface PublicChangeIndex {
  entries: readonly PublicChangeEntry[];
  order: readonly ChangeId[];
  byId: ReadonlyMap<ChangeId, PublicChangeEntry>;
}

export interface ProtocolInvariantResult {
  ok: boolean;
  errors: readonly string[];
}
