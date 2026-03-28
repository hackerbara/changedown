// core/id-allocator.ts — SC-ID scanning and allocation

import { scanMaxCnId } from '@changedown/core';

/**
 * Scans text for all `[^cn-N]` and `[^cn-N.M]` patterns and returns
 * the maximum parent ID number found. Returns 0 if no cn-IDs exist.
 *
 * Delegates to `@changedown/core`'s `scanMaxCnId`.
 */
export function scanMaxId(text: string): number {
  return scanMaxCnId(text);
}

/**
 * Allocates a batch of SC change IDs starting after `maxId`.
 *
 * - Single edit (`count === 1`): returns `['cn-{maxId+1}']` (flat ID).
 * - Multiple edits (`count > 1`): returns dotted IDs under a new parent:
 *   `['cn-{parentId}.1', 'cn-{parentId}.2', ...]` where `parentId = maxId + 1`.
 *
 * The parent ID for grouped changes is implicitly consumed (not returned)
 * — callers that need the parent footnote should use `parentId()` separately
 * or derive it from `maxId + 1`.
 */
export function allocateIds(count: number, maxId: number): string[] {
  if (count <= 0) return [];

  if (count === 1) {
    return [`cn-${maxId + 1}`];
  }

  // Grouped: parent ID = maxId + 1, children = parentId.1, parentId.2, ...
  const parentId = maxId + 1;
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    ids.push(`cn-${parentId}.${i}`);
  }
  return ids;
}
