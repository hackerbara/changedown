import type { ChangeDownProtocolDocument, PublicChangeIndex } from './types.js';

export function buildPublicChangeIndex(protocol: ChangeDownProtocolDocument): PublicChangeIndex {
  const byId = new Map(protocol.entries.map((entry) => [entry.id, entry]));
  return {
    entries: protocol.entries.slice(),
    order: protocol.entries.map((entry) => entry.id),
    byId,
  };
}
