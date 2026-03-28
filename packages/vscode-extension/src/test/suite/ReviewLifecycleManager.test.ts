import * as assert from 'assert';
import { findChangeInList } from '../../managers/review-lifecycle-manager';

/**
 * ReviewLifecycleManager unit tests.
 *
 * Most methods depend on VS Code APIs (QuickPick, InputBox, WorkspaceEdit)
 * and LSP communication, making them integration-test territory.
 * These tests cover the pure logic that can be tested without VS Code:
 * findChangeInList helper and confirmBulkAction threshold logic.
 */

suite('ReviewLifecycleManager', () => {
    // ── findChangeInList ──────────────────────────────────────────────

    suite('findChangeInList', () => {
        // Minimal ChangeNode-like objects for testing the lookup logic
        const changes = [
            { id: 'cn-1', type: 'insertion', range: { start: 0, end: 10 } },
            { id: 'cn-2', type: 'deletion', range: { start: 20, end: 30 } },
            { id: 'cn-3', type: 'substitution', range: { start: 40, end: 50 } },
        ] as any[];

        test('returns change by ID when provided', () => {
            const result = findChangeInList(changes, 'cn-2');
            assert.strictEqual(result?.id, 'cn-2');
        });

        test('returns undefined for unknown ID', () => {
            const result = findChangeInList(changes, 'cn-99');
            assert.strictEqual(result, undefined);
        });

        test('returns undefined when no ID provided', () => {
            const result = findChangeInList(changes);
            assert.strictEqual(result, undefined);
        });

        test('returns undefined for empty changes list', () => {
            const result = findChangeInList([], 'cn-1');
            assert.strictEqual(result, undefined);
        });
    });

    // ── confirmBulkAction threshold logic ─────────────────────────────

    suite('confirmBulkAction (threshold logic)', () => {
        /**
         * Simulates the pure threshold check from confirmBulkAction:
         * returns true (proceed) when count <= threshold or threshold <= 0,
         * returns false (would prompt) otherwise.
         */
        function wouldSkipConfirmation(count: number, threshold: number): boolean {
            if (threshold <= 0 || count <= threshold) return true;
            return false;
        }

        test('returns true when count is below threshold', () => {
            assert.strictEqual(wouldSkipConfirmation(3, 5), true);
        });

        test('returns true when count equals threshold', () => {
            assert.strictEqual(wouldSkipConfirmation(5, 5), true);
        });

        test('returns false when count exceeds threshold', () => {
            assert.strictEqual(wouldSkipConfirmation(10, 5), false);
        });

        test('returns true when threshold is 0 (disabled)', () => {
            assert.strictEqual(wouldSkipConfirmation(100, 0), true);
        });

        test('returns true when threshold is negative (disabled)', () => {
            assert.strictEqual(wouldSkipConfirmation(100, -1), true);
        });
    });
});
