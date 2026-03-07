/**
 * Scans text for all `[^ct-N]` and `[^ct-N.M]` patterns and returns
 * the maximum parent ID number found. Returns 0 if no ct-IDs exist.
 *
 * Delegates to `@changetracks/core`'s `scanMaxCtId`.
 */
export declare function scanMaxId(text: string): number;
/**
 * Allocates a batch of SC change IDs starting after `maxId`.
 *
 * - Single edit (`count === 1`): returns `['ct-{maxId+1}']` (flat ID).
 * - Multiple edits (`count > 1`): returns dotted IDs under a new parent:
 *   `['ct-{parentId}.1', 'ct-{parentId}.2', ...]` where `parentId = maxId + 1`.
 *
 * The parent ID for grouped changes is implicitly consumed (not returned)
 * — callers that need the parent footnote should use `parentId()` separately
 * or derive it from `maxId + 1`.
 */
export declare function allocateIds(count: number, maxId: number): string[];
