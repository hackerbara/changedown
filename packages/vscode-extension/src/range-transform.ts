/**
 * Optimistic range transform — pure functions, no vscode dependency.
 *
 * Owns the decoration cache (a Map shared with lsp-client.ts) and exposes
 * cache helpers alongside the optimistic transform functions.
 *
 * Kept in a separate file so @fast tier tests can import without pulling in
 * vscode-languageclient/node (which requires a full VS Code environment).
 */

import { ChangeNode } from '@changedown/core';

// ---------------------------------------------------------------------------
// Decoration cache (shared with lsp-client.ts)
// ---------------------------------------------------------------------------

/**
 * Cached decoration entry: the change nodes plus the document version at which
 * they were stored. Used to detect stale optimistic transforms.
 */
export interface CachedDecorationData {
    changes: ChangeNode[];
    documentVersion: number;
}

/**
 * Cache for decoration data received from the LSP server.
 * Exported so lsp-client.ts can reference the exact same Map object.
 */
export const decorationCache = new Map<string, CachedDecorationData>();

/**
 * Get cached decoration data for a document.
 */
export function getCachedDecorationData(uri: string): CachedDecorationData | undefined {
    return decorationCache.get(uri);
}

/**
 * Invalidate cached decoration data for a document.
 * Call after the extension applies accept/reject edits so the next
 * updateDecorations() falls back to local parsing instead of stale LSP data.
 */
export function invalidateDecorationCache(uri: string): void {
    decorationCache.delete(uri);
}

/**
 * Set cached decoration data.
 * Used when the extension receives changes via changedown/getChanges request
 * or via the changedown/decorationData notification.
 */
export function setCachedDecorationData(uri: string, changes: ChangeNode[], documentVersion: number): void {
    decorationCache.set(uri, { changes, documentVersion });
}

// ---------------------------------------------------------------------------
// Optimistic range transform
// ---------------------------------------------------------------------------

/**
 * Adjust a single OffsetRange by an edit delta.
 * Mutates the range in-place.
 *
 * @param range      The range to mutate in-place
 * @param editStart  Start offset of the edit
 * @param editEnd    End offset of the edit (editStart + rangeLength)
 * @param delta      Net character change (text.length - rangeLength)
 */
export function transformRange(
    range: { start: number; end: number },
    editStart: number,
    editEnd: number,
    delta: number
): void {
    if (editEnd <= range.start) {
        // Edit entirely before range — shift both endpoints
        range.start += delta;
        range.end += delta;
    } else if (editStart >= range.end) {
        // Edit entirely after range — no change
    } else if (editStart >= range.start && editEnd <= range.end) {
        // Edit entirely inside range — expand/contract end only
        range.end += delta;
    } else {
        // Edit spans a range boundary — adjust end, clamp to start
        range.end = Math.max(range.start, range.end + delta);
    }
}

/**
 * Optimistic range transform: adjust all cached ChangeNode ranges by edit deltas.
 * Call from onDidChangeTextDocument to keep decorations stable during the LSP
 * round-trip. The authoritative LSP push (changedown/decorationData) overwrites
 * the cache when the server responds.
 *
 * @param newVersion The document version after the edit — stamped onto the cache entry.
 * @returns true if the cache was found and transformed, false if cache was empty/absent
 */
export function transformCachedDecorations(
    uri: string,
    contentChanges: readonly { rangeOffset: number; rangeLength: number; text: string }[],
    newVersion: number
): boolean {
    const cached = decorationCache.get(uri);
    if (!cached || cached.changes.length === 0) return false;

    for (const change of contentChanges) {
        const editStart = change.rangeOffset;
        const editEnd = editStart + change.rangeLength;
        const delta = change.text.length - change.rangeLength;

        for (const node of cached.changes) {
            transformRange(node.range, editStart, editEnd, delta);
            transformRange(node.contentRange, editStart, editEnd, delta);
            if (node.originalRange) {
                transformRange(node.originalRange, editStart, editEnd, delta);
            }
            if (node.modifiedRange) {
                transformRange(node.modifiedRange, editStart, editEnd, delta);
            }
        }
    }

    // Remove nodes whose ranges have gone invalid (end < start or negative start).
    // Zero-width ranges (end === start) are kept — they represent collapsed positions.
    cached.changes = cached.changes.filter(n => n.range.end >= n.range.start && n.range.start >= 0);
    cached.documentVersion = newVersion;
    return true;
}
