/**
 * Tests for decoration cache version tracking.
 *
 * The cache lives in range-transform.ts (pure, no vscode dependency).
 * Tests here verify:
 *  - documentVersion is stored and returned correctly
 *  - transformCachedDecorations bumps the version on every transform
 *  - a stale cache entry (version mismatch) is identifiable by comparing
 *    cached.documentVersion to the caller's current version
 *
 * Import path: direct source reference. range-transform.ts has zero
 * vscode / vscode-languageclient dependencies so it loads cleanly in vitest.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    setCachedDecorationData,
    getCachedDecorationData,
    invalidateDecorationCache,
    transformCachedDecorations,
} from '../../vscode-extension/src/range-transform.js';
import { ChangeType, ChangeStatus } from '@changedown/core';
import type { ChangeNode } from '@changedown/core';

const URI = 'file:///version-test.md';

function makeNode(id: string, start: number, end: number): ChangeNode {
    return {
        id,
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        range: { start, end },
        contentRange: { start: start + 3, end: end - 3 },
        level: 0,
        anchored: false,
    };
}

describe('decoration cache — version tracking', () => {
    beforeEach(() => {
        invalidateDecorationCache(URI);
    });

    it('stores documentVersion when set', () => {
        const nodes = [makeNode('1', 10, 20)];
        setCachedDecorationData(URI, nodes, 5);

        const cached = getCachedDecorationData(URI);
        expect(cached).toBeDefined();
        expect(cached!.documentVersion).toBe(5);
    });

    it('returns undefined when cache is empty', () => {
        expect(getCachedDecorationData(URI)).toBeUndefined();
    });

    it('overwrites previous entry when set again', () => {
        setCachedDecorationData(URI, [makeNode('1', 0, 10)], 3);
        setCachedDecorationData(URI, [makeNode('2', 20, 30)], 7);

        const cached = getCachedDecorationData(URI);
        expect(cached!.documentVersion).toBe(7);
        expect(cached!.changes).toHaveLength(1);
        expect(cached!.changes[0].id).toBe('2');
    });

    it('is invalidated by invalidateDecorationCache', () => {
        setCachedDecorationData(URI, [makeNode('1', 0, 10)], 1);
        invalidateDecorationCache(URI);
        expect(getCachedDecorationData(URI)).toBeUndefined();
    });

    it('transformCachedDecorations bumps documentVersion to newVersion', () => {
        setCachedDecorationData(URI, [makeNode('1', 10, 20)], 5);

        transformCachedDecorations(URI, [{ rangeOffset: 0, rangeLength: 0, text: 'abc' }], 6);

        const cached = getCachedDecorationData(URI);
        expect(cached!.documentVersion).toBe(6);
    });

    it('stale cache is detectable via documentVersion mismatch', () => {
        // Simulate: LSP sent data at version 4, then two edits occurred (versions 5, 6).
        // transformCachedDecorations was NOT called, so cache still has version 4.
        setCachedDecorationData(URI, [makeNode('1', 10, 20)], 4);

        // Current document version is 6 — cache is stale
        const cached = getCachedDecorationData(URI);
        const currentDocVersion = 6;
        expect(cached!.documentVersion).not.toBe(currentDocVersion);
        // Caller (getVirtualDocumentFor) falls back to local parse when versions don't match
    });

    it('fresh cache passes version check', () => {
        // Simulate: LSP sent data at version 4, transform kept it current through two edits.
        setCachedDecorationData(URI, [makeNode('1', 10, 20)], 4);
        transformCachedDecorations(URI, [{ rangeOffset: 0, rangeLength: 0, text: 'x' }], 5);
        transformCachedDecorations(URI, [{ rangeOffset: 1, rangeLength: 0, text: 'y' }], 6);

        const cached = getCachedDecorationData(URI);
        const currentDocVersion = 6;
        // Versions match — cache is current, getVirtualDocumentFor uses LSP data
        expect(cached!.documentVersion).toBe(currentDocVersion);
    });

    it('transformCachedDecorations returns false when cache is absent', () => {
        const result = transformCachedDecorations(
            URI,
            [{ rangeOffset: 0, rangeLength: 0, text: 'x' }],
            1
        );
        expect(result).toBe(false);
    });

    it('transformCachedDecorations returns true when cache is present', () => {
        setCachedDecorationData(URI, [makeNode('1', 10, 20)], 1);

        const result = transformCachedDecorations(
            URI,
            [{ rangeOffset: 0, rangeLength: 0, text: 'x' }],
            2
        );
        expect(result).toBe(true);
    });
});
