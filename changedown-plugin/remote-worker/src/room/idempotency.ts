import type { IdempotencyMarker } from './types.js';
import { sha256Base64Url } from './token.js';

export interface IdempotencyStore {
  get(keyHash: string): Promise<IdempotencyMarker | null>;
  put(marker: IdempotencyMarker): Promise<void>;
}

export interface CreateMarkerInput {
  key: string;
  operationClass: 'write';
  status: IdempotencyMarker['status'];
  now?: number;
  ttlMs?: number;
  sanitizedErrorCode?: string;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export async function createIdempotencyMarker(input: CreateMarkerInput): Promise<IdempotencyMarker> {
  const now = input.now ?? Date.now();
  const marker: IdempotencyMarker = {
    keyHash: await sha256Base64Url(input.key),
    operationClass: input.operationClass,
    status: input.status,
    createdAt: now,
    expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  if (input.sanitizedErrorCode) marker.sanitizedErrorCode = sanitizeErrorCode(input.sanitizedErrorCode);
  return marker;
}

export function sanitizeErrorCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 80) || 'PaneRpcError';
}

export function memoryIdempotencyStore(): IdempotencyStore {
  const markers = new Map<string, IdempotencyMarker>();
  return {
    async get(keyHash) {
      const marker = markers.get(keyHash) ?? null;
      if (marker && marker.expiresAt <= Date.now()) {
        markers.delete(keyHash);
        return null;
      }
      return marker;
    },
    async put(marker) {
      markers.set(marker.keyHash, marker);
    },
  };
}
