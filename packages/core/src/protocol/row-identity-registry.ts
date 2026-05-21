export type RowStableSignature = string;
export type ChangeId = `cn-${number}`;

export interface RowTombstone {
  reason: "accepted" | "rejected" | "resolved" | "unresolved" | "stale" | string;
  lastSignature: RowStableSignature;
}

export interface RowIdentityRegistrySnapshot {
  nextOrdinal: number;
  entries: Array<[RowStableSignature, ChangeId]>;
  tombstones: Array<[ChangeId, RowTombstone]>;
}

export interface RowIdentityRegistry {
  getOrAssign(signature: RowStableSignature): ChangeId;
  claim(signature: RowStableSignature, changeId: ChangeId): ChangeId;
  get(signature: RowStableSignature): ChangeId | undefined;
  tombstone(changeId: ChangeId, tombstone: RowTombstone): void;
  getTombstone(changeId: ChangeId): RowTombstone | undefined;
  snapshot(): RowIdentityRegistrySnapshot;
}

interface SourceGroupSignatureInput {
  id: string;
  atomIds?: readonly string[];
  partName?: string;
  path?: string;
  kind?: string;
  author?: string;
  date?: string;
  textHash?: string;
}

interface NativeRevisionGapSignatureInput {
  kind: string;
  author?: string;
  dateSec: number;
  wordType: string;
  rangeTextHash?: string;
  paragraphTextHash?: string;
  formatDescriptionHash?: string;
  revisionIndex?: number;
  fingerprint?: string;
}

function ordinalFromChangeId(changeId: ChangeId): number {
  return Number(changeId.slice(3));
}

function changeIdForOrdinal(ordinal: number): ChangeId {
  return `cn-${ordinal}` as ChangeId;
}

export function createRowIdentityRegistry(snapshot?: RowIdentityRegistrySnapshot): RowIdentityRegistry {
  let nextOrdinal = snapshot?.nextOrdinal ?? 2;
  const entries = new Map<RowStableSignature, ChangeId>(snapshot?.entries ?? []);
  const tombstones = new Map<ChangeId, RowTombstone>(snapshot?.tombstones ?? []);

  function isUsed(changeId: ChangeId): boolean {
    if (tombstones.has(changeId)) return true;
    for (const assigned of entries.values()) {
      if (assigned === changeId) return true;
    }
    return false;
  }

  function nextAvailableChangeId(): ChangeId {
    let candidate = changeIdForOrdinal(nextOrdinal);
    while (isUsed(candidate)) {
      nextOrdinal += 1;
      candidate = changeIdForOrdinal(nextOrdinal);
    }
    nextOrdinal += 1;
    return candidate;
  }

  function advancePast(changeId: ChangeId): void {
    nextOrdinal = Math.max(nextOrdinal, ordinalFromChangeId(changeId) + 1);
    while (isUsed(changeIdForOrdinal(nextOrdinal))) nextOrdinal += 1;
  }

  return {
    getOrAssign(signature) {
      const existing = entries.get(signature);
      if (existing) return existing;
      const id = nextAvailableChangeId();
      entries.set(signature, id);
      return id;
    },
    claim(signature, changeId) {
      const existing = entries.get(signature);
      if (existing && existing !== changeId) {
        throw new Error(`signature already assigned to ${existing}, cannot claim ${changeId}`);
      }
      if (tombstones.has(changeId)) {
        throw new Error(`change id ${changeId} is tombstoned and cannot be claimed`);
      }
      for (const [otherSignature, assigned] of entries.entries()) {
        if (otherSignature !== signature && assigned === changeId) {
          throw new Error(`change id ${changeId} is already assigned to another signature`);
        }
      }
      entries.set(signature, changeId);
      advancePast(changeId);
      return changeId;
    },
    get(signature) {
      return entries.get(signature);
    },
    tombstone(changeId, tombstone) {
      tombstones.set(changeId, tombstone);
    },
    getTombstone(changeId) {
      return tombstones.get(changeId);
    },
    snapshot() {
      return { nextOrdinal, entries: [...entries.entries()], tombstones: [...tombstones.entries()] };
    },
  };
}

export function signatureForSourceGroup(input: SourceGroupSignatureInput): RowStableSignature {
  return [
    "source",
    input.id,
    input.partName ?? "",
    input.path ?? "",
    input.kind ?? "",
    input.author ?? "",
    input.date ?? "",
    input.textHash ?? "",
    ...(input.atomIds ?? []),
  ].join("|");
}

export function signatureForNativeRevisionGap(input: NativeRevisionGapSignatureInput): RowStableSignature {
  return [
    "native-gap",
    input.kind,
    input.wordType,
    input.author ?? "",
    String(input.dateSec),
    input.rangeTextHash ?? "",
    input.paragraphTextHash ?? "",
    input.formatDescriptionHash ?? "",
    input.rangeTextHash || input.paragraphTextHash || input.formatDescriptionHash ? "" : String(input.revisionIndex ?? ""),
    input.rangeTextHash || input.paragraphTextHash || input.formatDescriptionHash ? "" : input.fingerprint ?? "",
  ].join("|");
}
